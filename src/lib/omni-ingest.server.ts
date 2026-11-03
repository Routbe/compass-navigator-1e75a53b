/**
 * Omni-Matrix ingestion worker. Runs after the 202 response (registerBackgroundTask):
 * resolves the link through the SSRF guard, parses OpenGraph, downloads the cover
 * (and an optional short video preview) and stores the bytes in first-party
 * storage (`gallery_objects`). Only internal storage paths are written to the job.
 */
import { sql } from "@/lib/neon";
import { validateOutboundUrl } from "@/lib/security/ssrf-guard.server";
import {
  OMNI_IMAGE_TYPES,
  OMNI_MAX_IMAGE_BYTES,
  OMNI_MAX_VIDEO_BYTES,
  OMNI_VIDEO_TYPES,
  classifyOmniUrl,
  galleryMediaUrl,
  omniMetaTag,
  parseOpenGraph,
  youtubeId,
  type OmniJob,
} from "@/lib/omni-ingest";

const UA = "Mozilla/5.0 (compatible; ROUT-LinkPreview/1.0; +https://rout.be)";
const MAX_HTML_BYTES = 768 * 1024;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** https-only fetch that re-validates every redirect hop against private hosts. */
async function guardedFetch(raw: string, accept: string): Promise<{ res: Response; url: string }> {
  let current = raw;
  for (let hop = 0; hop <= 4; hop++) {
    const url = await validateOutboundUrl(current);
    const res = await fetch(url.toString(), {
      redirect: "manual",
      headers: { "user-agent": UA, accept, "accept-language": "nl,en;q=0.8" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("bad_redirect");
      current = new URL(loc, url).toString();
      continue;
    }
    return { res, url: url.toString() };
  }
  throw new Error("too_many_redirects");
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) throw new Error("too_large");
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Magic-byte check so a mislabelled HTML page is never stored as an image. */
export function sniffMedia(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") return /avif|avis/.test(ascii(8, 12)) ? "image/avif" : "video/mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}

async function storeMedia(userId: string, jobId: string, kind: "cover" | "kinetic", raw: string): Promise<string> {
  const isVideo = kind === "kinetic";
  const { res } = await guardedFetch(raw, isVideo ? "video/webm,video/mp4" : "image/avif,image/webp,image/*");
  if (!res.ok) throw new Error("media_unreachable");
  const bytes = await readCapped(res, isVideo ? OMNI_MAX_VIDEO_BYTES : OMNI_MAX_IMAGE_BYTES);
  const type = sniffMedia(bytes);
  const allowed = isVideo ? OMNI_VIDEO_TYPES : OMNI_IMAGE_TYPES;
  if (!type || !allowed[type]) throw new Error("media_type");
  const path = `${userId}/omni-${jobId}-${kind}.${allowed[type]}`;
  await sql.query(
    `insert into public.gallery_objects (path, user_id, content_type, data) values ($1, $2, $3, $4)
     on conflict (path) do update set content_type = excluded.content_type, data = excluded.data`,
    [path, userId, type, Buffer.from(bytes).toString("base64")],
  );
  return path;
}

const ERRORS = new Set(["page_unreachable", "no_image", "media_unreachable", "media_type", "too_large", "quota", "unsafe"]);
const errorCode = (e: unknown) => {
  const msg = e instanceof Error ? e.message : "";
  if (ERRORS.has(msg)) return msg;
  if (/restricted|https|Invalid|Non-standard|Unsafe/i.test(msg)) return "unsafe";
  return "page_unreachable";
};

export async function processOmniJob(jobId: string, userId: string): Promise<void> {
  const claimed = (await sql`update public.omni_ingest_jobs set status='processing', attempts=attempts+1, updated_at=now()
    where id=${jobId} and user_id=${userId} and status in ('queued','failed') and attempts < 3
    returning source_url, title_override, media_hint`) as { source_url: string; title_override: string | null; media_hint?: string | null }[];
  const job = claimed[0];
  if (!job) return;
  try {
    const { LIFETIME_MAX_FILES } = await import("@/lib/asset-retention");
    const used = (await sql`select count(*)::int as n from public.gallery_objects where user_id = ${userId}`) as { n: number }[];
    if (Number(used[0]?.n ?? 0) >= LIFETIME_MAX_FILES) throw new Error("quota");

    let og: ReturnType<typeof parseOpenGraph> = {};
    let finalUrl = job.source_url;
    let words = 0;
    try {
      const { res, url } = await guardedFetch(job.source_url, "text/html,application/xhtml+xml");
      finalUrl = url;
      if (res.ok && /html|xml/i.test(res.headers.get("content-type") ?? "")) {
        const html = new TextDecoder().decode(await readCapped(res, MAX_HTML_BYTES).catch(() => new Uint8Array()));
        og = parseOpenGraph(html, url);
        words = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
      }
    } catch (e) {
      if (errorCode(e) === "unsafe") throw new Error("unsafe");
    }

    const type = classifyOmniUrl(job.source_url, og.type);
    const yt = youtubeId(job.source_url);
    const candidates = [job.media_hint, og.image, yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null].filter(
      (v): v is string => typeof v === "string" && v.startsWith("https://"),
    );
    if (candidates.length === 0) throw new Error(og.title ? "no_image" : "page_unreachable");
    let cover: string | null = null;
    let lastError: unknown = null;
    for (const c of candidates) {
      try {
        cover = await storeMedia(userId, jobId, "cover", c);
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!cover) throw lastError ?? new Error("no_image");

    // Kinetic preview: only short, directly hosted WebM/MP4 files (no third-party players).
    let kinetic: string | null = null;
    if (og.video && /\.(webm|mp4)(\?|$)/i.test(og.video)) {
      kinetic = await storeMedia(userId, jobId, "kinetic", og.video).catch(() => null);
    }

    await sql`update public.omni_ingest_jobs set status='ready', content_type=${type}::public.omni_content_type,
      title=${(job.title_override || og.title || new URL(finalUrl).hostname).slice(0, 150)},
      meta_tag=${omniMetaTag(type, og.duration, words) ?? null}, target_url=${job.source_url},
      local_media_path=${cover}, kinetic_preview_path=${kinetic}, error=null, updated_at=now()
      where id=${jobId} and user_id=${userId}`;
  } catch (e) {
    await sql`update public.omni_ingest_jobs set status='failed', error=${errorCode(e)}, updated_at=now()
      where id=${jobId} and user_id=${userId}`;
  }
}

/** Inserts a job and schedules the worker without awaiting it. Caller must run inside the owner's DB context. */
export async function enqueueOmniJob(input: {
  userId: string;
  source: "studio" | "webhook";
  url: string;
  title?: string;
  mediaUrl?: string;
}): Promise<string> {
  const recent = (await sql`select count(*)::int as n from public.omni_ingest_jobs
    where user_id=${input.userId} and created_at > now() - interval '1 hour'`) as { n: number }[];
  if (Number(recent[0]?.n ?? 0) >= 60) throw Object.assign(new Error("rate_limited"), { status: 429 });
  const rows = (await sql`insert into public.omni_ingest_jobs (user_id, source, source_url, title_override, media_hint)
    values (${input.userId}, ${input.source}, ${input.url}, ${input.title || null}, ${input.mediaUrl || null}) returning id`) as { id: string }[];
  const id = rows[0]!.id;
  const { registerBackgroundTask } = await import("@/lib/background-task.server");
  const task = processOmniJob(id, input.userId).catch(() => undefined);
  if (!registerBackgroundTask(task)) void task;
  return id;
}

export async function listOmniJobs(userId: string): Promise<OmniJob[]> {
  // Stuck workers (killed isolate) are retried on read.
  const stale = (await sql`select id from public.omni_ingest_jobs where user_id=${userId}
    and ((status='processing' and updated_at < now() - interval '2 minutes') or (status='queued' and created_at < now() - interval '30 seconds'))
    and attempts < 3 limit 3`) as { id: string }[];
  if (stale.length) {
    await sql`update public.omni_ingest_jobs set status='queued' where user_id=${userId} and id = any(${stale.map((s) => s.id)}::uuid[])`;
    const { registerBackgroundTask } = await import("@/lib/background-task.server");
    for (const s of stale) {
      const task = processOmniJob(s.id, userId).catch(() => undefined);
      if (!registerBackgroundTask(task)) void task;
    }
  }
  const rows = (await sql`select id, source, source_url, status, content_type, title, meta_tag, target_url,
    local_media_path, kinetic_preview_path, error, created_at from public.omni_ingest_jobs
    where user_id=${userId} order by created_at desc limit 30`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r["id"]),
    source: r["source"] === "webhook" ? "webhook" : "studio",
    sourceUrl: String(r["source_url"]),
    status: r["status"] as OmniJob["status"],
    contentType: (r["content_type"] as OmniJob["contentType"]) ?? null,
    title: (r["title"] as string | null) ?? null,
    metaTag: (r["meta_tag"] as string | null) ?? null,
    targetUrl: (r["target_url"] as string | null) ?? null,
    mediaUrl: r["local_media_path"] ? galleryMediaUrl(String(r["local_media_path"])) : null,
    kineticPreviewUrl: r["kinetic_preview_path"] ? galleryMediaUrl(String(r["kinetic_preview_path"])) : null,
    error: (r["error"] as string | null) ?? null,
    createdAt: new Date(String(r["created_at"])).toISOString(),
  }));
}
