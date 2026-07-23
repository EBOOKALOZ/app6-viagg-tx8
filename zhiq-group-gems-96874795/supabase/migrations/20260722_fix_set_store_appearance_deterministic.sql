-- ============================================================
-- FIX: set_store_appearance determinístico · 2026-07-22
-- Sintoma relatado: lojista salva a aparência no editor e o tema
--   NÃO aparece na loja pública (/loja/:id).
-- Causa: o RPC escolhia a loja com "LIMIT 1" SEM ORDER BY — com
--   mais de uma loja por user_id, o Postgres pode retornar
--   qualquer linha, salvando o tema numa loja diferente da que o
--   editor (MerchantStoreAppearance) e a página pública usam
--   (ambos usam a MAIS ANTIGA: ORDER BY created_at ASC LIMIT 1).
-- Correção: mesmo critério em todo lugar (loja mais antiga).
-- Nenhuma mudança no front do lojista. Idempotente. SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_store_appearance(p_appearance jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Loja MAIS ANTIGA do dono — mesmo critério do editor e da página pública.
  SELECT id INTO v_store_id
  FROM public.merchant_stores
  WHERE user_id = v_uid
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_not_found');
  END IF;

  IF p_appearance IS NOT NULL THEN
    IF jsonb_typeof(p_appearance) <> 'object' THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_payload');
    END IF;
    IF length(p_appearance::text) > 20000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'payload_too_large');
    END IF;
  END IF;

  UPDATE public.merchant_stores
  SET appearance = p_appearance
  WHERE id = v_store_id;

  RETURN jsonb_build_object('success', true, 'store_id', v_store_id,
    'cleared', p_appearance IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.set_store_appearance(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_store_appearance(jsonb) TO authenticated, service_role;

-- VERIFICAÇÃO: a função deve conter "ORDER BY created_at"
SELECT position('ORDER BY created_at' in pg_get_functiondef(p.oid)) > 0 AS corrigido
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_store_appearance';
