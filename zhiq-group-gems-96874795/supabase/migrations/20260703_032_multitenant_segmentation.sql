-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 PRÉ-2.3 · M32: Segmentação Multi-Empresa (Multitenancy Leve)
--
-- Adiciona suporte a segmentação por empresa/franquia/região de forma
-- TOTALMENTE INCREMENTAL — zero impacto no Motor Universal, nas RPCs
-- existentes ou na lógica de postagem.
--
-- Campos adicionados (todos opcionais — NULL = comportamento atual):
--   tenant_id     TEXT — slug da empresa/franquia (ex: 'viagg_sp', 'franquia_a')
--   region_code   TEXT — código de região (ex: 'BR-SP', 'BR-RJ', 'BR-MG')
--
-- Tabelas alteradas:
--   posting_campaigns          — para rastrear campanha por tenant/região
--   operator_promotional_slots — para rastrear slot por tenant/região
--   posting_lots               — para rastrear lote por tenant/região
--
-- Tabela nova:
--   tenant_registry — cadastro de tenants/franquias (opcional, admin)
--
-- Índices: hot paths de filtro por tenant e por região no Admin Dashboard.
--
-- NÃO altera nenhuma RPC existente. NÃO quebra nenhum contrato do T1/T2.
-- Para filtrar por tenant no futuro: basta adicionar WHERE tenant_id = $1.
--
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: tenant_registry
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_registry (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT        NOT NULL UNIQUE,       -- 'viagg_sp', 'franquia_abc'
  name         TEXT        NOT NULL,              -- 'Viagg São Paulo', 'Franquia ABC'
  type         TEXT        NOT NULL DEFAULT 'unit', -- 'headquarters'|'unit'|'franchise'|'partner'
  city         TEXT,
  state_code   TEXT,                              -- 'SP', 'RJ', 'MG', etc.
  region_code  TEXT,                              -- 'BR-SP', 'BR-RJ', etc.
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_registry IS
'Tier 2.2 PRÉ-2.3: Cadastro de empresas/unidades/franquias. Suporte multitenancy leve.';

-- Seed: tenant padrão (Viagg principal)
INSERT INTO public.tenant_registry (slug, name, type, region_code, metadata) VALUES
  ('viagg_default', 'Viagg — Plataforma Principal', 'headquarters', 'BR', '{"is_default": true}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.tenant_registry ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenant_registry' AND policyname='tenant_select_authenticated') THEN
    CREATE POLICY "tenant_select_authenticated"
      ON public.tenant_registry FOR SELECT TO authenticated USING (is_active = true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. ALTER: adicionar tenant_id + region_code nas tabelas principais
-- ─────────────────────────────────────────────────────────────────────────

-- posting_campaigns
ALTER TABLE public.posting_campaigns
  ADD COLUMN IF NOT EXISTS tenant_id   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS region_code TEXT DEFAULT NULL;

COMMENT ON COLUMN public.posting_campaigns.tenant_id IS
'Tier 2.2 PRÉ-2.3: Segmentação por empresa/franquia. NULL = tenant padrão (Viagg).';
COMMENT ON COLUMN public.posting_campaigns.region_code IS
'Tier 2.2 PRÉ-2.3: Segmentação por região (BR-SP, BR-RJ, etc.). NULL = sem filtro regional.';

-- operator_promotional_slots
ALTER TABLE public.operator_promotional_slots
  ADD COLUMN IF NOT EXISTS tenant_id   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS region_code TEXT DEFAULT NULL;

-- posting_lots
ALTER TABLE public.posting_lots
  ADD COLUMN IF NOT EXISTS tenant_id   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS region_code TEXT DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Índices para hot paths de filtro multi-tenant
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant
  ON public.posting_campaigns (tenant_id, status, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_region
  ON public.posting_campaigns (region_code, status)
  WHERE region_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_tenant
  ON public.operator_promotional_slots (tenant_id, profile_type, status)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lots_tenant
  ON public.posting_lots (tenant_id, status)
  WHERE tenant_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. View: tenant_campaign_summary (admin, por tenant e perfil)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.tenant_campaign_summary AS
SELECT
  COALESCE(pc.tenant_id, 'viagg_default')          AS tenant_id,
  COALESCE(tr.name, 'Viagg — Plataforma Principal') AS tenant_name,
  pc.origin_profile_type                             AS profile_type,
  pc.region_code,
  COUNT(*)                                          AS total_campaigns,
  COUNT(*) FILTER (WHERE pc.status IN ('queued','generating','posting','waiting'))
                                                    AS active_campaigns,
  COUNT(*) FILTER (WHERE pc.status = 'completed')  AS completed_campaigns,
  COUNT(*) FILTER (WHERE pc.status = 'error')      AS error_campaigns,
  COUNT(*) FILTER (WHERE pc.created_at::date = CURRENT_DATE)
                                                    AS campaigns_today,
  MAX(pc.created_at)                                AS last_campaign_at
FROM public.posting_campaigns pc
LEFT JOIN public.tenant_registry tr ON tr.slug = pc.tenant_id
GROUP BY COALESCE(pc.tenant_id,'viagg_default'), tr.name,
         pc.origin_profile_type, pc.region_code;

COMMENT ON VIEW public.tenant_campaign_summary IS
'Tier 2.2 PRÉ-2.3: Campanhas por tenant, perfil e região. Admin dashboard multi-empresa.';

GRANT SELECT ON public.tenant_campaign_summary TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M32 — Multitenancy leve: tenant_registry criada (seed: viagg_default). Colunas tenant_id+region_code adicionadas em posting_campaigns, operator_promotional_slots, posting_lots. 4 índices. View tenant_campaign_summary disponível.';
END $$;
