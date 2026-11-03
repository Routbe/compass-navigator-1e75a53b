import { z } from "zod";
import { scheduledBlocks, blockHref, type ProfileBlock } from "./profile";
import { normalizeSocialGridTarget, parseSocialGridConfig } from "./social-grid";

export const STATUS_HOURS = 24;
export const MICRO_TEXT_MAX = 280;
export const statusTheme = z.enum(["aurora", "glass"]).default("aurora");
const key = z.string().min(1).max(100);
export const statusInput = z.discriminatedUnion("statusType", [
  z.object({ id: z.string().uuid(), space: z.enum(["root", "alias"]), statusType: z.literal("micro_text"), payload: z.object({ text: z.string().trim().min(1).refine(s => [...s].length <= MICRO_TEXT_MAX, "max_280"), theme: statusTheme }).strict() }).strict(),
  z.object({ id: z.string().uuid(), space: z.enum(["root", "alias"]), statusType: z.literal("omni_drop"), payload: z.object({ blockId: key, itemId: key.optional() }).strict() }).strict(),
]);
export type StatusInput = z.infer<typeof statusInput>;
export type PresenceStory = {
  id: string; statusType: "qa_reply" | "micro_text" | "omni_drop";
  createdAt: string; expiresAt: string; theme?: "aurora" | "glass";
  text?: string; question?: string; answer?: string;
  blockId?: string; title?: string; targetUrl?: string; mediaUrl?: string; badge?: string;
  pending?: boolean;
};
export const presenceKey = (space: string, handle: string) => ["presence", space, handle.toLowerCase()] as const;
export function activePresence(stories: PresenceStory[], now: number): PresenceStory[] {
  return stories.filter(s => Number.isFinite(Date.parse(s.expiresAt)) && Date.parse(s.expiresAt) > now)
    .sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
/** Spotlight candidates are the existing blocks, not a second library. */
export function spotlightCandidates(blocks: ProfileBlock[], now = Date.now()) {
  return scheduledBlocks(blocks, now).flatMap(block => {
    if (block.kind === "social_grid") return parseSocialGridConfig(block.value).items.flatMap(item => item.targetUrl ? [{ blockId: block.id, itemId: item.id, title: item.caption || block.label, targetUrl: item.targetUrl, mediaUrl: item.mediaUrl }] : []);
    const href = normalizeSocialGridTarget(blockHref(block));
    return href ? [{ blockId: block.id, itemId: undefined, title: block.label, targetUrl: href, mediaUrl: block.thumbnailUrl }] : [];
  });
}
/** Explicit JSON-only endpoint: no multipart, binary, unbounded input or extra fields. */
export async function readStatusJson(request: Request): Promise<StatusInput> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw Object.assign(new Error("json_only"), { statusCode: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("empty_payload"), { statusCode: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 8192) { await reader.cancel(); throw Object.assign(new Error("payload_too_large"), { statusCode: 413 }); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return statusInput.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}