-- Função para cancelar/excluir (logicamente) um pedido da Cesta (Marketplace)
-- Bypassa bloqueios silenciosos do RLS no frontend garantindo que o usuário é dono da loja.
CREATE OR REPLACE FUNCTION public.cancel_merchant_cesta_order(p_order_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE public.purchase_intentions pi
    SET status = 'cancelled'
    FROM public.merchant_stores ms
    WHERE ms.id = pi.store_id 
      AND ms.user_id = auth.uid()
      AND pi.id = p_order_id;
      
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count > 0;
END;
$$ LANGUAGE plpgsql;
