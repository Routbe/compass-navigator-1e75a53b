/**
 * Shared webhook handler for /api/public/ingest/grid and /api/public/ingest/omni.
 * Token-authenticated (hash lookup), JSON-only, answers 202 before any fetch.
 */
import { ingestPayloadSchema } from "@/lib/omni-ingest";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function readIngestToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const token = bearer ?? request.headers.get("x-rout-ingest-token") ?? new URL(request.url).searchParams.get("token");
  return token && /^rout_ing_[0-9a-f]{64}$/.test(token) ? token : null;
}

export async function handleIngestWebhook(request: Request): Promise<Response> {
  const { guardRequest } = await import("@/lib/api-guard.server");
  const limited = guardRequest(request, "omni-ingest", 60, 60_000);
  if (limited) return limited;

  const type = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") return json({ error: "json_only" }, 415);
  const token = readIngestToken(request);
  if (!token) return json({ error: "unauthorized" }, 401);

  const raw = await request.text();
  if (raw.length > 4096) return json({ error: "payload_too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_payload" }, 422);

  const { sql, withDbContext } = await import("@/lib/neon");
  const { sha256Hex, enqueueOmniJob } = await import("@/lib/omni-ingest.server");
  const owner = ((await sql`select public.rout_ingest_token_owner(${await sha256Hex(token)}) as id`) as { id: string | null }[])[0]?.id;
  if (!owner) return json({ error: "unauthorized" }, 401);

  try {
    const jobId = await withDbContext({ userId: owner, workspaceId: null }, () =>
      enqueueOmniJob({ userId: owner, source: "webhook", url: parsed.data.target_url, title: parsed.data.title, mediaUrl: parsed.data.media_url }),
    );
    return json({ job_id: jobId, status: "queued" }, 202);
  } catch (e) {
    return (e as { status?: number }).status === 429 ? json({ error: "rate_limited" }, 429) : json({ error: "unavailable" }, 503);
  }
}
