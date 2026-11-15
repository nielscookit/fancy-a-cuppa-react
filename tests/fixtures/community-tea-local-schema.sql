-- Synthetic catalogue baseline for local UC02 tests only.
-- Kept outside supabase/migrations so deployment cannot apply it.
create table public.teas (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (char_length(trim(brand)) between 1 and 120),
  name text not null check (char_length(trim(name)) between 1 and 200),
  category text not null default 'black' check (category in
    ('black','green','white','oolong','yellow','dark','pu_erh','herbal','fruit','rooibos','mate','other')),
  leaf_style text check (leaf_style in ('whole','broken','ctc','fannings_dust','powder','bag','other')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  subcategory text,
  subcategory_other text check (char_length(subcategory_other) between 1 and 100),
  photo_url text check (char_length(photo_url) <= 2048)
);
create table public.tea_codes (
  id uuid primary key default gen_random_uuid(),
  tea_id uuid not null references public.teas(id) on delete cascade,
  code_type text not null check (code_type in ('ean_8','ean_13','upc_a','gtin_14','qr')),
  code_value text not null check (char_length(trim(code_value)) between 1 and 512),
  created_at timestamptz not null default now(),
  unique(code_type,code_value)
);
create index tea_codes_tea_idx on public.tea_codes(tea_id);
create table public.tea_preparations (
  id uuid primary key default gen_random_uuid(),
  tea_id uuid not null unique references public.teas(id) on delete cascade,
  brew_seconds integer not null check (brew_seconds between 30 and 1800),
  water_temp_c integer check (water_temp_c between 40 and 100),
  dose_teaspoons numeric check (dose_teaspoons > 0 and dose_teaspoons <= 100),
  dose_grams numeric check (dose_grams > 0 and dose_grams <= 100),
  dose_water_ml integer not null default 250 check (dose_water_ml between 50 and 10000),
  instructions text check (char_length(instructions) <= 2000),
  source_label text check (char_length(source_label) <= 250),
  updated_at timestamptz not null default now(),
  dose_bags numeric check (dose_bags > 0 and dose_bags <= 100),
  dose_measures numeric check (dose_measures > 0 and dose_measures <= 100),
  check (num_nonnulls(dose_teaspoons,dose_grams,dose_bags,dose_measures) > 0)
);
create table public.tea_write_limits (
  client_hash text not null check (char_length(client_hash)=64),
  day date not null,
  write_count integer not null default 0 check (write_count between 0 and 1000),
  primary key(client_hash,day)
);
alter table public.teas enable row level security;
alter table public.tea_codes enable row level security;
alter table public.tea_preparations enable row level security;
alter table public.tea_write_limits enable row level security;
revoke all on public.teas,public.tea_codes,public.tea_preparations,public.tea_write_limits from public,anon,authenticated;
grant select on public.teas,public.tea_codes,public.tea_preparations to anon,authenticated;
grant select,insert,update on public.teas,public.tea_preparations,public.tea_write_limits to service_role;
grant select,insert on public.tea_codes to service_role;
create policy teas_public_read on public.teas for select to anon,authenticated using (status='published');
create policy codes_public_read on public.tea_codes for select to anon,authenticated using
  (exists (select 1 from public.teas t where t.id=tea_id and t.status='published'));
create policy preparations_public_read on public.tea_preparations for select to anon,authenticated using
  (exists (select 1 from public.teas t where t.id=tea_id and t.status='published'));

-- Sentinel predates the UC02 migration so the test exercises its curated default.
insert into public.teas(id,brand,name,status)
values('00000000-0000-4000-8000-000000000001','UC02 Fixture','Synthetic Black Tea','published');
insert into public.tea_preparations(tea_id,brew_seconds,dose_grams)
values('00000000-0000-4000-8000-000000000001',180,2);
