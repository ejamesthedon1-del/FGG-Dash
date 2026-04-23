-- Run this in Supabase → SQL Editor (or use Supabase CLI migrations).
-- Mirrors dashboard localStorage keys so signed-in users share the same data across devices.

create table if not exists public.app_storage (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists app_storage_updated_at_idx on public.app_storage (updated_at desc);

alter table public.app_storage enable row level security;

-- Signed-in users only (anon cannot read/write org data)
create policy "app_storage_select_authenticated"
  on public.app_storage for select
  to authenticated
  using (true);

create policy "app_storage_insert_authenticated"
  on public.app_storage for insert
  to authenticated
  with check (true);

create policy "app_storage_update_authenticated"
  on public.app_storage for update
  to authenticated
  using (true)
  with check (true);

create policy "app_storage_delete_authenticated"
  on public.app_storage for delete
  to authenticated
  using (true);
