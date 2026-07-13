-- ============================================================
-- AUDITORIA DE CATEGORIAS POR MÓDULO (2026-07-12)
-- Relatório admin: anúncios por módulo, sem categoria, suspeitos de
-- classificação errada (produto com cara de outro módulo) e possíveis
-- duplicados entre módulos. Ferramenta de correção da categoria.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_auditoria_categorias()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_suspeito_regex text :=
    '(imóve|imove|terreno|chácara|chacara|sítio|sitio|fazenda|apartamento|' ||
    'carro|moto |motocicleta|caminhão|caminhao|veícul|veicul|' ||
    'frete|mudança|mudanca|carreto|' ||
    'viagem|turismo|excursão|excursao|cruzeiro|pacote tur|' ||
    'serviço de|servico de|eletricista|pedreiro|encanador)';
BEGIN
  IF NOT public.mp_is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'por_modulo', jsonb_build_object(
      'mercado_produtos', (SELECT count(*) FROM public.advertiser_listings WHERE listing_status = 'active'),
      'imoveis',   (SELECT count(*) FROM public.real_estate_listings WHERE visibility_status = 'published'),
      'veiculos',  (SELECT count(*) FROM public.vehicle_listings  WHERE visibility_status = 'published'),
      'servicos',  (SELECT count(*) FROM public.service_listings  WHERE visibility_status = 'published'),
      'fretes',    (SELECT count(*) FROM public.freight_listings  WHERE visibility_status = 'published'),
      'viagens',   (SELECT count(*) FROM public.travel_listings   WHERE visibility_status = 'published')
    ),
    'sem_categoria', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'titulo', title) ORDER BY created_at DESC), '[]'::jsonb)
      FROM public.advertiser_listings
      WHERE listing_status = 'active' AND (category IS NULL OR trim(category) = '')
    ),
    'suspeitos_outro_modulo', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'titulo', title, 'categoria', category) ORDER BY created_at DESC), '[]'::jsonb)
      FROM public.advertiser_listings
      WHERE listing_status = 'active'
        AND (lower(COALESCE(category,'')) ~* v_suspeito_regex
             OR lower(COALESCE(title,'')) ~* v_suspeito_regex)
    ),
    'duplicados_entre_modulos', (
      SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', a.id, 'titulo', a.title, 'tambem_em', 'imoveis') AS d
        FROM public.advertiser_listings a
        JOIN public.real_estate_listings r ON lower(trim(r.title)) = lower(trim(a.title))
        WHERE a.listing_status = 'active'
        UNION ALL
        SELECT jsonb_build_object('id', a.id, 'titulo', a.title, 'tambem_em', 'veiculos')
        FROM public.advertiser_listings a
        JOIN public.vehicle_listings v ON lower(trim(v.title)) = lower(trim(a.title))
        WHERE a.listing_status = 'active'
        UNION ALL
        SELECT jsonb_build_object('id', a.id, 'titulo', a.title, 'tambem_em', 'viagens')
        FROM public.advertiser_listings a
        JOIN public.travel_listings t ON lower(trim(t.title)) = lower(trim(a.title))
        WHERE a.listing_status = 'active'
      ) x
    )
  );
END $$;

-- Ferramenta de correção: admin redefine a categoria de um produto do Mercado
CREATE OR REPLACE FUNCTION public.admin_corrigir_categoria(
  p_listing_id uuid, p_nova_categoria text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.mp_is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_nova_categoria IS NULL OR trim(p_nova_categoria) = '' THEN
    RAISE EXCEPTION 'categoria_invalida';
  END IF;
  UPDATE public.advertiser_listings
     SET category = trim(p_nova_categoria), updated_at = now()
   WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'anuncio_nao_encontrado'; END IF;
  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_auditoria_categorias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_corrigir_categoria(uuid, text) TO authenticated;
