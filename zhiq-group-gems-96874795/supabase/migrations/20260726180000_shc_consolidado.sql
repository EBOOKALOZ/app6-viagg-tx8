-- Adicionar novo status para o módulo (active_corrected) representando Amarelo
-- [ASHC 2026-07-27] shc_module_status NUNCA existiu em produção (o enum real é
-- shc_status; a 20260727005900 adiciona os valores no tipo certo). Guardado
-- para não abortar a cadeia de migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shc_module_status') THEN
    ALTER TYPE shc_module_status ADD VALUE IF NOT EXISTS 'active_corrected';
  END IF;
END $$;

-- Adicionar colunas de detalhamento no shc_runs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='commit_hash') THEN
    ALTER TABLE public.shc_runs ADD COLUMN commit_hash TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_runs' AND column_name='ia_solver') THEN
    ALTER TABLE public.shc_runs ADD COLUMN ia_solver TEXT;
  END IF;
END $$;

-- Atualizar shc_certificates para contemplar os novos campos solicitados se não existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_certificates' AND column_name='total_tests') THEN
    ALTER TABLE public.shc_certificates ADD COLUMN total_tests INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_certificates' AND column_name='final_score') THEN
    ALTER TABLE public.shc_certificates ADD COLUMN final_score NUMERIC(5,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_certificates' AND column_name='duration') THEN
    ALTER TABLE public.shc_certificates ADD COLUMN duration INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shc_certificates' AND column_name='version') THEN
    ALTER TABLE public.shc_certificates ADD COLUMN version TEXT DEFAULT '1.0.0';
  END IF;
END $$;
