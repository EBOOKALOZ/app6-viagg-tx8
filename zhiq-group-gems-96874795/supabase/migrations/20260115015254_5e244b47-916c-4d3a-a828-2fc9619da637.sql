-- Create ticket messages table
CREATE TABLE public.ticket_mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  autor TEXT NOT NULL, -- 'cliente' or 'suporte'
  conteudo TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_mensagens ENABLE ROW LEVEL SECURITY;

-- Users can view messages from their own tickets
CREATE POLICY "Users can view messages from their tickets"
ON public.ticket_mensagens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets st 
    WHERE st.id = ticket_id AND st.user_id = auth.uid()
  )
);

-- Users can insert messages to their own tickets
CREATE POLICY "Users can insert messages to their tickets"
ON public.ticket_mensagens
FOR INSERT
WITH CHECK (
  autor = 'cliente' AND
  EXISTS (
    SELECT 1 FROM public.support_tickets st 
    WHERE st.id = ticket_id AND st.user_id = auth.uid()
  )
);

-- Admins can manage all messages
CREATE POLICY "Admins can manage all messages"
ON public.ticket_mensagens
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for faster lookups
CREATE INDEX idx_ticket_mensagens_ticket_id ON public.ticket_mensagens(ticket_id);
CREATE INDEX idx_ticket_mensagens_created_at ON public.ticket_mensagens(ticket_id, created_at);