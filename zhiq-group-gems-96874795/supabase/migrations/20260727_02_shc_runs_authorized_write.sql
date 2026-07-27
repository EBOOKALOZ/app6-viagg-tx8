-- ============================================================================
-- SHC v2.0 — FIX RLS shc_runs + FUNDAÇÃO RBAC (BUG-02 · causa raiz)
--
-- Erro em produção: new row violates row-level security policy for table "shc_runs"
-- Reproduzido em 2026-07-27 (impersonação no banco real): qualquer usuário
-- AUTENTICADO sem is_admin() é bloqueado no INSERT de shc_runs, pois a única
-- policy de escrita viva é shc_runs_admin_write (WITH CHECK is_admin()).
--
-- A versão anterior deste arquivo dependia de system_permissions/system_roles/
-- role_permissions e de has_permission() — objetos da M27
-- (20260703_027_rbac_authorization.sql) que NUNCA foram aplicados no banco.
-- Resultado: a migration era inaplicável (relation does not exist) e o caminho
-- de autorização 'shc:run' nunca existiu de fato.
--
-- IMPORTANTE: a M27 completa NÃO pode ser aplicada como está, pois redefiniria
-- is_admin() com a versão antiga (só user_role_assignments — tabela vazia),
-- derrubando o acesso admin corrigido no P0 de 27/07 (commit 4f8f18c).
--
-- Este arquivo é AUTOSSUFICIENTE e IDEMPOTENTE:
--   1) Cria o núcleo RBAC da M27 (4 tabelas + papéis), SEM redefinir is_admin().
--   2) Cria public.has_permission(TEXT) — SECURITY DEFINER, search_path fixo.
--   3) Semeia a permissão 'shc:run' e concede a admin/supervisor/operator.
--   4) Recria as policies de escrita shc_* com privilégio mínimo:
--        INSERT/UPDATE: is_admin() OU has_permission('shc:run')
--        DELETE:        somente is_admin() (evidência de homologação não pode
--                       ser apagada por operador)
--        INSERT de shc_runs exige executed_by = auth.uid() p/ não-admin
--        (anti-forja de autoria), com trigger preenchendo quando NULL.
--   5) shc_modules: portador de shc:run pode UPDATE (transições de status do
--      fluxo de execução); INSERT/DELETE de módulos continuam admin-only.
--
-- Aplicar via SQL Editor ou: supabase db query --file <este arquivo> --linked
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Núcleo RBAC (M27) — tabelas, RLS e papéis. is_admin() NÃO é tocada.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_roles (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL UNIQUE,
  display_name TEXT    NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  module      TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.system_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.system_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.system_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_ura_user_id ON public.user_role_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_ura_role_id ON public.user_role_assignments (role_id);
CREATE INDEX IF NOT EXISTS idx_rp_role_id  ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_rp_perm_id  ON public.role_permissions (permission_id);

ALTER TABLE public.system_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.system_roles, public.system_permissions,
              public.role_permissions, public.user_role_assignments FROM anon;

-- Leitura: autenticados enxergam o catálogo de papéis/permissões;
-- atribuições só as próprias (ou admin, via policy de gestão abaixo).
DROP POLICY IF EXISTS roles_select_authenticated ON public.system_roles;
CREATE POLICY roles_select_authenticated ON public.system_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS perms_select_authenticated ON public.system_permissions;
CREATE POLICY perms_select_authenticated ON public.system_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rp_select_authenticated ON public.role_permissions;
CREATE POLICY rp_select_authenticated ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ura_select_own ON public.user_role_assignments;
CREATE POLICY ura_select_own ON public.user_role_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Gestão do RBAC: somente admin (escrita nas 4 tabelas)
DROP POLICY IF EXISTS roles_admin_write ON public.system_roles;
CREATE POLICY roles_admin_write ON public.system_roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS perms_admin_write ON public.system_permissions;
CREATE POLICY perms_admin_write ON public.system_permissions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS rp_admin_write ON public.role_permissions;
CREATE POLICY rp_admin_write ON public.role_permissions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ura_admin_write ON public.user_role_assignments;
CREATE POLICY ura_admin_write ON public.user_role_assignments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Papéis canônicos da M27 (os demais seeds — 15 permissões e matriz completa —
-- permanecem na M27, a ser aplicada após correção da seção is_admin daquela migration)
INSERT INTO public.system_roles (name, display_name, description, is_system, sort_order) VALUES
  ('ceo',        'CEO',           'Acesso total irrestrito à plataforma.',                         true, 1),
  ('admin',      'Administrador', 'Gerencia usuários, configurações e operações da plataforma.',   true, 2),
  ('supervisor', 'Supervisor',    'Supervisiona operações e equipes. Acesso a relatórios.',        true, 3),
  ('operator',   'Operador',      'Opera módulos específicos conforme permissões atribuídas.',     true, 4),
  ('financial',  'Financeiro',    'Acesso a módulos financeiros, comissões e relatórios fiscais.', true, 5),
  ('auditor',    'Auditor',       'Acesso somente-leitura a logs, auditoria e histórico.',         true, 6),
  ('support',    'Suporte',       'Atendimento a usuários, visualização de tickets.',              true, 7),
  ('moderator',  'Moderador',     'Moderação de conteúdo: anúncios, imagens, mensagens.',          true, 8)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. public.has_permission(TEXT) — verificação de permissão nomeada
--    Admin sempre passa (bypass implícito via is_admin() canônica).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_permission(p_permission TEXT)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_admin()
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   public.user_role_assignments ura
      JOIN   public.role_permissions rp ON rp.role_id = ura.role_id
      JOIN   public.system_permissions sp ON sp.id = rp.permission_id
      WHERE  ura.user_id = auth.uid()
        AND  sp.name = p_permission
    )
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_permission(TEXT) IS
'RBAC M27: verifica permissão nomeada via user_role_assignments. Admin sempre true.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Permissão 'shc:run' + concessão aos papéis operacionais
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.system_permissions (name, module, description)
VALUES ('shc:run', 'shc', 'Permite iniciar e conduzir execuções no Sistema de Homologação Contínua')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT sr.id, sp.id
FROM public.system_roles sr
CROSS JOIN public.system_permissions sp
WHERE sr.name IN ('admin', 'supervisor', 'operator')
  AND sp.name = 'shc:run'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Autoria de execução: executed_by preenchido com auth.uid() quando NULL
--    (vários chamadores do frontend passam userId=null)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.shc_runs_fill_executed_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.executed_by IS NULL THEN
    NEW.executed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shc_runs_fill_executed_by ON public.shc_runs;
CREATE TRIGGER trg_shc_runs_fill_executed_by
  BEFORE INSERT ON public.shc_runs
  FOR EACH ROW EXECUTE FUNCTION public.shc_runs_fill_executed_by();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Policies de escrita shc_* — privilégio mínimo por operação
-- ─────────────────────────────────────────────────────────────────────────

-- shc_runs -----------------------------------------------------------------
DROP POLICY IF EXISTS shc_runs_admin_write        ON public.shc_runs;
DROP POLICY IF EXISTS shc_runs_authorized_write   ON public.shc_runs;
DROP POLICY IF EXISTS "Public read access for SHC runs" ON public.shc_runs; -- duplicata legada de shc_runs_read

DROP POLICY IF EXISTS shc_runs_authorized_insert ON public.shc_runs;
CREATE POLICY shc_runs_authorized_insert ON public.shc_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_admin() OR public.has_permission('shc:run'))
    AND (public.is_admin() OR executed_by = auth.uid())
  );

DROP POLICY IF EXISTS shc_runs_authorized_update ON public.shc_runs;
CREATE POLICY shc_runs_authorized_update ON public.shc_runs
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_permission('shc:run'))
  WITH CHECK (public.is_admin() OR public.has_permission('shc:run'));

DROP POLICY IF EXISTS shc_runs_admin_delete ON public.shc_runs;
CREATE POLICY shc_runs_admin_delete ON public.shc_runs
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- shc_tests ----------------------------------------------------------------
DROP POLICY IF EXISTS shc_tests_admin_write      ON public.shc_tests;
DROP POLICY IF EXISTS shc_tests_authorized_write ON public.shc_tests;

DROP POLICY IF EXISTS shc_tests_authorized_insert ON public.shc_tests;
CREATE POLICY shc_tests_authorized_insert ON public.shc_tests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.has_permission('shc:run'));

DROP POLICY IF EXISTS shc_tests_admin_update ON public.shc_tests;
CREATE POLICY shc_tests_admin_update ON public.shc_tests
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_tests_admin_delete ON public.shc_tests;
CREATE POLICY shc_tests_admin_delete ON public.shc_tests
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- shc_logs -----------------------------------------------------------------
DROP POLICY IF EXISTS shc_logs_admin_write      ON public.shc_logs;
DROP POLICY IF EXISTS shc_logs_authorized_write ON public.shc_logs;

DROP POLICY IF EXISTS shc_logs_authorized_insert ON public.shc_logs;
CREATE POLICY shc_logs_authorized_insert ON public.shc_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.has_permission('shc:run'));

DROP POLICY IF EXISTS shc_logs_admin_update ON public.shc_logs;
CREATE POLICY shc_logs_admin_update ON public.shc_logs
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_logs_admin_delete ON public.shc_logs;
CREATE POLICY shc_logs_admin_delete ON public.shc_logs
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- shc_certificates ---------------------------------------------------------
DROP POLICY IF EXISTS shc_certificates_admin_write      ON public.shc_certificates;
DROP POLICY IF EXISTS shc_certificates_authorized_write ON public.shc_certificates;

DROP POLICY IF EXISTS shc_certificates_authorized_insert ON public.shc_certificates;
CREATE POLICY shc_certificates_authorized_insert ON public.shc_certificates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.has_permission('shc:run'));

DROP POLICY IF EXISTS shc_certificates_admin_update ON public.shc_certificates;
CREATE POLICY shc_certificates_admin_update ON public.shc_certificates
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS shc_certificates_admin_delete ON public.shc_certificates;
CREATE POLICY shc_certificates_admin_delete ON public.shc_certificates
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- shc_modules --------------------------------------------------------------
-- O fluxo de execução atualiza status do módulo (in_test → certified/failed).
-- Portador de shc:run pode UPDATE; criar/apagar módulos continua admin-only
-- (shc_modules_admin_write FOR ALL permanece intacta — policies permissivas somam).
DROP POLICY IF EXISTS shc_modules_authorized_status_update ON public.shc_modules;
CREATE POLICY shc_modules_authorized_status_update ON public.shc_modules
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_permission('shc:run'))
  WITH CHECK (public.is_admin() OR public.has_permission('shc:run'));

COMMIT;
