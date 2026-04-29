-- Função para buscar dados do motoboy que aceitou uma entrega
-- SECURITY DEFINER permite que o comerciante veja dados do motoboy
CREATE OR REPLACE FUNCTION public.get_delivery_motoboy_info(_delivery_id uuid)
RETURNS TABLE (
  motoboy_name text,
  motoboy_phone text,
  motoboy_vehicle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motoboy_id uuid;
  v_merchant_id uuid;
  v_status text;
BEGIN
  -- Buscar dados do pedido
  SELECT user_id, merchant_id, status INTO v_motoboy_id, v_merchant_id, v_status
  FROM delivery_orders
  WHERE id = _delivery_id;
  
  -- Verificar se o usuário atual é o comerciante do pedido
  IF v_merchant_id != auth.uid() THEN
    RAISE EXCEPTION 'Acesso negado: você não é o comerciante deste pedido';
  END IF;
  
  -- Verificar se o pedido está em andamento
  IF v_status NOT IN ('in_progress', 'accepted', 'em_andamento') THEN
    RETURN;
  END IF;
  
  -- Retornar dados do motoboy
  RETURN QUERY
  SELECT 
    COALESCE(p.name, 'Motoboy') as motoboy_name,
    COALESCE(p.telefone, mp.whatsapp) as motoboy_phone,
    CONCAT_WS(' ', mp.veiculo_tipo, mp.veiculo_marca, mp.veiculo_modelo) as motoboy_vehicle
  FROM profiles p
  LEFT JOIN motoboy_profiles mp ON mp.user_id = p.id
  WHERE p.id = v_motoboy_id;
END;
$$;