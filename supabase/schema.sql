-- 在 Supabase SQL Editor 中执行此脚本
-- 文档：https://supabase.com/docs

-- 业务数据 KV 表（对应本地 data/*.json）
create table if not exists public.app_data (
  key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.app_data is '应用业务数据：uploads / measure_tickets / inbound_records / ticket_matches / payment_details / vehicle_settlement_rules';

-- Storage：在 Supabase Dashboard → Storage 中手动创建 bucket
-- 名称：uploads
-- 访问：Private（应用通过 service_role 读写）
