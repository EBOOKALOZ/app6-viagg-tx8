-- ============================================================
-- ECOSSISTEMA DE DIVULGAÇÃO UNIFICADO (2026-07-12)
--
-- REUTILIZA a infraestrutura existente:
--   • fila = public.campaign_queue (única fila inteligente)
--   • porta de entrada = create_merchant_campaign_queue_item (inalterada)
--   • profissionais seguem no fluxo Postador (board/lotes/prova)
--
-- Adaptações mínimas (REGRA 9):
--   1. campaign_queue.origem  — tag da origem da divulgação
--   2. divulgacao_packages    — catálogo de pacotes (10/25/50/100)
--   3. divulgacao_credits_ledger — saldo de divulgações compradas
--   4. RPCs: divulgacao_status / merchant_dispatch_divulgacao /
--            divulgacao_admin_grant
--
-- Regras de negócio:
--   • 1 divulgação GRATUITA por dia por anunciante (dia local Cuiabá)
--   • depois da gratuita, consome 1 crédito de pacote
--   • prioridade na fila: patrocinada(10) > pacote(5) > gratuita(2) > orgânica(0)
-- Idempotente. Nada de escrita direta: apps usam SOMENTE as RPCs.
-- ============================================================

-- ── 1. Tag de origem na fila existente ─────────────────────────────
ALTER TABLE public.campaign_queue
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'organica';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_queue_origem_chk'
  ) THEN
    ALTER TABLE public.campaign_queue
      ADD CONSTRAINT campaign_queue_origem_chk
      CHECK (origem IN ('patrocinada','pacote','gratuita_diaria','organica'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cq_origem_user_dia
  ON public.campaign_queue (created_by_user_id, origem, created_at);

-- ── 2. Catálogo de pacotes de divulgação ───────────────────────────
CREATE TABLE IF NOT EXISTS public.divulgacao_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  qtd_divulgacoes integer NOT NULL UNIQUE CHECK (qtd_divulgacoes > 0),
  preco_brl numeric(10,2) NOT NULL CHECK (preco_brl >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.divulgacao_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS divulgacao_packages_read ON public.divulgacao_packages;
CREATE POLICY divulgacao_packages_read ON public.divulgacao_packages
  FOR SELECT TO authenticated USING (ativo);

INSERT INTO public.divulgacao_packages (nome, qtd_divulgacoes, preco_brl) VALUES
  ('Pacote Start',    10,  19.90),
  ('Pacote Impulso',  25,  44.90),
  ('Pacote Turbo',    50,  79.90),
  ('Pacote Máximo',  100, 139.90)
ON CONFLICT (qtd_divulgacoes) DO NOTHING;

-- ── 3. Ledger de créditos de divulgação (saldo = soma dos deltas) ──
CREATE TABLE IF NOT EXISTS public.divulgacao_credits_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  motivo text NOT NULL CHECK (motivo IN ('compra_pacote','divulgacao','ajuste','bonus')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.divulgacao_credits_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS divulgacao_ledger_owner_read ON public.divulgacao_credits_ledger;
CREATE POLICY divulgacao_ledger_owner_read ON public.divulgacao_credits_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- escrita SOMENTE via RPCs SECURITY DEFINER (nenhuma policy de INSERT)

CREATE INDEX IF NOT EXISTS idx_divulgacao_ledger_user
  ON public.divulgacao_credits_ledger (user_id, created_at);

-- ── 4. Saldo (helper interno) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.divulgacao_saldo(p_user uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(sum(delta), 0)::integer
  FROM public.divulgacao_credits_ledger WHERE user_id = p_user;
$$;

-- ── 5. Status consolidado do anunciante ────────────────────────────
CREATE OR REPLACE FUNCTION public.divulgacao_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dia_ini timestamptz;
  v_gratis_usada boolean;
  v_saldo integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  v_dia_ini := ((now() AT TIME ZONE 'America/Cuiaba')::date::timestamp AT TIME ZONE 'America/Cuiaba');

  SELECT EXISTS (
    SELECT 1 FROM public.campaign_queue
    WHERE created_by_user_id = v_uid
      AND origem = 'gratuita_diaria'
      AND created_at >= v_dia_ini
      AND status <> 'cancelled'
  ) INTO v_gratis_usada;

  v_saldo := public.divulgacao_saldo(v_uid);

  RETURN jsonb_build_object(
    'success', true,
    'gratis_usada_hoje', v_gratis_usada,
    'gratis_disponivel', NOT v_gratis_usada,
    'saldo_pacotes', v_saldo,
    'na_fila', (SELECT count(*) FROM public.campaign_queue
                 WHERE created_by_user_id = v_uid
                   AND status NOT IN ('cancelled','concluida','publicada','posted','done')),
    'publicadas', (SELECT count(*) FROM public.campaign_queue
                    WHERE created_by_user_id = v_uid
                      AND status IN ('concluida','publicada','posted','done')),
    'postagens_realizadas', (SELECT count(*) FROM public.posting_history ph
                              JOIN public.campaign_queue cq ON cq.id = ph.campaign_queue_id
                              WHERE cq.created_by_user_id = v_uid
                                AND ph.final_status IN ('posted','confirmed','success')),
    'grupos_alcancados', (SELECT count(DISTINCT ph.whatsapp_group_id) FROM public.posting_history ph
                           JOIN public.campaign_queue cq ON cq.id = ph.campaign_queue_id
                           WHERE cq.created_by_user_id = v_uid
                             AND ph.final_status IN ('posted','confirmed','success')),
    'pacotes', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'id', id, 'nome', nome,
                  'qtd', qtd_divulgacoes, 'preco_brl', preco_brl)
                  ORDER BY qtd_divulgacoes), '[]'::jsonb)
                 FROM public.divulgacao_packages WHERE ativo)
  );
END $$;

-- ── 6. Porta ÚNICA do anunciante: despacha respeitando gratuita/pacote ──
CREATE OR REPLACE FUNCTION public.merchant_dispatch_divulgacao(
  p_merchant_store_id uuid,
  p_product_id uuid,
  p_campaign_type text,
  p_title text,
  p_message_text text,
  p_media_url text DEFAULT NULL,
  p_target_city text DEFAULT NULL,
  p_target_region text DEFAULT NULL,
  p_source_type text DEFAULT 'merchant_marketing_product',
  p_source_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dia_ini timestamptz;
  v_gratis_usada boolean;
  v_saldo integer;
  v_origem text;
  v_priority integer;
  v_row public.campaign_queue;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  v_dia_ini := ((now() AT TIME ZONE 'America/Cuiaba')::date::timestamp AT TIME ZONE 'America/Cuiaba');

  SELECT EXISTS (
    SELECT 1 FROM public.campaign_queue
    WHERE created_by_user_id = v_uid
      AND origem = 'gratuita_diaria'
      AND created_at >= v_dia_ini
      AND status <> 'cancelled'
  ) INTO v_gratis_usada;

  v_saldo := public.divulgacao_saldo(v_uid);

  IF NOT v_gratis_usada THEN
    v_origem := 'gratuita_diaria';
    v_priority := 2;   -- REGRA 3: gratuita NUNCA acima de paga
  ELSIF v_saldo > 0 THEN
    v_origem := 'pacote';
    v_priority := 5;
  ELSE
    RAISE EXCEPTION 'SEM_SALDO: divulgação gratuita de hoje já utilizada e sem créditos de pacote. Adquira um pacote para continuar.';
  END IF;

  -- Reutiliza a porta oficial existente da fila (regras técnicas preservadas)
  v_row := public.create_merchant_campaign_queue_item(
    p_created_by_user_id  => v_uid,
    p_merchant_store_id   => p_merchant_store_id,
    p_product_id          => p_product_id,
    p_campaign_type       => p_campaign_type,
    p_title               => p_title,
    p_message_text        => p_message_text,
    p_media_url           => p_media_url,
    p_target_city         => p_target_city,
    p_target_region       => p_target_region,
    p_priority            => v_priority,
    p_source_type         => p_source_type,
    p_source_id           => p_source_id
  );

  UPDATE public.campaign_queue SET origem = v_origem WHERE id = v_row.id;

  IF v_origem = 'pacote' THEN
    INSERT INTO public.divulgacao_credits_ledger (user_id, delta, motivo, ref_id)
    VALUES (v_uid, -1, 'divulgacao', v_row.id);
    v_saldo := v_saldo - 1;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_row.id,
    'origem', v_origem,
    'saldo_restante', v_saldo,
    'gratis_disponivel_apos', (v_origem <> 'gratuita_diaria' AND NOT v_gratis_usada)
  );
END $$;

-- ── 7. Concessão de créditos (admin; compra via MP entra na Fase 2) ──
CREATE OR REPLACE FUNCTION public.divulgacao_admin_grant(
  p_user_id uuid, p_qtd integer, p_motivo text DEFAULT 'compra_pacote', p_ref uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF p_qtd = 0 THEN
    RAISE EXCEPTION 'qtd_invalida';
  END IF;
  INSERT INTO public.divulgacao_credits_ledger (user_id, delta, motivo, ref_id)
  VALUES (p_user_id, p_qtd, COALESCE(p_motivo, 'ajuste'), p_ref);
  RETURN jsonb_build_object('success', true,
    'novo_saldo', public.divulgacao_saldo(p_user_id));
END $$;

GRANT EXECUTE ON FUNCTION public.divulgacao_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_dispatch_divulgacao(uuid,uuid,text,text,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.divulgacao_admin_grant(uuid,integer,text,uuid) TO authenticated;
