-- Criar tabela de regras de comissão para motoboys
CREATE TABLE public.regras_comissao_motoboy (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grupos_min INTEGER NOT NULL,
  grupos_max INTEGER,
  percentual NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.regras_comissao_motoboy ENABLE ROW LEVEL SECURITY;

-- Política: qualquer um pode ler as regras
CREATE POLICY "Anyone can read commission rules"
ON public.regras_comissao_motoboy
FOR SELECT
USING (true);

-- Popular com as regras definidas
INSERT INTO public.regras_comissao_motoboy (grupos_min, grupos_max, percentual) VALUES
  (0, 0, 35),
  (1, 1, 28),
  (2, 2, 20),
  (3, 3, 15),
  (4, 4, 11),
  (5, 5, 8),
  (6, NULL, 6);

-- Criar função para obter taxa de comissão do motoboy
CREATE OR REPLACE FUNCTION public.get_motoboy_commission_rate(_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  _active_groups INTEGER;
  _rate NUMERIC;
BEGIN
  -- Contar grupos ativos do motoboy
  SELECT COUNT(*) INTO _active_groups
  FROM public.motoboy_whatsapp_groups
  WHERE user_id = _user_id AND status = 'ativo';
  
  -- Buscar taxa correspondente
  SELECT percentual INTO _rate
  FROM public.regras_comissao_motoboy
  WHERE _active_groups >= grupos_min
    AND (_active_groups <= grupos_max OR grupos_max IS NULL)
  ORDER BY grupos_min DESC
  LIMIT 1;
  
  -- Fallback para 35% se não encontrar
  RETURN COALESCE(_rate, 35);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;