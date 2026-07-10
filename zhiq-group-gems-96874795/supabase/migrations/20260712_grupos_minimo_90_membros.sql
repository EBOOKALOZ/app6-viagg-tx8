-- ============================================================
-- GRUPOS: MÍNIMO DE 90 MEMBROS PARA VINCULAR (2026-07-12)
--
-- Antes, grupo com <90 membros era aceito mas não contava na
-- comissão (confundia: painel mostrava 2 grupos e faixa não caía).
-- Decisão de produto: <90 membros NEM ENTRA — recusado no cadastro,
-- com mensagem clara. Só em INSERT (linhas antigas não explodem em
-- updates de rotina). Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_group_min_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND COALESCE(NEW.members_count, 0) < 90 THEN
    RAISE EXCEPTION 'Grupo precisa de no mínimo 90 membros para ser vinculado (informado: %).',
      COALESCE(NEW.members_count, 0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_group_min_members ON public.whatsapp_groups;
CREATE TRIGGER trg_group_min_members
  BEFORE INSERT ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_group_min_members();
