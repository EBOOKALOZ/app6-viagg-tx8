-- ============================================================================
-- COMANDO LEILÃO v1.1 — Duração (7/15/30) + Encerramento Automático · 2026-07-17
-- ============================================================================
-- * Duração fixa: coluna auction_duration_days (7|15|30). starts_at/ends_at já
--   existem; remaining_seconds é CALCULADO (não se armazena — evita drift).
-- * Encerramento AUTOMÁTICO: cron 1/min fecha leilões expirados chamando
--   orion_auction_close() (Fase 1: vencedor + comissão + relatório + auditoria,
--   idempotente). Era a peça que faltava para "encerrar na data/hora".
-- * Dashboard: indicadores por duração (7/15/30), encerrando hoje, próximos.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- 1) Coluna de duração + backfill a partir de (ends_at - starts_at)
ALTER TABLE public.auction_listings
  ADD COLUMN IF NOT EXISTS auction_duration_days integer;

UPDATE public.auction_listings
   SET auction_duration_days = GREATEST(1, round(EXTRACT(epoch FROM (ends_at - starts_at))/86400.0)::int)
 WHERE auction_duration_days IS NULL AND ends_at IS NOT NULL AND starts_at IS NOT NULL;

-- 2) Encerramento automático (cron): fecha expirados via orion_auction_close
CREATE OR REPLACE FUNCTION public.orion_auction_autoclose_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.auction_listings
     WHERE coalesce(status,'active') IN ('active','ativo','published','live')
       AND ends_at IS NOT NULL AND ends_at <= now()
     LIMIT 200
  LOOP
    BEGIN
      PERFORM public.orion_auction_close(r.id, 'basico');
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- não aborta o lote por um leilão problemático
      NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'encerrados', v_n, 'em', now());
END$$;
GRANT EXECUTE ON FUNCTION public.orion_auction_autoclose_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_auction_autoclose') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_autoclose');
    PERFORM cron.schedule('orion_auction_autoclose', '* * * * *', 'SELECT public.orion_auction_autoclose_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- 3) Dashboard: acrescenta indicadores de DURAÇÃO ao auction_statistics
CREATE OR REPLACE FUNCTION public.auction_statistics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base jsonb;
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  base := jsonb_build_object(
    'ativos',        (SELECT count(*) FROM public.auction_listings WHERE coalesce(status,'active') IN ('active','ativo','published','live')),
    'agendados',     (SELECT count(*) FROM public.auction_listings WHERE starts_at > now() OR status IN ('scheduled','agendado')),
    'encerrados',    (SELECT count(*) FROM public.auction_listings WHERE status IN ('ended','encerrado','closed')),
    'cancelados',    (SELECT count(*) FROM public.auction_listings WHERE status IN ('canceled','cancelled','cancelado')),
    'com_vencedor',  (SELECT count(*) FROM public.auction_listings WHERE winner_user_id IS NOT NULL),
    'total_lances',  (SELECT count(*) FROM public.auction_bids),
    'maior_lance',   (SELECT coalesce(max(amount_cents),0)/100.0 FROM public.auction_bids),
    'usuarios_ativos',(SELECT count(DISTINCT user_id) FROM public.auction_bids),
    'valor_movimentado', (SELECT coalesce(sum(coalesce(current_bid, starting_bid, 0)),0) FROM public.auction_listings WHERE winner_user_id IS NOT NULL),
    'taxa_conversao', (SELECT CASE WHEN e>0 THEN round(w*100.0/e) ELSE 0 END
                       FROM (SELECT count(*) FILTER (WHERE status IN ('ended','encerrado','closed')) e,
                                    count(*) FILTER (WHERE winner_user_id IS NOT NULL) w FROM public.auction_listings) x),
    'tempo_medio_horas', (SELECT coalesce(round(avg(EXTRACT(epoch FROM (ends_at - starts_at))/3600))::int,0)
                          FROM public.auction_listings WHERE ends_at IS NOT NULL AND starts_at IS NOT NULL),
    'receita_creditos', (SELECT coalesce(sum(creditos),0) FROM public.orion_auction_credit_consumption),
    'comissao_creditos', (SELECT coalesce(sum(creditos) FILTER (WHERE tipo='encerramento'),0) FROM public.orion_auction_credit_consumption),
    'fraudes_detectadas', 0,
    'nota_fraude', 'Fraude de leilão coberta pelo AI-41 Fraud Detection (orion_fraud_*) — DECLARADO.',
    'gerado_em', now());

  RETURN base || jsonb_build_object(
    'ativos_7d',  (SELECT count(*) FROM public.auction_listings WHERE auction_duration_days=7  AND coalesce(status,'active') IN ('active','ativo','published','live')),
    'ativos_15d', (SELECT count(*) FROM public.auction_listings WHERE auction_duration_days=15 AND coalesce(status,'active') IN ('active','ativo','published','live')),
    'ativos_30d', (SELECT count(*) FROM public.auction_listings WHERE auction_duration_days=30 AND coalesce(status,'active') IN ('active','ativo','published','live')),
    'encerrando_hoje', (SELECT count(*) FROM public.auction_listings
        WHERE coalesce(status,'active') IN ('active','ativo','published','live')
          AND ends_at::date = (now() AT TIME ZONE 'America/Cuiaba')::date),
    'tempo_medio_restante_horas', (SELECT coalesce(round(avg(EXTRACT(epoch FROM (ends_at-now()))/3600) FILTER (WHERE ends_at>now()))::int,0)
        FROM public.auction_listings WHERE coalesce(status,'active') IN ('active','ativo','published','live')),
    'proximos_encerramentos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'titulo',title,'fim',ends_at) ORDER BY ends_at),'[]'::jsonb)
        FROM (SELECT id,title,ends_at FROM public.auction_listings
              WHERE coalesce(status,'active') IN ('active','ativo','published','live') AND ends_at>now()
              ORDER BY ends_at LIMIT 8) x));
END$$;
GRANT EXECUTE ON FUNCTION public.auction_statistics() TO authenticated, service_role;

-- Verificação
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='auction_listings' AND column_name='auction_duration_days') AS coluna_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='orion_auction_autoclose_tick') AS autoclose_ok,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_auction_autoclose') AS cron_ok;
