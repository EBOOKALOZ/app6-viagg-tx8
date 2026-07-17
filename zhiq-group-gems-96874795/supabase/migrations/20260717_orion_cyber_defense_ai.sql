-- ============================================================================
-- ORION-AI-40 — CYBER DEFENSE AI v1.0  (abre o ORION Security Ecosystem)
-- ============================================================================
-- Inteligencia oficial de DEFESA CIBERNETICA do ORION. Monitora a infra,
--   detecta comportamento malicioso, correlaciona eventos de seguranca e
--   RECOMENDA resposta proporcional — sempre baseada em EVIDENCIA e POLITICA.
--   Nenhuma acao critica ocorre sem registro. NUNCA bloqueia sozinho: acoes
--   automatizadas seguem politica + aprovacao e sao reversiveis (rollback).
--
-- ANTI-COLISAO (regra congelada do ORION):
--   * AI-24 "Security AI" JA existe: tabelas orion_security_alerts/config,
--     funcoes sec_*, cron orion_security_tick, painel /admin/orion-security,
--     chave 'security'. NADA disso e tocado aqui.
--   * AI-40 usa namespace PROPRIO: prefixo orion_cyber_*, funcoes cyber_* +
--     detect_security_threats(), chave 'cyber_defense', cron orion_cyber_tick,
--     painel /admin/orion-cyber-defense, edge cyber-defense-engine.
--   Mapa spec->real: orion_security_events=orion_cyber_events,
--     orion_security_alerts(AI-40)=orion_cyber_alerts, orion_blocked_entities=
--     orion_cyber_blocked_entities, orion_security_statistics=orion_cyber_statistics,
--     orion_security_actions=orion_cyber_actions.
--
-- FONTES REAIS (100% read-only): orion_ai_log (Gateway: erros/retries/tokens/
--   task -> abuso de API, prompt injection/jailbreak/flood de tokens), auth.
--   audit_log_entries (brute force/credential stuffing/signup repetido/recovery;
--   ip_address e VARCHAR, nao inet), client_errors (assinaturas web XSS/SQLi/
--   path traversal + bots por user_agent), orion_eventos (pico/DDoS proxy),
--   orion_trust_alerts (fraude), marketplace_product_click_events (scraping/bot).
--   LACUNAS DECLARADAS (exigem instrumentacao/WAF): IP real por request, corpo
--   de request, geo por IP, fingerprint. Nunca inventadas — marcadas 'declarado'.
--
-- Idempotente / auditavel. SECURITY DEFINER + guarda admin/service.
-- Auditoria IMUTAVEL: orion_cyber_events/actions sem UPDATE/DELETE direto.
-- ROLLBACK ao fim. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------

-- 1.1 EVENTOS de seguranca (append-only; base comum do ecossistema)
CREATE TABLE IF NOT EXISTS public.orion_cyber_events (
  event_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key   text        NOT NULL,          -- idempotencia por janela/origem
  timestamp    timestamptz NOT NULL DEFAULT now(),
  origem       text        NOT NULL,          -- fonte real (orion_ai_log, auth, ...)
  tipo         text        NOT NULL,          -- categoria de ataque
  severidade   text        NOT NULL DEFAULT 'baixa',  -- baixa|media|alta|critica
  ip           text,                          -- declarado quando nao instrumentado
  user_id      uuid,
  visitor_id   text,
  endpoint     text,
  metodo       text,
  modulo       text,
  descricao    text        NOT NULL,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  confianca    integer     NOT NULL DEFAULT 0,        -- Attack Confidence (0-100)
  score        integer     NOT NULL DEFAULT 0,        -- score de risco do evento
  status       text        NOT NULL DEFAULT 'novo',   -- novo|investigando|mitigado|falso_positivo|resolvido
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_cyber_events_dedupe_uq UNIQUE (dedupe_key)
);
COMMENT ON TABLE public.orion_cyber_events IS
  'ORION-AI-40: eventos de seguranca detectados (base do Security Ecosystem). Append-only/imutavel; status muda so via RPC. Evidencia obrigatoria; IP declarado se nao instrumentado.';
CREATE INDEX IF NOT EXISTS ix_cyber_events_ts    ON public.orion_cyber_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS ix_cyber_events_tipo  ON public.orion_cyber_events (tipo);
CREATE INDEX IF NOT EXISTS ix_cyber_events_sev   ON public.orion_cyber_events (severidade);
CREATE INDEX IF NOT EXISTS ix_cyber_events_stat  ON public.orion_cyber_events (status);

-- 1.2 ALERTAS (agregacao priorizada; idempotente por categoria/entidade/dia)
CREATE TABLE IF NOT EXISTS public.orion_cyber_alerts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alerta       text        NOT NULL,
  prioridade   text        NOT NULL DEFAULT 'media',  -- baixa|media|alta|critica
  score        integer     NOT NULL DEFAULT 0,        -- Risk Score do alerta
  categoria    text        NOT NULL,
  entidade     text        NOT NULL DEFAULT 'plataforma',
  recomendacao text        NOT NULL,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  confianca    integer     NOT NULL DEFAULT 0,
  responsavel  text,
  resolvido    boolean     NOT NULL DEFAULT false,
  resolved_at  timestamptz,
  dia          date        NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Cuiaba')::date),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_cyber_alerts_uq UNIQUE (categoria, entidade, dia)
);
COMMENT ON TABLE public.orion_cyber_alerts IS
  'ORION-AI-40: alertas priorizados (1/categoria/entidade/dia). Recomenda acao; NUNCA executa sozinho. Distinto de orion_security_alerts do AI-24.';
CREATE INDEX IF NOT EXISTS ix_cyber_alerts_prio ON public.orion_cyber_alerts (prioridade, created_at DESC);

-- 1.3 ENTIDADES BLOQUEADAS (bloqueio TEMPORARIO com expiracao + rollback)
CREATE TABLE IF NOT EXISTS public.orion_cyber_blocked_entities (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo         text        NOT NULL,          -- ip|user|token|fingerprint
  valor        text        NOT NULL,
  motivo       text        NOT NULL,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  aplicado_por text        NOT NULL DEFAULT 'cyber_defense',
  ativo        boolean     NOT NULL DEFAULT true,
  expiracao    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
COMMENT ON TABLE public.orion_cyber_blocked_entities IS
  'ORION-AI-40: bloqueios temporarios (ip/user/token/fingerprint) reversiveis. Aplicados so por RPC sob politica; nunca permanentes sem revisao.';
CREATE INDEX IF NOT EXISTS ix_cyber_blocked_ativo ON public.orion_cyber_blocked_entities (ativo, tipo);

-- 1.4 ESTATISTICAS diarias (rollup)
CREATE TABLE IF NOT EXISTS public.orion_cyber_statistics (
  data              date        PRIMARY KEY,
  ataques           integer     NOT NULL DEFAULT 0,
  bloqueios         integer     NOT NULL DEFAULT 0,
  falsos_positivos  integer     NOT NULL DEFAULT 0,
  latencia_ms       integer     NOT NULL DEFAULT 0,
  score_medio       integer     NOT NULL DEFAULT 0,
  disponibilidade   numeric(5,2) NOT NULL DEFAULT 100,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_cyber_statistics IS 'ORION-AI-40: estatisticas diarias de seguranca (ataques/bloqueios/FPR/latencia/score/disponibilidade).';

-- 1.5 ACOES (auditoria IMUTAVEL de toda resposta automatizada)
CREATE TABLE IF NOT EXISTS public.orion_cyber_actions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  acao               text        NOT NULL,   -- alerta|monitorar|bloquear_ip|revogar_sessao|invalidar_token|exigir_mfa|reduzir_rate|isolar_recurso
  alvo               text,
  motivo             text        NOT NULL,
  ia_responsavel     text        NOT NULL DEFAULT 'cyber_defense',
  politica_aplicada  text        NOT NULL DEFAULT 'alerta',
  resultado          text        NOT NULL DEFAULT 'registrada',
  evidencias         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rollback_disponivel boolean    NOT NULL DEFAULT true,
  rolled_back        boolean     NOT NULL DEFAULT false,
  ref_event_id       bigint,
  ref_block_id       bigint,
  created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_cyber_actions IS 'ORION-AI-40: log IMUTAVEL de acoes de defesa (motivo/politica/resultado/rollback). Sem UPDATE/DELETE direto — auditoria permanente.';
CREATE INDEX IF NOT EXISTS ix_cyber_actions_ts ON public.orion_cyber_actions (created_at DESC);

-- 1.6 POLITICAS por categoria (resposta configuravel; acao critica exige aprovacao)
CREATE TABLE IF NOT EXISTS public.orion_cyber_policies (
  categoria    text        PRIMARY KEY,
  modo         text        NOT NULL DEFAULT 'alerta',  -- alerta|monitorar|aprovacao|bloquear
  limiar       integer     NOT NULL DEFAULT 5,
  monitorado   boolean     NOT NULL DEFAULT true,
  critico      boolean     NOT NULL DEFAULT false,     -- true => exige aprovacao (nunca auto)
  descricao    text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_cyber_policies IS 'ORION-AI-40: politica de resposta por categoria. modo=alerta(padrao)|monitorar|aprovacao|bloquear. critico=true nunca executa sozinho.';

-- 1.7 ESTADO (watermark p/ processamento incremental — "somente eventos novos")
CREATE TABLE IF NOT EXISTS public.orion_cyber_state (
  chave      text        PRIMARY KEY,
  last_ts    timestamptz NOT NULL DEFAULT (now() - interval '24 hours'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_cyber_state IS 'ORION-AI-40: marcadores de processamento incremental por fonte (nunca reprocessa historico completo).';

-- ----------------------------------------------------------------------------
-- 2) RLS — leitura admin; escrita so via RPC SECURITY DEFINER
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_cyber_events','orion_cyber_alerts','orion_cyber_blocked_entities',
                           'orion_cyber_statistics','orion_cyber_actions','orion_cyber_policies','orion_cyber_state'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

-- Auditoria imutavel: sem UPDATE/DELETE direto em events/actions (so o owner via DEFINER)
REVOKE UPDATE, DELETE ON public.orion_cyber_events  FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.orion_cyber_actions FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cyber_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'cyber_defense', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- helper de guarda (admin ou service/postgres)
CREATE OR REPLACE FUNCTION public.cyber_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'cyber: acesso negado (somente admin/service)';
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — detect_security_threats(): detecta incrementalmente e registra
--    eventos + alerts + rollup de statistics. Idempotente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_security_threats(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_trace text := coalesce(p_trace, 'cyb_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_ev int := 0; v_al int := 0; v_x int;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_wm timestamptz;
BEGIN
  PERFORM public.cyber_guard();

  -- watermark (processa somente o novo; default ultimas 24h)
  SELECT last_ts INTO v_wm FROM public.orion_cyber_state WHERE chave='detect';
  IF v_wm IS NULL THEN v_wm := now() - interval '24 hours'; END IF;

  -- ===== EVENTOS (append-only, dedupe por janela) ==========================

  -- (E1) ABUSO DE API / FLOOD — erros e retries no Gateway (orion_ai_log)
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'api_abuse:'||module||':'||to_char(v_hoje,'YYYYMMDD'),
         'orion_ai_log', 'api_abuse',
         CASE WHEN err >= 30 THEN 'alta' WHEN err >= 10 THEN 'media' ELSE 'baixa' END,
         module, module||': '||err||' erros de IA em 24h (abuso/flood de API)',
         jsonb_build_object('erros_24h',err,'retries_24h',rtr,'chamadas_24h',tot),
         80, least(100, err*6)
  FROM (
    SELECT module,
           count(*) FILTER (WHERE status <> 'ok') err,
           coalesce(sum(retries),0) rtr, count(*) tot
    FROM public.orion_ai_log WHERE criado_em > now()-interval '24 hours' GROUP BY module
  ) a WHERE err >= 10
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, descricao=excluded.descricao,
    evidencias=excluded.evidencias, score=excluded.score, timestamp=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_ev := v_ev + v_x;

  -- (E2) AMEACAS CONTRA IA — prompt injection / jailbreak / flood de tokens (orion_ai_log)
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'ai_threat:'||to_char(v_hoje,'YYYYMMDD'),
         'orion_ai_log', 'ai_threat',
         CASE WHEN sus >= 10 THEN 'alta' WHEN sus >= 3 THEN 'media' ELSE 'baixa' END,
         'gateway', sus||' interacao(oes) de IA com sinais de prompt injection/jailbreak/flood de tokens',
         jsonb_build_object('suspeitas_24h',sus,'tokens_out_max',tmax,
           'heuristica','erro/task com termos ignore|jailbreak|system prompt|reveal + tokens_out anomalos',
           'nota_declarada','deteccao por logs do Gateway; corpo do prompt nao e persistido — cobertura declarada'),
         65, least(100, sus*12)
  FROM (
    SELECT count(*) sus, coalesce(max(tokens_out),0) tmax FROM public.orion_ai_log
    WHERE criado_em > now()-interval '24 hours'
      AND ( lower(coalesce(erro,'')) ~ '(ignore|jailbreak|system prompt|prompt leak|reveal|bypass)'
         OR lower(coalesce(task,'')) ~ '(ignore previous|jailbreak|system prompt|reveal|bypass)'
         OR tokens_out > 8000 )
  ) a WHERE sus > 0
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, descricao=excluded.descricao,
    evidencias=excluded.evidencias, score=excluded.score, timestamp=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_ev := v_ev + v_x;

  -- (E3) AUTENTICACAO — brute force / credential stuffing / signup repetido (auth.audit_log_entries)
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'auth_abuse:'||to_char(v_hoje,'YYYYMMDD'),
         'auth.audit_log_entries', 'auth_attack',
         CASE WHEN (falhas+rep) >= 30 THEN 'alta' WHEN (falhas+rep) >= 8 THEN 'media' ELSE 'baixa' END,
         'auth', 'Sinais de brute force/credential stuffing/signup repetido',
         jsonb_build_object('login_falhas_24h',falhas,'signups_repetidos_7d',rep,'recovery_7d',rec,
           'ips_instrumentados',ips,'nota_declarada','ip_address de auth pouco instrumentado; correlacao por IP declarada'),
         75, least(100, (falhas+rep)*4)
  FROM (
    SELECT
      count(*) FILTER (WHERE payload->>'action' IN ('login_failed','user_invalid_credentials') AND created_at > now()-interval '24 hours') falhas,
      count(*) FILTER (WHERE payload->>'action'='user_repeated_signup' AND created_at > now()-interval '7 days') rep,
      count(*) FILTER (WHERE payload->>'action'='user_recovery_requested' AND created_at > now()-interval '7 days') rec,
      count(*) FILTER (WHERE coalesce(ip_address::text,'') <> '' AND created_at > now()-interval '7 days') ips
    FROM auth.audit_log_entries
  ) a WHERE (falhas+rep) >= 5
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, evidencias=excluded.evidencias, score=excluded.score, timestamp=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_ev := v_ev + v_x;

  -- (E4) ATAQUE WEB — assinaturas (XSS/SQLi/path traversal) em client_errors
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score, endpoint)
  SELECT 'web_attack:'||to_char(v_hoje,'YYYYMMDD'),
         'client_errors', 'web_attack',
         CASE WHEN hits >= 10 THEN 'alta' WHEN hits >= 3 THEN 'media' ELSE 'baixa' END,
         'web', hits||' indicio(s) de payload malicioso (SQLi/XSS/path traversal) em erros de cliente',
         jsonb_build_object('indicios_24h',hits,'exemplos',ex,
           'nota_declarada','assinaturas detectadas no que aflora em client_errors; sem WAF/corpo de request — cobertura declarada'),
         55, least(100, hits*10), (SELECT max(url) FROM public.client_errors WHERE created_at > now()-interval '24 hours')
  FROM (
    SELECT count(*) hits,
           (array_agg(left(coalesce(message,url,''),120)))[1:3] ex
    FROM public.client_errors
    WHERE created_at > now()-interval '24 hours'
      AND lower(coalesce(message,'')||' '||coalesce(url,'')||' '||coalesce(stack,''))
          ~ '(union\s+select|<script|onerror=|javascript:|\.\./\.\.|/etc/passwd|drop\s+table|--\s|;\s*shutdown|xp_cmdshell)'
  ) a WHERE hits > 0
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, descricao=excluded.descricao,
    evidencias=excluded.evidencias, score=excluded.score, timestamp=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_ev := v_ev + v_x;

  -- (E5) BOTS / SCRAPING — volume anomalo por anon_id (marketplace_product_click_events)
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, visitor_id, modulo, descricao, evidencias, confianca, score)
  SELECT 'bot_scraping:'||anon||':'||to_char(v_hoje,'YYYYMMDD'),
         'marketplace_product_click_events', 'bot_scraping',
         CASE WHEN n >= 200 THEN 'alta' WHEN n >= 80 THEN 'media' ELSE 'baixa' END,
         anon, 'marketplace', 'Visitante anonimo com '||n||' cliques/24h (scraping/automacao provavel)',
         jsonb_build_object('cliques_24h',n,'produtos',prods,'cidade',cidade),
         60, least(100, (n/2))
  FROM (
    SELECT anon_id anon, count(*) n, count(DISTINCT product_id) prods, max(city) cidade
    FROM public.marketplace_product_click_events
    WHERE anon_id IS NOT NULL AND created_at > now()-interval '24 hours'
    GROUP BY anon_id HAVING count(*) >= 80
  ) a
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, descricao=excluded.descricao,
    evidencias=excluded.evidencias, score=excluded.score, timestamp=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_ev := v_ev + v_x;

  -- (E6) PICO DE EVENTOS — DDoS/flood proxy (orion_eventos)
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'event_spike:'||to_char(v_hoje,'YYYYMMDD'),
         'orion_eventos', 'ddos_flood',
         CASE WHEN e24 > media*4 THEN 'alta' ELSE 'media' END,
         'eventbus', 'Volume de eventos ('||e24||') acima de 2x a media diaria ('||media||')',
         jsonb_build_object('eventos_24h',e24,'media_diaria_7d',media),
         70, least(100, round(e24*100.0/nullif(media*2,0))::int)
  FROM (SELECT count(*) FILTER (WHERE criado_em > now()-interval '24 hours') e24, greatest(round(count(*)/7.0),1) media
        FROM public.orion_eventos WHERE criado_em > now()-interval '7 days') a
  WHERE media > 5 AND e24 > media*2
  ON CONFLICT (dedupe_key) DO UPDATE SET severidade=excluded.severidade, descricao=excluded.descricao,
    evidencias=excluded.evidencias, score=excluded.score, timestamp=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_ev := v_ev + v_x;

  -- (E7) FRAUDE — correlacao com Trust AI (orion_trust_alerts)
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'fraud_corr:'||to_char(v_hoje,'YYYYMMDD'),
         'orion_trust_alerts', 'fraud',
         'alta', 'fraude', fa||' alerta(s) de fraude/anomalia do Trust AI correlacionados a seguranca',
         jsonb_build_object('trust_alertas_14d',fa),
         85, least(100, fa*25)
  FROM (SELECT count(*) fa FROM public.orion_trust_alerts WHERE dia > v_hoje - 14) a
  WHERE fa > 0
  ON CONFLICT (dedupe_key) DO UPDATE SET descricao=excluded.descricao, evidencias=excluded.evidencias, score=excluded.score, timestamp=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_ev := v_ev + v_x;

  -- ===== ALERTAS (1 por categoria/entidade/dia, a partir dos eventos abertos) =====
  INSERT INTO public.orion_cyber_alerts (alerta, prioridade, score, categoria, entidade, recomendacao, evidencias, confianca, dia, updated_at)
  SELECT
    'Atividade suspeita: '||tipo,
    CASE WHEN max_sev='critica' THEN 'critica' WHEN max_sev='alta' THEN 'alta' WHEN max_sev='media' THEN 'media' ELSE 'baixa' END,
    least(100, max_score), tipo, coalesce(modulo,'plataforma'),
    CASE tipo
      WHEN 'api_abuse'    THEN 'Revisar uso do Gateway; considerar reduzir rate limit da origem (politica).'
      WHEN 'ai_threat'    THEN 'Reforcar filtro de prompt no Gateway; revisar interacoes suspeitas.'
      WHEN 'auth_attack'  THEN 'Exigir MFA/cooldown para a origem; investigar tentativas de login.'
      WHEN 'web_attack'   THEN 'Bloquear origem temporariamente (aprovacao) e revisar endpoint alvo.'
      WHEN 'bot_scraping' THEN 'Aplicar rate limit/captcha ao visitante; monitorar reincidencia.'
      WHEN 'ddos_flood'   THEN 'Ativar protecao de taxa; investigar pico de eventos.'
      WHEN 'fraud'        THEN 'Escalar ao Trust/Automation; revisar entidades sinalizadas.'
      ELSE 'Investigar e aplicar politica configurada.' END,
    jsonb_build_object('eventos',cnt,'severidade_max',max_sev),
    max_conf, v_hoje, now()
  FROM (
    SELECT tipo, modulo, count(*) cnt, max(score) max_score, max(confianca) max_conf,
      CASE WHEN bool_or(severidade='critica') THEN 'critica'
           WHEN bool_or(severidade='alta')    THEN 'alta'
           WHEN bool_or(severidade='media')   THEN 'media'
           ELSE 'baixa' END max_sev
    FROM public.orion_cyber_events
    WHERE timestamp::date = v_hoje AND status NOT IN ('resolvido','falso_positivo')
    GROUP BY tipo, modulo
  ) g
  ON CONFLICT (categoria, entidade, dia) DO UPDATE SET
    prioridade=excluded.prioridade, score=excluded.score, recomendacao=excluded.recomendacao,
    evidencias=excluded.evidencias, confianca=excluded.confianca, updated_at=now();
  GET DIAGNOSTICS v_x = ROW_COUNT; v_al := v_al + v_x;

  -- ===== ROLLUP diario de estatisticas =====
  INSERT INTO public.orion_cyber_statistics (data, ataques, bloqueios, falsos_positivos, latencia_ms, score_medio, disponibilidade, atualizado_em)
  SELECT v_hoje,
    (SELECT count(*) FROM public.orion_cyber_events WHERE timestamp::date=v_hoje),
    (SELECT count(*) FROM public.orion_cyber_blocked_entities WHERE created_at::date=v_hoje),
    (SELECT count(*) FROM public.orion_cyber_events WHERE timestamp::date=v_hoje AND status='falso_positivo'),
    (SELECT coalesce(round(avg(duracao_ms))::int,0) FROM public.orion_ai_log WHERE criado_em::date=v_hoje),
    (SELECT coalesce(round(avg(score))::int,0) FROM public.orion_cyber_events WHERE timestamp::date=v_hoje),
    (SELECT round(100 - least(100, count(*) FILTER (WHERE status<>'ok')*1.0), 2) FROM public.orion_ai_log WHERE criado_em::date=v_hoje),
    now()
  ON CONFLICT (data) DO UPDATE SET ataques=excluded.ataques, bloqueios=excluded.bloqueios,
    falsos_positivos=excluded.falsos_positivos, latencia_ms=excluded.latencia_ms,
    score_medio=excluded.score_medio, disponibilidade=excluded.disponibilidade, atualizado_em=now();

  -- avanca watermark
  INSERT INTO public.orion_cyber_state (chave, last_ts, updated_at) VALUES ('detect', now(), now())
  ON CONFLICT (chave) DO UPDATE SET last_ts=now(), updated_at=now();

  PERFORM public.cyber_emit('cyber.scan', jsonb_build_object('eventos',v_ev,'alertas',v_al,'trace',v_trace));
  IF v_al > 0 THEN PERFORM public.cyber_emit('cyber.alert', jsonb_build_object('alertas',v_al)); END IF;
  RETURN jsonb_build_object('ok',true,'eventos',v_ev,'alertas',v_al,'trace',v_trace,'dia',v_hoje);
END$$;
GRANT EXECUTE ON FUNCTION public.detect_security_threats(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5) SCORES — TS / RS / SH / AC (0-100, explicaveis)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cyber_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT count(*) tot,
      count(*) FILTER (WHERE severidade IN ('alta','critica')) crit,
      count(*) FILTER (WHERE status NOT IN ('resolvido','falso_positivo')) abertos,
      coalesce(round(avg(score))::int,0) score_medio,
      coalesce(round(avg(confianca))::int,0) conf
    FROM public.orion_cyber_events WHERE timestamp > now()-interval '24 hours'
  ),
  disp AS (SELECT coalesce(disponibilidade,100) d FROM public.orion_cyber_statistics WHERE data=(now() AT TIME ZONE 'America/Cuiaba')::date)
  SELECT jsonb_build_object(
    'ts', least(100, (SELECT crit*15 + tot*3 FROM e)),                                    -- Threat Score
    'rs', least(100, (SELECT round(0.6*least(crit*15+tot*3,100) + 0.4*least(abertos*10,100))::int FROM e)), -- Risk Score
    'sh', greatest(0, 100 - least(100, (SELECT crit*12 + abertos*4 FROM e))),             -- Security Health
    'ac', (SELECT conf FROM e),                                                            -- Attack Confidence
    'disponibilidade', coalesce((SELECT d FROM disp),100),
    'formula', 'TS=crit*15+tot*3 · RS=0.6*TS+0.4*abertos · SH=100-(crit*12+abertos*4) · AC=media(confianca) — janela 24h, so evidencia real',
    'base', (SELECT jsonb_build_object('eventos_24h',tot,'criticos_24h',crit,'abertos',abertos,'score_medio',score_medio) FROM e));
$$;
GRANT EXECUTE ON FUNCTION public.cyber_scores() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6) LEITURAS agregadas (dashboard)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cyber_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'scores', public.cyber_scores(),
    'ataques_hoje', (SELECT count(*) FROM public.orion_cyber_events WHERE timestamp::date=(now() AT TIME ZONE 'America/Cuiaba')::date),
    'ataques_24h', (SELECT count(*) FROM public.orion_cyber_events WHERE timestamp > now()-interval '24 hours'),
    'criticos', (SELECT count(*) FROM public.orion_cyber_events WHERE severidade IN ('alta','critica') AND status NOT IN ('resolvido','falso_positivo')),
    'alertas_abertos', (SELECT count(*) FROM public.orion_cyber_alerts WHERE NOT resolvido),
    'bloqueios_ativos', (SELECT count(*) FROM public.orion_cyber_blocked_entities WHERE ativo),
    'gerado_em', now());
$$;
GRANT EXECUTE ON FUNCTION public.cyber_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_attacks()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_tipo', (SELECT coalesce(jsonb_object_agg(tipo, n),'{}'::jsonb) FROM (SELECT tipo, count(*) n FROM public.orion_cyber_events WHERE timestamp > now()-interval '7 days' GROUP BY tipo) x),
    'por_severidade', (SELECT coalesce(jsonb_object_agg(severidade, n),'{}'::jsonb) FROM (SELECT severidade, count(*) n FROM public.orion_cyber_events WHERE timestamp > now()-interval '7 days' GROUP BY severidade) x),
    'por_modulo', (SELECT coalesce(jsonb_object_agg(coalesce(modulo,'(n/d)'), n),'{}'::jsonb) FROM (SELECT modulo, count(*) n FROM public.orion_cyber_events WHERE timestamp > now()-interval '7 days' GROUP BY modulo) x));
$$;
GRANT EXECUTE ON FUNCTION public.cyber_attacks() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_realtime()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'ultimos', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.timestamp DESC),'[]'::jsonb)
       FROM (SELECT event_id, timestamp, tipo, severidade, modulo, descricao, score, confianca, status
             FROM public.orion_cyber_events ORDER BY timestamp DESC LIMIT 25) x),
    'criticos', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.timestamp DESC),'[]'::jsonb)
       FROM (SELECT event_id, timestamp, tipo, severidade, modulo, descricao, score
             FROM public.orion_cyber_events WHERE severidade IN ('alta','critica') ORDER BY timestamp DESC LIMIT 15) x));
$$;
GRANT EXECUTE ON FUNCTION public.cyber_realtime() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_map()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'por_cidade', (SELECT coalesce(jsonb_object_agg(coalesce(cidade,'(sem)'), n),'{}'::jsonb)
       FROM (SELECT (evidencias->>'cidade') cidade, count(*) n FROM public.orion_cyber_events
             WHERE evidencias ? 'cidade' AND timestamp > now()-interval '30 days' GROUP BY 1) x),
    'nota_declarada', 'Geolocalizacao por IP exige instrumentacao/WAF — DECLARADO. Aqui: cidade quando disponivel na evidencia (ex.: cliques).');
$$;
GRANT EXECUTE ON FUNCTION public.cyber_map() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_ip_intelligence()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'ips_bloqueados', (SELECT coalesce(jsonb_agg(jsonb_build_object('ip',valor,'motivo',motivo,'ativo',ativo,'expira',expiracao)),'[]'::jsonb)
       FROM public.orion_cyber_blocked_entities WHERE tipo='ip'),
    'nota_declarada', 'ASN/pais/historico por IP exigem enriquecimento externo e captura de IP por request — DECLARADO (nao instrumentado hoje).');
$$;
GRANT EXECUTE ON FUNCTION public.cyber_ip_intelligence() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_apis()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'gateway_por_modulo', (SELECT coalesce(jsonb_object_agg(module, jsonb_build_object('chamadas',tot,'erros',err,'retries',rtr)),'{}'::jsonb)
       FROM (SELECT module, count(*) tot, count(*) FILTER (WHERE status<>'ok') err, coalesce(sum(retries),0) rtr
             FROM public.orion_ai_log WHERE criado_em > now()-interval '24 hours' GROUP BY module) x),
    'endpoints_web_suspeitos', (SELECT coalesce(jsonb_agg(jsonb_build_object('endpoint',endpoint,'score',score)),'[]'::jsonb)
       FROM (SELECT endpoint, max(score) score FROM public.orion_cyber_events WHERE tipo='web_attack' AND endpoint IS NOT NULL GROUP BY endpoint LIMIT 10) x),
    'latencia_media_ms', (SELECT coalesce(round(avg(duracao_ms))::int,0) FROM public.orion_ai_log WHERE criado_em > now()-interval '24 hours'));
$$;
GRANT EXECUTE ON FUNCTION public.cyber_apis() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_ai_threats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'eventos_ia', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.timestamp DESC),'[]'::jsonb)
       FROM (SELECT event_id, timestamp, severidade, descricao, evidencias, score FROM public.orion_cyber_events WHERE tipo='ai_threat' ORDER BY timestamp DESC LIMIT 15) x),
    'tokens_flood_24h', (SELECT count(*) FROM public.orion_ai_log WHERE tokens_out > 8000 AND criado_em > now()-interval '24 hours'),
    'nota_declarada', 'Prompt injection/jailbreak inferidos de erro/task + tokens no Gateway; corpo do prompt nao persistido — cobertura declarada.');
$$;
GRANT EXECUTE ON FUNCTION public.cyber_ai_threats() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_users()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  PERFORM public.cyber_guard();
  RETURN jsonb_build_object(
    'login_falhas_24h', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action' IN ('login_failed','user_invalid_credentials') AND created_at > now()-interval '24 hours'),
    'signups_repetidos_7d', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='user_repeated_signup' AND created_at > now()-interval '7 days'),
    'recovery_7d', (SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'action'='user_recovery_requested' AND created_at > now()-interval '7 days'),
    'visitantes_suspeitos', (SELECT coalesce(jsonb_agg(jsonb_build_object('visitor',visitor_id,'score',score,'desc',descricao)),'[]'::jsonb)
       FROM (SELECT visitor_id, score, descricao FROM public.orion_cyber_events WHERE tipo='bot_scraping' ORDER BY score DESC LIMIT 10) x),
    'nota_declarada', 'Sessao/dispositivo por usuario exigem instrumentacao adicional — DECLARADO.');
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_users() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_kpis()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (SELECT count(*) tot, count(*) FILTER (WHERE resolvido) resolv,
                    count(*) FILTER (WHERE resolvido AND resolved_at IS NOT NULL) fechados,
                    coalesce(round(avg(EXTRACT(epoch FROM (resolved_at-created_at))/60) FILTER (WHERE resolved_at IS NOT NULL))::int,0) mttr_min
             FROM public.orion_cyber_alerts WHERE created_at > now()-interval '30 days'),
       fp AS (SELECT count(*) fp, count(*) tot FROM public.orion_cyber_events WHERE timestamp > now()-interval '30 days')
  SELECT (public.cyber_scores()) || jsonb_build_object(
    'fpr', (SELECT CASE WHEN tot>0 THEN round((SELECT fp FROM fp)*100.0/tot) ELSE 0 END FROM fp),
    'mttd', jsonb_build_object('valor','~ tick', 'nota','MTTD = intervalo do cron (1 min): deteccao ocorre no proximo tick — DECLARADO'),
    'mttr_min', (SELECT mttr_min FROM a),
    'alertas_resolvidos_30d', (SELECT resolv FROM a),
    'alertas_total_30d', (SELECT tot FROM a));
$$;
GRANT EXECUTE ON FUNCTION public.cyber_kpis() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_alerts_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY
    CASE a.prioridade WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END DESC, a.created_at DESC),'[]'::jsonb)
  FROM (SELECT id, alerta, prioridade, score, categoria, entidade, recomendacao, evidencias, confianca, resolvido, created_at
        FROM public.orion_cyber_alerts WHERE dia > (now() AT TIME ZONE 'America/Cuiaba')::date - 14) a;
$$;
GRANT EXECUTE ON FUNCTION public.cyber_alerts_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_blocked()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC),'[]'::jsonb)
  FROM (SELECT id, tipo, valor, motivo, ativo, expiracao, created_at FROM public.orion_cyber_blocked_entities ORDER BY created_at DESC LIMIT 100) b;
$$;
GRANT EXECUTE ON FUNCTION public.cyber_blocked() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_statistics_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.data DESC),'[]'::jsonb)
  FROM (SELECT * FROM public.orion_cyber_statistics ORDER BY data DESC LIMIT 30) s;
$$;
GRANT EXECUTE ON FUNCTION public.cyber_statistics_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_actions_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC),'[]'::jsonb)
  FROM (SELECT id, acao, alvo, motivo, ia_responsavel, politica_aplicada, resultado, rollback_disponivel, rolled_back, created_at
        FROM public.orion_cyber_actions ORDER BY created_at DESC LIMIT 100) a;
$$;
GRANT EXECUTE ON FUNCTION public.cyber_actions_list() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_policies_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.categoria),'[]'::jsonb) FROM public.orion_cyber_policies p;
$$;
GRANT EXECUTE ON FUNCTION public.cyber_policies_list() TO authenticated, service_role;

-- explicacao de 1 evento/alerta (contexto p/ IA via Gateway)
CREATE OR REPLACE FUNCTION public.cyber_explain(p_event_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(e) FROM (SELECT event_id, tipo, severidade, modulo, descricao, evidencias, score, confianca, status, timestamp
                           FROM public.orion_cyber_events WHERE event_id=p_event_id) e;
$$;
GRANT EXECUTE ON FUNCTION public.cyber_explain(bigint) TO authenticated, service_role;

-- SUMMARY + DASHBOARD
CREATE OR REPLACE FUNCTION public.cyber_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'overview', public.cyber_overview(), 'attacks', public.cyber_attacks(),
    'ai_threats', public.cyber_ai_threats(), 'apis', public.cyber_apis(),
    'kpis', public.cyber_kpis(), 'map', public.cyber_map());
$$;
GRANT EXECUTE ON FUNCTION public.cyber_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cyber_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.cyber_guard();
  v := jsonb_build_object(
    'overview', public.cyber_overview(),
    'attacks', public.cyber_attacks(),
    'realtime', public.cyber_realtime(),
    'map', public.cyber_map(),
    'ip', public.cyber_ip_intelligence(),
    'users', public.cyber_users(),
    'apis', public.cyber_apis(),
    'ai_threats', public.cyber_ai_threats(),
    'kpis', public.cyber_kpis(),
    'alerts', public.cyber_alerts_list(),
    'blocked', public.cyber_blocked(),
    'statistics', public.cyber_statistics_list(),
    'actions', public.cyber_actions_list(),
    'policies', public.cyber_policies_list(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
  PERFORM public.cyber_emit('cyber.dashboard', jsonb_build_object('ts', v->'overview'->'scores'->'ts'));
  RETURN v;
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_dashboard() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) ACOES (resposta inteligente) — sempre auditada; critico exige aprovacao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cyber_record_action(
  p_acao text, p_alvo text, p_motivo text, p_politica text DEFAULT 'alerta',
  p_resultado text DEFAULT 'registrada', p_evidencias jsonb DEFAULT '{}'::jsonb,
  p_ref_event bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM public.cyber_guard();
  INSERT INTO public.orion_cyber_actions (acao, alvo, motivo, politica_aplicada, resultado, evidencias, ref_event_id)
  VALUES (p_acao, p_alvo, p_motivo, p_politica, p_resultado, coalesce(p_evidencias,'{}'::jsonb), p_ref_event)
  RETURNING id INTO v_id;
  PERFORM public.cyber_emit('cyber.action', jsonb_build_object('acao',p_acao,'alvo',p_alvo,'politica',p_politica));
  RETURN v_id;
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_record_action(text,text,text,text,text,jsonb,bigint) TO authenticated, service_role;

-- bloqueio temporario (reversivel) — categoria critica exige modo!='alerta' na politica
CREATE OR REPLACE FUNCTION public.cyber_block_entity(
  p_tipo text, p_valor text, p_motivo text, p_categoria text DEFAULT NULL,
  p_minutos integer DEFAULT 60, p_evidencias jsonb DEFAULT '{}'::jsonb, p_ref_event bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_block bigint; v_act bigint; v_modo text; v_critico boolean;
BEGIN
  PERFORM public.cyber_guard();
  IF p_tipo NOT IN ('ip','user','token','fingerprint') THEN RAISE EXCEPTION 'tipo invalido: %', p_tipo; END IF;

  -- politica: acao critica so com aprovacao explicita (modo bloquear/aprovacao)
  SELECT modo, critico INTO v_modo, v_critico FROM public.orion_cyber_policies WHERE categoria=coalesce(p_categoria,'');
  IF coalesce(v_critico,false) AND coalesce(v_modo,'alerta') NOT IN ('bloquear','aprovacao') THEN
    RAISE EXCEPTION 'bloqueio negado: categoria % e critica e a politica exige aprovacao (modo atual=%)', p_categoria, coalesce(v_modo,'alerta');
  END IF;

  INSERT INTO public.orion_cyber_blocked_entities (tipo, valor, motivo, evidencias, expiracao)
  VALUES (p_tipo, p_valor, p_motivo, coalesce(p_evidencias,'{}'::jsonb), now() + make_interval(mins => greatest(1,p_minutos)))
  RETURNING id INTO v_block;

  v_act := public.cyber_record_action('bloquear_'||p_tipo, p_valor, p_motivo,
             coalesce(v_modo,'alerta'), 'aplicada', coalesce(p_evidencias,'{}'::jsonb), p_ref_event);
  UPDATE public.orion_cyber_actions SET ref_block_id=v_block WHERE id=v_act;

  RETURN jsonb_build_object('ok',true,'block_id',v_block,'action_id',v_act,'expira_em', now()+make_interval(mins=>greatest(1,p_minutos)));
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_block_entity(text,text,text,text,integer,jsonb,bigint) TO authenticated, service_role;

-- rollback de bloqueio (reverte + registra na auditoria)
CREATE OR REPLACE FUNCTION public.cyber_rollback_block(p_block_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_val text; v_tipo text;
BEGIN
  PERFORM public.cyber_guard();
  UPDATE public.orion_cyber_blocked_entities SET ativo=false, revoked_at=now()
   WHERE id=p_block_id AND ativo RETURNING valor, tipo INTO v_val, v_tipo;
  IF NOT FOUND THEN RAISE EXCEPTION 'bloqueio inexistente ou ja revogado'; END IF;
  UPDATE public.orion_cyber_actions SET rolled_back=true, resultado='revertida' WHERE ref_block_id=p_block_id;
  PERFORM public.cyber_record_action('rollback_bloqueio', v_val, 'reversao manual/politica de bloqueio '||v_tipo, 'rollback', 'revertida', '{}'::jsonb, NULL);
  RETURN jsonb_build_object('ok',true,'revogado',p_block_id);
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_rollback_block(bigint) TO authenticated, service_role;

-- resolver/classificar evento (status) — auditado
CREATE OR REPLACE FUNCTION public.cyber_set_event_status(p_event_id bigint, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.cyber_guard();
  IF p_status NOT IN ('novo','investigando','mitigado','falso_positivo','resolvido') THEN
    RAISE EXCEPTION 'status invalido: %', p_status; END IF;
  UPDATE public.orion_cyber_events SET status=p_status WHERE event_id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento inexistente'; END IF;
  RETURN jsonb_build_object('ok',true,'event_id',p_event_id,'status',p_status);
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_set_event_status(bigint,text) TO authenticated, service_role;

-- resolver alerta — auditado
CREATE OR REPLACE FUNCTION public.cyber_resolve_alert(p_alert_id bigint, p_responsavel text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.cyber_guard();
  UPDATE public.orion_cyber_alerts SET resolvido=true, resolved_at=now(), responsavel=coalesce(p_responsavel,responsavel), updated_at=now()
   WHERE id=p_alert_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'alerta inexistente'; END IF;
  RETURN jsonb_build_object('ok',true,'alert_id',p_alert_id);
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_resolve_alert(bigint,text) TO authenticated, service_role;

-- politica de resposta por categoria
CREATE OR REPLACE FUNCTION public.cyber_set_policy(
  p_categoria text, p_modo text DEFAULT NULL, p_limiar integer DEFAULT NULL,
  p_monitorado boolean DEFAULT NULL, p_critico boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.cyber_guard();
  IF p_modo IS NOT NULL AND p_modo NOT IN ('alerta','monitorar','aprovacao','bloquear') THEN
    RAISE EXCEPTION 'modo invalido: %', p_modo; END IF;
  INSERT INTO public.orion_cyber_policies (categoria, modo, limiar, monitorado, critico)
  VALUES (p_categoria, coalesce(p_modo,'alerta'), coalesce(p_limiar,5), coalesce(p_monitorado,true), coalesce(p_critico,false))
  ON CONFLICT (categoria) DO UPDATE SET
    modo=coalesce(p_modo, orion_cyber_policies.modo),
    limiar=coalesce(p_limiar, orion_cyber_policies.limiar),
    monitorado=coalesce(p_monitorado, orion_cyber_policies.monitorado),
    critico=coalesce(p_critico, orion_cyber_policies.critico),
    atualizado_em=now();
  RETURN jsonb_build_object('ok',true,'categoria',p_categoria);
END$$;
GRANT EXECUTE ON FUNCTION public.cyber_set_policy(text,text,integer,boolean,boolean) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8) POLITICAS default (seed idempotente) — web/auth criticas exigem aprovacao
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_cyber_policies (categoria, modo, limiar, monitorado, critico, descricao) VALUES
  ('api_abuse',   'alerta',    10, true, false, 'Abuso/flood de API no Gateway'),
  ('ai_threat',   'alerta',     3, true, false, 'Prompt injection/jailbreak/flood de tokens'),
  ('auth_attack', 'aprovacao',  5, true, true,  'Brute force/credential stuffing — bloqueio exige aprovacao'),
  ('web_attack',  'aprovacao',  3, true, true,  'SQLi/XSS/path traversal — bloqueio exige aprovacao'),
  ('bot_scraping','alerta',    80, true, false, 'Scraping/automacao por visitante'),
  ('ddos_flood',  'aprovacao', 10, true, true,  'Pico/DDoS — mitigacao exige aprovacao'),
  ('fraud',       'alerta',     1, true, false, 'Fraude correlacionada ao Trust AI')
ON CONFLICT (categoria) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9) PROMPT REGISTRY (5 prompts GPT-5-mini)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('cyber.explain_attack',
 'Voce e o ORION Cyber Defense. Explique de forma tecnica e objetiva um ataque detectado a partir das EVIDENCIAS fornecidas (tipo, severidade, contadores, origem). Nunca invente dados alem da evidencia. Termine com o impacto potencial.',
 'ORION-AI-40 seed');
SELECT public.orion_ai_prompt_set('cyber.explain_risk',
 'Voce e o ORION Cyber Defense. Explique o RISCO agregado da plataforma a partir dos scores (Threat/Risk/Security Health/Attack Confidence) e evidencias. Seja claro sobre o que e medido e o que e declarado (nao instrumentado).',
 'ORION-AI-40 seed');
SELECT public.orion_ai_prompt_set('cyber.explain_false_positive',
 'Voce e o ORION Cyber Defense. Avalie se um evento pode ser FALSO POSITIVO com base nas evidencias e no contexto operacional. Justifique com criterios; recomende reclassificar apenas se a evidencia sustentar.',
 'ORION-AI-40 seed');
SELECT public.orion_ai_prompt_set('cyber.suggest_mitigation',
 'Voce e o ORION Cyber Defense. Sugira mitigacao PROPORCIONAL para um evento (ex.: monitorar, rate limit, MFA, bloqueio temporario com aprovacao). Respeite que acoes criticas exigem aprovacao e sao reversiveis. Nunca recomende acao destrutiva automatica.',
 'ORION-AI-40 seed');
SELECT public.orion_ai_prompt_set('cyber.executive_report',
 'Voce e o ORION Cyber Defense. Gere um relatorio executivo curto da postura de seguranca (ataques, scores, KPIs, acoes) para lideranca nao-tecnica. Baseie-se so nas evidencias; declare lacunas de instrumentacao.',
 'ORION-AI-40 seed');

-- ----------------------------------------------------------------------------
-- 10) MODEL PREF + CRON (tick incremental 1/min; edge cyber-defense-engine tambem)
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('cyber_defense','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orion_cyber_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.detect_security_threats('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;
GRANT EXECUTE ON FUNCTION public.orion_cyber_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_cyber_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_cyber_tick');
    PERFORM cron.schedule('orion_cyber_tick','* * * * *','SELECT public.orion_cyber_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ----------------------------------------------------------------------------
-- 11) VERIFICACAO (esperado: tabelas=7, funcoes>=25, prompts=5, policy=7)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_cyber_%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND (p.proname LIKE 'cyber_%' OR p.proname IN ('detect_security_threats','orion_cyber_tick'))) AS funcoes,
  (SELECT count(*) FROM public.orion_cyber_policies) AS policies;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_cyber_tick');
--   DROP FUNCTION IF EXISTS public.orion_cyber_tick, public.detect_security_threats(text),
--     public.cyber_dashboard, public.cyber_summary, public.cyber_scores, public.cyber_overview,
--     public.cyber_attacks, public.cyber_realtime, public.cyber_map, public.cyber_ip_intelligence,
--     public.cyber_apis, public.cyber_ai_threats, public.cyber_users, public.cyber_kpis,
--     public.cyber_alerts_list, public.cyber_blocked, public.cyber_statistics_list,
--     public.cyber_actions_list, public.cyber_policies_list, public.cyber_explain(bigint),
--     public.cyber_record_action(text,text,text,text,text,jsonb,bigint),
--     public.cyber_block_entity(text,text,text,text,integer,jsonb,bigint),
--     public.cyber_rollback_block(bigint), public.cyber_set_event_status(bigint,text),
--     public.cyber_resolve_alert(bigint,text), public.cyber_set_policy(text,text,integer,boolean,boolean),
--     public.cyber_emit(text,jsonb), public.cyber_guard CASCADE;
--   DROP TABLE IF EXISTS public.orion_cyber_state, public.orion_cyber_policies, public.orion_cyber_actions,
--     public.orion_cyber_statistics, public.orion_cyber_blocked_entities, public.orion_cyber_alerts,
--     public.orion_cyber_events CASCADE;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='cyber_defense';
-- ============================================================================
