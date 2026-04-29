-- =====================================================================
-- Criar a função search_categorias_loja (RPC)
-- Usada pelo CategoriaAutocomplete para buscar categorias por texto
-- =====================================================================

CREATE OR REPLACE FUNCTION public.search_categorias_loja(p_texto text)
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT cl.id, cl.nome
  FROM public.categorias_loja cl
  WHERE cl.nome ILIKE '%' || p_texto || '%'
  ORDER BY cl.nome
  LIMIT 20;
$$;

-- Garantir que authenticated pode chamar a função
GRANT EXECUTE ON FUNCTION public.search_categorias_loja(text) TO authenticated;
