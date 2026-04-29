-- ═══════════════════════════════════════════════════════════
-- POSTADOR NOTIFICATIONS
-- Estende user_notifications + trigger em posting_lot_events
-- Run ALL of this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN RAISE LOG 'POSTADOR NOTIFICATIONS MIGRATION START'; END $$;


-- ═══════════════════════════════════════
-- PARTE 1: Criar user_notifications se nao existe
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  type        TEXT DEFAULT 'system',
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_notifications' AND policyname = 'Users can read own notifications'
  ) THEN
    CREATE POLICY "Users can read own notifications"
      ON public.user_notifications FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_notifications' AND policyname = 'Users can update own notifications'
  ) THEN
    CREATE POLICY "Users can update own notifications"
      ON public.user_notifications FOR UPDATE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;


-- ═══════════════════════════════════════
-- PARTE 2: Estender user_notifications
-- Novas colunas para modulo, severity, referencia
-- ═══════════════════════════════════════

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS source_module   TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS severity        TEXT DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS reference_type  TEXT,
  ADD COLUMN IF NOT EXISTS reference_id    UUID,
  ADD COLUMN IF NOT EXISTS profile_type    TEXT DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS read_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata        JSONB DEFAULT '{}'::jsonb;

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_user_notif_user_read
  ON public.user_notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_source
  ON public.user_notifications (source_module);
CREATE INDEX IF NOT EXISTS idx_user_notif_ref
  ON public.user_notifications (reference_type, reference_id);

COMMENT ON TABLE public.user_notifications IS
'Notificacoes centralizadas do app. Suporta multiplos modulos (postador, delivery, system) e perfis (motoboy, lojista, admin).';


-- ═══════════════════════════════════════
-- PARTE 3: Funcao trigger notify_lot_event
-- Transforma posting_lot_events em user_notifications
-- ═══════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname='notify_lot_event' AND pronamespace='public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.notify_lot_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_lot         record;
  v_title       TEXT;
  v_message     TEXT;
  v_severity    TEXT;
  v_target_user UUID;
  v_now         TIMESTAMPTZ := now();
BEGIN
  -- Buscar dados do lote
  SELECT * INTO v_lot
  FROM public.posting_lots
  WHERE id = NEW.lot_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Mapear event_type para titulo/mensagem/severity
  CASE NEW.event_type
    WHEN 'created' THEN
      v_title    := 'Novo lote disponivel';
      v_message  := format('Lote de %s com %s ofertas esta pronto para postagem',
                    COALESCE(v_lot.store_name, 'Loja'), COALESCE(v_lot.items_count, 0));
      v_severity := 'info';
      -- Notificar TODOS os motoboys? Nao — seria flood.
      -- Notificacao de "novo lote" so aparece quando o motoboy abre o painel.
      -- Nao gerar notificacao individual aqui.
      RETURN NEW;

    WHEN 'claimed' THEN
      v_title    := 'Lote reservado';
      v_message  := format('Voce assumiu o lote de %s. Confirme em ate 30 minutos.',
                    COALESCE(v_lot.store_name, 'Loja'));
      v_severity := 'success';
      v_target_user := NEW.user_id;

    WHEN 'confirmed' THEN
      v_title    := 'Postagem confirmada!';
      v_message  := format('Lote de %s confirmado com sucesso. Cooldown de 6 dias aplicado.',
                    COALESCE(v_lot.store_name, 'Loja'));
      v_severity := 'success';
      v_target_user := NEW.user_id;

    WHEN 'released' THEN
      v_title    := 'Lote liberado';
      v_message  := format('O lote de %s foi liberado e esta disponivel novamente.',
                    COALESCE(v_lot.store_name, 'Loja'));
      v_severity := 'info';
      v_target_user := NEW.user_id;

    WHEN 'expired' THEN
      v_title    := 'Claim expirado';
      v_message  := format('O prazo para confirmar o lote de %s expirou. O lote foi liberado.',
                    COALESCE(v_lot.store_name, 'Loja'));
      v_severity := 'warning';
      v_target_user := COALESCE(NEW.user_id, v_lot.operator_user_id);

    WHEN 'error' THEN
      v_title    := 'Erro na confirmacao';
      v_message  := format('Falha ao confirmar o lote de %s. Tente novamente.',
                    COALESCE(v_lot.store_name, 'Loja'));
      v_severity := 'error';
      v_target_user := COALESCE(NEW.user_id, v_lot.operator_user_id);

    ELSE
      -- Eventos nao mapeados nao geram notificacao (viewed, click, etc.)
      RETURN NEW;
  END CASE;

  -- Se nao temos target_user, nao gerar notificacao
  IF v_target_user IS NULL THEN
    RETURN NEW;
  END IF;

  -- Anti-flood: nao duplicar notificacao identica no mesmo minuto
  IF EXISTS (
    SELECT 1 FROM public.user_notifications
    WHERE user_id = v_target_user
      AND source_module = 'postador'
      AND reference_id = NEW.lot_id
      AND title = v_title
      AND created_at > (v_now - INTERVAL '1 minute')
  ) THEN
    RETURN NEW;
  END IF;

  -- Inserir notificacao
  INSERT INTO public.user_notifications (
    user_id, title, message, type, source_module,
    severity, reference_type, reference_id,
    profile_type, is_read, metadata, created_at
  ) VALUES (
    v_target_user,
    v_title,
    v_message,
    'postador',
    'postador',
    v_severity,
    'lot',
    NEW.lot_id,
    'motoboy',
    false,
    jsonb_build_object(
      'event_type', NEW.event_type,
      'store_name', v_lot.store_name,
      'items_count', v_lot.items_count,
      'lot_status', v_lot.status
    ),
    v_now
  );

  RETURN NEW;
END; $fn$;

COMMENT ON FUNCTION public.notify_lot_event IS
'POSTADOR: Trigger function que transforma posting_lot_events em user_notifications. Anti-flood integrado.';


-- ═══════════════════════════════════════
-- PARTE 4: Trigger na tabela posting_lot_events
-- ═══════════════════════════════════════

DROP TRIGGER IF EXISTS trg_lot_event_to_notification ON public.posting_lot_events;

CREATE TRIGGER trg_lot_event_to_notification
  AFTER INSERT ON public.posting_lot_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_lot_event();

COMMENT ON TRIGGER trg_lot_event_to_notification ON public.posting_lot_events IS
'POSTADOR: Auto-gera notificacao no sino quando evento de lote acontece.';


-- ═══════════════════════════════════════
-- PARTE 5: Garantir realtime habilitado
-- ═══════════════════════════════════════

-- Pode falhar se ja estiver adicionada — ignorar erro
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;


-- ═══════════════════════════════════════
-- PARTE 6: Notificacao para lojista (lote criado com seus produtos)
-- ═══════════════════════════════════════

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname='notify_lot_created_to_merchant' AND pronamespace='public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.notify_lot_created_to_merchant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_lot record;
BEGIN
  IF NEW.event_type != 'created' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_lot
  FROM public.posting_lots
  WHERE id = NEW.lot_id;

  IF NOT FOUND OR v_lot.store_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Notificar lojista que seus produtos entraram em lote
  INSERT INTO public.user_notifications (
    user_id, title, message, type, source_module,
    severity, reference_type, reference_id,
    profile_type, is_read, metadata
  ) VALUES (
    v_lot.store_user_id,
    'Seus produtos estao em campanha!',
    format('Um lote com %s dos seus produtos foi criado para divulgacao territorial.',
           COALESCE(v_lot.items_count, 0)),
    'postador',
    'postador',
    'info',
    'lot',
    NEW.lot_id,
    'lojista',
    false,
    jsonb_build_object(
      'store_name', v_lot.store_name,
      'items_count', v_lot.items_count
    )
  );

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_lot_created_notify_merchant ON public.posting_lot_events;

CREATE TRIGGER trg_lot_created_notify_merchant
  AFTER INSERT ON public.posting_lot_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'created')
  EXECUTE FUNCTION public.notify_lot_created_to_merchant();

COMMENT ON FUNCTION public.notify_lot_created_to_merchant IS
'POSTADOR: Notifica lojista quando seus produtos entram em lote de campanha territorial.';


DO $$ BEGIN RAISE LOG 'POSTADOR NOTIFICATIONS MIGRATION COMPLETE'; END $$;
