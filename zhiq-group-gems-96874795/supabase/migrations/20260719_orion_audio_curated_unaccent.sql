-- Normaliza texto: minúsculas + sem acento (sem depender de extensão unaccent)
create or replace function public._audio_norm(t text) returns text
language sql immutable set search_path = public as $fn$
  select translate(lower(coalesce(t,'')),
    'áàâãäéèêëíìîïóòôõöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc');
$fn$;

-- Busca do catálogo agora IGNORA acento e maiúscula
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
      coalesce(p_term,'') = ''
      or public._audio_norm(name)      like '%'||public._audio_norm(p_term)||'%'
      or public._audio_norm(city)      like '%'||public._audio_norm(p_term)||'%'
      or public._audio_norm(state)     like '%'||public._audio_norm(p_term)||'%'
      or public._audio_norm(tags)      like '%'||public._audio_norm(p_term)||'%'
      or public._audio_norm(frequency) like '%'||public._audio_norm(p_term)||'%'
      or public._audio_norm(category)  like '%'||public._audio_norm(p_term)||'%'
    )
    order by name
    limit greatest(1, least(coalesce(p_limit,40), 100))
  ) t;
$fn$;
revoke execute on function public.audio_radio_curated_search(text,int) from public;
grant execute on function public.audio_radio_curated_search(text,int) to anon, authenticated;

-- verificação: agora com e sem acento devem bater
select
  (select count(*) from (select public.audio_radio_curated_search('comunitaria',40)) a) sem_acento,
  (select count(*) from (select public.audio_radio_curated_search('comunitária',40)) b) com_acento,
  (select count(*) from (select public.audio_radio_curated_search('COMUNITÁRIA',40)) c) maiuscula_acento;
