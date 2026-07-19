-- ════════════════════════════════════════════════════════════════════════════
-- ORION-ARREMATES FASE A v1.0 — Fundação estrutural do Sistema de Arremates
--
-- Aprovada por: AUDIT LEILÕES v1.0 · ARCHITECTURE Pós-Leilão v1.0 (D1-D8) ·
--               REVIEW FASE A v1.0 (🟢 liberada) · HOTFIX FASE A.0 (🟢 P0 eliminados)
--
-- ESCOPO ESTRITO (só isto): estado oficial + máquina de estados + eventos +
-- integridade (winner/valor imutáveis) + consolidação de RPCs mortas.
-- NÃO implementa: pagamento/MP/escrow/carteiras/notificações/entrega/contrato/
-- reembolso/telas/IA nova/APIs públicas. Nenhuma integração é ATIVADA.
--
-- Entidade oficial (D1): public.orion_auction_settlements (PK listing_id) —
-- NENHUMA tabela nova. Apenas colunas aditivas nullable.
--
-- Idempotente e reversível (rollback no fim + DOCS/orion-arremates-fase-a-*).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── ETAPA 1 — Estado oficial (colunas aditivas na entidade aprovada) ───────
ALTER TABLE public.orion_auction_settlements
  ADD COLUMN IF NOT EXISTS arremate_status      text,
  ADD COLUMN IF NOT EXISTS arremate_status_at   timestamptz,
  ADD COLUMN IF NOT EXISTS arremate_expires_at  timestamptz;

COMMENT ON COLUMN public.orion_auction_settlements.arremate_status IS
  'ORION-ARREMATES FASE A: estado oficial do ciclo financeiro do arremate. NULL = fora do fluxo (ex.: sem vencedor). Só muda via arremate_transition().';

-- Estados oficiais (ETAPA 2) — CHECK garante domínio fechado
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orion_settle_arremate_status_chk') THEN
    ALTER TABLE public.orion_auction_settlements
      ADD CONSTRAINT orion_settle_arremate_status_chk
      CHECK (arremate_status IS NULL OR arremate_status IN (
        'aguardando_pagamento','pagamento_em_processamento','pago',
        'expirado','cancelado','em_disputa','concluido'));
  END IF;
END $chk$;

-- Backfill: settlements existentes com vencedor entram como aguardando_pagamento;
-- sem vencedor (status no_winner) permanecem NULL (fora do fluxo).
UPDATE public.orion_auction_settlements
   SET arremate_status = 'aguardando_pagamento', arremate_status_at = now()
 WHERE arremate_status IS NULL
   AND winner_user_id IS NOT NULL
   AND coalesce(status,'') <> 'no_winner';

-- ─── ETAPA 4 — Tabela de transições oficiais (fonte da máquina) ─────────────
-- micro-estados encerrado/vencedor_definido/settlement_criado NÃO são persistidos
-- (ocorrem na mesma transação close→settle) — 1º estado é aguardando_pagamento.
CREATE TABLE IF NOT EXISTS public.orion_arremate_transitions (
  estado_de  text NOT NULL,
  estado_para text NOT NULL,
  PRIMARY KEY (estado_de, estado_para)
);

INSERT INTO public.orion_arremate_transitions (estado_de, estado_para) VALUES
  ('aguardando_pagamento','pagamento_em_processamento'),
  ('aguardando_pagamento','expirado'),
  ('aguardando_pagamento','cancelado'),
  ('pagamento_em_processamento','pago'),
  ('pagamento_em_processamento','aguardando_pagamento'), -- falha de pagamento → retry
  ('pagamento_em_processamento','expirado'),
  ('pago','em_disputa'),
  ('pago','concluido'),
  ('em_disputa','pago'),        -- disputa improcedente → retoma
  ('em_disputa','cancelado'),   -- disputa procedente → cancela (reembolso é FASE E)
  ('expirado','cancelado')      -- limpeza para terminal
ON CONFLICT DO NOTHING;
-- terminais (sem saída): cancelado, concluido

ALTER TABLE public.orion_arremate_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_arremate_transitions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orion_arremate_transitions TO authenticated;
GRANT ALL ON public.orion_arremate_transitions TO service_role;
DROP POLICY IF EXISTS arremate_transitions_read ON public.orion_arremate_transitions;
CREATE POLICY arremate_transitions_read ON public.orion_arremate_transitions
  FOR SELECT TO authenticated USING (true);

-- ─── ETAPA 3 — Integridade: trigger de proteção (winner/valor/estado) ───────
CREATE OR REPLACE FUNCTION public.tg_arremate_settlement_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Vencedor imutável após definido
  IF OLD.winner_user_id IS NOT NULL AND NEW.winner_user_id IS DISTINCT FROM OLD.winner_user_id THEN
    INSERT INTO orion_auction_audit (listing_id, acao, ator, detalhes)
    VALUES (OLD.listing_id, 'arremate.integridade_violada', coalesce(current_user,'?'),
            jsonb_build_object('campo','winner_user_id','de',OLD.winner_user_id,'tentado',NEW.winner_user_id));
    RAISE EXCEPTION 'ARREMATE: winner_user_id é imutável após o settlement';
  END IF;

  -- Valor final imutável após definido
  IF OLD.valor_final IS NOT NULL AND NEW.valor_final IS DISTINCT FROM OLD.valor_final THEN
    INSERT INTO orion_auction_audit (listing_id, acao, ator, detalhes)
    VALUES (OLD.listing_id, 'arremate.integridade_violada', coalesce(current_user,'?'),
            jsonb_build_object('campo','valor_final','de',OLD.valor_final,'tentado',NEW.valor_final));
    RAISE EXCEPTION 'ARREMATE: valor_final é imutável após o settlement';
  END IF;

  -- arremate_status só muda pela porta oficial (flag de sessão setada por arremate_transition)
  IF NEW.arremate_status IS DISTINCT FROM OLD.arremate_status THEN
    IF coalesce(current_setting('arremate.transition', true), '') <> '1' THEN
      INSERT INTO orion_auction_audit (listing_id, acao, ator, detalhes)
      VALUES (OLD.listing_id, 'arremate.estado_alteracao_negada', coalesce(current_user,'?'),
              jsonb_build_object('de',OLD.arremate_status,'tentado',NEW.arremate_status));
      RAISE EXCEPTION 'ARREMATE: arremate_status só muda via arremate_transition()';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tg_arremate_settlement_protect ON public.orion_auction_settlements;
CREATE TRIGGER tg_arremate_settlement_protect
  BEFORE UPDATE ON public.orion_auction_settlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_arremate_settlement_protect();

-- ─── ETAPA 2+4 — Motor de transição (única porta que altera o estado) ───────
-- Eventos oficiais no barramento orion_eventos (D7): arremate.criado /
-- .estado_alterado / .expirado / .cancelado / .disputa_aberta / .concluido.
-- Idempotente: transição para o mesmo estado é no-op (não emite, não duplica).
CREATE OR REPLACE FUNCTION public.arremate_transition(
  p_listing_id uuid, p_to text, p_motivo text DEFAULT NULL, p_ator text DEFAULT 'motor')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_from text; v_evt text; v_dados jsonb;
BEGIN
  SELECT arremate_status INTO v_from
    FROM orion_auction_settlements WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ARREMATE: settlement % inexistente', p_listing_id; END IF;

  -- Idempotência: já está no destino → no-op silencioso (sem evento duplicado)
  IF v_from IS NOT DISTINCT FROM p_to THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'estado', v_from);
  END IF;

  -- Validação da transição
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'ARREMATE: use arremate_init() para entrar no fluxo (settlement %)', p_listing_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orion_arremate_transitions WHERE estado_de = v_from AND estado_para = p_to) THEN
    RAISE EXCEPTION 'ARREMATE: transição inválida % -> %', v_from, p_to;
  END IF;

  -- Aplica (flag autoriza o trigger a aceitar a mudança de arremate_status)
  PERFORM set_config('arremate.transition', '1', true);
  UPDATE orion_auction_settlements
     SET arremate_status = p_to, arremate_status_at = now()
   WHERE listing_id = p_listing_id;
  PERFORM set_config('arremate.transition', '0', true);

  -- Auditoria da mudança de estado
  INSERT INTO orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing_id, 'arremate.estado_alterado', p_ator,
          jsonb_build_object('de', v_from, 'para', p_to, 'motivo', p_motivo));

  -- Eventos oficiais (genérico + específico do estado terminal/especial)
  v_dados := jsonb_build_object('listing_id', p_listing_id, 'de', v_from, 'para', p_to, 'motivo', p_motivo, 'ator', p_ator);
  INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('arremate.estado_alterado', 'arremate_fase_a', v_dados);

  v_evt := CASE p_to
    WHEN 'expirado'   THEN 'arremate.expirado'
    WHEN 'cancelado'  THEN 'arremate.cancelado'
    WHEN 'em_disputa' THEN 'arremate.disputa_aberta'
    WHEN 'concluido'  THEN 'arremate.concluido'
    ELSE NULL END;
  IF v_evt IS NOT NULL THEN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES (v_evt, 'arremate_fase_a', v_dados);
  END IF;

  RETURN jsonb_build_object('ok', true, 'de', v_from, 'para', p_to);
END $fn$;

-- Porta de ENTRADA no fluxo (NULL -> aguardando_pagamento) — emite arremate.criado
CREATE OR REPLACE FUNCTION public.arremate_init(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_cur text; v_winner uuid; v_status text;
BEGIN
  SELECT arremate_status, winner_user_id, status INTO v_cur, v_winner, v_status
    FROM orion_auction_settlements WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ARREMATE: settlement % inexistente', p_listing_id; END IF;
  IF v_cur IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'estado', v_cur);  -- já no fluxo
  END IF;
  IF v_winner IS NULL OR coalesce(v_status,'') = 'no_winner' THEN
    RAISE EXCEPTION 'ARREMATE: settlement % sem vencedor — não entra no fluxo', p_listing_id;
  END IF;

  PERFORM set_config('arremate.transition', '1', true);
  UPDATE orion_auction_settlements
     SET arremate_status = 'aguardando_pagamento', arremate_status_at = now()
   WHERE listing_id = p_listing_id;
  PERFORM set_config('arremate.transition', '0', true);

  INSERT INTO orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing_id, 'arremate.criado', 'motor',
          jsonb_build_object('estado_inicial','aguardando_pagamento','winner', v_winner));
  INSERT INTO orion_eventos (tipo, origem, dados)
  VALUES ('arremate.criado', 'arremate_fase_a',
          jsonb_build_object('listing_id', p_listing_id, 'winner', v_winner, 'estado','aguardando_pagamento'));

  RETURN jsonb_build_object('ok', true, 'estado', 'aguardando_pagamento');
END $fn$;

-- Leitura do estado (consulta explicável)
CREATE OR REPLACE FUNCTION public.arremate_state(p_listing_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'listing_id', s.listing_id, 'arremate_status', s.arremate_status,
    'arremate_status_at', s.arremate_status_at, 'winner_user_id', s.winner_user_id,
    'valor_final', s.valor_final, 'status_settlement', s.status,
    'transicoes_validas', coalesce((SELECT jsonb_agg(estado_para) FROM orion_arremate_transitions WHERE estado_de = s.arremate_status), '[]'::jsonb))
  FROM orion_auction_settlements s WHERE s.listing_id = p_listing_id
$fn$;

-- ─── ETAPA 6 — Segurança (menor privilégio; compatível com HOTFIX A.0) ──────
-- Motor de transição/entrada: SÓ service_role (nenhuma API pública nova).
-- arremate_state: leitura para authenticated (guarda de linha pela RLS da tabela).
REVOKE EXECUTE ON FUNCTION public.arremate_transition(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arremate_init(uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arremate_state(uuid)                         FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.arremate_transition(uuid, text, text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.arremate_init(uuid)                          TO service_role;
GRANT  EXECUTE ON FUNCTION public.arremate_state(uuid)                         TO authenticated, service_role;

-- ─── ETAPA 5 — Consolidação: remover SOMENTE as RPCs mortas aprovadas ───────
-- Canônica PRESERVADA = create_auction_listing(16-arg com p_starts_at/p_ends_at/
-- p_listing_type) — a ÚNICA que o front (useAuctions) resolve. As 5 abaixo NÃO
-- são chamadas por nenhuma camada (verificado) e geram risco de PGRST203.
DROP FUNCTION IF EXISTS public.create_auction_listing(uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, timestamptz, timestamptz, uuid);                                             -- oid 66356
DROP FUNCTION IF EXISTS public.create_auction_listing(bigint, uuid, text, text, integer, text, text, text, uuid, bigint, text, bigint, bigint, bigint, uuid, text);                                                     -- oid 66360
DROP FUNCTION IF EXISTS public.create_auction_listing(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, text, text, text, text, text, integer);                                         -- oid 66361
DROP FUNCTION IF EXISTS public.create_auction_listing(uuid, text, text, text, numeric, numeric, numeric, numeric, text, text, text, integer, uuid);                                                                    -- oid 66362 (13-arg sem listing_type)
DROP FUNCTION IF EXISTS public.create_auction_listing(uuid, text, text, text, numeric, numeric, numeric, numeric, text, text, text, integer, uuid, text);                                                              -- oid 67502 (14-arg com listing_type)
-- place_auction_bid 3-arg (quebrada — escreve colunas inexistentes; sem chamador)
DROP FUNCTION IF EXISTS public.place_auction_bid(uuid, uuid, numeric);

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*)::int FROM information_schema.columns WHERE table_name='orion_auction_settlements' AND column_name='arremate_status') AS coluna_ok,
  (SELECT count(*)::int FROM orion_arremate_transitions) AS transicoes,
  (SELECT count(*)::int FROM pg_trigger WHERE tgname='tg_arremate_settlement_protect') AS trigger_ok,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('arremate_transition','arremate_init','arremate_state')) AS fns_novas,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_auction_listing') AS create_overloads_restantes,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='place_auction_bid') AS bid_overloads_restantes;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (reversível) — executar no SQL Editor para desfazer a FASE A:
--   DROP TRIGGER IF EXISTS tg_arremate_settlement_protect ON public.orion_auction_settlements;
--   DROP FUNCTION IF EXISTS public.tg_arremate_settlement_protect();
--   DROP FUNCTION IF EXISTS public.arremate_transition(uuid,text,text,text);
--   DROP FUNCTION IF EXISTS public.arremate_init(uuid);
--   DROP FUNCTION IF EXISTS public.arremate_state(uuid);
--   DROP TABLE IF EXISTS public.orion_arremate_transitions;
--   ALTER TABLE public.orion_auction_settlements
--     DROP CONSTRAINT IF EXISTS orion_settle_arremate_status_chk,
--     DROP COLUMN IF EXISTS arremate_status,
--     DROP COLUMN IF EXISTS arremate_status_at,
--     DROP COLUMN IF EXISTS arremate_expires_at;
--   -- eventos arremate.* já emitidos PERMANECEM (bus imutável — sem perda de auditoria)
--   -- as 6 RPCs dropadas: recriar a partir de DOCS/rollback-fase-a-fns.sql (definições exportadas)
-- ════════════════════════════════════════════════════════════════════════════
