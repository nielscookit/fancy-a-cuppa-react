-- Explicit version-4 barcode edits retain the previous code in the existing
-- revision snapshot. Legacy updates keep their original behavior.
grant update (code_type, code_value) on public.tea_codes to service_role;

create function public.update_community_tea_barcode(p_data jsonb, p_client_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_code_type text := nullif(p_data->>'code_type', '');
  v_code text := nullif(btrim(p_data->>'code_value'), '');
  v_old_type text := nullif(p_data->>'previous_code_type', '');
  v_old_code text := nullif(p_data->>'previous_code_value', '');
  v_result jsonb;
begin
  if current_user <> 'service_role' then raise exception 'Unauthorized'; end if;
  if p_data->>'write_version' is distinct from '4' then raise exception 'Invalid write version'; end if;
  if v_code is null or v_code_type is null or not (
    (v_code_type = 'ean_8' and v_code ~ '^[0-9]{8}$') or
    (v_code_type = 'upc_a' and v_code ~ '^[0-9]{12}$') or
    (v_code_type = 'ean_13' and v_code ~ '^[0-9]{13}$')
  ) then raise exception 'Invalid barcode'; end if;
  if not (p_data ? 'previous_code_type' and p_data ? 'previous_code_value')
     or (v_old_type is null) <> (v_old_code is null) then
    raise exception 'Invalid previous barcode';
  end if;

  -- Validate permissions, lock the tea, check revision and record history
  -- before changing the code. A later exception rolls all writes back.
  v_result := public.update_community_tea(p_data - 'code_type' - 'code_value', p_client_hash);
  if v_result @> '{"replayed":true}'::jsonb then return v_result; end if;
  v_id := (v_result->>'id')::uuid;

  if v_old_code is null then
    if exists (select 1 from public.tea_codes where tea_id = v_id) then
      raise exception 'Tea barcode conflict';
    end if;
    insert into public.tea_codes(tea_id,code_type,code_value) values (v_id,v_code_type,v_code);
  else
    -- Update only the submitted previous association, leaving any other
    -- identifiers in legacy data intact. The existing index covers UPC aliases.
    update public.tea_codes
      set code_type = v_code_type, code_value = v_code
      where tea_id = v_id and code_type = v_old_type and code_value = v_old_code;
    if not found then raise exception 'Tea barcode conflict'; end if;
  end if;
  return v_result;
end;
$$;

revoke all on function public.update_community_tea_barcode(jsonb,text) from public, anon, authenticated;
grant execute on function public.update_community_tea_barcode(jsonb,text) to service_role;
