-- Isolated V3 notification data; no changes to the tea catalog or V2.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists tea_push;
revoke all on schema tea_push from public, anon, authenticated;

create table tea_push.installations (
  id uuid primary key,
  token_hash text not null check (length(token_hash) = 64),
  subscription jsonb,
  endpoint_hash text not null unique,
  revision bigint not null default 0 check (revision >= 0),
  deadline timestamptz,
  status text not null default 'cancelled'
    check (status in ('cancelled', 'scheduled', 'sending', 'sent', 'failed', 'expired')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  last_http_status integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tea_push.installations enable row level security;
revoke all on tea_push.installations from public, anon, authenticated;
create index tea_push_due on tea_push.installations (next_attempt_at)
  where status in ('scheduled', 'sending');
create index tea_push_retention on tea_push.installations (updated_at);

create table tea_push.rate_limits (
  key text primary key,
  count integer not null default 1,
  created_at timestamptz not null default now()
);
alter table tea_push.rate_limits enable row level security;
revoke all on tea_push.rate_limits from public, anon, authenticated;
create index tea_push_rate_retention on tea_push.rate_limits (created_at);

-- Only the Edge runtime and postgres scheduler need access. No public RPCs.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fac_push_dispatch_v1') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
      'fac_push_dispatch_v1', 'Narrow authentication secret for V3 timer dispatcher');
  end if;
end;
$$;

create function tea_push.dispatch_due() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update tea_push.installations set status = 'expired', next_attempt_at = null, lease_until = null
    where status in ('scheduled', 'sending')
      and (deadline < now() - interval '2 minutes'
        or (attempts >= 3 and lease_until < now()));
  if exists (
    select 1 from tea_push.installations
    where subscription is not null and attempts < 3 and next_attempt_at <= now()
      and (status = 'scheduled' or (status = 'sending' and lease_until < now()))
  ) then
    perform net.http_post(
      url := 'https://zfkiiqqyapahxirguxgj.supabase.co/functions/v1/tea-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'fac_push_dispatch_v1')),
      body := '{"action":"dispatch"}'::jsonb,
      timeout_milliseconds := 10000
    );
  end if;
end;
$$;
revoke all on function tea_push.dispatch_due() from public, anon, authenticated;

-- Small indexed DB check; an Edge invocation happens only when a timer is due.
select cron.schedule('fac-v3-tea-push', '5 seconds', 'select tea_push.dispatch_due()');

create function tea_push.cleanup() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from tea_push.rate_limits where created_at < now() - interval '2 days';
  delete from tea_push.installations where updated_at < now() - interval '90 days';
  -- Scope retention to our own jobs; leave other teams' job history alone.
  delete from cron.job_run_details where end_time < now() - interval '1 day'
    and jobid in (select jobid from cron.job where jobname in ('fac-v3-tea-push', 'fac-v3-tea-push-cleanup'));
end;
$$;
revoke all on function tea_push.cleanup() from public, anon, authenticated;
select cron.schedule('fac-v3-tea-push-cleanup', '17 3 * * *', 'select tea_push.cleanup()');
