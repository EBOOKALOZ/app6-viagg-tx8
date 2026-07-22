-- ============================================================
-- PERSONALIZAÇÃO VISUAL DO PERFIL PÚBLICO DA LOJA · 2026-07-22
-- Problema: lojista não tem como personalizar a vitrine pública
--   (/loja/:storeId); tudo usa a cor padrão da plataforma.
-- Decisão: coluna appearance JSONB em merchant_stores (o perfil
--   público já faz select("*") — chega ao front sem query extra)
--   + RPC set_store_appearance como ÚNICO caminho de escrita
--   (front nunca escreve direto em merchant_stores — mesma regra
--   da upsert_merchant_store_safe, que NÃO é alterada aqui).
-- O JSON é sanitizado no front (whitelist de tokens: cores hex,
--   enums, números com clamp, URLs https) e revalidado no load;
--   aqui garantimos dono, tipo e tamanho máximo.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- 1) Coluna (nullable — NULL = tema padrão da plataforma)
ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS appearance jsonb;

-- 2) RPC de escrita — dono da loja, objeto JSON, máx 20 KB
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

  SELECT id INTO v_store_id
  FROM public.merchant_stores
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_not_found');
  END IF;

  -- NULL = restaurar padrão da plataforma
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

-- 3) Permissões explícitas (padrão do projeto)
REVOKE ALL ON FUNCTION public.set_store_appearance(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_store_appearance(jsonb) TO authenticated, service_role;

-- ============================================================
-- VERIFICAÇÃO (deve retornar 1 linha com coluna e função OK)
-- ============================================================
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_stores'
      AND column_name = 'appearance') AS coluna_appearance,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_store_appearance') AS rpc_set_store_appearance;
