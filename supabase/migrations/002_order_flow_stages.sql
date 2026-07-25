-- Durable Order Flow stages (shared across all devices / browsers).
-- Run in Supabase → SQL Editor (or Supabase CLI migrations).

create table if not exists public.order_flow_stages (
  id text primary key,
  brand text not null,
  shopify_order_id text not null,
  order_name text not null default '',
  stage text not null,
  notes text not null default '',
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists order_flow_stages_brand_idx
  on public.order_flow_stages (brand);

create index if not exists order_flow_stages_stage_idx
  on public.order_flow_stages (stage);

create index if not exists order_flow_stages_updated_at_idx
  on public.order_flow_stages (updated_at desc);

alter table public.order_flow_stages enable row level security;

-- Backend uses the service role key (bypasses RLS).
-- Signed-in dashboard users can also read/write so stages stay shared.
drop policy if exists "order_flow_stages_select_authenticated" on public.order_flow_stages;
create policy "order_flow_stages_select_authenticated"
  on public.order_flow_stages for select
  to authenticated
  using (true);

drop policy if exists "order_flow_stages_insert_authenticated" on public.order_flow_stages;
create policy "order_flow_stages_insert_authenticated"
  on public.order_flow_stages for insert
  to authenticated
  with check (true);

drop policy if exists "order_flow_stages_update_authenticated" on public.order_flow_stages;
create policy "order_flow_stages_update_authenticated"
  on public.order_flow_stages for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "order_flow_stages_delete_authenticated" on public.order_flow_stages;
create policy "order_flow_stages_delete_authenticated"
  on public.order_flow_stages for delete
  to authenticated
  using (true);
