-- ============================================================
-- VIAGENS — MODERAÇÃO ADMINISTRATIVA OFICIAL · 2026-07-23
-- ------------------------------------------------------------
-- Eleva o módulo Viagens ao padrão-ouro (Imóveis) no Painel Admin.
-- Complementa (NÃO sobrepõe) as migrations do mesmo dia:
--   • 20260723_travel_policies_hardening.sql  (RLS público/admin)
--   • 20260723_travel_schema_sync_oficial.sql (colunas + índices)
--   • 20260723_travel_storage_bucket_oficial.sql (bucket oficial)
--
-- Entrega:
--  1) Soft delete (deleted_at) em travel_listings.
--  2) Integridade: FKs para auth.users (NOT VALID + validação
--     best-effort) e CHECKs de sanidade de valores.
--  3) travel_audit_log — trilha de auditoria de anúncios/mídia
--     (INSERT/UPDATE/DELETE + toda decisão administrativa),
--     leitura restrita a admin.
--  4) RPCs SECURITY DEFINER de moderação para o Painel Admin:
--       admin_moderate_travel_listing(id, ação, motivo)
--         ações: approve · reject · request_changes · pause ·
--                archive · restore · soft_delete
--       admin_moderate_travel_media(id, ação, motivo)
--         ações: approve · reject
--     Ambas exigem public.is_admin() (RBAC 20260703_027) e gravam
--     auditoria com ator + motivo.
--  5) E-mail de publicação passa a disparar TAMBÉM quando o admin
--     APROVA (pending_review → published), não só no INSERT.
--
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. Soft delete ───────────────────────────────────────────
ALTER TABLE public.travel_listings
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_travel_listings_deleted
  ON public.travel_listings (deleted_at) WHERE deleted_at IS NOT NULL;

-- ── 2. Integridade referencial e de valores ──────────────────
-- FKs NOT VALID: passam a valer para linhas novas imediatamente;
-- a validação do legado é best-effort (warning se houver órfão).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_listings_owner_fk') THEN
    ALTER TABLE public.travel_listings
      ADD CONSTRAINT travel_listings_owner_fk
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_media_owner_fk') THEN
    ALTER TABLE public.travel_media
      ADD CONSTRAINT travel_media_owner_fk
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_contacts_owner_fk') THEN
    ALTER TABLE public.travel_listing_contacts
      ADD CONSTRAINT travel_contacts_owner_fk
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.travel_listings VALIDATE CONSTRAINT travel_listings_owner_fk;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'travel_listings_owner_fk não validada (órfãos no legado): %', sqlerrm;
  END;
  BEGIN
    ALTER TABLE public.travel_media VALIDATE CONSTRAINT travel_media_owner_fk;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'travel_media_owner_fk não validada: %', sqlerrm;
  END;
  BEGIN
    ALTER TABLE public.travel_listing_contacts VALIDATE CONSTRAINT travel_contacts_owner_fk;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'travel_contacts_owner_fk não validada: %', sqlerrm;
  END;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_listings_valores_ck') THEN
    ALTER TABLE public.travel_listings
      ADD CONSTRAINT travel_listings_valores_ck CHECK (
        (price_per_person IS NULL OR price_per_person >= 0)
        AND (total_price IS NULL OR total_price >= 0)
        AND (duration_days IS NULL OR duration_days >= 0)
        AND (available_spots IS NULL OR available_spots >= 0)
      ) NOT VALID;
  END IF;
END $$;

-- ── 3. Trilha de auditoria ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.travel_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity        text NOT NULL,            -- 'travel_listings' | 'travel_media'
  entity_id     uuid,
  action        text NOT NULL,            -- 'insert'|'update'|'delete'|'moderate:<ação>'
  actor_user_id uuid DEFAULT auth.uid(),  -- null em operações de sistema
  reason        text,
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_audit_entity
  ON public.travel_audit_log (entity, entity_id, created_at DESC);

ALTER TABLE public.travel_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS travel_audit_admin_read ON public.travel_audit_log;
CREATE POLICY travel_audit_admin_read ON public.travel_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
-- (sem policy de escrita: apenas triggers/RPCs SECURITY DEFINER e service_role)

REVOKE ALL ON public.travel_audit_log FROM PUBLIC, anon;
GRANT SELECT ON public.travel_audit_log TO authenticated;
GRANT ALL ON public.travel_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.travel_listings_audit_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.travel_audit_log (entity, entity_id, action, new_data)
    VALUES (TG_TABLE_NAME, NEW.id, 'insert', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.travel_audit_log (entity, entity_id, action, old_data, new_data)
      VALUES (TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSE
    INSERT INTO public.travel_audit_log (entity, entity_id, action, old_data)
    VALUES (TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_travel_listings_audit ON public.travel_listings;
CREATE TRIGGER trg_travel_listings_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.travel_listings
  FOR EACH ROW EXECUTE FUNCTION public.travel_listings_audit_trg();

DROP TRIGGER IF EXISTS trg_travel_media_audit ON public.travel_media;
CREATE TRIGGER trg_travel_media_audit
  AFTER UPDATE OR DELETE ON public.travel_media
  FOR EACH ROW EXECUTE FUNCTION public.travel_listings_audit_trg();

-- ── 4. RPCs de moderação (Painel Admin) ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_moderate_travel_listing(
  p_listing_id uuid,
  p_action     text,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old  public.travel_listings%ROWTYPE;
  v_new  public.travel_listings%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.travel_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'listing_not_found');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.travel_listings
       SET visibility_status = 'published',
           published_at      = COALESCE(published_at, now()),
           moderation_status = 'approved',
           moderation_reason = p_reason,
           deleted_at        = NULL,
           updated_at        = now()
     WHERE id = p_listing_id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.travel_listings
       SET visibility_status = 'rejected',
           moderation_status = 'rejected',
           moderation_reason = COALESCE(p_reason, 'Rejeitado pela moderação.'),
           updated_at        = now()
     WHERE id = p_listing_id;
  ELSIF p_action = 'request_changes' THEN
    UPDATE public.travel_listings
       SET visibility_status = 'draft',
           moderation_reason = COALESCE(p_reason, 'Ajustes solicitados pela moderação.'),
           updated_at        = now()
     WHERE id = p_listing_id;
  ELSIF p_action = 'pause' THEN
    UPDATE public.travel_listings
       SET visibility_status = 'paused', moderation_reason = p_reason, updated_at = now()
     WHERE id = p_listing_id;
  ELSIF p_action = 'archive' THEN
    UPDATE public.travel_listings
       SET visibility_status = 'archived', moderation_reason = p_reason, updated_at = now()
     WHERE id = p_listing_id;
  ELSIF p_action = 'restore' THEN
    UPDATE public.travel_listings
       SET visibility_status = CASE WHEN published_at IS NOT NULL THEN 'published' ELSE 'draft' END::public.real_estate_listing_status,
           deleted_at        = NULL,
           moderation_reason = p_reason,
           updated_at        = now()
     WHERE id = p_listing_id;
  ELSIF p_action = 'soft_delete' THEN
    UPDATE public.travel_listings
       SET visibility_status = 'archived',
           deleted_at        = now(),
           moderation_reason = COALESCE(p_reason, 'Removido pelo admin (soft delete).'),
           updated_at        = now()
     WHERE id = p_listing_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'acao_invalida');
  END IF;

  SELECT * INTO v_new FROM public.travel_listings WHERE id = p_listing_id;

  INSERT INTO public.travel_audit_log (entity, entity_id, action, actor_user_id, reason, old_data, new_data)
  VALUES ('travel_listings', p_listing_id, 'moderate:' || p_action, auth.uid(), p_reason,
          jsonb_build_object('visibility_status', v_old.visibility_status, 'deleted_at', v_old.deleted_at),
          jsonb_build_object('visibility_status', v_new.visibility_status, 'deleted_at', v_new.deleted_at));

  RETURN jsonb_build_object(
    'success', true,
    'listing_id', p_listing_id,
    'action', p_action,
    'old_status', v_old.visibility_status,
    'new_status', v_new.visibility_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_moderate_travel_listing(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_moderate_travel_media(
  p_media_id uuid,
  p_action   text,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  SELECT moderation_status::text INTO v_old_status
    FROM public.travel_media WHERE id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'media_not_found');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.travel_media
       SET moderation_status = 'approved', updated_at = now()
     WHERE id = p_media_id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.travel_media
       SET moderation_status = 'rejected', updated_at = now()
     WHERE id = p_media_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'acao_invalida');
  END IF;

  INSERT INTO public.travel_audit_log (entity, entity_id, action, actor_user_id, reason, old_data, new_data)
  VALUES ('travel_media', p_media_id, 'moderate:' || p_action, auth.uid(), p_reason,
          jsonb_build_object('moderation_status', v_old_status),
          jsonb_build_object('moderation_status', CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END));

  RETURN jsonb_build_object('success', true, 'media_id', p_media_id, 'action', p_action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_moderate_travel_media(uuid, text, text) TO authenticated;

-- ── 5. E-mail de publicação também na APROVAÇÃO do admin ─────
-- (a função notify_advertiser_on_travel_listing_published já
--  existe — 20260624; só o gatilho muda: INSERT OU transição
--  de status para 'published' via UPDATE.)
DROP TRIGGER IF EXISTS trg_notify_advertiser_on_travel_listing_published ON public.travel_listings;
CREATE TRIGGER trg_notify_advertiser_on_travel_listing_published
  AFTER INSERT ON public.travel_listings
  FOR EACH ROW
  WHEN (NEW.visibility_status = 'published')
  EXECUTE FUNCTION public.notify_advertiser_on_travel_listing_published();

DROP TRIGGER IF EXISTS trg_notify_advertiser_on_travel_listing_approved ON public.travel_listings;
CREATE TRIGGER trg_notify_advertiser_on_travel_listing_approved
  AFTER UPDATE OF visibility_status ON public.travel_listings
  FOR EACH ROW
  WHEN (NEW.visibility_status = 'published' AND OLD.visibility_status IS DISTINCT FROM 'published')
  EXECUTE FUNCTION public.notify_advertiser_on_travel_listing_published();

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Esperado: soft_delete_ok=1 · fks_ok=3 · audit_ok=1 · rpcs_ok=2
SELECT
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND table_name='travel_listings' AND column_name='deleted_at') AS soft_delete_ok,
  (SELECT count(*)::int FROM pg_constraint
    WHERE conname IN ('travel_listings_owner_fk','travel_media_owner_fk','travel_contacts_owner_fk')) AS fks_ok,
  (SELECT count(*)::int FROM pg_tables
    WHERE schemaname='public' AND tablename='travel_audit_log') AS audit_ok,
  (SELECT count(*)::int FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname IN ('admin_moderate_travel_listing','admin_moderate_travel_media')) AS rpcs_ok;
