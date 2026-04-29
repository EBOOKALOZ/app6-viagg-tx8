import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { TipoCarroceria } from '@/lib/fretePricing';

export interface FreteSolicitacaoData {
  enderecoOrigem: string;
  latitudeOrigem: number;
  longitudeOrigem: number;
  enderecoDestino: string;
  latitudeDestino: number;
  longitudeDestino: number;
  distanciaKm: number;
  descricaoCarga: string;
  pesoEstimadoKg: number;
  volumeEstimadoM3: number;
  categoriaSugeridaId: string;
  tipoCarroceria: TipoCarroceria;
  valorEstimado: number;
}

interface UseFreteSolicitacaoReturn {
  isSubmitting: boolean;
  submitSolicitacao: (data: FreteSolicitacaoData) => Promise<string | null>;
}

/**
 * Hook para criar solicitação de frete
 */
export function useFreteSolicitacao(): UseFreteSolicitacaoReturn {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitSolicitacao = useCallback(async (
    data: FreteSolicitacaoData
  ): Promise<string | null> => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return null;
    }

    setIsSubmitting(true);
    console.log('[useFreteSolicitacao] Criando solicitação:', data);

    try {
      // INSERT sem .select() para evitar erro 42501
      const { error } = await supabase
        .from('frete_solicitacoes')
        .insert({
          cliente_id: user.id,
          endereco_origem: data.enderecoOrigem,
          latitude_origem: data.latitudeOrigem,
          longitude_origem: data.longitudeOrigem,
          endereco_destino: data.enderecoDestino,
          latitude_destino: data.latitudeDestino,
          longitude_destino: data.longitudeDestino,
          distancia_km: data.distanciaKm,
          descricao_carga: data.descricaoCarga,
          peso_estimado_kg: data.pesoEstimadoKg,
          volume_estimado_m3: data.volumeEstimadoM3,
          categoria_sugerida_id: data.categoriaSugeridaId,
          tipo_carroceria_necessaria: data.tipoCarroceria,
          valor_estimado: data.valorEstimado,
          status: 'aguardando_motorista',
        });

      if (error) {
        console.error('[useFreteSolicitacao] Erro:', error);
        toast.error('Erro ao criar solicitação');
        return null;
      }

      console.log('[useFreteSolicitacao] ✅ Solicitação criada com sucesso');
      toast.success('Solicitação enviada!', {
        description: 'Aguardando motorista aceitar',
      });
      // Retorna indicador de sucesso (não temos ID sem select)
      return 'success';
    } catch (err) {
      console.error('[useFreteSolicitacao] Erro:', err);
      toast.error('Erro ao criar solicitação');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [user]);

  return {
    isSubmitting,
    submitSolicitacao,
  };
}
