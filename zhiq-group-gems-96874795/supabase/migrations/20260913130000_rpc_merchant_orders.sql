-- 1. Lista os pedidos da Cesta para o Lojista autenticado
CREATE OR REPLACE FUNCTION public.get_merchant_cesta_orders()
RETURNS TABLE (
    id UUID,
    customer_name TEXT,
    customer_whatsapp TEXT,
    subtotal NUMERIC,
    total_items INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ,
    checkout_mode TEXT,
    payment_status TEXT,
    credits_charged INTEGER
) 
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pi.id, 
        pi.customer_name, 
        pi.customer_whatsapp, 
        pi.subtotal, 
        pi.total_items, 
        pi.status, 
        pi.created_at,
        pi.checkout_mode,
        pi.payment_status,
        pi.credits_charged
    FROM public.purchase_intentions pi
    INNER JOIN public.merchant_stores ms ON ms.id = pi.store_id
    WHERE ms.user_id = auth.uid()
    ORDER BY pi.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 2. Retorna a contagem exata de pedidos pendentes para o Badge
CREATE OR REPLACE FUNCTION public.get_merchant_cesta_orders_count()
RETURNS INTEGER
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.purchase_intentions pi
    INNER JOIN public.merchant_stores ms ON ms.id = pi.store_id
    WHERE ms.user_id = auth.uid() AND pi.status NOT IN ('completed', 'cancelled');
    
    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;
