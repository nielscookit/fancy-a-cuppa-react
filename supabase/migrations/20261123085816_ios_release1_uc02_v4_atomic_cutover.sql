-- Release 1 provenance: the production cutover was applied atomically on 2026-11-23.
-- Live history also records the two preceding original UC02 migrations.
-- In fresh environments this file runs after those two migrations and installs
-- exactly the pilot authorization guard that was the third step of the live cutover.
-- Do not run this file manually against the already-migrated production database.

-- Apply only in the coordinated pilot cutover, after both UC02 migrations.
-- Run all three SQL files in one transaction. This also closes legacy EDIT.

create table tea_community_private.pilot_installations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  revoked_at timestamptz
);
alter table tea_community_private.pilot_installations enable row level security;
revoke all on tea_community_private.pilot_installations from public, anon, authenticated, service_role;
grant select on tea_community_private.pilot_installations to service_role;
-- The gateway rechecks permission within the final mutation transaction.
-- Row locking requires UPDATE privilege; RLS and RPC grants exclude clients.
grant update (revoked_at) on tea_community_private.pilot_installations to service_role;

create function public.community_tea_pilot_identity(p_token_hash text)
returns text language sql set search_path = '' as $$
  select encode(sha256(convert_to('ios-pilot:' || id::text,'UTF8')),'hex')
  from tea_community_private.pilot_installations
  where token_hash = p_token_hash and revoked_at is null
  for share
$$;

alter function tea_community_private.tea_save_receipt(text,jsonb,text) rename to tea_save_receipt_v4;

create function tea_community_private.tea_save_receipt(client text,p_data jsonb,operation text)
returns jsonb language plpgsql set search_path = '' as $$
begin
  -- Every catalog mutation requires the authenticated pilot gateway,
  -- including legacy CREATE without a write_version.
  if coalesce(current_setting('fac.pilot_writer', true), '') <> client then
    raise sqlstate 'PT403' using message = 'Pilot write authorization required';
  end if;
  return tea_community_private.tea_save_receipt_v4(client,p_data,operation);
end;
$$;

-- Patch only the coordinated pilot copy; abort if the original guard drifts.
do $patch$
declare
  source text := pg_get_functiondef('public.update_community_tea(jsonb,text)'::regprocedure);
  guard text := $guard$if v_before.origin <> 'community' then raise exception 'Curated tea is read-only'; end if;$guard$;
begin
  if position(guard in source) = 0 then raise exception 'Curated guard source mismatch'; end if;
  execute replace(source, guard, $newguard$
    if v_before.origin <> 'community' and
      coalesce(current_setting('fac.pilot_writer', true), '') <> p_client_hash
      then raise exception 'Curated tea is read-only'; end if;
  $newguard$);
end;
$patch$;

create or replace function public.community_tea_photo_keys(p_tea uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(f.object_key order by f.position),'[]'::jsonb)
  from tea_community_private.tea_photos f join public.teas t on t.id=f.tea_id
  where t.id=p_tea and t.status='published'
$$;

create table tea_community_private.pilot_edit_audit (
  tea_id uuid not null references public.teas(id),
  revision integer not null,
  installation_id uuid not null references tea_community_private.pilot_installations(id),
  recorded_at timestamptz not null default now(),
  primary key (tea_id, revision)
);
alter table tea_community_private.pilot_edit_audit enable row level security;
revoke all on tea_community_private.pilot_edit_audit from public, anon, authenticated, service_role;
grant insert on tea_community_private.pilot_edit_audit to service_role;

create function public.community_tea_pilot_save(p_data jsonb,p_token_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  writer text := public.community_tea_pilot_identity(p_token_hash);
  result jsonb;
begin
  if writer is null then
    raise sqlstate 'PT403' using message = 'Pilot write authorization required';
  end if;
  if p_data->>'write_version' is distinct from '4' then
    raise exception 'Invalid write version';
  end if;
  perform set_config('fac.pilot_writer', writer, true);
  case p_data->>'action'
    when 'create' then result := public.add_community_tea(p_data,writer);
    when 'update' then result := public.update_community_tea(p_data,writer);
    when 'update_barcode' then result := public.update_community_tea_barcode(p_data,writer);
    else raise exception 'Invalid action';
  end case;
  if p_data->>'action' in ('update','update_barcode')
    and not coalesce((result->>'replayed')::boolean, false) then
    insert into tea_community_private.pilot_edit_audit(tea_id,revision,installation_id)
    select (result->>'id')::uuid,(result->>'revision')::integer,id
      from tea_community_private.pilot_installations where token_hash=p_token_hash;
  end if;
  perform set_config('fac.pilot_writer', '', true);
  return result;
end;
$$;

revoke all on function tea_community_private.tea_save_receipt_v4(text,jsonb,text),
  tea_community_private.tea_save_receipt(text,jsonb,text),
  public.community_tea_pilot_identity(text), public.community_tea_pilot_save(jsonb,text)
  from public, anon, authenticated;
grant execute on function tea_community_private.tea_save_receipt_v4(text,jsonb,text),
  tea_community_private.tea_save_receipt(text,jsonb,text),
  public.community_tea_pilot_identity(text), public.community_tea_pilot_save(jsonb,text)
  to service_role;
