-- ═══════════════════════════════════════════════════════════════════════════
-- Comando Convênio · FASE 1 — Hardening (auditoria automática, histórico de
-- status, view de dashboard, gestão de acesso ao papel gestor_convenio)
--
-- Pré-requisito: 20260801_convenio_fase1_schema.sql já aplicada (cria as 11
-- tabelas convenio_*, o papel gestor_convenio, as permissões convenio:* e a
-- função is_gestor_convenio()).
--
-- Cria:
--   convenio_audit_trigger()       — trigger AFTER INSERT/UPDATE/DELETE que
--                                     grava automaticamente em convenio_audit_log
--                                     (não depende do frontend lembrar de logar)
--   convenio_agreement_status_trigger() — ao mudar status de um convênio,
--                                     grava em convenio_agreement_history
--   convenio_dashboard_stats        — view agregada (SECURITY INVOKER, respeita
--                                     RLS) para o dashboard do Gestor
--   convenio_grant_role(p_email)    — concede o papel gestor_convenio a um
--                                     usuário existente, por e-mail
--   convenio_revoke_role(p_email)   — revoga o papel gestor_convenio
--   convenio_list_gestores()        — lista quem tem o papel gestor_convenio hoje
--
-- Projeto: broifhfqmnzqoongtokm — aplicar via SQL Editor — NUNCA supabase db push
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Auditoria automática — trigger genérico em 5 tabelas de negócio
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.convenio_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entity_id UUID;
BEGIN
  v_entity_id := COALESCE(NEW.id, OLD.id);

  INSERT INTO public.convenio_audit_log (actor_id, action, entity_table, entity_id, details)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || ':' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    CASE TG_OP
      WHEN 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION public.convenio_audit_trigger() IS
'Comando Convênio Fase 1: grava automaticamente em convenio_audit_log a cada INSERT/UPDATE/DELETE das tabelas de negócio do módulo.';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'convenio_entities', 'convenio_agreements', 'convenio_campaigns',
    'convenio_donations', 'convenio_accountability'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_convenio_audit ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_convenio_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.convenio_audit_trigger();',
      t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Histórico de status de convênios (convenio_agreement_history)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.convenio_agreement_status_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.convenio_agreement_history (agreement_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.convenio_agreement_history (agreement_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.convenio_agreement_status_trigger() IS
'Comando Convênio Fase 1: grava em convenio_agreement_history sempre que um convênio é criado ou muda de status.';

DROP TRIGGER IF EXISTS trg_convenio_agreement_status ON public.convenio_agreements;
CREATE TRIGGER trg_convenio_agreement_status
  AFTER INSERT OR UPDATE ON public.convenio_agreements
  FOR EACH ROW EXECUTE FUNCTION public.convenio_agreement_status_trigger();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. View de dashboard — convenio_dashboard_stats (SECURITY INVOKER: cada
--    consulta respeita a RLS do usuário que a executa, ou seja, só o gestor
--    consegue ler)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.convenio_dashboard_stats
WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM public.convenio_agreements WHERE status = 'ativo')      AS convenios_ativos,
  (SELECT count(*) FROM public.convenio_agreements WHERE status = 'encerrado')  AS convenios_encerrados,
  (SELECT count(*) FROM public.convenio_agreements WHERE status = 'suspenso')   AS convenios_suspensos,
  (SELECT count(*) FROM public.convenio_agreements)                            AS convenios_total,
  (SELECT count(*) FROM public.convenio_entities WHERE category = 'instituicao') AS instituicoes_total,
  (SELECT count(*) FROM public.convenio_entities)                              AS entidades_total,
  (SELECT count(*) FROM public.convenio_campaigns WHERE status = 'ativa')       AS campanhas_ativas,
  (SELECT COALESCE(sum(amount), 0) FROM public.convenio_donations WHERE status = 'confirmada') AS total_arrecadado,
  (SELECT COALESCE(sum(goal_amount), 0) FROM public.convenio_campaigns WHERE status = 'ativa')  AS total_meta_ativas,
  (SELECT COALESCE(sum(raised_amount), 0) FROM public.convenio_campaigns)       AS total_destinado,
  (SELECT count(*) FROM public.convenio_accountability WHERE status = 'rascunho')  AS prestacoes_pendentes,
  (SELECT count(*) FROM public.convenio_accountability WHERE status = 'publicada') AS prestacoes_concluidas;

COMMENT ON VIEW public.convenio_dashboard_stats IS
'Comando Convênio Fase 1: agregados para o dashboard executivo do Gestor. security_invoker=true — só retorna dados para quem passar em is_gestor_convenio() via RLS das tabelas de origem.';

GRANT SELECT ON public.convenio_dashboard_stats TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Gestão de acesso — conceder/revogar/listar o papel gestor_convenio
--    Evita expor user_role_assignments a INSERT/DELETE direto do client:
--    a regra "quem pode conceder este papel" fica centralizada aqui.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.convenio_grant_role(p_email TEXT)
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  IF NOT public.is_gestor_convenio() THEN
    RAISE EXCEPTION 'Apenas o Gestor de Convênios pode conceder este papel.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM public.profiles WHERE lower(profiles.email) = lower(p_email);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado com o e-mail informado.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_role_id FROM public.system_roles WHERE name = 'gestor_convenio';

  INSERT INTO public.user_role_assignments (user_id, role_id, assigned_by)
  VALUES (v_user_id, v_role_id, auth.uid())
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.convenio_audit_log (actor_id, action, entity_table, entity_id, details)
  VALUES (auth.uid(), 'access:grant', 'user_role_assignments', v_user_id, jsonb_build_object('email', p_email));

  RETURN QUERY SELECT v_user_id, p_email;
END;
$function$;

COMMENT ON FUNCTION public.convenio_grant_role(TEXT) IS
'Comando Convênio Fase 1: concede o papel gestor_convenio a um usuário existente por e-mail. Só o próprio Gestor (ou admin) pode chamar.';

REVOKE ALL ON FUNCTION public.convenio_grant_role(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.convenio_grant_role(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.convenio_revoke_role(p_email TEXT)
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_role_id UUID;
BEGIN
  IF NOT public.is_gestor_convenio() THEN
    RAISE EXCEPTION 'Apenas o Gestor de Convênios pode revogar este papel.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM public.profiles WHERE lower(profiles.email) = lower(p_email);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário encontrado com o e-mail informado.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_role_id FROM public.system_roles WHERE name = 'gestor_convenio';

  DELETE FROM public.user_role_assignments WHERE user_id = v_user_id AND role_id = v_role_id;

  INSERT INTO public.convenio_audit_log (actor_id, action, entity_table, entity_id, details)
  VALUES (auth.uid(), 'access:revoke', 'user_role_assignments', v_user_id, jsonb_build_object('email', p_email));

  RETURN QUERY SELECT v_user_id, p_email;
END;
$function$;

COMMENT ON FUNCTION public.convenio_revoke_role(TEXT) IS
'Comando Convênio Fase 1: revoga o papel gestor_convenio de um usuário por e-mail. Só o próprio Gestor (ou admin) pode chamar.';

REVOKE ALL ON FUNCTION public.convenio_revoke_role(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.convenio_revoke_role(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.convenio_list_gestores()
RETURNS TABLE(user_id UUID, email TEXT, assigned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_gestor_convenio() THEN
    RAISE EXCEPTION 'Apenas o Gestor de Convênios pode visualizar esta lista.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, ura.assigned_at
  FROM public.user_role_assignments ura
  JOIN public.system_roles sr ON sr.id = ura.role_id
  JOIN public.profiles p ON p.id = ura.user_id
  WHERE sr.name = 'gestor_convenio'
  ORDER BY ura.assigned_at DESC;
END;
$function$;

COMMENT ON FUNCTION public.convenio_list_gestores() IS
'Comando Convênio Fase 1: lista usuários com o papel gestor_convenio atribuído.';

REVOKE ALL ON FUNCTION public.convenio_list_gestores() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.convenio_list_gestores() TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ Comando Convênio Fase 1 — hardening aplicado: auditoria automática (5 tabelas), histórico de status, view convenio_dashboard_stats, RPCs convenio_grant_role/convenio_revoke_role/convenio_list_gestores.';
END $$;
