-- 1. Create building_photos storage bucket
insert into storage.buckets (id, name, public)
values ('building_photos', 'building_photos', true)
on conflict (id) do nothing;

-- 2. Enable RLS on storage.objects
alter table storage.objects enable row level security;

-- 3. Public read access policy
create policy "Public Access to building_photos"
on storage.objects for select
using (bucket_id = 'building_photos');

-- 4. Authenticated users can upload to building_photos
create policy "Authenticated users can upload photos"
on storage.objects for insert
with check (
  bucket_id = 'building_photos'
  and auth.role() = 'authenticated'
);

-- 5. Users can update their own photos
create policy "Users can update their own photos"
on storage.objects for update
using (
  bucket_id = 'building_photos'
  and auth.role() = 'authenticated'
  and owner_id = auth.uid()
);

-- 6. Users can delete their own photos
create policy "Users can delete their own photos"
on storage.objects for delete
using (
  bucket_id = 'building_photos'
  and auth.role() = 'authenticated'
  and owner_id = auth.uid()
);
