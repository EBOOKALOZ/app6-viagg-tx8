-- ============================================================
-- CAIXA-PRETA DE ERROS DO CLIENTE (2026-07-12)
-- Todo crash de tela (window.onerror, promise rejeitada, ErrorBoundary)
-- é gravado aqui pelo próprio app — diagnóstico sem depender de prints.
-- INSERT: qualquer autenticado (só nos próprios dados).
-- SELECT: admin. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_errors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  message     text,
  stack       text,
  component_stack text,
  url         text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_errors_insert ON public.client_errors;
CREATE POLICY client_errors_insert ON public.client_errors
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_client_errors_created ON public.client_errors (created_at DESC);
