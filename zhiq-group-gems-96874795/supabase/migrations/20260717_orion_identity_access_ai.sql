-- ============================================================================
-- ORION-AI-42 — IDENTITY & ACCESS AI v1.0
-- ============================================================================
-- Identity & Access Engine oficial do ORION (3o modulo do Security Ecosystem,
--   AI-40..49). Valida identidades, analisa o contexto de cada acesso, aplica
--   politicas adaptativas e protege todos os perfis da VIAGG-TX8.
--   RECOMENDA, NUNCA bloqueia sozinho: encerrar sessao/bloquear usuario de
--   verdade = acao humana pelas politicas (aprovacao 'humana').
--
-- Fontes reais validadas no banco (07-17): auth.users (11), auth.sessions (37,
--   com ip inet + user_agent + aal + not_after + refreshed_at), auth.
--   audit_log_entries (5.297; acoes login 805/logout 462/token_refreshed 1920/
--   user_repeated_signup 40/user_updated_password 5; ip_address VARCHAR),
--   auth.identities (10), auth.mfa_factors (0 — MFA NAO adotado, MAR=0 REAL),
--   public.profiles (9; active_profile/available_profiles/is_admin/
--   provider_role), public.user_roles (2), public.device_tokens (0 — vazia),
--   orion_fraud_events (AI-41) e orion_cyber_events (AI-40) VIVOS.
--
-- LACUNAS DECLARADAS (nunca inventa):
--   1) Geolocalizacao por IP nao existe no banco -> "mudanca brusca de
--      localizacao" fica DECLARADA (proxy real ja coberto: troca frequente de IP).
--   2) Fingerprint real de dispositivo: device_tokens esta VAZIA -> impressao
--      derivada de user_id+user_agent das sessoes reais (aproximacao DECLARADA).
--   3) MFA nao adotado na plataforma (auth.mfa_factors=0; 0 sessoes aal2) ->
--      MAR=0 real; politicas de MFA operam como RECOMENDACAO.
--   4) Troca de e-mail nao gera acao propria no GoTrue (aparece como
--      user_modified) — DECLARADO.
--   5) "Sessao roubada" plena exige telemetria continua; proxies reais:
--      sessao expirada reutilizada (refreshed_at > not_after) e token_refreshed
--      em volume anomalo.
--   6) Identidade duplicada (doc/telefone/dispositivo) NAO e re-detectada aqui:
--      o AI-41 ja cobre — o AI-42 LE orion_fraud_events como penalidade do
--      Identity Score (anti-duplicacao de detectores).
--
-- Anti-colisao: tabelas orion_identity_* / orion_access_* / orion_devices,
--   funcoes identity_* / validate_identity, chave identity_access, painel
--   /admin/orion-identity, cron orion_identity_tick. AI-24 usa sec_*, AI-40
--   orion_cyber_*, AI-41 orion_fraud_* — sem sobreposicao (provado 07-17).
--
-- Idempotente (dedupe_key + upsert; ingest incremental janela 30d, nunca
--   recalcula historico). Eventos append-only p/ clientes (REVOKE UPDATE/
--   DELETE via REVOKE ALL + GRANT SELECT). SECURITY DEFINER + guarda.
--   ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_identity_profiles (
  identity_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid        NOT NULL UNIQUE,
  tipo_usuario       text,                       -- active_profile do perfil
  perfis_disponiveis jsonb       NOT NULL DEFAULT '[]'::jsonb, -- multiplos papeis
  is_admin           boolean     NOT NULL DEFAULT false,
  roles              jsonb       NOT NULL DEFAULT '[]'::jsonb, -- snapshot user_roles ativas
  nivel_confianca    text        NOT NULL DEFAULT 'medio',     -- alto|medio|observacao|baixo
  identity_score     integer     NOT NULL DEFAULT 50,          -- IS 0-100
  access_trust_score integer     NOT NULL DEFAULT 50,          -- ATS 0-100
  status             text        NOT NULL DEFAULT 'ativo',     -- ativo|observacao|bloqueado
  evidencias         jsonb       NOT NULL DEFAULT '{}'::jsonb, -- componentes do score
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_identity_profiles IS
  'ORION-AI-42: perfil de identidade por usuario com IS/ATS EXPLICAVEIS (evidencias = componentes). Snapshot de is_admin/roles detecta alteracao de permissoes.';
CREATE INDEX IF NOT EXISTS ix_orion_idp_status ON public.orion_identity_profiles (status, identity_score);

CREATE TABLE IF NOT EXISTS public.orion_access_sessions (
  session_id          uuid        PRIMARY KEY,   -- = auth.sessions.id
  user_id             uuid        NOT NULL,
  device_id           text,
  ip                  text,
  localizacao         text,                      -- NULL: sem fonte geo-IP no banco (DECLARADO)
  navegador           text,
  sistema_operacional text,
  aal                 text,
  mfa                 boolean     NOT NULL DEFAULT false,
  login_at            timestamptz,
  refreshed_at        timestamptz,
  not_after           timestamptz,
  logout_at           timestamptz,
  status              text        NOT NULL DEFAULT 'ativa',  -- ativa|encerrada|expirada
  session_score       integer     NOT NULL DEFAULT 50,       -- 100 - SRS
  risk_score          integer     NOT NULL DEFAULT 0,        -- SRS 0-100
  evidencias          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_access_sessions IS
  'ORION-AI-42: espelho analitico de auth.sessions com SRS explicavel. logout_at ao sumir do GoTrue e aproximacao (hora exata vem da auditoria) — DECLARADO.';
CREATE INDEX IF NOT EXISTS ix_orion_as_user   ON public.orion_access_sessions (user_id, status);
CREATE INDEX IF NOT EXISTS ix_orion_as_status ON public.orion_access_sessions (status, risk_score DESC);

CREATE TABLE IF NOT EXISTS public.orion_devices (
  device_id           text        PRIMARY KEY,   -- md5(user_id||user_agent) — aproximacao DECLARADA
  user_id             uuid        NOT NULL,
  fingerprint         text        NOT NULL,
  user_agent          text,
  navegador           text,
  sistema_operacional text,
  first_seen          timestamptz NOT NULL DEFAULT now(),
  last_seen           timestamptz NOT NULL DEFAULT now(),
  sessoes             integer     NOT NULL DEFAULT 0,
  confianca           integer     NOT NULL DEFAULT 20,   -- DCS 0-100
  bloqueado           boolean     NOT NULL DEFAULT false,
  bloqueado_motivo    text,
  evidencias          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_devices IS
  'ORION-AI-42: dispositivos conhecidos por usuario. Fingerprint = derivada de user_agent (device_tokens vazia — DECLARADO); DCS cresce com idade+uso; bloqueio = acao humana auditada.';
CREATE INDEX IF NOT EXISTS ix_orion_dev_user ON public.orion_devices (user_id);

CREATE TABLE IF NOT EXISTS public.orion_access_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_at    timestamptz NOT NULL DEFAULT now(),
  tipo        text        NOT NULL,  -- login|logout|mfa|senha_alterada|tentativa_negada|permissao_alterada|...
  categoria   text        NOT NULL,  -- autenticacao|sessao|dispositivo|identidade|administracao|politica
  user_id     uuid,
  session_id  uuid,
  device_id   text,
  ip          text,
  severity    text        NOT NULL DEFAULT 'baixa',      -- baixa|media|alta|critica
  score       integer     NOT NULL DEFAULT 0,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status      text        NOT NULL DEFAULT 'registrada', -- registrada|detectada|em_analise|confirmada|falso_positivo|resolvida
  origem      text        NOT NULL DEFAULT 'engine',     -- auth_audit|engine|politica|admin
  dedupe_key  text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_access_events IS
  'ORION-AI-42: eventos de acesso com EVIDENCIA obrigatoria (auditoria + detectores + politicas). Append-only p/ clientes; dedupe_key = idempotencia.';
CREATE INDEX IF NOT EXISTS ix_orion_ae_at   ON public.orion_access_events (event_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_ae_cat  ON public.orion_access_events (categoria, status);
CREATE INDEX IF NOT EXISTS ix_orion_ae_user ON public.orion_access_events (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.orion_access_policies (
  policy_key      text        PRIMARY KEY,
  descricao       text        NOT NULL,
  perfil          text        NOT NULL DEFAULT 'todos',      -- todos|admin|lojista|motoboy|cliente|operador
  acao            text        NOT NULL,                       -- permitir|exigir_mfa|reautenticacao|validacao_adicional|revisao_manual|bloquear_dispositivo|elevacao_temporaria
  min_score       integer     NOT NULL DEFAULT 0,
  mfa_obrigatorio boolean     NOT NULL DEFAULT false,
  aprovacao       text        NOT NULL DEFAULT 'automatica',  -- automatica|humana
  ativa           boolean     NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_access_policies IS
  'ORION-AI-42: politicas adaptativas de acesso. Toda alteracao passa por identity_policy_set (auditada em orion_access_events; rollback reversivel).';

CREATE TABLE IF NOT EXISTS public.orion_identity_statistics (
  dia                     date        PRIMARY KEY,
  logins                  integer     NOT NULL DEFAULT 0,
  logins_suspeitos        integer     NOT NULL DEFAULT 0,
  sessoes_ativas          integer     NOT NULL DEFAULT 0,
  sessoes_risco_alto      integer     NOT NULL DEFAULT 0,
  mfa_executado           integer     NOT NULL DEFAULT 0,
  dispositivos_novos      integer     NOT NULL DEFAULT 0,
  dispositivos_confiaveis integer     NOT NULL DEFAULT 0,
  is_medio                integer     NOT NULL DEFAULT 0,
  ats_medio               integer     NOT NULL DEFAULT 0,
  srs_medio               integer     NOT NULL DEFAULT 0,
  dcs_medio               integer     NOT NULL DEFAULT 0,
  mar                     numeric     NOT NULL DEFAULT 0,   -- MFA Adoption Rate (real: 0)
  iii                     integer     NOT NULL DEFAULT 0,   -- Identity Integrity Index
  updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_identity_statistics IS
  'ORION-AI-42: estatisticas diarias. III = 0.35*IS + 0.25*ATS + 0.20*(100-SRS) + 0.20*DCS. MAR real (mfa_factors/aal2) — hoje 0, DECLARADO.';

-- ----------------------------------------------------------------------------
-- 2) RLS (leitura admin) + trava de grants
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_identity_profiles','orion_access_sessions','orion_devices',
                           'orion_access_events','orion_access_policies','orion_identity_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

-- default grants do projeto dao ALL (incl. TRUNCATE, que ignora RLS) — trava total:
REVOKE ALL ON public.orion_identity_profiles, public.orion_access_sessions, public.orion_devices,
             public.orion_access_events, public.orion_access_policies, public.orion_identity_statistics
  FROM anon, authenticated;
GRANT SELECT ON public.orion_identity_profiles, public.orion_access_sessions, public.orion_devices,
               public.orion_access_events, public.orion_access_policies, public.orion_identity_statistics
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS + REGISTRO idempotente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'identity_access', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

CREATE OR REPLACE FUNCTION public.identity_event(
  p_tipo text, p_categoria text, p_score bigint, p_evid jsonb, p_dedupe text,
  p_user uuid DEFAULT NULL, p_session uuid DEFAULT NULL, p_device text DEFAULT NULL,
  p_ip text DEFAULT NULL, p_origem text DEFAULT 'engine', p_status text DEFAULT 'detectada',
  p_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sev text;
BEGIN
  v_sev := CASE WHEN p_score >= 80 THEN 'critica' WHEN p_score >= 60 THEN 'alta'
                WHEN p_score >= 40 THEN 'media' ELSE 'baixa' END;
  INSERT INTO public.orion_access_events
    (event_at, tipo, categoria, user_id, session_id, device_id, ip, severity, score, evidencias, status, origem, dedupe_key)
  VALUES (coalesce(p_at, now()), p_tipo, p_categoria, p_user, p_session, p_device, p_ip,
          v_sev, least(p_score,100)::int, coalesce(p_evid,'{}'::jsonb), p_status, p_origem, p_dedupe)
  ON CONFLICT (dedupe_key) DO UPDATE SET
    score = excluded.score, severity = excluded.severity,
    evidencias = excluded.evidencias, updated_at = now();
END$$;

-- ----------------------------------------------------------------------------
-- 4) SYNC DE SESSOES + DISPOSITIVOS (SRS e DCS explicaveis)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_sync_sessions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_risk int; v_evid jsonb;
        v_ip_novo bool; v_ua_novo bool; v_reuse bool; v_admin_aal1 bool;
        v_sinal_sec bool; v_stale bool; v_dev text; v_blocked bool;
BEGIN
  -- 4.1 espelha sessoes vivas do GoTrue (upsert por session_id)
  FOR r IN
    SELECT s.id, s.user_id, coalesce(host(s.ip),'') ip, coalesce(s.user_agent,'') ua,
           s.aal::text aal, (s.factor_id IS NOT NULL) mfa, s.created_at, s.refreshed_at, s.not_after,
           coalesce(p.is_admin,false) is_admin
    FROM auth.sessions s LEFT JOIN public.profiles p ON p.id = s.user_id
  LOOP
    v_dev := md5(r.user_id::text || r.ua);

    -- dispositivo (impressao derivada de user_agent — DECLARADO)
    INSERT INTO public.orion_devices (device_id, user_id, fingerprint, user_agent, navegador, sistema_operacional,
                                      first_seen, last_seen, sessoes, evidencias)
    VALUES (v_dev, r.user_id, v_dev, nullif(r.ua,''),
      CASE WHEN r.ua ~* 'edg/' THEN 'Edge' WHEN r.ua ~* 'opr/|opera' THEN 'Opera'
           WHEN r.ua ~* 'firefox|fxios' THEN 'Firefox' WHEN r.ua ~* 'chrome|crios' THEN 'Chrome'
           WHEN r.ua ~* 'safari' THEN 'Safari' WHEN r.ua = '' THEN NULL ELSE 'Outro' END,
      CASE WHEN r.ua ~* 'windows' THEN 'Windows' WHEN r.ua ~* 'android' THEN 'Android'
           WHEN r.ua ~* 'iphone|ipad|ios' THEN 'iOS' WHEN r.ua ~* 'mac os|macintosh' THEN 'macOS'
           WHEN r.ua ~* 'linux' THEN 'Linux' WHEN r.ua = '' THEN NULL ELSE 'Outro' END,
      now(), now(), 1,
      jsonb_build_object('fonte','auth.sessions','nota','fingerprint derivada de user_agent (device_tokens vazia — DECLARADO)'))
    ON CONFLICT (device_id) DO UPDATE SET last_seen = now(),
      sessoes = public.orion_devices.sessoes
              + CASE WHEN EXISTS (SELECT 1 FROM public.orion_access_sessions x WHERE x.session_id = r.id) THEN 0 ELSE 1 END,
      updated_at = now();

    SELECT bloqueado INTO v_blocked FROM public.orion_devices WHERE device_id = v_dev;

    -- componentes do SRS (todos com fonte real)
    v_ip_novo := r.ip <> '' AND EXISTS (SELECT 1 FROM public.orion_access_sessions x
                   WHERE x.user_id = r.user_id AND x.session_id <> r.id AND x.login_at < r.created_at)
               AND NOT EXISTS (SELECT 1 FROM public.orion_access_sessions x
                   WHERE x.user_id = r.user_id AND x.session_id <> r.id AND x.ip = r.ip AND x.login_at < r.created_at);
    v_ua_novo := r.ua <> '' AND EXISTS (SELECT 1 FROM public.orion_access_sessions x
                   WHERE x.user_id = r.user_id AND x.session_id <> r.id AND x.login_at < r.created_at)
               AND NOT EXISTS (SELECT 1 FROM public.orion_access_sessions x
                   WHERE x.user_id = r.user_id AND x.session_id <> r.id AND x.device_id = v_dev AND x.login_at < r.created_at);
    v_reuse      := r.not_after IS NOT NULL AND r.refreshed_at IS NOT NULL AND r.refreshed_at > r.not_after;
    v_admin_aal1 := r.is_admin AND coalesce(r.aal,'aal1') <> 'aal2';
    v_sinal_sec  := EXISTS (SELECT 1 FROM public.orion_fraud_events f WHERE f.user_id = r.user_id
                              AND f.severity IN ('alta','critica') AND f.status NOT IN ('falso_positivo','resolvida'))
                 OR EXISTS (SELECT 1 FROM public.orion_cyber_events c WHERE c.user_id = r.user_id
                              AND c.severidade IN ('alta','critica'));
    v_stale := r.refreshed_at IS NOT NULL AND r.refreshed_at < now() - interval '7 days';

    v_risk := least(100,
        CASE WHEN v_ip_novo    THEN 25 ELSE 0 END
      + CASE WHEN v_ua_novo    THEN 15 ELSE 0 END
      + CASE WHEN v_reuse      THEN 35 ELSE 0 END
      + CASE WHEN v_admin_aal1 THEN 20 ELSE 0 END
      + CASE WHEN v_sinal_sec  THEN 30 ELSE 0 END
      + CASE WHEN v_stale      THEN 10 ELSE 0 END
      + CASE WHEN coalesce(v_blocked,false) THEN 40 ELSE 0 END);
    v_evid := jsonb_build_object(
      'ip_novo_para_usuario', v_ip_novo, 'navegador_novo', v_ua_novo,
      'expirada_reutilizada', v_reuse, 'admin_sem_mfa', v_admin_aal1,
      'sinais_ai40_ai41', v_sinal_sec, 'sem_refresh_7d', v_stale,
      'dispositivo_bloqueado', coalesce(v_blocked,false),
      'pesos', '25/15/35/20/30/10/40', 'fonte', 'auth.sessions + orion_fraud_events + orion_cyber_events');

    INSERT INTO public.orion_access_sessions
      (session_id, user_id, device_id, ip, navegador, sistema_operacional, aal, mfa,
       login_at, refreshed_at, not_after, status, session_score, risk_score, evidencias)
    VALUES (r.id, r.user_id, v_dev, nullif(r.ip,''),
      (SELECT navegador FROM public.orion_devices WHERE device_id = v_dev),
      (SELECT sistema_operacional FROM public.orion_devices WHERE device_id = v_dev),
      r.aal, r.mfa, r.created_at, r.refreshed_at, r.not_after,
      CASE WHEN r.not_after IS NOT NULL AND r.not_after < now() THEN 'expirada' ELSE 'ativa' END,
      100 - v_risk, v_risk, v_evid)
    ON CONFLICT (session_id) DO UPDATE SET
      refreshed_at = excluded.refreshed_at, not_after = excluded.not_after,
      status = excluded.status, session_score = excluded.session_score,
      risk_score = excluded.risk_score, evidencias = excluded.evidencias, updated_at = now();
    v_n := v_n + 1;
  END LOOP;

  -- 4.2 sessoes que sumiram do GoTrue = encerradas (aproximacao DECLARADA)
  UPDATE public.orion_access_sessions o
     SET status = 'encerrada', logout_at = coalesce(o.logout_at, now()), updated_at = now()
   WHERE o.status IN ('ativa','expirada')
     AND NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = o.session_id);

  -- 4.3 DCS: confianca cresce com idade + uso; bloqueado = 0
  UPDATE public.orion_devices d SET
    confianca = CASE WHEN d.bloqueado THEN 0 ELSE least(100,
        15 + least(45, (extract(day FROM now() - d.first_seen))::int * 3) + least(30, d.sessoes * 6)
        + CASE WHEN EXISTS (SELECT 1 FROM public.orion_access_sessions s
                            WHERE s.device_id = d.device_id AND s.risk_score >= 60) THEN -15 ELSE 10 END) END,
    evidencias = d.evidencias || jsonb_build_object(
      'formula','15 + min(45, dias*3) + min(30, sessoes*6) + (sem_risco? +10 : -15); bloqueado=0',
      'dias_conhecido', (extract(day FROM now() - d.first_seen))::int, 'sessoes', d.sessoes),
    updated_at = now();

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 5) INGESTAO INCREMENTAL DA AUDITORIA (janela 30d; dedupe audit:<id>)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_ingest_audit()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_tipo text; v_cat text; v_score int; v_status text; v_uid uuid;
BEGIN
  FOR r IN
    SELECT a.id, a.created_at, a.payload, nullif(a.ip_address,'') ip,
           a.payload->>'action' acao, a.payload->>'actor_id' actor,
           a.payload->>'actor_username' actor_nome, a.payload->'traits' traits
    FROM auth.audit_log_entries a
    WHERE a.created_at > now() - interval '30 days'
      AND a.payload->>'action' NOT IN ('token_refreshed','token_revoked')  -- volume; agregados no detector T6
      AND NOT EXISTS (SELECT 1 FROM public.orion_access_events e WHERE e.dedupe_key = 'audit:'||a.id)
  LOOP
    v_uid := CASE WHEN r.actor ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN r.actor::uuid ELSE NULL END;
    SELECT t, c, s, st INTO v_tipo, v_cat, v_score, v_status FROM (SELECT
      CASE r.acao
        WHEN 'login' THEN 'login' WHEN 'logout' THEN 'logout'
        WHEN 'user_updated_password' THEN 'senha_alterada'
        WHEN 'user_recovery_requested' THEN 'recuperacao_senha'
        WHEN 'user_repeated_signup' THEN 'tentativa_negada'
        WHEN 'user_signedup' THEN 'cadastro'
        WHEN 'user_confirmation_requested' THEN 'confirmacao_email'
        WHEN 'user_modified' THEN 'conta_modificada'
        WHEN 'user_deleted' THEN 'conta_excluida'
        ELSE CASE WHEN r.acao ~* 'mfa|factor|challenge' THEN 'mfa' ELSE r.acao END END t,
      CASE WHEN r.acao IN ('user_modified','user_deleted') THEN 'identidade' ELSE 'autenticacao' END c,
      CASE r.acao WHEN 'user_repeated_signup' THEN 45 WHEN 'user_updated_password' THEN 30
                  WHEN 'user_deleted' THEN 40 WHEN 'user_modified' THEN 30
                  WHEN 'user_recovery_requested' THEN 25 ELSE 5 END s,
      CASE WHEN r.acao = 'user_repeated_signup' THEN 'detectada' ELSE 'registrada' END st) x;

    PERFORM public.identity_event(v_tipo, v_cat, v_score,
      jsonb_build_object('acao_gotrue', r.acao, 'usuario', r.actor_nome, 'traits', r.traits,
        'fonte','auth.audit_log_entries', 'criterio',
        CASE WHEN r.acao='user_repeated_signup' THEN 'tentativa de cadastro repetido (conta ja existe)' ELSE 'evento oficial do GoTrue' END),
      'audit:'||r.id, v_uid, NULL, NULL, r.ip, 'auth_audit', v_status, r.created_at);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 6) SYNC DE IDENTIDADES (IS/ATS explicaveis + alteracao de permissoes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_sync_profiles()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_is int; v_ats int; v_evid jsonb; v_old record;
        v_email_div bool; v_fraude bool; v_cyber bool; v_ev_id bool; v_madura bool; v_roles jsonb;
BEGIN
  FOR r IN
    SELECT u.id, u.email u_email, u.email_confirmed_at, u.created_at u_created,
           p.email p_email, p.active_profile, p.available_profiles, coalesce(p.is_admin,false) is_admin,
           coalesce(p.profile_complete,false) profile_complete, coalesce(p.legal_compliant,false) legal_compliant,
           (coalesce(p.cpf, p.cpf_cnpj) IS NOT NULL) tem_doc
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  LOOP
    v_roles := coalesce((SELECT jsonb_agg(ur.role ORDER BY ur.role) FROM public.user_roles ur
                         WHERE ur.user_id = r.id AND coalesce(ur.is_active,true)), '[]'::jsonb);

    -- alteracao de permissoes: diff contra o snapshot anterior (polling — sem trigger em tabela core)
    SELECT is_admin, roles INTO v_old FROM public.orion_identity_profiles WHERE user_id = r.id;
    IF FOUND AND (v_old.is_admin IS DISTINCT FROM r.is_admin OR v_old.roles IS DISTINCT FROM v_roles) THEN
      PERFORM public.identity_event('permissao_alterada','administracao', 70,
        jsonb_build_object('antes', jsonb_build_object('is_admin', v_old.is_admin, 'roles', v_old.roles),
                           'depois', jsonb_build_object('is_admin', r.is_admin, 'roles', v_roles),
                           'criterio','snapshot de is_admin/user_roles mudou entre ticks', 'fonte','profiles + user_roles'),
        'perm:'||r.id||':'||md5(coalesce(v_old.is_admin::text,'')||coalesce(v_old.roles::text,'')||r.is_admin::text||v_roles::text),
        r.id);
    END IF;

    v_email_div := r.p_email IS NOT NULL AND lower(coalesce(r.p_email,'')) <> lower(coalesce(r.u_email,''));
    v_fraude := EXISTS (SELECT 1 FROM public.orion_fraud_events f WHERE f.user_id = r.id
                          AND f.status NOT IN ('falso_positivo','resolvida'));
    v_cyber  := EXISTS (SELECT 1 FROM public.orion_cyber_events c WHERE c.user_id = r.id
                          AND c.severidade IN ('alta','critica'));
    v_ev_id  := EXISTS (SELECT 1 FROM public.orion_access_events e WHERE e.user_id = r.id
                          AND e.severity IN ('alta','critica') AND e.status IN ('detectada','em_analise'));
    v_madura := r.u_created < now() - interval '30 days';

    v_is := greatest(0, least(100, 50
      + CASE WHEN r.email_confirmed_at IS NOT NULL THEN 10 ELSE 0 END
      + CASE WHEN r.profile_complete THEN 10 ELSE 0 END
      + CASE WHEN r.legal_compliant THEN 5 ELSE 0 END
      + CASE WHEN v_madura THEN 10 ELSE 0 END
      + CASE WHEN r.tem_doc THEN 5 ELSE 0 END
      - CASE WHEN v_email_div THEN 25 ELSE 0 END
      - CASE WHEN v_fraude THEN 20 ELSE 0 END
      - CASE WHEN v_cyber THEN 15 ELSE 0 END
      - CASE WHEN v_ev_id THEN 15 ELSE 0 END
      - CASE WHEN r.is_admin AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors m WHERE m.user_id = r.id AND m.status='verified') THEN 10 ELSE 0 END));

    v_ats := round(( v_is * 2
      + coalesce((SELECT round(avg(s.session_score)) FROM public.orion_access_sessions s
                  WHERE s.user_id = r.id AND s.status = 'ativa'), v_is)
      + coalesce((SELECT round(avg(d.confianca)) FROM public.orion_devices d WHERE d.user_id = r.id), v_is)
      ) / 4.0);

    v_evid := jsonb_build_object(
      'base', 50, 'email_confirmado', r.email_confirmed_at IS NOT NULL, 'perfil_completo', r.profile_complete,
      'legal_compliant', r.legal_compliant, 'conta_madura_30d', v_madura, 'tem_documento', r.tem_doc,
      'email_divergente_perfil_x_auth', v_email_div, 'fraude_ativa_ai41', v_fraude,
      'sinal_cyber_ai40', v_cyber, 'eventos_identidade_abertos', v_ev_id,
      'admin_sem_mfa', r.is_admin AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors m WHERE m.user_id = r.id AND m.status='verified'),
      'pesos', '+10/+10/+5/+10/+5 e -25/-20/-15/-15/-10',
      'ats_formula', '(2*IS + media(session_score ativas) + media(DCS dispositivos)) / 4',
      'fonte', 'auth.users + profiles + user_roles + AI-40/41');

    INSERT INTO public.orion_identity_profiles
      (user_id, tipo_usuario, perfis_disponiveis, is_admin, roles, nivel_confianca,
       identity_score, access_trust_score, status, evidencias)
    VALUES (r.id, r.active_profile,
      coalesce(to_jsonb(r.available_profiles), '[]'::jsonb), r.is_admin, v_roles,
      CASE WHEN v_is >= 80 THEN 'alto' WHEN v_is >= 60 THEN 'medio' WHEN v_is >= 40 THEN 'observacao' ELSE 'baixo' END,
      v_is, v_ats,
      CASE WHEN v_is < 60 THEN 'observacao' ELSE 'ativo' END, v_evid)
    ON CONFLICT (user_id) DO UPDATE SET
      tipo_usuario = excluded.tipo_usuario, perfis_disponiveis = excluded.perfis_disponiveis,
      is_admin = excluded.is_admin, roles = excluded.roles, nivel_confianca = excluded.nivel_confianca,
      identity_score = excluded.identity_score, access_trust_score = excluded.access_trust_score,
      status = CASE WHEN public.orion_identity_profiles.status = 'bloqueado'
                    THEN 'bloqueado' ELSE excluded.status END,  -- bloqueio manual nunca e rebaixado pelo motor
      evidencias = excluded.evidencias, updated_at = now();
    v_n := v_n + 1;

    IF v_email_div THEN
      PERFORM public.identity_event('identidade_inconsistente','identidade', 60,
        jsonb_build_object('email_perfil', r.p_email, 'email_auth', r.u_email,
          'criterio','email do perfil difere do email oficial do auth', 'fonte','profiles x auth.users'),
        'emaildiv:'||r.id, r.id);
    END IF;
  END LOOP;
  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 7) DETECTORES DE ACESSO (todos com fonte real; dedupe por janela)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_detect()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0;
BEGIN
  -- T1 troca frequente de IP (>=3 IPs distintos em 24h na auditoria de login)
  FOR r IN
    SELECT (payload->>'actor_id')::uuid uid, count(DISTINCT nullif(ip_address,'')) ips,
           array_agg(DISTINCT nullif(ip_address,'')) lista
    FROM auth.audit_log_entries
    WHERE created_at > now() - interval '24 hours' AND payload->>'action' = 'login'
      AND payload->>'actor_id' ~* '^[0-9a-f]{8}-'
    GROUP BY 1 HAVING count(DISTINCT nullif(ip_address,'')) >= 3
  LOOP
    PERFORM public.identity_event('troca_frequente_ip','identidade', least(50+r.ips*5,100),
      jsonb_build_object('ips_24h', r.ips, 'ips', to_jsonb(r.lista),
        'criterio','>=3 IPs distintos em logins do mesmo usuario em 24h', 'fonte','auth.audit_log_entries'),
      'multiip:'||r.uid||':'||to_char(now(),'YYYY-MM-DD'), r.uid);
    v_n := v_n+1;
  END LOOP;

  -- T2 troca frequente de navegador (>=3 dispositivos derivados em 7d)
  FOR r IN
    SELECT user_id uid, count(DISTINCT device_id) n
    FROM public.orion_access_sessions
    WHERE login_at > now() - interval '7 days'
    GROUP BY 1 HAVING count(DISTINCT device_id) >= 3
  LOOP
    PERFORM public.identity_event('troca_frequente_navegador','identidade', least(35+r.n*5,100),
      jsonb_build_object('dispositivos_7d', r.n,
        'criterio','>=3 navegadores/dispositivos distintos em 7d', 'fonte','auth.sessions (user_agent)'),
      'multiua:'||r.uid||':'||to_char(now(),'IYYY-IW'), r.uid);
    v_n := v_n+1;
  END LOOP;

  -- T3 login simultaneo incompativel (2 sessoes ativas, IPs distintos, <10min)
  FOR r IN
    SELECT a.user_id uid, a.session_id s1, b.session_id s2, a.ip ip1, b.ip ip2,
           abs(extract(epoch FROM (a.login_at - b.login_at))) seg
    FROM public.orion_access_sessions a
    JOIN public.orion_access_sessions b
      ON b.user_id = a.user_id AND b.session_id > a.session_id
     AND a.status = 'ativa' AND b.status = 'ativa'
     AND coalesce(a.ip,'') <> '' AND coalesce(b.ip,'') <> '' AND a.ip <> b.ip
     AND abs(extract(epoch FROM (a.login_at - b.login_at))) < 600
  LOOP
    PERFORM public.identity_event('login_simultaneo_incompativel','sessao', 70,
      jsonb_build_object('sessao_1', r.s1, 'sessao_2', r.s2, 'ip_1', r.ip1, 'ip_2', r.ip2,
        'segundos_entre_logins', r.seg,
        'criterio','2 sessoes ativas do mesmo usuario com IPs distintos criadas em <10min', 'fonte','auth.sessions'),
      'simul:'||r.uid||':'||to_char(now(),'YYYY-MM-DD'), r.uid, r.s1);
    v_n := v_n+1;
  END LOOP;

  -- T4 sessao duplicada (mesmo usuario+ip+dispositivo, >1 ativa)
  FOR r IN
    SELECT user_id uid, ip, device_id, count(*) n, max(session_id::text)::uuid sess
    FROM public.orion_access_sessions
    WHERE status = 'ativa' AND coalesce(ip,'') <> ''
    GROUP BY 1,2,3 HAVING count(*) > 1
  LOOP
    PERFORM public.identity_event('sessao_duplicada','sessao', 45,
      jsonb_build_object('sessoes_ativas', r.n, 'ip', r.ip, 'dispositivo', r.device_id,
        'criterio','>1 sessao ativa do mesmo usuario no mesmo IP+dispositivo', 'fonte','auth.sessions'),
      'dupsess:'||r.uid||':'||r.device_id||':'||to_char(now(),'YYYY-MM-DD'), r.uid, r.sess, r.device_id, r.ip);
    v_n := v_n+1;
  END LOOP;

  -- T5 sessao expirada reutilizada (refresh apos not_after)
  FOR r IN
    SELECT session_id, user_id, refreshed_at, not_after
    FROM public.orion_access_sessions
    WHERE not_after IS NOT NULL AND refreshed_at IS NOT NULL AND refreshed_at > not_after
  LOOP
    PERFORM public.identity_event('sessao_expirada_reutilizada','sessao', 85,
      jsonb_build_object('refreshed_at', r.refreshed_at, 'not_after', r.not_after,
        'criterio','token da sessao renovado APOS o vencimento (not_after)', 'fonte','auth.sessions'),
      'expreuse:'||r.session_id, r.user_id, r.session_id);
    v_n := v_n+1;
  END LOOP;

  -- T6 token suspeito (>=50 token_refreshed do mesmo usuario em 24h)
  FOR r IN
    SELECT (payload->>'actor_id')::uuid uid, count(*) n
    FROM auth.audit_log_entries
    WHERE created_at > now() - interval '24 hours' AND payload->>'action' = 'token_refreshed'
      AND payload->>'actor_id' ~* '^[0-9a-f]{8}-'
    GROUP BY 1 HAVING count(*) >= 50
  LOOP
    PERFORM public.identity_event('token_suspeito','sessao', least(45+r.n/5,100),
      jsonb_build_object('refreshes_24h', r.n,
        'criterio','>=50 renovacoes de token em 24h (automacao/loop suspeito)', 'fonte','auth.audit_log_entries'),
      'tokspam:'||r.uid||':'||to_char(now(),'YYYY-MM-DD'), r.uid);
    v_n := v_n+1;
  END LOOP;

  -- T7 dispositivo novo (informativo, severidade baixa)
  FOR r IN
    SELECT device_id, user_id, navegador, sistema_operacional
    FROM public.orion_devices WHERE first_seen::date = current_date
  LOOP
    PERFORM public.identity_event('dispositivo_novo','dispositivo', 20,
      jsonb_build_object('navegador', r.navegador, 'sistema', r.sistema_operacional,
        'criterio','primeira vez que este dispositivo (user_agent) aparece para o usuario', 'fonte','auth.sessions'),
      'newdev:'||r.device_id, r.user_id, NULL, r.device_id);
    v_n := v_n+1;
  END LOOP;

  -- T8 dispositivo bloqueado em uso (sessao ativa em device bloqueado)
  FOR r IN
    SELECT s.session_id, s.user_id, s.device_id
    FROM public.orion_access_sessions s
    JOIN public.orion_devices d ON d.device_id = s.device_id AND d.bloqueado
    WHERE s.status = 'ativa'
  LOOP
    PERFORM public.identity_event('dispositivo_bloqueado_em_uso','dispositivo', 90,
      jsonb_build_object('criterio','sessao ativa em dispositivo marcado como bloqueado', 'fonte','orion_devices + auth.sessions'),
      'blockeddev:'||r.session_id, r.user_id, r.session_id, r.device_id);
    v_n := v_n+1;
  END LOOP;

  -- T9 acesso administrativo sem MFA (recomendacao; MFA nao adotado — DECLARADO)
  FOR r IN
    SELECT s.user_id, count(*) n
    FROM public.orion_access_sessions s
    JOIN public.orion_identity_profiles ip2 ON ip2.user_id = s.user_id AND ip2.is_admin
    WHERE s.status = 'ativa' AND coalesce(s.aal,'aal1') <> 'aal2'
    GROUP BY 1
  LOOP
    PERFORM public.identity_event('admin_sem_mfa','administracao', 45,
      jsonb_build_object('sessoes_ativas_aal1', r.n,
        'criterio','administrador com sessao ativa sem MFA (aal1). MFA da plataforma ainda nao adotado (MAR=0 REAL — DECLARADO)',
        'fonte','auth.sessions + profiles.is_admin'),
      'adminmfa:'||r.user_id||':'||to_char(now(),'IYYY-IW'), r.user_id);
    v_n := v_n+1;
  END LOOP;

  RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 8) RESPOSTA POR POLITICA (recomenda/alerta; NUNCA executa bloqueio sozinho)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_respond()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_a int := 0; v_acao text;
BEGIN
  FOR r IN
    SELECT e.* FROM public.orion_access_events e
    WHERE e.status = 'detectada' AND e.severity IN ('alta','critica')
      AND e.categoria <> 'politica'
      AND NOT EXISTS (SELECT 1 FROM public.orion_access_events x WHERE x.dedupe_key = 'resp:'||e.event_id)
  LOOP
    v_acao := CASE WHEN r.severity = 'critica' THEN 'reautenticacao'
                   WHEN r.tipo IN ('admin_sem_mfa','permissao_alterada') THEN 'exigir_mfa'
                   ELSE 'validacao_adicional' END;
    PERFORM public.identity_event('resposta_politica','politica', 10,
      jsonb_build_object('evento', r.event_id, 'tipo_original', r.tipo, 'acao_recomendada', v_acao,
        'politica', 'identity_politica_v1', 'nota','recomendacao — acoes de alto impacto exigem aprovacao humana'),
      'resp:'||r.event_id, r.user_id, r.session_id, r.device_id, r.ip, 'politica', 'registrada');
    UPDATE public.orion_access_events SET status = 'em_analise', updated_at = now() WHERE event_id = r.event_id;
    IF NOT EXISTS (SELECT 1 FROM public.orion_ai_alerts WHERE tipo = 'identity:'||r.tipo AND dia = current_date) THEN
      INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
      VALUES ('identity:'||r.tipo, CASE WHEN r.severity='critica' THEN 'critico' ELSE 'atencao' END,
              'AI-42: '||r.tipo||' ('||r.categoria||') score='||r.score||' — '||v_acao,
              r.score, 60, current_date);
    END IF;
    v_a := v_a + 1;
  END LOOP;
  IF v_a > 0 THEN PERFORM public.identity_emit('identity.respond', jsonb_build_object('acoes', v_a)); END IF;
  PERFORM public.identity_bridge_cyber();
  RETURN jsonb_build_object('ok', true, 'acoes', v_a);
END$$;

-- ponte Security Ecosystem: espelha alta/critica na base comum do AI-40
CREATE OR REPLACE FUNCTION public.identity_bridge_cyber()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v int := 0;
BEGIN
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score, user_id, ip)
  SELECT 'identity:'||e.event_id, 'identity_access', 'identity:'||e.tipo, e.severity, e.categoria,
         'AI-42 '||e.tipo||' score='||e.score||coalesce(' user='||e.user_id, ''),
         e.evidencias, 80, e.score, e.user_id, e.ip
  FROM public.orion_access_events e
  WHERE e.severity IN ('alta','critica') AND e.status IN ('detectada','em_analise')
    AND NOT EXISTS (SELECT 1 FROM public.orion_cyber_events c WHERE c.dedupe_key = 'identity:'||e.event_id);
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN 0;
END$$;

-- ----------------------------------------------------------------------------
-- 9) ACOES HUMANAS AUDITADAS (marcacao, bloqueio de dispositivo, politicas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_mark(p_event_id bigint, p_status text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_mark: somente admin';
  END IF;
  IF p_status NOT IN ('em_analise','confirmada','falso_positivo','resolvida') THEN
    RAISE EXCEPTION 'identity_mark: status invalido %', p_status;
  END IF;
  UPDATE public.orion_access_events SET status = p_status, updated_at = now() WHERE event_id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'identity_mark: evento % nao existe', p_event_id; END IF;
  PERFORM public.identity_event('marcacao_humana','politica', 5,
    jsonb_build_object('evento', p_event_id, 'novo_status', p_status, 'motivo', coalesce(p_motivo,'-'),
      'operador', coalesce(auth.uid()::text,'admin')),
    'mark:'||p_event_id||':'||p_status||':'||to_char(now(),'YYYYMMDDHH24MISS'), NULL, NULL, NULL, NULL, 'admin', 'registrada');
  PERFORM public.identity_emit('identity.mark', jsonb_build_object('evento', p_event_id, 'status', p_status));
  RETURN jsonb_build_object('ok', true, 'evento', p_event_id, 'status', p_status);
END$$;

CREATE OR REPLACE FUNCTION public.identity_device_block(p_device_id text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_device_block: somente admin';
  END IF;
  UPDATE public.orion_devices SET bloqueado = true, bloqueado_motivo = coalesce(p_motivo,'bloqueio manual'),
         confianca = 0, updated_at = now()
   WHERE device_id = p_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'identity_device_block: dispositivo % nao existe', p_device_id; END IF;
  PERFORM public.identity_event('dispositivo_bloqueado','dispositivo', 60,
    jsonb_build_object('motivo', coalesce(p_motivo,'bloqueio manual'), 'operador', coalesce(auth.uid()::text,'admin'),
      'nota','acao humana auditada; reversivel via identity_device_unblock'),
    'devblock:'||p_device_id||':'||to_char(now(),'YYYYMMDDHH24MISS'), NULL, NULL, p_device_id, NULL, 'admin', 'registrada');
  PERFORM public.identity_emit('identity.device_block', jsonb_build_object('device', p_device_id));
  RETURN jsonb_build_object('ok', true, 'device', p_device_id, 'bloqueado', true);
END$$;

CREATE OR REPLACE FUNCTION public.identity_device_unblock(p_device_id text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_device_unblock: somente admin';
  END IF;
  UPDATE public.orion_devices SET bloqueado = false, bloqueado_motivo = NULL, updated_at = now()
   WHERE device_id = p_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'identity_device_unblock: dispositivo % nao existe', p_device_id; END IF;
  PERFORM public.identity_event('dispositivo_desbloqueado','dispositivo', 5,
    jsonb_build_object('motivo', coalesce(p_motivo,'desbloqueio manual'), 'operador', coalesce(auth.uid()::text,'admin')),
    'devunblock:'||p_device_id||':'||to_char(now(),'YYYYMMDDHH24MISS'), NULL, NULL, p_device_id, NULL, 'admin', 'registrada');
  RETURN jsonb_build_object('ok', true, 'device', p_device_id, 'bloqueado', false);
END$$;

-- alteracao de politica: sempre auditada (rollback = aplicar valores "antes" de novo)
CREATE OR REPLACE FUNCTION public.identity_policy_set(
  p_policy_key text, p_min_score int DEFAULT NULL, p_mfa boolean DEFAULT NULL,
  p_ativa boolean DEFAULT NULL, p_acao text DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old record; v_new record;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_policy_set: somente admin';
  END IF;
  SELECT * INTO v_old FROM public.orion_access_policies WHERE policy_key = p_policy_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'identity_policy_set: politica % nao existe', p_policy_key; END IF;
  UPDATE public.orion_access_policies SET
    min_score = coalesce(p_min_score, min_score),
    mfa_obrigatorio = coalesce(p_mfa, mfa_obrigatorio),
    ativa = coalesce(p_ativa, ativa),
    acao = coalesce(p_acao, acao),
    updated_at = now()
  WHERE policy_key = p_policy_key
  RETURNING * INTO v_new;
  PERFORM public.identity_event('politica_alterada','politica', 30,
    jsonb_build_object('politica', p_policy_key, 'motivo', coalesce(p_motivo,'-'),
      'antes', jsonb_build_object('min_score', v_old.min_score, 'mfa', v_old.mfa_obrigatorio, 'ativa', v_old.ativa, 'acao', v_old.acao),
      'depois', jsonb_build_object('min_score', v_new.min_score, 'mfa', v_new.mfa_obrigatorio, 'ativa', v_new.ativa, 'acao', v_new.acao),
      'operador', coalesce(auth.uid()::text,'admin'), 'nota','rollback = reaplicar os valores de ANTES (trilha completa)'),
    'polset:'||p_policy_key||':'||to_char(now(),'YYYYMMDDHH24MISS'), NULL, NULL, NULL, NULL, 'admin', 'registrada');
  PERFORM public.identity_emit('identity.policy_set', jsonb_build_object('politica', p_policy_key));
  RETURN jsonb_build_object('ok', true, 'politica', p_policy_key,
    'antes', jsonb_build_object('min_score', v_old.min_score, 'mfa', v_old.mfa_obrigatorio, 'ativa', v_old.ativa, 'acao', v_old.acao),
    'depois', jsonb_build_object('min_score', v_new.min_score, 'mfa', v_new.mfa_obrigatorio, 'ativa', v_new.ativa, 'acao', v_new.acao));
END$$;

-- ----------------------------------------------------------------------------
-- 10) validate_identity() — porta oficial de validacao (RPC)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_identity(
  p_user_id uuid, p_session_id uuid DEFAULT NULL, p_device_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p record; v_srs int; v_dcs int; v_dev_block bool; v_acao text; v_pol text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin() AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'validate_identity: somente admin/service ou o proprio usuario';
  END IF;

  SELECT * INTO v_p FROM public.orion_identity_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'identidade ainda nao sincronizada (aguarde o proximo tick)');
  END IF;

  v_srs := coalesce((SELECT max(risk_score) FROM public.orion_access_sessions
                     WHERE user_id = p_user_id AND status = 'ativa'
                       AND (p_session_id IS NULL OR session_id = p_session_id)), 0);
  v_dcs := coalesce((SELECT CASE WHEN p_device_id IS NULL THEN round(avg(confianca))::int ELSE max(confianca) END
                     FROM public.orion_devices
                     WHERE user_id = p_user_id AND (p_device_id IS NULL OR device_id = p_device_id)), 20);
  v_dev_block := coalesce((SELECT bool_or(bloqueado) FROM public.orion_devices
                           WHERE user_id = p_user_id AND (p_device_id IS NULL OR device_id = p_device_id)), false);

  IF v_p.status = 'bloqueado' OR v_dev_block THEN
    v_acao := 'negar_acesso'; v_pol := 'device_block/perfil bloqueado (aprovacao humana ja dada)';
  ELSIF v_srs >= (SELECT min_score FROM public.orion_access_policies WHERE policy_key='session_high_risk') THEN
    v_acao := 'reautenticacao'; v_pol := 'session_high_risk';
  ELSIF v_p.is_admin AND (SELECT mfa_obrigatorio FROM public.orion_access_policies WHERE policy_key='admin_access')
        AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors m WHERE m.user_id = p_user_id AND m.status='verified') THEN
    v_acao := 'exigir_mfa'; v_pol := 'admin_access (MFA ainda nao adotado — recomendacao DECLARADA)';
  ELSIF v_p.identity_score < (SELECT min_score FROM public.orion_access_policies WHERE policy_key='identity_low_score') THEN
    v_acao := 'revisao_manual'; v_pol := 'identity_low_score';
  ELSIF v_dcs < (SELECT min_score FROM public.orion_access_policies WHERE policy_key='device_unknown') THEN
    v_acao := 'validacao_adicional'; v_pol := 'device_unknown';
  ELSE
    v_acao := 'permitir'; v_pol := 'nenhuma restricao ativa';
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'identity_score', v_p.identity_score,
    'access_trust_score', v_p.access_trust_score,
    'session_risk_score', v_srs,
    'device_confidence_score', v_dcs,
    'nivel_confianca', v_p.nivel_confianca,
    'status', v_p.status,
    'dispositivo_bloqueado', v_dev_block,
    'acao_recomendada', v_acao,
    'politica_aplicada', v_pol,
    'evidencias', v_p.evidencias,
    'nota', 'o AI-42 recomenda; bloqueio/encerramento efetivo exige aprovacao humana pelas politicas');
END$$;

-- ----------------------------------------------------------------------------
-- 11) ESTATISTICAS DIARIAS (rollup idempotente) — inclui MAR e III
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_statistics_rollup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.orion_identity_statistics
    (dia, logins, logins_suspeitos, sessoes_ativas, sessoes_risco_alto, mfa_executado,
     dispositivos_novos, dispositivos_confiaveis, is_medio, ats_medio, srs_medio, dcs_medio, mar, iii, updated_at)
  SELECT current_date,
    (SELECT count(*) FROM public.orion_access_events WHERE tipo='login' AND event_at::date=current_date),
    (SELECT count(*) FROM public.orion_access_events WHERE severity IN ('alta','critica') AND event_at::date=current_date),
    (SELECT count(*) FROM public.orion_access_sessions WHERE status='ativa'),
    (SELECT count(*) FROM public.orion_access_sessions WHERE status='ativa' AND risk_score >= 60),
    (SELECT count(*) FROM public.orion_access_events WHERE tipo='mfa' AND event_at::date=current_date),
    (SELECT count(*) FROM public.orion_devices WHERE first_seen::date=current_date),
    (SELECT count(*) FROM public.orion_devices WHERE confianca >= 70 AND NOT bloqueado),
    (SELECT coalesce(round(avg(identity_score))::int,0) FROM public.orion_identity_profiles),
    (SELECT coalesce(round(avg(access_trust_score))::int,0) FROM public.orion_identity_profiles),
    (SELECT coalesce(round(avg(risk_score))::int,0) FROM public.orion_access_sessions WHERE status='ativa'),
    (SELECT coalesce(round(avg(confianca))::int,0) FROM public.orion_devices),
    (SELECT round(coalesce(count(*) FILTER (WHERE aal='aal2')::numeric / nullif(count(*),0), 0), 4)
       FROM public.orion_access_sessions WHERE status='ativa'),
    (SELECT round(0.35*coalesce((SELECT avg(identity_score) FROM public.orion_identity_profiles),0)
                + 0.25*coalesce((SELECT avg(access_trust_score) FROM public.orion_identity_profiles),0)
                + 0.20*(100 - coalesce((SELECT avg(risk_score) FROM public.orion_access_sessions WHERE status='ativa'),0))
                + 0.20*coalesce((SELECT avg(confianca) FROM public.orion_devices),0))::int),
    now()
  ON CONFLICT (dia) DO UPDATE SET
    logins=excluded.logins, logins_suspeitos=excluded.logins_suspeitos,
    sessoes_ativas=excluded.sessoes_ativas, sessoes_risco_alto=excluded.sessoes_risco_alto,
    mfa_executado=excluded.mfa_executado, dispositivos_novos=excluded.dispositivos_novos,
    dispositivos_confiaveis=excluded.dispositivos_confiaveis, is_medio=excluded.is_medio,
    ats_medio=excluded.ats_medio, srs_medio=excluded.srs_medio, dcs_medio=excluded.dcs_medio,
    mar=excluded.mar, iii=excluded.iii, updated_at=now();
$$;

-- ----------------------------------------------------------------------------
-- 12) PAINEIS (leitura agregada; guarda admin — dados de identidade)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.identity_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_overview: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'is_medio',  (SELECT coalesce(round(avg(identity_score))::int,0) FROM public.orion_identity_profiles),
    'ats_medio', (SELECT coalesce(round(avg(access_trust_score))::int,0) FROM public.orion_identity_profiles),
    'srs_medio', (SELECT coalesce(round(avg(risk_score))::int,0) FROM public.orion_access_sessions WHERE status='ativa'),
    'dcs_medio', (SELECT coalesce(round(avg(confianca))::int,0) FROM public.orion_devices),
    'iii', (SELECT coalesce(iii,0) FROM public.orion_identity_statistics WHERE dia=current_date),
    'mar', (SELECT coalesce(mar,0) FROM public.orion_identity_statistics WHERE dia=current_date),
    'sessoes_ativas', (SELECT count(*) FROM public.orion_access_sessions WHERE status='ativa'),
    'sessoes_risco_alto', (SELECT count(*) FROM public.orion_access_sessions WHERE status='ativa' AND risk_score>=60),
    'mfa_executado_hoje', (SELECT count(*) FROM public.orion_access_events WHERE tipo='mfa' AND event_at::date=current_date),
    'dispositivos', (SELECT count(*) FROM public.orion_devices),
    'dispositivos_bloqueados', (SELECT count(*) FROM public.orion_devices WHERE bloqueado),
    'logins_hoje', (SELECT count(*) FROM public.orion_access_events WHERE tipo='login' AND event_at::date=current_date),
    'tentativas_negadas_hoje', (SELECT count(*) FROM public.orion_access_events WHERE tipo='tentativa_negada' AND event_at::date=current_date),
    'eventos_abertos', (SELECT count(*) FROM public.orion_access_events WHERE status IN ('detectada','em_analise')),
    'usuarios', jsonb_build_object(
      'total', (SELECT count(*) FROM public.orion_identity_profiles),
      'confiaveis', (SELECT count(*) FROM public.orion_identity_profiles WHERE nivel_confianca IN ('alto','medio') AND status='ativo'),
      'em_observacao', (SELECT count(*) FROM public.orion_identity_profiles WHERE status='observacao'),
      'bloqueados', (SELECT count(*) FROM public.orion_identity_profiles WHERE status='bloqueado')),
    'gerado_em', now());
END$$;

CREATE OR REPLACE FUNCTION public.identity_panel(p_secao text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_panel: somente admin';
  END IF;
  RETURN CASE p_secao
  WHEN 'sessoes' THEN jsonb_build_object(
    'ativas', (SELECT count(*) FROM public.orion_access_sessions WHERE status='ativa'),
    'encerradas_7d', (SELECT count(*) FROM public.orion_access_sessions WHERE status='encerrada' AND logout_at > now()-interval '7 days'),
    'expiradas', (SELECT count(*) FROM public.orion_access_sessions WHERE status='expirada'),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'session_id', s.session_id, 'user_id', s.user_id, 'ip', s.ip,
        'navegador', s.navegador, 'sistema', s.sistema_operacional, 'dispositivo', s.device_id,
        'mfa', s.mfa, 'aal', s.aal, 'login_at', s.login_at,
        'horas_ativa', round(extract(epoch FROM (now()-s.login_at))/3600.0, 1),
        'srs', s.risk_score, 'session_score', s.session_score, 'status', s.status,
        'evidencias', s.evidencias) ORDER BY s.risk_score DESC, s.login_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.orion_access_sessions WHERE status='ativa'
            ORDER BY risk_score DESC, login_at DESC LIMIT 40) s))
  WHEN 'dispositivos' THEN jsonb_build_object(
    'total', (SELECT count(*) FROM public.orion_devices),
    'novos_7d', (SELECT count(*) FROM public.orion_devices WHERE first_seen > now()-interval '7 days'),
    'bloqueados', (SELECT count(*) FROM public.orion_devices WHERE bloqueado),
    'confianca_media', (SELECT coalesce(round(avg(confianca))::int,0) FROM public.orion_devices),
    'por_navegador', (SELECT coalesce(jsonb_object_agg(coalesce(navegador,'(desconhecido)'), n),'{}'::jsonb)
      FROM (SELECT navegador, count(*) n FROM public.orion_devices GROUP BY 1) x),
    'por_sistema', (SELECT coalesce(jsonb_object_agg(coalesce(sistema_operacional,'(desconhecido)'), n),'{}'::jsonb)
      FROM (SELECT sistema_operacional, count(*) n FROM public.orion_devices GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'device_id', d.device_id, 'user_id', d.user_id, 'navegador', d.navegador,
        'sistema', d.sistema_operacional, 'first_seen', d.first_seen, 'last_seen', d.last_seen,
        'sessoes', d.sessoes, 'dcs', d.confianca, 'bloqueado', d.bloqueado,
        'motivo_bloqueio', d.bloqueado_motivo, 'evidencias', d.evidencias) ORDER BY d.last_seen DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.orion_devices ORDER BY last_seen DESC LIMIT 40) d))
  WHEN 'identidade' THEN jsonb_build_object(
    'confiaveis', (SELECT count(*) FROM public.orion_identity_profiles WHERE nivel_confianca IN ('alto','medio') AND status='ativo'),
    'em_observacao', (SELECT count(*) FROM public.orion_identity_profiles WHERE status='observacao'),
    'bloqueados', (SELECT count(*) FROM public.orion_identity_profiles WHERE status='bloqueado'),
    'por_nivel', (SELECT coalesce(jsonb_object_agg(nivel_confianca, n),'{}'::jsonb)
      FROM (SELECT nivel_confianca, count(*) n FROM public.orion_identity_profiles GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'tipo', p.tipo_usuario, 'perfis', p.perfis_disponiveis,
        'admin', p.is_admin, 'roles', p.roles, 'nivel', p.nivel_confianca,
        'is', p.identity_score, 'ats', p.access_trust_score, 'status', p.status,
        'evidencias', p.evidencias) ORDER BY p.identity_score ASC), '[]'::jsonb)
      FROM (SELECT * FROM public.orion_identity_profiles ORDER BY identity_score ASC LIMIT 40) p))
  WHEN 'admin' THEN jsonb_build_object(
    'admins', (SELECT count(*) FROM public.orion_identity_profiles WHERE is_admin),
    'sessoes_admin_ativas', (SELECT count(*) FROM public.orion_access_sessions s
      JOIN public.orion_identity_profiles p ON p.user_id=s.user_id AND p.is_admin WHERE s.status='ativa'),
    'alteracoes_permissao_30d', (SELECT count(*) FROM public.orion_access_events
      WHERE tipo='permissao_alterada' AND event_at > now()-interval '30 days'),
    'auditoria', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'event_id', e.event_id, 'tipo', e.tipo, 'user_id', e.user_id, 'severity', e.severity,
        'em', e.event_at, 'evidencias', e.evidencias, 'status', e.status) ORDER BY e.event_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.orion_access_events WHERE categoria='administracao'
            ORDER BY event_at DESC LIMIT 25) e))
  WHEN 'eventos' THEN jsonb_build_object(
    'total_30d', (SELECT count(*) FROM public.orion_access_events WHERE event_at > now()-interval '30 days'),
    'por_tipo', (SELECT coalesce(jsonb_object_agg(tipo, n),'{}'::jsonb)
      FROM (SELECT tipo, count(*) n FROM public.orion_access_events
            WHERE event_at > now()-interval '30 days' GROUP BY 1) x),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'event_id', e.event_id, 'tipo', e.tipo, 'categoria', e.categoria, 'user_id', e.user_id,
        'ip', e.ip, 'severity', e.severity, 'score', e.score, 'status', e.status,
        'origem', e.origem, 'em', e.event_at, 'evidencias', e.evidencias)
        ORDER BY e.event_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.orion_access_events
            WHERE severity IN ('media','alta','critica') OR categoria IN ('administracao','politica')
            ORDER BY event_at DESC LIMIT 30) e))
  WHEN 'politicas' THEN jsonb_build_object(
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'policy_key', p.policy_key, 'descricao', p.descricao, 'perfil', p.perfil, 'acao', p.acao,
        'min_score', p.min_score, 'mfa_obrigatorio', p.mfa_obrigatorio, 'aprovacao', p.aprovacao,
        'ativa', p.ativa, 'updated_at', p.updated_at) ORDER BY p.policy_key), '[]'::jsonb)
      FROM public.orion_access_policies p),
    'alteracoes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'event_id', e.event_id, 'em', e.event_at, 'evidencias', e.evidencias) ORDER BY e.event_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.orion_access_events WHERE tipo='politica_alterada'
            ORDER BY event_at DESC LIMIT 15) e))
  ELSE jsonb_build_object('erro','secao invalida: use sessoes|dispositivos|identidade|admin|eventos|politicas')
  END;
END$$;

CREATE OR REPLACE FUNCTION public.identity_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_metrics: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'identidades', (SELECT count(*) FROM public.orion_identity_profiles),
    'sessoes', (SELECT count(*) FROM public.orion_access_sessions),
    'dispositivos', (SELECT count(*) FROM public.orion_devices),
    'eventos', (SELECT count(*) FROM public.orion_access_events),
    'politicas', (SELECT count(*) FROM public.orion_access_policies WHERE ativa),
    'eventos_bus', (SELECT count(*) FROM public.orion_eventos WHERE origem='identity_access'),
    'estatisticas_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'logins',logins,
        'suspeitos',logins_suspeitos,'sessoes',sessoes_ativas,'risco_alto',sessoes_risco_alto,
        'disp_novos',dispositivos_novos,'is',is_medio,'ats',ats_medio,'srs',srs_medio,'dcs',dcs_medio,
        'mar',mar,'iii',iii) ORDER BY dia DESC),'[]'::jsonb)
      FROM (SELECT * FROM public.orion_identity_statistics ORDER BY dia DESC LIMIT 7) x));
END$$;

CREATE OR REPLACE FUNCTION public.identity_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'identity_summary: somente admin';
  END IF;
  RETURN jsonb_build_object(
    'overview', public.identity_overview(),
    'sessoes', public.identity_panel('sessoes'),
    'dispositivos', public.identity_panel('dispositivos'),
    'identidade', public.identity_panel('identidade'),
    'admin', public.identity_panel('admin'),
    'eventos', public.identity_panel('eventos'),
    'politicas', public.identity_panel('politicas'),
    'metrics', public.identity_metrics(),
    'lacunas', jsonb_build_array(
      'geolocalizacao por IP: sem fonte no banco — "mudanca brusca de localizacao" via proxy troca de IP (DECLARADO)',
      'fingerprint de dispositivo: device_tokens vazia — impressao derivada de user_agent (DECLARADO)',
      'MFA nao adotado na plataforma: mfa_factors=0, MAR=0 REAL — politicas de MFA operam como recomendacao (DECLARADO)',
      'troca de e-mail: GoTrue registra como user_modified generico (DECLARADO)',
      'sessao roubada plena exige telemetria; proxies reais: expirada reutilizada + token em volume anomalo (DECLARADO)',
      'identidade duplicada (doc/tel/dispositivo): coberta pelo AI-41 — AI-42 le orion_fraud_events, nao re-detecta (anti-duplicacao)',
      'integracao AI-40: eventos alta/critica espelhados em orion_cyber_events (identity_bridge_cyber)'));
END$$;

CREATE OR REPLACE FUNCTION public.identity_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.identity_summary();
  PERFORM public.identity_emit('identity.score', jsonb_build_object('is_medio', v->'overview'->'is_medio', 'iii', v->'overview'->'iii'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 13) TICK */2 (motor incremental: audit -> sessoes -> detectores -> identidades -> politica -> rollup)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_identity_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.identity_ingest_audit();
  PERFORM public.identity_sync_sessions();
  PERFORM public.identity_detect();
  PERFORM public.identity_sync_profiles();
  PERFORM public.identity_respond();
  PERFORM public.identity_statistics_rollup();
END$$;

-- ----------------------------------------------------------------------------
-- 14) POLITICAS SEED (identity_politica_v1)
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_access_policies (policy_key, descricao, perfil, acao, min_score, mfa_obrigatorio, aprovacao) VALUES
  ('identity_low_score','Identity Score abaixo do minimo aciona revisao manual da identidade','todos','revisao_manual',40,false,'automatica'),
  ('session_high_risk','Session Risk Score >= limiar recomenda reautenticacao imediata','todos','reautenticacao',80,false,'automatica'),
  ('admin_access','Acesso administrativo: score minimo 70 + MFA (recomendacao enquanto MFA nao for adotado — DECLARADO)','admin','exigir_mfa',70,true,'automatica'),
  ('device_unknown','Dispositivo com confianca (DCS) abaixo do limiar pede validacao adicional','todos','validacao_adicional',40,false,'automatica'),
  ('device_block','Bloqueio/desbloqueio de dispositivo: SEMPRE acao humana auditada e reversivel','todos','bloquear_dispositivo',0,false,'humana'),
  ('privilege_elevation','Elevacao temporaria de privilegio: justificativa + prazo + auditoria; concessao humana','admin','elevacao_temporaria',70,true,'humana')
ON CONFLICT (policy_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 15) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.identity_sync_sessions()                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_ingest_audit()                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_sync_profiles()                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_detect()                                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_respond()                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_mark(bigint,text,text)                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_device_block(text,text)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_device_unblock(text,text)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_policy_set(text,int,boolean,boolean,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_identity(uuid,uuid,text)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_statistics_rollup()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_overview()                                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_panel(text)                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_metrics()                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_summary()                                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.identity_dashboard()                                  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 16) PROMPT REGISTRY (5 prompts GPT-5-mini via AI-00 Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('identity.explain_suspicious',
 'Voce e o ORION Identity & Access (AI-42). Explique o acesso suspeito usando SOMENTE as evidencias fornecidas (IPs, navegadores, horarios, contagens). Diga o que foi observado, por que dispara o padrao e o que verificar. Nunca acuse sem evidencia. Portugues claro para operacao.',
 'ORION-AI-42 seed');
SELECT public.orion_ai_prompt_set('identity.explain_block',
 'Voce e o ORION Identity & Access (AI-42). Explique por que o bloqueio (usuario ou dispositivo) foi recomendado/aplicado, citando as evidencias e a politica. Deixe claro que bloqueios efetivos sao decisao humana auditada e reversivel.',
 'ORION-AI-42 seed');
SELECT public.orion_ai_prompt_set('identity.explain_mfa',
 'Voce e o ORION Identity & Access (AI-42). Explique por que o MFA esta sendo exigido/recomendado neste acesso (perfil administrativo, risco da sessao, politica aplicada). A plataforma ainda nao adotou MFA (MAR=0) — deixe claro quando for recomendacao.',
 'ORION-AI-42 seed');
SELECT public.orion_ai_prompt_set('identity.explain_trust_change',
 'Voce e o ORION Identity & Access (AI-42). Explique a mudanca de confianca (Identity Score / nivel) comparando os componentes de ANTES e DEPOIS presentes nas evidencias. Cite apenas numeros fornecidos; nunca invente historico.',
 'ORION-AI-42 seed');
SELECT public.orion_ai_prompt_set('identity.report',
 'Voce e o ORION Identity & Access (AI-42). Gere um relatorio executivo de identidade do periodo: logins, suspeitos, sessoes e riscos, dispositivos novos/confiaveis, IS/ATS/SRS/DCS, MAR e III. Somente numeros fornecidos; lacunas declaradas devem ser mencionadas como tais.',
 'ORION-AI-42 seed');

-- ----------------------------------------------------------------------------
-- 17) MODEL PREF + CRON */2
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('identity_access','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_identity_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_identity_tick');
    PERFORM cron.schedule('orion_identity_tick','*/2 * * * *','SELECT public.orion_identity_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_identity_tick');
--   DROP FUNCTION IF EXISTS public.orion_identity_tick, public.identity_dashboard, public.identity_summary,
--     public.identity_metrics, public.identity_panel(text), public.identity_overview,
--     public.identity_statistics_rollup, public.validate_identity(uuid,uuid,text),
--     public.identity_policy_set(text,int,boolean,boolean,text,text),
--     public.identity_device_unblock(text,text), public.identity_device_block(text,text),
--     public.identity_mark(bigint,text,text), public.identity_bridge_cyber, public.identity_respond,
--     public.identity_detect, public.identity_sync_profiles, public.identity_ingest_audit,
--     public.identity_sync_sessions,
--     public.identity_event(text,text,bigint,jsonb,text,uuid,uuid,text,text,text,text,timestamptz),
--     public.identity_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_identity_statistics, public.orion_access_policies,
--     public.orion_access_events, public.orion_devices, public.orion_access_sessions,
--     public.orion_identity_profiles;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='identity_access';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'identity.%';
--   DELETE FROM public.orion_cyber_events WHERE dedupe_key LIKE 'identity:%';
-- ============================================================================
