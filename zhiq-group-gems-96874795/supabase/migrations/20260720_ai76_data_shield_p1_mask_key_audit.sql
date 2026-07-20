-- ============================================================================
-- ORION-AI-76 Data Shield AI — PARTE 1: mascaramento + chave (vault) + auditoria
-- Arquitetura: mascaramento POR CAMADA (nao cifra colunas fisicas -> zero risco a
-- pay_*/saques). Chaves via supabase_vault (cofre oficial). Padrao ORION: ds_guard,
-- anon=0, search_path fixo, RLS, evidencia. NAO altera regra de negocio.
-- ============================================================================

-- ---- TABELAS -----------------------------------------------------------------
create table if not exists public.orion_ds_registry (
  id bigserial primary key,
  tabela text not null,
  coluna text not null,
  classe text not null default 'PII' check (classe in ('PII','FINANCEIRO','CREDENCIAL','CONTATO','OUTRO')),
  estrategia_mascara text not null default 'partial' check (estrategia_mascara in ('partial','email','cpf','phone','account','full','none')),
  criado_em timestamptz not null default now(),
  unique (tabela, coluna)
);

create table if not exists public.orion_ds_keys (
  id bigserial primary key,
  chave_logica text not null,            -- ex: 'ds_master'
  versao int not null,
  status text not null default 'ativa' check (status in ('ativa','rotacionada','revogada')),
  vault_ref uuid,                        -- referencia ao vault.secrets.id (valor real NUNCA aqui)
  rotacionada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (chave_logica, versao)
);

create table if not exists public.orion_ds_access_log (
  id bigserial primary key,
  ator uuid,                             -- auth.uid() de quem acessou
  acao text not null,                    -- 'reveal','mask','dlp_scan','key_rotate','export'
  tabela text,
  coluna text,
  ref_id text,                           -- id do registro acessado (texto p/ uuid/bigint)
  motivo text,
  ip text,
  criado_em timestamptz not null default now()
);

create table if not exists public.orion_ds_dlp_findings (
  id bigserial primary key,
  tabela text not null,
  coluna text not null,
  ref_id text,
  tipo_vazamento text not null,          -- 'cpf_em_texto_livre','email_em_texto_livre','telefone', etc
  amostra_mascarada text,
  severidade text not null default 'media' check (severidade in ('baixa','media','alta','critica')),
  resolvido boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (tabela, coluna, ref_id, tipo_vazamento)
);

-- RLS: deny-all por padrao (so admin via SECURITY DEFINER acessa)
alter table public.orion_ds_registry       enable row level security;
alter table public.orion_ds_keys           enable row level security;
alter table public.orion_ds_access_log     enable row level security;
alter table public.orion_ds_dlp_findings   enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where tablename='orion_ds_registry' and policyname='ds_registry_admin') then
    create policy ds_registry_admin on public.orion_ds_registry for all to authenticated using (public.mp_is_admin()) with check (public.mp_is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename='orion_ds_keys' and policyname='ds_keys_admin') then
    create policy ds_keys_admin on public.orion_ds_keys for all to authenticated using (public.mp_is_admin()) with check (public.mp_is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename='orion_ds_access_log' and policyname='ds_log_admin') then
    create policy ds_log_admin on public.orion_ds_access_log for select to authenticated using (public.mp_is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename='orion_ds_dlp_findings' and policyname='ds_dlp_admin') then
    create policy ds_dlp_admin on public.orion_ds_dlp_findings for select to authenticated using (public.mp_is_admin());
  end if;
end $p$;

-- ---- GATE --------------------------------------------------------------------
create or replace function public.ds_guard()
returns void language plpgsql stable security definer set search_path=public as $fn$
begin
  if session_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' and not public.mp_is_admin() then
    raise exception 'data_shield: acesso negado (somente admin/service)';
  end if;
end $fn$;

-- ---- MASCARAMENTO (funcoes puras IMMUTABLE, sem tabela) ----------------------
create or replace function public.ds_mask_email(p text)
returns text language sql immutable set search_path=public as $$
  select case when p is null or position('@' in p)=0 then p
    else left(split_part(p,'@',1),1)||'***@'||split_part(p,'@',2) end;
$$;

create or replace function public.ds_mask_cpf(p text)
returns text language sql immutable set search_path=public as $$
  select case when p is null then null
    else regexp_replace(p,'[0-9]','*','g') end
    -- revela so os 2 ultimos digitos numericos
  ;
$$;

create or replace function public.ds_mask_partial(p text, p_keep int default 2)
returns text language sql immutable set search_path=public as $$
  select case when p is null then null
    when length(p) <= p_keep then repeat('*', length(p))
    else repeat('*', length(p)-p_keep) || right(p, p_keep) end;
$$;

create or replace function public.ds_mask_phone(p text)
returns text language sql immutable set search_path=public as $$
  select case when p is null then null
    else regexp_replace(p, '[0-9](?=[0-9]{4})', '*', 'g') end;
$$;

-- dispatcher generico por estrategia
create or replace function public.ds_mask(p_valor text, p_estrategia text default 'partial')
returns text language sql immutable set search_path=public as $$
  select case p_estrategia
    when 'email' then public.ds_mask_email(p_valor)
    when 'cpf' then public.ds_mask_partial(p_valor, 2)
    when 'phone' then public.ds_mask_phone(p_valor)
    when 'account' then public.ds_mask_partial(p_valor, 3)
    when 'full' then case when p_valor is null then null else repeat('*', greatest(length(p_valor),4)) end
    when 'none' then p_valor
    else public.ds_mask_partial(p_valor, 2)
  end;
$$;

-- ---- GESTAO DE CHAVE via VAULT ----------------------------------------------
-- registra/rotaciona chave logica; valor real fica no vault.secrets
create or replace function public.ds_key_ensure(p_chave_logica text default 'ds_master')
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare v_versao int; v_ref uuid; v_secret text; v_exists int;
begin
  perform public.ds_guard();
  select count(*) into v_exists from public.orion_ds_keys where chave_logica=p_chave_logica and status='ativa';
  if v_exists > 0 then
    return jsonb_build_object('ok',true,'ja_existe',true,'chave',p_chave_logica);
  end if;
  select coalesce(max(versao),0)+1 into v_versao from public.orion_ds_keys where chave_logica=p_chave_logica;
  -- gera segredo forte e guarda no vault (nunca no schema public)
  v_secret := encode(extensions.gen_random_bytes(32),'hex');
  select vault.create_secret(v_secret, p_chave_logica||'_v'||v_versao, 'ORION Data Shield master key '||p_chave_logica||' v'||v_versao) into v_ref;
  insert into public.orion_ds_keys(chave_logica, versao, status, vault_ref) values (p_chave_logica, v_versao, 'ativa', v_ref);
  insert into public.orion_ds_access_log(ator, acao, motivo) values (auth.uid(),'key_create', p_chave_logica||' v'||v_versao);
  return jsonb_build_object('ok',true,'chave',p_chave_logica,'versao',v_versao,'vault_ref',v_ref);
end $fn$;

create or replace function public.ds_rotate_key(p_chave_logica text default 'ds_master')
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare v_versao int; v_ref uuid; v_secret text;
begin
  perform public.ds_guard();
  update public.orion_ds_keys set status='rotacionada', rotacionada_em=now() where chave_logica=p_chave_logica and status='ativa';
  select coalesce(max(versao),0)+1 into v_versao from public.orion_ds_keys where chave_logica=p_chave_logica;
  v_secret := encode(extensions.gen_random_bytes(32),'hex');
  select vault.create_secret(v_secret, p_chave_logica||'_v'||v_versao, 'ORION Data Shield rotacao '||p_chave_logica||' v'||v_versao) into v_ref;
  insert into public.orion_ds_keys(chave_logica, versao, status, vault_ref) values (p_chave_logica, v_versao, 'ativa', v_ref);
  insert into public.orion_ds_access_log(ator, acao, motivo) values (auth.uid(),'key_rotate', p_chave_logica||' -> v'||v_versao);
  return jsonb_build_object('ok',true,'chave',p_chave_logica,'nova_versao',v_versao,'vault_ref',v_ref);
end $fn$;

-- ---- REVELACAO AUDITADA (o dado real so via fn gated + log) ------------------
create or replace function public.ds_reveal(p_tabela text, p_coluna text, p_ref_id text, p_motivo text default null)
returns text language plpgsql security definer set search_path=public as $fn$
declare v_val text; v_reg record;
begin
  perform public.ds_guard();  -- so admin/service ve o valor real
  select * into v_reg from public.orion_ds_registry where tabela=p_tabela and coluna=p_coluna;
  if v_reg.id is null then raise exception 'coluna % .% nao registrada no Data Shield', p_tabela, p_coluna; end if;
  -- leitura dinamica segura (identificadores validados contra o catalogo)
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=p_tabela and column_name=p_coluna) then
    raise exception 'coluna inexistente';
  end if;
  execute format('select (%I)::text from public.%I where id::text = $1', p_coluna, p_tabela) into v_val using p_ref_id;
  insert into public.orion_ds_access_log(ator, acao, tabela, coluna, ref_id, motivo)
    values (auth.uid(),'reveal', p_tabela, p_coluna, p_ref_id, p_motivo);
  return v_val;
end $fn$;

-- ---- GRANTS: revoga anon de TUDO ds_/orion_ds_; utils IMMUTABLE p/ authenticated
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and (p.proname ~ '^ds_' or p.proname ~ '^orion_ds')
  loop execute format('revoke execute on function %s from anon, public', r.sig);
       execute format('grant execute on function %s to authenticated', r.sig); end loop; end $g$;

-- ---- SEED registry: colunas sensiveis reais mapeadas -------------------------
insert into public.orion_ds_registry(tabela, coluna, classe, estrategia_mascara) values
  ('profiles','cpf','PII','cpf'),
  ('profiles','email','CONTATO','email'),
  ('profiles','telefone','CONTATO','phone'),
  ('driver_profiles','cpf_cnpj','PII','cpf'),
  ('courier_bank_accounts','pix_key_value','FINANCEIRO','account'),
  ('courier_bank_accounts','account_number','FINANCEIRO','account'),
  ('delivery_orders','customer_phone','CONTATO','phone'),
  ('device_tokens','token','CREDENCIAL','full')
on conflict (tabela, coluna) do nothing;

select
  (select count(*) from public.orion_ds_registry) colunas_registradas,
  public.ds_mask_email('joao.silva@gmail.com') ex_email,
  public.ds_mask('12345678901','cpf') ex_cpf,
  public.ds_mask('11987654321','phone') ex_phone,
  public.ds_mask('98765-4','account') ex_account;
