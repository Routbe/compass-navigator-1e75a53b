create table public.presence_broadcast_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
 event_id uuid not null,space text not null check(space in ('root','alias')),provider text not null,
 payload jsonb not null,attempts integer not null default 0,created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),claimed_until timestamptz,
 delivered_at timestamptz,last_status integer,unique(user_id,event_id,provider)
);
grant select,insert,update,delete on public.presence_broadcast_jobs to rout_app;
alter table public.presence_broadcast_jobs enable row level security;
alter table public.presence_broadcast_jobs force row level security;
create policy broadcast_owner on public.presence_broadcast_jobs for all to rout_app
 using(user_id=public.rout_current_user_id()) with check(user_id=public.rout_current_user_id());
create index broadcast_due on public.presence_broadcast_jobs(user_id,next_attempt_at) where delivered_at is null;
comment on table public.presence_broadcast_jobs is 'Owner-scoped durable Omnicast queue. Existing user_integrations sealed credential columns hold private configuration; no generated media is uploaded.';