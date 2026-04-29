-- Ativando Realtime para a tabela de tickets de suporte
-- Isso garante que o painel do Admin e dos usuários seja atualizado em tempo real

-- 1. Habilitando realtime na tabela support_tickets
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_tickets'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
    END IF;
  END
  $$;
COMMIT;

-- 2. Habilitando realtime na tabela ticket_messages
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ticket_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
    END IF;
  END
  $$;
COMMIT;
