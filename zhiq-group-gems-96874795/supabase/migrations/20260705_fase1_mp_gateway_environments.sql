-- ============================================================================
-- FASE 1 — Arquitetura Mercado Pago: ambientes Sandbox e Produção
-- ============================================================================
-- ADITIVA: não altera nenhuma tabela/função existente. O fluxo atual
-- (payment_gateways + edge functions) continua funcionando exatamente igual
-- enquanto as edge functions não forem republicadas — o resolver novo faz
-- fallback para payment_gateways quando estas tabelas estiverem vazias.
--
-- Modelo:
--   mp_gateway_config        → singleton: qual ambiente está ATIVO (sandbox/production)
--   mp_gateway_environments  → 1 linha por ambiente: webhook_url (não-secreto)
--   mp_gateway_credentials   → 7 campos por ambiente; o VALOR fica no Supabase
--                              Vault (criptografado); aqui só referência + máscara
--   mp_gateway_audit_log     → toda alteração/teste registrado
--
-- Segurança:
--   - escrita SOMENTE via RPCs SECURITY DEFINER com guarda de admin
--   - leitura de plaintext SOMENTE via mp_get_gateway_credentials (service_role)
--   - frontend nunca vê o valor completo (apenas máscara ••••XXXX)
--
-- Rodar via SQL Editor no projeto broifhfqmnzqoongtokm.
-- ============================================================================

-- 0. Vault (criptografia em repouso). Nos projetos hospedados já vem habilitado.
do $$
begin
  begin
    create extension if not exists supabase_vault;
  exception when others then
    raise notice 'supabase_vault: %', sqlerrm;
  end;
  if to_regclass('vault.secrets') is null then
    raise exception 'Supabase Vault indisponível neste banco — habilite a extensão supabase_vault antes de continuar.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Tabelas
-- ----------------------------------------------------------------------------

create table if not exists public.mp_gateway_config (
  id boolean primary key default true check (id), -- singleton
  active_environment public.payment_gateway_mode not null default 'sandbox',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.mp_gateway_environments (
  environment public.payment_gateway_mode primary key,
  webhook_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.mp_gateway_credentials (
  environment public.payment_gateway_mode not null,
  field_name text not null check (field_name in (
    'public_key','access_token','client_id','client_secret',
    'webhook_secret','user_id','application_id'
  )),
  secret_id uuid not null,          -- vault.secrets.id (valor criptografado)
  masked_preview text not null,     -- ••••XXXX — nunca o valor completo
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (environment, field_name)
);

create table if not exists public.mp_gateway_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,             -- set_credential | clear_credential | set_webhook_url | switch_environment | connection_test
  environment text,
  field_name text,
  masked_value text,
  success boolean not null default true,
  details jsonb not null default '{}'::jsonb
);

-- seed das duas linhas de ambiente + singleton
insert into public.mp_gateway_config (id) values (true) on conflict do nothing;
insert into public.mp_gateway_environments (environment)
values ('sandbox'), ('production')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. Guarda de admin (delegando para is_platform_admin quando existir)
-- ----------------------------------------------------------------------------

create or replace function public.mp_is_admin()
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean := false;
begin
  if v_uid is null then
    return false;
  end if;
  begin
    return public.is_platform_admin();
  exception when undefined_function then
    null;
  end;
  begin
    select true into v_ok
    from public.user_roles
    where user_id = v_uid and role::text = 'admin'
    limit 1;
  exception when others then
    v_ok := false;
  end;
  return coalesce(v_ok, false);
end $$;

grant execute on function public.mp_is_admin() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. RLS: leitura admin-only; escrita só via RPCs (nenhuma policy de escrita)
-- ----------------------------------------------------------------------------

alter table public.mp_gateway_config enable row level security;
alter table public.mp_gateway_environments enable row level security;
alter table public.mp_gateway_credentials enable row level security;
alter table public.mp_gateway_audit_log enable row level security;

drop policy if exists mp_gateway_config_admin_read on public.mp_gateway_config;
create policy mp_gateway_config_admin_read
  on public.mp_gateway_config for select
  using (public.mp_is_admin());

drop policy if exists mp_gateway_environments_admin_read on public.mp_gateway_environments;
create policy mp_gateway_environments_admin_read
  on public.mp_gateway_environments for select
  using (public.mp_is_admin());

drop policy if exists mp_gateway_credentials_admin_read on public.mp_gateway_credentials;
create policy mp_gateway_credentials_admin_read
  on public.mp_gateway_credentials for select
  using (public.mp_is_admin());

drop policy if exists mp_gateway_audit_admin_read on public.mp_gateway_audit_log;
create policy mp_gateway_audit_admin_read
  on public.mp_gateway_audit_log for select
  using (public.mp_is_admin());

-- ----------------------------------------------------------------------------
-- 4. Helpers internos
-- ----------------------------------------------------------------------------

create or replace function public.mp_mask(p_value text)
returns text
language sql immutable
as $$
  select case
    when p_value is null or length(p_value) = 0 then ''
    when length(p_value) <= 8 then '••••••••'
    else '••••' || right(p_value, 4)
  end
$$;

create or replace function public.mp_audit(
  p_action text,
  p_environment text,
  p_field text,
  p_masked text,
  p_success boolean default true,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  insert into public.mp_gateway_audit_log
    (actor_id, actor_email, action, environment, field_name, masked_value, success, details)
  values
    (auth.uid(), v_email, p_action, p_environment, p_field, p_masked, p_success, coalesce(p_details, '{}'::jsonb));
end $$;

revoke all on function public.mp_audit(text, text, text, text, boolean, jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPCs de escrita (admin)
-- ----------------------------------------------------------------------------

-- Grava/atualiza UMA credencial de UM ambiente. Valor vazio/null = remover.
create or replace function public.mp_set_credential(
  p_environment text,
  p_field text,
  p_value text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_env public.payment_gateway_mode;
  v_secret_id uuid;
  v_name text;
  v_masked text;
begin
  if not public.mp_is_admin() then
    raise exception 'Acesso negado: apenas administradores';
  end if;
  v_env := p_environment::public.payment_gateway_mode;
  if p_field not in ('public_key','access_token','client_id','client_secret',
                     'webhook_secret','user_id','application_id') then
    raise exception 'Campo inválido: %', p_field;
  end if;

  v_name := format('mp_%s_%s', v_env, p_field);

  -- remoção
  if p_value is null or length(trim(p_value)) = 0 then
    select secret_id into v_secret_id
    from public.mp_gateway_credentials
    where environment = v_env and field_name = p_field;
    if v_secret_id is not null then
      delete from vault.secrets where id = v_secret_id;
      delete from public.mp_gateway_credentials
      where environment = v_env and field_name = p_field;
      perform public.mp_audit('clear_credential', v_env::text, p_field, null);
    end if;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;

  p_value := trim(p_value);
  v_masked := public.mp_mask(p_value);

  select secret_id into v_secret_id
  from public.mp_gateway_credentials
  where environment = v_env and field_name = p_field;

  if v_secret_id is not null and exists (select 1 from vault.secrets where id = v_secret_id) then
    perform vault.update_secret(v_secret_id, p_value);
  else
    -- pode existir um secret órfão com o mesmo nome (linha apagada) → reaproveita
    select id into v_secret_id from vault.secrets where name = v_name;
    if v_secret_id is not null then
      perform vault.update_secret(v_secret_id, p_value);
    else
      v_secret_id := vault.create_secret(p_value, v_name);
    end if;
  end if;

  insert into public.mp_gateway_credentials
    (environment, field_name, secret_id, masked_preview, updated_at, updated_by)
  values
    (v_env, p_field, v_secret_id, v_masked, now(), auth.uid())
  on conflict (environment, field_name) do update
    set secret_id = excluded.secret_id,
        masked_preview = excluded.masked_preview,
        updated_at = now(),
        updated_by = auth.uid();

  perform public.mp_audit('set_credential', v_env::text, p_field, v_masked);
  return jsonb_build_object('ok', true, 'masked', v_masked);
end $$;

grant execute on function public.mp_set_credential(text, text, text) to authenticated, service_role;

-- Webhook URL do ambiente (não é secreto).
create or replace function public.mp_set_webhook_url(
  p_environment text,
  p_url text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_env public.payment_gateway_mode;
begin
  if not public.mp_is_admin() then
    raise exception 'Acesso negado: apenas administradores';
  end if;
  v_env := p_environment::public.payment_gateway_mode;
  insert into public.mp_gateway_environments (environment, webhook_url, updated_at, updated_by)
  values (v_env, nullif(trim(coalesce(p_url, '')), ''), now(), auth.uid())
  on conflict (environment) do update
    set webhook_url = excluded.webhook_url,
        updated_at = now(),
        updated_by = auth.uid();
  perform public.mp_audit('set_webhook_url', v_env::text, 'webhook_url', p_url);
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.mp_set_webhook_url(text, text) to authenticated, service_role;

-- Alterna o ambiente ativo da plataforma (Sandbox ⇄ Produção).
-- NÃO toca em payment_gateways: o legado continua com o comportamento atual
-- até as edge functions serem republicadas com o resolver novo.
create or replace function public.mp_set_active_environment(
  p_environment text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_env public.payment_gateway_mode;
  v_prev public.payment_gateway_mode;
begin
  if not public.mp_is_admin() then
    raise exception 'Acesso negado: apenas administradores';
  end if;
  v_env := p_environment::public.payment_gateway_mode;
  select active_environment into v_prev from public.mp_gateway_config where id = true;
  update public.mp_gateway_config
    set active_environment = v_env, updated_at = now(), updated_by = auth.uid()
  where id = true;
  perform public.mp_audit(
    'switch_environment', v_env::text, null, null, true,
    jsonb_build_object('from', v_prev::text, 'to', v_env::text)
  );
  return jsonb_build_object('ok', true, 'active_environment', v_env::text);
end $$;

grant execute on function public.mp_set_active_environment(text) to authenticated, service_role;

-- Registro de teste de conexão (chamada pela edge function payments-gateway-test).
create or replace function public.mp_log_connection_test(
  p_environment text,
  p_success boolean,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mp_audit('connection_test', p_environment, null, null, p_success, p_details);
end $$;

revoke all on function public.mp_log_connection_test(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.mp_log_connection_test(text, boolean, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 6. RPCs de leitura
-- ----------------------------------------------------------------------------

-- Visão do painel admin: ambiente ativo + máscaras (NUNCA plaintext).
create or replace function public.mp_get_admin_overview()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_active text;
  v_envs jsonb;
begin
  if not public.mp_is_admin() then
    raise exception 'Acesso negado: apenas administradores';
  end if;
  select active_environment::text into v_active from public.mp_gateway_config where id = true;
  select coalesce(jsonb_object_agg(e.environment::text, jsonb_build_object(
      'webhook_url', e.webhook_url,
      'updated_at', e.updated_at,
      'fields', coalesce((
        select jsonb_object_agg(c.field_name, jsonb_build_object(
          'masked', c.masked_preview,
          'updated_at', c.updated_at
        ))
        from public.mp_gateway_credentials c
        where c.environment = e.environment
      ), '{}'::jsonb)
    )), '{}'::jsonb)
  into v_envs
  from public.mp_gateway_environments e;
  return jsonb_build_object(
    'active_environment', coalesce(v_active, 'sandbox'),
    'environments', v_envs
  );
end $$;

grant execute on function public.mp_get_admin_overview() to authenticated, service_role;

-- Config pública de checkout: só ambiente + public key (que é pública por natureza).
create or replace function public.mp_get_checkout_public_config()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_env public.payment_gateway_mode;
  v_pk text;
begin
  select active_environment into v_env from public.mp_gateway_config where id = true;
  v_env := coalesce(v_env, 'sandbox');
  select vs.decrypted_secret into v_pk
  from public.mp_gateway_credentials c
  join vault.decrypted_secrets vs on vs.id = c.secret_id
  where c.environment = v_env and c.field_name = 'public_key';
  return jsonb_build_object(
    'environment', v_env::text,
    'public_key', v_pk
  );
end $$;

grant execute on function public.mp_get_checkout_public_config() to anon, authenticated, service_role;

-- Credenciais PLAINTEXT — EXCLUSIVO service_role (edge functions).
create or replace function public.mp_get_gateway_credentials(
  p_environment text default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_env public.payment_gateway_mode;
  v_creds jsonb;
  v_webhook text;
begin
  if p_environment is not null then
    v_env := p_environment::public.payment_gateway_mode;
  else
    select active_environment into v_env from public.mp_gateway_config where id = true;
    v_env := coalesce(v_env, 'sandbox');
  end if;

  select coalesce(jsonb_object_agg(c.field_name, vs.decrypted_secret), '{}'::jsonb)
  into v_creds
  from public.mp_gateway_credentials c
  join vault.decrypted_secrets vs on vs.id = c.secret_id
  where c.environment = v_env;

  select webhook_url into v_webhook
  from public.mp_gateway_environments
  where environment = v_env;

  return jsonb_build_object(
    'configured', (v_creds ? 'access_token'),
    'environment', v_env::text,
    'webhook_url', v_webhook,
    'credentials', v_creds
  );
end $$;

revoke all on function public.mp_get_gateway_credentials(text) from public, anon, authenticated;
grant execute on function public.mp_get_gateway_credentials(text) to service_role;

-- ----------------------------------------------------------------------------
-- 7. Comentários
-- ----------------------------------------------------------------------------
comment on table public.mp_gateway_config is
  'FASE 1 — singleton: ambiente Mercado Pago ativo da plataforma (sandbox/production).';
comment on table public.mp_gateway_credentials is
  'FASE 1 — credenciais MP por ambiente. Valores no Supabase Vault (criptografados); aqui só referência + máscara.';
comment on table public.mp_gateway_audit_log is
  'FASE 1 — auditoria de toda alteração de configuração MP e testes de conexão.';
