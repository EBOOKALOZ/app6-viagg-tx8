-- ============================================================
-- PROMOTED_LISTING_SLOTS — status + networks + RPCs · 2026-07-16
-- Problema: o front (Divulgar Grátis) filtra a fila por status e
--   chama a RPC update_slot_status, mas a coluna status e a RPC
--   nunca existiram neste banco (drift) — a Fila de Publicação
--   nunca restaurava e remover/pausar falhava em silêncio.
-- Decisão: status text ('active'|'paused'|'removed', default active);
--   networks text[] = redes que o lojista escolheu por anúncio;
--   RPCs update_slot_status / update_slot_networks com guarda de dono.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- 1) Colunas
ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.promoted_listing_slots
  ADD COLUMN IF NOT EXISTS networks text[] NOT NULL DEFAULT ARRAY['whatsapp','instagram'];

-- 2) Check de status (idempotente)
DO $$
BEGIN
  ALTER TABLE public.promoted_listing_slots
    ADD CONSTRAINT promoted_listing_slots_status_chk
    CHECK (status IN ('active','paused','removed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) RPC: mudar status do slot (pausar/retomar/excluir) — só o dono
DROP FUNCTION IF EXISTS public.update_slot_status(uuid, text); -- ORION-480: versão anterior retornava jsonb; replay exige drop antes de mudar RETURNS
CREATE OR REPLACE FUNCTION public.update_slot_status(p_slot_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'requer autenticacao';
  END IF;
  IF p_status NOT IN ('active','paused','removed') THEN
    RAISE EXCEPTION 'status invalido: %', p_status;
  END IF;
  UPDATE public.promoted_listing_slots
     SET status = p_status
   WHERE id = p_slot_id
     AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot nao encontrado ou sem permissao';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_slot_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_slot_status(uuid, text) TO authenticated, service_role;

-- 4) RPC: redes de divulgação escolhidas para o slot — só o dono
CREATE OR REPLACE FUNCTION public.update_slot_networks(p_slot_id uuid, p_networks text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'requer autenticacao';
  END IF;
  UPDATE public.promoted_listing_slots
     SET networks = COALESCE(p_networks, ARRAY[]::text[])
   WHERE id = p_slot_id
     AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'slot nao encontrado ou sem permissao';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_slot_networks(uuid, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_slot_networks(uuid, text[]) TO authenticated, service_role;

-- 5) Verificação (esperado: colunas_ok = 2, rpcs_ok = 2)
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'promoted_listing_slots'
      AND column_name  IN ('status','networks'))                        AS colunas_ok,
  (SELECT count(*) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('update_slot_status','update_slot_networks'))   AS rpcs_ok;
