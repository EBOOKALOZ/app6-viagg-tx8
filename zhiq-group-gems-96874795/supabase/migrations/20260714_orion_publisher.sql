-- ═══════════════════════════════════════════════════════════════
-- ORION PUBLISHER AI v1.0 — porta oficial de entrada dos anúncios
-- Valida estrutura, detecta duplicidade (pg_trgm), organiza e
-- registra TUDO para auditoria. Triggers automáticos nas 6 tabelas
-- de anúncios → nenhum anúncio novo escapa da validação.
-- Eventos (anuncio_validado/reprovado/duplicado/pronto_para_moderacao)
-- fluem pelo sistema nervoso ORION = API interna dos próximos agentes.
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Trilha de auditoria do Publisher ────────────────────────
CREATE TABLE IF NOT EXISTS orion_publisher_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela        text NOT NULL,
  listing_id    uuid NOT NULL,
  modulo        text NOT NULL,     -- mercado|imoveis|veiculos|servicos|fretes|viagens
  titulo        text,
  cidade        text,
  status        text NOT NULL CHECK (status IN
                ('recebido','erro_validacao','duplicado_suspeito','pronto_moderacao')),
  problemas     jsonb NOT NULL DEFAULT '[]'::jsonb,
  similaridade  jsonb,             -- { pct, com_listing_id }
  recebido_em   timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  UNIQUE (tabela, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_orion_pub_status ON orion_publisher_log(status, recebido_em DESC);
ALTER TABLE orion_publisher_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_pub_admin ON orion_publisher_log;
CREATE POLICY orion_pub_admin ON orion_publisher_log
  FOR ALL TO authenticated USING (mp_is_admin()) WITH CHECK (mp_is_admin());

-- ── 2. Motor de validação (1 anúncio) ──────────────────────────
CREATE OR REPLACE FUNCTION orion_publisher_validar(p_tabela text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_modulo text;
  v_title text; v_desc text; v_price numeric; v_city text; v_state text;
  v_cat text; v_cover text; v_tem_preco boolean := false; v_tem_capa boolean := false;
  v_probs jsonb := '[]'::jsonb;
  v_dup_id uuid; v_sim numeric := 0;
  v_status text; v_evento text;
BEGIN
  v_modulo := CASE p_tabela
    WHEN 'advertiser_listings'  THEN 'mercado'
    WHEN 'real_estate_listings' THEN 'imoveis'
    WHEN 'vehicle_listings'     THEN 'veiculos'
    WHEN 'service_listings'     THEN 'servicos'
    WHEN 'freight_listings'     THEN 'fretes'
    WHEN 'travel_listings'      THEN 'viagens'
    ELSE NULL END;
  IF v_modulo IS NULL THEN
    RAISE EXCEPTION 'ORION Publisher: tabela % não suportada', p_tabela;
  END IF;

  IF p_tabela = 'advertiser_listings' THEN
    SELECT title, description, price::numeric, city, NULL, category, cover_image_url
      INTO v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      FROM advertiser_listings WHERE id = p_id;
    v_tem_preco := true; v_tem_capa := true;
  ELSIF p_tabela = 'real_estate_listings' THEN
    SELECT title, description, price_brl::numeric, city, state, NULL, NULL
      INTO v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      FROM real_estate_listings WHERE id = p_id;
    v_tem_preco := true;
  ELSIF p_tabela = 'vehicle_listings' THEN
    SELECT title, description, price_brl::numeric, city, state, NULL, NULL
      INTO v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      FROM vehicle_listings WHERE id = p_id;
    v_tem_preco := true;
  ELSIF p_tabela = 'service_listings' THEN
    SELECT title, description, NULL, city, state, NULL, NULL
      INTO v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      FROM service_listings WHERE id = p_id;
  ELSIF p_tabela = 'freight_listings' THEN
    SELECT title, description, NULL, city, state, NULL, NULL
      INTO v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      FROM freight_listings WHERE id = p_id;
  ELSIF p_tabela = 'travel_listings' THEN
    SELECT title, description, NULL, city, state, category, NULL
      INTO v_title, v_desc, v_price, v_city, v_state, v_cat, v_cover
      FROM travel_listings WHERE id = p_id;
  END IF;

  IF v_title IS NULL AND v_desc IS NULL THEN
    RAISE EXCEPTION 'ORION Publisher: anúncio %.% não encontrado', p_tabela, p_id;
  END IF;

  -- Validação estrutural
  IF length(coalesce(trim(v_title),'')) < 8 THEN
    v_probs := v_probs || '["Título ausente ou muito curto (mínimo 8 caracteres)"]'::jsonb;
  END IF;
  IF length(coalesce(trim(v_desc),'')) < 20 THEN
    v_probs := v_probs || '["Descrição ausente ou muito curta (mínimo 20 caracteres)"]'::jsonb;
  END IF;
  IF v_tem_preco AND coalesce(v_price, 0) <= 0 THEN
    v_probs := v_probs || '["Preço ausente ou inválido"]'::jsonb;
  END IF;
  IF coalesce(trim(v_city),'') = '' THEN
    v_probs := v_probs || '["Cidade não informada"]'::jsonb;
  ELSIF NOT EXISTS (SELECT 1 FROM orion_municipios m WHERE m.nome_norm = orion_norm(v_city)) THEN
    v_probs := v_probs || '["Cidade não reconhecida na base IBGE (verificar grafia)"]'::jsonb;
  END IF;
  IF v_tem_capa AND coalesce(trim(v_cover),'') = '' THEN
    v_probs := v_probs || '["Imagem de capa ausente"]'::jsonb;
  END IF;

  -- Duplicidade na MESMA tabela (índice de similaridade via pg_trgm)
  EXECUTE format(
    'SELECT id, greatest(similarity(coalesce(title,''''), $1),
                         similarity(coalesce(description,''''), $2))
     FROM %I WHERE id <> $3
     ORDER BY 2 DESC NULLS LAST LIMIT 1', p_tabela)
    INTO v_dup_id, v_sim
    USING coalesce(v_title,''), coalesce(v_desc,''), p_id;
  v_sim := coalesce(v_sim, 0);

  -- Decisão
  IF jsonb_array_length(v_probs) > 0 THEN
    v_status := 'erro_validacao';  v_evento := 'anuncio_reprovado';
  ELSIF v_sim >= 0.65 THEN
    v_status := 'duplicado_suspeito'; v_evento := 'anuncio_duplicado';
  ELSE
    v_status := 'pronto_moderacao'; v_evento := 'anuncio_pronto_para_moderacao';
  END IF;

  INSERT INTO orion_publisher_log
    (tabela, listing_id, modulo, titulo, cidade, status, problemas, similaridade, processado_em)
  VALUES
    (p_tabela, p_id, v_modulo, left(v_title, 120), v_city, v_status, v_probs,
     CASE WHEN v_sim > 0 THEN jsonb_build_object('pct', round(v_sim * 100), 'com_listing_id', v_dup_id) END,
     now())
  ON CONFLICT (tabela, listing_id) DO UPDATE
    SET status = EXCLUDED.status, problemas = EXCLUDED.problemas,
        similaridade = EXCLUDED.similaridade, titulo = EXCLUDED.titulo,
        cidade = EXCLUDED.cidade, processado_em = now();

  INSERT INTO orion_eventos (tipo, origem, dados)
  VALUES (v_evento, 'orion_publisher',
          jsonb_build_object('tabela', p_tabela, 'listing_id', p_id, 'modulo', v_modulo,
                             'similaridade_pct', round(v_sim * 100)));

  RETURN jsonb_build_object('status', v_status, 'problemas', v_probs,
                            'similaridade_pct', round(v_sim * 100));
END; $$;

-- ── 3. Porta obrigatória: trigger não-bloqueante nas 6 tabelas ──
CREATE OR REPLACE FUNCTION orion_publisher_tg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM orion_publisher_validar(TG_TABLE_NAME, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- o Publisher nunca impede o salvamento; problemas ficam no log
  END;
  RETURN NEW;
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['advertiser_listings','real_estate_listings','vehicle_listings',
                           'service_listings','freight_listings','travel_listings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS orion_publisher_gate ON %I', t);
    EXECUTE format('CREATE TRIGGER orion_publisher_gate AFTER INSERT ON %I
                    FOR EACH ROW EXECUTE FUNCTION orion_publisher_tg()', t);
  END LOOP;
END $$;

-- ── 4. Varredura (fila retroativa + reprocessamento) ───────────
CREATE OR REPLACE FUNCTION orion_publisher_varredura()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text; r record; v_n integer := 0;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION Publisher: acesso restrito a administradores'; END IF;
  FOREACH t IN ARRAY ARRAY['advertiser_listings','real_estate_listings','vehicle_listings',
                           'service_listings','freight_listings','travel_listings'] LOOP
    FOR r IN EXECUTE format(
      'SELECT l.id FROM %I l
       WHERE NOT EXISTS (SELECT 1 FROM orion_publisher_log p
                         WHERE p.tabela = %L AND p.listing_id = l.id)
       LIMIT 300', t, t) LOOP
      BEGIN
        PERFORM orion_publisher_validar(t, r.id);
        v_n := v_n + 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END LOOP;
  RETURN v_n;
END; $$;

-- ── 5. Painel ORION Publisher Control ──────────────────────────
CREATE OR REPLACE FUNCTION orion_publisher_painel()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_total bigint;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION Publisher: acesso restrito a administradores'; END IF;
  SELECT count(*) INTO v_total FROM orion_publisher_log;
  SELECT jsonb_build_object(
    'total_processados', v_total,
    'prontos_moderacao', (SELECT count(*) FROM orion_publisher_log WHERE status='pronto_moderacao'),
    'erros_validacao',   (SELECT count(*) FROM orion_publisher_log WHERE status='erro_validacao'),
    'duplicados',        (SELECT count(*) FROM orion_publisher_log WHERE status='duplicado_suspeito'),
    'taxa_aprovacao_pct', CASE WHEN v_total > 0 THEN
      round(100.0 * (SELECT count(*) FROM orion_publisher_log WHERE status='pronto_moderacao') / v_total, 1) END,
    'taxa_duplicidade_pct', CASE WHEN v_total > 0 THEN
      round(100.0 * (SELECT count(*) FROM orion_publisher_log WHERE status='duplicado_suspeito') / v_total, 1) END,
    'ultima_hora', (SELECT count(*) FROM orion_publisher_log WHERE processado_em >= now() - interval '1 hour'),
    'tempo_medio_ms', (SELECT round(avg(extract(epoch FROM (processado_em - recebido_em)) * 1000))
                       FROM orion_publisher_log WHERE processado_em IS NOT NULL),
    'por_modulo', (SELECT coalesce(jsonb_object_agg(modulo, n), '{}'::jsonb) FROM
      (SELECT modulo, count(*) n FROM orion_publisher_log GROUP BY 1) x),
    'por_cidade', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM
      (SELECT initcap(orion_norm(cidade)) cidade, count(*) n FROM orion_publisher_log
       WHERE coalesce(cidade,'') <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
  ) INTO r;
  RETURN r;
END; $$;

GRANT EXECUTE ON FUNCTION orion_publisher_varredura() TO authenticated;
GRANT EXECUTE ON FUNCTION orion_publisher_painel()    TO authenticated;
REVOKE EXECUTE ON FUNCTION orion_publisher_validar(text, uuid) FROM PUBLIC, anon, authenticated;
