-- Add user_type to support_tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS user_type TEXT;

-- Rename table ticket_mensagens to ticket_messages
ALTER TABLE public.ticket_mensagens RENAME TO ticket_messages;

-- Rename indexes
ALTER INDEX IF EXISTS idx_ticket_mensagens_ticket_id RENAME TO idx_ticket_messages_ticket_id;
ALTER INDEX IF EXISTS idx_ticket_mensagens_created_at RENAME TO idx_ticket_messages_created_at;

-- Drop and recreate policies with the new names just in case, though Postgres usually handles this implicitly
DROP POLICY IF EXISTS "Users can view messages from their tickets" ON public.ticket_messages;
CREATE POLICY "Users can view messages from their tickets"
ON public.ticket_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets st 
    WHERE st.id = ticket_id AND st.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert messages to their tickets" ON public.ticket_messages;
CREATE POLICY "Users can insert messages to their tickets"
ON public.ticket_messages
FOR INSERT
WITH CHECK (
  autor = 'cliente' AND
  EXISTS (
    SELECT 1 FROM public.support_tickets st 
    WHERE st.id = ticket_id AND st.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage all messages" ON public.ticket_messages;
CREATE POLICY "Admins can manage all messages"
ON public.ticket_messages
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));
