-- UC02 cutover. The default classifies existing and future administrative
-- inserts as curated. Only the community create RPC supplies 'community'.
alter table public.teas
  add column origin text not null default 'curated' check (origin in ('curated','community')),
  add column revision integer not null default 1 check (revision > 0);

create function public.tea_barcode_key(code_type text, code_value text)
returns text language sql immutable strict set search_path = '' as $$
  select case when code_type in ('upc_a','ean_13','ean_8','gtin_14')
    then 'gtin:' || lpad(code_value,14,'0')
    else code_type || ':' || code_value end
$$;
create unique index tea_codes_canonical_key
  on public.tea_codes (public.tea_barcode_key(code_type, code_value));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('community-tea-photos','community-tea-photos',false,1048576,array['image/jpeg']);

create schema tea_community_private;
revoke all on schema tea_community_private from public, anon, authenticated;
grant usage on schema tea_community_private to service_role;
create table tea_community_private.tea_photos (
  tea_id uuid not null references public.teas(id),
  position smallint not null check (position between 1 and 3),
  object_key text not null unique,
  primary key (tea_id, position)
);
create table tea_community_private.tea_edit_history (
  tea_id uuid not null references public.teas(id),
  revision integer not null,
  recorded_at timestamptz not null default now(),
  snapshot jsonb not null,
  primary key (tea_id,revision)
);
create table tea_community_private.tea_save_receipts (
  client_hash text not null,
  save_id uuid not null,
  action text not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (client_hash,save_id)
);
grant select,insert,delete on tea_community_private.tea_photos to service_role;
grant insert on tea_community_private.tea_edit_history to service_role;
grant select,insert on tea_community_private.tea_save_receipts to service_role;

create function tea_community_private.tea_save_receipt(client text,p_data jsonb,operation text)
returns jsonb language plpgsql set search_path = '' as $$
declare receipt tea_community_private.tea_save_receipts%rowtype;
begin
  if p_data->>'write_version' is distinct from '4' then return null; end if;
  if coalesce(p_data->>'request_fingerprint','') !~ '^[a-f0-9]{64}$' or
     coalesce(p_data->>'save_id','') !~ '^[a-f0-9-]{36}$' then
    raise exception 'Invalid save identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(client || ':' || (p_data->>'save_id'),0));
  select * into receipt from tea_community_private.tea_save_receipts
    where client_hash=client and save_id=(p_data->>'save_id')::uuid;
  if not found then return null; end if;
  if receipt.action <> operation or receipt.fingerprint <> p_data->>'request_fingerprint' then
    raise exception 'Tea save identity conflict';
  end if;
  return receipt.response || '{"replayed":true}'::jsonb;
end $$;

create function tea_community_private.record_tea_save(client text,p_data jsonb,operation text,result jsonb)
returns jsonb language plpgsql set search_path = '' as $$
begin
  if p_data->>'write_version' = '4' then
    insert into tea_community_private.tea_save_receipts(client_hash,save_id,action,fingerprint,response)
    values(client,(p_data->>'save_id')::uuid,operation,p_data->>'request_fingerprint',result);
  end if;
  return result;
end $$;

create function tea_community_private.tea_save_photos(tea uuid,p_data jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  refs jsonb := p_data->'photo_keys';
  uploaded jsonb := coalesce(p_data->'uploaded_photo_keys','[]'::jsonb);
  photo_key text;
begin
  if p_data->>'write_version' is distinct from '4' or refs is null then return; end if;
  if jsonb_typeof(refs) <> 'array' then raise exception 'Invalid photo list'; end if;
  if jsonb_array_length(refs)>3 then raise exception 'Invalid photo count'; end if;
  for photo_key in select value from jsonb_array_elements_text(refs) loop
    if photo_key !~ '^community/[a-f0-9-]{36}\.jpg$' or not (
      uploaded ? photo_key or exists (
        select 1 from tea_community_private.tea_photos f where f.tea_id=tea and f.object_key=photo_key
      )
    ) then raise exception 'Invalid photo reference'; end if;
  end loop;
  delete from tea_community_private.tea_photos where tea_id=tea;
  insert into tea_community_private.tea_photos(tea_id,position,object_key)
    select tea, ordinality, value from jsonb_array_elements_text(refs) with ordinality;
end $$;

create function public.community_tea_photo_keys(p_tea uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(f.object_key order by f.position),'[]'::jsonb)
  from tea_community_private.tea_photos f join public.teas t on t.id=f.tea_id
  where t.id=p_tea and t.origin='community' and t.status='published'
$$;
revoke all on function public.community_tea_photo_keys(uuid) from public, anon, authenticated;
grant execute on function public.community_tea_photo_keys(uuid) to service_role;

-- Reserve quota before accepting expensive images or contacting Storage.
create function public.reserve_community_photo_upload(p_client_hash text,p_count integer)
returns void language plpgsql set search_path = '' as $$
declare quota_key text; today date := (now() at time zone 'UTC')::date;
begin
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' or
     p_count is null or p_count not between 1 and 3 then raise exception 'Invalid upload quota request'; end if;
  quota_key := encode(sha256(convert_to('photo:' || p_client_hash,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(quota_key,0));
  if coalesce((select write_count from public.tea_write_limits where client_hash=quota_key and day=today),0)+p_count > 30
    then raise exception 'Daily photo upload limit reached'; end if;
  insert into public.tea_write_limits(client_hash,day,write_count) values(quota_key,today,p_count)
  on conflict(client_hash,day) do update set write_count=public.tea_write_limits.write_count+excluded.write_count;
end $$;
revoke all on function public.reserve_community_photo_upload(text,integer) from public, anon, authenticated;
grant execute on function public.reserve_community_photo_upload(text,integer) to service_role;

CREATE OR REPLACE FUNCTION public.add_community_tea(p_data jsonb, p_client_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_brand text := nullif(btrim(p_data->>'brand'),'');
 v_name text := nullif(btrim(p_data->>'name'),'');
 v_category text := coalesce(nullif(p_data->>'category',''),'other');
 v_leaf text := nullif(p_data->>'leaf_style','');
 v_code_type text := nullif(p_data->>'code_type','');
 v_code text := nullif(btrim(p_data->>'code_value'),'');
 v_seconds integer;
 v_base integer;
 v_tsp numeric;
 v_grams numeric; v_bags numeric; v_measures numeric; v_subcategory text := nullif(btrim(p_data->>'subcategory'),''); v_subcategory_other text := nullif(btrim(p_data->>'subcategory_other'),'');
 v_temp integer;
 v_id uuid;
 v_count integer;
 v_prior jsonb;
begin
 if current_user <> 'service_role' then raise exception 'Unauthorized'; end if;
 if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid client identifier'; end if;
 v_prior := tea_community_private.tea_save_receipt(p_client_hash,p_data,'create');
 if v_prior is not null then return v_prior; end if;
 if v_brand is null or char_length(v_brand)>120 or v_name is null or char_length(v_name)>200 then raise exception 'Invalid brand or name'; end if;
 if v_category not in ('black','green','white','oolong','yellow','dark','pu_erh','herbal','fruit','rooibos','mate','other') then raise exception 'Invalid tea category'; end if;
 if char_length(v_subcategory)>100 or (v_subcategory='other' and (v_subcategory_other is null or char_length(v_subcategory_other)>100)) then raise exception 'Invalid tea variety'; end if;
 if v_leaf is not null and v_leaf not in ('whole','broken','ctc','fannings_dust','powder','bag','other') then raise exception 'Invalid leaf style'; end if;
 if (v_code_type is null) <> (v_code is null) then raise exception 'Invalid code pair'; end if;
 if v_code_type is not null and v_code_type not in ('ean_8','ean_13','upc_a','gtin_14','qr') then raise exception 'Invalid code type'; end if;
 if v_code is not null and char_length(v_code)>512 then raise exception 'Invalid code length'; end if;
 if v_code_type='ean_8' and v_code !~ '^[0-9]{8}$' or
    v_code_type='ean_13' and v_code !~ '^[0-9]{13}$' or
    v_code_type='upc_a' and v_code !~ '^[0-9]{12}$' or
    v_code_type='gtin_14' and v_code !~ '^[0-9]{14}$' then
      raise exception 'Invalid numeric product code';
 end if;
 begin
 v_seconds:=(p_data->>'brew_seconds')::integer;
 v_base:=coalesce((p_data->>'dose_water_ml')::integer,250);
 v_tsp:=nullif(p_data->>'dose_teaspoons','')::numeric;
 v_grams:=nullif(p_data->>'dose_grams','')::numeric; v_bags:=nullif(p_data->>'dose_bags','')::numeric; v_measures:=nullif(p_data->>'dose_measures','')::numeric;
 v_temp:=nullif(p_data->>'water_temp_c','')::integer;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid numerical values';
 end;
 if v_seconds is null or v_seconds not between 30 and 1800 or v_base not between 50 and 10000
    or (v_tsp is null and v_grams is null and v_bags is null and v_measures is null)
    or (v_tsp is not null and v_tsp not between 0.01 and 100)
    or (v_grams is not null and v_grams not between 0.01 and 100) or (v_bags is not null and v_bags not between 0.01 and 100) or (v_measures is not null and v_measures not between 0.01 and 100)
    or (v_temp is not null and v_temp not between 40 and 100) then
    raise exception 'Invalid preparation';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_hash,0));
 select write_count into v_count from public.tea_write_limits
   where client_hash=p_client_hash and day=(now() at time zone 'UTC')::date;
 if coalesce(v_count,0)>=25 then raise exception 'Daily submission limit reached'; end if;

 insert into public.tea_write_limits(client_hash,day,write_count)
 values(p_client_hash,(now() at time zone 'UTC')::date,1)
 on conflict (client_hash,day) do update set write_count=public.tea_write_limits.write_count+1;

 insert into public.teas(brand,name,category,leaf_style,status,subcategory,subcategory_other,origin)
 values(v_brand,v_name,v_category,v_leaf,'draft',v_subcategory,v_subcategory_other,'community') returning id into v_id;
 insert into public.tea_preparations(tea_id,brew_seconds,water_temp_c,dose_teaspoons,dose_grams,dose_bags,dose_measures,dose_water_ml)
 values(v_id,v_seconds,v_temp,v_tsp,v_grams,v_bags,v_measures,v_base);
 if v_code is not null then
   insert into public.tea_codes(tea_id,code_type,code_value) values(v_id,v_code_type,v_code);
 end if;
 update public.teas set status='published' where id=v_id;
 perform tea_community_private.tea_save_photos(v_id,p_data);
 return tea_community_private.record_tea_save(p_client_hash,p_data,'create',jsonb_build_object('id',v_id,'revision',1));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_community_tea(p_data jsonb, p_client_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_id uuid;
 v_brand text := nullif(btrim(p_data->>'brand'),'');
 v_name text := nullif(btrim(p_data->>'name'),'');
 v_category text := nullif(p_data->>'category','');
 v_subcategory text := nullif(btrim(p_data->>'subcategory'),'');
 v_other text := nullif(btrim(p_data->>'subcategory_other'),'');
 v_leaf text := nullif(p_data->>'leaf_style','');
 v_type text := case when p_data->>'leaf_style' = 'bag' then 'bag' else 'loose' end;
 v_unit text := p_data->>'dose_unit';
 v_qty numeric;
 v_base integer;
 v_seconds integer;
 v_temp integer;
 v_code_type text := nullif(p_data->>'code_type','');
 v_code text := nullif(btrim(p_data->>'code_value'),'');
 v_count integer;
 v_before public.teas%rowtype;
 v_prior jsonb;
begin
 if current_user <> 'service_role' then raise exception 'Unauthorized'; end if;
 if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid client'; end if;
 v_prior := tea_community_private.tea_save_receipt(p_client_hash,p_data,'update');
 if v_prior is not null then return v_prior; end if;
 begin
 v_id := (p_data->>'id')::uuid;
 v_qty := (p_data->>'dose_quantity')::numeric;
 v_base := (p_data->>'dose_water_ml')::integer;
 v_seconds := (p_data->>'brew_seconds')::integer;
 v_temp := nullif(p_data->>'water_temp_c','')::integer;
 exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Invalid values';
 end;
 if v_brand is null or length(v_brand)>120 or v_name is null or length(v_name)>200
 or v_category not in ('black','green','white','oolong','yellow','dark','pu_erh','herbal','fruit','rooibos','mate','other')
 or length(v_subcategory)>100
 or (v_subcategory='other' and (v_other is null or length(v_other)>100))
 or (v_leaf is not null and v_leaf not in ('whole','broken','ctc','fannings_dust','powder','bag','other'))
 or v_unit not in ('tsp','g','bag','measure')
 or (v_type='bag' and v_unit<>'bag') or (v_type='loose' and v_unit='bag')
 or v_category is null or v_unit is null or v_qty is null or v_base is null or v_seconds is null
 or v_qty not between 0.01 and 100 or v_base not between 50 and 10000
 or v_seconds not between 30 and 1800 or (v_temp is not null and v_temp not between 40 and 100)
 then raise exception 'Invalid tea details'; end if;
 if (v_code_type is null) <> (v_code is null) then raise exception 'Invalid barcode pair'; end if;
 if v_code_type is not null and v_code_type not in ('ean_8','ean_13','upc_a','gtin_14','qr') then raise exception 'Invalid barcode type'; end if;
 if v_code is not null and length(v_code)>512 then raise exception 'Invalid barcode'; end if;
 if v_code_type='ean_8' and v_code !~ '^[0-9]{8}$' or
    v_code_type='ean_13' and v_code !~ '^[0-9]{13}$' or
    v_code_type='upc_a' and v_code !~ '^[0-9]{12}$' or
    v_code_type='gtin_14' and v_code !~ '^[0-9]{14}$' then raise exception 'Invalid barcode digits'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_hash,0));
 select write_count into v_count from public.tea_write_limits where client_hash=p_client_hash and day=(now() at time zone 'UTC')::date;
 if coalesce(v_count,0)>=25 then raise exception 'Daily submission limit reached'; end if;
 select * into v_before from public.teas where id=v_id and status='published' for update;
 if not found then raise exception 'Tea not found'; end if;
 if v_before.origin <> 'community' then raise exception 'Curated tea is read-only'; end if;
 if (p_data->>'expected_revision') is distinct from v_before.revision::text then
   raise exception 'Tea revision conflict';
 end if;
 insert into tea_community_private.tea_edit_history (tea_id, revision, snapshot)
 values (v_id, v_before.revision, jsonb_build_object(
   'tea', to_jsonb(v_before),
   'codes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.tea_codes c where c.tea_id=v_id),
   'preparation', (select to_jsonb(p) from public.tea_preparations p where p.tea_id=v_id),
   'photos', (select coalesce(jsonb_agg(to_jsonb(f) order by f.position), '[]') from tea_community_private.tea_photos f where f.tea_id=v_id)
 ));
 insert into public.tea_write_limits(client_hash,day,write_count)
 values (p_client_hash,(now() at time zone 'UTC')::date,1)
 on conflict(client_hash,day) do update set write_count=public.tea_write_limits.write_count+1;
 update public.teas set brand=v_brand,name=v_name,category=v_category,
 subcategory=v_subcategory,subcategory_other=case when v_subcategory='other' then v_other else null end,
 leaf_style=case
   when p_data->>'write_version' in ('3','4') then v_leaf
   when v_type='bag' then 'bag'
   else 'other'
 end,updated_at=now(),revision=revision+1 where id=v_id;
 insert into public.tea_preparations(tea_id,brew_seconds,water_temp_c,dose_teaspoons,dose_grams,dose_bags,dose_measures,dose_water_ml)
 values (v_id,v_seconds,v_temp,case when v_unit='tsp' then v_qty end,case when v_unit='g' then v_qty end,
 case when v_unit='bag' then v_qty end,case when v_unit='measure' then v_qty end,v_base)
 on conflict(tea_id) do update set
 brew_seconds=excluded.brew_seconds,water_temp_c=excluded.water_temp_c,
 dose_teaspoons=excluded.dose_teaspoons,dose_grams=excluded.dose_grams,
 dose_bags=excluded.dose_bags,dose_measures=excluded.dose_measures,
 dose_water_ml=excluded.dose_water_ml,updated_at=now();
 if v_code is not null then
  if not exists (select 1 from public.tea_codes c where c.tea_id=v_id and
     public.tea_barcode_key(c.code_type,c.code_value)=public.tea_barcode_key(v_code_type,v_code)) then
    insert into public.tea_codes(tea_id,code_type,code_value) values(v_id,v_code_type,v_code);
  end if;
 end if;
 perform tea_community_private.tea_save_photos(v_id,p_data);
 return tea_community_private.record_tea_save(p_client_hash,p_data,'update',jsonb_build_object('id',v_id,'revision',v_before.revision+1));
end $function$
;

revoke all on function public.add_community_tea(jsonb,text), public.update_community_tea(jsonb,text)
  from public, anon, authenticated;
grant execute on function public.add_community_tea(jsonb,text), public.update_community_tea(jsonb,text) to service_role;
