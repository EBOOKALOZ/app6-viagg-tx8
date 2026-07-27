-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 2.2 PRÉ-2.3 · M27: Sistema RBAC + Funções Centralizadas de Autorização
--
-- Cria a camada única de autorização da plataforma Viagg:
--   system_roles         — papéis do sistema (CEO, Admin, Supervisor, Operador, etc.)
--   system_permissions   — permissões nomeadas por módulo
--   role_permissions     — relação N:N papel ↔ permissão
--   user_role_assignments — atribuição de papéis a usuários
--
-- Funções helper SECURITY DEFINER (usadas em RLS e RPCs futuras):
--   public.is_admin()               — retorna true se JWT role='admin' OU papel=admin/ceo
--   public.is_supervisor()          — admin + supervisor
--   public.is_operator(profile)     — operadores por perfil
--   public.has_permission(perm)     — verifica permissão nomeada
--
-- Ao final: recria as 6 policies do M26 usando public.is_admin()
--   (elimina duplicação do inline JWT check)
--
-- Depende de: M26 (admin_rls_bypass)
-- Projeto: broifhfqmnzqoongtokm — via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela: system_roles
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_roles (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT    NOT NULL UNIQUE,         -- slug: 'ceo', 'admin', 'supervisor', ...
  display_name TEXT    NOT NULL,                -- exibição: 'CEO', 'Administrador', ...
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,  -- papéis built-in não podem ser deletados
  sort_order   INT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_roles IS
'Tier 2.2 PRÉ-2.3: Papéis do sistema para RBAC. is_system=true não pode ser removido.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Tabela: system_permissions
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,  -- slug: 'motor:read', 'campaign:create', etc.
  module      TEXT NOT NULL,         -- 'motor', 'campaign', 'audit', 'commission', 'admin'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_permissions IS
'Tier 2.2 PRÉ-2.3: Permissões nomeadas por módulo. Usadas em has_permission().';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tabela: role_permissions
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.system_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.system_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE public.role_permissions IS
'Tier 2.2 PRÉ-2.3: Mapeamento N:N de papéis para permissões.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Tabela: user_role_assignments
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.system_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT,
  PRIMARY KEY (user_id, role_id)
);

COMMENT ON TABLE public.user_role_assignments IS
'Tier 2.2 PRÉ-2.3: Atribuição de papéis a usuários. Um usuário pode ter vários papéis.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Índices
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ura_user_id  ON public.user_role_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_ura_role_id  ON public.user_role_assignments (role_id);
CREATE INDEX IF NOT EXISTS idx_rp_role_id   ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_rp_perm_id   ON public.role_permissions (permission_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.system_roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments  ENABLE ROW LEVEL SECURITY;

-- Leitura global (dados não sensíveis — qualquer autenticado pode ver papéis/permissões)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='system_roles' AND policyname='roles_select_authenticated') THEN
    CREATE POLICY "roles_select_authenticated" ON public.system_roles FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='system_permissions' AND policyname='perms_select_authenticated') THEN
    CREATE POLICY "perms_select_authenticated" ON public.system_permissions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='role_permissions' AND policyname='rp_select_authenticated') THEN
    CREATE POLICY "rp_select_authenticated" ON public.role_permissions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- user_role_assignments: cada usuário vê suas próprias atribuições; admin vê tudo
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_role_assignments' AND policyname='ura_select_own') THEN
    CREATE POLICY "ura_select_own" ON public.user_role_assignments FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Seed: 8 papéis do sistema
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.system_roles (name, display_name, description, is_system, sort_order) VALUES
  ('ceo',        'CEO',                  'Acesso total irrestrito à plataforma.',                          true,  1),
  ('admin',      'Administrador',        'Gerencia usuários, configurações e operações da plataforma.',    true,  2),
  ('supervisor', 'Supervisor',           'Supervisiona operações e equipes. Acesso a relatórios.',         true,  3),
  ('operator',   'Operador',             'Opera módulos específicos conforme permissões atribuídas.',      true,  4),
  ('financial',  'Financeiro',           'Acesso a módulos financeiros, comissões e relatórios fiscais.',  true,  5),
  ('auditor',    'Auditor',              'Acesso somente-leitura a logs, auditoria e histórico.',          true,  6),
  ('support',    'Suporte',              'Atendimento a usuários, visualização de tickets.',               true,  7),
  ('moderator',  'Moderador',            'Moderação de conteúdo: anúncios, imagens, mensagens.',           true,  8)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. Seed: permissões nomeadas por módulo
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.system_permissions (name, module, description) VALUES
  -- Motor Universal
  ('motor:read',          'motor',      'Visualizar dashboard e métricas do Motor Universal'),
  ('motor:manage',        'motor',      'Gerenciar workers, locks, fila e DLQ'),
  ('motor:config',        'motor',      'Alterar configurações centralizadas do Motor Universal'),
  -- Campanhas
  ('campaign:read',       'campaign',   'Visualizar campanhas de todos os usuários'),
  ('campaign:manage',     'campaign',   'Pausar, cancelar e reprocessar campanhas'),
  -- Auditoria
  ('audit:read',          'audit',      'Visualizar logs de eventos e histórico de alterações'),
  ('audit:export',        'audit',      'Exportar logs de auditoria'),
  -- Comissões
  ('commission:read',     'commission', 'Visualizar comissões pendentes e aprovadas'),
  ('commission:approve',  'commission', 'Aprovar e cancelar comissões'),
  ('commission:export',   'commission', 'Exportar relatório de comissões'),
  -- Admin
  ('admin:users',         'admin',      'Gerenciar usuários e atribuições de perfil'),
  ('admin:roles',         'admin',      'Gerenciar papéis e permissões do RBAC'),
  ('admin:config',        'admin',      'Acesso total às configurações da plataforma'),
  -- Conteúdo
  ('content:moderate',    'content',    'Moderar anúncios, imagens e mensagens'),
  -- Financeiro
  ('finance:read',        'finance',    'Visualizar dados financeiros e relatórios')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. Seed: role_permissions (atribuição de permissões por papel)
-- ─────────────────────────────────────────────────────────────────────────

-- Helper: inserir permissões de um papel pelo nome (evita IDs hardcoded)
DO $$
DECLARE
  r_ceo        UUID; r_admin     UUID; r_supervisor UUID; r_operator UUID;
  r_financial  UUID; r_auditor   UUID; r_support    UUID; r_moderator UUID;

  p_motor_r    UUID; p_motor_m    UUID; p_motor_c    UUID;
  p_camp_r     UUID; p_camp_m     UUID;
  p_audit_r    UUID; p_audit_e    UUID;
  p_comm_r     UUID; p_comm_a     UUID; p_comm_e    UUID;
  p_admin_u    UUID; p_admin_r    UUID; p_admin_c   UUID;
  p_content    UUID; p_finance    UUID;
BEGIN
  SELECT id INTO r_ceo       FROM public.system_roles WHERE name = 'ceo';
  SELECT id INTO r_admin     FROM public.system_roles WHERE name = 'admin';
  SELECT id INTO r_supervisor FROM public.system_roles WHERE name = 'supervisor';
  SELECT id INTO r_operator  FROM public.system_roles WHERE name = 'operator';
  SELECT id INTO r_financial FROM public.system_roles WHERE name = 'financial';
  SELECT id INTO r_auditor   FROM public.system_roles WHERE name = 'auditor';
  SELECT id INTO r_support   FROM public.system_roles WHERE name = 'support';
  SELECT id INTO r_moderator FROM public.system_roles WHERE name = 'moderator';

  SELECT id INTO p_motor_r  FROM public.system_permissions WHERE name = 'motor:read';
  SELECT id INTO p_motor_m  FROM public.system_permissions WHERE name = 'motor:manage';
  SELECT id INTO p_motor_c  FROM public.system_permissions WHERE name = 'motor:config';
  SELECT id INTO p_camp_r   FROM public.system_permissions WHERE name = 'campaign:read';
  SELECT id INTO p_camp_m   FROM public.system_permissions WHERE name = 'campaign:manage';
  SELECT id INTO p_audit_r  FROM public.system_permissions WHERE name = 'audit:read';
  SELECT id INTO p_audit_e  FROM public.system_permissions WHERE name = 'audit:export';
  SELECT id INTO p_comm_r   FROM public.system_permissions WHERE name = 'commission:read';
  SELECT id INTO p_comm_a   FROM public.system_permissions WHERE name = 'commission:approve';
  SELECT id INTO p_comm_e   FROM public.system_permissions WHERE name = 'commission:export';
  SELECT id INTO p_admin_u  FROM public.system_permissions WHERE name = 'admin:users';
  SELECT id INTO p_admin_r  FROM public.system_permissions WHERE name = 'admin:roles';
  SELECT id INTO p_admin_c  FROM public.system_permissions WHERE name = 'admin:config';
  SELECT id INTO p_content  FROM public.system_permissions WHERE name = 'content:moderate';
  SELECT id INTO p_finance  FROM public.system_permissions WHERE name = 'finance:read';

  -- CEO e Admin: tudo
  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (r_ceo, p_motor_r),  (r_ceo, p_motor_m),  (r_ceo, p_motor_c),
    (r_ceo, p_camp_r),   (r_ceo, p_camp_m),
    (r_ceo, p_audit_r),  (r_ceo, p_audit_e),
    (r_ceo, p_comm_r),   (r_ceo, p_comm_a),   (r_ceo, p_comm_e),
    (r_ceo, p_admin_u),  (r_ceo, p_admin_r),  (r_ceo, p_admin_c),
    (r_ceo, p_content),  (r_ceo, p_finance)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (r_admin, p_motor_r),  (r_admin, p_motor_m),  (r_admin, p_motor_c),
    (r_admin, p_camp_r),   (r_admin, p_camp_m),
    (r_admin, p_audit_r),  (r_admin, p_audit_e),
    (r_admin, p_comm_r),   (r_admin, p_comm_a),   (r_admin, p_comm_e),
    (r_admin, p_admin_u),  (r_admin, p_admin_r),  (r_admin, p_admin_c),
    (r_admin, p_content),  (r_admin, p_finance)
  ON CONFLICT DO NOTHING;

  -- Supervisor: leitura total + gerenciar campanhas + moderar
  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (r_supervisor, p_motor_r), (r_supervisor, p_camp_r), (r_supervisor, p_camp_m),
    (r_supervisor, p_audit_r), (r_supervisor, p_comm_r), (r_supervisor, p_content),
    (r_supervisor, p_finance)
  ON CONFLICT DO NOTHING;

  -- Auditor: somente leitura de logs
  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (r_auditor, p_audit_r), (r_auditor, p_audit_e), (r_auditor, p_motor_r)
  ON CONFLICT DO NOTHING;

  -- Financeiro: comissões + finanças
  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (r_financial, p_comm_r), (r_financial, p_comm_a), (r_financial, p_comm_e),
    (r_financial, p_finance)
  ON CONFLICT DO NOTHING;

  -- Moderador: moderar conteúdo
  INSERT INTO public.role_permissions (role_id, permission_id) VALUES
    (r_moderator, p_content), (r_moderator, p_camp_r)
  ON CONFLICT DO NOTHING;

END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. Funções helper SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────

-- is_admin(): definição CANÔNICA (fix P0 de 27/07, commit 4f8f18c) + branch RBAC.
-- ATENÇÃO: não reduzir esta definição para só user_role_assignments — a tabela
-- nasce vazia e isso derruba o acesso admin da plataforma inteira (regressão
-- que este bloco já causou uma vez; ver 20260727_02_shc_runs_authorized_write.sql).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','ceo'),
    false
  )
  OR (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text IN ('admin', 'ceo')
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.is_admin = true
      )
      OR EXISTS (
        SELECT 1
        FROM   public.user_role_assignments ura
        JOIN   public.system_roles sr ON sr.id = ura.role_id
        WHERE  ura.user_id = auth.uid()
          AND  sr.name IN ('ceo','admin')
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
COMMENT ON FUNCTION public.is_admin() IS
'Canônica: JWT app_metadata.role OU user_roles OU profiles.is_admin OU RBAC (user_role_assignments).';

-- is_supervisor(): admin + supervisor
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM   public.user_role_assignments ura
    JOIN   public.system_roles sr ON sr.id = ura.role_id
    WHERE  ura.user_id = auth.uid()
      AND  sr.name = 'supervisor'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_supervisor() TO authenticated;

-- is_operator(profile_type): verifica se usuário é operador de um perfil específico
-- NULL = qualquer perfil de operador
CREATE OR REPLACE FUNCTION public.is_operator(p_profile_type TEXT DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN p_profile_type IS NULL THEN
      (auth.jwt() -> 'app_metadata' ->> 'role') IN ('operator','driver','motoboy','mototaxi')
    ELSE
      (auth.jwt() -> 'app_metadata' ->> 'profile') = p_profile_type
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = p_profile_type
  END;
$$;

GRANT EXECUTE ON FUNCTION public.is_operator(TEXT) TO authenticated;

-- has_permission(permission_name): verifica permissão nomeada na matriz RBAC
-- Admin sempre retorna true (bypass implícito)
CREATE OR REPLACE FUNCTION public.has_permission(p_permission TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM   public.user_role_assignments ura
    JOIN   public.role_permissions rp ON rp.role_id = ura.role_id
    JOIN   public.system_permissions sp ON sp.id = rp.permission_id
    WHERE  ura.user_id = auth.uid()
      AND  sp.name = p_permission
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated;
COMMENT ON FUNCTION public.has_permission(TEXT) IS
'Tier 2.2 PRÉ-2.3: Verifica permissão nomeada. Admin sempre retorna true.';

-- ─────────────────────────────────────────────────────────────────────────
-- 11. Atualizar policies M26 para usar public.is_admin()
--     Remove inline JWT check e substitui pela função centralizada
-- ─────────────────────────────────────────────────────────────────────────

-- posting_campaigns
DROP POLICY IF EXISTS "campaigns_select_admin" ON public.posting_campaigns;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posting_campaigns' AND policyname='campaigns_select_admin') THEN
    CREATE POLICY "campaigns_select_admin" ON public.posting_campaigns FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- posting_event_log
DROP POLICY IF EXISTS "event_log_select_admin" ON public.posting_event_log;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posting_event_log' AND policyname='event_log_select_admin') THEN
    CREATE POLICY "event_log_select_admin" ON public.posting_event_log FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- posting_lots
DROP POLICY IF EXISTS "lots_select_admin" ON public.posting_lots;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posting_lots' AND policyname='lots_select_admin') THEN
    CREATE POLICY "lots_select_admin" ON public.posting_lots FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- posting_dead_letter_queue
DROP POLICY IF EXISTS "dlq_select_admin" ON public.posting_dead_letter_queue;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='posting_dead_letter_queue' AND policyname='dlq_select_admin') THEN
    CREATE POLICY "dlq_select_admin" ON public.posting_dead_letter_queue FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- operator_promotional_slots (admin)
DROP POLICY IF EXISTS "ops_select_admin" ON public.operator_promotional_slots;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operator_promotional_slots' AND policyname='ops_select_admin') THEN
    CREATE POLICY "ops_select_admin" ON public.operator_promotional_slots FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- alerts_history
DROP POLICY IF EXISTS "alerts_history_select_admin" ON public.alerts_history;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='alerts_history' AND policyname='alerts_history_select_admin') THEN
    CREATE POLICY "alerts_history_select_admin" ON public.alerts_history FOR SELECT TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ M27 — RBAC criado: system_roles (8), system_permissions (15), role_permissions seed, user_role_assignments. Funções: is_admin(), is_supervisor(), is_operator(), has_permission(). Policies M26 atualizadas para usar is_admin().';
END $$;
