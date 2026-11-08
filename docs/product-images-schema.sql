create table public.tea_product_images (
tea_id uuid primary key references public.teas(id) on delete cascade,
source_image_url text not null check (source_image_url like 'https://%'),
source_page_url text not null check (source_page_url like 'https://%')
);
alter table public.tea_product_images enable row level security;
revoke all on public.tea_product_images from anon, authenticated;
grant select on public.tea_product_images to anon, authenticated;
create policy "Published tea image selection" on public.tea_product_images for select to anon, authenticated using (exists(select 1 from public.teas where teas.id=tea_product_images.tea_id and teas.status='published'));
