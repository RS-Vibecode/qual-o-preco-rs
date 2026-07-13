-- Rode isto uma vez no SQL Editor do Supabase — corrige uma falha de
-- segurança: o gatilho antigo confiava no campo "role" enviado pelo
-- PRÓPRIO usuário no cadastro (raw_user_meta_data), então qualquer
-- pessoa que chamasse o cadastro público do Supabase diretamente (sem
-- passar pelo nosso painel admin) podia se criar como administrador.
--
-- A partir de agora, o gatilho SEMPRE cria a conta como 'client' — só o
-- backend (service_role, em api/admin/create-user.js) pode promover
-- alguém a admin, com uma segunda chamada depois da criação.

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
    'client' -- nunca confia em new.raw_user_meta_data ->> 'role'
  );
  return new;
end;
$$;
