-- Adicionar coluna pickup_code para código de retirada na loja
ALTER TABLE public.delivery_orders 
ADD COLUMN IF NOT EXISTS pickup_code VARCHAR(4);

-- Criar função para gerar código de retirada único (4 dígitos)
CREATE OR REPLACE FUNCTION public.generate_pickup_code()
RETURNS VARCHAR(4)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_code varchar(4);
    code_exists boolean;
BEGIN
    LOOP
        -- Generate random 4-digit code (0000-9999)
        new_code := LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
        
        -- Check if code already exists for active orders
        SELECT EXISTS (
            SELECT 1 FROM public.delivery_orders 
            WHERE pickup_code = new_code 
            AND status IN ('pending', 'accepted', 'a_caminho')
        ) INTO code_exists;
        
        -- Exit loop if code is unique
        IF NOT code_exists THEN
            RETURN new_code;
        END IF;
    END LOOP;
END;
$$;

-- Criar função para validar código de retirada
CREATE OR REPLACE FUNCTION public.validate_pickup_code(_order_id uuid, _code varchar)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    order_record RECORD;
BEGIN
    -- Get the order - verificar se o motoboy atual é quem está validando
    SELECT * INTO order_record
    FROM public.delivery_orders
    WHERE id = _order_id
    AND current_motoboy_id = auth.uid();
    
    -- Check if order exists and belongs to the motoboy
    IF order_record IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if code matches
    IF order_record.pickup_code IS NULL OR order_record.pickup_code != _code THEN
        RETURN false;
    END IF;
    
    -- Check if order is in valid state for pickup confirmation
    IF order_record.status NOT IN ('accepted', 'a_caminho') THEN
        RETURN false;
    END IF;
    
    -- Update order status to in_progress (produto retirado)
    UPDATE public.delivery_orders
    SET status = 'in_progress'
    WHERE id = _order_id;
    
    RETURN true;
END;
$$;