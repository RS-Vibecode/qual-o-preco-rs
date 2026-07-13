-- Rode isto uma vez no SQL Editor do Supabase, depois de
-- supabase-schema.sql — adiciona os campos de perfil (foto, cargo,
-- telefone) que faltavam na tabela original.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists position text,
  add column if not exists photo_url text;
