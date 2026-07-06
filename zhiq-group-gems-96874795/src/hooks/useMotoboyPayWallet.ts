/**
 * useMotoboyPayWallet — Backend-driven wallet for motoboy (FASE 1 / schema pay_*)
 *
 * Lê do motor financeiro real da Fase 1:
 * - pay_financial_accounts (owner_type='motoboy_profile', account_type='motoboy_wallet')
 * - pay_ledger_entries (movimentos / ganhos / histórico)
 * - v_pay_motoboy_payout_requests (saques)
 *
 * RLS permite o próprio motoboy ler sua conta (owner_id = auth.uid()).
 * Valores em pay_* são numeric em BRL — convertidos para cents (x100) aqui.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { startOfDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============= Types =============
export interface MotoboyPayBalance {
  availableCents: number;
  pendingCents: number;
  reservedCents: number;
  totalCents: number;
}

export interface MotoboyPayEarnings {
  todayCents: number;
  weekCents: number;
  todayCount: number;
  weekCount: number;
}

export interface MotoboyPayServiceEntry {
  id: string;
  amount_cents: number;
  created_at: string;
  entry_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  source_type: string | null;
  service_label: string;
}

export interface MotoboyPayoutEntry {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

export interface MotoboyPayCommission {
  commissionPercent: number;
  activeGroups: number;
}

// ============= Service label helper =============
const SERVICE_LABELS: Record<string, string> = {
  // pay_ledger_entry_type
  payment_in: "Pagamento Recebido",
  payment_out: "Pagamento Enviado",
  credit_grant: "Crédito",
  credit_consumption: "Consumo de Crédito",
  commission_income: "Comissão",
  motoboy_earning: "Ganho de Entrega",
  payout_reserve: "Saque (Reserva)",
  payout_release: "Saque (Liberação)",
  payout_settlement: "Saque Pago",
  refund: "Estorno",
  adjustment: "Ajuste",
  // reference/reason genéricos
  delivery: "Entrega",
  ride: "Corrida",
  mototaxi: "Moto-Táxi",
  freight: "Frete",
  service_earning: "Ganho de Serviço",
  motoboy_earning_credited: "Ganho de Entrega",
  payout: "Saque",
  bonus: "Bônus",
  credit: "Crédito",
  debit: "Débito",
};

function getServiceLabel(entry: any): string {
  if (entry.reference_type && SERVICE_LABELS[entry.reference_type]) return SERVICE_LABELS[entry.reference_type];
  if (entry.source_type && SERVICE_LABELS[entry.source_type]) return SERVICE_LABELS[entry.source_type];
  if (entry.entry_type && SERVICE_LABELS[entry.entry_type]) return SERVICE_LABELS[entry.entry_type];
  return "Transação";
}

// Localiza a conta-carteira do motoboy no schema pay_* (owner = auth user)
async function findMotoboyPayAccountId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("pay_financial_accounts")
    .select("id")
    .eq("owner_type", "motoboy_profile")
    .eq("owner_id", userId)
    .eq("account_type", "motoboy_wallet")
    .maybeSingle();
  return data?.id ?? null;
}

// ============= Balance Hook =============
export function useMotoboyPayBalance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["motoboy-pay-balance", user?.id],
    queryFn: async (): Promise<MotoboyPayBalance> => {
      if (!user?.id) return { availableCents: 0, pendingCents: 0, reservedCents: 0, totalCents: 0 };

      const { data: acc, error } = await supabase
        .from("pay_financial_accounts")
        .select("available_balance, reserved_balance, pending_balance")
        .eq("owner_type", "motoboy_profile")
        .eq("owner_id", user.id)
        .eq("account_type", "motoboy_wallet")
        .maybeSingle();

      if (error || !acc) return { availableCents: 0, pendingCents: 0, reservedCents: 0, totalCents: 0 };

      const availableCents = Math.round(Number(acc.available_balance || 0) * 100);
      const pendingCents = Math.round(Number(acc.pending_balance || 0) * 100);
      const reservedCents = Math.round(Number(acc.reserved_balance || 0) * 100);
      const totalCents = availableCents + pendingCents + reservedCents;

      return { availableCents, pendingCents, reservedCents, totalCents };
    },
    enabled: !!user?.id,
    staleTime: 0,
  });

  // Realtime: invalida quando há movimento no ledger pay_*
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`motoboy-pay-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pay_ledger_entries" }, () => {
        queryClient.invalidateQueries({ queryKey: ["motoboy-pay-balance", user.id] });
        queryClient.invalidateQueries({ queryKey: ["motoboy-pay-earnings", user.id] });
        queryClient.invalidateQueries({ queryKey: ["motoboy-pay-history", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  return query;
}

// ============= Earnings Hook =============
export function useMotoboyPayEarnings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-earnings", user?.id],
    queryFn: async (): Promise<MotoboyPayEarnings> => {
      if (!user?.id) return { todayCents: 0, weekCents: 0, todayCount: 0, weekCount: 0 };

      const accountId = await findMotoboyPayAccountId(user.id);
      if (!accountId) return { todayCents: 0, weekCents: 0, todayCount: 0, weekCount: 0 };

      const todayStart = startOfDay(new Date()).toISOString();
      const weekStart = startOfWeek(new Date(), { locale: ptBR }).toISOString();

      // Entradas (créditos) da semana, inclui hoje
      const { data: weekEntries } = await supabase
        .from("pay_ledger_entries")
        .select("amount, created_at")
        .eq("account_id", accountId)
        .eq("direction", "credit")
        .gte("created_at", weekStart);

      const week = weekEntries || [];
      const today = week.filter(e => e.created_at >= todayStart);
      const toCents = (rows: any[]) => rows.reduce((s, e) => s + Math.round(Number(e.amount || 0) * 100), 0);

      return {
        todayCents: toCents(today),
        weekCents: toCents(week),
        todayCount: today.length,
        weekCount: week.length,
      };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

// ============= Service History =============
export function useMotoboyPayHistory(limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-history", user?.id, limit],
    queryFn: async (): Promise<MotoboyPayServiceEntry[]> => {
      if (!user?.id) return [];

      const accountId = await findMotoboyPayAccountId(user.id);
      if (!accountId) return [];

      const { data, error } = await supabase
        .from("pay_ledger_entries")
        .select("id, amount, direction, created_at, entry_type, reference_type, reference_id, reason_code")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) { console.error("Error fetching history:", error); return []; }

      return (data || []).map((e: any) => {
        const signedCents = Math.round(Number(e.amount || 0) * 100) * (e.direction === "debit" ? -1 : 1);
        const mapped = {
          id: e.id,
          amount_cents: signedCents,
          created_at: e.created_at,
          entry_type: e.entry_type ?? null,
          reference_type: e.reference_type ?? null,
          reference_id: e.reference_id ?? null,
          source_type: e.reason_code ?? null,
        };
        return { ...mapped, service_label: getServiceLabel(mapped) };
      });
    },
    enabled: !!user?.id,
    staleTime: 0,
  });
}

// ============= Payout History =============
export function useMotoboyPayPayouts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-payouts", user?.id],
    queryFn: async (): Promise<MotoboyPayoutEntry[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("v_pay_motoboy_payout_requests")
        .select("id, requested_amount, status, created_at")
        .eq("motoboy_profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15);

      if (error) { console.error("Error fetching payouts:", error); return []; }
      return (data || []).map((p: any) => ({
        id: p.id,
        amount_cents: Math.round(Number(p.requested_amount || 0) * 100),
        status: p.status,
        created_at: p.created_at,
      }));
    },
    enabled: !!user?.id,
  });
}

// ============= Commission =============
export function useMotoboyPayCommission() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["motoboy-pay-commission", user?.id],
    queryFn: async (): Promise<MotoboyPayCommission> => {
      if (!user?.id) return { commissionPercent: 25, activeGroups: 0 };

      const { data: profile } = await supabase
        .from("profiles")
        .select("quantidade_grupos_ativos, percentual_comissao_atual")
        .eq("id", user.id)
        .single();

      // Contagem ao vivo dos grupos válidos — cobre o período pré-migration
      const { count: liveValidCount } = await (supabase
        .from('whatsapp_groups') as any)
        .select('id', { count: 'exact', head: true })
        .eq('owner_user_id', user.id)
        .eq('valid_for_commission', true);

      const activeGroups = Math.max(profile?.quantidade_grupos_ativos ?? 0, liveValidCount ?? 0);
      // Valor persistido = o que a cobrança do despacho realmente usa
      const persisted = profile?.percentual_comissao_atual != null
        ? Number(profile.percentual_comissao_atual)
        : null;
      try {
        const { calculateCommissionRate } = await import("@/lib/api");
        return { commissionPercent: persisted ?? calculateCommissionRate(activeGroups), activeGroups };
      } catch {
        return { commissionPercent: persisted ?? 25, activeGroups };
      }
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

// ============= Combined Hook =============
export function useMotoboyPayWallet() {
  const { data: balance, isLoading: isLoadingBalance } = useMotoboyPayBalance();
  const { data: earnings, isLoading: isLoadingEarnings } = useMotoboyPayEarnings();
  const { data: history, isLoading: isLoadingHistory } = useMotoboyPayHistory();
  const { data: payouts, isLoading: isLoadingPayouts } = useMotoboyPayPayouts();
  const { data: commission, isLoading: isLoadingCommission } = useMotoboyPayCommission();

  return {
    balance: balance ?? { availableCents: 0, pendingCents: 0, reservedCents: 0, totalCents: 0 },
    earnings: earnings ?? { todayCents: 0, weekCents: 0, todayCount: 0, weekCount: 0 },
    history: history ?? [],
    payouts: payouts ?? [],
    commission: commission ?? { commissionPercent: 15, activeGroups: 0 },
    isLoading: isLoadingBalance || isLoadingEarnings || isLoadingHistory,
    isLoadingPayouts,
    isLoadingCommission,
  };
}
