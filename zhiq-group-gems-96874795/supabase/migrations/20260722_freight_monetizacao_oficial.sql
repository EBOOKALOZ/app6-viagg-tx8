-- ════════════════════════════════════════════════════════════════════════════
-- FRETES & MUDANÇAS — MODELO OFICIAL DE MONETIZAÇÃO (ORION)
-- ----------------------------------------------------------------------------
-- Duas fontes de receita:
--  (1) DIVULGAÇÃO (recorrente): pacotes Bronze/Prata/Ouro/Diamante em BANCO
--      (promotion_packages, profile_type='fretes') — novos pacotes sem código.
--  (2) COMISSÃO SOBRE O INTERESSE (variável): 3% do valor informado do frete,
--      cobrada SOMENTE quando o transportador clica "Aceitar Serviço e Abrir
--      Contato". Visualizar/pesquisar/navegar é grátis (preview mascarado).
--
-- Regras implementadas aqui:
--  • Preview GRATUITO das oportunidades: cidades, distância, tipo de carga,
--    peso, volume, data, valor informado. SEM endereço completo, observações,
--    fotos ou identidade do cliente (RLS + RPC mascarado).
--  • Ao "Aceitar Serviço e Abrir Contato": cobra a comissão parametrizável
--    (freight_commission_settings; oficial 3%) na CARTEIRA pay_* do
--    transportador (partida dobrada, idempotente) e LIBERA automaticamente
--    nome/WhatsApp/telefone/endereços/observações/fotos/localização.
--  • Sem saldo → erro claro com CTA de compra de créditos; nada é reservado.
--  • Parametrizável no Painel Admin (admin_set_freight_commission já existe):
--    percentual padrão, por categoria, piso, teto — sem alterar código.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. COMISSÃO OFICIAL: liga o motor e define 3% (respeita override admin) ─
UPDATE public.freight_commission_settings
SET enabled    = true,
    percent    = CASE WHEN coalesce(percent, 0) = 0 THEN 3 ELSE percent END,
    updated_at = now()
WHERE id = 1;

-- ─── 2. DESBLOQUEIOS DE CONTATO (dedup permanente — nunca cobra 2x) ─────────
CREATE TABLE IF NOT EXISTS public.freight_contact_unlocks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES public.freight_quote_requests(id) ON DELETE CASCADE,
  transporter_user_id uuid NOT NULL,
  base_brl            numeric,
  pct_applied         numeric,
  commission_brl      numeric NOT NULL DEFAULT 0,
  charged             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fcu_request_transporter_uk UNIQUE (request_id, transporter_user_id)
);
ALTER TABLE public.freight_contact_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fcu_select_own ON public.freight_contact_unlocks;
CREATE POLICY fcu_select_own ON public.freight_contact_unlocks
  FOR SELECT USING (transporter_user_id = auth.uid());

-- ─── 3. RLS: preview deixa de expor a linha completa ────────────────────────
-- Antes: qualquer autenticado lia TUDO (endereços, fotos, observações) das
-- solicitações abertas. Agora: linha completa só para o dono (cliente) e para
-- transportadores que JÁ desbloquearam. O feed usa o RPC mascarado abaixo.
DROP POLICY IF EXISTS fqr_select_open ON public.freight_quote_requests;
DROP POLICY IF EXISTS fqr_select_proposer ON public.freight_quote_requests;
DROP POLICY IF EXISTS fqr_select_unlocked ON public.freight_quote_requests;
CREATE POLICY fqr_select_unlocked ON public.freight_quote_requests
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.freight_contact_unlocks u
    WHERE u.request_id = freight_quote_requests.id
      AND u.transporter_user_id = auth.uid()));

-- ─── 4. RPC: feed MASCARADO de oportunidades (grátis, sem PII) ──────────────
-- Sem p_ids: solicitações abertas (excl. as próprias). Com p_ids: as
-- solicitações informadas, desde que o chamador tenha proposta nelas
-- (aba "Respondidas" — ainda mascarado; contato só via desbloqueio).
CREATE OR REPLACE FUNCTION public.list_freight_open_requests(p_ids uuid[] DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'status', r.status,
    'created_at', r.created_at, 'expires_at', r.expires_at,
    'cargo_type', r.cargo_type, 'category', r.category,
    'weight_kg', r.weight_kg, 'volumes', r.volumes,
    'length_cm', r.length_cm, 'width_cm', r.width_cm, 'height_cm', r.height_cm,
    'cargo_value_brl', r.cargo_value_brl,
    'suggested_price_brl', r.suggested_price_brl,
    'urgency', r.urgency,
    'desired_date', r.desired_date, 'desired_time', r.desired_time,
    'schedule_flexible', r.schedule_flexible,
    'characteristics', coalesce(r.characteristics, '[]'::jsonb),
    'allowed_vehicle_types', coalesce(r.allowed_vehicle_types, '[]'::jsonb),
    'orion_analysis', r.orion_analysis,
    'origin_city', r.origin_city, 'origin_state', r.origin_state,
    'dest_city', r.dest_city, 'dest_state', r.dest_state,
    'route_distance_km', r.route_distance_km,
    'accepted_proposal_id', r.accepted_proposal_id,
    'photos_count', coalesce(jsonb_array_length(r.photos), 0),
    'has_notes', (r.notes IS NOT NULL AND length(r.notes) > 0)
  )
  FROM public.freight_quote_requests r
  WHERE auth.uid() IS NOT NULL
    AND (
      (p_ids IS NULL
        AND r.status IN ('aguardando','recebendo','negociacao')
        AND r.expires_at > now()
        AND r.client_user_id <> auth.uid())
      OR
      (p_ids IS NOT NULL
        AND r.id = ANY (p_ids)
        AND EXISTS (SELECT 1 FROM public.freight_quote_proposals p
                    WHERE p.request_id = r.id AND p.transporter_user_id = auth.uid()))
    )
  ORDER BY r.created_at DESC
  LIMIT 200
$$;

-- ─── 5. Preview da comissão (o front mostra ANTES de confirmar) ─────────────
CREATE OR REPLACE FUNCTION public.freight_commission_preview(p_price numeric, p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.freight_commission_settings; v_comm numeric; v_pct numeric;
BEGIN
  SELECT * INTO s FROM public.freight_commission_settings WHERE id = 1;
  v_comm := public.compute_freight_commission(p_price, p_category);
  v_pct  := coalesce(nullif(s.per_category->>coalesce(p_category,''), '')::numeric, s.percent, 0);
  RETURN jsonb_build_object(
    'enabled', coalesce(s.enabled, false),
    'percent', coalesce(v_pct, 0),
    'commission_brl', coalesce(v_comm, 0),
    'min_brl', s.min_brl, 'max_brl', s.max_brl
  );
END; $$;

-- ─── 6. Payload de contato liberado (uso interno dos RPCs) ──────────────────
CREATE OR REPLACE FUNCTION public._freight_contact_payload(p_request public.freight_quote_requests)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prof jsonb;
BEGIN
  SELECT to_jsonb(p) INTO v_prof FROM public.profiles p WHERE p.id = p_request.client_user_id;
  RETURN jsonb_build_object(
    'request_id', p_request.id,
    'client', jsonb_build_object(
      'name', coalesce(v_prof->>'nome', v_prof->>'full_name', v_prof->>'name', 'Cliente Viagg-TX8'),
      'whatsapp', coalesce(v_prof->>'whatsapp', v_prof->>'telefone', v_prof->>'phone'),
      'phone', coalesce(v_prof->>'telefone', v_prof->>'phone', v_prof->>'whatsapp'),
      'email', v_prof->>'email'
    ),
    'origin', jsonb_build_object(
      'cep', p_request.origin_cep, 'address', p_request.origin_address,
      'city', p_request.origin_city, 'state', p_request.origin_state,
      'lat', p_request.origin_lat, 'lng', p_request.origin_lng
    ),
    'dest', jsonb_build_object(
      'cep', p_request.dest_cep, 'address', p_request.dest_address,
      'city', p_request.dest_city, 'state', p_request.dest_state,
      'lat', p_request.dest_lat, 'lng', p_request.dest_lng
    ),
    'notes', p_request.notes,
    'photos', coalesce(p_request.photos, '[]'::jsonb),
    'desired_date', p_request.desired_date,
    'desired_time', p_request.desired_time
  );
END; $$;

-- ─── 7. ACEITAR SERVIÇO E ABRIR CONTATO (cobra 3% e libera os dados) ────────
CREATE OR REPLACE FUNCTION public.freight_accept_and_unlock(p_request_id uuid, p_price numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.freight_quote_requests;
  v_unlock public.freight_contact_unlocks;
  v_accepted_prop public.freight_quote_proposals;
  v_price numeric;
  v_comm numeric;
  v_pct numeric;
  v_prop_id uuid;
  v_acct uuid; v_platform uuid; v_avail numeric; v_idem text;
  v_need_accept boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_not_found'); END IF;
  IF v_req.client_user_id = v_uid THEN RETURN jsonb_build_object('success', false, 'error', 'own_request'); END IF;

  -- Idempotente: já desbloqueado → devolve os dados sem nova cobrança
  SELECT * INTO v_unlock FROM public.freight_contact_unlocks
   WHERE request_id = p_request_id AND transporter_user_id = v_uid;
  IF v_unlock.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_unlocked', true,
      'commission_brl', v_unlock.commission_brl,
      'contact', public._freight_contact_payload(v_req));
  END IF;

  -- Estado da solicitação define o caminho:
  --  aberta → este RPC também ACEITA o serviço (fluxo "Aceitar e Abrir Contato")
  --  aceita → só permite abrir contato se a proposta vencedora é do chamador
  IF v_req.status IN ('aguardando','recebendo','negociacao') THEN
    v_need_accept := true;
    v_price := coalesce(p_price, v_req.suggested_price_brl);
    IF v_price IS NULL OR v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
    END IF;
  ELSIF v_req.status = 'aceita' OR v_req.status = 'finalizada' THEN
    SELECT * INTO v_accepted_prop FROM public.freight_quote_proposals WHERE id = v_req.accepted_proposal_id;
    IF v_accepted_prop.transporter_user_id IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object('success', false, 'error', 'request_closed');
    END IF;
    v_price := coalesce(p_price, v_accepted_prop.price_brl, v_req.suggested_price_brl);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'request_closed');
  END IF;

  -- COMISSÃO OFICIAL (parametrizável): 3% do valor informado do frete
  v_comm := public.compute_freight_commission(v_price, v_req.cargo_type);
  SELECT coalesce(nullif(per_category->>coalesce(v_req.cargo_type,''), '')::numeric, percent, 0)
    INTO v_pct FROM public.freight_commission_settings WHERE id = 1;

  -- Cobrança na CARTEIRA (pay_*) — partida dobrada idempotente; sem saldo → erro claro
  IF v_comm > 0 THEN
    v_acct := (public.pay_get_or_create_account('customer', v_uid, 'customer_wallet', '{}'::jsonb)).id;
    SELECT id INTO v_platform FROM public.pay_financial_accounts
     WHERE owner_type = 'platform' AND account_type = 'platform_main' LIMIT 1;
    IF v_platform IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'platform_account_missing');
    END IF;

    SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id = v_acct;
    IF coalesce(v_avail, 0) < v_comm THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'buy_credits_cta', true,
        'required_cents', round(v_comm * 100)::bigint,
        'available_cents', round(coalesce(v_avail, 0) * 100)::bigint);
    END IF;

    v_idem := 'freight_unlock:' || p_request_id::text || ':' || v_uid::text;
    BEGIN
      PERFORM public.pay_post_transaction(
        'freight_commission', v_idem,
        jsonb_build_array(
          jsonb_build_object('account_id', v_acct, 'direction', 'debit', 'entry_type', 'payment_out',
                             'amount', v_comm, 'description', 'Comissão frete — abrir contato (' || coalesce(v_req.cargo_type,'carga') || ')'),
          jsonb_build_object('account_id', v_platform, 'direction', 'credit', 'entry_type', 'payment_in',
                             'amount', v_comm, 'description', 'Comissão frete ' || coalesce(v_pct,0)::text || '% (abrir contato)')
        ),
        'freight_quote_requests', p_request_id,
        jsonb_build_object('transporter', v_uid, 'price_brl', v_price, 'pct', v_pct)
      );
    EXCEPTION WHEN OTHERS THEN
      SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id = v_acct;
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'buy_credits_cta', true,
        'required_cents', round(v_comm * 100)::bigint,
        'available_cents', round(coalesce(v_avail, 0) * 100)::bigint,
        'detail', SQLERRM);
    END;
  END IF;

  -- Aceite (quando a solicitação ainda estava aberta)
  IF v_need_accept THEN
    INSERT INTO public.freight_quote_proposals (request_id, transporter_user_id, price_brl, status, notes)
    VALUES (p_request_id, v_uid, v_price, 'aceita', 'Aceite direto — Aceitar Serviço e Abrir Contato.')
    ON CONFLICT (request_id, transporter_user_id) DO UPDATE
      SET price_brl = EXCLUDED.price_brl, status = 'aceita', updated_at = now()
    RETURNING id INTO v_prop_id;

    UPDATE public.freight_quote_proposals SET status = 'recusada', updated_at = now()
    WHERE request_id = p_request_id AND id <> v_prop_id AND status = 'enviada';
    UPDATE public.freight_quote_requests
    SET status = 'aceita', accepted_proposal_id = v_prop_id, updated_at = now() WHERE id = p_request_id;
  ELSE
    v_prop_id := v_req.accepted_proposal_id;
  END IF;

  -- Ledger da comissão: atualiza a pendente (aceite via cliente) ou insere
  UPDATE public.freight_service_commissions
     SET status = CASE WHEN v_comm > 0 THEN 'cobrada' ELSE 'isenta' END,
         base_brl = v_price, pct_applied = coalesce(v_pct, 0), commission_brl = coalesce(v_comm, 0)
   WHERE request_id = p_request_id AND transporter_user_id = v_uid AND status = 'pendente';
  IF NOT FOUND THEN
    INSERT INTO public.freight_service_commissions
      (request_id, proposal_id, transporter_user_id, base_brl, pct_applied, commission_brl, status)
    VALUES (p_request_id, v_prop_id, v_uid, v_price, coalesce(v_pct, 0), coalesce(v_comm, 0),
            CASE WHEN v_comm > 0 THEN 'cobrada' ELSE 'isenta' END);
  END IF;

  -- Registro do desbloqueio (dedup) + liberação dos dados
  INSERT INTO public.freight_contact_unlocks
    (request_id, transporter_user_id, base_brl, pct_applied, commission_brl, charged)
  VALUES (p_request_id, v_uid, v_price, coalesce(v_pct, 0), coalesce(v_comm, 0), v_comm > 0)
  ON CONFLICT (request_id, transporter_user_id) DO NOTHING;

  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  RETURN jsonb_build_object('success', true,
    'proposal_id', v_prop_id, 'price', v_price,
    'commission_brl', coalesce(v_comm, 0), 'pct_applied', coalesce(v_pct, 0),
    'contact', public._freight_contact_payload(v_req));
END; $$;

-- ─── 8. Rever contato já desbloqueado (sem nova cobrança) ───────────────────
CREATE OR REPLACE FUNCTION public.freight_get_unlocked_contact(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.freight_quote_requests;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.freight_contact_unlocks
                 WHERE request_id = p_request_id AND transporter_user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_unlocked');
  END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_not_found'); END IF;
  RETURN jsonb_build_object('success', true, 'contact', public._freight_contact_payload(v_req));
END; $$;

-- ─── 9. DIVULGAÇÃO: colunas de destaque + pacotes em banco ──────────────────
ALTER TABLE public.freight_listings
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;
ALTER TABLE public.freight_routes
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;
ALTER TABLE public.freight_fleet_vehicles
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;

-- Pacotes de divulgação de FRETES (Bronze/Prata/Ouro/Diamante) — em BANCO:
-- criar/alterar pacotes futuramente NÃO exige alteração de código.
INSERT INTO public.promotion_packages
  (name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
SELECT * FROM (VALUES
  ('Bronze Fretes','fretes-bronze','Comece a divulgar seus fretes e rotas','#CD7F32','#B87333','🥉',5, 14.90::numeric, ARRAY[7,15,30],
    ARRAY['5 divulgações por dia','Destaque na categoria Fretes','Distribuição ao longo do dia'], true, false, 1, 'fretes'),
  ('Prata Fretes','fretes-prata','Mais alcance para sua transportadora','#9E9E9E','#757575','🥈',10, 29.90::numeric, ARRAY[7,15,30],
    ARRAY['10 divulgações por dia','Prioridade nas pesquisas','Destaque regional (cidade/estado)','Relatório de desempenho'], true, true, 2, 'fretes'),
  ('Ouro Fretes','fretes-ouro','Máxima exposição para fretes e rotas','#FFD700','#FFA500','🥇',30, 59.90::numeric, ARRAY[7,15,30],
    ARRAY['30 divulgações por dia','Selo Premium na vitrine','Rotas patrocinadas aparecem primeiro','Posição privilegiada na busca'], true, false, 3, 'fretes'),
  ('Diamante Fretes','fretes-diamante','Empresa Premium — o topo da plataforma','#B9F2FF','#7DE3F4','💎',60, 99.90::numeric, ARRAY[7,15,30],
    ARRAY['60 divulgações por dia','Empresa Premium (selo + banner)','Veículos Premium em destaque','Prioridade máxima em buscas e rotas','Maior alcance em todas as regiões'], true, false, 4, 'fretes')
) v(name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
WHERE NOT EXISTS (SELECT 1 FROM public.promotion_packages WHERE profile_type = 'fretes');

-- ─── 10. Permissões ─────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.list_freight_open_requests(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_freight_open_requests(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.freight_commission_preview(numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.freight_commission_preview(numeric, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.freight_accept_and_unlock(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.freight_accept_and_unlock(uuid, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.freight_get_unlocked_contact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.freight_get_unlocked_contact(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._freight_contact_payload(public.freight_quote_requests) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._freight_contact_payload(public.freight_quote_requests) TO service_role;

-- ─── VERIFICAÇÃO ────────────────────────────────────────────────────────────
SELECT
  (SELECT enabled FROM public.freight_commission_settings WHERE id = 1) AS comissao_ligada,
  (SELECT percent FROM public.freight_commission_settings WHERE id = 1) AS percentual,
  (SELECT count(*)::int FROM information_schema.tables
    WHERE table_schema='public' AND table_name='freight_contact_unlocks') AS tabela_unlocks_ok,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('list_freight_open_requests','freight_accept_and_unlock','freight_get_unlocked_contact','freight_commission_preview')) AS rpcs_ok,
  (SELECT count(*)::int FROM public.promotion_packages WHERE profile_type='fretes') AS pacotes_fretes,
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='freight_quote_requests' AND policyname IN ('fqr_select_open','fqr_select_proposer')) AS policies_abertas_removidas_deve_ser_0;
