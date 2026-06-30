-- Migration: Painel de Configuração da IA
-- Execute no Supabase Dashboard → SQL Editor

-- ── Tabela de configuração (singleton) ───────────────────────────────────────
create table if not exists ai_platform_config (
  singleton    boolean primary key default true,
  constraint   ai_config_only_one check (singleton = true),

  provider     text    not null default 'openai',
  model        text    not null default 'gpt-4o-mini',
  base_url     text    not null default 'https://api.openai.com/v1',
  temperature  numeric(3,2) not null default 0.7  check (temperature  >= 0    and temperature  <= 2),
  max_tokens   integer      not null default 1024  check (max_tokens   >= 64   and max_tokens   <= 128000),
  notes        text,

  updated_at   timestamptz  not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

-- ── Linha padrão ─────────────────────────────────────────────────────────────
insert into ai_platform_config default values on conflict (singleton) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table ai_platform_config enable row level security;

-- Qualquer usuário autenticado lê (config não contém chaves de API)
create policy "ai_config_select"
  on ai_platform_config for select
  to authenticated
  using (true);

-- Apenas service_role escreve (edge functions) ou através do RPC abaixo
create policy "ai_config_service_write"
  on ai_platform_config for all
  to service_role
  using (true)
  with check (true);

-- ── RPC segura para o frontend (valida admin pelo JWT) ────────────────────────
create or replace function update_ai_platform_config(
  p_provider    text,
  p_model       text,
  p_base_url    text,
  p_temperature numeric,
  p_max_tokens  integer,
  p_notes       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Verifica se o usuário tem permissão de admin
  if not exists (
    select 1 from profiles
    where id = auth.uid()
    and (role = 'admin' or is_admin = true)
  ) then
    -- fallback: aceita se é a primeira linha e usuário está autenticado
    -- (ajuste conforme o campo de admin real do seu projeto)
    raise exception 'Permissão negada: apenas administradores podem alterar as configurações de IA.';
  end if;

  update ai_platform_config set
    provider    = p_provider,
    model       = p_model,
    base_url    = p_base_url,
    temperature = p_temperature,
    max_tokens  = p_max_tokens,
    notes       = p_notes,
    updated_at  = now(),
    updated_by  = auth.uid()
  where singleton = true;
end;
$$;
