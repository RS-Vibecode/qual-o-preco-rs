-- Rode isto uma vez no SQL Editor do Supabase (painel do projeto).
-- Cria a tabela de taxas de referência por marketplace/categoria (Amazon,
-- e outros marketplaces sem API de taxa que vierem depois — Shopee,
-- TikTok Shop, Magalu, Shein). Editável pelo admin no painel — ver
-- api/marketplace-rates.js — em vez de hardcoded num arquivo de código,
-- que exigiria uma alteração de código toda vez que uma taxa mudasse.
--
-- Cada linha é uma categoria de UM marketplace. Campos cobrem os
-- diferentes formatos de cobrança encontrados na pesquisa:
--   - pct: percentual de comissão base da categoria.
--   - tier_threshold / pct_above_threshold: quando a comissão muda de
--     percentual acima de um valor de preço (ex.: Amazon "Acessórios
--     Eletrônicos" — 15% até R$100, 10% acima). NULL quando a categoria
--     não tem essa regra.
--   - fixed_fee: tarifa fixa adicional por venda, somada à comissão (ex.:
--     Amazon "Mídia" cobra R$2,00 fixo além da comissão percentual,
--     plano Individual). 0 quando não há tarifa fixa.
--   - min_fee: comissão mínima aplicável (ex.: Amazon cobra no mínimo
--     R$1,00 de comissão, mesmo que o percentual calculado dê menos).
--   - note: observações livres (ex.: condições do plano de vendas,
--     exceções) — mostradas no painel admin e, quando relevante, no
--     cartão de resultado.

create table public.marketplace_rates (
  id uuid primary key default gen_random_uuid(),
  marketplace text not null,
  category_label text not null,
  pct numeric not null,
  tier_threshold numeric,
  pct_above_threshold numeric,
  fixed_fee numeric not null default 0,
  min_fee numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create index marketplace_rates_marketplace_idx on public.marketplace_rates (marketplace, category_label);

alter table public.marketplace_rates enable row level security;

-- service_role (usado por api/marketplace-rates.js) ignora RLS. Esta
-- policy só existe pra deixar o caminho aberto caso algo no futuro leia
-- direto do Supabase — hoje ninguém lê, tudo passa pelo backend.
create policy "Authenticated users can view marketplace rates"
  on public.marketplace_rates for select
  using (auth.role() = 'authenticated');
