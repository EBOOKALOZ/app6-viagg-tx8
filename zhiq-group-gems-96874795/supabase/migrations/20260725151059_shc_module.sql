-- Migration para o SHC (Sistema de Homologação Contínua)
-- Criação de tabelas
-- [ASHC 2026-07-27] uuid-ossp era exigida sem CREATE EXTENSION (reset quebrava)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE shc_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE shc_status AS ENUM ('pending', 'running', 'passed', 'failed');
CREATE TYPE shc_correction_status AS ENUM ('pending', 'fixing', 'fixed', 'validated');

-- 1. Módulos
CREATE TABLE shc_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    status shc_status DEFAULT 'pending',
    quality_score NUMERIC(5,2) DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    last_duration_ms INTEGER,
    coordinator_ai TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Execuções (Test Runs)
CREATE TABLE shc_test_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES shc_modules(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    branch TEXT,
    commit_hash TEXT,
    files_changed INTEGER DEFAULT 0,
    total_duration_ms INTEGER,
    result shc_status DEFAULT 'running',
    coordinator_ai TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Resultados Detalhados (Tests)
CREATE TABLE shc_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES shc_test_runs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    result shc_status NOT NULL,
    duration_ms INTEGER,
    responsible_ai TEXT,
    evidence TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Correções
CREATE TABLE shc_corrections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES shc_test_runs(id) ON DELETE CASCADE,
    test_id UUID REFERENCES shc_test_results(id) ON DELETE CASCADE,
    module_id UUID REFERENCES shc_modules(id) ON DELETE CASCADE,
    failure_description TEXT NOT NULL,
    severity shc_severity NOT NULL,
    technical_description TEXT,
    affected_file TEXT,
    affected_line INTEGER,
    responsible_ai TEXT,
    auto_suggestion TEXT,
    status shc_correction_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Certificações
CREATE TABLE shc_certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID REFERENCES shc_modules(id) ON DELETE CASCADE,
    run_id UUID REFERENCES shc_test_runs(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    quality_score NUMERIC(5,2) NOT NULL,
    total_tests INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    coordinator_ai TEXT NOT NULL,
    issued_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Auditoria (Audit Logs)
CREATE TABLE shc_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES shc_test_runs(id) ON DELETE SET NULL,
    module_id UUID REFERENCES shc_modules(id) ON DELETE SET NULL,
    executed_by TEXT NOT NULL,
    result shc_status NOT NULL,
    total_tests INTEGER,
    passed_tests INTEGER,
    failed_tests INTEGER,
    duration_ms INTEGER,
    logs TEXT,
    evidence TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE shc_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE shc_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shc_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE shc_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE shc_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE shc_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Public read access for SHC tables" ON shc_modules FOR SELECT USING (true);
CREATE POLICY "Public read access for SHC runs" ON shc_test_runs FOR SELECT USING (true);
CREATE POLICY "Public read access for SHC results" ON shc_test_results FOR SELECT USING (true);
CREATE POLICY "Public read access for SHC corrections" ON shc_corrections FOR SELECT USING (true);
CREATE POLICY "Public read access for SHC certs" ON shc_certifications FOR SELECT USING (true);
CREATE POLICY "Public read access for SHC audits" ON shc_audit_logs FOR SELECT USING (true);

-- (Policies for insert/update can be restricted to admin/service roles later)
