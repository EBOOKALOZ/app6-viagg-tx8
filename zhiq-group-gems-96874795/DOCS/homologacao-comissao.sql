-- ════════════════════════════════════════════════════════════════════════
-- HOMOLOGAÇÃO — FONTE ÚNICA DE COMISSÃO (rodar APÓS 20260710_comissao_
-- fonte_unica.sql e após concluir UMA entrega de teste ponta a ponta).
-- SOMENTE LEITURA. Esperado: colunas *_net todas IGUAIS na mesma linha.
-- ════════════════════════════════════════════════════════════════════════

-- H1. A função oficial existe e responde? (troque o uuid por um motoboy)
SELECT public.official_motoboy_commission(user_id) AS pct_oficial, user_id
  FROM public.motoboy_profiles LIMIT 4;

-- H2. Ofertas recentes: status sincronizado + valores nascidos na oferta
SELECT id, status, offer_status, commission_percent, gross_value, net_value, created_at
  FROM public.delivery_offers
 ORDER BY created_at DESC LIMIT 6;
-- Esperado: status = offer_status em TODAS as linhas; commission_percent
-- preenchido (tier oficial); net_value = gross*(1-pct/100).

-- H3. PROVA DA IGUALDADE — última entrega concluída:
--     oferta aceita × ledger (carteira) × espelho (extrato/admin)
WITH ultima AS (
  SELECT id FROM public.service_orders
   WHERE status::text = 'delivered'
   ORDER BY updated_at DESC LIMIT 1
)
SELECT
  (SELECT net_value FROM public.delivery_offers
    WHERE service_order_id = (SELECT id FROM ultima)
      AND (offer_status='accepted' OR status='accepted')
    ORDER BY accepted_at DESC NULLS LAST LIMIT 1)          AS oferta_net,
  (SELECT amount FROM public.pay_ledger_entries
    WHERE reference_id = (SELECT id FROM ultima)
      AND entry_type = 'motoboy_earning'
    ORDER BY created_at DESC LIMIT 1)                      AS ledger_carteira_net,
  (SELECT professional_amount_cents / 100.0 FROM public.pay_escrow_holds
    WHERE idempotency_key = 'so-' || (SELECT id FROM ultima)::text) AS espelho_extrato_net,
  (SELECT amount FROM public.pay_ledger_entries
    WHERE reference_id = (SELECT id FROM ultima)
      AND entry_type = 'commission_income'
    ORDER BY created_at DESC LIMIT 1)                      AS ledger_comissao_plataforma,
  (SELECT platform_fee_cents / 100.0 FROM public.pay_escrow_holds
    WHERE idempotency_key = 'so-' || (SELECT id FROM ultima)::text) AS espelho_comissao;
-- Esperado: oferta_net = ledger_carteira_net = espelho_extrato_net
--        e  ledger_comissao_plataforma = espelho_comissao.

-- H4. Nenhum resíduo dos fallbacks antigos nas funções vivas
SELECT p.proname,
       (pg_get_functiondef(p.oid) LIKE '%0.80%') AS tem_080,
       (pg_get_functiondef(p.oid) LIKE '%0.75%') AS tem_075
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('pay_release_ride_payment',
                     'record_escrow_on_service_order_delivered',
                     'create_delivery_offers_for_order');
-- Esperado: tem_080 = false e tem_075 = false nas 3 funções.
