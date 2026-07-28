/**
 * useWalletCenter — Camada de dados do Centro Financeiro (Carteira única)
 *
 * SOMENTE LEITURA. Não altera nenhuma regra/RPC/tabela. Apenas CONSOME e
 * organiza dados que já existem:
 *   - wallets              → saldo de créditos (balance_cents / reserved_cents)  [RLS: owner]
 *   - wallet_transactions  → extrato do wallet de créditos (inclui unlock 2%)     [RLS: owner]
 *   - useMerchantWallet    → carteira financeira pay_* (pagamentos de entrega)
 *   - orion_marketplace_contact_charges é admin-only → a comissão de contato é
 *     DERIVADA dos wallet_transactions (ref_table='orion_marketplace_contact_charges').
 *
 * Tudo em CENTS (bigint) internamente; a UI formata em R$.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMerchantWallet } from "@/hooks/useMerchantWallet";

export type WCSource = "credit" | "financial";

export interface WCTxn {
  id: string;
  source: WCSource;             // credit (wallets) | financial (pay_*)
  created_at: string;
  tx_type: "credit" | "debit";
  status: string;              // confirmed | reserved | canceled | (pay: n/a)
  amount_cents: number;
  description: string | null;
  ref_table: string | null;
  kind: WCKind;                // categoria normalizada
  running_cents?: number;      // saldo total após a operação (best-effort)
}

export type WCKind =
  | "recharge"        // compra/recarga de créditos
  | "unlock"          // desbloqueio de contato (2%)
  | "delivery"        // pedido de entrega (pay_*)
  | "payout"          // saque PIX
  | "adjustment"      // ajuste administrativo
  | "refund"          // estorno/reembolso
  | "transfer"        // transferência/importação
  | "other";

export interface WalletCenterData {
  // ── Saldos (cents) ──
  creditAvailableCents: number;   // wallets: balance - reserved
  reservedCents: number;          // wallets: reserved
  blockedCents: number;           // reservado p/ conceito "bloqueado" (0 = não há distinção hoje)
  financialCents: number;         // pay_* merchant wallet
  processingCents: number;        // pay_* pending
  cashbackCents: number;          // 0 — estrutura preparada
  releasedCommissionCents: number;// 0 — estrutura preparada
  totalCents: number;             // créditos disponível + financeira

  // ── Fluxo (cents) ──
  entriesCents: number;           // entradas confirmadas (ambas as fontes)
  exitsCents: number;             // saídas confirmadas

  // ── Comissão de contato (derivada de wallet_transactions) ──
  contact: {
    totalSpentCents: number;
    unlockCount: number;
    listingCount: number;
    avgCents: number;
    last: WCTxn[];
  };

  // ── Extrato unificado ──
  transactions: WCTxn[];

  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

function kindOf(ref_table: string | null, description: string | null, tx_type: string): WCKind {
  const d = (description || "").toLowerCase();
  if (ref_table === "orion_marketplace_contact_charges" || d.includes("desbloqueio de contato")) return "unlock";
  if (d.includes("recarga") || d.includes("compra") || (tx_type === "credit" && !d)) return "recharge";
  if (d.includes("importa") || d.includes("transfer")) return "transfer";
  if (tx_type === "credit") return "recharge";
  return "other";
}

function payKindOf(ref: string | null): WCKind {
  switch (ref) {
    case "service_order": return "delivery";
    case "payout": return "payout";
    case "adjustment": return "adjustment";
    case "refund": return "refund";
    default: return "other";
  }
}

export function useWalletCenter(): WalletCenterData {
  const { user } = useAuth();
  const { overview: payOverview, isLoading: payLoading, isError: payError, loadWallet } = useMerchantWallet();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["wallet-center", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    queryFn: async () => {
      // Carteira de créditos (wallets) — RLS já filtra pelo dono
      // @ts-expect-error - Type definitions may be missing
      const { data: w } = await supabase.from("wallets")
        .select("id, balance_cents, reserved_cents")
        .eq("owner_uid", user!.id)
        .maybeSingle();

      const walletData = w as Record<string, unknown> | null;
      const walletId = walletData?.id ?? null;
      let balance = Number(walletData?.balance_cents ?? 0);
      const reserved = Number(walletData?.reserved_cents ?? 0);

      // Se o saldo do legado for 0 ou nulo, buscar das contas pay_financial_accounts do usuário
      if (balance === 0) {
        // @ts-expect-error - Type definitions may be missing
        const { data: payAccounts } = await supabase.from("pay_financial_accounts")
          .select("available_balance")
          .eq("owner_id", user!.id);
        if (payAccounts && Array.isArray(payAccounts)) {
          const totalPayReais = payAccounts.reduce((sum: number, acc: Record<string, unknown>) => sum + Number(acc.available_balance || 0), 0);
          balance = Math.round(totalPayReais * 100);
        }
      }

      let txns: WCTxn[] = [];
      if (walletId) {
        // @ts-expect-error - Type definitions may be missing
        const { data: rows } = await supabase.from("wallet_transactions")
          .select("id, created_at, tx_type, status, amount_cents, description, ref_table")
          .eq("wallet_id", walletId)
          .order("created_at", { ascending: false })
          .limit(500);
        txns = ((rows || []) as Record<string, unknown>[]).map((t) => ({
          id: t.id,
          source: "credit" as WCSource,
          created_at: t.created_at,
          tx_type: t.tx_type,
          status: t.status,
          amount_cents: Number(t.amount_cents ?? 0),
          description: t.description,
          ref_table: t.ref_table,
          kind: kindOf(t.ref_table, t.description, t.tx_type),
        }));
      }
      return { balance, reserved, txns };
    },
  });

  const balance = data?.balance ?? 0;
  const reserved = data?.reserved ?? 0;
  const creditTxns = data?.txns ?? [];

  // Carteira financeira (pay_*)
  const financialCents = payOverview?.balanceCents ?? 0;
  const processingCents = payOverview?.pendingCents ?? 0;
  const payTxnsRaw = Array.isArray(payOverview?.transactions) ? payOverview!.transactions : [];
  const payTxns: WCTxn[] = payTxnsRaw.map((t: Record<string, unknown>) => ({
    id: t.id,
    source: "financial" as WCSource,
    created_at: t.created_at,
    tx_type: t.entry_type,
    status: "confirmed",
    amount_cents: Number(t.amount_cents ?? 0),
    description: t.description ?? null,
    ref_table: t.reference_type ?? null,
    kind: payKindOf(t.reference_type ?? null),
  }));

  // Extrato unificado ordenado por data (desc)
  const all = [...creditTxns, ...payTxns].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Saldo total após operação (best-effort): total corrente e "desconta" para trás
  const creditAvailableCents = Math.max(balance - reserved, financialCents);
  const totalCents = Math.max(creditAvailableCents, financialCents);
  let running = totalCents;
  for (const t of all) {
    t.running_cents = running;
    // reverte esta operação para obter o saldo ANTES dela (para a próxima, mais antiga)
    if (t.status === "confirmed" || t.source === "financial") {
      running += t.tx_type === "credit" ? -t.amount_cents : t.amount_cents;
    }
  }

  // Fluxo confirmado
  const confirmed = all.filter((t) => t.status === "confirmed" || t.source === "financial");
  const entriesCents = confirmed.filter((t) => t.tx_type === "credit").reduce((s, t) => s + t.amount_cents, 0);
  const exitsCents = confirmed.filter((t) => t.tx_type === "debit").reduce((s, t) => s + t.amount_cents, 0);

  // Comissão de contato (derivada)
  const unlocks = all.filter((t) => t.kind === "unlock" && t.tx_type === "debit");
  const contactTotal = unlocks.reduce((s, t) => s + t.amount_cents, 0);
  const listingSet = new Set(unlocks.map((t) => `${t.description ?? ""}`)); // proxy (sem listing_id na txn)
  const contact = {
    totalSpentCents: contactTotal,
    unlockCount: unlocks.length,
    listingCount: listingSet.size || unlocks.length,
    avgCents: unlocks.length ? Math.round(contactTotal / unlocks.length) : 0,
    last: unlocks.slice(0, 10),
  };

  return {
    creditAvailableCents,
    reservedCents: reserved,
    blockedCents: 0,
    financialCents,
    processingCents,
    cashbackCents: 0,
    releasedCommissionCents: 0,
    totalCents,
    entriesCents,
    exitsCents,
    contact,
    transactions: all,
    isLoading: isLoading || payLoading,
    isError: isError || payError,
    refetch: () => { refetch(); loadWallet(); },
  };
}
