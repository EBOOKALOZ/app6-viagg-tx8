-- Migração SHC Autodiagnóstico V1.5
CREATE TABLE IF NOT EXISTS public.shc_diagnostic_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  version TEXT,
  commit_hash TEXT,
  branch TEXT,
  file_affected TEXT,
  failure_type TEXT NOT NULL, -- 'INFRASTRUCTURE', 'IMPORT_ERROR', 'EXPORT_ERROR', 'COMPILATION_ERROR', 'CIRCULAR_DEPENDENCY', 'CONFIGURATION_ERROR', 'RUNTIME_ERROR', 'OK'
  message TEXT NOT NULL,
  stack_trace TEXT,
  validation_time_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL -- 'PASSED', 'FAILED'
);

-- Permissões
ALTER TABLE public.shc_diagnostic_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shc_diagnostic_history_select_policy" 
ON public.shc_diagnostic_history 
FOR SELECT USING (true);

CREATE POLICY "shc_diagnostic_history_insert_policy" 
ON public.shc_diagnostic_history 
FOR INSERT WITH CHECK (true);
