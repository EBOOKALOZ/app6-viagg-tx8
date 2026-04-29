/**
 * MerchantPayPremium — Merchant Financial Dashboard
 * Visual tone: Green premium (merchant identity)
 * Consumes 3 merchant views
 */
import {
  Wallet, CreditCard, TrendingUp, TrendingDown, ArrowUpRight,
  ArrowDownRight, Clock, Loader2, Sparkles, ShoppingBag, Info, FileText
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  useMerchantWalletOverview,
  useMerchantCreditPurchaseHistory,
  useMerchantCreditLedgerDetailed,
} from "@/hooks/useMerchantPayViews";

// ==================== Helpers ====================

const fmt = (v: number | undefined | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

const fmtNum = (v: number | undefined | null) =>
  new Intl.NumberFormat("pt-BR").format(v ?? 0);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

const REASON_LABELS: Record<string, string> = {
  credit_purchase_payment_confirmed: "Compra de Créditos",
  purchase_intention_received: "Cesta de Compras",
  m1_buy_click: "M1 — Comprar",
  m1_product_click: "M1 — Visualização",
  bid_received: "Leilão — Lance",
  arremate_confirmed: "Arremate",
  subscription_activation: "Assinatura",
  package_purchase: "Compra de Pacote",
  manual_credit: "Crédito Manual",
  manual_debit: "Débito Manual",
};

// ==================== KPI Card ====================

function MerchantKpi({ label, value, sub, icon: Icon, highlight = false }: {
  label: string; value: string; sub?: string; icon: any; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 shadow-sm border transition-all ${
      highlight
        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-emerald-500/20 shadow-lg"
        : "bg-white dark:bg-slate-900 border-emerald-100 dark:border-slate-800"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          highlight ? "bg-white/15" : "bg-emerald-50 dark:bg-emerald-950/30"
        }`}>
          <Icon className={`h-4 w-4 ${highlight ? "text-white" : "text-emerald-600 dark:text-emerald-400"}`} />
        </div>
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${
          highlight ? "text-white/70" : "text-slate-500"
        }`}>{label}</p>
      </div>
      <p className={`text-2xl md:text-3xl font-black tracking-tight ${
        highlight ? "" : "text-slate-900 dark:text-white"
      }`}>{value}</p>
      {sub && <p className={`text-[10px] mt-1 ${highlight ? "text-white/50" : "text-slate-400"}`}>{sub}</p>}
    </div>
  );
}

// ==================== Main Page ====================

export default function MerchantPayPremium() {
  const { data: wallet, isLoading: isLoadingWallet, storeId } = useMerchantWalletOverview();
  const { data: purchases = [], isLoading: isLoadingPurchases } = useMerchantCreditPurchaseHistory();
  const { data: ledger = [], isLoading: isLoadingLedger } = useMerchantCreditLedgerDetailed();

  const isLoading = isLoadingWallet || isLoadingPurchases || isLoadingLedger;

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg ring-2 ring-emerald-400/20">
          <Wallet className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Financeiro</h1>
          <p className="text-[11px] text-muted-foreground font-medium">Créditos · Compras · Extrato · Dados reais</p>
        </div>
      </div>

      {/* ═══ KPI GRID ═══ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MerchantKpi
            label="Saldo Disponível"
            value={fmtNum(wallet?.available_credits)}
            sub="créditos ativos"
            icon={Wallet}
            highlight
          />
          <MerchantKpi
            label="Reservados"
            value={fmtNum(wallet?.reserved_credits)}
            sub="em uso / bloqueados"
            icon={Clock}
          />
          <MerchantKpi
            label="Consumidos"
            value={fmtNum(wallet?.consumed_credits)}
            sub="total utilizado"
            icon={TrendingDown}
          />
          <MerchantKpi
            label="Total Comprado"
            value={fmtNum(wallet?.total_purchased)}
            sub="créditos adquiridos"
            icon={CreditCard}
          />
        </div>
      )}

      {/* ═══ COMMERCIAL CARD ═══ */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 rounded-2xl p-6 border border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mb-1">Créditos impulsionam sua loja</h3>
            <p className="text-[12px] text-emerald-700/70 dark:text-emerald-400/70 leading-relaxed">
              Os créditos são usados para ativação, visibilidade e ações da loja na plataforma. 
              Cada compra fortalece a presença da sua marca e gera mais engajamento com seus clientes. 
              Mantenha seu saldo ativo para aproveitar todas as oportunidades.
            </p>
          </div>
        </div>
      </div>

      {/* ═══ PURCHASE HISTORY ═══ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-100 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-emerald-50 dark:border-slate-800">
          <ShoppingBag className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Histórico de Compras</h3>
          <Badge variant="secondary" className="ml-auto text-[10px]">{purchases.length}</Badge>
        </div>
        {purchases.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhuma compra registrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-emerald-50/50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Data</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Produto</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Valor Pago</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Créditos</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Provedor</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50 dark:divide-slate-800">
                {purchases.map((p, i) => (
                  <tr key={p.id || i} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-4 py-3 text-slate-600">{fmtDate(p.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{p.product_name || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-white">{fmt(p.amount_paid)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">+{fmtNum(p.credits_granted)}</td>
                    <td className="px-4 py-3 text-slate-500">{p.provider_name || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${
                        p.status === "paid" || p.status === "confirmed"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ CREDIT LEDGER ═══ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-100 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-emerald-50 dark:border-slate-800">
          <FileText className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Extrato de Créditos</h3>
          <Badge variant="secondary" className="ml-auto text-[10px]">{ledger.length}</Badge>
        </div>
        {ledger.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhuma movimentação registrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-emerald-50/50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Data</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Valor</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Antes</th>
                  <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-slate-500">Depois</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Motivo</th>
                  <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-slate-500">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50 dark:divide-slate-800">
                {ledger.map((entry, i) => {
                  const isCredit = entry.entry_type === "credit" || entry.amount > 0;
                  const isPaymentConfirmed = entry.reason_code === "credit_purchase_payment_confirmed";
                  return (
                    <tr key={entry.id || i} className={`transition-colors ${
                      isPaymentConfirmed
                        ? "bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-50"
                        : "hover:bg-slate-50/50"
                    }`}>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(entry.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
                          {isCredit ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {isCredit ? "Entrada" : "Saída"}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
                        {isCredit ? "+" : ""}{fmtNum(entry.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">{fmtNum(entry.balance_before)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-white">{fmtNum(entry.balance_after)}</td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">
                        {REASON_LABELS[entry.reason_code] || entry.reason_code || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{entry.description || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div className="text-center py-3 border-t border-emerald-100 dark:border-slate-800">
        <p className="text-[9px] text-muted-foreground/40 font-medium tracking-wider">
          Financeiro · Views reais Supabase · Dados da sua loja · Auto-refresh 30s
        </p>
      </div>
    </div>
  );
}
