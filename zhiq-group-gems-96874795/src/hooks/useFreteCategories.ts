import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FreteCategoria } from '@/lib/fretePricing';

interface UseFreteCategoriasReturn {
  categorias: FreteCategoria[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook para buscar categorias de veículos de frete
 */
export function useFreteCategories(): UseFreteCategoriasReturn {
  const [categorias, setCategorias] = useState<FreteCategoria[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategorias = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('frete_categorias_veiculos')
        .select('*')
        .eq('ativo', true)
        .order('capacidade_kg', { ascending: true });

      if (fetchError) {
        console.error('[useFreteCategories] Erro:', fetchError);
        setError('Erro ao carregar categorias');
        return;
      }

      setCategorias(data || []);
    } catch (err) {
      console.error('[useFreteCategories] Erro:', err);
      setError('Erro ao carregar categorias');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategorias();
  }, []);

  return {
    categorias,
    isLoading,
    error,
    refetch: fetchCategorias,
  };
}
