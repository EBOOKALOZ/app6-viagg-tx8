-- ============================================================================
-- P0-2 — real_estate_media: remover leitura pública irrestrita
-- ============================================================================
-- A policy "public_read_media" usa USING (true) para {anon, authenticated},
-- expondo TODA a mídia (inclusive de anúncios não publicados/moderados).
-- A leitura pública legítima já é coberta pela policy condicional
-- "Allow public read for published media" (exige listing 'published'),
-- que permanece intacta, assim como as policies de owner e admin.
--
-- Idempotente: DROP POLICY IF EXISTS + guard fail-closed de verificação.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "public_read_media" ON public.real_estate_media;

-- Guard fail-closed: falha se restar qualquer policy de SELECT/ALL com
-- USING (true) acessível a anon nesta tabela.
DO $$
DECLARE
  v_offender text;
BEGIN
  SELECT policyname INTO v_offender
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'real_estate_media'
    AND cmd IN ('SELECT', 'ALL')
    AND qual = 'true'
    AND 'anon' = ANY (roles)
  LIMIT 1;

  IF v_offender IS NOT NULL THEN
    RAISE EXCEPTION 'P0-2: ainda existe policy de leitura publica irrestrita em real_estate_media: %', v_offender;
  END IF;
END $$;

COMMIT;
