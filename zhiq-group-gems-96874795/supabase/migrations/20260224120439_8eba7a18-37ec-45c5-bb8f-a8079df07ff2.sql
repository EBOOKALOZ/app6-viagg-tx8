
CREATE OR REPLACE FUNCTION public.admin_dashboard_overview()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'usuarios_unicos', COUNT(DISTINCT id),
    'lojistas', COUNT(*) FILTER (WHERE 'merchant' = ANY(available_profiles)),
    'motoboys', COUNT(*) FILTER (WHERE 'motoboy' = ANY(available_profiles)),
    'passageiros', COUNT(*) FILTER (WHERE active_profile = 'passenger'),
    'motoristas', COUNT(*) FILTER (WHERE 'driver' = ANY(available_profiles)),
    'mototaxi', COUNT(*) FILTER (WHERE 'mototaxi' = ANY(available_profiles)),
    'freteiros', COUNT(*) FILTER (WHERE 'freteiro' = ANY(available_profiles))
  )
  FROM profiles;
$$;
