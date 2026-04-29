-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260413_ADD_BAIRRO_MOTOBOY_PROFILES.sql
-- Adiciona coluna `bairro` à tabela motoboy_profiles para que o motoboy
-- possa informar o bairro de atuação no seu perfil operacional.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.motoboy_profiles
  ADD COLUMN IF NOT EXISTS bairro text;

COMMENT ON COLUMN public.motoboy_profiles.bairro
  IS 'Bairro de atuação preferencial do motoboy';

SELECT 'OK: coluna bairro adicionada a motoboy_profiles' AS resultado;
