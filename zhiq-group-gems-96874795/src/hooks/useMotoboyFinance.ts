import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { requestPayout as requestProfessionalPayout } from "@/lib/payments/payoutService";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { format, startOfDay, subDays } from "date-fns";

// ============= Types =============
interface MotoboyWalletAccount {
  id: string;
  balance_cents: number;
  profile_type: string;
  account_type: string;
}

interface LedgerEntry {
  id: string;
  amount_cents: number;
  created_at: string;
  entry_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  batch_id: string;
  /** Discriminação do serviço (vinda do escrow): valor bruto, comissão e % aplicado */
  gross_cents?: number;
  fee_cents?: number;
  fee_percent?: number;
}

interface PayoutRequest {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

interface DailySummary {
  totalReceived: number;
  totalWithdrawn: number;
  transactionCount: number;
}

interface ChartDataPoint {
  date: string;
  label: string;
  amount: number;
}

// ============= Wallet Account Hook =============
export function useMotoboyWalletAccount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['motoboy-wallet-account', user?.id],
    queryFn: async (): Promise<MotoboyWalletAccount | null> => {
      if (!user?.id) return null;
      console.log(`[DEBUG useMotoboyWalletAccount] Auth User ID: ${user.id}`);

      const { data, error } = await supabase
        .from('financial_accounts')
        .select('id, available_balance, profile_type, account_type')
        .eq('owner_user_id', user.id)
        .eq('profile_type', 'motoboy')
        .eq('account_type', 'user_wallet')
        .eq('is_active', true)
        .maybeSingle();

      console.log(`[DEBUG useMotoboyWalletAccount] Raw Supabase Result for ${user.id}:`, { data, error });

      if (error) {
        console.error('Error fetching wallet account from financial_accounts:', error);
        return null;
      }

      if (!data) return null;

      const mapped = {
        id: data.id,
        balance_cents: Math.round((data.available_balance || 0) * 100),
        profile_type: 'motoboy',
        account_type: 'user_wallet'
      };
      
      console.log('[DEBUG useMotoboyWalletAccount] Final Mapped Result:', mapped);
      return mapped;
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
}

// ============= Wallet Balance Hook =============
export function useMotoboyBalance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: account } = useMotoboyWalletAccount();

  const balanceQuery = useQuery({
    queryKey: ['motoboy-ledger-balance', account?.id],
    queryFn: async (): Promise<number> => {
      console.log('[DEBUG useMotoboyBalance] Fetching balance for account:', account?.id);
      if (!account?.id || !user?.id) return 0;

      const { data, error } = await supabase
        .from('financial_accounts')
        .select('available_balance, reserved_balance, pending_balance')
        .eq('id', account.id)
        .single();

      if (error) {
        console.error('Error fetching balance from financial_accounts:', error);
        return 0;
      }

      const finalBalance = data?.available_balance || 0;

      console.log('--------------------------------------------------');
      console.log(`[DEBUG useMotoboyBalance] USER_ID: ${user.id}`);
      console.log(`[DEBUG useMotoboyBalance] ACCOUNT_ID: ${account.id}`);
      console.log(`[DEBUG useMotoboyBalance] FINAL AVAILABLE (BRL): ${finalBalance}`);
      console.log('--------------------------------------------------');

      return finalBalance;
    },
    enabled: !!account?.id,
    staleTime: 0,
  });

  // Realtime subscription for balance updates
  useEffect(() => {
    if (!account?.id) return;

    const channel = supabase
      .channel(`motoboy-balance-${account.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_entries',
          filter: `account_id=eq.${account.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['motoboy-ledger-balance', account.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [account?.id, queryClient]);

  return {
    balance: balanceQuery.data ?? 0,
    isLoading: balanceQuery.isLoading,
    refetch: balanceQuery.refetch,
  };
}

// ============= Today Summary Hook =============
export function useTodaySummary() {
  const { data: account } = useMotoboyWalletAccount();

  return useQuery({
    queryKey: ['motoboy-today-summary', account?.id],
    queryFn: async (): Promise<DailySummary> => {
      if (!account?.id) {
        return { totalReceived: 0, totalWithdrawn: 0, transactionCount: 0 };
      }

      const today = startOfDay(new Date()).toISOString();

      const { data, error } = await supabase
        .from('ledger_entries')
        .select('amount_cents, entry_type')
        .eq('account_id', account.id)
        .gte('created_at', today);

      if (error) {
        console.error('Error fetching today summary:', error);
        return { totalReceived: 0, totalWithdrawn: 0, transactionCount: 0 };
      }

      const entries = data || [];
      
      const totalReceived = entries
        .filter(e => e.amount_cents > 0)
        .reduce((sum, e) => sum + e.amount_cents, 0) / 100;

      const totalWithdrawn = Math.abs(
        entries
          .filter(e => e.amount_cents < 0)
          .reduce((sum, e) => sum + e.amount_cents, 0)
      ) / 100;

      return {
        totalReceived,
        totalWithdrawn,
        transactionCount: entries.length,
      };
    },
    enabled: !!account?.id,
    staleTime: 30000,
  });
}

// ============= Financial Timeline Hook =============
export function useFinancialTimeline() {
  const { data: account } = useMotoboyWalletAccount();

  return useQuery({
    queryKey: ['motoboy-financial-timeline', account?.id],
    queryFn: async (): Promise<LedgerEntry[]> => {
      if (!account?.id) return [];

      const { data, error } = await supabase
        .from('ledger_entries')
        .select('id, amount_cents, created_at, entry_type, reference_type, reference_id, batch_id')
        .eq('account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching timeline:', error);
        return [];
      }

      const entries: LedgerEntry[] = data || [];

      // Enriquece os créditos de serviço com a discriminação do escrow:
      // valor bruto pago pelo cliente, comissão da plataforma (definida pelos
      // grupos ativos no momento) e o % efetivamente aplicado.
      const serviceIds = entries
        .filter((e) => e.amount_cents > 0 && e.reference_id)
        .map((e) => e.reference_id as string);

      if (serviceIds.length > 0) {
        const { data: escrows, error: escrowError } = await (supabase
          .from('pay_escrow_holds') as any)
          .select('service_id, amount_cents, platform_fee_cents, professional_amount_cents')
          .in('service_id', serviceIds);

        if (!escrowError && escrows) {
          const byService = new Map<string, any>();
          for (const esc of escrows) {
            if (esc.service_id) byService.set(esc.service_id, esc);
          }
          for (const entry of entries) {
            const esc = entry.reference_id ? byService.get(entry.reference_id) : undefined;
            if (esc && entry.amount_cents > 0 && esc.amount_cents > 0) {
              entry.gross_cents = esc.amount_cents;
              entry.fee_cents = esc.platform_fee_cents;
              entry.fee_percent = Math.round((esc.platform_fee_cents / esc.amount_cents) * 100);
            }
          }
        }
      }

      return entries;
    },
    enabled: !!account?.id,
    staleTime: 0,
  });
}

// ============= 7-Day Chart Hook =============
export function useEarningsChart() {
  const { data: account } = useMotoboyWalletAccount();

  return useQuery({
    queryKey: ['motoboy-earnings-chart', account?.id],
    queryFn: async (): Promise<ChartDataPoint[]> => {
      if (!account?.id) return [];

      const sevenDaysAgo = subDays(new Date(), 7).toISOString();

      const { data, error } = await supabase
        .from('ledger_entries')
        .select('amount_cents, created_at')
        .eq('account_id', account.id)
        .gt('amount_cents', 0) // Only credits
        .gte('created_at', sevenDaysAgo);

      if (error) {
        console.error('Error fetching chart data:', error);
        return [];
      }

      // Group by day
      const byDay: Record<string, number> = {};
      
      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        byDay[date] = 0;
      }

      // Sum amounts by day
      (data || []).forEach(entry => {
        const date = format(new Date(entry.created_at), 'yyyy-MM-dd');
        if (byDay[date] !== undefined) {
          byDay[date] += entry.amount_cents / 100;
        }
      });

      return Object.entries(byDay).map(([date, amount]) => ({
        date,
        label: format(new Date(date), 'dd/MM'),
        amount: Number(amount.toFixed(2)),
      }));
    },
    enabled: !!account?.id,
    staleTime: 60000,
  });
}

// ============= Commission Data Hook =============
export function useCommissionData() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['motoboy-commission-data', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('quantidade_grupos_ativos, percentual_comissao_atual')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching commission data:', error);
        return null;
      }

      // Contagem AO VIVO dos grupos válidos (mesma fonte da tela de Grupos).
      // Enquanto a migration de sincronização não roda, os campos persistidos
      // podem estar zerados/NULL — a contagem viva evita mostrar "0 grupos"
      // para quem já tem grupos válidos.
      const { count: liveValidCount } = await (supabase
        .from('whatsapp_groups') as any)
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user.id)
        .eq('valid_for_commission', true);

      const persistedGroups = profile.quantidade_grupos_ativos ?? 0;
      const activeGroups = Math.max(persistedGroups, liveValidCount ?? 0);
      const { calculateCommissionRate } = await import('@/lib/api');

      // percentual_comissao_atual é o valor REALMENTE usado na cobrança do
      // despacho — quando persistido, é ele que aparece. Fallback: escada
      // oficial sobre a contagem de grupos.
      const persisted = profile.percentual_comissao_atual != null
        ? Number(profile.percentual_comissao_atual)
        : null;

      return {
        commissionPercent: persisted ?? calculateCommissionRate(activeGroups),
        activeGroups,
      };
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });
}

// ============= Payout Requests Hook =============
export function usePayoutRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['motoboy-payout-requests', user?.id],
    queryFn: async (): Promise<PayoutRequest[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('payout_requests')
        .select('id, amount_cents, status, created_at')
        .eq('owner_id', user.id)
        .eq('owner_type', 'motoboy_profile')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching payout requests:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!user?.id,
  });
}

// ============= Request Payout Mutation =============
// REFATORADO (2026-07-08): fluxo legado ELIMINADO. Antes: INSERT direto do
// navegador em payout_requests (bloqueado por RLS e fora do motor). Agora:
// RPC SECURITY DEFINER professional_request_payout via payoutService —
// identifica perfil/carteira no servidor, valida saldo, cria
// pay_payout_requests e reserva no ledger (payout_reserve). Atende os 3
// perfis (motoboy/moto-táxi/motorista) com a mesma arquitetura.
export function useRequestPayout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    // Assinatura preservada (centavos) p/ compatibilidade com os callers.
    mutationFn: async (amountCents: number) => {
      if (!user?.id) throw new Error('Usuário não autenticado');
      return requestProfessionalPayout({ amountBrl: amountCents / 100 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['motoboy-payout-requests'] });
      queryClient.invalidateQueries({ queryKey: ['motoboy-ledger-balance'] });
      // Saldos pay_* (reserva muda available/reserved na hora).
      queryClient.invalidateQueries({ queryKey: ['motoboy-pay-balance'] });
      queryClient.invalidateQueries({ queryKey: ['motoboy-pay-payouts'] });
    },
  });
}

// ============= Combined Finance Hook =============
export function useMotoboyFinance() {
  const { balance, isLoading: isLoadingBalance, refetch: refetchBalance } = useMotoboyBalance();
  const { data: todaySummary, isLoading: isLoadingToday } = useTodaySummary();
  const { data: timeline, isLoading: isLoadingTimeline } = useFinancialTimeline();
  const { data: chartData, isLoading: isLoadingChart } = useEarningsChart();
  const { data: commissionData, isLoading: isLoadingCommission } = useCommissionData();
  const { data: payoutRequests, isLoading: isLoadingPayouts } = usePayoutRequests();
  const requestPayoutMutation = useRequestPayout();

  return {
    balance,
    todaySummary: todaySummary ?? { totalReceived: 0, totalWithdrawn: 0, transactionCount: 0 },
    timeline: timeline ?? [],
    chartData: chartData ?? [],
    commissionData,
    payoutRequests: payoutRequests ?? [],
    isLoading: isLoadingBalance || isLoadingToday || isLoadingTimeline,
    isLoadingChart,
    isLoadingCommission,
    isLoadingPayouts,
    requestPayout: requestPayoutMutation.mutateAsync,
    isRequestingPayout: requestPayoutMutation.isPending,
    refetchBalance,
  };
}
