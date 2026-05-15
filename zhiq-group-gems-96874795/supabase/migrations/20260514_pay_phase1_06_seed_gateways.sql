-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGG-TX8 — FASE 1 / SQL 06 / Seed payment_gateways
-- Mock (sandbox, ATIVO) + Mercado Pago (sandbox, inativo).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.payment_gateways
  (provider_code, display_name, mode, is_active, credentials, config)
SELECT
  'mock', 'Mock (Desenvolvimento)', 'sandbox', true,
  '{}'::jsonb,
  jsonb_build_object('mock_auto_confirm_seconds', 0, 'mock_force_failure', false)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateways WHERE provider_code = 'mock'
);

INSERT INTO public.payment_gateways
  (provider_code, display_name, mode, is_active, credentials, config)
SELECT
  'mercadopago', 'Mercado Pago (Sandbox)', 'sandbox', false,
  '{}'::jsonb, '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_gateways WHERE provider_code = 'mercadopago'
);
