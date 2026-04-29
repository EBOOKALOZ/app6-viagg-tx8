-- Corrigir policy de INSERT para ser mais restritiva
DROP POLICY IF EXISTS "System can insert transactions" ON public.motoboy_wallet_transactions;

-- Apenas admins e triggers podem inserir (via SECURITY DEFINER functions)
CREATE POLICY "Only admins can insert transactions"
ON public.motoboy_wallet_transactions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));