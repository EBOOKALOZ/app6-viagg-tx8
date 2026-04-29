-- Create table for merchant products
CREATE TABLE public.merchant_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  preco NUMERIC NOT NULL DEFAULT 0,
  descricao TEXT,
  imagem_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.merchant_products ENABLE ROW LEVEL SECURITY;

-- Users can view their own products
CREATE POLICY "Users can view their own products"
ON public.merchant_products
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own products
CREATE POLICY "Users can insert their own products"
ON public.merchant_products
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own products
CREATE POLICY "Users can update their own products"
ON public.merchant_products
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own products
CREATE POLICY "Users can delete their own products"
ON public.merchant_products
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all products
CREATE POLICY "Admins can manage all products"
ON public.merchant_products
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_merchant_products_updated_at
BEFORE UPDATE ON public.merchant_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();