-- Rode isto uma vez no SQL Editor do Supabase (painel do projeto).
-- Cria a tabela de perfis (admin/cliente) e a linha correspondente é
-- criada automaticamente sempre que uma conta nova é criada (pelo painel
-- admin, ou pelo script scripts/create-first-admin.js).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'client' check (role in ('admin', 'client')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'role', 'client')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- service_role (usado por todas as chamadas do backend) ignora RLS.
-- Esta policy só existe para o futuro, caso algo passe a ler direto.
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);
