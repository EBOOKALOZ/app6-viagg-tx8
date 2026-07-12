-- ============================================================
-- SMART QUEUE — alocação dinâmica da fila de divulgações (2026-07-12)
-- Integra a fila existente (campaign_queue.origem). Sem novas filas.
-- Regras: pagas têm prioridade mas nunca exclusividade; capacidade
-- ociosa vai IMEDIATAMENTE para as gratuitas; mínimo de gratuitas é
-- garantido e configurável; recálculo contínuo (função stateless).
-- ============================================================

-- ── Configuração administrável (linha única) ───────────────────────
CREATE TABLE IF NOT EXISTS public.divulgacao_queue_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pct_pagas_inicial integer NOT NULL DEFAULT 70 CHECK (pct_pagas_inicial BETWEEN 0 AND 100),
  pct_min_gratuitas integer NOT NULL DEFAULT 15 CHECK (pct_min_gratuitas BETWEEN 1 AND 100),
  pct_max_pagas integer NOT NULL DEFAULT 90 CHECK (pct_max_pagas BETWEEN 0 AND 99),
  modo_auto boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.divulgacao_queue_config ENABLE ROW LEVEL SECURITY;
-- sem policies: leitura/escrita SOMENTE via RPCs SECURITY DEFINER
INSERT INTO public.divulgacao_queue_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Atualizar configuração (admin) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.divulgacao_config_set(
  p_pagas_inicial integer, p_min_gratuitas integer, p_max_pagas integer, p_modo_auto boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.mp_is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_min_gratuitas < 1 THEN
    RAISE EXCEPTION 'O mínimo garantido para gratuitas nunca pode ser zero.';
  END IF;
  IF p_max_pagas + p_min_gratuitas > 100 THEN
    RAISE EXCEPTION 'Máximo de pagas + mínimo de gratuitas não pode passar de 100%%.';
  END IF;
  UPDATE public.divulgacao_queue_config SET
    pct_pagas_inicial = p_pagas_inicial,
    pct_min_gratuitas = p_min_gratuitas,
    pct_max_pagas = p_max_pagas,
    modo_auto = p_modo_auto,
    updated_at = now()
  WHERE id = 1;
  RETURN jsonb_build_object('success', true);
END $$;

-- ── Motor de alocação dinâmica (recalculado a cada chamada) ────────
CREATE OR REPLACE FUNCTION public.divulgacao_alocacao()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cfg record;
  v_prof_total integer;      -- profissionais com grupos válidos (capacidade máxima)
  v_prof_online integer;     -- desses, online agora
  v_cap integer;             -- capacidade operacional usada no cálculo
  v_fila_paga integer;
  v_fila_gratis integer;
  v_em_andamento integer;
  v_reserva_gratis integer;
  v_base_pagas integer;
  v_max_pagas_slots integer;
  v_alvo_pagas integer;
  v_slots_pagas integer;
  v_slots_gratis integer;
  v_ocioso integer;
  v_tempo_medio numeric;
BEGIN
  IF NOT public.mp_is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  SELECT * INTO cfg FROM public.divulgacao_queue_config WHERE id = 1;

  SELECT count(DISTINCT g.owner_user_id),
         count(DISTINCT g.owner_user_id) FILTER (WHERE mp.is_online)
    INTO v_prof_total, v_prof_online
  FROM public.whatsapp_groups g
  LEFT JOIN public.motoboy_profiles mp ON mp.user_id = g.owner_user_id
  WHERE g.is_active AND g.validation_status = 'approved';

  v_cap := GREATEST(COALESCE(NULLIF(v_prof_online, 0), v_prof_total), 0);

  SELECT count(*) FILTER (WHERE origem IN ('patrocinada','pacote')),
         count(*) FILTER (WHERE origem IN ('gratuita_diaria','organica'))
    INTO v_fila_paga, v_fila_gratis
  FROM public.campaign_queue
  WHERE status NOT IN ('cancelled','expired','posted','publicada','concluida','done');

  SELECT count(*) INTO v_em_andamento
  FROM public.campaign_posting_targets t
  WHERE t.status IN ('claimed','reserved')
    AND (t.claimed_until IS NULL OR t.claimed_until > now());

  -- REGRA 3: parcela mínima das gratuitas nunca zera (se houver demanda grátis)
  v_reserva_gratis := CASE WHEN v_fila_gratis > 0
    THEN GREATEST(1, ceil(v_cap * cfg.pct_min_gratuitas / 100.0))::integer ELSE 0 END;
  v_base_pagas := ceil(v_cap * cfg.pct_pagas_inicial / 100.0)::integer;
  v_max_pagas_slots := floor(v_cap * cfg.pct_max_pagas / 100.0)::integer;

  -- REGRA 2: no modo auto, excesso de pagas expande até o teto configurado
  v_alvo_pagas := CASE WHEN cfg.modo_auto
    THEN GREATEST(v_base_pagas, LEAST(v_fila_paga, v_max_pagas_slots))
    ELSE v_base_pagas END;

  v_slots_pagas := LEAST(v_fila_paga, v_alvo_pagas, GREATEST(v_cap - v_reserva_gratis, 0));
  -- REGRA 1 e 4: toda capacidade não usada pelas pagas volta para as gratuitas
  v_slots_gratis := LEAST(v_fila_gratis, GREATEST(v_cap - v_slots_pagas, 0));
  -- REGRA 5: ocioso só existe quando NÃO há demanda elegível
  v_ocioso := GREATEST(v_cap - v_slots_pagas - v_slots_gratis, 0);

  SELECT avg(EXTRACT(EPOCH FROM (posted_at - created_at)) / 60.0)
    INTO v_tempo_medio
  FROM public.campaign_queue
  WHERE posted_at IS NOT NULL AND posted_at > now() - interval '30 days';

  RETURN jsonb_build_object(
    'success', true,
    'config', jsonb_build_object(
      'pct_pagas_inicial', cfg.pct_pagas_inicial,
      'pct_min_gratuitas', cfg.pct_min_gratuitas,
      'pct_max_pagas', cfg.pct_max_pagas,
      'modo_auto', cfg.modo_auto),
    'profissionais_total', v_prof_total,
    'profissionais_disponiveis', v_prof_online,
    'capacidade_total', v_cap,
    'capacidade_utilizada', v_slots_pagas + v_slots_gratis,
    'capacidade_ociosa', v_ocioso,
    'fila_paga', v_fila_paga,
    'fila_gratuita', v_fila_gratis,
    'em_andamento', v_em_andamento,
    'slots_pagas', v_slots_pagas,
    'slots_gratuitas', v_slots_gratis,
    'pct_atual_pagas', CASE WHEN v_slots_pagas + v_slots_gratis > 0
      THEN round(v_slots_pagas * 100.0 / (v_slots_pagas + v_slots_gratis)) ELSE 0 END,
    'pct_atual_gratuitas', CASE WHEN v_slots_pagas + v_slots_gratis > 0
      THEN round(v_slots_gratis * 100.0 / (v_slots_pagas + v_slots_gratis)) ELSE 0 END,
    'tempo_medio_min', COALESCE(round(v_tempo_medio), NULL),
    'previsao_min', CASE WHEN v_cap > 0 AND v_tempo_medio IS NOT NULL
      THEN ceil((v_fila_paga + v_fila_gratis)::numeric / v_cap) * round(v_tempo_medio)
      ELSE NULL END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.divulgacao_config_set(integer,integer,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.divulgacao_alocacao() TO authenticated;
