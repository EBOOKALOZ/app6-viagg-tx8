-- ═══════════════════════════════════════════════════════════
-- POSTADOR 3 — Batch/Lot Evolution
-- Lotes de 3 produtos por loja para postagem territorial
-- Run ALL of this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Cleanup: remover tabelas/views de runs anteriores parciais
DROP VIEW IF EXISTS public.postador_lotes_board CASCADE;
DROP VIEW IF EXISTS public.postador_commission_eligibility CASCADE;
DROP TABLE IF EXISTS public.posting_lot_events CASCADE;
DROP TABLE IF EXISTS public.posting_lot_items CASCADE;
DROP TABLE IF EXISTS public.posting_lots CASCADE;

DO $$ BEGIN RAISE LOG 'POSTADOR 3 — LOTS MIGRATION START'; END $$;


-- ═══════════════════════════════════════
-- PARTE 1: Tabela posting_lots
-- Lote = 1 loja + N produtos (ideal 3)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.posting_lots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_user_id     UUID NOT NULL,
  store_name        TEXT,
  store_logo_url    TEXT,
  target_city       TEXT,
  target_region     TEXT,
  target_bairro     TEXT,
  status            TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','claimed','posted','cooldown','expired','cancelled')),
  operator_user_id  UUID,
  claimed_at        TIMESTAMPTZ,
  claimed_until     TIMESTAMPTZ,
  posted_at         TIMESTAMPTZ,
  cooldown_until    TIMESTAMPTZ,
  proof_type        TEXT,
  proof_url         TEXT,
  proof_text        TEXT,
  notes             TEXT,
  lot_number        INT DEFAULT 1,
  items_count       INT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.posting_lots IS
'POSTADOR 3: Lote de postagem territorial. Cada lote agrupa 3 produtos da mesma loja para postagem em grupos de WhatsApp.';

ALTER TABLE public.posting_lots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_lots' AND policyname = 'Authenticated can read posting lots'
  ) THEN
    CREATE POLICY "Authenticated can read posting lots"
      ON public.posting_lots FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- Nota: Todas as mutacoes passam por RPCs SECURITY DEFINER.
-- Nao precisa de policy de escrita direta.

CREATE INDEX IF NOT EXISTS idx_posting_lots_status ON public.posting_lots (status);
CREATE INDEX IF NOT EXISTS idx_posting_lots_store ON public.posting_lots (store_user_id);
CREATE INDEX IF NOT EXISTS idx_posting_lots_operator ON public.posting_lots (operator_user_id);
CREATE INDEX IF NOT EXISTS idx_posting_lots_cooldown ON public.posting_lots (cooldown_until);


-- ═══════════════════════════════════════
-- PARTE 2: Tabela posting_lot_items
-- Itens do lote (3 produtos)
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.posting_lot_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id            UUID NOT NULL REFERENCES public.posting_lots(id) ON DELETE CASCADE,
  product_id        UUID,
  product_name      TEXT NOT NULL,
  product_price     NUMERIC,
  product_image_url TEXT,
  product_description TEXT,
  position          INT NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.posting_lot_items IS
'POSTADOR 3: Itens de um lote de postagem. Cada lote tem idealmente 3 itens (produtos da mesma loja).';

ALTER TABLE public.posting_lot_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_lot_items' AND policyname = 'Authenticated can read lot items'
  ) THEN
    CREATE POLICY "Authenticated can read lot items"
      ON public.posting_lot_items FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lot_items_lot ON public.posting_lot_items (lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_items_product ON public.posting_lot_items (product_id);


-- ═══════════════════════════════════════
-- PARTE 3: Tabela posting_lot_events
-- Tracking e auditoria de lotes
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.posting_lot_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id      UUID NOT NULL REFERENCES public.posting_lots(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL
              CHECK (event_type IN ('created','viewed','claimed','confirmed','released','expired','click','error')),
  user_id     UUID,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.posting_lot_events IS
'POSTADOR 3: Eventos de auditoria e metricas. Rastreia todo ciclo de vida do lote.';

ALTER TABLE public.posting_lot_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_lot_events' AND policyname = 'Authenticated can read lot events'
  ) THEN
    CREATE POLICY "Authenticated can read lot events"
      ON public.posting_lot_events FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'posting_lot_events' AND policyname = 'Authenticated can insert lot events'
  ) THEN
    CREATE POLICY "Authenticated can insert lot events"
      ON public.posting_lot_events FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lot_events_lot ON public.posting_lot_events (lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_events_type ON public.posting_lot_events (event_type);
CREATE INDEX IF NOT EXISTS idx_lot_events_user ON public.posting_lot_events (user_id);


-- ═══════════════════════════════════════
-- PARTE 4: RPC generate_posting_lots
-- Auto-gera lotes de 3 produtos por loja
-- ═══════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname='generate_posting_lots' AND pronamespace='public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.generate_posting_lots()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_store       record;
  v_product     record;
  v_lot_id      UUID;
  v_position    INT;
  v_lots_created INT := 0;
  v_items_added  INT := 0;
  v_now         TIMESTAMPTZ := now();
BEGIN
  -- Para cada lojista com produtos ativos
  FOR v_store IN
    SELECT
      mp.user_id AS store_user_id,
      COALESCE(ms.nome_loja, ms.store_name, p.name, 'Loja') AS store_name,
      p.logo_url AS store_logo_url,
      COALESCE(ms.city, ms.cidade) AS target_city,
      ms.bairro AS target_bairro,
      ms.region AS target_region,
      COUNT(mp.id) AS product_count
    FROM public.merchant_products mp
    LEFT JOIN public.merchant_stores ms ON ms.user_id = mp.user_id
    LEFT JOIN public.profiles p ON p.id = mp.user_id
    WHERE mp.preco > 0
      AND mp.nome IS NOT NULL
      AND mp.nome != ''
    GROUP BY mp.user_id, ms.nome_loja, ms.store_name, p.name, p.logo_url, ms.city, ms.cidade, ms.bairro, ms.region
    HAVING COUNT(mp.id) >= 1
    ORDER BY COUNT(mp.id) DESC
  LOOP
    -- Verificar se ja existe lote ativo/cooldown para esta loja
    IF EXISTS (
      SELECT 1 FROM public.posting_lots
      WHERE store_user_id = v_store.store_user_id
        AND status IN ('available', 'claimed', 'cooldown')
    ) THEN
      CONTINUE;
    END IF;

    -- Criar lote
    INSERT INTO public.posting_lots (
      store_user_id, store_name, store_logo_url,
      target_city, target_region, target_bairro,
      status, created_at, updated_at
    ) VALUES (
      v_store.store_user_id,
      v_store.store_name,
      v_store.store_logo_url,
      v_store.target_city,
      v_store.target_region,
      v_store.target_bairro,
      'available',
      v_now, v_now
    ) RETURNING id INTO v_lot_id;

    -- Adicionar ate 3 produtos ao lote
    v_position := 0;
    FOR v_product IN
      SELECT id, nome, preco, descricao, imagem_url
      FROM public.merchant_products
      WHERE user_id = v_store.store_user_id
        AND preco > 0
        AND nome IS NOT NULL AND nome != ''
      ORDER BY updated_at DESC
      LIMIT 3
    LOOP
      v_position := v_position + 1;
      INSERT INTO public.posting_lot_items (
        lot_id, product_id, product_name, product_price,
        product_image_url, product_description, position
      ) VALUES (
        v_lot_id,
        v_product.id,
        v_product.nome,
        v_product.preco,
        v_product.imagem_url,
        v_product.descricao,
        v_position
      );
      v_items_added := v_items_added + 1;
    END LOOP;

    -- Atualizar contagem de itens
    UPDATE public.posting_lots SET items_count = v_position WHERE id = v_lot_id;

    -- Registrar evento de criacao
    INSERT INTO public.posting_lot_events (lot_id, event_type, metadata)
    VALUES (v_lot_id, 'created', jsonb_build_object('items_count', v_position, 'store_name', v_store.store_name));

    v_lots_created := v_lots_created + 1;
  END LOOP;

  -- Reativar lotes com cooldown expirado
  UPDATE public.posting_lots
  SET status = 'expired',
      updated_at = v_now
  WHERE status = 'cooldown'
    AND cooldown_until IS NOT NULL
    AND cooldown_until < v_now;

  RETURN jsonb_build_object(
    'ok', true,
    'lots_created', v_lots_created,
    'items_added', v_items_added,
    'generated_at', v_now::text
  );
END; $$;

COMMENT ON FUNCTION public.generate_posting_lots IS
'POSTADOR 3: Auto-gera lotes de ate 3 produtos por loja. Pula lojas que ja tem lote ativo/claimed/cooldown. Reativa lotes com cooldown expirado.';


-- ═══════════════════════════════════════
-- PARTE 5: RPC claim_posting_lot
-- Claim atomico de lote com FOR UPDATE
-- ═══════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname='claim_posting_lot' AND pronamespace='public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.claim_posting_lot(
  p_lot_id UUID
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lot          record;
  v_operator     UUID;
  v_now          TIMESTAMPTZ := now();
  v_claim_window INTERVAL := '30 minutes';
  v_max_claims   INT := 3;
  v_active_claims INT;
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  -- Auto-release expired claims
  UPDATE public.posting_lots
  SET status = 'available',
      operator_user_id = NULL,
      claimed_at = NULL,
      claimed_until = NULL,
      updated_at = v_now
  WHERE id = p_lot_id
    AND status = 'claimed'
    AND claimed_until IS NOT NULL
    AND claimed_until < v_now;

  -- Lock and fetch lot
  SELECT * INTO v_lot
  FROM public.posting_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Lote nao encontrado');
  END IF;

  -- Re-claim: extend window if already claimed by this operator
  IF v_lot.status = 'claimed' AND v_lot.operator_user_id = v_operator THEN
    UPDATE public.posting_lots
    SET claimed_until = v_now + v_claim_window,
        updated_at = v_now
    WHERE id = p_lot_id;

    RETURN jsonb_build_object(
      'ok', true, 'lot_id', p_lot_id,
      'claimed_at', v_lot.claimed_at::text,
      'claimed_until', (v_now + v_claim_window)::text,
      'extended', true
    );
  END IF;

  -- Claimed by another operator and not expired
  IF v_lot.status = 'claimed' AND v_lot.operator_user_id != v_operator THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'Lote ja reservado por outro operador',
      'claimed_until', v_lot.claimed_until::text
    );
  END IF;

  -- Only available lots can be claimed
  IF v_lot.status != 'available' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Lote com status "%s" nao pode ser reservado', v_lot.status)
    );
  END IF;

  -- Max active claims per operator
  SELECT COUNT(*) INTO v_active_claims
  FROM public.posting_lots
  WHERE operator_user_id = v_operator
    AND status = 'claimed'
    AND (claimed_until IS NULL OR claimed_until > v_now);

  IF v_active_claims >= v_max_claims THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Voce ja tem %s lotes reservados. Confirme ou libere antes de reservar mais.', v_active_claims),
      'active_claims', v_active_claims
    );
  END IF;

  -- Atomic claim
  UPDATE public.posting_lots
  SET status = 'claimed',
      operator_user_id = v_operator,
      claimed_at = v_now,
      claimed_until = v_now + v_claim_window,
      updated_at = v_now
  WHERE id = p_lot_id;

  -- Track event
  INSERT INTO public.posting_lot_events (lot_id, event_type, user_id)
  VALUES (p_lot_id, 'claimed', v_operator);

  RETURN jsonb_build_object(
    'ok', true, 'lot_id', p_lot_id,
    'claimed_at', v_now::text,
    'claimed_until', (v_now + v_claim_window)::text,
    'active_claims', v_active_claims + 1
  );
END; $$;

COMMENT ON FUNCTION public.claim_posting_lot IS
'POSTADOR 3: Claim atomico de lote. FOR UPDATE lock, 30min expiry, max 3 lotes simultaneos.';


-- ═══════════════════════════════════════
-- PARTE 6: RPC confirm_posting_lot
-- Confirma postagem e aplica cooldown de 6 dias
-- ═══════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname='confirm_posting_lot' AND pronamespace='public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_posting_lot(
  p_lot_id        UUID,
  p_proof_type    TEXT DEFAULT NULL,
  p_proof_url     TEXT DEFAULT NULL,
  p_proof_text    TEXT DEFAULT NULL,
  p_notes         TEXT DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lot       record;
  v_operator  UUID;
  v_now       TIMESTAMPTZ := now();
  v_cooldown  INTERVAL := '2 minutes'; -- TESTE: trocar para '6 days' em producao
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  SELECT * INTO v_lot
  FROM public.posting_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Lote nao encontrado');
  END IF;

  -- Validate operator
  IF v_lot.operator_user_id IS NOT NULL AND v_lot.operator_user_id != v_operator THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Lote pertence a outro operador');
  END IF;

  IF v_lot.status NOT IN ('claimed', 'available') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', format('Lote com status "%s" nao pode ser confirmado', v_lot.status)
    );
  END IF;

  -- Confirm: set posted + cooldown
  UPDATE public.posting_lots
  SET status = 'cooldown',
      operator_user_id = v_operator,
      posted_at = v_now,
      cooldown_until = v_now + v_cooldown,
      proof_type = COALESCE(p_proof_type, proof_type),
      proof_url = COALESCE(p_proof_url, proof_url),
      proof_text = COALESCE(p_proof_text, proof_text),
      notes = COALESCE(p_notes, notes),
      updated_at = v_now
  WHERE id = p_lot_id;

  -- Insert posting_history record for each item (auditoria cruzada com POSTADOR 2)
  INSERT INTO public.posting_history (
    campaign_queue_id, operator_user_id, final_status,
    template_hash, message_text, posted_at,
    proof_url, proof_type, proof_uploaded_at
  )
  SELECT
    NULL, v_operator, 'posted',
    'lot:' || p_lot_id::text, v_lot.store_name || ' - Lote #' || v_lot.lot_number,
    v_now,
    p_proof_url, COALESCE(p_proof_type, 'none'),
    CASE WHEN p_proof_url IS NOT NULL THEN v_now ELSE NULL END;

  -- Track event
  INSERT INTO public.posting_lot_events (lot_id, event_type, user_id, metadata)
  VALUES (p_lot_id, 'confirmed', v_operator, jsonb_build_object(
    'proof_type', p_proof_type, 'proof_url', p_proof_url,
    'cooldown_until', (v_now + v_cooldown)::text
  ));

  RETURN jsonb_build_object(
    'ok', true,
    'lot_id', p_lot_id,
    'posted_at', v_now::text,
    'cooldown_until', (v_now + v_cooldown)::text,
    'store_name', v_lot.store_name,
    'items_count', v_lot.items_count
  );
END; $$;

COMMENT ON FUNCTION public.confirm_posting_lot IS
'POSTADOR 3: Confirma postagem do lote. Aplica cooldown de 6 dias. Registra em posting_history e posting_lot_events.';


-- ═══════════════════════════════════════
-- PARTE 7: RPC release_lot_claim
-- Liberacao voluntaria pelo operador
-- ═══════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname='release_lot_claim' AND pronamespace='public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.release_lot_claim(
  p_lot_id UUID
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_lot      record;
  v_operator UUID;
  v_now      TIMESTAMPTZ := now();
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  SELECT * INTO v_lot
  FROM public.posting_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Lote nao encontrado');
  END IF;

  IF v_lot.status != 'claimed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Lote nao esta reservado');
  END IF;

  IF v_lot.operator_user_id != v_operator THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Voce nao pode liberar o lote de outro operador');
  END IF;

  UPDATE public.posting_lots
  SET status = 'available',
      operator_user_id = NULL,
      claimed_at = NULL,
      claimed_until = NULL,
      updated_at = v_now
  WHERE id = p_lot_id;

  INSERT INTO public.posting_lot_events (lot_id, event_type, user_id)
  VALUES (p_lot_id, 'released', v_operator);

  RETURN jsonb_build_object('ok', true, 'lot_id', p_lot_id, 'released_at', v_now::text);
END; $$;

COMMENT ON FUNCTION public.release_lot_claim IS
'POSTADOR 3: Liberacao voluntaria de claim de lote pelo operador.';


-- ═══════════════════════════════════════
-- PARTE 8: RPC get_my_lot_kpis
-- KPIs do operador para lotes
-- ═══════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname='get_my_lot_kpis' AND pronamespace='public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_lot_kpis()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_operator       UUID;
  v_now            TIMESTAMPTZ := now();
  v_posted_count   INT;
  v_claimed_count  INT;
  v_cooldown_count INT;
  v_last_posted    TIMESTAMPTZ;
  v_next_available TIMESTAMPTZ;
BEGIN
  v_operator := auth.uid();
  IF v_operator IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Usuario nao autenticado');
  END IF;

  -- Contar lotes postados pelo operador (historico total)
  SELECT COUNT(*), MAX(posted_at)
  INTO v_posted_count, v_last_posted
  FROM public.posting_lots
  WHERE operator_user_id = v_operator
    AND status IN ('posted', 'cooldown');

  -- Contar lotes claimed ativos
  SELECT COUNT(*) INTO v_claimed_count
  FROM public.posting_lots
  WHERE operator_user_id = v_operator
    AND status = 'claimed'
    AND (claimed_until IS NULL OR claimed_until > v_now);

  -- Contar lotes em cooldown
  SELECT COUNT(*) INTO v_cooldown_count
  FROM public.posting_lots
  WHERE operator_user_id = v_operator
    AND status = 'cooldown'
    AND cooldown_until > v_now;

  -- Proximo lote disponivel (cooldown mais proximo de expirar)
  SELECT MIN(cooldown_until) INTO v_next_available
  FROM public.posting_lots
  WHERE operator_user_id = v_operator
    AND status = 'cooldown'
    AND cooldown_until > v_now;

  RETURN jsonb_build_object(
    'ok', true,
    'posted_count', COALESCE(v_posted_count, 0),
    'claimed_count', COALESCE(v_claimed_count, 0),
    'cooldown_count', COALESCE(v_cooldown_count, 0),
    'last_posted_at', v_last_posted::text,
    'next_available_at', v_next_available::text
  );
END; $$;

COMMENT ON FUNCTION public.get_my_lot_kpis IS
'POSTADOR 3: KPIs do operador para lotes. Retorna contagem de postados, claimed, cooldown e proximo disponivel.';


-- ═══════════════════════════════════════
-- PARTE 9: View postador_lotes_board
-- View operacional com itens agregados em JSON
-- ═══════════════════════════════════════

DROP VIEW IF EXISTS public.postador_lotes_board;

CREATE VIEW public.postador_lotes_board AS
SELECT
  pl.id                 AS lot_id,
  pl.store_user_id,
  pl.store_name,
  pl.store_logo_url,
  pl.target_city,
  pl.target_region,
  pl.target_bairro,
  pl.status             AS lot_status,
  pl.operator_user_id,
  pl.claimed_at,
  pl.claimed_until,
  pl.posted_at,
  pl.cooldown_until,
  pl.proof_type,
  pl.proof_url,
  pl.notes,
  pl.items_count,
  pl.lot_number,
  pl.created_at         AS lot_created_at,
  pl.updated_at         AS lot_updated_at,
  -- Items aggregated as JSON array
  COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', pli.id,
        'product_id', pli.product_id,
        'product_name', pli.product_name,
        'product_price', pli.product_price,
        'product_image_url', pli.product_image_url,
        'product_description', pli.product_description,
        'position', pli.position
      ) ORDER BY pli.position
    )
    FROM public.posting_lot_items pli
    WHERE pli.lot_id = pl.id
    ),
    '[]'::jsonb
  ) AS items,
  -- Operator name
  p.name AS operator_name
FROM public.posting_lots pl
LEFT JOIN public.profiles p ON p.id = pl.operator_user_id;

ALTER VIEW public.postador_lotes_board OWNER TO postgres;
GRANT SELECT ON public.postador_lotes_board TO authenticated;

COMMENT ON VIEW public.postador_lotes_board IS
'POSTADOR 3: View operacional de lotes com itens agregados em JSON. Fonte de verdade do painel do motoboy.';


-- ═══════════════════════════════════════
-- PARTE 10: View postador_commission_eligibility
-- Elegibilidade de comissao backend-driven
-- Fonte de verdade: posting_history confirmada
-- Expansivel via actor_user_id + actor_profile_type
-- ═══════════════════════════════════════

DROP VIEW IF EXISTS public.postador_commission_eligibility;

CREATE VIEW public.postador_commission_eligibility AS
SELECT
  pl.operator_user_id      AS actor_user_id,
  'motoboy'                AS actor_profile_type,
  p.name                   AS actor_name,
  -- Lotes confirmados nos ultimos 30 dias (fonte de verdade operacional)
  COUNT(*) FILTER (
    WHERE pl.posted_at >= (now() - INTERVAL '30 days')
  ) AS confirmed_lots_30d,
  -- Total de lotes confirmados (historico completo)
  COUNT(*) AS confirmed_lots_total,
  -- Ultima postagem confirmada
  MAX(pl.posted_at) AS last_confirmed_at,
  -- Data de expiracao da elegibilidade (30 dias apos ultima postagem)
  MAX(pl.posted_at) + INTERVAL '30 days' AS eligibility_expires_at,
  -- Elegibilidade: postagem confirmada na janela
  CASE
    WHEN COUNT(*) FILTER (WHERE pl.posted_at >= (now() - INTERVAL '30 days')) > 0
    THEN true
    ELSE false
  END AS is_eligible_for_commission,
  -- Dias restantes ate expirar elegibilidade
  CASE
    WHEN MAX(pl.posted_at) + INTERVAL '30 days' > now()
    THEN EXTRACT(DAY FROM (MAX(pl.posted_at) + INTERVAL '30 days' - now()))::int
    ELSE 0
  END AS days_until_expiry,
  -- Alerta de vencimento (< 7 dias)
  CASE
    WHEN MAX(pl.posted_at) + INTERVAL '30 days' > now()
      AND MAX(pl.posted_at) + INTERVAL '30 days' < (now() + INTERVAL '7 days')
    THEN true
    ELSE false
  END AS expiry_warning
FROM public.posting_lots pl
LEFT JOIN public.profiles p ON p.id = pl.operator_user_id
WHERE pl.operator_user_id IS NOT NULL
  AND pl.status IN ('posted', 'cooldown', 'expired')
GROUP BY pl.operator_user_id, p.name;

ALTER VIEW public.postador_commission_eligibility OWNER TO postgres;
GRANT SELECT ON public.postador_commission_eligibility TO authenticated;

COMMENT ON VIEW public.postador_commission_eligibility IS
'POSTADOR 3: View backend-driven de elegibilidade de comissao. Baseia-se 100%% em lotes confirmados (posting_lots). Usa actor_user_id/actor_profile_type para expansao futura.';


DO $$ BEGIN RAISE LOG 'POSTADOR 3 — LOTS MIGRATION COMPLETE'; END $$;
