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
  -- Preserve legacy CREATE. Block legacy EDIT and crafted V4 payloads
  -- before quotas, receipts, catalog or barcode rows can change.
  if (operation = 'update' or p_data->>'write_version' = '4')
    and coalesce(current_setting('fac.pilot_writer', true), '') <> client then
    raise sqlstate 'PT403' using message = 'Pilot write authorization required';
  end if;
  return tea_community_private.tea_save_receipt_v4(client,p_data,operation);
end;
$$;

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
