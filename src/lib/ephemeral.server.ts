import { sql } from "./neon";
import { statusInput, spotlightCandidates, type StatusInput, type PresenceStory } from "./presence";
import { normalizeSocialGridTarget } from "./social-grid";
import type { ProfileBlock } from "./profile";

export async function publicPresence(handle: string, space: string): Promise<PresenceStory[]> {
  const rows = await sql`select public.rout_presence_public(${handle},${space}) as stories` as Record<string,unknown>[];
  const raw=rows[0]?.["stories"];
  const stories=(typeof raw==="string" ? JSON.parse(raw) : raw) as PresenceStory[] | null;
  return (stories ?? []).flatMap(s => {
    if(s.statusType==="omni_drop") { const targetUrl=normalizeSocialGridTarget(s.targetUrl ?? "");return targetUrl ? [{...s,targetUrl}] : []; }
    return [{...s,createdAt:new Date(s.createdAt).toISOString(),expiresAt:new Date(s.expiresAt).toISOString()}];
  });
}
export async function createPresence(owner: string, input: StatusInput): Promise<PresenceStory> {
  const data=statusInput.parse(input);
  if(data.statusType==="omni_drop") {
    const rows=(data.space==="alias" ? await sql`select blocks from public.alias_profiles where user_id=${owner} limit 1` : await sql`select blocks from public.profiles where id=${owner} limit 1`) as Record<string,unknown>[];
    const blocks=rows[0]?.["blocks"] as ProfileBlock[] | undefined;
    if(!spotlightCandidates(blocks ?? []).some(b=>b.blockId===data.payload.blockId && b.itemId===data.payload.itemId)) throw new Error("published_block_required");
  }
  const rows=await sql`insert into public.ephemeral_statuses(id,user_id,space,status_type,content_payload)
    values(${data.id},${owner},${data.space},${data.statusType}::public.presence_status_type,${JSON.stringify(data.payload)}::jsonb)
    on conflict(id) do nothing returning id,created_at,expires_at` as Record<string,unknown>[];
  const row=rows[0] ?? (await sql`select id,created_at,expires_at from public.ephemeral_statuses where id=${data.id} and user_id=${owner}` as Record<string,unknown>[])[0];
  if(!row) throw new Error("status_not_saved");
  return {id:String(row["id"]),statusType:data.statusType,...data.payload,createdAt:new Date(String(row["created_at"])).toISOString(),expiresAt:new Date(String(row["expires_at"])).toISOString()};
}