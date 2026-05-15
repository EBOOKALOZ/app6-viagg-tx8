-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 05 / merchant_credit_usage_rules (delivery/wallet)
-- Expande pricing_mode pra aceitar 'dynamic' e 'event_only' e seed das regras.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.merchant_credit_usage_rules
  DROP CONSTRAINT IF EXISTS merchant_credit_usage_rules_pricing_mode_check;

ALTER TABLE public.merchant_credit_usage_rules
  ADD CONSTRAINT merchant_credit_usage_rules_pricing_mode_check
  CHECK (pricing_mode IN ('fixed','percentage','tiered','dynamic','event_only'));

INSERT INTO public.merchant_credit_usage_rules
  (feature_code, feature_name, credits_cost, pricing_mode, is_active, module_name, event_type, description, metadata)
VALUES
  ('delivery_request', 'Solicitação de entrega', 0, 'dynamic', true, 'DELIVERY', 'delivery_order.created',
   'Custo computado dinamicamente: base_fee + km_fee + priority_fee. HOLD feito na criação.',
   jsonb_build_object('cost_formula', 'base_fee + (km_fee * distance_km) + priority_fee')),
  ('delivery_completed', 'Entrega concluída', 0, 'event_only', true, 'DELIVERY', 'delivery_order.delivered',
   'Evento de liquidação. Sem cobrança extra — libera o HOLD pro motoboy.', '{}'::jsonb),
  ('delivery_cancelled_merchant', 'Cancelamento de entrega (lojista)', 0, 'event_only', true, 'DELIVERY', 'delivery_order.cancelled_by_merchant',
   'Estorno integral do HOLD ao lojista.', '{}'::jsonb),
  ('delivery_cancelled_motoboy', 'Cancelamento de entrega (motoboy)', 0, 'event_only', true, 'DELIVERY', 'delivery_order.cancelled_by_motoboy',
   'Estorno integral do HOLD ao lojista. Pode disparar reputação negativa.', '{}'::jsonb),
  ('delivery_expired', 'Entrega expirada', 0, 'event_only', true, 'DELIVERY', 'delivery_order.expired',
   'Nenhum motoboy aceitou no prazo. HOLD é estornado.', '{}'::jsonb),
  ('motoboy_payout_request', 'Solicitação de saque (motoboy)', 0, 'event_only', true, 'WALLET', 'payout.requested',
   'Sem custo. Reserva no saldo até liquidação PIX.', '{}'::jsonb)
ON CONFLICT (feature_code) DO NOTHING;
