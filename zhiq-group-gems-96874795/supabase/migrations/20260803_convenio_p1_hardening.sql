-- ═══════════════════════════════════════════════════════════════════════════
-- Comando Convênio · FASE P1 — correções críticas de homologação
--
--   1) P1-02 — revoga o GRANT SELECT residual de anon em convenio_partner_leads
--      (a default ACL do schema public re-concede SELECT a anon em tabela nova;
--      o REVOKE da migration 20260802 não ficou efetivo no banco real).
--   2) P1-01 — cria convenio_entity_referrals: destino REAL do formulário
--      público "Indicar entidade" (/medprev), que antes era simulado no front.
--      INSERT público (anon + authenticated), leitura/gestão só do Gestor.
--   3) P1-08 — captura server-side de origem/IP: trigger BEFORE INSERT que
--      preenche source_ip a partir dos headers da requisição (x-forwarded-for)
--      em convenio_partner_leads e convenio_entity_referrals; e versão 2 do
--      convenio_audit_trigger() acrescentando _meta (ip, origin, referer,
--      user_agent) ao details, sem alterar o formato existente das chaves.
--      Auditoria automática passa a cobrir também partner_leads e referrals.
--   4) P1-05 — policy de Storage permitindo leitura pública SOMENTE dos
--      documentos de prestação de contas cujo relatório está 'publicada'
--      (botão "Ver" da página pública abre o documento de verdade).
--
-- Projeto: broifhfqmnzqoongtokm — idempotente; aplicar via SQL Editor ou
-- supabase db query --file — NUNCA supabase db push.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. P1-02 — partner leads: anon volta a ter apenas INSERT
-- ─────────────────────────────────────────────────────────────────────────

REVOKE SELECT ON public.convenio_partner_leads FROM anon;
GRANT INSERT ON public.convenio_partner_leads TO anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. P1-01 — convenio_entity_referrals (indicações de entidades)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.convenio_entity_referrals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_entidade  TEXT NOT NULL CHECK (char_length(btrim(nome_entidade)) BETWEEN 2 AND 150),
  cidade         TEXT NOT NULL CHECK (char_length(btrim(cidade)) BETWEEN 2 AND 100),
  responsavel    TEXT CHECK (responsavel IS NULL OR char_length(responsavel) <= 150),
  telefone       TEXT CHECK (telefone IS NULL OR char_length(regexp_replace(telefone, '\D', '', 'g')) BETWEEN 10 AND 11),
  motivo         TEXT CHECK (motivo IS NULL OR char_length(motivo) <= 1000),
  consentimento  BOOLEAN NOT NULL DEFAULT false CHECK (consentimento IS TRUE),
  origem         TEXT NOT NULL DEFAULT 'medprev_public',
  source_ip      TEXT,
  created_by     UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'novo' CHECK (status IN (
                   'novo', 'em_analise', 'contatado', 'aprovado', 'recusado'
                 )),
  observacoes    TEXT,
  reviewed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.convenio_entity_referrals IS
'Comando Convênio P1: indicações de entidades enviadas pelo botão "Indicar entidade" da página pública /medprev. created_by = usuário autenticado quando existir (NULL = visitante); origem/source_ip capturados server-side.';

CREATE INDEX IF NOT EXISTS idx_convenio_entity_referrals_status     ON public.convenio_entity_referrals (status);
CREATE INDEX IF NOT EXISTS idx_convenio_entity_referrals_created_at ON public.convenio_entity_referrals (created_at DESC);

CREATE OR REPLACE FUNCTION public.convenio_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convenio_entity_referrals_updated_at ON public.convenio_entity_referrals;
CREATE TRIGGER trg_convenio_entity_referrals_updated_at
  BEFORE UPDATE ON public.convenio_entity_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.convenio_set_updated_at();

ALTER TABLE public.convenio_entity_referrals ENABLE ROW LEVEL SECURITY;

-- INSERT público (formulário sem autenticação); nenhuma policy pública de
-- SELECT — visitantes não leem indicações, nem as próprias.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'convenio_entity_referrals' AND policyname = 'convenio_entity_referrals_insert_public'
  ) THEN
    CREATE POLICY "convenio_entity_referrals_insert_public" ON public.convenio_entity_referrals
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (status = 'novo' AND consentimento IS TRUE);
  END IF;
END $$;

DROP POLICY IF EXISTS convenio_entity_referrals_gestor_all ON public.convenio_entity_referrals;
CREATE POLICY convenio_entity_referrals_gestor_all ON public.convenio_entity_referrals
  FOR ALL TO authenticated
  USING (public.is_gestor_convenio())
  WITH CHECK (public.is_gestor_convenio());

-- Defesa em profundidade contra a default ACL do schema (SELECT automático
-- para anon em tabela nova): anon fica apenas com INSERT.
REVOKE SELECT ON public.convenio_entity_referrals FROM anon;
GRANT INSERT ON public.convenio_entity_referrals TO anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. P1-08 — origem/IP server-side + auditoria v2 + cobertura de leads
-- ─────────────────────────────────────────────────────────────────────────

-- Headers da requisição PostgREST (NULL fora desse contexto, ex.: SQL Editor).
CREATE OR REPLACE FUNCTION public.convenio_request_meta()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers JSONB;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ip',         NULLIF(btrim(split_part(COALESCE(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1)), ''),
    'origin',     v_headers->>'origin',
    'referer',    v_headers->>'referer',
    'user_agent', v_headers->>'user-agent'
  ));
END;
$$;

COMMENT ON FUNCTION public.convenio_request_meta() IS
'Comando Convênio P1: extrai ip/origin/referer/user-agent dos headers da requisição PostgREST. NULL quando não há contexto de requisição.';

-- BEFORE INSERT: preenche source_ip real (cliente não consegue forjar por
-- omissão — só é sobrescrito quando vazio).
CREATE OR REPLACE FUNCTION public.convenio_capture_request_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_meta JSONB;
BEGIN
  v_meta := public.convenio_request_meta();
  IF v_meta IS NOT NULL AND NEW.source_ip IS NULL THEN
    NEW.source_ip := v_meta->>'ip';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convenio_partner_leads_request_meta ON public.convenio_partner_leads;
CREATE TRIGGER trg_convenio_partner_leads_request_meta
  BEFORE INSERT ON public.convenio_partner_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.convenio_capture_request_meta();

DROP TRIGGER IF EXISTS trg_convenio_entity_referrals_request_meta ON public.convenio_entity_referrals;
CREATE TRIGGER trg_convenio_entity_referrals_request_meta
  BEFORE INSERT ON public.convenio_entity_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.convenio_capture_request_meta();

-- Auditoria v2: mesmas chaves de details (linha completa) + chave extra
-- _meta {ip, origin, referer, user_agent} quando houver contexto de request.
CREATE OR REPLACE FUNCTION public.convenio_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entity_id UUID;
  v_details JSONB;
  v_meta JSONB;
BEGIN
  v_entity_id := COALESCE(NEW.id, OLD.id);

  v_details := CASE TG_OP
    WHEN 'DELETE' THEN to_jsonb(OLD)
    ELSE to_jsonb(NEW)
  END;

  v_meta := public.convenio_request_meta();
  IF v_meta IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('_meta', v_meta);
  END IF;

  INSERT INTO public.convenio_audit_log (actor_id, action, entity_table, entity_id, details)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || ':' || lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    v_details
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

COMMENT ON FUNCTION public.convenio_audit_trigger() IS
'Comando Convênio P1 (v2): grava em convenio_audit_log a cada INSERT/UPDATE/DELETE das tabelas do módulo, incluindo _meta (ip/origin/referer/user_agent) quando disponível.';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['convenio_partner_leads', 'convenio_entity_referrals']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_convenio_audit ON public.%I;', t);
    EXECUTE format(
      'CREATE TRIGGER trg_convenio_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.convenio_audit_trigger();',
      t
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. P1-05 — leitura pública de documentos de relatórios PUBLICADOS
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS convenio_documentos_sel_public ON storage.objects;
CREATE POLICY convenio_documentos_sel_public ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'convenio-documentos'
    AND EXISTS (
      SELECT 1 FROM public.convenio_accountability a
      WHERE a.document_url = name AND a.status = 'publicada'
    )
  );

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '✅ Comando Convênio P1 — REVOKE anon aplicado, convenio_entity_referrals criada (RLS insert público), origem/IP server-side, auditoria v2 cobrindo leads/referrals, leitura pública de documentos publicados.';
END $$;
