-- Create support_tickets table
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  assunto TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  categoria TEXT DEFAULT 'geral',
  status TEXT NOT NULL DEFAULT 'aberto',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can view their own tickets
CREATE POLICY "Users can view their own tickets"
ON public.support_tickets
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own tickets
CREATE POLICY "Users can insert their own tickets"
ON public.support_tickets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can manage all tickets
CREATE POLICY "Admins can manage all tickets"
ON public.support_tickets
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();