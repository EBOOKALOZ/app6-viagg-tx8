-- ═══════════════════════════════════════════════════════════════
-- Hardening pré-deploy: fixa search_path nas 5 funções-trigger ORION
-- que estavam sem (achado da auditoria geral). ALTER só de metadados —
-- não recompila corpo nem muda comportamento; pin público impede
-- ambiguidade de resolução de schema. (apply_pricing_to_delivery_order
-- e update_ride_pricing_config NÃO são ORION — fora de escopo.)
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════
ALTER FUNCTION public.orion_campaign_tg_evento()  SET search_path = public;
ALTER FUNCTION public.orion_campanhas_guard()     SET search_path = public;
ALTER FUNCTION public.orion_package_tg_evento()   SET search_path = public;
ALTER FUNCTION public.orion_pacotes_guard()       SET search_path = public;
ALTER FUNCTION public.ridv_tg_ping_worker()       SET search_path = public;
