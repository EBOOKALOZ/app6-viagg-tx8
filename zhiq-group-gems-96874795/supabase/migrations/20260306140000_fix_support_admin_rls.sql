-- Correção de RLS para painel de suporte Admin
-- Substitui a verificação obsoleta has_role(..., 'admin'::app_role) por public.has_role(..., 'admin')
-- que corretamente verifica a tabela user_roles da aplicação em vez dos claims do JWT.

-- 1. support_tickets
DROP POLICY IF EXISTS "Admins can manage all tickets" ON public.support_tickets;
CREATE POLICY "Admins can manage all tickets"
ON public.support_tickets
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 2. ticket_messages
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.ticket_messages;
CREATE POLICY "Admins can manage all messages"
ON public.ticket_messages
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 3. ticket_anexos
DROP POLICY IF EXISTS "Admins podem gerenciar todos os anexos de tickets" ON public.ticket_anexos;
CREATE POLICY "Admins podem gerenciar todos os anexos de tickets"
ON public.ticket_anexos
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- (Corrige a política de SELECT existente que referenciava profiles.role incorretamente)
DROP POLICY IF EXISTS "Usuários podem ver anexos dos próprios tickets" ON public.ticket_anexos;
CREATE POLICY "Usuários podem ver anexos dos próprios tickets"
ON public.ticket_anexos FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.support_tickets
        WHERE support_tickets.id = ticket_anexos.ticket_id
        AND support_tickets.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
);
