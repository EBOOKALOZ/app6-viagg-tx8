-- ============================================================
-- JANELA OPERACIONAL DO POSTADOR (2026-07-12) — 07:00–23:00 Cuiabá
-- Reutiliza os contadores REAIS (claimed_until de posting_lots e
-- campaign_posting_targets). Congelamento = deslocamento exato do
-- prazo no fechamento (nenhum tempo perdido, sem contador paralelo).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.janela_operacional_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  inicio time NOT NULL DEFAULT '07:00',
  fim time NOT NULL DEFAULT '23:00',
  pausa_ativa boolean NOT NULL DEFAULT true,
  estimativa_padrao_horas integer NOT NULL DEFAULT 3,
  excecoes jsonb NOT NULL DEFAULT '[]',  -- [{"data":"2026-12-25","fechado":true} | {"data":"...","inicio":"08:00","fim":"20:00"}]
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.janela_operacional_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.janela_operacional_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.janela_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cfg record; agora timestamptz := now();
  hoje date := (agora AT TIME ZONE 'America/Cuiaba')::date;
  exc jsonb; v_ini time; v_fim time; v_fechado boolean := false;
  abre timestamptz; fecha timestamptz; prox_abre timestamptz; aberta boolean;
BEGIN
  SELECT * INTO cfg FROM public.janela_operacional_config WHERE id = 1;
  v_ini := cfg.inicio; v_fim := cfg.fim;
  SELECT e INTO exc FROM jsonb_array_elements(cfg.excecoes) e
   WHERE e->>'data' = hoje::text LIMIT 1;
  IF exc IS NOT NULL THEN
    v_fechado := COALESCE((exc->>'fechado')::boolean, false);
    v_ini := COALESCE((exc->>'inicio')::time, v_ini);
    v_fim := COALESCE((exc->>'fim')::time, v_fim);
  END IF;
  abre  := (hoje::text || ' ' || v_ini)::timestamp AT TIME ZONE 'America/Cuiaba';
  fecha := (hoje::text || ' ' || v_fim)::timestamp AT TIME ZONE 'America/Cuiaba';
  aberta := (NOT cfg.pausa_ativa) OR (NOT v_fechado AND agora >= abre AND agora < fecha);
  prox_abre := CASE
    WHEN aberta THEN NULL
    WHEN agora < abre AND NOT v_fechado THEN abre
    ELSE ((hoje + 1)::text || ' ' || cfg.inicio)::timestamp AT TIME ZONE 'America/Cuiaba' END;
  RETURN jsonb_build_object('aberta', aberta, 'pausa_ativa', cfg.pausa_ativa,
    'inicio', v_ini::text, 'fim', v_fim::text, 'fechado_hoje', v_fechado,
    'proxima_abertura', prox_abre, 'fechamento', fecha,
    'estimativa_padrao_horas', cfg.estimativa_padrao_horas);
END $$;

-- Estimativa dinâmica (fila ÷ capacidade × tempo médio; fallback config)
CREATE OR REPLACE FUNCTION public.divulgacao_estimativa()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fila integer; v_cap integer; v_tm numeric; v_pad integer; v_min integer;
BEGIN
  SELECT estimativa_padrao_horas INTO v_pad FROM public.janela_operacional_config WHERE id = 1;
  SELECT count(*) INTO v_fila FROM public.campaign_queue
   WHERE status NOT IN ('cancelled','expired','posted','publicada','concluida','done');
  SELECT count(DISTINCT g.owner_user_id) INTO v_cap
    FROM public.whatsapp_groups g
    JOIN public.motoboy_profiles mp ON mp.user_id = g.owner_user_id AND mp.is_online
   WHERE g.is_active AND g.validation_status = 'approved';
  SELECT avg(EXTRACT(EPOCH FROM (posted_at - created_at)) / 60.0) INTO v_tm
    FROM public.campaign_queue
   WHERE posted_at IS NOT NULL AND posted_at > now() - interval '30 days';
  v_min := CASE WHEN v_fila = 0 THEN NULL
    WHEN v_cap > 0 AND v_tm IS NOT NULL THEN (ceil(v_fila::numeric / v_cap) * round(v_tm))::integer
    ELSE v_pad * 60 END;
  RETURN jsonb_build_object('minutos', v_min, 'horas_padrao', v_pad,
    'fila', v_fila, 'capacidade', v_cap);
END $$;

-- Congelamento noturno: prazos que venceriam na pausa são deslocados
-- pelo tempo EXATO restante no fechamento (idempotente; cron 15 min)
CREATE OR REPLACE FUNCTION public.janela_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  st jsonb; fecha timestamptz; abre timestamptz; n1 integer := 0; n2 integer := 0;
BEGIN
  st := public.janela_status();
  IF (st->>'aberta')::boolean OR NOT (st->>'pausa_ativa')::boolean THEN
    RETURN jsonb_build_object('acao', 'janela_aberta');
  END IF;
  fecha := (st->>'fechamento')::timestamptz;
  abre  := (st->>'proxima_abertura')::timestamptz;
  IF abre IS NULL THEN RETURN jsonb_build_object('acao', 'sem_proxima'); END IF;

  UPDATE public.posting_lots
     SET claimed_until = abre + (claimed_until - fecha)
   WHERE status = 'claimed' AND claimed_until > fecha AND claimed_until < abre;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  UPDATE public.campaign_posting_targets
     SET claimed_until = abre + (claimed_until - fecha)
   WHERE status IN ('claimed','reserved') AND claimed_until > fecha AND claimed_until < abre;
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN jsonb_build_object('acao', 'congeladas', 'lotes', n1, 'targets', n2);
END $$;

CREATE OR REPLACE FUNCTION public.janela_config_set(
  p_inicio time, p_fim time, p_pausa boolean, p_estimativa integer, p_excecoes jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.mp_is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  UPDATE public.janela_operacional_config SET
    inicio = p_inicio, fim = p_fim, pausa_ativa = p_pausa,
    estimativa_padrao_horas = GREATEST(1, p_estimativa),
    excecoes = COALESCE(p_excecoes, '[]'::jsonb), updated_at = now()
  WHERE id = 1;
  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.janela_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.divulgacao_estimativa() TO authenticated;
GRANT EXECUTE ON FUNCTION public.janela_config_set(time,time,boolean,integer,jsonb) TO authenticated;

DO $$
BEGIN
  PERFORM cron.schedule('janela-operacional-tick', '*/15 * * * *', 'SELECT public.janela_tick()');
EXCEPTION WHEN OTHERS THEN NULL; -- já agendado
END $$;
