-- CORREÇÃO: A função get_delivery_motoboy_info estava usando user_id (lojista)
-- ao invés de current_motoboy_id (motoboy que aceitou a entrega)

CREATE OR REPLACE FUNCTION public.get_delivery_motoboy_info(_delivery_id uuid)
 RETURNS TABLE(motoboy_name text, motoboy_phone text, motoboy_vehicle text, motoboy_avatar text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_motoboy_id uuid;
  v_merchant_id uuid;
  v_status text;
BEGIN
  -- Buscar dados do pedido - CORREÇÃO: usar current_motoboy_id
  SELECT current_motoboy_id, merchant_id, status INTO v_current_motoboy_id, v_merchant_id, v_status
  FROM delivery_orders
  WHERE id = _delivery_id;
  
  -- Verificar se o usuário atual é o comerciante do pedido
  IF v_merchant_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado: você não é o comerciante deste pedido';
  END IF;
  
  -- Verificar se há motoboy atribuído
  IF v_current_motoboy_id IS NULL THEN
    RETURN;
  END IF;
  
  -- CORREÇÃO: Verificar se o pedido está em andamento (incluindo mais status)
  IF v_status NOT IN ('a_caminho', 'in_progress', 'accepted', 'em_andamento', 'buscando', 'entregando') THEN
    RETURN;
  END IF;
  
  -- Retornar dados do motoboy usando current_motoboy_id
  RETURN QUERY
  SELECT 
    COALESCE(p.name, 'Motoboy') as motoboy_name,
    COALESCE(p.telefone, mp.whatsapp) as motoboy_phone,
    CONCAT_WS(' ', mp.veiculo_tipo, mp.veiculo_marca, mp.veiculo_modelo) as motoboy_vehicle,
    p.avatar_url as motoboy_avatar
  FROM profiles p
  LEFT JOIN motoboy_profiles mp ON mp.user_id = p.id
  WHERE p.id = v_current_motoboy_id;
END;
$function$;