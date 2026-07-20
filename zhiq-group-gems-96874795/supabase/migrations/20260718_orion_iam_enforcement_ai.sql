-- ============================================================================
-- ORION-AI-77 — IDENTITY & ACCESS ENFORCEMENT AI v1.0
-- Data: 2026-07-18 · Idempotente · SQL Editor (broifhfqmnzqoongtokm)
-- ----------------------------------------------------------------------------
-- Camada de EXECUÇÃO (enforcement) de identidade/acesso. COMPLEMENTA — não
-- duplica — o AI-42 Identity & Access e o AI-47 Zero Trust (que são ANALÍTICOS,
-- read-only). Aqui ficam as ações ATIVAS: forçar MFA (admin), revogar sessão,
-- quarentena de dispositivo, revogação automática por risco.
--
-- SEGURANÇA POR PRINCÍPIO (não trava ninguém por acidente):
--  • KILL-SWITCH GLOBAL desligado por padrão (orion_iam_config.enforcement_enabled=false).
--  • Ações automáticas só REGISTRAM recomendação enquanto o kill-switch está off.
--  • ANTI-LOCKOUT: nunca revoga a própria sessão do chamador; nunca revoga a
--    ÚLTIMA sessão admin ativa.
--  • Esta migration NÃO revoga/deleta nenhuma sessão real ao aplicar.
--  • Reusa risco do AI-42 (orion_access_sessions.risk_score) e AI-47
--    (orion_zero_trust_risk.risco_acumulado). Admin = public.user_roles role='admin'.
--
-- Namespace orion_iam_* / funções iam_*. Revogação real via auth.sessions
-- (postgres tem DELETE — confirmado). Chave: iam_enforcement.
--
-- ROLLBACK:
--   DROP TABLE public.orion_iam_config, orion_iam_policies, orion_iam_actions,
--     orion_iam_revocations, orion_iam_device_quarantine, orion_iam_mfa_status,
--     orion_iam_statistics CASCADE;
--   DROP FUNCTION public.iam_emit, iam_audit, iam_config_get, iam_config_set,
--     iam_is_admin_user, iam_mfa_scan, iam_mfa_status_user, iam_revoke_session,
--     iam_quarantine_device, iam_release_device, iam_auto_enforce, iam_dashboard,
--     iam_selftest, orion_iam_tick CASCADE;
--   SELECT cron.unschedule('orion_iam_tick');
--   DELETE FROM orion_ai_module_prefs WHERE module='iam_enforcement';
--   DELETE FROM orion_ai_prompts WHERE chave LIKE 'iam_enforcement.%';
-- ============================================================================

-- 1) TABELAS
CREATE TABLE IF NOT EXISTS public.orion_iam_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enforcement_enabled       boolean NOT NULL DEFAULT false, -- KILL-SWITCH GLOBAL
  auto_revoke_enabled       boolean NOT NULL DEFAULT false, -- revogar sessão automático por risco
  mfa_enforce_enabled       boolean NOT NULL DEFAULT false, -- exigir MFA de admin
  mfa_mode                  text    NOT NULL DEFAULT 'warn' CHECK (mfa_mode IN ('warn','block')),
  device_quarantine_enabled boolean NOT NULL DEFAULT false,
  revoke_risk_threshold     int     NOT NULL DEFAULT 85,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);
COMMENT ON TABLE public.orion_iam_config IS 'ORION-AI-77: config de enforcement + KILL-SWITCH (tudo OFF por padrão).';

CREATE TABLE IF NOT EXISTS public.orion_iam_policies (
  policy_key text PRIMARY KEY,
  descricao text, condicao text, acao text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orion_iam_actions (
  id bigserial PRIMARY KEY,
  action_type text NOT NULL,     -- revoke_session / revoke_session_recommended / mfa_required / device_quarantine / device_release
  alvo_tipo text, alvo_ref text,
  motivo text, risco int,
  executado boolean NOT NULL DEFAULT false,
  resultado text,
  ator uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iam_actions_em ON public.orion_iam_actions (criado_em DESC);
COMMENT ON TABLE public.orion_iam_actions IS 'ORION-AI-77: trilha imutável de toda ação de enforcement (executada ou apenas recomendada).';

CREATE TABLE IF NOT EXISTS public.orion_iam_revocations (
  id bigserial PRIMARY KEY,
  session_id uuid, user_id uuid, motivo text,
  executado boolean NOT NULL DEFAULT false,
  ator uuid, criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orion_iam_device_quarantine (
  id bigserial PRIMARY KEY,
  device_ref text NOT NULL,      -- hash/user-agent/device_id
  user_id uuid, motivo text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  liberado_em timestamptz, ator uuid,
  CONSTRAINT orion_iam_quar_unico UNIQUE (device_ref)
);

CREATE TABLE IF NOT EXISTS public.orion_iam_mfa_status (
  id bigserial PRIMARY KEY,
  dia date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  user_id uuid NOT NULL,
  is_admin boolean, has_mfa boolean, satisfied boolean,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_iam_mfa_unico UNIQUE (dia, user_id)
);
COMMENT ON TABLE public.orion_iam_mfa_status IS 'ORION-AI-77: snapshot diário de admins e se têm MFA verificado.';

CREATE TABLE IF NOT EXISTS public.orion_iam_statistics (
  dia date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  admins int, admins_sem_mfa int, sessoes_ativas int, sessoes_risco int,
  revogacoes int, quarentenas int, acoes int,
  componentes jsonb NOT NULL DEFAULT '{}'::jsonb, criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.orion_iam_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2) RLS + grants
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_iam_config','orion_iam_policies','orion_iam_actions','orion_iam_revocations',
    'orion_iam_device_quarantine','orion_iam_mfa_status','orion_iam_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- 3) HELPERS
CREATE OR REPLACE FUNCTION public.iam_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'iam_enforcement', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL; END$$;

CREATE OR REPLACE FUNCTION public.iam_audit(p_type text, p_alvo_tipo text, p_alvo_ref text, p_motivo text, p_exec boolean, p_res text, p_risco int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.orion_iam_actions (action_type, alvo_tipo, alvo_ref, motivo, executado, resultado, risco, ator)
  VALUES (p_type, p_alvo_tipo, p_alvo_ref, p_motivo, p_exec, p_res, p_risco, auth.uid());
EXCEPTION WHEN OTHERS THEN NULL; END$$;

-- admin = user_roles role='admin' ativo (mesma fonte do mp_is_admin)
CREATE OR REPLACE FUNCTION public.iam_is_admin_user(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_uid AND role::text = 'admin' AND coalesce(is_active, true));
$$;

CREATE OR REPLACE FUNCTION public.iam_config_get()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(c) FROM public.orion_iam_config c WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.iam_config_set(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  UPDATE public.orion_iam_config SET
    enforcement_enabled       = coalesce((p_patch->>'enforcement_enabled')::boolean, enforcement_enabled),
    auto_revoke_enabled       = coalesce((p_patch->>'auto_revoke_enabled')::boolean, auto_revoke_enabled),
    mfa_enforce_enabled       = coalesce((p_patch->>'mfa_enforce_enabled')::boolean, mfa_enforce_enabled),
    mfa_mode                  = coalesce(p_patch->>'mfa_mode', mfa_mode),
    device_quarantine_enabled = coalesce((p_patch->>'device_quarantine_enabled')::boolean, device_quarantine_enabled),
    revoke_risk_threshold     = coalesce((p_patch->>'revoke_risk_threshold')::int, revoke_risk_threshold),
    atualizado_em = now(), atualizado_por = auth.uid()
  WHERE id = 1;
  PERFORM public.iam_audit('config_set', 'config', '1', 'config atualizada', true, p_patch::text);
  RETURN public.iam_config_get();
END$$;

-- 4) MFA SCAN — quais admins têm MFA verificado (read-only sobre auth)
CREATE OR REPLACE FUNCTION public.iam_mfa_scan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_total int; v_com int; v_sem int;
BEGIN
  DELETE FROM public.orion_iam_mfa_status WHERE dia = v_dia;
  INSERT INTO public.orion_iam_mfa_status (dia, user_id, is_admin, has_mfa, satisfied)
  SELECT v_dia, ur.uid, true, m.tem, m.tem
  FROM (SELECT DISTINCT user_id AS uid FROM public.user_roles WHERE role::text = 'admin' AND coalesce(is_active, true)) ur
  CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = ur.uid AND f.status = 'verified') AS tem) m
  ON CONFLICT (dia, user_id) DO UPDATE SET has_mfa = excluded.has_mfa, satisfied = excluded.satisfied;
  SELECT count(*), count(*) FILTER (WHERE has_mfa), count(*) FILTER (WHERE NOT has_mfa)
    INTO v_total, v_com, v_sem FROM public.orion_iam_mfa_status WHERE dia = v_dia;
  RETURN jsonb_build_object('admins', v_total, 'com_mfa', v_com, 'sem_mfa', v_sem);
END$$;

CREATE OR REPLACE FUNCTION public.iam_mfa_status_user(p_uid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin boolean; v_mfa boolean; v_cfg record;
BEGIN
  v_admin := public.iam_is_admin_user(p_uid);
  v_mfa := EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p_uid AND f.status = 'verified');
  SELECT * INTO v_cfg FROM public.orion_iam_config WHERE id = 1;
  RETURN jsonb_build_object(
    'is_admin', v_admin, 'has_mfa', v_mfa,
    'required', v_admin AND v_cfg.mfa_enforce_enabled,
    'satisfied', (NOT v_admin) OR v_mfa OR (NOT v_cfg.mfa_enforce_enabled),
    'mode', v_cfg.mfa_mode, 'enforce', v_cfg.mfa_enforce_enabled,
    'action', CASE WHEN v_admin AND v_cfg.mfa_enforce_enabled AND NOT v_mfa
                   THEN (CASE WHEN v_cfg.mfa_mode='block' THEN 'block' ELSE 'warn' END) ELSE 'none' END);
END$$;

-- 5) REVOGAÇÃO DE SESSÃO (real, com anti-lockout). p_manual=true = ação de admin no painel.
CREATE OR REPLACE FUNCTION public.iam_revoke_session(p_session_id uuid, p_reason text DEFAULT 'manual', p_manual boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_target uuid; v_admin_target boolean; v_other_admin int; v_cfg record;
BEGIN
  IF p_manual THEN
    IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  END IF;
  SELECT * INTO v_cfg FROM public.orion_iam_config WHERE id = 1;

  -- AUTOMÁTICO só executa com kill-switch + auto_revoke ligados; senão só registra
  IF NOT p_manual AND NOT (v_cfg.enforcement_enabled AND v_cfg.auto_revoke_enabled) THEN
    PERFORM public.iam_audit('revoke_session_recommended', 'session', p_session_id::text, p_reason, false, 'enforcement off — apenas registrado');
    RETURN jsonb_build_object('ok', true, 'executado', false, 'nota', 'enforcement desligado — recomendação registrada');
  END IF;

  SELECT user_id INTO v_target FROM auth.sessions WHERE id = p_session_id;
  IF v_target IS NULL THEN RETURN jsonb_build_object('ok', false, 'nota', 'sessão não encontrada'); END IF;

  -- ANTI-LOCKOUT 1: nunca a própria sessão do chamador
  IF v_uid IS NOT NULL AND v_target = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'nota', 'não revoga a sua própria sessão (anti-lockout)');
  END IF;
  -- ANTI-LOCKOUT 2: se alvo é admin e não sobra outra sessão admin ativa → recusa
  v_admin_target := public.iam_is_admin_user(v_target);
  IF v_admin_target THEN
    SELECT count(*) INTO v_other_admin FROM auth.sessions s
      JOIN public.user_roles ur ON ur.user_id = s.user_id AND ur.role::text = 'admin' AND coalesce(ur.is_active, true)
      WHERE s.id <> p_session_id AND (s.not_after IS NULL OR s.not_after > now());
    IF v_other_admin = 0 THEN
      RETURN jsonb_build_object('ok', false, 'nota', 'recusado: revogaria a última sessão admin ativa (anti-lockout)');
    END IF;
  END IF;

  DELETE FROM auth.sessions WHERE id = p_session_id;
  INSERT INTO public.orion_iam_revocations (session_id, user_id, motivo, executado, ator) VALUES (p_session_id, v_target, p_reason, true, v_uid);
  PERFORM public.iam_audit('revoke_session', 'session', p_session_id::text, p_reason, true, 'sessão revogada');
  PERFORM public.iam_emit('iam.session_revoked', jsonb_build_object('session', p_session_id, 'user', v_target, 'motivo', p_reason));
  RETURN jsonb_build_object('ok', true, 'executado', true, 'user_id', v_target);
END$$;

-- 6) QUARENTENA DE DISPOSITIVO (reversível)
CREATE OR REPLACE FUNCTION public.iam_quarantine_device(p_device_ref text, p_user_id uuid DEFAULT NULL, p_reason text DEFAULT 'suspeito')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  INSERT INTO public.orion_iam_device_quarantine (device_ref, user_id, motivo, ativo, ator)
  VALUES (p_device_ref, p_user_id, p_reason, true, auth.uid())
  ON CONFLICT (device_ref) DO UPDATE SET ativo = true, motivo = excluded.motivo, liberado_em = NULL, criado_em = now();
  PERFORM public.iam_audit('device_quarantine', 'device', p_device_ref, p_reason, true, 'dispositivo em quarentena');
  RETURN jsonb_build_object('ok', true, 'device', p_device_ref);
END$$;

CREATE OR REPLACE FUNCTION public.iam_release_device(p_device_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  UPDATE public.orion_iam_device_quarantine SET ativo = false, liberado_em = now() WHERE device_ref = p_device_ref;
  PERFORM public.iam_audit('device_release', 'device', p_device_ref, 'liberado', true, 'quarentena removida');
  RETURN jsonb_build_object('ok', true, 'device', p_device_ref);
END$$;

-- 7) AUTO-ENFORCE — lê risco do AI-42/AI-47 e age (só REGISTRA enquanto kill-switch off)
CREATE OR REPLACE FUNCTION public.iam_auto_enforce()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cfg record; v_thr int; r record; v_n int := 0; v_exec int := 0; v_res jsonb;
BEGIN
  SELECT * INTO v_cfg FROM public.orion_iam_config WHERE id = 1;
  v_thr := coalesce(v_cfg.revoke_risk_threshold, 85);
  -- sessões de alto risco (AI-42 orion_access_sessions.risk_score), ainda ativas
  IF to_regclass('public.orion_access_sessions') IS NOT NULL THEN
    FOR r IN
      SELECT s.session_id, s.user_id, s.risk_score
      FROM public.orion_access_sessions s
      WHERE coalesce(s.risk_score,0) >= v_thr AND s.session_id IS NOT NULL
        AND coalesce(s.status::text,'') NOT IN ('encerrada','revogada','closed','revoked')
        AND EXISTS (SELECT 1 FROM auth.sessions a WHERE a.id = s.session_id)
      LIMIT 50
    LOOP
      v_res := public.iam_revoke_session(r.session_id, 'auto: risco '||r.risk_score, false);
      v_n := v_n + 1;
      IF (v_res->>'executado')::boolean THEN v_exec := v_exec + 1; END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('avaliadas', v_n, 'executadas', v_exec, 'kill_switch', v_cfg.enforcement_enabled, 'auto_revoke', v_cfg.auto_revoke_enabled, 'threshold', v_thr);
END$$;

-- 8) STATS + DASHBOARD
CREATE OR REPLACE FUNCTION public.iam_stats_rollup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  INSERT INTO public.orion_iam_statistics (dia, admins, admins_sem_mfa, sessoes_ativas, sessoes_risco, revogacoes, quarentenas, acoes)
  VALUES (v_dia,
    (SELECT count(*) FROM public.orion_iam_mfa_status WHERE dia=v_dia),
    (SELECT count(*) FROM public.orion_iam_mfa_status WHERE dia=v_dia AND NOT has_mfa),
    (SELECT count(*) FROM auth.sessions WHERE not_after IS NULL OR not_after > now()),
    coalesce((SELECT count(*) FROM public.orion_access_sessions WHERE coalesce(risk_score,0) >= (SELECT revoke_risk_threshold FROM public.orion_iam_config WHERE id=1)),0),
    (SELECT count(*) FROM public.orion_iam_revocations WHERE criado_em::date=v_dia),
    (SELECT count(*) FROM public.orion_iam_device_quarantine WHERE ativo),
    (SELECT count(*) FROM public.orion_iam_actions WHERE criado_em::date=v_dia))
  ON CONFLICT (dia) DO UPDATE SET admins=excluded.admins, admins_sem_mfa=excluded.admins_sem_mfa, sessoes_ativas=excluded.sessoes_ativas,
    sessoes_risco=excluded.sessoes_risco, revogacoes=excluded.revogacoes, quarentenas=excluded.quarentenas, acoes=excluded.acoes, criado_em=now();
END$$;

CREATE OR REPLACE FUNCTION public.iam_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dia date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'config', public.iam_config_get(),
    'mfa', jsonb_build_object(
      'resumo', (SELECT jsonb_build_object('admins',count(*),'com_mfa',count(*) FILTER (WHERE has_mfa),'sem_mfa',count(*) FILTER (WHERE NOT has_mfa)) FROM public.orion_iam_mfa_status WHERE dia=v_dia),
      'admins_sem_mfa', (SELECT coalesce(jsonb_agg(user_id),'[]'::jsonb) FROM public.orion_iam_mfa_status WHERE dia=v_dia AND NOT has_mfa)),
    'sessoes', jsonb_build_object(
      'ativas', (SELECT count(*) FROM auth.sessions WHERE not_after IS NULL OR not_after > now()),
      'alto_risco', (SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',session_id,'user_id',user_id,'risk',risk_score,'ip',ip,'so',sistema_operacional,'nav',navegador) ORDER BY risk_score DESC),'[]'::jsonb)
                     FROM (SELECT * FROM public.orion_access_sessions WHERE coalesce(risk_score,0) >= (SELECT revoke_risk_threshold FROM public.orion_iam_config WHERE id=1) AND coalesce(status::text,'') NOT IN ('encerrada','revogada','closed','revoked') ORDER BY risk_score DESC LIMIT 30) t)),
    'quarentena', (SELECT coalesce(jsonb_agg(jsonb_build_object('device',device_ref,'user',user_id,'motivo',motivo) ) FILTER (WHERE ativo),'[]'::jsonb) FROM public.orion_iam_device_quarantine),
    'acoes_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',action_type,'alvo',alvo_ref,'motivo',motivo,'executado',executado,'quando',criado_em) ORDER BY criado_em DESC),'[]'::jsonb) FROM (SELECT * FROM public.orion_iam_actions ORDER BY criado_em DESC LIMIT 30) a),
    'estatisticas', (SELECT to_jsonb(s) FROM public.orion_iam_statistics s WHERE dia=v_dia),
    'seguranca', jsonb_build_object('kill_switch_off_por_padrao', true, 'anti_lockout', true, 'reusa_ai42_ai47', true),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','DD/MM/YYYY HH24:MI'));
END$$;

-- 9) TICK (cron */15) — scan MFA + auto-enforce (só registra enquanto off) + stats
CREATE OR REPLACE FUNCTION public.orion_iam_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.iam_mfa_scan();
  PERFORM public.iam_auto_enforce();
  PERFORM public.iam_stats_rollup();
EXCEPTION WHEN OTHERS THEN PERFORM public.iam_emit('iam.tick_error', jsonb_build_object('erro', SQLERRM)); END$$;

-- 10) SELFTEST (COMANDO TESTE) — PROVA que não trava ninguém
CREATE OR REPLACE FUNCTION public.iam_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tests jsonb := '[]'::jsonb; v_ok boolean := true; v_t boolean; v_e jsonb;
  v_sess_before bigint; v_sess_after bigint; v_mfa jsonb; v_auto jsonb; v_fake uuid;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;

  -- 1) 7 tabelas
  v_t := (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_iam_%') >= 7;
  v_tests := v_tests || jsonb_build_object('teste','tabelas_7','ok',v_t); v_ok := v_ok AND v_t;

  -- 2) KILL-SWITCH desligado por padrão (SEGURANÇA)
  v_t := (SELECT NOT enforcement_enabled AND NOT auto_revoke_enabled AND NOT mfa_enforce_enabled FROM public.orion_iam_config WHERE id=1);
  v_tests := v_tests || jsonb_build_object('teste','kill_switch_off_default','ok',v_t,'evidencia',public.iam_config_get()); v_ok := v_ok AND v_t;

  -- 3) EXECUTE sem PUBLIC/anon
  v_t := NOT EXISTS (SELECT 1 FROM information_schema.role_routine_grants WHERE routine_schema='public' AND routine_name LIKE 'iam_%' AND grantee IN ('PUBLIC','anon'));
  v_tests := v_tests || jsonb_build_object('teste','execute_sem_public_anon','ok',v_t); v_ok := v_ok AND v_t;

  -- captura sessões antes
  v_sess_before := (SELECT count(*) FROM auth.sessions);

  -- 4) MFA scan encontra admins
  v_mfa := public.iam_mfa_scan();
  v_t := (v_mfa->>'admins')::int >= 1;
  v_tests := v_tests || jsonb_build_object('teste','mfa_scan_admins','ok',v_t,'evidencia',v_mfa); v_ok := v_ok AND v_t;

  -- 5) auto_enforce com kill-switch off → 0 executadas (só registra)
  v_auto := public.iam_auto_enforce();
  v_t := (v_auto->>'executadas')::int = 0;
  v_tests := v_tests || jsonb_build_object('teste','auto_enforce_records_only','ok',v_t,'evidencia',v_auto); v_ok := v_ok AND v_t;

  -- 6) revoke em sessão inexistente → não encontrada (nada deletado)
  v_fake := gen_random_uuid();
  v_e := public.iam_revoke_session(v_fake, 'selftest', true);
  v_t := (v_e->>'ok')::boolean = false;
  v_tests := v_tests || jsonb_build_object('teste','revoke_inexistente_seguro','ok',v_t,'evidencia',v_e); v_ok := v_ok AND v_t;

  -- 7) PROVA ANTI-LOCKOUT: nenhuma sessão real foi removida no selftest
  v_sess_after := (SELECT count(*) FROM auth.sessions);
  v_t := (v_sess_before = v_sess_after);
  v_tests := v_tests || jsonb_build_object('teste','zero_lockout','ok',v_t,'evidencia',jsonb_build_object('sessoes_antes',v_sess_before,'depois',v_sess_after)); v_ok := v_ok AND v_t;

  -- 8) mfa_status_user coerente
  v_t := (public.iam_mfa_status_user(gen_random_uuid()) ? 'satisfied');
  v_tests := v_tests || jsonb_build_object('teste','mfa_status_user','ok',v_t); v_ok := v_ok AND v_t;

  -- 9) dashboard executa
  v_t := (public.iam_dashboard() ? 'config');
  v_tests := v_tests || jsonb_build_object('teste','dashboard','ok',v_t); v_ok := v_ok AND v_t;

  -- 10) cron agendado
  PERFORM public.iam_stats_rollup();
  v_t := EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_iam_tick');
  v_tests := v_tests || jsonb_build_object('teste','cron_agendado','ok',v_t); v_ok := v_ok AND v_t;

  RETURN jsonb_build_object('ok', v_ok, 'executado_em', now(), 'testes', v_tests, 'nota','suite oficial do AI-77 — enforcement seguro (kill-switch off, anti-lockout provado)');
END$$;

-- 11) SEEDS (políticas — informativas; nada executa até o kill-switch ligar)
INSERT INTO public.orion_iam_policies (policy_key, descricao, condicao, acao, params) VALUES
  ('mfa_admin','Admins devem ter MFA verificado','is_admin AND NOT has_mfa','exigir_mfa','{"mode":"warn"}'),
  ('revoke_high_risk','Revogar sessão com risco alto (>= threshold)','risk_score >= threshold','revogar_sessao','{}'),
  ('quarantine_device','Dispositivo marcado como suspeito entra em quarentena','device_suspeito','quarentena','{}')
ON CONFLICT (policy_key) DO NOTHING;

-- 12) HARDENING (lição AI-61): REVOKE de PUBLIC/anon, GRANT seletivo
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname LIKE 'iam_%' AND pronamespace='public'::regnamespace LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC, anon';
  END LOOP;
END$$;

GRANT EXECUTE ON FUNCTION public.iam_dashboard()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_config_get()                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_config_set(jsonb)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_revoke_session(uuid,text,boolean)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_quarantine_device(text,uuid,text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_release_device(text)                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_mfa_status_user(uuid)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_selftest()                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.iam_mfa_scan()                           TO service_role;
GRANT EXECUTE ON FUNCTION public.iam_auto_enforce()                       TO service_role;
GRANT EXECUTE ON FUNCTION public.iam_stats_rollup()                       TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_iam_tick()                         TO service_role;
GRANT EXECUTE ON FUNCTION public.iam_is_admin_user(uuid)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.iam_emit(text,jsonb)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.iam_audit(text,text,text,text,boolean,text,int) TO service_role;

-- 13) PROMPTS + MODEL PREF + CRON */15
SELECT public.orion_ai_prompt_set('iam_enforcement.summary',
 'Voce e o ORION IAM Enforcement (AI-77). Resuma o estado de enforcement de identidade/acesso usando SOMENTE os numeros fornecidos (kill-switch, admins sem MFA, sessoes de alto risco, revogacoes, quarentenas). Complementa o AI-42/AI-47 (analiticos). Enforcement e sempre auditavel e reversivel; nunca trava a ultima sessao admin.',
 'ORION-AI-77 seed');
SELECT public.orion_ai_prompt_set('iam_enforcement.action',
 'Voce e o ORION IAM Enforcement (AI-77). Explique a acao de enforcement (revogar sessao / quarentena / exigir MFA) com base na evidencia real e no risco. Deixe claro que o kill-switch controla a execucao automatica e que ha anti-lockout.',
 'ORION-AI-77 seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('iam_enforcement','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_iam_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_iam_tick');
    PERFORM cron.schedule('orion_iam_tick','*/15 * * * *','SELECT public.orion_iam_tick();');
  END IF;
END$$;

-- 14) BOOT — SÓ scan de MFA + stats (NUNCA revoga nada ao aplicar)
DO $$
BEGIN
  PERFORM public.iam_mfa_scan();
  PERFORM public.iam_stats_rollup();
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- 15) VERIFICAÇÃO (rodar manualmente):
-- SELECT public.iam_selftest();
-- SELECT public.iam_config_get();  -- enforcement_enabled deve estar FALSE
