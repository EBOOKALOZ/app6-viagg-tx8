CREATE OR REPLACE FUNCTION public.delete_auction_listing(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- 4. Bloquear exclusão se o leilão estiver em andamento
  IF v_listing.status = 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'O leilão ainda está em andamento e não pode ser excluído.');
  END IF;

  -- 5. Opcional: proibir deleção se já tem lances (proteção extra de integridade)
  IF v_listing.total_bids > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível excluir um leilão que já possui lances.');
  END IF;

  -- 6. Exclui o leilão
  DELETE FROM public.auction_listings WHERE id = p_listing_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;
