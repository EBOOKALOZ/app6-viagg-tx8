-- 20260726_auction_update_delete_rpcs.sql

-- RPC para atualização segura de leilões
CREATE OR REPLACE FUNCTION public.update_auction_listing(
  p_listing_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing record;
  v_user_id uuid := auth.uid();
BEGIN
  -- 1. Verifica auth
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  -- 2. Busca e trava a linha
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  END IF;

  -- 3. Verifica ownership
  IF v_listing.owner_user_id != v_user_id AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada');
  END IF;

  -- 4. Atualiza os campos permitidos
  -- Se o campo vier nulo explicitamente no JSON ou omitido, mantemos o atual.
  UPDATE public.auction_listings
  SET
    title = COALESCE((p_updates->>'title')::text, title),
    description = COALESCE((p_updates->>'description')::text, description),
    product_image_url = COALESCE((p_updates->>'product_image_url')::text, product_image_url),
    fulfillment_type = COALESCE((p_updates->>'fulfillment_type')::text, fulfillment_type),
    buy_now_price_cents = COALESCE((p_updates->>'buy_now_price_cents')::integer, buy_now_price_cents),
    updated_at = now()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- RPC para exclusão segura de leilões
CREATE OR REPLACE FUNCTION public.delete_auction_listing(
  p_listing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing record;
  v_user_id uuid := auth.uid();
BEGIN
  -- 1. Verifica auth
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  -- 2. Busca o leilão
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id;
  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  END IF;

  -- 3. Verifica ownership
  IF v_listing.owner_user_id != v_user_id AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada');
  END IF;

  -- 4. Opcional: proibir deleção se já tem lances (proteção extra de integridade)
  IF v_listing.total_bids > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível excluir um leilão que já possui lances.');
  END IF;

  -- 5. Proibir exclusão de leilão/arremate ativo
  IF v_listing.status IN ('active', 'approved', 'EM_ANDAMENTO') OR (v_listing.status NOT IN ('ended', 'cancelled', 'sold') AND v_listing.ends_at > now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível excluir um leilão que ainda está em andamento.');
  END IF;

  -- 5. Exclui o leilão
  DELETE FROM public.auction_listings WHERE id = p_listing_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
