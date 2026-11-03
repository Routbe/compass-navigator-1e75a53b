import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/middleware";
import { ingestPayloadSchema, type OmniJob } from "@/lib/omni-ingest";

/** Studio: returns immediately with a job id; the worker runs after the response. */
export const enqueueOmniUrl = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => ingestPayloadSchema.pick({ target_url: true }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; jobId?: string; error?: string }> => {
    const { enqueueOmniJob } = await import("@/lib/omni-ingest.server");
    try {
      return { ok: true, jobId: await enqueueOmniJob({ userId: context.userId, source: "studio", url: data.target_url }) };
    } catch (e) {
      return { ok: false, error: (e as { status?: number }).status === 429 ? "rate_limited" : "failed" };
    }
  });

export const listOmniIngestJobs = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<OmniJob[]> => {
    const { listOmniJobs } = await import("@/lib/omni-ingest.server");
    return listOmniJobs(context.userId);
  });

export const dismissOmniJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`delete from public.omni_ingest_jobs where id=${data.id} and user_id=${context.userId}`;
    return { ok: true };
  });

export const retryOmniJob = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`update public.omni_ingest_jobs set status='queued', attempts=0, error=null, updated_at=now()
      where id=${data.id} and user_id=${context.userId} and status='failed'`;
    const { processOmniJob } = await import("@/lib/omni-ingest.server");
    const { registerBackgroundTask } = await import("@/lib/background-task.server");
    const task = processOmniJob(data.id, context.userId).catch(() => undefined);
    if (!registerBackgroundTask(task)) void task;
    return { ok: true };
  });

export const getIngestTokenStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ active: boolean; createdAt: string | null }> => {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`select created_at from public.omni_ingest_tokens where user_id=${context.userId}`) as { created_at: string }[];
    return { active: rows.length > 0, createdAt: rows[0] ? new Date(rows[0].created_at).toISOString() : null };
  });

/** Creates or rotates the webhook token. The raw token is shown once; only its SHA-256 is stored. */
export const rotateIngestToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ token: string }> => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = `rout_ing_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const { sha256Hex } = await import("@/lib/omni-ingest.server");
    const { sql } = await import("@/lib/neon");
    const hash = await sha256Hex(token);
    await sql`insert into public.omni_ingest_tokens (user_id, token_hash) values (${context.userId}, ${hash})
      on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now()`;
    return { token };
  });

export const revokeIngestToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`delete from public.omni_ingest_tokens where user_id=${context.userId}`;
    return { ok: true };
  });
