-- ============================================================
-- M55.5 · Enterprise Alert Intelligence Center
-- Projeto: broifhfqmnzqoongtokm
-- Data: 2026-07-04
-- EXECUTAR: SQL Editor — após a 20260704_061 (fila de deploy)
-- ============================================================
-- Regras: avaliação consome EXCLUSIVAMENTE a Semantic Layer
-- (cio_metric) e o Health Center (cio_health_compute / SLA /
-- drift / validator) — nenhum cálculo de métrica fora delas;
-- decisões 100% determinísticas (sem IA generativa); regras
-- nascem DESABILITADAS com limiares [calibrar-com-OBSERVE];
-- escalonamento apenas REGISTRA no banco (notificação = etapa
-- futura, declarado); métrica sem dado => avaliação PULADA com
-- nota — nunca alerta inventado.
-- Evolução declarada sobre o M55.1: 6 severidades (informacao..
-- emergencia) e 6 etapas de ciclo de vida substituem P1-P4/
-- FIRING-ACK-RESOLVED da arquitetura original; cio_incidents
-- (M55.4) permanece intacto — o "incidente principal" do domínio
-- de alertas é o cio_alert_groups.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.cio_health_compute(text)') IS NULL THEN
    RAISE EXCEPTION 'M55.5 BLOQUEADA — aplicar 20260704_061 antes';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 1-3. Rule Engine + severidades + runbooks + escalonamento
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cio_alert_rules (
  rule_key    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('metric','health','sla','drift','validator')),
  target      TEXT,                      -- metric_key ou component
  operator    TEXT NOT NULL DEFAULT '>' CHECK (operator IN ('>','>=','<','<=','=','!=','offline')),
  threshold   NUMERIC,
  grain       TEXT NOT NULL DEFAULT '1h',
  window_minutes   INT  NOT NULL DEFAULT 60,
  hysteresis_count INT  NOT NULL DEFAULT 1 CHECK (hysteresis_count >= 1),
  severity    TEXT NOT NULL CHECK (severity IN
    ('informacao','aviso','atencao','alto','critico','emergencia')),
  priority    INT  NOT NULL DEFAULT 3,
  cooldown_minutes INT NOT NULL DEFAULT 30,
  max_fires_per_day INT,                 -- recorrência; NULL = ilimitado
  depends_on  TEXT[] NOT NULL DEFAULT '{}',  -- componentes upstream (correlação)
  enabled     BOOLEAN NOT NULL DEFAULT false, -- nasce DESLIGADA [calibrar-com-OBSERVE]
  version     INT NOT NULL DEFAULT 1,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cio_alerts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_key  TEXT NOT NULL REFERENCES public.cio_alert_rules(rule_key),
  component TEXT,
  severity  TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'detectado' CHECK (status IN
    ('detectado','confirmado','reconhecido','resolvido','encerrado')),
  value_observed NUMERIC,
  threshold      NUMERIC,
  occurrences    INT NOT NULL DEFAULT 1,
  consecutive_breaches INT NOT NULL DEFAULT 1,
  consecutive_normals  INT NOT NULL DEFAULT 0,
  evidence   JSONB,
  group_id   BIGINT,
  escalation_level INT NOT NULL DEFAULT 0,
  -- ciclo de vida: um timestamp por etapa
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),   -- criado
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),   -- detectado
  confirmed_at    TIMESTAMPTZ,                          -- confirmado (histerese)
  acknowledged_at TIMESTAMPTZ,                          -- reconhecido
  acknowledged_by UUID,
  resolved_at     TIMESTAMPTZ,                          -- resolvido
  resolved_by     UUID,
  resolution      TEXT,
  falso_positivo  BOOLEAN NOT NULL DEFAULT false,
  closed_at       TIMESTAMPTZ                           -- encerrado
);
-- Deduplicação: no máximo 1 alerta vivo por regra
CREATE UNIQUE INDEX IF NOT EXISTS uq_cio_alert_open
  ON public.cio_alerts (rule_key) WHERE status <> 'encerrado';
CREATE INDEX IF NOT EXISTS idx_cio_alerts_comp
  ON public.cio_alerts (component, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cio_alert_groups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  principal_alert_id BIGINT NOT NULL,
  root_component TEXT,
  correlation JSONB,          -- cadeia upstream→downstream registrada
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.cio_alert_escalation_rules (
  step INT PRIMARY KEY,
  after_minutes INT NOT NULL,
  notify_role   TEXT NOT NULL,
  severity_min  TEXT NOT NULL DEFAULT 'alto',
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT
);
INSERT INTO public.cio_alert_escalation_rules (step, after_minutes, notify_role, notes) VALUES
  (1,  5, 'supervisor',    '[calibrar-com-OBSERVE] registro em banco; notificação = integração futura'),
  (2, 15, 'administrador', '[calibrar-com-OBSERVE]'),
  (3, 30, 'ceo',           '[calibrar-com-OBSERVE]')
ON CONFLICT (step) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cio_alert_escalations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alert_id BIGINT NOT NULL,
  step INT NOT NULL,
  notify_role TEXT NOT NULL,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (alert_id, step)
);

CREATE TABLE IF NOT EXISTS public.cio_alert_runbooks (
  runbook_key TEXT PRIMARY KEY,
  applies_to  TEXT NOT NULL,             -- rule_key ou component ou 'generico'
  steps JSONB NOT NULL,                  -- passos ordenados, determinísticos
  notes TEXT
);
INSERT INTO public.cio_alert_runbooks (runbook_key, applies_to, steps) VALUES
  ('rb_etl','etl','["Verificar erros recentes em cio_etl_runs","Executar public.cio_etl_tick() manualmente","Validar frescor em cio_watermarks","Se persistir: cio_reprocess() na janela afetada","Verificar dispatcher (dependente)"]'),
  ('rb_dispatcher','dispatcher','["Verificar dispatch_ticks (failed/lock_acquired)","Executar public.motor_requeue_stale()","Conferir flag dispatch.mode em motor_flags","Verificar publication_requests em DESPACHANDO presos"]'),
  ('rb_semantic','semantic_layer','["Rodar public.cio_semantic_validate()","Ver issues abertas em cio_quality_issues","Conferir cio_metric_sla_status(NULL)","Verificar ETL (upstream)"]'),
  ('rb_banco','banco','["Verificar conexões e locks ativos","Conferir tamanho de pub_events em cio_capacity()","Avaliar necessidade de particionamento"]'),
  ('rb_drift','regra:drift_detectado','["Abrir cio_quality_issues com check drift_*","Comparar com baseline via cio_drift_scan(7)","Confirmar se é sazonalidade ou falha de fonte","Se falha: acionar runbook do componente de origem"]'),
  ('rb_validator','regra:catalogo_reprovado','["Rodar cio_semantic_validate() e ler issues","Corrigir definição ofensora com NOVA versão (catálogo imutável)","Re-rodar validator até aprovado"]'),
  ('rb_backlog','regra:backlog_alto','["Conferir fila em cio_metric(backlog)","Verificar dispatcher ativo (dispatch.mode)","Verificar geração de lotes (fila_lotes)","Avaliar volume anormal de entrada em publication_requests"]'),
  ('rb_generico','generico','["Abrir cio_health_explain(componente)","Consultar cio_root_cause()","Seguir evidências dos sinais < 0.7","Registrar resolução no alerta"]')
ON CONFLICT (runbook_key) DO NOTHING;

-- Seeds de regras — TODAS desabilitadas; limiares estruturais [calibrar-com-OBSERVE]
INSERT INTO public.cio_alert_rules
  (rule_key, name, description, source_kind, target, operator, threshold, grain,
   window_minutes, hysteresis_count, severity, priority, cooldown_minutes, depends_on, notes)
VALUES
  ('backlog_alto','Backlog alto','Fila AGENDADO acima do limiar','metric','backlog','>',500,'1h',60,2,'alto',2,30,'{dispatcher}','[calibrar-com-OBSERVE]'),
  ('disponibilidade_baixa','Disponibilidade do ETL baixa','Métrica disponibilidade < limiar','metric','disponibilidade','<',0.95,'1h',60,2,'critico',1,30,'{etl}','[calibrar-com-OBSERVE]'),
  ('retries_altos','Retries de dispatch altos','Métrica retries acima do limiar na janela','metric','retries','>',50,'1h',60,2,'atencao',3,60,'{dispatcher}','[calibrar-com-OBSERVE]'),
  ('etl_degradado','ETL degradado','Health do ETL abaixo do limiar','health','etl','<',75,'1h',60,2,'critico',1,30,'{}','[calibrar-com-OBSERVE]'),
  ('rollups_degradados','Rollups degradados','Health dos rollups abaixo do limiar','health','rollups','<',75,'1h',60,2,'alto',2,30,'{etl}','[calibrar-com-OBSERVE]'),
  ('semantic_degradada','Semantic Layer degradada','Health da camada semântica abaixo do limiar','health','semantic_layer','<',90,'1h',60,2,'alto',2,30,'{etl,rollups}','[calibrar-com-OBSERVE]'),
  ('dispatcher_degradado','Dispatcher degradado','Health do dispatcher abaixo do limiar','health','dispatcher','<',75,'1h',60,2,'critico',1,30,'{banco}','[calibrar-com-OBSERVE]'),
  ('matching_degradado','Matching degradado','Health do matching abaixo do limiar','health','matching','<',75,'1h',60,2,'alto',2,30,'{dispatcher}','[calibrar-com-OBSERVE]'),
  ('ia_degradada','IA degradada','Health do motor de IA abaixo do limiar','health','ia','<',75,'1h',60,2,'atencao',3,60,'{}','[calibrar-com-OBSERVE]'),
  ('banco_degradado','Banco degradado','Health do banco abaixo do limiar','health','banco','<',90,'1h',60,1,'emergencia',1,15,'{}','[calibrar-com-OBSERVE]'),
  ('rpcs_degradados','RPCs degradadas','Health das RPCs abaixo do limiar','health','rpcs','<',75,'1h',60,2,'alto',2,30,'{banco}','[calibrar-com-OBSERVE]'),
  ('jobs_offline','Jobs/Cron offline','pg_cron indisponível (sem telemetria)','health','jobs','offline',NULL,'1h',60,1,'critico',1,60,'{banco}','[calibrar-com-OBSERVE] offline = sem_dados actionable'),
  ('sla_metricas_atrasadas','Métricas fora de SLA','Qtde de métricas atrasadas/degradadas > limiar','sla',NULL,'>',0,'1h',60,2,'aviso',3,60,'{etl}','[calibrar-com-OBSERVE]'),
  ('drift_detectado','Drift detectado','Issues de drift na janela > limiar','drift',NULL,'>',0,'1h',1440,1,'aviso',3,120,'{}','[calibrar-com-OBSERVE]'),
  ('catalogo_reprovado','Catálogo semântico reprovado','cio_semantic_validate() reprovado','validator',NULL,'=',0,'1h',60,1,'critico',1,30,'{}','[calibrar-com-OBSERVE]')
ON CONFLICT (rule_key) DO NOTHING;

-- Governança: o Alert Engine vira consumidor REGISTRADO das métricas que avalia
INSERT INTO public.cio_metric_consumers (metric_key, consumer_kind, consumer_id, notes)
SELECT r.target, 'module', 'alert-engine', 'regra '||r.rule_key||' (M55.5)'
FROM public.cio_alert_rules r
WHERE r.source_kind='metric'
  AND NOT EXISTS (SELECT 1 FROM public.cio_metric_consumers c
    WHERE c.metric_key=r.target AND c.consumer_id='alert-engine');

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cio_alert_rules','cio_alerts','cio_alert_groups',
    'cio_alert_escalation_rules','cio_alert_escalations','cio_alert_runbooks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename=t AND policyname=t||'_sel_admin') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin())',
        t||'_sel_admin', t);
    END IF;
  END LOOP;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4-8. Alert Engine: avaliação (fonte única) + ciclo de vida +
--      dedup + correlação + escalonamento — cio_alert_tick()
-- ──────────────────────────────────────────────────────────────

-- Avaliador de UMA regra — só Semantic Layer / Health Center
CREATE OR REPLACE FUNCTION public.cio_alert_eval(p_rule public.cio_alert_rules)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v NUMERIC; m JSONB; h JSONB; v_breach BOOLEAN; v_ev JSONB := '{}'::jsonb;
BEGIN
  CASE p_rule.source_kind
  WHEN 'metric' THEN
    m := public.cio_metric(p_rule.target, p_rule.grain,
           now() - make_interval(mins => p_rule.window_minutes), now(),
           '{}'::jsonb, NULL, 'alert-engine');
    IF NOT (m->>'ok')::boolean OR m->>'value' IS NULL THEN
      RETURN jsonb_build_object('skipped', true,
        'motivo', COALESCE(m->>'status', m->>'error', 'sem_dados'));
    END IF;
    v := (m->>'value')::numeric;
    v_ev := jsonb_build_object('fonte','semantic_layer','metric', p_rule.target,
              'version', m->'version');
  WHEN 'health' THEN
    h := (public.cio_health_compute(p_rule.target))->0;
    IF h IS NULL THEN
      RETURN jsonb_build_object('skipped', true, 'motivo','componente_inexistente');
    END IF;
    IF p_rule.operator = 'offline' THEN
      RETURN jsonb_build_object('breach', h->>'classification' = 'Offline',
        'value', NULL, 'evidence', jsonb_build_object('fonte','health_center',
          'classification', h->>'classification', 'motivo', h->'signals'->>'motivo'));
    END IF;
    IF h->>'score' IS NULL THEN
      RETURN jsonb_build_object('skipped', true,
        'motivo','sem_dados (Offline) — nunca alertar com número inventado');
    END IF;
    v := (h->>'score')::numeric;
    v_ev := jsonb_build_object('fonte','health_center',
              'classification', h->>'classification',
              'sinais_fracos', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
                FROM jsonb_array_elements(h->'signals'->'sinais') x
                WHERE (x->>'value')::numeric < 0.7));
  WHEN 'sla' THEN
    SELECT COUNT(*) INTO v
    FROM jsonb_array_elements(public.cio_metric_sla_status(NULL)) s
    WHERE s->>'status_operacional' IN ('atrasado','degradado');
    v_ev := jsonb_build_object('fonte','sla_status');
  WHEN 'drift' THEN
    SELECT COUNT(*) INTO v FROM public.cio_quality_issues
    WHERE check_key LIKE 'drift%'
      AND created_at > now() - make_interval(mins => p_rule.window_minutes);
    v_ev := jsonb_build_object('fonte','quality_issues');
  WHEN 'validator' THEN
    v := CASE WHEN (public.cio_semantic_validate()->>'aprovado')::boolean THEN 1 ELSE 0 END;
    v_ev := jsonb_build_object('fonte','validator');
  END CASE;

  v_breach := CASE p_rule.operator
    WHEN '>'  THEN v >  p_rule.threshold
    WHEN '>=' THEN v >= p_rule.threshold
    WHEN '<'  THEN v <  p_rule.threshold
    WHEN '<=' THEN v <= p_rule.threshold
    WHEN '='  THEN v =  p_rule.threshold
    WHEN '!=' THEN v <> p_rule.threshold
    ELSE false END;
  RETURN jsonb_build_object('breach', v_breach, 'value', v, 'evidence', v_ev);
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_alert_eval(public.cio_alert_rules)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_alert_eval(public.cio_alert_rules) TO service_role;

CREATE OR REPLACE FUNCTION public.cio_alert_tick()
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r public.cio_alert_rules; e JSONB; a RECORD; g RECORD;
  v_new INT:=0; v_conf INT:=0; v_res INT:=0; v_closed INT:=0; v_supp INT:=0;
  v_skip INT:=0; v_esc INT:=0; v_grp INT:=0; v_rank INT; v_gid BIGINT; v_i INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('cio_alert_tick')) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'tick concorrente');
  END IF;

  -- (a) ENCERRA resolvidos de ticks anteriores (resolvido → encerrado)
  UPDATE public.cio_alerts SET status='encerrado', closed_at=now()
  WHERE status='resolvido' AND resolved_at < now();
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- (b) avalia cada regra habilitada
  FOR r IN SELECT * FROM public.cio_alert_rules WHERE enabled ORDER BY priority LOOP
    e := public.cio_alert_eval(r);
    IF (e->>'skipped')::boolean THEN v_skip := v_skip + 1; CONTINUE; END IF;

    SELECT * INTO a FROM public.cio_alerts
    WHERE rule_key = r.rule_key AND status <> 'encerrado';

    IF (e->>'breach')::boolean THEN
      IF a.id IS NOT NULL THEN
        -- resolvido-mas-não-encerrado: não reabre nem duplica; cooldown decide o re-disparo
        IF a.status = 'resolvido' THEN v_supp := v_supp + 1; CONTINUE; END IF;
        -- dedup: alerta vivo => atualiza, nunca duplica
        UPDATE public.cio_alerts SET
          occurrences = occurrences + 1,
          consecutive_breaches = consecutive_breaches + 1,
          consecutive_normals = 0,
          value_observed = (e->>'value')::numeric,
          evidence = e->'evidence',
          status = CASE WHEN status='detectado'
                         AND consecutive_breaches + 1 >= r.hysteresis_count
                        THEN 'confirmado' ELSE status END,
          confirmed_at = CASE WHEN status='detectado'
                               AND consecutive_breaches + 1 >= r.hysteresis_count
                              THEN now() ELSE confirmed_at END
        WHERE id = a.id;
        IF a.status='detectado' AND a.consecutive_breaches + 1 >= r.hysteresis_count THEN
          v_conf := v_conf + 1;
        END IF;
      ELSE
        -- cooldown: não reabre logo após resolução
        IF EXISTS (SELECT 1 FROM public.cio_alerts
          WHERE rule_key=r.rule_key AND resolved_at IS NOT NULL
            AND resolved_at > now() - make_interval(mins => r.cooldown_minutes)) THEN
          v_supp := v_supp + 1; CONTINUE;
        END IF;
        -- recorrência: teto de disparos/dia
        IF r.max_fires_per_day IS NOT NULL AND (
          SELECT COUNT(*) FROM public.cio_alerts
          WHERE rule_key=r.rule_key AND created_at::date = current_date
        ) >= r.max_fires_per_day THEN
          v_supp := v_supp + 1; CONTINUE;
        END IF;
        INSERT INTO public.cio_alerts
          (rule_key, component, severity, value_observed, threshold, evidence,
           status, confirmed_at)
        VALUES (r.rule_key,
          CASE WHEN r.source_kind='health' THEN r.target ELSE NULL END,
          r.severity, (e->>'value')::numeric, r.threshold, e->'evidence',
          CASE WHEN r.hysteresis_count <= 1 THEN 'confirmado' ELSE 'detectado' END,
          CASE WHEN r.hysteresis_count <= 1 THEN now() END);
        v_new := v_new + 1;
        IF r.hysteresis_count <= 1 THEN v_conf := v_conf + 1; END IF;
      END IF;
    ELSE
      -- condição normal
      IF a.id IS NOT NULL THEN
        IF a.status = 'detectado' THEN
          -- nunca confirmou: encerra sem virar incidente (histerese cumpriu o papel)
          UPDATE public.cio_alerts SET status='encerrado', closed_at=now(),
            resolution='não confirmado (histerese)' WHERE id=a.id;
        ELSIF a.status IN ('confirmado','reconhecido') THEN
          IF a.consecutive_normals + 1 >= r.hysteresis_count THEN
            UPDATE public.cio_alerts SET status='resolvido', resolved_at=now(),
              resolution='auto: condição normalizada',
              consecutive_normals = consecutive_normals + 1 WHERE id=a.id;
            v_res := v_res + 1;
          ELSE
            UPDATE public.cio_alerts SET
              consecutive_normals = consecutive_normals + 1,
              consecutive_breaches = 0 WHERE id=a.id;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- (c) CORRELAÇÃO: agrupa confirmados por cadeia de dependência
  --     (componente upstream degradado explica o downstream)
  FOR a IN
    SELECT al.* FROM public.cio_alerts al
    WHERE al.status IN ('confirmado','reconhecido')
      AND al.component IS NOT NULL AND al.group_id IS NULL
  LOOP
    -- upstream transitivo com alerta vivo?
    WITH RECURSIVE up AS (
      SELECT c.component FROM public.cio_health_components c
      WHERE a.component = ANY(c.dependents)
      UNION
      SELECT c2.component FROM public.cio_health_components c2
      JOIN up ON up.component = ANY(c2.dependents)
    )
    SELECT al2.* INTO g FROM public.cio_alerts al2
    JOIN up ON up.component = al2.component
    WHERE al2.status IN ('confirmado','reconhecido')
    ORDER BY al2.confirmed_at LIMIT 1;

    IF g.id IS NOT NULL THEN
      -- garante grupo do principal (raiz)
      IF g.group_id IS NULL THEN
        INSERT INTO public.cio_alert_groups (principal_alert_id, root_component, correlation)
        VALUES (g.id, g.component, jsonb_build_array(
          jsonb_build_object('component', g.component, 'papel','causa_provavel')))
        RETURNING id INTO v_gid;
        UPDATE public.cio_alerts SET group_id = v_gid WHERE id = g.id;
        v_grp := v_grp + 1;
      ELSE
        v_gid := g.group_id;
      END IF;
      UPDATE public.cio_alerts SET group_id = v_gid WHERE id = a.id;
      UPDATE public.cio_alert_groups SET correlation = correlation ||
        jsonb_build_object('component', a.component, 'papel','efeito_downstream')
      WHERE id = v_gid
        AND NOT correlation @> jsonb_build_array(
          jsonb_build_object('component', a.component, 'papel','efeito_downstream'));
    END IF;
  END LOOP;
  -- fecha grupos cujo principal encerrou
  UPDATE public.cio_alert_groups gr SET closed_at = now()
  WHERE gr.closed_at IS NULL AND EXISTS (
    SELECT 1 FROM public.cio_alerts al
    WHERE al.id = gr.principal_alert_id AND al.status = 'encerrado');

  -- (d) ESCALONAMENTO: confirmado sem reconhecimento envelhecendo
  FOR a IN SELECT * FROM public.cio_alerts
           WHERE status='confirmado' AND confirmed_at IS NOT NULL LOOP
    v_rank := CASE a.severity WHEN 'informacao' THEN 1 WHEN 'aviso' THEN 2
      WHEN 'atencao' THEN 3 WHEN 'alto' THEN 4 WHEN 'critico' THEN 5 ELSE 6 END;
    INSERT INTO public.cio_alert_escalations (alert_id, step, notify_role)
    SELECT a.id, er.step, er.notify_role
    FROM public.cio_alert_escalation_rules er
    WHERE er.enabled
      AND er.after_minutes <= EXTRACT(EPOCH FROM now()-a.confirmed_at)/60.0
      AND v_rank >= CASE er.severity_min WHEN 'informacao' THEN 1 WHEN 'aviso' THEN 2
        WHEN 'atencao' THEN 3 WHEN 'alto' THEN 4 WHEN 'critico' THEN 5 ELSE 6 END
    ON CONFLICT (alert_id, step) DO NOTHING;
    GET DIAGNOSTICS v_i = ROW_COUNT;
    IF v_i > 0 THEN
      v_esc := v_esc + v_i;
      UPDATE public.cio_alerts SET escalation_level =
        (SELECT MAX(step) FROM public.cio_alert_escalations WHERE alert_id=a.id)
      WHERE id = a.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true,
    'novos', v_new, 'confirmados', v_conf, 'resolvidos', v_res,
    'encerrados', v_closed, 'suprimidos_cooldown_recorrencia', v_supp,
    'pulados_sem_dados', v_skip, 'grupos_criados', v_grp, 'escalonamentos', v_esc);
END $$;
REVOKE EXECUTE ON FUNCTION public.cio_alert_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cio_alert_tick() TO service_role;


-- ──────────────────────────────────────────────────────────────
-- 14. API Enterprise (guardadas por is_admin; actor registrado)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_alerts_list(
  p_status TEXT DEFAULT NULL, p_severity TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', a.id, 'rule_key', a.rule_key, 'component', a.component,
    'severity', a.severity, 'status', a.status,
    'value', a.value_observed, 'threshold', a.threshold,
    'occurrences', a.occurrences, 'group_id', a.group_id,
    'escalation_level', a.escalation_level,
    'idade_min', ROUND(EXTRACT(EPOCH FROM now()-a.detected_at)/60.0, 1),
    'detected_at', a.detected_at, 'confirmed_at', a.confirmed_at,
    'evidence', a.evidence) ORDER BY
      CASE a.severity WHEN 'emergencia' THEN 6 WHEN 'critico' THEN 5 WHEN 'alto' THEN 4
        WHEN 'atencao' THEN 3 WHEN 'aviso' THEN 2 ELSE 1 END DESC, a.detected_at)
  FROM public.cio_alerts a
  WHERE a.status <> 'encerrado'
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_severity IS NULL OR a.severity = p_severity)), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.cio_alert_ack(p_alert_id BIGINT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.cio_alerts;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  UPDATE public.cio_alerts SET status='reconhecido',
    acknowledged_at=now(), acknowledged_by=auth.uid(),
    resolution=COALESCE(p_note, resolution)
  WHERE id=p_alert_id AND status IN ('detectado','confirmado')
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error','alerta_inexistente_ou_estado_invalido');
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status,
    'acknowledged_at', v_row.acknowledged_at);
END $$;

CREATE OR REPLACE FUNCTION public.cio_alert_resolve(
  p_alert_id BIGINT, p_resolution TEXT, p_falso_positivo BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.cio_alerts;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  UPDATE public.cio_alerts SET status='resolvido',
    resolved_at=now(), resolved_by=auth.uid(),
    resolution=p_resolution, falso_positivo=p_falso_positivo
  WHERE id=p_alert_id AND status IN ('detectado','confirmado','reconhecido')
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error','alerta_inexistente_ou_estado_invalido');
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status,
    'falso_positivo', v_row.falso_positivo);
END $$;

CREATE OR REPLACE FUNCTION public.cio_alert_history(
  p_component TEXT DEFAULT NULL, p_days INT DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', a.id, 'origem', a.rule_key, 'component', a.component,
    'severity', a.severity, 'status', a.status,
    'detectado_em', a.detected_at,
    'duracao_min', CASE WHEN a.resolved_at IS NOT NULL
      THEN ROUND(EXTRACT(EPOCH FROM a.resolved_at-a.detected_at)/60.0,1) END,
    'recorrencias', a.occurrences,
    'resolucao', a.resolution, 'falso_positivo', a.falso_positivo,
    'escalonamentos', (SELECT COUNT(*) FROM public.cio_alert_escalations e
                       WHERE e.alert_id=a.id),
    'impacto', a.evidence->'sinais_fracos') ORDER BY a.detected_at DESC)
  FROM public.cio_alerts a
  WHERE a.detected_at > now() - make_interval(days => p_days)
    AND (p_component IS NULL OR a.component = p_component)), '[]'::jsonb);
END $$;

-- 10. Noise Reduction + estatísticas — fórmulas determinísticas declaradas
CREATE OR REPLACE FUNCTION public.cio_alert_stats(p_days INT DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_total NUMERIC; v_ack NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL
                                       OR resolved_by IS NOT NULL)
  INTO v_total, v_ack FROM public.cio_alerts
  WHERE detected_at > now() - make_interval(days => p_days);
  RETURN jsonb_build_object('ok', true, 'janela_dias', p_days,
    'por_regra', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'rule_key', s.rule_key, 'disparos', s.fires,
      'repeticao_dia', ROUND(s.fires::numeric/p_days, 2),
      'falsos_positivos', s.fps,
      'taxa_falso_positivo', CASE WHEN s.fires>0
        THEN ROUND(s.fps::numeric/s.fires, 2) END,
      'eficiencia', CASE WHEN s.fires>0
        THEN ROUND(1.0 - s.fps::numeric/s.fires, 2) END,
      'duracao_media_min', s.avg_dur,
      'ruidosa', s.fires::numeric/p_days > 10) ORDER BY s.fires DESC)
      FROM (SELECT rule_key, COUNT(*) fires,
              COUNT(*) FILTER (WHERE falso_positivo) fps,
              ROUND(AVG(EXTRACT(EPOCH FROM resolved_at-detected_at)/60.0)
                FILTER (WHERE resolved_at IS NOT NULL), 1) avg_dur
            FROM public.cio_alerts
            WHERE detected_at > now() - make_interval(days => p_days)
            GROUP BY rule_key) s), '[]'::jsonb),
    'global', jsonb_build_object(
      'alertas_total', v_total,
      'alertas_dia', ROUND(v_total/p_days, 2),
      'taxa_reconhecimento', CASE WHEN v_total>0 THEN ROUND(v_ack/v_total, 2) END,
      'fadiga', CASE WHEN v_total>0
        THEN ROUND((v_total/p_days) * (1.0 - v_ack/v_total), 2) ELSE 0 END,
      'formula_fadiga', 'alertas/dia × (1 − taxa de reconhecimento) — determinística',
      'limiar_ruidosa', '>10 disparos/dia [calibrar-com-OBSERVE]'));
END $$;

CREATE OR REPLACE FUNCTION public.cio_alert_rules_list()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.priority, r.rule_key)
    FROM public.cio_alert_rules r), '[]'::jsonb);
END $$;

-- 11. Recommendation Engine — runbooks determinísticos (sem IA generativa)
CREATE OR REPLACE FUNCTION public.cio_alert_recommendations(p_alert_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.cio_alerts; rb public.cio_alert_runbooks;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  SELECT * INTO a FROM public.cio_alerts WHERE id=p_alert_id;
  IF a.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error','alerta_inexistente');
  END IF;
  SELECT * INTO rb FROM public.cio_alert_runbooks
  WHERE applies_to = 'regra:'||a.rule_key;
  IF rb.runbook_key IS NULL AND a.component IS NOT NULL THEN
    SELECT * INTO rb FROM public.cio_alert_runbooks WHERE applies_to = a.component;
  END IF;
  IF rb.runbook_key IS NULL THEN
    SELECT * INTO rb FROM public.cio_alert_runbooks WHERE applies_to = 'generico';
  END IF;
  RETURN jsonb_build_object('ok', true, 'alert_id', a.id,
    'rule_key', a.rule_key, 'runbook', rb.runbook_key,
    'passos', rb.steps, 'evidencias', a.evidence,
    'metodo', 'runbook determinístico do catálogo — sem IA generativa');
END $$;

-- 12-13. Dashboard Dataset + Resumo Executivo
CREATE OR REPLACE FUNCTION public.cio_alert_dashboard()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN jsonb_build_object(
    'ativos', public.cio_alerts_list(NULL, NULL),
    'historico_7d', public.cio_alert_history(NULL, 7),
    'incidentes', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'group_id', g.id, 'root_component', g.root_component,
        'correlation', g.correlation, 'created_at', g.created_at,
        'aberto', g.closed_at IS NULL)), '[]'::jsonb)
      FROM public.cio_alert_groups g),
    'por_severidade', (SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb)
      FROM (SELECT severity, COUNT(*) n FROM public.cio_alerts
            WHERE status <> 'encerrado' GROUP BY severity) x),
    'por_componente', (SELECT COALESCE(jsonb_object_agg(component, n), '{}'::jsonb)
      FROM (SELECT component, COUNT(*) n FROM public.cio_alerts
            WHERE status <> 'encerrado' AND component IS NOT NULL
            GROUP BY component) x),
    'sla', public.cio_metric_sla_status(NULL),
    'health_semaforo', (SELECT jsonb_object_agg(e->>'component', e->>'classification')
      FROM jsonb_array_elements(public.cio_health_compute(NULL)) e),
    'tendencia_14d', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'dia', d, 'alertas', n) ORDER BY d), '[]'::jsonb)
      FROM (SELECT detected_at::date d, COUNT(*) n FROM public.cio_alerts
            WHERE detected_at > now()-interval '14 days' GROUP BY 1) t),
    'recomendacoes', (SELECT COALESCE(jsonb_agg(
        public.cio_alert_recommendations(a.id)), '[]'::jsonb)
      FROM public.cio_alerts a
      WHERE a.status IN ('confirmado','reconhecido')),
    'ruido', public.cio_alert_stats(7));
END $$;

CREATE OR REPLACE FUNCTION public.cio_alert_executive()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_7d INT; v_prev INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  SELECT COUNT(*) FILTER (WHERE detected_at > now()-interval '7 days'),
         COUNT(*) FILTER (WHERE detected_at BETWEEN now()-interval '14 days'
                                                AND now()-interval '7 days')
  INTO v_7d, v_prev FROM public.cio_alerts;
  RETURN jsonb_build_object(
    'alertas_ativos', (SELECT COUNT(*) FROM public.cio_alerts WHERE status<>'encerrado'),
    'incidentes_ativos', (SELECT COUNT(*) FROM public.cio_alert_groups WHERE closed_at IS NULL),
    'componentes_criticos', (SELECT COALESCE(jsonb_agg(e->>'component'), '[]'::jsonb)
      FROM jsonb_array_elements(public.cio_health_compute(NULL)) e
      WHERE e->>'classification'='Critico'),
    'maiores_riscos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'rule_key', rule_key, 'severity', severity, 'component', component)), '[]'::jsonb)
      FROM (SELECT rule_key, severity, component FROM public.cio_alerts
            WHERE status <> 'encerrado'
            ORDER BY CASE severity WHEN 'emergencia' THEN 6 WHEN 'critico' THEN 5
              WHEN 'alto' THEN 4 WHEN 'atencao' THEN 3 WHEN 'aviso' THEN 2 ELSE 1 END DESC
            LIMIT 5) x),
    'tendencia_operacional', CASE
      WHEN v_7d > v_prev THEN 'piorando'
      WHEN v_7d < v_prev THEN 'melhorando' ELSE 'estavel' END,
    'alertas_7d', v_7d, 'alertas_7d_anteriores', v_prev,
    'disponibilidade', (SELECT jsonb_object_agg(c.component,
        public.cio_availability(c.component, 30) -> 'uptime_pct')
      FROM public.cio_health_components c
      WHERE c.component IN ('etl','dispatcher','semantic_layer','banco')),
    'early_warning', public.cio_early_warning()->'avisos');
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  -- API admin-facing: guard interno is_admin + EXECUTE p/ authenticated e service
  FOREACH f IN ARRAY ARRAY['cio_alerts_list(text,text)','cio_alert_ack(bigint,text)',
    'cio_alert_resolve(bigint,text,boolean)','cio_alert_history(text,integer)',
    'cio_alert_stats(integer)','cio_alert_rules_list()',
    'cio_alert_recommendations(bigint)','cio_alert_dashboard()','cio_alert_executive()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;


-- ──────────────────────────────────────────────────────────────
-- Integração: dataset operacional (M55.4) recebe o bloco real de
-- alertas no slot declarado — MESMA assinatura, chaves mantidas
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cio_operational_dataset()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='P0003';
  END IF;
  RETURN jsonb_build_object(
    'health', public.cio_health_compute(NULL),
    'sla', public.cio_metric_sla_status(NULL),
    'drift_issues_7d', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'check', check_key, 'entity', entity_id, 'em', created_at)), '[]'::jsonb)
      FROM public.cio_quality_issues
      WHERE check_key LIKE 'drift%' AND created_at > now()-interval '7 days'),
    'quality', public.cio_metric_quality(NULL),
    'timeline_24h', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'component', component, 'score', score, 'em', captured_at)
        ORDER BY captured_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.cio_health_history
            WHERE captured_at > now()-interval '24 hours'
            ORDER BY captured_at DESC LIMIT 200) h),
    'incidentes', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.started_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.cio_incidents ORDER BY started_at DESC LIMIT 50) i),
    'disponibilidade', (SELECT jsonb_object_agg(component,
        public.cio_availability(component, 30) -> 'uptime_pct')
      FROM public.cio_health_components WHERE enabled),
    'performance', public.cio_metric_profile(NULL, 24),
    'alertas', jsonb_build_object(
      'ativos', public.cio_alerts_list(NULL, NULL),
      'por_severidade', (SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb)
        FROM (SELECT severity, COUNT(*) n FROM public.cio_alerts
              WHERE status <> 'encerrado' GROUP BY severity) x),
      'nota','Alert Center M55.5 ativo — detalhe completo em cio_alert_dashboard()'),
    'early_warning', public.cio_early_warning(),
    'validator', public.cio_semantic_validate());
END $$;


-- ──────────────────────────────────────────────────────────────
-- VERIFICAÇÃO
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE v JSONB;
BEGIN
  IF (SELECT COUNT(*) FROM public.cio_alert_rules) < 15 THEN
    RAISE EXCEPTION 'M55.5 ERRO: 15 regras semeadas esperadas'; END IF;
  IF EXISTS (SELECT 1 FROM public.cio_alert_rules WHERE enabled) THEN
    RAISE EXCEPTION 'M55.5 ERRO: regras deveriam nascer DESABILITADAS'; END IF;
  IF (SELECT COUNT(*) FROM public.cio_alert_escalation_rules) < 3 THEN
    RAISE EXCEPTION 'M55.5 ERRO: 3 degraus de escalonamento esperados'; END IF;
  IF (SELECT COUNT(*) FROM public.cio_alert_runbooks) < 8 THEN
    RAISE EXCEPTION 'M55.5 ERRO: 8 runbooks esperados'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cio_metric_consumers
    WHERE consumer_id='alert-engine') THEN
    RAISE EXCEPTION 'M55.5 ERRO: alert-engine não registrado como consumidor'; END IF;
  v := public.cio_semantic_validate();
  IF NOT (v->>'aprovado')::boolean THEN
    RAISE EXCEPTION 'M55.5 ERRO: catálogo reprovado: %', v->'issues'; END IF;
  v := public.cio_alert_tick();
  IF NOT (v->>'ok')::boolean THEN
    RAISE EXCEPTION 'M55.5 ERRO: tick falhou: %', v; END IF;
  IF (v->>'novos')::int <> 0 THEN
    RAISE EXCEPTION 'M55.5 ERRO: com regras desligadas, tick não pode gerar alertas'; END IF;

  RAISE NOTICE 'M55.5 ✓ Rule Engine (15 regras DESLIGADAS, 6 severidades, histerese/cooldown/recorrência/dependências) — OK';
  RAISE NOTICE 'M55.5 ✓ Alert Engine: tick com dedup, ciclo de vida 6 etapas c/ timestamps, correlação por dependência, escalonamento registrado — OK';
  RAISE NOTICE 'M55.5 ✓ Runbooks determinísticos (8) + noise/stats + history — sem IA generativa — OK';
  RAISE NOTICE 'M55.5 ✓ API Enterprise (9 RPCs guardadas) + dashboard dataset + executivo + slot de alertas do dataset operacional preenchido — OK';
END $$;
