-- ═══════════════════════════════════════════════════════════════
-- ORION Fase 1.1 — Sistema Nervoso + Previsão baseline
-- Eventos da plataforma fluem para orion_eventos via triggers
-- não-bloqueantes (o sistema nervoso NUNCA quebra a operação).
-- Aplicada via Management API em 2026-07-13. Idempotente.
-- Nota: tabelas pay_* ficam FORA da Fase 1 (regras financeiras).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Fluxo de eventos (memória corporativa bruta) ────────────
CREATE TABLE IF NOT EXISTS orion_eventos (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo      text NOT NULL,          -- pedido_criado | corrida_criada | anuncio_criado | grupo_criado | ...
  origem    text,                   -- tabela/módulo emissor
  dados     jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id   uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_ev_tipo ON orion_eventos(tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_orion_ev_data ON orion_eventos(criado_em DESC);

ALTER TABLE orion_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_ev_admin_read ON orion_eventos;
CREATE POLICY orion_ev_admin_read ON orion_eventos
  FOR SELECT TO authenticated USING (mp_is_admin());
-- inserts somente via funções SECURITY DEFINER (trigger/emissor)

-- Emissor manual (novos módulos chamam esta RPC — Plataforma Evolutiva)
CREATE OR REPLACE FUNCTION orion_emitir_evento(p_tipo text, p_origem text, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO orion_eventos (tipo, origem, dados, user_id)
  VALUES (p_tipo, coalesce(p_origem,'app'), coalesce(p_dados,'{}'::jsonb), auth.uid());
END; $$;
GRANT EXECUTE ON FUNCTION orion_emitir_evento(text,text,jsonb) TO authenticated;

-- ── 2. Triggers do sistema nervoso (não-bloqueantes) ───────────
CREATE OR REPLACE FUNCTION orion_tg_evento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES (TG_ARGV[0], TG_TABLE_NAME, jsonb_build_object('id', NEW.id));
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- nunca interromper a operação de origem
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orion_ev_pedido ON service_orders;
CREATE TRIGGER orion_ev_pedido AFTER INSERT ON service_orders
  FOR EACH ROW EXECUTE FUNCTION orion_tg_evento('pedido_criado');

DROP TRIGGER IF EXISTS orion_ev_corrida ON motorista_corridas;
CREATE TRIGGER orion_ev_corrida AFTER INSERT ON motorista_corridas
  FOR EACH ROW EXECUTE FUNCTION orion_tg_evento('corrida_criada');

DROP TRIGGER IF EXISTS orion_ev_anuncio ON advertiser_listings;
CREATE TRIGGER orion_ev_anuncio AFTER INSERT ON advertiser_listings
  FOR EACH ROW EXECUTE FUNCTION orion_tg_evento('anuncio_criado');

DROP TRIGGER IF EXISTS orion_ev_grupo ON whatsapp_groups;
CREATE TRIGGER orion_ev_grupo AFTER INSERT ON whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION orion_tg_evento('grupo_criado');

-- ── 3. Leitura do fluxo (painel) ───────────────────────────────
CREATE OR REPLACE FUNCTION orion_eventos_recentes(p_limite int DEFAULT 50)
RETURNS TABLE (id bigint, tipo text, origem text, dados jsonb, criado_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  RETURN QUERY
  SELECT e.id, e.tipo, e.origem, e.dados, e.criado_em
  FROM orion_eventos e ORDER BY e.criado_em DESC LIMIT p_limite;
END; $$;

CREATE OR REPLACE FUNCTION orion_eventos_resumo()
RETURNS TABLE (tipo text, ultimos_7d bigint, ultimos_30d bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;
  RETURN QUERY
  SELECT e.tipo,
         count(*) FILTER (WHERE e.criado_em >= now() - interval '7 days'),
         count(*)
  FROM orion_eventos e
  WHERE e.criado_em >= now() - interval '30 days'
  GROUP BY e.tipo ORDER BY 3 DESC;
END; $$;

-- ── 4. ORION PREDICT v1: baseline honesto sobre pedidos reais ──
-- Média de pedidos por faixa de hora e dia-da-semana (30 dias) e
-- estimativa simples para as próximas 24h. Será refinado com volume.
CREATE OR REPLACE FUNCTION orion_prever_demanda()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total bigint; v_dias numeric; v_media_dia numeric;
  v_pico_hora int; v_pico_media numeric; v_prox24 numeric; r jsonb;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'ORION: acesso restrito a administradores'; END IF;

  SELECT count(*) INTO v_total
  FROM service_orders WHERE created_at >= now() - interval '30 days';
  v_dias := 30; v_media_dia := round(v_total / v_dias, 2);

  SELECT extract(hour FROM created_at)::int, round(count(*)/v_dias, 2)
    INTO v_pico_hora, v_pico_media
  FROM service_orders
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  -- próximas 24h = média diária ajustada pelo dia da semana de amanhã
  SELECT round(v_media_dia * coalesce(
    (SELECT count(*)::numeric / greatest(1, v_total / 7.0)
     FROM service_orders
     WHERE created_at >= now() - interval '30 days'
       AND extract(dow FROM created_at) = extract(dow FROM now() + interval '1 day')) / 4.28, 1), 1)
  INTO v_prox24;

  r := jsonb_build_object(
    'pedidos_30d', v_total,
    'media_por_dia', v_media_dia,
    'hora_pico', v_pico_hora,
    'media_na_hora_pico', v_pico_media,
    'estimativa_proximas_24h', coalesce(v_prox24, v_media_dia),
    'confianca', CASE WHEN v_total >= 300 THEN 0.75 WHEN v_total >= 100 THEN 0.6
                      WHEN v_total >= 30 THEN 0.45 ELSE 0.3 END,
    'metodo', 'Baseline v1: médias por dia da semana e hora sobre os pedidos reais de 30 dias. A confiança cresce com o volume de dados (ORION LEARN).');
  RETURN r;
END; $$;

GRANT EXECUTE ON FUNCTION orion_eventos_recentes(int) TO authenticated;
GRANT EXECUTE ON FUNCTION orion_eventos_resumo()      TO authenticated;
GRANT EXECUTE ON FUNCTION orion_prever_demanda()      TO authenticated;
