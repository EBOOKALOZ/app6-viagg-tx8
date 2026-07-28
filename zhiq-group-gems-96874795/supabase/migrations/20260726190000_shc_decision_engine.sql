-- Adicionar colunas de Decisão ao shc_runs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='decision_id') THEN
    ALTER TABLE public.shc_runs ADD COLUMN decision_id UUID UNIQUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='decision') THEN
    ALTER TABLE public.shc_runs ADD COLUMN decision TEXT; -- APPROVED, APPROVED_WITH_WARNINGS, REVIEW_REQUIRED, FAILED
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='deploy_allowed') THEN
    ALTER TABLE public.shc_runs ADD COLUMN deploy_allowed BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='certificate_allowed') THEN
    ALTER TABLE public.shc_runs ADD COLUMN certificate_allowed BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='blocking') THEN
    ALTER TABLE public.shc_runs ADD COLUMN blocking BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='warnings') THEN
    ALTER TABLE public.shc_runs ADD COLUMN warnings INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='critical') THEN
    -- A coluna critical_errors já existe, mas a spec pede 'critical'.
    -- Para não remover, criamos ou usamos critical_errors no código, mas vamos adicionar 'critical'
    ALTER TABLE public.shc_runs ADD COLUMN critical INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='decision_reason') THEN
    ALTER TABLE public.shc_runs ADD COLUMN decision_reason TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='decision_timestamp') THEN
    ALTER TABLE public.shc_runs ADD COLUMN decision_timestamp TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='decision_version') THEN
    ALTER TABLE public.shc_runs ADD COLUMN decision_version TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='decision_hash') THEN
    ALTER TABLE public.shc_runs ADD COLUMN decision_hash TEXT;
  END IF;
END $$;

-- Criar tabela Histórico de Decisões
CREATE TABLE IF NOT EXISTS public.shc_decision_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL,
    run_id UUID NOT NULL REFERENCES public.shc_runs(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    score NUMERIC(5,2) DEFAULT 0,
    reason TEXT,
    commit_hash TEXT,
    branch TEXT,
    version TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by TEXT DEFAULT 'ORION MASTER (SHC-00)',
    execution_time TEXT,
    agents JSONB DEFAULT '[]',
    hash TEXT NOT NULL
);

-- Indexes e RLS
CREATE INDEX IF NOT EXISTS idx_shc_decision_history_run_id ON public.shc_decision_history(run_id);
ALTER TABLE public.shc_decision_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shc_decision_history_select" ON public.shc_decision_history;
CREATE POLICY "shc_decision_history_select" ON public.shc_decision_history FOR SELECT USING (true);
DROP POLICY IF EXISTS "shc_decision_history_insert" ON public.shc_decision_history;
CREATE POLICY "shc_decision_history_insert" ON public.shc_decision_history FOR INSERT WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.shc_decision_history;
