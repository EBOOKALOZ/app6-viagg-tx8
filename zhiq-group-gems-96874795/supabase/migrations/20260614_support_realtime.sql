-- ===================================================================
-- Habilita Realtime (publicação supabase_realtime) nas tabelas do suporte,
-- para que os chats (cliente e admin) atualizem em tempo real, sem F5.
-- O código já assina os eventos; faltava as tabelas estarem na publicação.
-- Idempotente: só adiciona se ainda não estiver.
-- ===================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ticket_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
END $$;

-- Garante que UPDATEs entreguem a linha completa (status do ticket etc).
ALTER TABLE public.ticket_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
