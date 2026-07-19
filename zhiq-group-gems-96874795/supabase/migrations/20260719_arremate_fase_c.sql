-- ============================================================
-- ORION-ARREMATES FASE C v1.0 — Comunicação, Contato Direto e Confirmação · 2026-07-19
-- Modelo P2P (ARCHITECTURE FASE B v2.0): a plataforma NÃO intermedia pagamento —
-- apenas registra, acompanha, audita e organiza. SEM MP/carteira/escrow/cobrança.
-- Preserva 100% a FASE A: arremate_transition()/trigger de imutabilidade/auditoria/eventos
-- ficam INTOCADOS — muda só o CONJUNTO de estados (dados de orion_arremate_transitions)
-- e o estado inicial do arremate_init. Reusa ALC (orion_alc_deals/_ratings/_disputes).
-- Idempotente. SQL Editor / Management API (broifhfqmnzqoongtokm).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 1 · MÁQUINA DE ESTADOS OPERACIONAL (FASE C, 10 estados P2P)
-- ─────────────────────────────────────────────────────────────
-- Atualiza o CHECK de arremate_status para os estados operacionais P2P (FASE C).
ALTER TABLE public.orion_auction_settlements DROP CONSTRAINT IF EXISTS orion_settle_arremate_status_chk;
ALTER TABLE public.orion_auction_settlements ADD CONSTRAINT orion_settle_arremate_status_chk
  CHECK (arremate_status IS NULL OR arremate_status = ANY (ARRAY[
    'aguardando_contato','contato_liberado','pagamento_informado_comprador',
    'pagamento_confirmado_vendedor','preparando_entrega','entregue','recebido',
    'concluido','cancelado','em_disputa']));

-- Substitui o conjunto de transições financeiras da FASE A pelo operacional P2P.
DELETE FROM public.orion_arremate_transitions;
INSERT INTO public.orion_arremate_transitions (estado_de, estado_para) VALUES
  ('aguardando_contato','contato_liberado'),
  ('aguardando_contato','cancelado'),
  ('aguardando_contato','em_disputa'),
  ('contato_liberado','pagamento_informado_comprador'),
  ('contato_liberado','cancelado'),
  ('contato_liberado','em_disputa'),
  ('pagamento_informado_comprador','pagamento_confirmado_vendedor'),
  ('pagamento_informado_comprador','cancelado'),
  ('pagamento_informado_comprador','em_disputa'),
  ('pagamento_confirmado_vendedor','preparando_entrega'),
  ('pagamento_confirmado_vendedor','entregue'),
  ('pagamento_confirmado_vendedor','em_disputa'),
  ('preparando_entrega','entregue'),
  ('preparando_entrega','em_disputa'),
  ('entregue','recebido'),
  ('entregue','em_disputa'),
  ('recebido','concluido'),
  ('recebido','em_disputa'),
  -- disputa: admin resolve retomando o marco ou encerrando
  ('em_disputa','contato_liberado'),
  ('em_disputa','pagamento_informado_comprador'),
  ('em_disputa','pagamento_confirmado_vendedor'),
  ('em_disputa','preparando_entrega'),
  ('em_disputa','entregue'),
  ('em_disputa','recebido'),
  ('em_disputa','cancelado'),
  ('em_disputa','concluido')
ON CONFLICT DO NOTHING;

-- Estado inicial do fluxo passa a ser 'aguardando_contato' (FASE B v2.0).
CREATE OR REPLACE FUNCTION public.arremate_init(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cur text; v_winner uuid; v_status text;
BEGIN
  SELECT arremate_status, winner_user_id, status INTO v_cur, v_winner, v_status
    FROM orion_auction_settlements WHERE listing_id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ARREMATE: settlement % inexistente', p_listing_id; END IF;
  IF v_cur IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'noop', true, 'estado', v_cur); END IF;
  IF v_winner IS NULL OR coalesce(v_status,'') = 'no_winner' THEN
    RAISE EXCEPTION 'ARREMATE: settlement % sem vencedor — não entra no fluxo', p_listing_id;
  END IF;
  PERFORM set_config('arremate.transition','1',true);
  UPDATE orion_auction_settlements
     SET arremate_status = 'aguardando_contato', arremate_status_at = now()
   WHERE listing_id = p_listing_id;
  PERFORM set_config('arremate.transition','0',true);
  INSERT INTO orion_auction_audit (listing_id, acao, ator, detalhes)
    VALUES (p_listing_id, 'arremate.iniciado', 'motor', jsonb_build_object('estado','aguardando_contato'));
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('arremate.criado', 'arremate_fase_c', jsonb_build_object('listing_id', p_listing_id, 'estado', 'aguardando_contato'));
  RETURN jsonb_build_object('ok', true, 'estado', 'aguardando_contato');
END $function$;

-- Remapear settlements já no fluxo com estados antigos (FASE A) para os novos (idempotente).
DO $$
BEGIN
  PERFORM set_config('arremate.transition','1',true);
  UPDATE public.orion_auction_settlements SET arremate_status='aguardando_contato'
    WHERE arremate_status IN ('aguardando_pagamento','pagamento_em_processamento');
  UPDATE public.orion_auction_settlements SET arremate_status='pagamento_confirmado_vendedor'
    WHERE arremate_status = 'pago';
  PERFORM set_config('arremate.transition','0',true);
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 2 · HELPERS (papel, deal, notificação) — internos
-- ─────────────────────────────────────────────────────────────
-- Resolve o papel do chamador (auth.uid) sobre o arremate: 'buyer'|'seller'|'admin'|NULL.
CREATE OR REPLACE FUNCTION public._arremate_party(p_listing uuid)
 RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $$
  SELECT CASE
    WHEN public.mp_is_admin() THEN 'admin'
    WHEN s.winner_user_id = auth.uid() THEN 'buyer'
    WHEN s.seller_user_id = auth.uid() THEN 'seller'
    ELSE NULL END
  FROM public.orion_auction_settlements s WHERE s.listing_id = p_listing;
$$;

-- Garante a linha ALC do deal (trilha operacional) a partir do settlement.
CREATE OR REPLACE FUNCTION public._arremate_ensure_deal(p_listing uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM orion_alc_deals WHERE listing_id = p_listing;
  IF v_id IS NULL THEN
    INSERT INTO orion_alc_deals (listing_id, seller_user_id, buyer_user_id, amount, listing_type, category, city, status)
    SELECT s.listing_id, s.seller_user_id, s.winner_user_id, s.valor_final, 'auction', NULL, s.cidade, 'aguardando_contato'
      FROM orion_auction_settlements s WHERE s.listing_id = p_listing
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- Notificação a um lado (grava em notification_events; entrega pelo notifier existente).
CREATE OR REPLACE FUNCTION public._arremate_notify(p_listing uuid, p_target uuid, p_type text, p_payload jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO notification_events (event_type, entity_table, entity_id, payload)
  VALUES (p_type, 'orion_auction_settlements', p_listing,
          coalesce(p_payload,'{}'::jsonb) || jsonb_build_object('target_user_id', p_target, 'listing_id', p_listing));
END $$;

-- Auditoria de ação não-transicional (contato/mensagem/etc).
CREATE OR REPLACE FUNCTION public._arremate_audit(p_listing uuid, p_acao text, p_ator text, p_det jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing, p_acao, p_ator, coalesce(p_det,'{}'::jsonb));
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 3 · LIBERAÇÃO DE CONTATO
-- ─────────────────────────────────────────────────────────────
-- Libera o contato (automático/parte/admin): transita aguardando_contato→contato_liberado,
-- carimba ALC, audita, emite evento, notifica os 2 lados.
CREATE OR REPLACE FUNCTION public.arremate_release_contact(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_deal uuid; v_seller uuid; v_buyer uuid; v_est text;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party IS NULL THEN RAISE EXCEPTION 'ARREMATE: acesso negado ao arremate %', p_listing_id; END IF;
  SELECT seller_user_id, winner_user_id, arremate_status INTO v_seller, v_buyer, v_est
    FROM orion_auction_settlements WHERE listing_id = p_listing_id;
  IF v_est = 'contato_liberado' THEN RETURN jsonb_build_object('ok',true,'noop',true,'estado',v_est); END IF;

  v_deal := public._arremate_ensure_deal(p_listing_id);
  PERFORM public.arremate_transition(p_listing_id, 'contato_liberado', 'liberação de contato', v_party);
  UPDATE orion_alc_deals SET buyer_contato_at = coalesce(buyer_contato_at, now()),
                             seller_contato_at = coalesce(seller_contato_at, now()),
                             first_contact_at = coalesce(first_contact_at, now()),
                             status = 'contato_realizado', updated_at = now()
    WHERE id = v_deal;
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('contato.liberado', 'arremate_fase_c', jsonb_build_object('listing_id', p_listing_id, 'deal_id', v_deal));
  PERFORM public._arremate_notify(p_listing_id, v_buyer, 'arremate.contato_liberado', jsonb_build_object('para','comprador'));
  PERFORM public._arremate_notify(p_listing_id, v_seller,'arremate.contato_liberado', jsonb_build_object('para','vendedor'));
  RETURN jsonb_build_object('ok', true, 'estado', 'contato_liberado', 'deal_id', v_deal);
END $$;

-- Retorna os dados de contato da CONTRAPARTE (só após contato_liberado; nunca CPF).
CREATE OR REPLACE FUNCTION public.arremate_get_contato(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_seller uuid; v_buyer uuid; v_est text; v_alvo uuid; v_out jsonb;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party IS NULL THEN RAISE EXCEPTION 'ARREMATE: acesso negado'; END IF;
  SELECT seller_user_id, winner_user_id, arremate_status INTO v_seller, v_buyer, v_est
    FROM orion_auction_settlements WHERE listing_id = p_listing_id;
  IF v_est IS NULL OR v_est = 'aguardando_contato' THEN
    RAISE EXCEPTION 'ARREMATE: contato ainda não liberado';
  END IF;
  -- comprador vê o vendedor; vendedor vê o comprador; admin vê ambos.
  IF v_party = 'admin' THEN
    SELECT jsonb_build_object(
      'comprador', (SELECT jsonb_build_object('nome',name,'telefone',telefone,'whatsapp',whatsapp,'email',email) FROM profiles WHERE id=v_buyer),
      'vendedor',  (SELECT jsonb_build_object('nome',name,'telefone',telefone,'whatsapp',whatsapp,'email',email) FROM profiles WHERE id=v_seller)
    ) INTO v_out;
  ELSE
    v_alvo := CASE WHEN v_party='buyer' THEN v_seller ELSE v_buyer END;
    SELECT jsonb_build_object('papel', CASE WHEN v_party='buyer' THEN 'vendedor' ELSE 'comprador' END,
      'nome',name,'telefone',telefone,'whatsapp',whatsapp,'email',email) INTO v_out FROM profiles WHERE id=v_alvo;
    PERFORM public._arremate_audit(p_listing_id, 'arremate.contato_consultado', v_party, jsonb_build_object('por', auth.uid()));
  END IF;
  RETURN coalesce(v_out, '{}'::jsonb);
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 4 · CONFIRMAÇÕES (comprador/vendedor) — cada uma auditada + notificada
-- ─────────────────────────────────────────────────────────────
-- Comprador: informar pagamento realizado.
CREATE OR REPLACE FUNCTION public.arremate_buyer_informar_pagamento(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_seller uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('buyer','admin') THEN RAISE EXCEPTION 'ARREMATE: só o comprador informa pagamento'; END IF;
  SELECT seller_user_id INTO v_seller FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  PERFORM public.arremate_transition(p_listing_id, 'pagamento_informado_comprador', 'comprador informou pagamento', v_party);
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('pagamento.confirmado_comprador','arremate_fase_c', jsonb_build_object('listing_id',p_listing_id,'por',auth.uid()));
  PERFORM public._arremate_notify(p_listing_id, v_seller, 'arremate.pagamento_informado_comprador', '{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'estado','pagamento_informado_comprador');
END $$;

-- Vendedor: confirmar recebimento do pagamento (marco financeiro oficial P2P).
CREATE OR REPLACE FUNCTION public.arremate_seller_confirmar_pagamento(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_buyer uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('seller','admin') THEN RAISE EXCEPTION 'ARREMATE: só o vendedor confirma o pagamento'; END IF;
  SELECT winner_user_id INTO v_buyer FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  PERFORM public.arremate_transition(p_listing_id, 'pagamento_confirmado_vendedor', 'vendedor confirmou recebimento do pagamento', v_party);
  UPDATE orion_auction_settlements SET pagamento_ok = true WHERE listing_id = p_listing_id;
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('pagamento.confirmado_vendedor','arremate_fase_c', jsonb_build_object('listing_id',p_listing_id,'por',auth.uid()));
  PERFORM public._arremate_notify(p_listing_id, v_buyer, 'arremate.pagamento_confirmado_vendedor', '{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'estado','pagamento_confirmado_vendedor');
END $$;

-- Vendedor: confirmar envio do produto.
CREATE OR REPLACE FUNCTION public.arremate_seller_enviar(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_buyer uuid; v_deal uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('seller','admin') THEN RAISE EXCEPTION 'ARREMATE: só o vendedor confirma envio'; END IF;
  SELECT winner_user_id INTO v_buyer FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  PERFORM public.arremate_transition(p_listing_id, 'entregue', 'vendedor confirmou envio/entrega', v_party);
  v_deal := public._arremate_ensure_deal(p_listing_id);
  UPDATE orion_alc_deals SET seller_entregue_at = coalesce(seller_entregue_at, now()), status='entregue', updated_at=now() WHERE id=v_deal;
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('entrega.iniciada','arremate_fase_c', jsonb_build_object('listing_id',p_listing_id,'por',auth.uid()));
  PERFORM public._arremate_notify(p_listing_id, v_buyer, 'arremate.produto_enviado', '{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'estado','entregue');
END $$;

-- Comprador: confirmar recebimento do produto.
CREATE OR REPLACE FUNCTION public.arremate_buyer_receber(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_seller uuid; v_deal uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('buyer','admin') THEN RAISE EXCEPTION 'ARREMATE: só o comprador confirma recebimento'; END IF;
  SELECT seller_user_id INTO v_seller FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  PERFORM public.arremate_transition(p_listing_id, 'recebido', 'comprador confirmou recebimento do produto', v_party);
  v_deal := public._arremate_ensure_deal(p_listing_id);
  UPDATE orion_alc_deals SET buyer_recebido_at = coalesce(buyer_recebido_at, now()), status='servico_executado', updated_at=now() WHERE id=v_deal;
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('entrega.confirmada','arremate_fase_c', jsonb_build_object('listing_id',p_listing_id,'por',auth.uid()));
  PERFORM public._arremate_notify(p_listing_id, v_seller, 'arremate.recebimento_confirmado', '{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'estado','recebido');
END $$;

-- Vendedor (ou automático): concluir o arremate (abre avaliações; terminal).
CREATE OR REPLACE FUNCTION public.arremate_concluir(p_listing_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_seller uuid; v_buyer uuid; v_deal uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party IS NULL THEN RAISE EXCEPTION 'ARREMATE: acesso negado'; END IF;
  SELECT seller_user_id, winner_user_id INTO v_seller, v_buyer FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  PERFORM public.arremate_transition(p_listing_id, 'concluido', 'arremate concluído', v_party);
  v_deal := public._arremate_ensure_deal(p_listing_id);
  UPDATE orion_alc_deals SET buyer_concluido_at = coalesce(buyer_concluido_at, now()),
                             seller_concluido_at = coalesce(seller_concluido_at, now()),
                             concluded_at = coalesce(concluded_at, now()), status='concluida', updated_at=now() WHERE id=v_deal;
  PERFORM public._arremate_notify(p_listing_id, v_buyer,  'arremate.concluido', '{}'::jsonb);
  PERFORM public._arremate_notify(p_listing_id, v_seller, 'arremate.concluido', '{}'::jsonb);
  RETURN jsonb_build_object('ok',true,'estado','concluido');
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 5 · DISPUTA e CANCELAMENTO (sem intermediação financeira)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.arremate_abrir_disputa(p_listing_id uuid, p_motivo text, p_evidencias jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_deal uuid; v_seller uuid; v_buyer uuid; v_other uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('buyer','seller','admin') THEN RAISE EXCEPTION 'ARREMATE: acesso negado'; END IF;
  SELECT seller_user_id, winner_user_id INTO v_seller, v_buyer FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  v_deal := public._arremate_ensure_deal(p_listing_id);
  PERFORM public.arremate_transition(p_listing_id, 'em_disputa', coalesce(p_motivo,'disputa'), v_party);
  INSERT INTO orion_alc_disputes (deal_id, opened_by_user_id, opened_by_party, motivo, evidencias, status)
    VALUES (v_deal, auth.uid(), v_party, p_motivo, coalesce(p_evidencias,'{}'::jsonb), 'aberta');
  v_other := CASE WHEN v_party='buyer' THEN v_seller ELSE v_buyer END;
  PERFORM public._arremate_notify(p_listing_id, v_other, 'arremate.disputa_aberta', jsonb_build_object('motivo',p_motivo));
  RETURN jsonb_build_object('ok',true,'estado','em_disputa','deal_id',v_deal);
END $$;

CREATE OR REPLACE FUNCTION public.arremate_cancelar(p_listing_id uuid, p_motivo text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_seller uuid; v_buyer uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('buyer','seller','admin') THEN RAISE EXCEPTION 'ARREMATE: acesso negado'; END IF;
  SELECT seller_user_id, winner_user_id INTO v_seller, v_buyer FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  PERFORM public.arremate_transition(p_listing_id, 'cancelado', coalesce(p_motivo,'cancelamento'), v_party);
  UPDATE orion_alc_deals SET status='cancelada', canceled_at=now(), updated_at=now() WHERE listing_id=p_listing_id;
  PERFORM public._arremate_notify(p_listing_id, v_buyer,  'arremate.cancelado', jsonb_build_object('motivo',p_motivo));
  PERFORM public._arremate_notify(p_listing_id, v_seller, 'arremate.cancelado', jsonb_build_object('motivo',p_motivo));
  RETURN jsonb_build_object('ok',true,'estado','cancelado');
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 6 · CHAT DO ARREMATE (mensagens imutáveis + anexos)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_arremate_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  deal_id uuid,
  sender_user_id uuid NOT NULL,
  sender_party text NOT NULL CHECK (sender_party IN ('buyer','seller','admin')),
  body text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{path,name,type,size}]
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arremate_msgs_listing ON public.orion_arremate_messages(listing_id, created_at);
ALTER TABLE public.orion_arremate_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_arremate_messages FROM PUBLIC, anon;
GRANT SELECT ON public.orion_arremate_messages TO authenticated;   -- escrita só via RPC DEFINER

-- Só as partes do arremate + admin leem o chat; ninguém escreve/edita/apaga direto.
DROP POLICY IF EXISTS arremate_msgs_sel ON public.orion_arremate_messages;
CREATE POLICY arremate_msgs_sel ON public.orion_arremate_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orion_auction_settlements s
                  WHERE s.listing_id = orion_arremate_messages.listing_id
                    AND (s.winner_user_id = auth.uid() OR s.seller_user_id = auth.uid() OR public.mp_is_admin())));
-- (sem policy de INSERT/UPDATE/DELETE → bloqueadas pelo RLS; imutabilidade garantida)

-- Envia mensagem (parte do arremate); imutável; auditada; notifica a contraparte.
CREATE OR REPLACE FUNCTION public.arremate_send_message(p_listing_id uuid, p_body text, p_attachments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_deal uuid; v_seller uuid; v_buyer uuid; v_other uuid; v_id uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('buyer','seller','admin') THEN RAISE EXCEPTION 'ARREMATE: acesso negado ao chat'; END IF;
  IF coalesce(trim(p_body),'') = '' AND coalesce(jsonb_array_length(p_attachments),0) = 0 THEN
    RAISE EXCEPTION 'ARREMATE: mensagem vazia';
  END IF;
  SELECT seller_user_id, winner_user_id INTO v_seller, v_buyer FROM orion_auction_settlements WHERE listing_id=p_listing_id;
  v_deal := public._arremate_ensure_deal(p_listing_id);
  INSERT INTO orion_arremate_messages (listing_id, deal_id, sender_user_id, sender_party, body, attachments)
    VALUES (p_listing_id, v_deal, auth.uid(), v_party, nullif(trim(p_body),''), coalesce(p_attachments,'[]'::jsonb))
    RETURNING id INTO v_id;
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('arremate.mensagem', 'arremate_fase_c', jsonb_build_object('listing_id',p_listing_id,'msg_id',v_id,'party',v_party));
  v_other := CASE WHEN v_party='seller' THEN v_buyer ELSE v_seller END;
  PERFORM public._arremate_notify(p_listing_id, v_other, 'arremate.nova_mensagem', jsonb_build_object('msg_id',v_id));
  RETURN jsonb_build_object('ok',true,'id',v_id);
END $$;

-- Lista o histórico do chat (só as partes/admin).
CREATE OR REPLACE FUNCTION public.arremate_list_messages(p_listing_id uuid)
 RETURNS SETOF public.orion_arremate_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF public._arremate_party(p_listing_id) IS NULL THEN RAISE EXCEPTION 'ARREMATE: acesso negado'; END IF;
  RETURN QUERY SELECT * FROM orion_arremate_messages WHERE listing_id = p_listing_id ORDER BY created_at ASC;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 7 · MENOR PRIVILÉGIO (REVOKE PUBLIC/anon; GRANT authenticated/service_role)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v_fns text[] := ARRAY[
  'arremate_init(uuid)','arremate_release_contact(uuid)','arremate_get_contato(uuid)',
  'arremate_buyer_informar_pagamento(uuid)','arremate_seller_confirmar_pagamento(uuid)',
  'arremate_seller_enviar(uuid)','arremate_buyer_receber(uuid)','arremate_concluir(uuid)',
  'arremate_abrir_disputa(uuid,text,jsonb)','arremate_cancelar(uuid,text)',
  'arremate_send_message(uuid,text,jsonb)','arremate_list_messages(uuid)'];
  v_internos text[] := ARRAY['_arremate_party(uuid)','_arremate_ensure_deal(uuid)','_arremate_notify(uuid,uuid,text,jsonb)','_arremate_audit(uuid,text,text,jsonb)'];
  s text;
BEGIN
  FOREACH s IN ARRAY v_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', s);
  END LOOP;
  FOREACH s IN ARRAY v_internos LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', s);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM orion_arremate_transitions) transicoes,
  (SELECT count(DISTINCT estado_de) FROM orion_arremate_transitions) estados_origem,
  (SELECT to_regclass('public.orion_arremate_messages') IS NOT NULL) tem_chat,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'arremate_%') rpcs_arremate,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'arremate_%' AND has_function_privilege('anon',p.oid,'EXECUTE')) rpcs_anon_exec;
