-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION: 20260410_FIX_GET_MY_STORE_CATEGORIA.sql
-- OBJETIVO: Corrigir coluna inexistente "categoria" no INSERT do
-- get_my_store(). A tabela merchant_stores usa "categoria_id" (UUID),
-- não "categoria" (text).
-- ══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_my_store();

CREATE OR REPLACE FUNCTION public.get_my_store()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_store_record record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Usuário não autenticado.');
  END IF;

  -- 1. Buscar loja existente atrelada a este owner (preferindo as criadas primeiro)
  SELECT *
  INTO v_store_record
  FROM public.merchant_stores
  WHERE user_id = v_uid
  ORDER BY created_at ASC
  LIMIT 1;

  -- 2. Se a loja ainda não existe para esse usuário, cria silenciosamente o esqueleto
  IF NOT FOUND THEN
    INSERT INTO public.merchant_stores (
      user_id,
      nome_loja,
      status
    ) VALUES (
      v_uid,
      'Minha Loja',
      'Ativa'
    ) RETURNING * INTO v_store_record;
  END IF;

  -- Retorna os dados da loja garantida dinamicamente
  RETURN json_build_object(
    'success', true,
    'store', row_to_json(v_store_record)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', sqlerrm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_store() TO authenticated;
