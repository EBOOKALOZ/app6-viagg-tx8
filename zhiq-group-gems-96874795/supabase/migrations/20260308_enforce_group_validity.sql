-- ============================================================
-- Migration: enforce_group_validity
-- Blindagem Backend para public.whatsapp_groups
-- ============================================================

-- 1. FUNÇÃO: Recalcula is_valid e valid_for_commission automaticamente
-- Executada ANTES de cada INSERT ou UPDATE na tabela whatsapp_groups

CREATE OR REPLACE FUNCTION public.enforce_group_validity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_approved BOOLEAN;
  v_is_active   BOOLEAN;
  v_has_members BOOLEAN;
  v_posted_recently BOOLEAN;
BEGIN
  -- Derivar condições reais do estado
  v_is_approved     := (NEW.validation_status = 'approved');
  v_is_active       := COALESCE(NEW.is_active, false);
  v_has_members     := COALESCE(NEW.members_count, 0) >= 90;
  v_posted_recently := (
    NEW.last_posted_at IS NOT NULL
    AND (now() - NEW.last_posted_at) <= INTERVAL '30 days'
  );

  -- REGRA 1: Se não aprovado, forçar tudo inativo
  IF NOT v_is_approved THEN
    NEW.is_active := false;
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    RETURN NEW;
  END IF;

  -- REGRA 2: Se aprovado mas não ativo, não é válido
  IF NOT v_is_active THEN
    NEW.is_valid := false;
    NEW.valid_for_commission := false;
    RETURN NEW;
  END IF;

  -- REGRA 3: Aprovado + Ativo → is_valid = true
  NEW.is_valid := true;

  -- REGRA 4: valid_for_commission exige TODAS as condições:
  --   approved + active + members >= 90 + postou nos últimos 30 dias
  NEW.valid_for_commission := (v_has_members AND v_posted_recently);

  RETURN NEW;
END;
$$;

-- 2. TRIGGER: Aplicar em cada INSERT ou UPDATE
DROP TRIGGER IF EXISTS trg_enforce_group_validity ON public.whatsapp_groups;

CREATE TRIGGER trg_enforce_group_validity
  BEFORE INSERT OR UPDATE ON public.whatsapp_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_group_validity();

-- 3. ONE-SHOT FIX: Corrigir todos os registros existentes que estão incoerentes
-- Isso dispara o trigger automaticamente para cada registro atualizado
UPDATE public.whatsapp_groups
SET updated_at = now()
WHERE true;

-- 4. ÍNDICE para queries de comissão (otimização)
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_commission
  ON public.whatsapp_groups (owner_user_id, valid_for_commission)
  WHERE valid_for_commission = true;
