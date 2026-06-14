-- ===================================================================
-- Suporte: permitir que o ADMIN (reconhecido por e-mail ou profiles.is_admin)
-- gerencie TODOS os tickets, mensagens e anexos — para conseguir responder e
-- resolver os chamados no /admin/support.
--
-- As policies originais usavam has_role()/app_role, que não existe neste banco;
-- por isso o admin não conseguia ver os tickets dos outros usuários.
-- ===================================================================

-- Função helper: o usuário atual é admin? (e-mail whitelist OU profiles.is_admin)
CREATE OR REPLACE FUNCTION public.is_email_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.email() IN ('angelo_zanatta@hotmail.com', 'angelozanatta100@gmail.com')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;

-- support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Email admin manage support_tickets" ON public.support_tickets;
CREATE POLICY "Email admin manage support_tickets"
ON public.support_tickets FOR ALL TO authenticated
USING (public.is_email_admin())
WITH CHECK (public.is_email_admin());

-- ticket_messages
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Email admin manage ticket_messages" ON public.ticket_messages;
CREATE POLICY "Email admin manage ticket_messages"
ON public.ticket_messages FOR ALL TO authenticated
USING (public.is_email_admin())
WITH CHECK (public.is_email_admin());

-- (a tabela ticket_anexos não existe neste banco — anexos ficam só no storage)
