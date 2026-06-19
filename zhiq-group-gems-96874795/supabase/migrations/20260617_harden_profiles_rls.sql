-- ═══════════════════════════════════════════════════════════════════════════
-- Endurecimento da RLS de `profiles` (CVE: vazamento de PII pública)
--
-- PROBLEMA:
--   As migrations 20260312002000 e 20260328_fix_admin_real_estate_rls criaram
--   policies `FOR SELECT USING (true)` para `anon, authenticated` na tabela
--   `profiles`. A intenção era permitir leitura pública de DADOS DE LOJISTAS,
--   mas a policy não filtra colunas nem rows → expõe TODOS os campos de TODOS
--   os usuários (e-mail, telefone, is_admin, etc.) para qualquer pessoa,
--   inclusive anônima.
--
-- CORREÇÃO:
--   1. Dropa as policies permissivas demais.
--   2. Cria a VIEW `public_store_profiles` expondo APENAS colunas públicas e
--      seguras de perfis vinculados a uma loja (merchant_stores).
--   3. Garante leitura do PRÓPRIO perfil (self) para usuários autenticados.
--   4. Garante leitura completa para admins (via user_roles OU is_admin).
--   5. O frontend deve migrar para a view para dados públicos de lojista.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Remove policies excessivamente permissivas.
drop policy if exists "Leitura publica de perfis" on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;

-- 2. Leitura do PRÓPRIO perfil (cada usuário vê os dados dele).
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- 3. Admins continuam enxergando todos os perfis (necessário para painel).
--    Usa SÓ user_roles (fonte canônica). NUNCA reconsultar profiles aqui —
--    isso causa "infinite recursion detected in policy for relation profiles"
--    (a policy de profiles consultando a própria profiles dispara ela mesma).
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() in (select user_id from public.user_roles where role = 'admin')
  );

-- 4. Cria a VIEW pública de perfis de lojista (somente dados públicos).
--    Existe somente para perfis que têm merchant_stores vinculado (lojistas).
--    Não expõe e-mail nem is_admin (sensíveis). telefone/whatsapp são do
--    contato comercial do lojista (necessário para clientes).
create or replace view public.public_store_profiles as
select
  p.id,
  p.name,
  p.nome_loja,
  p.name as display_name,
  p.logo_url,
  p.cidade,
  p.estado,
  p.bairro,
  p.rua,
  p.cep,
  p.numero,
  p.categoria,
  p.telefone,
  p.whatsapp,
  ms.id as merchant_store_id
from public.profiles p
join public.merchant_stores ms on ms.user_id = p.id
where coalesce(p.is_active, true) = true;

grant select on public.public_store_profiles to anon, authenticated;

-- 5. Comment para orientar migrations futuras.
comment on view public.public_store_profiles is
'Dados PÚBLICOS de lojistas (join com merchant_stores). NUNCA adicionar email/is_admin aqui. telefone/whatsapp são contato comercial.';

select pg_notify('pgrst', 'reload schema');
