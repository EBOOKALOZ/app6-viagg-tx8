-- ═══════════════════════════════════════════════════════════════════════════
-- Comando Convênio · FASE 1 — Estrutura do módulo Doações & Convênios
--
-- Cria o schema completo (somente estrutura + placeholders, sem operação
-- financeira real) para:
--   convenio_entities        — credenciamento (clínicas, labs, farmácias,
--                               hospitais, instituições, parceiros, prestadores)
--   convenio_agreements       — convênios (criar/editar/aprovar/suspender/encerrar)
--   convenio_agreement_history — histórico de mudança de status dos convênios
--   convenio_campaigns        — campanhas de doação
--   convenio_donations        — histórico de doações (estrutura; sem gateway ativo)
--   convenio_accountability   — prestação de contas
--   convenio_financial_records — estrutura financeira (repasses desativados)
--   convenio_audit_log        — auditoria/rastreabilidade do módulo
--   convenio_messages         — mensagens internas do painel do Gestor
--   convenio_settings         — configurações do módulo (inclui desconto social)
--
-- RBAC: novo papel 'gestor_convenio' + permissões 'convenio:*' na matriz
-- existente (system_roles/system_permissions/role_permissions/user_role_assignments
-- criada em 20260703_027_rbac_authorization.sql) — NÃO cria autenticação paralela.
--
-- Regras da Fase 1 (obrigatórias):
--   - Nenhuma operação financeira real. `convenio_financial_records` e o
--     desconto social (0,5%) existem apenas como estrutura — repasses e
--     cobrança permanecem DESATIVADOS (feature flags em convenio_settings).
--   - IA somente para uso administrativo interno (convenio_ai_notes) —
--     nunca exposta ao usuário final.
--
-- Projeto: broifhfqmnzqoongtokm — aplicar via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RBAC — papel gestor_convenio + permissões convenio:*
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.system_roles (name, display_name, description, is_system, sort_order) VALUES
  ('gestor_convenio', 'Gestor de Convênios', 'Administra o módulo de Doações & Convênios (Super Painel exclusivo).', true, 9)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.system_permissions (name, module, description) VALUES
  ('convenio:read',        'convenio', 'Visualizar dashboard, convênios, credenciamento e doações'),
  ('convenio:manage',      'convenio', 'Criar, editar, aprovar, suspender e encerrar convênios e credenciamentos'),
  ('convenio:finance',     'convenio', 'Visualizar estrutura financeira e prestação de contas do módulo'),
  ('convenio:audit',       'convenio', 'Visualizar logs de auditoria do módulo de convênios'),
  ('convenio:config',      'convenio', 'Alterar configurações do módulo (inclui parâmetros de desconto social)')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
  r_gestor UUID;
  p_read UUID; p_manage UUID; p_finance UUID; p_audit UUID; p_config UUID;
BEGIN
  SELECT id INTO r_gestor FROM public.system_roles WHERE name = 'gestor_convenio';

  SELECT id INTO p_read    FROM public.system_permissions WHERE name = 'convenio:read';
  SELECT id INTO p_manage  FROM public.system_permissions WHERE name = 'convenio:manage';
  SELECT id INTO p_finance FROM public.system_permissions WHERE name = 'convenio:finance';
  SELECT id INTO p_audit   FROM public.system_permissions WHERE name = 'convenio:audit';
  SELECT id INTO p_config  FROM public.system_permissions WHERE name = 'convenio:config';

  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (r_gestor, p_read), (r_gestor, p_manage), (r_gestor, p_finance),
    (r_gestor, p_audit), (r_gestor, p_config)
  ON CONFLICT DO NOTHING;
END $$;

-- is_gestor_convenio(): true para admin/ceo OU papel gestor_convenio na matriz RBAC.
-- Segue o mesmo padrão de is_supervisor() (M27) — NÃO duplica lógica de is_admin().
CREATE OR REPLACE FUNCTION public.is_gestor_convenio()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM   public.user_role_assignments ura
    JOIN   public.system_roles sr ON sr.id = ura.role_id
    WHERE  ura.user_id = auth.uid()
      AND  sr.name = 'gestor_convenio'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_gestor_convenio() TO authenticated;
COMMENT ON FUNCTION public.is_gestor_convenio() IS
'Comando Convênio Fase 1: true para admin/ceo OU papel gestor_convenio (RBAC user_role_assignments).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. convenio_entities — credenciamento (clínicas, labs, farmácias,
--    hospitais, instituições, parceiros, prestadores)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_entities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         TEXT NOT NULL CHECK (category IN (
                     'clinica', 'laboratorio', 'farmacia', 'hospital',
                     'instituicao', 'parceiro', 'prestador'
                   )),
  name             TEXT NOT NULL,
  document_number  TEXT,                     -- CNPJ/CPF
  responsible_name TEXT,                      -- responsável
  responsible_role TEXT,
  email            TEXT,
  phone            TEXT,
  address_line     TEXT,
  address_city     TEXT,
  address_state    TEXT,
  address_zip      TEXT,
  status           TEXT NOT NULL DEFAULT 'em_analise' CHECK (status IN (
                     'em_analise', 'ativo', 'suspenso', 'encerrado', 'reprovado'
                   )),
  documentation_status TEXT NOT NULL DEFAULT 'pendente' CHECK (documentation_status IN (
                     'pendente', 'em_analise', 'aprovada', 'reprovada'
                   )),
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_entities IS
'Comando Convênio Fase 1: cadastro de credenciamento (clínicas, labs, farmácias, hospitais, instituições, parceiros, prestadores).';

CREATE INDEX IF NOT EXISTS idx_convenio_entities_category ON public.convenio_entities (category);
CREATE INDEX IF NOT EXISTS idx_convenio_entities_status   ON public.convenio_entities (status);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. convenio_agreements — convênios
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_agreements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID REFERENCES public.convenio_entities(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN (
                  'rascunho', 'em_aprovacao', 'ativo', 'suspenso', 'encerrado'
                )),
  starts_at     DATE,
  ends_at       DATE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_agreements IS
'Comando Convênio Fase 1: convênios — criar/editar/aprovar/suspender/encerrar.';

CREATE INDEX IF NOT EXISTS idx_convenio_agreements_status ON public.convenio_agreements (status);
CREATE INDEX IF NOT EXISTS idx_convenio_agreements_entity ON public.convenio_agreements (entity_id);

-- 3.1 Histórico de status dos convênios (auditoria de transição)
CREATE TABLE IF NOT EXISTS public.convenio_agreement_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id  UUID NOT NULL REFERENCES public.convenio_agreements(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  changed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT
);

COMMENT ON TABLE public.convenio_agreement_history IS
'Comando Convênio Fase 1: histórico de transição de status de cada convênio.';

CREATE INDEX IF NOT EXISTS idx_convenio_agreement_history_agreement ON public.convenio_agreement_history (agreement_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. convenio_campaigns — campanhas de doação
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  description    TEXT,
  goal_amount    NUMERIC(14,2) DEFAULT 0,      -- meta (estrutura; sem cobrança real)
  raised_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN (
                   'planejada', 'ativa', 'pausada', 'encerrada'
                 )),
  starts_at      DATE,
  ends_at        DATE,
  cover_url      TEXT,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_campaigns IS
'Comando Convênio Fase 1: campanhas de doação (metas, status). Sem processamento financeiro nesta fase.';

CREATE INDEX IF NOT EXISTS idx_convenio_campaigns_status ON public.convenio_campaigns (status);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. convenio_donations — histórico de doações (estrutura, sem gateway ativo)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_donations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES public.convenio_campaigns(id) ON DELETE SET NULL,
  donor_name    TEXT,                          -- pode ser anônimo
  donor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_anonymous  BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'registrada' CHECK (status IN (
                  'registrada', 'confirmada', 'estornada'
                )),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'plataforma', 'externa')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_donations IS
'Comando Convênio Fase 1: estrutura de histórico de doações. Sem gateway de pagamento ativo nesta fase.';

CREATE INDEX IF NOT EXISTS idx_convenio_donations_campaign ON public.convenio_donations (campaign_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. convenio_accountability — prestação de contas
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_accountability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES public.convenio_campaigns(id) ON DELETE SET NULL,
  reference_month DATE,                        -- competência (1º dia do mês)
  title         TEXT NOT NULL,
  summary       TEXT,
  document_url  TEXT,                          -- PDF/planilha anexada
  status        TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN (
                  'rascunho', 'publicada', 'arquivada'
                )),
  published_at  TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_accountability IS
'Comando Convênio Fase 1: prestação de contas (estrutura de publicação; conteúdo/documentos).';

-- ─────────────────────────────────────────────────────────────────────────
-- 7. convenio_financial_records — estrutura financeira (repasses desativados)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_financial_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type   TEXT NOT NULL CHECK (record_type IN (
                  'entrada', 'repasse', 'desconto_social', 'ajuste'
                )),
  reference_id  UUID,                          -- aponta para campaign/agreement/donation conforme o tipo
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  description   TEXT,
  is_simulated  BOOLEAN NOT NULL DEFAULT true, -- Fase 1: todo registro é estrutural/simulado
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_financial_records IS
'Comando Convênio Fase 1: estrutura visual de registros financeiros. is_simulated=true enquanto repasses estiverem desativados (ver convenio_settings.repasses_ativos).';

-- ─────────────────────────────────────────────────────────────────────────
-- 8. convenio_audit_log — auditoria/rastreabilidade
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,                  -- ex: 'agreement:approve', 'entity:suspend'
  entity_table TEXT,
  entity_id    UUID,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_audit_log IS
'Comando Convênio Fase 1: log de auditoria/rastreabilidade de ações do Gestor no módulo.';

CREATE INDEX IF NOT EXISTS idx_convenio_audit_log_actor   ON public.convenio_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_convenio_audit_log_created ON public.convenio_audit_log (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. convenio_messages — mensagens internas do painel do Gestor
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID REFERENCES public.convenio_entities(id) ON DELETE SET NULL,
  sender_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject       TEXT,
  body          TEXT NOT NULL,
  is_read       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_messages IS
'Comando Convênio Fase 1: mensagens internas do módulo (Gestor ↔ entidades credenciadas).';

-- ─────────────────────────────────────────────────────────────────────────
-- 10. convenio_ai_notes — notas geradas por IA (uso administrativo interno)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_ai_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_table TEXT NOT NULL,                  -- ex: 'convenio_entities', 'convenio_agreements'
  context_id    UUID,
  note_type     TEXT NOT NULL CHECK (note_type IN (
                  'analise_documental', 'apoio_auditoria', 'organizacao_cadastro', 'relatorio'
                )),
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_ai_notes IS
'Comando Convênio Fase 1: notas de IA para uso ADMINISTRATIVO INTERNO apenas (nunca exposta ao usuário final). Suporta análise documental, apoio a auditorias, organização de cadastros e geração de relatórios.';

-- ─────────────────────────────────────────────────────────────────────────
-- 11. convenio_settings — configurações do módulo (feature flags)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_settings (
  id                    BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),  -- linha única (singleton)
  repasses_ativos       BOOLEAN NOT NULL DEFAULT false,   -- Fase 1: financeiro real DESATIVADO
  desconto_social_ativo BOOLEAN NOT NULL DEFAULT false,   -- Fase 1: cobrança DESATIVADA
  desconto_social_pct   NUMERIC(5,4) NOT NULL DEFAULT 0.005, -- 0,5% conforme especificado; não aplicado enquanto ativo=false
  updated_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_settings IS
'Comando Convênio Fase 1: configuração singleton do módulo. repasses_ativos e desconto_social_ativo permanecem false nesta fase (somente estrutura).';

INSERT INTO public.convenio_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 12. RLS — leitura pública apenas do que é institucional/transparência;
--     escrita e leitura administrativa restritas a is_gestor_convenio()
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.convenio_entities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_agreements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_agreement_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_donations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_accountability      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_financial_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_ai_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenio_settings            ENABLE ROW LEVEL SECURITY;

-- Público: SOMENTE leitura de campanhas ativas/encerradas (status não-planejada)
-- e prestação de contas publicada — para a página pública de transparência.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='convenio_campaigns' AND policyname='convenio_campaigns_select_public') THEN
    CREATE POLICY "convenio_campaigns_select_public" ON public.convenio_campaigns FOR SELECT
      USING (status IN ('ativa', 'encerrada'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='convenio_donations' AND policyname='convenio_donations_select_public') THEN
    CREATE POLICY "convenio_donations_select_public" ON public.convenio_donations FOR SELECT
      USING (status = 'confirmada');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='convenio_accountability' AND policyname='convenio_accountability_select_public') THEN
    CREATE POLICY "convenio_accountability_select_public" ON public.convenio_accountability FOR SELECT
      USING (status = 'publicada');
  END IF;
END $$;

-- Gestor: acesso administrativo completo (SELECT/INSERT/UPDATE/DELETE) via
-- is_gestor_convenio() em todas as tabelas do módulo.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'convenio_entities', 'convenio_agreements', 'convenio_agreement_history',
    'convenio_campaigns', 'convenio_donations', 'convenio_accountability',
    'convenio_financial_records', 'convenio_audit_log', 'convenio_messages',
    'convenio_ai_notes', 'convenio_settings'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I;',
      t || '_gestor_all', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_gestor_convenio()) WITH CHECK (public.is_gestor_convenio());',
      t || '_gestor_all', t
    );
  END LOOP;
END $$;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ Comando Convênio Fase 1 — schema criado: 11 tabelas convenio_*, papel gestor_convenio, 5 permissões convenio:*, função is_gestor_convenio(). Repasses e desconto social permanecem DESATIVADOS (convenio_settings).';
END $$;
