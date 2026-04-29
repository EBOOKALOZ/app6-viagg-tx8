import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StoreCategory {
  id: string;
  nome: string;
  categoria_pai_id: string | null;
  slug: string;
  ativo: boolean;
  ordem: number | null;
}

export interface CategoryGroup {
  parent: StoreCategory;
  children: StoreCategory[];
}

interface UseStoreCategoriesReturn {
  categories: StoreCategory[];
  groupedCategories: CategoryGroup[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook para buscar categorias de lojas com estrutura hierárquica
 */
export function useStoreCategories(): UseStoreCategoriesReturn {
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('categorias_loja')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true, nullsFirst: false })
        .order('nome', { ascending: true });

      if (fetchError) {
        console.error('[useStoreCategories] Erro:', fetchError);
        setError('Erro ao carregar categorias');
        return;
      }

      setCategories(data || []);
    } catch (err) {
      console.error('[useStoreCategories] Erro:', err);
      setError('Erro ao carregar categorias');
    } finally {
      setIsLoading(false);
    }
  };

  // Organiza categorias em grupos hierárquicos
  const groupedCategories = useMemo(() => {
    const parents = categories.filter(c => !c.categoria_pai_id);
    const children = categories.filter(c => c.categoria_pai_id);

    return parents.map(parent => ({
      parent,
      children: children
        .filter(c => c.categoria_pai_id === parent.id)
        .sort((a, b) => {
          // Ordenar por ordem primeiro, depois por nome
          const orderA = a.ordem ?? 999;
          const orderB = b.ordem ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return a.nome.localeCompare(b.nome, 'pt-BR');
        })
    })).filter(group => group.children.length > 0); // Só mostrar grupos com subcategorias
  }, [categories]);

  useEffect(() => {
    fetchCategories();
  }, []);

  return {
    categories,
    groupedCategories,
    isLoading,
    error,
    refetch: fetchCategories,
  };
}
