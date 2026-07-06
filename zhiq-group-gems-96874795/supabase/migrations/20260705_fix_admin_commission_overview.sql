-- ============================================================
-- FIX — admin_commission_overview sem depender de
-- profiles.available_profiles (coluna que pode não existir
-- neste banco; o SELECT falhava em runtime com 42703 e o front
-- caía silenciosamente no "Modo leitura direta").
--
-- Critério de inclusão agora: tem grupo em whatsapp_groups OU
-- contador persistido > 0 OU existe em motoboy_profiles /
-- driver_profiles (perfis operacionais reais deste banco).
--
-- Rodar no SQL Editor (broifhfqmnzqoongtokm). Idempotente.
-- ============================================================

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

-- Força o PostgREST a recarregar o schema cache
-- (sem isto, a API pode continuar respondendo PGRST202 por um tempo)
NOTIFY pgrst, 'reload schema';
