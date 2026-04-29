-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260413_FIX_DEST_ADDRESS_FALLBACK.sql
-- FIX: dropoff_address_snapshot mostrava "Entrega no Cliente" genérico
--      quando o lojista selecionava ponto no mapa sem endereço textual.
--      Agora usa coordenadas formatadas como endereço de fallback.
-- ══════════════════════════════════════════════════════════════════════

xa
