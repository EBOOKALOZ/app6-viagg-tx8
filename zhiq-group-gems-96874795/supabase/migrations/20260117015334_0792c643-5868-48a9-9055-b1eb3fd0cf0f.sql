-- Atualizar função para gerar código de 4 dígitos
CREATE OR REPLACE FUNCTION public.generate_delivery_code()
 RETURNS character varying
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            WHERE delivery_code = new_code 
            AND status IN ('pending', 'accepted', 'a_caminho', 'in_progress')
        ) INTO code_exists;
        
        -- Exit loop if code is unique
        IF NOT code_exists THEN
            RETURN new_code;
        END IF;
    END LOOP;
END;
$function$;