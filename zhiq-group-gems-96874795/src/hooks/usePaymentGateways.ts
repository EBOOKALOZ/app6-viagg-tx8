/**
 * usePaymentGateways — hook para CRUD de gateways de pagamento.
 *
 * Atualmente lê/escreve em localStorage (Fase 1) via gatewayStorage.
 * Quando a tabela `payment_gateways` for criada no Supabase (Fase 1 — DB),
 * troca-se apenas o adapter em src/lib/payments/storage.ts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  gatewayStorage,
  type StoredGateway,
  type UpsertGatewayInput,
} from '@/lib/payments/storage';
import { getDriver } from '@/lib/payments/registry';
import type { ProviderContext } from '@/lib/payments';

const GATEWAYS_QUERY_KEY = ['payment-gateways'] as const;

export function usePaymentGateways() {
  const queryClient = useQueryClient();

  const { data: gateways = [], isLoading } = useQuery({
    queryKey: GATEWAYS_QUERY_KEY,
    queryFn: () => gatewayStorage.list(),
    staleTime: 5_000,
  });

  const activeGateway = gateways.find((g) => g.is_active) ?? null;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: GATEWAYS_QUERY_KEY });
  }, [queryClient]);

  const upsertMutation = useMutation({
    mutationFn: (input: UpsertGatewayInput) => gatewayStorage.upsert(input),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => gatewayStorage.remove(id),
    onSuccess: invalidate,
  });

  const setActiveMutation = useMutation({
    mutationFn: (id: string) => gatewayStorage.setActive(id),
    onSuccess: invalidate,
  });

  const testConnection = useCallback(
    async (gateway: StoredGateway): Promise<{ ok: boolean; error?: string }> => {
      const driver = getDriver(gateway.provider_code);
      const ctx: ProviderContext = {
        mode: gateway.mode,
        credentials: gateway.credentials,
        config: gateway.config,
      };
      return driver.testConnection(ctx);
    },
    [],
  );

  return {
    gateways,
    activeGateway,
    isLoading,
    upsertGateway: upsertMutation.mutateAsync,
    removeGateway: removeMutation.mutateAsync,
    setActive: setActiveMutation.mutateAsync,
    testConnection,
    isMutating:
      upsertMutation.isPending ||
      removeMutation.isPending ||
      setActiveMutation.isPending,
  };
}
