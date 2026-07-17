-- ============================================================================
-- ORION-AI-46 — BACKUP & DISASTER RECOVERY AI v1.0
-- ============================================================================
-- Guardiao da continuidade operacional. NAO basta ter backup: prova
-- continuamente que os backups existem, estao integros, sao restauraveis, tem
-- cobertura adequada e atendem RPO/RTO. Tudo com EVIDENCIA real e auditavel.
-- NUNCA restaura producao automaticamente; restauracao exige autorizacao humana.
--
-- Fontes REAIS (sondado 07-17):
--   * Management API (/database/backups): walg_enabled=true (WAL contINUO ativo),
--     pitr_enabled=false, backups=[] (sem snapshot nomeado). Sincronizado via
--     backup_sync_catalog(jsonb) — a chamada da API usa token de gestao (secret),
--     entao o SYNC continuo e feito por edge/manual; o motor DB valida o catalogo.
--   * Manifesto de schema (DB-native): checksums md5 REAIS por categoria critica
--     (tabelas, funcoes-assinatura, RLS, cron, indices) — backup LOGICO de
--     estrutura que o proprio banco produz e re-verifica (deteccao de drift).
--   * Inventario: 441 tabelas, 2095 funcoes, 50 cron jobs (cobertura).
--   * AI-44 Security Audit (orion_secaudit_findings) — risco de config.
--
-- LACUNAS DECLARADAS (nunca inventa): tamanho/integridade dos snapshots fisicos e
--   validacao de EXISTENCIA de secrets/storage/edge exigem Management API (edge com
--   token) — o motor DB nao acessa secrets (so valida existencia, nunca expoe).
--   Restore real exige ambiente separado — aqui: validacao NAO-destrutiva
--   (completude do manifesto, estabilidade de checksum, objetos criticos presentes).
--
-- Anti-colisao: namespace orion_backup_*/orion_restore_*/orion_recovery_*, funcoes
--   backup_*/run_backup_recovery, chave backup_recovery, painel /admin/orion-backup-recovery.
--   Integra AI-40 (espelha risco critico em orion_cyber_events) e AI-44 (le findings);
--   AI-45 Incident Response NAO existe -> handoff no barramento (backup.handoff_ai45).
--
-- Idempotente. Evidencias IMUTAVEIS (REVOKE UPD/DEL). SECURITY DEFINER + guarda.
-- Tick */15. ROLLBACK manual ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_backup_jobs (
  job_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo         text        NOT NULL,   -- completo|incremental|diferencial|snapshot|manual|automatico|schema_manifest
  origem       text        NOT NULL,   -- postgres|storage|edge|config|schema
  destino      text,                   -- walg|pitr|mgmt_api|db_manifest
  inicio       timestamptz NOT NULL DEFAULT now(),
  fim          timestamptz,
  duracao_s    integer,
  tamanho_bytes bigint,
  objetos      integer     NOT NULL DEFAULT 0,
  checksum     text,                   -- fingerprint global do job
  integridade  text        NOT NULL DEFAULT 'desconhecida', -- ok|drift|corrompido|desconhecida
  status       text        NOT NULL DEFAULT 'concluido',    -- concluido|falhou|em_andamento
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_backup_jobs IS 'ORION-AI-46: execucoes de backup/manifesto (schema_manifest = backup logico de estrutura, DB-native).';
CREATE INDEX IF NOT EXISTS ix_orion_bkjobs_ini ON public.orion_backup_jobs (inicio DESC);

CREATE TABLE IF NOT EXISTS public.orion_backup_catalog (
  catalog_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key   text        NOT NULL UNIQUE,
  tipo         text        NOT NULL,   -- physical_walg|pitr|daily_snapshot|schema_manifest|storage|edge_functions|secrets
  referencia   text        NOT NULL,   -- id/rotulo do ponto de backup
  metodo       text        NOT NULL,   -- walg|pitr|mgmt_api|db_manifest|declarado
  criado_em    timestamptz,
  tamanho_bytes bigint,
  integro      boolean,
  presente     boolean     NOT NULL DEFAULT false,
  evidencias   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_backup_catalog IS 'ORION-AI-46: catalogo de pontos de backup (Mgmt API + manifesto). presente/integro por componente; secrets/storage/edge DECLARADOS.';

CREATE TABLE IF NOT EXISTS public.orion_backup_evidence (
  evidence_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id       bigint REFERENCES public.orion_backup_jobs(job_id),
  categoria    text        NOT NULL,   -- tables|functions|rls|cron|indexes|pay_tables|pay_functions|orion_tables
  objetos      integer     NOT NULL DEFAULT 0,
  checksum     text        NOT NULL,   -- md5 agregado da categoria (fingerprint de integridade)
  criticidade  text        NOT NULL DEFAULT 'media',
  capturado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_backup_evidence IS 'ORION-AI-46: fingerprints md5 REAIS por categoria (imutavel). Base de deteccao de drift/corrupcao.';
CREATE INDEX IF NOT EXISTS ix_orion_bkev_job ON public.orion_backup_evidence (job_id);
CREATE INDEX IF NOT EXISTS ix_orion_bkev_cat ON public.orion_backup_evidence (categoria);

CREATE TABLE IF NOT EXISTS public.orion_restore_tests (
  test_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo            text        NOT NULL DEFAULT 'validacao_nao_destrutiva',
  iniciado_em     timestamptz NOT NULL DEFAULT now(),
  itens_validados integer     NOT NULL DEFAULT 0,
  itens_ok        integer     NOT NULL DEFAULT 0,
  falhas          integer     NOT NULL DEFAULT 0,
  rto_estimado_min integer,
  status          text        NOT NULL DEFAULT 'aprovado',  -- aprovado|reprovado|parcial
  relatorio       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  evidencias      jsonb       NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.orion_restore_tests IS 'ORION-AI-46: testes de restauracao NAO-destrutivos (nunca toca producao). Completude/estabilidade/objetos criticos.';

CREATE TABLE IF NOT EXISTS public.orion_recovery_plans (
  plan_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text        NOT NULL UNIQUE,
  nome        text        NOT NULL,
  escopo      text        NOT NULL,   -- banco|storage|edge|config|completo
  rpo_meta_min integer    NOT NULL DEFAULT 1440,   -- meta RPO (min)
  rto_meta_min integer    NOT NULL DEFAULT 240,    -- meta RTO (min)
  passos      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  prioridade  integer     NOT NULL DEFAULT 1,
  ativo       boolean     NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_recovery_plans IS 'ORION-AI-46: planos de recuperacao com metas RPO/RTO e passos.';

CREATE TABLE IF NOT EXISTS public.orion_recovery_events (
  event_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id     bigint REFERENCES public.orion_recovery_plans(plan_id),
  tipo        text        NOT NULL,   -- drill|solicitacao_restore|aprovacao|conclusao|handoff
  status      text        NOT NULL DEFAULT 'registrado', -- registrado|pendente_aprovacao|aprovado|concluido|negado
  motivo      text,
  operador    text        NOT NULL DEFAULT 'backup_recovery',
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_recovery_events IS 'ORION-AI-46: eventos de DR (drills, solicitacao/aprovacao de restore). Restore real NUNCA automatico.';
CREATE INDEX IF NOT EXISTS ix_orion_recev_plan ON public.orion_recovery_events (plan_id);

CREATE TABLE IF NOT EXISTS public.orion_backup_alerts (
  alert_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key  text        NOT NULL,
  tipo        text        NOT NULL,   -- pitr_off|sem_backup|backup_atrasado|backup_corrompido|rpo_excedido|rto_excedido|restore_falhou|inconsistencia
  severidade  text        NOT NULL DEFAULT 'media',
  mensagem    text        NOT NULL,
  evidencias  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status      text        NOT NULL DEFAULT 'aberto',  -- aberto|reconhecido|resolvido
  dia         date        NOT NULL DEFAULT current_date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_bkalert_uq UNIQUE (dedupe_key, dia)
);
COMMENT ON TABLE public.orion_backup_alerts IS 'ORION-AI-46: alertas de continuidade (1/tipo/dia). Fecham quando a evidencia some.';

CREATE TABLE IF NOT EXISTS public.orion_backup_statistics (
  dia               date        PRIMARY KEY,
  backups_validados integer     NOT NULL DEFAULT 0,
  integros          integer     NOT NULL DEFAULT 0,
  drifts            integer     NOT NULL DEFAULT 0,
  restore_tests     integer     NOT NULL DEFAULT 0,
  restore_aprovados integer     NOT NULL DEFAULT 0,
  rpo_min           integer     NOT NULL DEFAULT 0,
  rto_min           integer     NOT NULL DEFAULT 0,
  brs               integer     NOT NULL DEFAULT 0,
  rrs               integer     NOT NULL DEFAULT 0,
  dis               integer     NOT NULL DEFAULT 0,
  cri               integer     NOT NULL DEFAULT 0,
  alertas_abertos   integer     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_backup_statistics IS 'ORION-AI-46: rollup diario (BRS/RRS/DIS/CRI + RPO/RTO).';

-- ----------------------------------------------------------------------------
-- 2) RLS (admin) + hardening de grants + imutabilidade das evidencias
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_backup_jobs','orion_backup_catalog','orion_backup_evidence','orion_restore_tests',
                           'orion_recovery_plans','orion_recovery_events','orion_backup_alerts','orion_backup_statistics'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END$$;

-- evidencias imutaveis (append-only)
REVOKE UPDATE, DELETE ON public.orion_backup_evidence FROM anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'backup_recovery', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — backup_snapshot(): manifesto de schema com checksums REAIS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_snapshot(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job bigint; v_ini timestamptz := now();
  v_ck_tables text; v_n_tables int;
  v_ck_funcs text;  v_n_funcs int;
  v_ck_rls text;    v_n_rls int;
  v_ck_cron text;   v_n_cron int;
  v_ck_idx text;    v_n_idx int;
  v_ck_pay_t text;  v_n_pay_t int;
  v_ck_pay_f text;  v_n_pay_f int;
  v_ck_orion text;  v_n_orion int;
  v_global text; v_prev text; v_integ text := 'ok'; v_total int;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'backup_snapshot: acesso negado (somente admin/service)';
  END IF;

  INSERT INTO public.orion_backup_jobs (tipo, origem, destino, inicio, status)
  VALUES ('schema_manifest','schema','db_manifest', v_ini, 'em_andamento') RETURNING job_id INTO v_job;

  -- tabelas (assinatura de colunas)
  SELECT md5(coalesce(string_agg(sig,'|' ORDER BY sig),'')), count(*) INTO v_ck_tables, v_n_tables
  FROM (SELECT table_name||':'||string_agg(column_name||' '||data_type, ',' ORDER BY ordinal_position) sig
        FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t;

  -- funcoes (assinatura de identidade — seguro; NAO usa pg_get_functiondef p/ evitar quebra PostGIS)
  SELECT md5(coalesce(string_agg(sig,'|' ORDER BY sig),'')), count(*) INTO v_ck_funcs, v_n_funcs
  FROM (SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') f;

  -- RLS policies
  SELECT md5(coalesce(string_agg(sig,'|' ORDER BY sig),'')), count(*) INTO v_ck_rls, v_n_rls
  FROM (SELECT tablename||':'||policyname||':'||coalesce(qual,'') sig FROM pg_policies WHERE schemaname='public') r;

  -- cron jobs
  SELECT md5(coalesce(string_agg(sig,'|' ORDER BY sig),'')), count(*) INTO v_ck_cron, v_n_cron
  FROM (SELECT jobname||':'||schedule||':'||command sig FROM cron.job) c;

  -- indices
  SELECT md5(coalesce(string_agg(indexdef,'|' ORDER BY indexname),'')), count(*) INTO v_ck_idx, v_n_idx
  FROM pg_indexes WHERE schemaname='public';

  -- pay_* tabelas (financeiro critico)
  SELECT md5(coalesce(string_agg(sig,'|' ORDER BY sig),'')), count(DISTINCT tn) INTO v_ck_pay_t, v_n_pay_t
  FROM (SELECT table_name tn, table_name||':'||string_agg(column_name, ',' ORDER BY ordinal_position) sig
        FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'pay_%' GROUP BY table_name) pt;

  -- pay_* funcoes
  SELECT md5(coalesce(string_agg(sig,'|' ORDER BY sig),'')), count(*) INTO v_ck_pay_f, v_n_pay_f
  FROM (SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'pay_%') pf;

  -- orion_* tabelas
  SELECT md5(coalesce(string_agg(DISTINCT table_name,'|' ORDER BY table_name),'')), count(DISTINCT table_name) INTO v_ck_orion, v_n_orion
  FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'orion_%';

  -- evidencias (imutaveis)
  INSERT INTO public.orion_backup_evidence (job_id, categoria, objetos, checksum, criticidade) VALUES
    (v_job,'tables',      v_n_tables, v_ck_tables, 'alta'),
    (v_job,'functions',   v_n_funcs,  v_ck_funcs,  'alta'),
    (v_job,'rls',         v_n_rls,    v_ck_rls,    'critica'),
    (v_job,'cron',        v_n_cron,   v_ck_cron,   'alta'),
    (v_job,'indexes',     v_n_idx,    v_ck_idx,    'media'),
    (v_job,'pay_tables',  v_n_pay_t,  v_ck_pay_t,  'critica'),
    (v_job,'pay_functions',v_n_pay_f, v_ck_pay_f,  'critica'),
    (v_job,'orion_tables',v_n_orion,  v_ck_orion,  'alta');

  v_global := md5(v_ck_tables||v_ck_funcs||v_ck_rls||v_ck_cron||v_ck_idx||v_ck_pay_t||v_ck_pay_f||v_ck_orion);
  v_total  := v_n_tables + v_n_funcs + v_n_rls + v_n_cron + v_n_idx;

  -- drift vs manifesto anterior?
  SELECT checksum INTO v_prev FROM public.orion_backup_jobs
   WHERE tipo='schema_manifest' AND status='concluido' AND job_id < v_job ORDER BY job_id DESC LIMIT 1;
  IF v_prev IS NOT NULL AND v_prev <> v_global THEN v_integ := 'drift'; END IF;

  UPDATE public.orion_backup_jobs SET fim=now(), duracao_s=extract(epoch FROM (now()-v_ini))::int,
    objetos=v_total, checksum=v_global, integridade=v_integ, status='concluido',
    evidencias=jsonb_build_object('tables',v_n_tables,'functions',v_n_funcs,'rls',v_n_rls,'cron',v_n_cron,
      'indexes',v_n_idx,'pay_tables',v_n_pay_t,'pay_functions',v_n_pay_f,'orion_tables',v_n_orion,
      'drift_vs_anterior', (v_prev IS NOT NULL AND v_prev<>v_global))
  WHERE job_id=v_job;

  -- cataloga o manifesto como ponto de backup logico
  INSERT INTO public.orion_backup_catalog (dedupe_key, tipo, referencia, metodo, criado_em, tamanho_bytes, integro, presente, evidencias)
  VALUES ('manifest:'||v_job, 'schema_manifest', 'manifest#'||v_job, 'db_manifest', now(), NULL, (v_integ='ok'), true,
    jsonb_build_object('checksum_global',v_global,'objetos',v_total))
  ON CONFLICT (dedupe_key) DO NOTHING;

  PERFORM public.backup_emit('backup.snapshot', jsonb_build_object('job',v_job,'objetos',v_total,'integridade',v_integ,'trace',p_trace));
  RETURN jsonb_build_object('ok',true,'job',v_job,'objetos',v_total,'checksum',v_global,'integridade',v_integ);
END$$;

-- ----------------------------------------------------------------------------
-- 5) SYNC do catalogo real (Management API) — recebe o JSON de /database/backups
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_sync_catalog(p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_walg boolean; v_pitr boolean; v_n int := 0; b jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'backup_sync_catalog: acesso negado';
  END IF;
  v_walg := coalesce((p_state->>'walg_enabled')::boolean,false);
  v_pitr := coalesce((p_state->>'pitr_enabled')::boolean,false);

  -- componente: WAL-G fisico continuo
  INSERT INTO public.orion_backup_catalog (dedupe_key, tipo, referencia, metodo, criado_em, integro, presente, evidencias)
  VALUES ('physical_walg', 'physical_walg', 'WAL-G continuous', 'walg', now(), v_walg, v_walg,
    jsonb_build_object('walg_enabled',v_walg,'nota','backup fisico continuo gerenciado pelo Supabase'))
  ON CONFLICT (dedupe_key) DO UPDATE SET integro=excluded.integro, presente=excluded.presente,
    evidencias=excluded.evidencias, atualizado_em=now();
  v_n := v_n+1;

  -- componente: PITR
  INSERT INTO public.orion_backup_catalog (dedupe_key, tipo, referencia, metodo, integro, presente, evidencias)
  VALUES ('pitr', 'pitr', 'Point-in-time recovery', 'pitr', v_pitr, v_pitr,
    jsonb_build_object('pitr_enabled',v_pitr,'nota','granularidade de restauracao ponto-a-ponto'))
  ON CONFLICT (dedupe_key) DO UPDATE SET integro=excluded.integro, presente=excluded.presente,
    evidencias=excluded.evidencias, atualizado_em=now();
  v_n := v_n+1;

  -- snapshots nomeados (backups[])
  FOR b IN SELECT * FROM jsonb_array_elements(coalesce(p_state->'backups','[]'::jsonb)) LOOP
    INSERT INTO public.orion_backup_catalog (dedupe_key, tipo, referencia, metodo, criado_em, tamanho_bytes, integro, presente, evidencias)
    VALUES ('daily:'||coalesce(b->>'id',b->>'inserted_at',md5(b::text)), 'daily_snapshot',
      coalesce(b->>'id',b->>'inserted_at','snapshot'), 'mgmt_api',
      nullif(b->>'inserted_at','')::timestamptz, nullif(b->>'size_bytes','')::bigint, true, true, b)
    ON CONFLICT (dedupe_key) DO UPDATE SET presente=true, evidencias=excluded.evidencias, atualizado_em=now();
    v_n := v_n+1;
  END LOOP;

  -- componentes DECLARADOS (existencia via Mgmt API/edge — nunca expoe secret)
  INSERT INTO public.orion_backup_catalog (dedupe_key, tipo, referencia, metodo, integro, presente, evidencias) VALUES
    ('storage','storage','Storage buckets','declarado', NULL, false, jsonb_build_object('nota','DECLARADO: cobertura de storage exige Mgmt API/edge')),
    ('edge_functions','edge_functions','Edge Functions','declarado', NULL, false, jsonb_build_object('nota','DECLARADO: versionamento de edge exige Mgmt API/edge')),
    ('secrets','secrets','Secrets (so existencia)','declarado', NULL, false, jsonb_build_object('nota','DECLARADO: valida SO existencia via Mgmt API; NUNCA expoe valor'))
  ON CONFLICT (dedupe_key) DO UPDATE SET evidencias=excluded.evidencias, atualizado_em=now();
  v_n := v_n+3;

  PERFORM public.backup_emit('backup.catalog_sync', jsonb_build_object('componentes',v_n,'walg',v_walg,'pitr',v_pitr));
  RETURN jsonb_build_object('ok',true,'componentes',v_n,'walg',v_walg,'pitr',v_pitr);
END$$;

-- ----------------------------------------------------------------------------
-- 6) INTEGRIDADE — compara os 2 ultimos manifestos por categoria
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_validate_integrity()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ult AS (SELECT job_id FROM public.orion_backup_jobs WHERE tipo='schema_manifest' AND status='concluido' ORDER BY job_id DESC LIMIT 1),
       ant AS (SELECT job_id FROM public.orion_backup_jobs WHERE tipo='schema_manifest' AND status='concluido' ORDER BY job_id DESC OFFSET 1 LIMIT 1),
       cur AS (SELECT categoria, checksum, objetos FROM public.orion_backup_evidence WHERE job_id=(SELECT job_id FROM ult)),
       prev AS (SELECT categoria, checksum FROM public.orion_backup_evidence WHERE job_id=(SELECT job_id FROM ant))
  SELECT jsonb_build_object(
    'manifesto_atual', (SELECT job_id FROM ult),
    'manifesto_anterior', (SELECT job_id FROM ant),
    'categorias', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',c.categoria,'objetos',c.objetos,
        'estado', CASE WHEN p.checksum IS NULL THEN 'baseline' WHEN p.checksum=c.checksum THEN 'estavel' ELSE 'drift' END)),'[]'::jsonb)
      FROM cur c LEFT JOIN prev p USING (categoria)),
    'drifts', (SELECT count(*) FROM cur c JOIN prev p USING (categoria) WHERE p.checksum<>c.checksum));
$$;

-- ----------------------------------------------------------------------------
-- 7) RESTORE TEST — validacao NAO-destrutiva (nunca toca producao)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_restore_test()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_val int := 0; v_ok int := 0; v_fail int := 0; v_rto int; v_status text;
  v_manifesto bigint; v_rls_off int; v_pay_ok int; v_cron int; rec jsonb := '[]'::jsonb;
  v_add jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'backup_restore_test: acesso negado';
  END IF;

  SELECT job_id INTO v_manifesto FROM public.orion_backup_jobs WHERE tipo='schema_manifest' AND status='concluido' ORDER BY job_id DESC LIMIT 1;

  -- C1: manifesto existe e tem as 8 categorias
  v_val := v_val+1;
  IF (SELECT count(*) FROM public.orion_backup_evidence WHERE job_id=v_manifesto) = 8 THEN v_ok:=v_ok+1;
     rec := rec || jsonb_build_array(jsonb_build_object('caso','manifesto_completo','ok',true));
  ELSE v_fail:=v_fail+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','manifesto_completo','ok',false)); END IF;

  -- C2: checksum global estavel (integridade do ultimo job)
  v_val := v_val+1;
  IF (SELECT integridade FROM public.orion_backup_jobs WHERE job_id=v_manifesto) IN ('ok') THEN v_ok:=v_ok+1;
     rec := rec || jsonb_build_array(jsonb_build_object('caso','checksum_estavel','ok',true));
  ELSE v_fail:=v_fail+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','checksum_estavel','ok',false,'nota','drift ou baseline')); END IF;

  -- C3: RLS habilitado nas tabelas financeiras pay_* (objeto critico presente/consistente)
  SELECT count(*) INTO v_rls_off FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'pay_%' AND NOT rowsecurity;
  v_val := v_val+1;
  IF v_rls_off = 0 THEN v_ok:=v_ok+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','rls_pay_ativo','ok',true));
  ELSE v_fail:=v_fail+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','rls_pay_ativo','ok',false,'tabelas_sem_rls',v_rls_off)); END IF;

  -- C4: funcoes financeiras criticas presentes (pay_webhook_apply_event como sentinela)
  v_val := v_val+1;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pay_webhook_apply_event') THEN
     v_ok:=v_ok+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','funcoes_criticas_presentes','ok',true));
  ELSE v_fail:=v_fail+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','funcoes_criticas_presentes','ok',false)); END IF;

  -- C5: cron jobs presentes (continuidade dos motores)
  SELECT count(*) INTO v_cron FROM cron.job;
  v_val := v_val+1;
  IF v_cron > 0 THEN v_ok:=v_ok+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','cron_presente','ok',true,'jobs',v_cron));
  ELSE v_fail:=v_fail+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','cron_presente','ok',false)); END IF;

  -- C6: ponto de backup fisico presente (WAL-G no catalogo)
  v_val := v_val+1;
  IF EXISTS (SELECT 1 FROM public.orion_backup_catalog WHERE dedupe_key='physical_walg' AND presente) THEN
     v_ok:=v_ok+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','backup_fisico_presente','ok',true));
  ELSE v_fail:=v_fail+1; rec := rec || jsonb_build_array(jsonb_build_object('caso','backup_fisico_presente','ok',false,'nota','sem WAL-G/snapshot')); END IF;

  -- RTO estimado (heuristica declarada): base 30min + objetos/1000
  SELECT 30 + coalesce((SELECT objetos FROM public.orion_backup_jobs WHERE job_id=v_manifesto),0)/1000 INTO v_rto;
  v_status := CASE WHEN v_fail=0 THEN 'aprovado' WHEN v_ok=0 THEN 'reprovado' ELSE 'parcial' END;

  INSERT INTO public.orion_restore_tests (tipo, itens_validados, itens_ok, falhas, rto_estimado_min, status, relatorio, evidencias)
  VALUES ('validacao_nao_destrutiva', v_val, v_ok, v_fail, v_rto, v_status, jsonb_build_object('casos',rec),
    jsonb_build_object('manifesto',v_manifesto,'nota','validacao NAO-destrutiva; restore real exige ambiente separado + aprovacao (DECLARADO)'));

  PERFORM public.backup_emit('backup.restore_test', jsonb_build_object('status',v_status,'ok',v_ok,'falhas',v_fail,'rto_min',v_rto));
  RETURN jsonb_build_object('ok',true,'status',v_status,'validados',v_val,'aprovados',v_ok,'falhas',v_fail,'rto_estimado_min',v_rto,'casos',rec);
END$$;

-- ----------------------------------------------------------------------------
-- 8) SCORES (BRS/RRS/DIS/CRI) + RPO/RTO — formulas explicaveis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_scores()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cat AS (
    SELECT bool_or(dedupe_key='physical_walg' AND presente) walg,
           bool_or(dedupe_key='pitr' AND presente) pitr,
           count(*) FILTER (WHERE tipo='daily_snapshot' AND presente) snaps,
           -- cobertura por TIPO DE COMPONENTE distinto (estavel; nao conta historico de manifestos)
           count(DISTINCT tipo) FILTER (WHERE presente) presentes, count(DISTINCT tipo) total
    FROM public.orion_backup_catalog),
  man AS (SELECT integridade, objetos, fim FROM public.orion_backup_jobs WHERE tipo='schema_manifest' AND status='concluido' ORDER BY job_id DESC LIMIT 1),
  rt AS (SELECT status, rto_estimado_min FROM public.orion_restore_tests ORDER BY test_id DESC LIMIT 1),
  plan AS (SELECT count(*) n, min(rpo_meta_min) rpo_meta, min(rto_meta_min) rto_meta FROM public.orion_recovery_plans WHERE ativo),
  manifest_age AS (SELECT extract(epoch FROM (now()-(SELECT fim FROM man)))/60 min_age)
  SELECT jsonb_build_object(
    -- BRS: WAL-G(35) + integridade manifesto(30) + snapshot nomeado(20) + manifesto recente(15)
    'brs', least(
        (CASE WHEN (SELECT walg FROM cat) THEN 35 ELSE 0 END)
      + (CASE WHEN (SELECT integridade FROM man)='ok' THEN 30 WHEN (SELECT integridade FROM man)='drift' THEN 10 ELSE 0 END)
      + (CASE WHEN (SELECT snaps FROM cat)>0 THEN 20 ELSE 0 END)
      + (CASE WHEN (SELECT min_age FROM manifest_age) < 60 THEN 15 WHEN (SELECT min_age FROM manifest_age) < 1440 THEN 8 ELSE 0 END), 100),
    -- RRS: plano ativo(30) + restore test aprovado(30) + cobertura(25) + PITR(15)
    'rrs', least(
        (CASE WHEN (SELECT n FROM plan)>0 THEN 30 ELSE 0 END)
      + (CASE WHEN (SELECT status FROM rt)='aprovado' THEN 30 WHEN (SELECT status FROM rt)='parcial' THEN 15 ELSE 0 END)
      + round(25.0 * (SELECT presentes FROM cat) / nullif((SELECT total FROM cat),0))::int
      + (CASE WHEN (SELECT pitr FROM cat) THEN 15 ELSE 0 END), 100),
    -- DIS (impacto do desastre agora; maior=pior): sem PITR(30)+sem snapshot(30)+sem plano(20)+drift(20), mitigado por WAL-G(-30)
    'dis', greatest(0, least(
        (CASE WHEN (SELECT pitr FROM cat) THEN 0 ELSE 30 END)
      + (CASE WHEN (SELECT snaps FROM cat)>0 THEN 0 ELSE 30 END)
      + (CASE WHEN (SELECT n FROM plan)>0 THEN 0 ELSE 20 END)
      + (CASE WHEN (SELECT integridade FROM man)='ok' THEN 0 ELSE 20 END)
      - (CASE WHEN (SELECT walg FROM cat) THEN 30 ELSE 0 END), 100)),
    'walg', (SELECT walg FROM cat), 'pitr', (SELECT pitr FROM cat), 'snapshots', (SELECT snaps FROM cat),
    'cobertura_pct', round(100.0 * (SELECT presentes FROM cat) / nullif((SELECT total FROM cat),0))::int,
    -- RPO: WAL-G continuo => ponto de dados continuo; RPO_validado = idade do ultimo manifesto de integridade
    'rpo_continuo_walg', (SELECT walg FROM cat),
    'rpo_validado_min', coalesce(round((SELECT min_age FROM manifest_age))::int, 0),
    'rpo_meta_min', (SELECT rpo_meta FROM plan),
    'rto_estimado_min', (SELECT rto_estimado_min FROM rt),
    'rto_meta_min', (SELECT rto_meta FROM plan),
    'nota', 'BRS/RRS explicaveis; WAL-G=continuo (positivo), PITR off e sem snapshot nomeado (negativos). RPO de dados continuo via WAL-G; RPO_validado = idade do manifesto.');
$$;

-- CRI (indice composto) — derivado dos demais
CREATE OR REPLACE FUNCTION public.backup_cri()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(0.4*(s->>'brs')::numeric + 0.4*(s->>'rrs')::numeric + 0.2*(100-(s->>'dis')::numeric))::int
  FROM (SELECT public.backup_scores() s) x;
$$;

-- ----------------------------------------------------------------------------
-- 9) ALERTAS (1/tipo/dia; fecham quando a evidencia some)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_generate_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; v_n int := 0; v_manif_age numeric; v_rpo_meta int; v_rt text;
BEGIN
  s := public.backup_scores();
  v_rpo_meta := coalesce((s->>'rpo_meta_min')::int, 1440);
  v_manif_age := coalesce((s->>'rpo_validado_min')::numeric, 0);
  SELECT status INTO v_rt FROM public.orion_restore_tests ORDER BY test_id DESC LIMIT 1;

  -- PITR desabilitado
  IF NOT (s->>'pitr')::boolean THEN
    INSERT INTO public.orion_backup_alerts (dedupe_key, tipo, severidade, mensagem, evidencias)
    VALUES ('pitr_off','pitr_off','alta','PITR desabilitado: sem restauracao ponto-a-ponto (WAL-G continuo cobre o fisico, mas granularidade limitada).',
      jsonb_build_object('pitr',false,'walg',(s->>'walg')::boolean))
    ON CONFLICT (dedupe_key, dia) DO NOTHING; v_n:=v_n+1;
  END IF;

  -- sem snapshot nomeado
  IF (s->>'snapshots')::int = 0 THEN
    INSERT INTO public.orion_backup_alerts (dedupe_key, tipo, severidade, mensagem, evidencias)
    VALUES ('sem_backup','sem_backup','alta','Nenhum snapshot nomeado catalogado (Mgmt API backups=[]). Apenas WAL-G continuo + manifesto de schema.',
      jsonb_build_object('snapshots',0))
    ON CONFLICT (dedupe_key, dia) DO NOTHING; v_n:=v_n+1;
  END IF;

  -- RPO validado excedido (manifesto de integridade antigo)
  IF v_manif_age > v_rpo_meta THEN
    INSERT INTO public.orion_backup_alerts (dedupe_key, tipo, severidade, mensagem, evidencias)
    VALUES ('rpo_excedido','rpo_excedido','media','RPO validado excedido: ultimo manifesto de integridade ha '||round(v_manif_age)||'min (meta '||v_rpo_meta||'min).',
      jsonb_build_object('idade_min',round(v_manif_age),'meta_min',v_rpo_meta))
    ON CONFLICT (dedupe_key, dia) DO NOTHING; v_n:=v_n+1;
  END IF;

  -- integridade em drift
  IF EXISTS (SELECT 1 FROM public.orion_backup_jobs WHERE tipo='schema_manifest' AND status='concluido' AND integridade='drift'
             AND job_id=(SELECT max(job_id) FROM public.orion_backup_jobs WHERE tipo='schema_manifest' AND status='concluido')) THEN
    INSERT INTO public.orion_backup_alerts (dedupe_key, tipo, severidade, mensagem, evidencias)
    VALUES ('inconsistencia','inconsistencia','media','Drift de schema detectado entre manifestos (estrutura mudou desde o ultimo backup logico).', '{}'::jsonb)
    ON CONFLICT (dedupe_key, dia) DO NOTHING; v_n:=v_n+1;
  END IF;

  -- restore test reprovado
  IF v_rt='reprovado' THEN
    INSERT INTO public.orion_backup_alerts (dedupe_key, tipo, severidade, mensagem, evidencias)
    VALUES ('restore_falhou','restore_falhou','critica','Teste de restauracao reprovado.', '{}'::jsonb)
    ON CONFLICT (dedupe_key, dia) DO NOTHING; v_n:=v_n+1;
  END IF;

  -- auto-fecha alertas cuja evidencia sumiu hoje
  UPDATE public.orion_backup_alerts a SET status='resolvido'
   WHERE a.dia=current_date AND a.status='aberto' AND (
     (a.tipo='pitr_off' AND (s->>'pitr')::boolean) OR
     (a.tipo='sem_backup' AND (s->>'snapshots')::int>0) OR
     (a.tipo='rpo_excedido' AND v_manif_age<=v_rpo_meta) OR
     (a.tipo='restore_falhou' AND v_rt<>'reprovado'));

  -- espelha criticos no barramento comum (AI-40) + handoff AI-45
  INSERT INTO public.orion_cyber_events (dedupe_key, origem, tipo, severidade, modulo, descricao, evidencias, confianca, score)
  SELECT 'backup:'||a.tipo||':'||a.dia, 'backup_recovery', 'config_risk', a.severidade, 'backup_recovery',
    'AI-46 '||a.tipo||': '||a.mensagem, a.evidencias, 90,
    CASE a.severidade WHEN 'critica' THEN 100 WHEN 'alta' THEN 80 ELSE 55 END
  FROM public.orion_backup_alerts a WHERE a.dia=current_date AND a.status='aberto' AND a.severidade IN ('alta','critica')
  ON CONFLICT (dedupe_key) DO NOTHING;

  IF v_n>0 THEN
    PERFORM public.backup_emit('backup.handoff_ai45', jsonb_build_object('alertas',v_n,'nota','fila para AI-45 Incident Response (nao construido)'));
  END IF;
  RETURN v_n;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN v_n;
END$$;

-- ----------------------------------------------------------------------------
-- 10) DR: solicitar/aprovar restauracao (NUNCA executa restore real automatico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_request_recovery(p_plan_id bigint, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ev bigint;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'backup_request_recovery: somente admin';
  END IF;
  INSERT INTO public.orion_recovery_events (plan_id, tipo, status, motivo, operador)
  VALUES (p_plan_id, 'solicitacao_restore', 'pendente_aprovacao', p_motivo, coalesce(auth.uid()::text,'admin')) RETURNING event_id INTO v_ev;
  PERFORM public.backup_emit('backup.restore_requested', jsonb_build_object('event',v_ev,'plan',p_plan_id));
  RETURN jsonb_build_object('ok',true,'event',v_ev,'status','pendente_aprovacao',
    'nota','restauracao real e MANUAL/ops apos aprovacao; o modulo NUNCA restaura producao automaticamente');
END$$;

CREATE OR REPLACE FUNCTION public.backup_approve_recovery(p_event_id bigint, p_aprovar boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'backup_approve_recovery: somente admin';
  END IF;
  UPDATE public.orion_recovery_events SET status=CASE WHEN p_aprovar THEN 'aprovado' ELSE 'negado' END,
    motivo=coalesce(p_motivo,motivo), operador=coalesce(auth.uid()::text,'admin')
  WHERE event_id=p_event_id AND status='pendente_aprovacao';
  IF NOT FOUND THEN RAISE EXCEPTION 'evento % nao esta pendente', p_event_id; END IF;
  PERFORM public.backup_emit('backup.restore_'||CASE WHEN p_aprovar THEN 'approved' ELSE 'denied' END, jsonb_build_object('event',p_event_id));
  RETURN jsonb_build_object('ok',true,'event',p_event_id,'aprovado',p_aprovar,
    'nota','aprovado NAO executa restore; sinaliza ops para restauracao manual controlada');
END$$;

-- ----------------------------------------------------------------------------
-- 11) ESTATISTICAS (rollup idempotente)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_statistics_rollup()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb;
BEGIN
  s := public.backup_scores();
  INSERT INTO public.orion_backup_statistics (dia, backups_validados, integros, drifts, restore_tests, restore_aprovados,
    rpo_min, rto_min, brs, rrs, dis, cri, alertas_abertos, updated_at)
  VALUES (current_date,
    (SELECT count(*) FROM public.orion_backup_jobs WHERE tipo='schema_manifest' AND created_at::date=current_date),
    (SELECT count(*) FROM public.orion_backup_jobs WHERE integridade='ok' AND created_at::date=current_date),
    (SELECT count(*) FROM public.orion_backup_jobs WHERE integridade='drift' AND created_at::date=current_date),
    (SELECT count(*) FROM public.orion_restore_tests WHERE iniciado_em::date=current_date),
    (SELECT count(*) FROM public.orion_restore_tests WHERE status='aprovado' AND iniciado_em::date=current_date),
    coalesce((s->>'rpo_validado_min')::int,0), coalesce((s->>'rto_estimado_min')::int,0),
    (s->>'brs')::int, (s->>'rrs')::int, (s->>'dis')::int, public.backup_cri(),
    (SELECT count(*) FROM public.orion_backup_alerts WHERE status='aberto'), now())
  ON CONFLICT (dia) DO UPDATE SET backups_validados=excluded.backups_validados, integros=excluded.integros, drifts=excluded.drifts,
    restore_tests=excluded.restore_tests, restore_aprovados=excluded.restore_aprovados, rpo_min=excluded.rpo_min, rto_min=excluded.rto_min,
    brs=excluded.brs, rrs=excluded.rrs, dis=excluded.dis, cri=excluded.cri, alertas_abertos=excluded.alertas_abertos, updated_at=now();
END$$;

-- ----------------------------------------------------------------------------
-- 12) TICK */15 (motor incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_backup_recovery(p_trace text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.backup_snapshot(coalesce(p_trace,'run_'||to_char(now(),'YYYYMMDDHH24MI')));
  PERFORM public.backup_restore_test();
  PERFORM public.backup_generate_alerts();
  PERFORM public.backup_statistics_rollup();
  v := public.backup_scores();
  RETURN jsonb_build_object('ok',true,'brs',v->'brs','rrs',v->'rrs','dis',v->'dis','cri',public.backup_cri());
END$$;

CREATE OR REPLACE FUNCTION public.orion_backup_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_backup_recovery('cron_'||to_char(now(),'YYYYMMDDHH24MI'));
END$$;

-- ----------------------------------------------------------------------------
-- 13) SUITE DE TESTE AUTOMATIZADO (COMANDO TESTE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE casos jsonb := '[]'::jsonb; v_pass int := 0; v_tot int := 0;
BEGIN
  -- 1 catalogo
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM public.orion_backup_catalog) > 0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','catalogo_populado','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','catalogo_populado','ok',false)); END IF;
  -- 2 evidencias imutaveis (8 categorias no ultimo manifesto)
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM public.orion_backup_evidence WHERE job_id=(SELECT max(job_id) FROM public.orion_backup_jobs WHERE tipo='schema_manifest'))=8
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_8_categorias','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_8_categorias','ok',false)); END IF;
  -- 3 scores no intervalo 0-100
  v_tot:=v_tot+1;
  IF (SELECT (s->>'brs')::int BETWEEN 0 AND 100 AND (s->>'rrs')::int BETWEEN 0 AND 100 AND (s->>'dis')::int BETWEEN 0 AND 100
      FROM (SELECT public.backup_scores() s) x) THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','scores_validos','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','scores_validos','ok',false)); END IF;
  -- 4 restore test roda e gera relatorio
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM public.orion_restore_tests) > 0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','restore_test_registrado','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','restore_test_registrado','ok',false)); END IF;
  -- 5 plano de recuperacao ativo existe
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM public.orion_recovery_plans WHERE ativo) > 0 THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','plano_ativo','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','plano_ativo','ok',false)); END IF;
  -- 6 RLS ativo nas tabelas do modulo
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'orion_backup%' AND NOT rowsecurity)=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','rls_ativo','ok',false)); END IF;
  -- 7 evidencias imutaveis (sem grant de update/delete)
  v_tot:=v_tot+1;
  IF (SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='orion_backup_evidence'
      AND grantee IN ('anon','authenticated') AND privilege_type IN ('UPDATE','DELETE'))=0
    THEN v_pass:=v_pass+1; casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_imutaveis','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','evidencias_imutaveis','ok',false)); END IF;
  -- 8 integridade validavel
  v_tot:=v_tot+1;
  IF (SELECT (public.backup_validate_integrity()->>'manifesto_atual') IS NOT NULL) THEN v_pass:=v_pass+1;
    casos:=casos||jsonb_build_array(jsonb_build_object('t','integridade_validavel','ok',true));
  ELSE casos:=casos||jsonb_build_array(jsonb_build_object('t','integridade_validavel','ok',false)); END IF;

  RETURN jsonb_build_object('suite','orion-ai-46-backup-recovery','total',v_tot,'passou',v_pass,
    'aprovado',(v_pass=v_tot),'casos',casos);
END$$;

-- ----------------------------------------------------------------------------
-- 14) PAINEIS (leitura agregada)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backup_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.backup_scores() || jsonb_build_object(
    'cri', public.backup_cri(),
    'ultimo_backup', (SELECT fim FROM public.orion_backup_jobs WHERE status='concluido' ORDER BY job_id DESC LIMIT 1),
    'ultimo_tipo', (SELECT tipo FROM public.orion_backup_jobs WHERE status='concluido' ORDER BY job_id DESC LIMIT 1),
    'ultimo_status', (SELECT integridade FROM public.orion_backup_jobs WHERE status='concluido' ORDER BY job_id DESC LIMIT 1),
    'tempo_medio_s', (SELECT coalesce(round(avg(duracao_s))::int,0) FROM public.orion_backup_jobs WHERE duracao_s IS NOT NULL),
    'falhas', (SELECT count(*) FROM public.orion_backup_jobs WHERE status='falhou'),
    'backups_por_tipo', (SELECT coalesce(jsonb_object_agg(tipo,n),'{}'::jsonb) FROM (SELECT tipo,count(*) n FROM public.orion_backup_catalog WHERE presente GROUP BY tipo) x),
    'restore_testados', (SELECT count(*) FROM public.orion_restore_tests),
    'restore_aprovados', (SELECT count(*) FROM public.orion_restore_tests WHERE status='aprovado'),
    'alertas_abertos', (SELECT count(*) FROM public.orion_backup_alerts WHERE status='aberto'),
    'proximo_backup', 'a cada 15min (cron orion_backup_tick)',
    'gerado_em', now());
$$;

CREATE OR REPLACE FUNCTION public.backup_catalog_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'referencia',referencia,'metodo',metodo,'presente',presente,
    'integro',integro,'criado_em',criado_em,'evidencias',evidencias) ORDER BY presente DESC, tipo),'[]'::jsonb)
  FROM public.orion_backup_catalog;
$$;

CREATE OR REPLACE FUNCTION public.backup_restore_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'ultimo', (SELECT jsonb_build_object('status',status,'validados',itens_validados,'ok',itens_ok,'falhas',falhas,
        'rto_min',rto_estimado_min,'relatorio',relatorio,'em',iniciado_em) FROM public.orion_restore_tests ORDER BY test_id DESC LIMIT 1),
    'historico', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',test_id,'status',status,'ok',itens_ok,'falhas',falhas,'em',iniciado_em) ORDER BY test_id DESC),'[]'::jsonb)
        FROM (SELECT * FROM public.orion_restore_tests ORDER BY test_id DESC LIMIT 10) x),
    'integridade', public.backup_validate_integrity());
$$;

CREATE OR REPLACE FUNCTION public.backup_plans_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'planos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',plan_id,'nome',nome,'escopo',escopo,'rpo_meta_min',rpo_meta_min,
        'rto_meta_min',rto_meta_min,'prioridade',prioridade,'ativo',ativo,'passos',passos) ORDER BY prioridade),'[]'::jsonb)
        FROM public.orion_recovery_plans),
    'eventos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',event_id,'tipo',tipo,'status',status,'motivo',motivo,'operador',operador,'em',created_at) ORDER BY event_id DESC),'[]'::jsonb)
        FROM (SELECT * FROM public.orion_recovery_events ORDER BY event_id DESC LIMIT 15) x));
$$;

CREATE OR REPLACE FUNCTION public.backup_alerts_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'abertos', (SELECT count(*) FROM public.orion_backup_alerts WHERE status='aberto'),
    'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',alert_id,'tipo',tipo,'severidade',severidade,'mensagem',mensagem,
        'status',status,'evidencias',evidencias,'em',created_at) ORDER BY (severidade='critica') DESC, created_at DESC),'[]'::jsonb)
        FROM public.orion_backup_alerts WHERE dia > current_date - 7));
$$;

CREATE OR REPLACE FUNCTION public.backup_history_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'jobs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',job_id,'tipo',tipo,'origem',origem,'objetos',objetos,
        'integridade',integridade,'status',status,'duracao_s',duracao_s,'checksum',left(checksum,12),'em',inicio) ORDER BY job_id DESC),'[]'::jsonb)
        FROM (SELECT * FROM public.orion_backup_jobs ORDER BY job_id DESC LIMIT 20) x),
    'evidencias_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria',categoria,'objetos',objetos,'checksum',left(checksum,12),'criticidade',criticidade) ORDER BY criticidade),'[]'::jsonb)
        FROM public.orion_backup_evidence WHERE job_id=(SELECT max(job_id) FROM public.orion_backup_jobs WHERE tipo='schema_manifest')));
$$;

CREATE OR REPLACE FUNCTION public.backup_statistics_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'serie_7d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'brs',brs,'rrs',rrs,'dis',dis,'cri',cri,
        'rpo_min',rpo_min,'rto_min',rto_min,'restore_tests',restore_tests,'alertas',alertas_abertos) ORDER BY dia DESC),'[]'::jsonb)
        FROM (SELECT * FROM public.orion_backup_statistics ORDER BY dia DESC LIMIT 7) x),
    'totais', jsonb_build_object(
      'jobs', (SELECT count(*) FROM public.orion_backup_jobs),
      'evidencias', (SELECT count(*) FROM public.orion_backup_evidence),
      'restore_tests', (SELECT count(*) FROM public.orion_restore_tests),
      'eventos_bus', (SELECT count(*) FROM public.orion_eventos WHERE origem='backup_recovery')));
$$;

CREATE OR REPLACE FUNCTION public.backup_config_view()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'cron', jsonb_build_object('job','orion_backup_tick','schedule','*/15 * * * *'),
    'modelo_ia', (SELECT model_code FROM public.orion_ai_module_prefs WHERE module='backup_recovery'),
    'planos_ativos', (SELECT count(*) FROM public.orion_recovery_plans WHERE ativo),
    'escopo_monitorado', jsonb_build_array('banco/postgres','storage(declarado)','edge_functions(declarado)','config','secrets(so existencia)','RLS','funcoes','cron','indices'),
    'seguranca', 'NUNCA acessa/expoe senhas/secrets/tokens; valida SO existencia/integridade/disponibilidade',
    'lacunas', jsonb_build_array(
      'snapshots fisicos/storage/edge/secrets: existencia via Management API (edge com token) — DECLARADO',
      'restore real: exige ambiente separado + aprovacao humana (DECLARADO) — nunca automatico',
      'AI-45 Incident Response nao existe: handoff no barramento (backup.handoff_ai45)'));
$$;

CREATE OR REPLACE FUNCTION public.backup_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'overview', public.backup_overview(),
    'catalog', public.backup_catalog_view(),
    'restore', public.backup_restore_view(),
    'plans', public.backup_plans_view(),
    'alerts', public.backup_alerts_view(),
    'history', public.backup_history_view(),
    'statistics', public.backup_statistics_view(),
    'config', public.backup_config_view());
$$;

CREATE OR REPLACE FUNCTION public.backup_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.backup_summary();
  PERFORM public.backup_emit('backup.dashboard', jsonb_build_object('cri', public.backup_cri()));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 15) SEED: plano de recuperacao baseline
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_recovery_plans (dedupe_key, nome, escopo, rpo_meta_min, rto_meta_min, prioridade, passos)
VALUES ('plan:banco_completo', 'Recuperacao do Banco (completo)', 'banco', 60, 240, 1,
  jsonb_build_array(
    '1. Confirmar incidente e congelar escrita (modo manutencao)',
    '2. Selecionar ponto de restauracao (WAL-G/PITR quando disponivel)',
    '3. Restaurar em ambiente isolado e validar manifesto (checksums)',
    '4. Rodar backup_restore_test e comparar objetos criticos',
    '5. Aprovacao humana (backup_approve_recovery) antes de promover',
    '6. Promover e revalidar RLS/funcoes/cron; encerrar incidente'))
ON CONFLICT (dedupe_key) DO NOTHING;

INSERT INTO public.orion_recovery_plans (dedupe_key, nome, escopo, rpo_meta_min, rto_meta_min, prioridade, passos)
VALUES ('plan:config_schema', 'Recuperacao de Schema/Config', 'config', 1440, 120, 2,
  jsonb_build_array('1. Comparar manifesto atual vs baseline (drift)','2. Reaplicar migrations idempotentes','3. Revalidar RLS/grants/cron'))
ON CONFLICT (dedupe_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 16) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.backup_snapshot(text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_sync_catalog(jsonb)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_validate_integrity()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_test()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_scores()                       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_cri()                          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_generate_alerts()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_request_recovery(bigint,text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_approve_recovery(bigint,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_statistics_rollup()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_backup_recovery(text)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_selftest()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_overview()                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_catalog_view()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_view()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_plans_view()                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_alerts_view()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_history_view()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_statistics_view()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_config_view()                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_summary()                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.backup_dashboard()                    TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 17) PROMPT REGISTRY (5 prompts GPT-5-mini via AI-00 Gateway)
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('backup.validate',
 'Voce e o ORION Backup & Disaster Recovery (AI-46). Explique o estado de validacao dos backups (WAL-G, PITR, snapshots, manifesto de schema, integridade) usando SOMENTE as evidencias. Nunca afirme que ha backup restauravel sem evidencia.',
 'ORION-AI-46 seed');
SELECT public.orion_ai_prompt_set('backup.restore',
 'Voce e o ORION Backup & Disaster Recovery (AI-46). Explique o resultado do teste de restauracao NAO-destrutivo (casos validados, falhas, RTO estimado). Lembre que restore real exige ambiente separado e aprovacao humana.',
 'ORION-AI-46 seed');
SELECT public.orion_ai_prompt_set('backup.summary',
 'Voce e o ORION Backup & Disaster Recovery (AI-46). Resuma a postura de continuidade: BRS/RRS/DIS/CRI, RPO/RTO vs metas, cobertura e alertas abertos. Apenas numeros fornecidos.',
 'ORION-AI-46 seed');
SELECT public.orion_ai_prompt_set('backup.risk',
 'Voce e o ORION Backup & Disaster Recovery (AI-46). Avalie o risco de continuidade a partir de PITR/snapshot/drift/RPO. Explique o Disaster Impact Score e o que aumenta o risco. Sem especulacao.',
 'ORION-AI-46 seed');
SELECT public.orion_ai_prompt_set('backup.recommendation',
 'Voce e o ORION Backup & Disaster Recovery (AI-46). Recomende acoes proporcionais (habilitar PITR, agendar snapshots, testar restore, revisar plano). Priorize por impacto x esforco. Nunca proponha restore automatico em producao.',
 'ORION-AI-46 seed');

-- ----------------------------------------------------------------------------
-- 18) MODEL PREF + CRON */15
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('backup_recovery','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_backup_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_backup_tick');
    PERFORM cron.schedule('orion_backup_tick','*/15 * * * *','SELECT public.orion_backup_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_backup_tick');
--   DROP FUNCTION IF EXISTS public.orion_backup_tick, public.run_backup_recovery(text), public.backup_dashboard,
--     public.backup_summary, public.backup_config_view, public.backup_statistics_view, public.backup_history_view,
--     public.backup_alerts_view, public.backup_plans_view, public.backup_restore_view, public.backup_catalog_view,
--     public.backup_overview, public.backup_selftest, public.backup_statistics_rollup,
--     public.backup_approve_recovery(bigint,boolean,text), public.backup_request_recovery(bigint,text),
--     public.backup_generate_alerts, public.backup_cri, public.backup_scores, public.backup_restore_test,
--     public.backup_validate_integrity, public.backup_sync_catalog(jsonb), public.backup_snapshot(text), public.backup_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_backup_statistics, public.orion_backup_alerts, public.orion_recovery_events,
--     public.orion_recovery_plans, public.orion_restore_tests, public.orion_backup_evidence,
--     public.orion_backup_catalog, public.orion_backup_jobs;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='backup_recovery';
--   DELETE FROM public.orion_ai_prompts WHERE chave LIKE 'backup.%';
-- ============================================================================
