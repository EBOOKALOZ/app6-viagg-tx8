import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MyStoreData {
  id: string;
  user_id: string;
  nome_loja: string;
  logo_url?: string;
  banner_url?: string;
  descricao?: string;
  whatsapp?: string;
  instagram?: string;
  status?: string;
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
}

export function useMyStore() {
  const [store, setStore] = useState<MyStoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStore = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_my_store');
      
      if (error) {
        throw error;
      }
      
      let payload = data as any;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          console.error('[useMyStore] Falha ao fazer parse do retorno RPC:', payload);
        }
      }

      console.log('[useMyStore] Payload recuperado do RPC:', payload);

      if (!payload || !payload.success) {
        throw new Error(
          (payload?.error || 'Erro desconhecido ao carregar a loja') + 
          ' | DUMP: ' + JSON.stringify(data)
        );
      }

      setStore(payload.store as MyStoreData);
    } catch (err: any) {
      console.error('[useMyStore] Falha ao recuperar contexto da loja:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStore();
  }, []);

  return { store, isLoading, error, refetch: fetchStore };
}
