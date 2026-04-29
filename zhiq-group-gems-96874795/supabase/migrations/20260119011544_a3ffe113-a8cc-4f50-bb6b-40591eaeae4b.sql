-- Tabela de comprovantes de pagamento
CREATE TABLE public.payment_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('motoboy_payment', 'merchant_recharge')),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  paid_by UUID,
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  details JSONB DEFAULT '{}'::jsonb,
  receipt_hash TEXT NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own receipts" 
ON public.payment_receipts 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all receipts" 
ON public.payment_receipts 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index para performance
CREATE INDEX idx_payment_receipts_user_id ON public.payment_receipts(user_id);
CREATE INDEX idx_payment_receipts_type ON public.payment_receipts(receipt_type);
CREATE INDEX idx_payment_receipts_created ON public.payment_receipts(created_at DESC);