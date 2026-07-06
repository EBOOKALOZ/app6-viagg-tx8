-- ============================================================
-- COMISSÃO INTELIGENTE — Sincronização oficial + Auditoria Admin
--
-- Problema corrigido:
--   O despacho cobra usando profiles.percentual_comissao_atual
--   (COALESCE(..., 20)), mas NENHUM código atualizava esse campo
--   nem profiles.quantidade_grupos_ativos quando grupos mudavam.
--   Resultado: comissão exibida ≠ comissão cobrada.
--
-- Fonte oficial de grupos: public.whatsapp_groups
--   (valid_for_commission já é mantido pelo trigger
--    trg_enforce_group_validity — aprovado + ativo + ≥90 membros
--    + postou nos últimos 30 dias)
--
-- Escada oficial (0→5+ grupos): 25 / 20 / 16 / 12 / 9 / 6 %
-- Override do admin (commission_overrides.custom_rate) tem precedência.
--
-- Rodar no SQL Editor do projeto broifhfqmnzqoongtokm.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Checagem de admin tolerante a schema (não quebra se
--    user_roles ou profiles.is_admin não existirem no projeto)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role::text = ''admin'')'
        INTO v USING auth.uid();
      IF v THEN RETURN true; END IF;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT COALESCE(is_admin, false) FROM public.profiles WHERE id = $1'
        INTO v USING auth.uid();
      IF v THEN RETURN true; END IF;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END IF;

  RETURN false;
END;
$$;

-- ------------------------------------------------------------
-- 1. Escada oficial como função única (elimina valores fixos espalhados)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commission_rate_for_groups(p_groups int)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_groups, 0) >= 5 THEN 6
    WHEN p_groups = 4 THEN 9
    WHEN p_groups = 3 THEN 12
    WHEN p_groups = 2 THEN 16
    WHEN p_groups = 1 THEN 20
    ELSE 25
  END;
$$;

-- ------------------------------------------------------------
-- 2. Histórico de alterações de comissão (para o Painel Admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_groups int,
  new_groups int NOT NULL,
  old_percent numeric,
  new_percent numeric NOT NULL,
  reason text NOT NULL DEFAULT 'groups_change',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_history_user
  ON public.commission_rate_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_history_created
  ON public.commission_rate_history (created_at DESC);

ALTER TABLE public.commission_rate_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "commission_history_select_own"
    ON public.commission_rate_history FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2b. Tabela de overrides do admin (o app já usa, mas ela nunca
--     foi criada neste projeto Supabase — 42P01 sem este bloco).
--     Colunas espelham exatamente o que o front envia
--     (lib/api.ts: upsert {user_id, custom_rate, set_by_admin}
--      com onConflict: 'user_id').
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  custom_rate numeric NOT NULL,
  set_by_admin uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_overrides ENABLE ROW LEVEL SECURITY;

-- Admins gerenciam; demais usuários podem apenas LER o próprio override
DO $$ BEGIN
  CREATE POLICY "commission_overrides_admin_all"
    ON public.commission_overrides FOR ALL
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "commission_overrides_select_own"
    ON public.commission_overrides FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 2c. Alinhamento de colunas — este projeto NÃO tinha as colunas
--     que o código inteiro usa (42703 sem este bloco):
--     · profiles.quantidade_grupos_ativos / percentual_comissao_atual
--     · whatsapp_groups.owner_user_id / valid_for_commission
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quantidade_grupos_ativos int DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS percentual_comissao_atual numeric DEFAULT 25;

ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS valid_for_commission boolean NOT NULL DEFAULT false;

-- Se a tabela legada usava user_id, copia para owner_user_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'whatsapp_groups'
               AND column_name = 'user_id') THEN
    UPDATE public.whatsapp_groups
    SET owner_user_id = user_id
    WHERE owner_user_id IS NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Recalcula e PERSISTE a comissão de um usuário
--    (grupos válidos → escada; override do admin tem precedência)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_user_commission(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_groups      int;
  v_override    numeric;
  v_rate        numeric;
  v_old_groups  int;
  v_old_percent numeric;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_groups
  FROM public.whatsapp_groups
  WHERE owner_user_id = p_user_id
    AND valid_for_commission = true;

  SELECT custom_rate INTO v_override
  FROM public.commission_overrides
  WHERE user_id = p_user_id
  LIMIT 1;

  v_rate := COALESCE(v_override, public.commission_rate_for_groups(v_groups));

  SELECT quantidade_grupos_ativos, percentual_comissao_atual
    INTO v_old_groups, v_old_percent
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_old_groups IS DISTINCT FROM v_groups
     OR v_old_percent IS DISTINCT FROM v_rate THEN

    UPDATE public.profiles
    SET quantidade_grupos_ativos  = v_groups,
        percentual_comissao_atual = v_rate
    WHERE id = p_user_id;

    INSERT INTO public.commission_rate_history
      (user_id, old_groups, new_groups, old_percent, new_percent, reason)
    VALUES
      (p_user_id, v_old_groups, v_groups, v_old_percent, v_rate,
       CASE WHEN v_override IS NOT NULL THEN 'override' ELSE 'groups_change' END);
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 4. Trigger: qualquer mudança em whatsapp_groups → recalcular dono
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_whatsapp_groups_commission_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recalc_user_commission(NEW.owner_user_id);
  END IF;
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
    PERFORM public.recalc_user_commission(OLD.owner_user_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_sync ON public.whatsapp_groups;
CREATE TRIGGER trg_commission_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_whatsapp_groups_commission_sync();

-- ------------------------------------------------------------
-- 5. Trigger: mudança em commission_overrides → recalcular usuário
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_commission_overrides_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recalc_user_commission(NEW.user_id);
  END IF;
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    PERFORM public.recalc_user_commission(OLD.user_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_overrides_commission_sync ON public.commission_overrides;
CREATE TRIGGER trg_overrides_commission_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.commission_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_commission_overrides_sync();

-- ------------------------------------------------------------
-- 6. Defaults corretos (novos usuários nascem na faixa inicial 25%,
--    nunca mais caem no COALESCE(..., 20) do despacho)
-- ------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN percentual_comissao_atual SET DEFAULT 25;
ALTER TABLE public.profiles ALTER COLUMN quantidade_grupos_ativos  SET DEFAULT 0;

-- ------------------------------------------------------------
-- 7. BACKFILL: normaliza todos os usuários existentes agora
--    (corrige valores órfãos 30/35 e NULLs que viravam 20 na cobrança)
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.recalc_user_commission(r.id);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 8. RPC Admin: visão geral da Comissão Inteligente
--    (grupos reais × valores persistidos × esperado × override)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_commission_overview()
RETURNS TABLE(
  user_id uuid,
  name text,
  email text,
  cidade text,
  estado text,
  valid_groups int,
  total_groups int,
  persisted_groups int,
  persisted_percent numeric,
  expected_percent int,
  override_rate numeric,
  is_consistent boolean,
  last_change_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Somente admins
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.email,
    p.cidade,
    p.estado,
    COALESCE(g.valid, 0)::int,
    COALESCE(g.total, 0)::int,
    p.quantidade_grupos_ativos,
    p.percentual_comissao_atual,
    public.commission_rate_for_groups(COALESCE(g.valid, 0)::int),
    o.custom_rate,
    (
      COALESCE(p.quantidade_grupos_ativos, 0) = COALESCE(g.valid, 0)
      AND p.percentual_comissao_atual IS NOT DISTINCT FROM
          COALESCE(o.custom_rate, public.commission_rate_for_groups(COALESCE(g.valid, 0)::int)::numeric)
    ),
    h.last_at
  FROM public.profiles p
  LEFT JOIN (
    SELECT owner_user_id,
           COUNT(*) FILTER (WHERE valid_for_commission) AS valid,
           COUNT(*) AS total
    FROM public.whatsapp_groups
    GROUP BY owner_user_id
  ) g ON g.owner_user_id = p.id
  LEFT JOIN public.commission_overrides o ON o.user_id = p.id
  LEFT JOIN (
    SELECT crh.user_id AS uid, MAX(crh.created_at) AS last_at
    FROM public.commission_rate_history crh
    GROUP BY crh.user_id
  ) h ON h.uid = p.id
  WHERE g.total > 0
     OR COALESCE(p.quantidade_grupos_ativos, 0) > 0
     OR EXISTS (SELECT 1 FROM public.motoboy_profiles mp WHERE mp.user_id = p.id)
     OR EXISTS (SELECT 1 FROM public.driver_profiles  dp WHERE dp.user_id = p.id)
  ORDER BY COALESCE(g.valid, 0) DESC, p.name NULLS LAST;
END;
$$;

-- ------------------------------------------------------------
-- 9. RPC Admin: histórico recente de alterações de comissão
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_commission_history(p_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  old_groups int,
  new_groups int,
  old_percent numeric,
  new_percent numeric,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT crh.id, crh.user_id, p.name,
         crh.old_groups, crh.new_groups,
         crh.old_percent, crh.new_percent,
         crh.reason, crh.created_at
  FROM public.commission_rate_history crh
  LEFT JOIN public.profiles p ON p.id = crh.user_id
  ORDER BY crh.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;
