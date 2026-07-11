-- ============================================================
-- RADAR IA — Gestão de Grupos: status de aprovação + data da análise
-- (2026-07-12)
--
-- A tela consome UMA fonte (radar_list_groups). Esta versão adiciona:
--  • analyzed_at (data/hora da última análise do motor/IA);
--  • status_aprovacao derivado NO SERVIDOR, com a mesma régua do motor:
--      aprovado  = approved + ativo + valid_for_commission
--                  (a regra dos 91+ membros já está embutida no trigger —
--                   grupo ≤90 nunca chega a 'aprovado')
--      pendente  = validation_status = 'pending'
--      inativo   = desativado pelo dono
--      reprovado = demais (rejected / vetado pela IA)
-- Retorno muda de shape → DROP + CREATE. Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS public.radar_list_groups(int);

CREATE FUNCTION public.radar_list_groups(p_limit int DEFAULT 300)
RETURNS TABLE (
  id uuid, group_name text, group_link text, city_name text, state_code text,
  neighborhood text, members_count int, is_active boolean, validation_status text,
  invalid_reason text, created_at timestamptz, last_posted_at timestamptz,
  owner_user_id uuid, owner_name text, profile_kind text,
  score int, classification text, commercial_potential int,
  recommendation text, ai_explanation text, factors jsonb,
  analyzed_at timestamptz, status_aprovacao text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.group_name, g.group_link, g.city_name, g.state_code,
         g.neighborhood, g.members_count, g.is_active, g.validation_status,
         g.invalid_reason, g.created_at, g.last_posted_at,
         g.owner_user_id, p.name,
         'motoboy'::text,
         COALESCE(s.score, 0), COALESCE(s.classification, '—'),
         COALESCE(s.commercial_potential, 0),
         COALESCE(s.recommendation, 'sem_analise'), s.ai_explanation, s.factors,
         s.analyzed_at,
         CASE
           WHEN g.validation_status = 'approved' AND g.is_active AND g.valid_for_commission
             THEN 'aprovado'
           WHEN g.validation_status = 'pending' THEN 'pendente'
           WHEN NOT g.is_active AND g.validation_status NOT IN ('rejected') THEN 'inativo'
           ELSE 'reprovado'
         END AS status_aprovacao
    FROM public.whatsapp_groups g
    LEFT JOIN public.radar_group_scores s ON s.group_id = g.id
    LEFT JOIN public.profiles p ON p.id = g.owner_user_id
   WHERE public.mp_is_admin()
   ORDER BY COALESCE(s.score, 0) DESC, g.created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 300), 1000)
$$;

GRANT EXECUTE ON FUNCTION public.radar_list_groups(int) TO authenticated;
