-- Ensure API roles can use order_flow_stages (run if inserts still fail after table create).
grant select, insert, update, delete on table public.order_flow_stages to authenticated;
grant select, insert, update, delete on table public.order_flow_stages to service_role;
grant all on table public.order_flow_stages to postgres;
