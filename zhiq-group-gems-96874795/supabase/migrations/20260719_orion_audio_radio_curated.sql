-- ORION-AUDIO — Catalogo compartilhado de radios CURADO (Discovery Engine Fase 2).
-- Leitura PUBLICA (radio e para todos); escrita so admin via RPC DEFINER.
-- Peso: so metadados/URLs (sem audio, sem imagem). Idempotente.

create table if not exists public.orion_audio_radio_curated (
  id uuid primary key default gen_random_uuid(),
  station_uuid text unique not null,
  name text not null,
  stream_url text not null,
  homepage text default '',
  favicon text default '',
  city text default '',
  state text default '',
  country text default 'Brasil',
  countrycode text default 'BR',
  tags text default '',
  category text default '',
  frequency text default '',
  language text default 'portuguese',
  bitrate int default 0,
  geo_lat double precision,
  geo_long double precision,
  ativo boolean default true,
  fonte text default 'curado',
  criado_por uuid,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);
create index if not exists idx_orion_audio_curated_ativo on public.orion_audio_radio_curated(ativo);

alter table public.orion_audio_radio_curated enable row level security;
drop policy if exists curated_public_read on public.orion_audio_radio_curated;
create policy curated_public_read on public.orion_audio_radio_curated for select using (ativo = true);

revoke all on public.orion_audio_radio_curated from public, anon, authenticated;
grant select on public.orion_audio_radio_curated to anon, authenticated;

-- BUSCA PUBLICA (mesclada no front com o radio-browser)
create or replace function public.audio_radio_curated_search(p_term text default '', p_limit int default 40)
returns setof jsonb language sql stable security definer set search_path = public as $fn$
  select to_jsonb(t) from (
    select
      station_uuid as stationuuid, name,
      stream_url as url, stream_url as url_resolved,
      homepage, favicon, tags, country, countrycode, state,
      language, ''::text as codec, bitrate, 0 as votes, 0 as clickcount,
      geo_lat, geo_long, frequency, category, true as curated
    from public.orion_audio_radio_curated
    where ativo = true and (
      coalesce(p_term,'') = '' or name ilike '%'||p_term||'%' or city ilike '%'||p_term||'%'
      or state ilike '%'||p_term||'%' or tags ilike '%'||p_term||'%'
      or frequency ilike '%'||p_term||'%' or category ilike '%'||p_term||'%'
    )
    order by name
    limit greatest(1, least(coalesce(p_limit,40), 100))
  ) t;
$fn$;
revoke execute on function public.audio_radio_curated_search(text,int) from public;
grant execute on function public.audio_radio_curated_search(text,int) to anon, authenticated;

-- ADMIN: lista completa (inclui inativas)
create or replace function public.audio_radio_curated_admin_list(p_limit int default 300)
returns setof public.orion_audio_radio_curated language sql stable security definer set search_path = public as $fn$
  select * from public.orion_audio_radio_curated
  where public.mp_is_admin()
  order by atualizado_em desc
  limit greatest(1, least(coalesce(p_limit,300), 1000));
$fn$;
revoke execute on function public.audio_radio_curated_admin_list(int) from public, anon;
grant execute on function public.audio_radio_curated_admin_list(int) to authenticated;

-- ADMIN: upsert (add/editar)
create or replace function public.audio_radio_curated_upsert(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_row public.orion_audio_radio_curated; v_uuid text;
begin
  if not public.mp_is_admin() then raise exception 'apenas admin'; end if;
  if coalesce(nullif(p->>'name',''),'') = '' then raise exception 'nome obrigatorio'; end if;
  if coalesce(nullif(p->>'stream_url',''),'') = '' then raise exception 'stream_url obrigatorio'; end if;
  v_uuid := coalesce(nullif(p->>'station_uuid',''), 'curated:'||gen_random_uuid()::text);
  insert into public.orion_audio_radio_curated as c
    (station_uuid, name, stream_url, homepage, favicon, city, state, country, countrycode,
     tags, category, frequency, language, bitrate, geo_lat, geo_long, ativo, fonte, criado_por)
  values (
    v_uuid, p->>'name', p->>'stream_url',
    coalesce(p->>'homepage',''), coalesce(p->>'favicon',''),
    coalesce(p->>'city',''), coalesce(p->>'state',''),
    coalesce(nullif(p->>'country',''),'Brasil'), coalesce(nullif(p->>'countrycode',''),'BR'),
    coalesce(p->>'tags',''), coalesce(p->>'category',''), coalesce(p->>'frequency',''),
    coalesce(nullif(p->>'language',''),'portuguese'), coalesce((p->>'bitrate')::int,0),
    (p->>'geo_lat')::double precision, (p->>'geo_long')::double precision,
    coalesce((p->>'ativo')::boolean, true), coalesce(nullif(p->>'fonte',''),'curado'), auth.uid()
  )
  on conflict (station_uuid) do update set
    name=excluded.name, stream_url=excluded.stream_url, homepage=excluded.homepage,
    favicon=excluded.favicon, city=excluded.city, state=excluded.state, country=excluded.country,
    countrycode=excluded.countrycode, tags=excluded.tags, category=excluded.category,
    frequency=excluded.frequency, language=excluded.language, bitrate=excluded.bitrate,
    geo_lat=excluded.geo_lat, geo_long=excluded.geo_long, ativo=excluded.ativo, atualizado_em=now()
  returning c.* into v_row;
  return to_jsonb(v_row);
end $fn$;
revoke execute on function public.audio_radio_curated_upsert(jsonb) from public, anon;
grant execute on function public.audio_radio_curated_upsert(jsonb) to authenticated;

-- ADMIN: ativar/desativar e remover
create or replace function public.audio_radio_curated_set_active(p_station_uuid text, p_ativo boolean)
returns boolean language plpgsql security definer set search_path = public as $fn$
begin
  if not public.mp_is_admin() then raise exception 'apenas admin'; end if;
  update public.orion_audio_radio_curated set ativo=p_ativo, atualizado_em=now() where station_uuid=p_station_uuid;
  return true;
end $fn$;
revoke execute on function public.audio_radio_curated_set_active(text,boolean) from public, anon;
grant execute on function public.audio_radio_curated_set_active(text,boolean) to authenticated;

create or replace function public.audio_radio_curated_delete(p_station_uuid text)
returns boolean language plpgsql security definer set search_path = public as $fn$
begin
  if not public.mp_is_admin() then raise exception 'apenas admin'; end if;
  delete from public.orion_audio_radio_curated where station_uuid=p_station_uuid;
  return true;
end $fn$;
revoke execute on function public.audio_radio_curated_delete(text) from public, anon;
grant execute on function public.audio_radio_curated_delete(text) to authenticated;

-- VERIFICACAO
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name='orion_audio_radio_curated') tabela,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'audio_radio_curated%') rpcs,
  (select count(*) from pg_policies where schemaname='public' and tablename='orion_audio_radio_curated') policies,
  has_function_privilege('anon','public.audio_radio_curated_search(text,int)','execute') anon_busca_true,
  has_function_privilege('anon','public.audio_radio_curated_upsert(jsonb)','execute') anon_upsert_false;
