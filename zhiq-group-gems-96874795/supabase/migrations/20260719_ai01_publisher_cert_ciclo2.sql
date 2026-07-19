-- ORION-AI-01 Publisher · CORRECOES CICLO 2 (evidencia antes/depois no chat)

-- P-SEC1: barramento de eventos nao deve ser executavel por anon
do $g$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='orion_eventos_recentes' loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop; end $g$;

-- P-PERF1: indices para a fila do painel (ordena por processado_em desc)
create index if not exists idx_orion_pub_proc        on public.orion_publisher_log (processado_em desc);
create index if not exists idx_orion_pub_status_proc on public.orion_publisher_log (status, processado_em desc);

-- P-PERF2: indices trgm p/ deteccao de duplicidade escalavel (title+description)
create index if not exists idx_trgm_advertiser  on public.advertiser_listings  using gin ((coalesce(title,'')||' '||coalesce(description,'')) gin_trgm_ops);
create index if not exists idx_trgm_realestate  on public.real_estate_listings using gin ((coalesce(title,'')||' '||coalesce(description,'')) gin_trgm_ops);
create index if not exists idx_trgm_vehicle     on public.vehicle_listings     using gin ((coalesce(title,'')||' '||coalesce(description,'')) gin_trgm_ops);
create index if not exists idx_trgm_service     on public.service_listings     using gin ((coalesce(title,'')||' '||coalesce(description,'')) gin_trgm_ops);
create index if not exists idx_trgm_freight     on public.freight_listings     using gin ((coalesce(title,'')||' '||coalesce(description,'')) gin_trgm_ops);
create index if not exists idx_trgm_travel      on public.travel_listings      using gin ((coalesce(title,'')||' '||coalesce(description,'')) gin_trgm_ops);

-- P-PERF2: validar com similaridade INDEX-ASSISTED (prefiltro %). Mesma decisao/validacao.
create or replace function public.orion_publisher_validar(p_tabela text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $pub$
declare
  v_modulo text;
  v_title text; v_desc text; v_price numeric; v_city text; v_state text;
  v_cat text; v_cover text; v_tem_preco boolean := false; v_tem_capa boolean := false;
  v_probs jsonb := '[]'::jsonb;
  v_dup_id uuid; v_sim numeric := 0;
  v_status text; v_evento text;
begin
  v_modulo := case p_tabela
    when 'advertiser_listings'  then 'mercado'
    when 'real_estate_listings' then 'imoveis'
    when 'vehicle_listings'     then 'veiculos'
    when 'service_listings'     then 'servicos'
    when 'freight_listings'     then 'fretes'
    when 'travel_listings'      then 'viagens'
    else null end;
  if v_modulo is null then raise exception 'ORION Publisher: tabela % nao suportada', p_tabela; end if;

  if p_tabela = 'advertiser_listings' then
    select title, description, price::numeric, city, null, category, cover_image_url
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      from advertiser_listings where id = p_id;
    v_tem_preco := true; v_tem_capa := true;
  elsif p_tabela = 'real_estate_listings' then
    select title, description, price_brl::numeric, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      from real_estate_listings where id = p_id;
    v_tem_preco := true;
  elsif p_tabela = 'vehicle_listings' then
    select title, description, price_brl::numeric, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      from vehicle_listings where id = p_id;
    v_tem_preco := true;
  elsif p_tabela = 'service_listings' then
    select title, description, null, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      from service_listings where id = p_id;
  elsif p_tabela = 'freight_listings' then
    select title, description, null, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      from freight_listings where id = p_id;
  elsif p_tabela = 'travel_listings' then
    select title, description, null, city, state, category, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      from travel_listings where id = p_id;
  end if;

  if v_title is null and v_desc is null then
    raise exception 'ORION Publisher: anuncio %.% nao encontrado', p_tabela, p_id;
  end if;

  if length(coalesce(trim(v_title),'')) < 8 then
    v_probs := v_probs || '["Titulo ausente ou muito curto (minimo 8 caracteres)"]'::jsonb;
  end if;
  if length(coalesce(trim(v_desc),'')) < 20 then
    v_probs := v_probs || '["Descricao ausente ou muito curta (minimo 20 caracteres)"]'::jsonb;
  end if;
  if v_tem_preco and coalesce(v_price, 0) <= 0 then
    v_probs := v_probs || '["Preco ausente ou invalido"]'::jsonb;
  end if;
  if coalesce(trim(v_city),'') = '' then
    v_probs := v_probs || '["Cidade nao informada"]'::jsonb;
  elsif not exists (select 1 from orion_municipios m where m.nome_norm = orion_norm(v_city)) then
    v_probs := v_probs || '["Cidade nao reconhecida na base IBGE (verificar grafia)"]'::jsonb;
  end if;
  if v_tem_capa and coalesce(trim(v_cover),'') = '' then
    v_probs := v_probs || '["Imagem de capa ausente"]'::jsonb;
  end if;

  -- Duplicidade INDEX-ASSISTED: prefiltro por trgm '%' (usa GIN idx_trgm_*), depois ranqueia
  execute format(
    'select id, greatest(similarity(coalesce(title,''''), $1), similarity(coalesce(description,''''), $2))
     from %I
     where id <> $3
       and (coalesce(title,'''')||'' ''||coalesce(description,'''')) %% ($1 || '' '' || $2)
     order by 2 desc nulls last limit 1', p_tabela)
    into v_dup_id, v_sim
    using coalesce(v_title,''), coalesce(v_desc,''), p_id;
  v_sim := coalesce(v_sim, 0);

  if jsonb_array_length(v_probs) > 0 then
    v_status := 'erro_validacao';  v_evento := 'anuncio_reprovado';
  elsif v_sim >= 0.65 then
    v_status := 'duplicado_suspeito'; v_evento := 'anuncio_duplicado';
  else
    v_status := 'pronto_moderacao'; v_evento := 'anuncio_pronto_para_moderacao';
  end if;

  insert into orion_publisher_log
    (tabela, listing_id, modulo, titulo, cidade, status, problemas, similaridade, processado_em)
  values
    (p_tabela, p_id, v_modulo, left(v_title, 120), v_city, v_status, v_probs,
     case when v_sim > 0 then jsonb_build_object('pct', round(v_sim * 100), 'com_listing_id', v_dup_id) end, now())
  on conflict (tabela, listing_id) do update
    set status = excluded.status, problemas = excluded.problemas,
        similaridade = excluded.similaridade, titulo = excluded.titulo,
        cidade = excluded.cidade, processado_em = now();

  insert into orion_eventos (tipo, origem, dados)
  values (v_evento, 'orion_publisher',
          jsonb_build_object('tabela', p_tabela, 'listing_id', p_id, 'modulo', v_modulo,
                             'similaridade_pct', round(v_sim * 100)));

  return jsonb_build_object('status', v_status, 'problemas', v_probs, 'similaridade_pct', round(v_sim * 100));
end; $pub$;

-- P-OBS1: trigger loga a falha (nao engole silenciosamente) e nunca bloqueia o save
create or replace function public.orion_publisher_tg()
returns trigger language plpgsql security definer set search_path to 'public' as $tg$
begin
  begin
    perform orion_publisher_validar(TG_TABLE_NAME, NEW.id);
  exception when others then
    insert into orion_eventos (tipo, origem, dados)
    values ('publisher_erro_validacao', 'orion_publisher',
            jsonb_build_object('tabela', TG_TABLE_NAME, 'listing_id', NEW.id, 'erro', SQLERRM));
  end;
  return NEW;
end; $tg$;

-- P-ARCH1: gates tambem em UPDATE de conteudo (title/description/city) — revalidacao idempotente
do $g$ declare t text; begin
  foreach t in array array['advertiser_listings','real_estate_listings','vehicle_listings','service_listings','freight_listings','travel_listings'] loop
    execute format('drop trigger if exists orion_publisher_gate on public.%I', t);
    execute format('create trigger orion_publisher_gate after insert or update of title, description, city on public.%I for each row execute function public.orion_publisher_tg()', t);
  end loop; end $g$;

-- P-MINOR1: trigger fn nao precisa de grant a role de cliente
revoke execute on function public.orion_publisher_tg() from anon, authenticated, public;

-- M1: painel sem a metrica morta tempo_medio_ms (era sempre ~0 e nao exibida)
create or replace function public.orion_publisher_painel()
returns jsonb language plpgsql security definer set search_path to 'public' as $pa$
declare r jsonb; v_total bigint;
begin
  if not mp_is_admin() then raise exception 'ORION Publisher: acesso restrito a administradores'; end if;
  select count(*) into v_total from orion_publisher_log;
  select jsonb_build_object(
    'total_processados', v_total,
    'prontos_moderacao', (select count(*) from orion_publisher_log where status='pronto_moderacao'),
    'erros_validacao',   (select count(*) from orion_publisher_log where status='erro_validacao'),
    'duplicados',        (select count(*) from orion_publisher_log where status='duplicado_suspeito'),
    'taxa_aprovacao_pct', case when v_total>0 then round(100.0*(select count(*) from orion_publisher_log where status='pronto_moderacao')/v_total,1) end,
    'taxa_duplicidade_pct', case when v_total>0 then round(100.0*(select count(*) from orion_publisher_log where status='duplicado_suspeito')/v_total,1) end,
    'ultima_hora', (select count(*) from orion_publisher_log where processado_em >= now() - interval '1 hour'),
    'por_modulo', (select coalesce(jsonb_object_agg(modulo, n),'{}'::jsonb) from (select modulo, count(*) n from orion_publisher_log group by 1) x),
    'por_cidade', (select coalesce(jsonb_agg(x),'[]'::jsonb) from (select initcap(orion_norm(cidade)) cidade, count(*) n from orion_publisher_log where coalesce(cidade,'')<>'' group by 1 order by 2 desc limit 8) x),
    'atualizado_em', to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')
  ) into r;
  return r;
end; $pa$;

select 'fix aplicado' as ok;

-- validar com acentos PT-BR corretos (regressao corrigida no ciclo)
-- Corrige regressao de acentos nas mensagens do validar (restaura PT-BR correto)
create or replace function public.orion_publisher_validar(p_tabela text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $pub$
declare
  v_modulo text;
  v_title text; v_desc text; v_price numeric; v_city text; v_state text;
  v_cat text; v_cover text; v_tem_preco boolean := false; v_tem_capa boolean := false;
  v_probs jsonb := '[]'::jsonb;
  v_dup_id uuid; v_sim numeric := 0;
  v_status text; v_evento text;
begin
  v_modulo := case p_tabela
    when 'advertiser_listings'  then 'mercado'
    when 'real_estate_listings' then 'imoveis'
    when 'vehicle_listings'     then 'veiculos'
    when 'service_listings'     then 'servicos'
    when 'freight_listings'     then 'fretes'
    when 'travel_listings'      then 'viagens'
    else null end;
  if v_modulo is null then raise exception 'ORION Publisher: tabela % nao suportada', p_tabela; end if;

  if p_tabela = 'advertiser_listings' then
    select title, description, price::numeric, city, null, category, cover_image_url
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover from advertiser_listings where id = p_id;
    v_tem_preco := true; v_tem_capa := true;
  elsif p_tabela = 'real_estate_listings' then
    select title, description, price_brl::numeric, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover from real_estate_listings where id = p_id;
    v_tem_preco := true;
  elsif p_tabela = 'vehicle_listings' then
    select title, description, price_brl::numeric, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover from vehicle_listings where id = p_id;
    v_tem_preco := true;
  elsif p_tabela = 'service_listings' then
    select title, description, null, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover from service_listings where id = p_id;
  elsif p_tabela = 'freight_listings' then
    select title, description, null, city, state, null, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover from freight_listings where id = p_id;
  elsif p_tabela = 'travel_listings' then
    select title, description, null, city, state, category, null
      into v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover from travel_listings where id = p_id;
  end if;

  if v_title is null and v_desc is null then
    raise exception 'ORION Publisher: anúncio %.% não encontrado', p_tabela, p_id;
  end if;

  if length(coalesce(trim(v_title),'')) < 8 then
    v_probs := v_probs || '["Título ausente ou muito curto (mínimo 8 caracteres)"]'::jsonb;
  end if;
  if length(coalesce(trim(v_desc),'')) < 20 then
    v_probs := v_probs || '["Descrição ausente ou muito curta (mínimo 20 caracteres)"]'::jsonb;
  end if;
  if v_tem_preco and coalesce(v_price, 0) <= 0 then
    v_probs := v_probs || '["Preço ausente ou inválido"]'::jsonb;
  end if;
  if coalesce(trim(v_city),'') = '' then
    v_probs := v_probs || '["Cidade não informada"]'::jsonb;
  elsif not exists (select 1 from orion_municipios m where m.nome_norm = orion_norm(v_city)) then
    v_probs := v_probs || '["Cidade não reconhecida na base IBGE (verificar grafia)"]'::jsonb;
  end if;
  if v_tem_capa and coalesce(trim(v_cover),'') = '' then
    v_probs := v_probs || '["Imagem de capa ausente"]'::jsonb;
  end if;

  execute format(
    'select id, greatest(similarity(coalesce(title,''''), $1), similarity(coalesce(description,''''), $2))
     from %I where id <> $3
       and (coalesce(title,'''')||'' ''||coalesce(description,'''')) %% ($1 || '' '' || $2)
     order by 2 desc nulls last limit 1', p_tabela)
    into v_dup_id, v_sim using coalesce(v_title,''), coalesce(v_desc,''), p_id;
  v_sim := coalesce(v_sim, 0);

  if jsonb_array_length(v_probs) > 0 then
    v_status := 'erro_validacao';  v_evento := 'anuncio_reprovado';
  elsif v_sim >= 0.65 then
    v_status := 'duplicado_suspeito'; v_evento := 'anuncio_duplicado';
  else
    v_status := 'pronto_moderacao'; v_evento := 'anuncio_pronto_para_moderacao';
  end if;

  insert into orion_publisher_log
    (tabela, listing_id, modulo, titulo, cidade, status, problemas, similaridade, processado_em)
  values (p_tabela, p_id, v_modulo, left(v_title, 120), v_city, v_status, v_probs,
     case when v_sim > 0 then jsonb_build_object('pct', round(v_sim * 100), 'com_listing_id', v_dup_id) end, now())
  on conflict (tabela, listing_id) do update
    set status = excluded.status, problemas = excluded.problemas, similaridade = excluded.similaridade,
        titulo = excluded.titulo, cidade = excluded.cidade, processado_em = now();

  insert into orion_eventos (tipo, origem, dados)
  values (v_evento, 'orion_publisher',
          jsonb_build_object('tabela', p_tabela, 'listing_id', p_id, 'modulo', v_modulo, 'similaridade_pct', round(v_sim * 100)));

  return jsonb_build_object('status', v_status, 'problemas', v_probs, 'similaridade_pct', round(v_sim * 100));
end; $pub$;

-- reprocessa o log p/ regravar as mensagens acentuadas nos erros ja existentes
select public.orion_publisher_validar(tabela, listing_id) from orion_publisher_log where status='erro_validacao';
select 'acentos corrigidos' ok, (select problemas from orion_publisher_log where status='erro_validacao' limit 1) amostra;
