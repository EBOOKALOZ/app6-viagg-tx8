/**
 * PayAdminPremium — Executive financial dashboard for PAY Admin
 * Visual tone: Grafite/neutral premium, executive readability
 * Consumes all 9 admin PAY views
 */
import { useState } from "react";
import {
  Landmark, TrendingUp, TrendingDown, AlertTriangle, Clock,
  CreditCard, Banknote, Shield, Activity, Eye, ChevronDown,
  ChevronUp, Loader2, DollarSign, Users, Package, FileText
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  usePayPlatformSummary,
  usePaySalesSummary,
  usePayMotoboySummary,
  usePayPayoutSummary,
  usePayRecentLedger,
  usePayCreditPurchasesPending,
  usePayCreditPurchasesPaid,
  usePayMotoboyPayoutsPending,
  usePayAuditInconsistencies,
} from "@/hooks/usePayAdminViews";

// ==================== Helpers ====================

const fmt = (v: number | undefined | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

// ==================== KPI Card ====================

function KpiCard({ label, value, sub, icon: Icon, color = "slate", alert = false }: {
  label: string; value: string; sub?: string;
  icon: any; color?: string; alert?: boolean;
}) {
  const colorMap: Record<string, string> = {
    slate: "from-slate-700 to-slate-800 ring-slate-600/20",
    emerald: "from-emerald-600 to-emerald-700 ring-emerald-500/20",
    amber: "from-amber-600 to-amber-700 ring-amber-500/20",
    red: "from-red-600 to-red-700 ring-red-500/20",
    violet: "from-violet-600 to-violet-700 ring-violet-500/20",
    cyan: "from-cyan-700 to-cyan-800 ring-cyan-600/20",
  };
  return (
    <div className={`relative bg-gradient-to-br ${colorMap[color] || colorMap.slate} rounded-2xl p-5 text-white shadow-lg ring-1 overflow-hidden ${alert ? "animate-pulse" : ""}`}>
      <div className="absolute top-0 right-0 -mr-4 -mt-4 w-20 h-20 rounded-full bg-white/5" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
        </div>
        <p className="text-2xl md:text-3xl font-black tracking-tight">{value}</p>
        {sub && <p className="text-[10px] text-white/50 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ==================== Table Shell ====================

function DataTable({ title, icon: Icon, columns, rows, emptyMsg = "Sem dados" }: {
  title: string; icon: any;
  columns: { key: string; label: string; fmt?: (v: any, row: any) => string; align?: string }[];
  rows: any[];
  emptyMsg?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">{emptyMsg}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                {columns.map(c => (
                  <th key={c.key} className={`px-4 py-3 font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-left ${c.align === "right" ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  {columns.map(c => (
                    <td key={c.key} className={`px-4 py-3 text-slate-700 dark:text-slate-300 ${c.align === "right" ? "text-right font-semibold" : ""}`}>
                      {c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==================== Main Page ====================

export default function PayAdminPremium() {
  const { data: platformSummary, isLoading: isLoadingPlatform } = usePayPlatformSummary();
  const { data: salesSummary } = usePaySalesSummary();
  const { data: motoboySummary } = usePayMotoboySummary();
  const { data: payoutSummary } = usePayPayoutSummary();
  const { data: recentLedger = [] } = usePayRecentLedger();
  const { data: purchasesPending = [] } = usePayCreditPurchasesPending();
  const { data: purchasesPaid = [] } = usePayCreditPurchasesPaid();
  const { data: payoutsPending = [] } = usePayMotoboyPayoutsPending();
  const { data: inconsistencies = [] } = usePayAuditInconsistencies();

  // Compute platform balances from summary rows
  const getAccountBalance = (type: string) =>
    platformSummary?.find(a => a.account_type === type)?.balance ?? 0;

  const platformMain = getAccountBalance("main");
  const platformReserve = getAccountBalance("reserve");
  const platformEscrow = getAccountBalance("escrow");

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg ring-2 ring-slate-600/20">
            <Landmark className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">PAY</h1>
              <div className="h-6 w-px bg-border mx-1" />
              <span className="text-base font-light text-muted-foreground">Centro Financeiro</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">
              Visão executiva · Views reais · Auto-refresh 30s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-3.5 py-1.5 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" />
            <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wider">LIVE</span>
          </div>
        </div>
      </div>

      {/* ═══ KPI GRID ═══ */}
      {isLoadingPlatform ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label="Conta Principal" value={fmt(platformMain)} icon={Landmark} color="slate" />
          <KpiCard label="Conta Reserva" value={fmt(platformReserve)} icon={Shield} color="cyan" />
          <KpiCard label="Escrow Ativo" value={fmt(platformEscrow)} icon={Activity} color="violet" />
          <KpiCard label="Créditos Vendidos" value={fmt(salesSummary?.total_amount_paid)} sub={`${salesSummary?.total_purchases ?? 0} compras`} icon={CreditCard} color="emerald" />
          <KpiCard label="Líquido Motoboy" value={fmt(motoboySummary?.total_net_earnings)} sub={`${motoboySummary?.total_motoboys ?? 0} motoboys`} icon={Users} color="amber" />
          <KpiCard label="Saques Pendentes" value={fmt(payoutSummary?.pending_amount)} sub={`${payoutSummary?.pending_count ?? 0} solicitações`} icon={Banknote} color={payoutSummary?.pending_count ? "red" : "slate"} alert={!!payoutSummary?.pending_count} />
          <KpiCard label="Comissão Total" value={fmt(motoboySummary?.total_commission)} icon={TrendingUp} color="slate" />
          <KpiCard label="Compras Pendentes" value={String(salesSummary?.pending_count ?? 0)} sub="aguardando pagamento" icon={Package} color={salesSummary?.pending_count ? "amber" : "slate"} />
          <KpiCard label="Inconsistências" value={String(inconsistencies.length)} icon={AlertTriangle} color={inconsistencies.length ? "red" : "slate"} alert={inconsistencies.length > 0} />
          <KpiCard label="Saques Processados" value={String(payoutSummary?.processed_count ?? 0)} sub="concluídos" icon={DollarSign} color="emerald" />
        </div>
      )}

      {/* ═══ AUDIT ALERTS ═══ */}
      {inconsistencies.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Alertas de Auditoria</h3>
            <Badge className="bg-red-600 text-white text-[10px]">{inconsistencies.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-red-200 dark:border-red-800">
                  <th className="px-3 py-2 text-left font-bold text-red-600 uppercase tracking-wider">Tipo</th>
                  <th className="px-3 py-2 text-left font-bold text-red-600 uppercase tracking-wider">Referência</th>
                  <th className="px-3 py-2 text-left font-bold text-red-600 uppercase tracking-wider">Descrição</th>
                  <th className="px-3 py-2 text-left font-bold text-red-600 uppercase tracking-wider">Severidade</th>
                  <th className="px-3 py-2 text-left font-bold text-red-600 uppercase tracking-wider">Detectado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 dark:divide-red-900">
                {inconsistencies.map((inc, i) => (
                  <tr key={inc.id || i} className="text-red-800 dark:text-red-300">
                    <td className="px-3 py-2 font-semibold">{inc.issue_type}</td>
                    <td className="px-3 py-2 font-mono text-[10px]">{inc.reference_type} / {inc.reference_id?.slice(0, 8)}</td>
                    <td className="px-3 py-2">{inc.description}</td>
                    <td className="px-3 py-2">
                      <Badge className={inc.severity === "critical" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}>
                        {inc.severity}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{fmtDate(inc.detected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <Tabs defaultValue="ledger" className="w-full">
        <div className="border-b">
          <TabsList className="h-12 bg-transparent rounded-none p-0 gap-0 w-full justify-start">
            {[
              { value: "ledger", label: "Ledger Recente", icon: FileText },
              { value: "credit-purchases", label: "Compras de Créditos", icon: CreditCard },
              { value: "motoboy-payouts", label: "Saques Motoboy", icon: Banknote },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative h-12 px-5 text-[12px] font-bold text-muted-foreground rounded-none border-b-2 border-transparent 
                  data-[state=active]:border-b-slate-700 data-[state=active]:text-foreground data-[state=active]:font-black
                  data-[state=active]:bg-transparent data-[state=active]:shadow-none
                  hover:text-foreground hover:bg-accent/30 transition-all"
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Ledger Recente ── */}
        <TabsContent value="ledger" className="mt-6">
          <DataTable
            title="Últimos Lançamentos"
            icon={FileText}
            rows={recentLedger}
            columns={[
              { key: "created_at", label: "Data/Hora", fmt: (v: string) => fmtDate(v) },
              { key: "owner_type", label: "Perfil" },
              { key: "account_type", label: "Conta" },
              { key: "direction", label: "Direção", fmt: (v: string) => v === "credit" ? "↑ Crédito" : "↓ Débito" },
              { key: "entry_type", label: "Tipo" },
              { key: "amount", label: "Valor", align: "right", fmt: (v: number, row: any) => fmt(v) },
              { key: "reason_code", label: "Razão" },
              { key: "reference_type", label: "Ref. Tipo" },
              { key: "reference_id", label: "Ref. ID", fmt: (v: string) => v ? v.slice(0, 8) + "…" : "—" },
            ]}
          />
        </TabsContent>

        {/* ── Compras de Créditos ── */}
        <TabsContent value="credit-purchases" className="mt-6 space-y-6">
          <DataTable
            title="Compras Pendentes"
            icon={Clock}
            rows={purchasesPending}
            emptyMsg="Nenhuma compra pendente"
            columns={[
              { key: "created_at", label: "Data", fmt: (v: string) => fmtDate(v) },
              { key: "store_name", label: "Loja" },
              { key: "product_name", label: "Produto" },
              { key: "amount_paid", label: "Valor Pago", align: "right", fmt: (v: number) => fmt(v) },
              { key: "credits_granted", label: "Créditos" },
              { key: "provider_name", label: "Provedor" },
              { key: "status", label: "Status", fmt: (v: string) => (
                <Badge className="bg-amber-100 text-amber-700 text-[10px]">{v}</Badge>
              ) as any },
            ]}
          />
          <DataTable
            title="Compras Pagas"
            icon={CreditCard}
            rows={purchasesPaid}
            emptyMsg="Nenhuma compra paga registrada"
            columns={[
              { key: "created_at", label: "Data", fmt: (v: string) => fmtDate(v) },
              { key: "store_name", label: "Loja" },
              { key: "product_name", label: "Produto" },
              { key: "amount_paid", label: "Valor Pago", align: "right", fmt: (v: number) => fmt(v) },
              { key: "credits_granted", label: "Créditos" },
              { key: "provider_name", label: "Provedor" },
              { key: "provider_payment_id", label: "ID Pgto", fmt: (v: string) => v ? v.slice(0, 12) + "…" : "—" },
            ]}
          />
        </TabsContent>

        {/* ── Saques Motoboy ── */}
        <TabsContent value="motoboy-payouts" className="mt-6">
          <DataTable
            title="Saques Pendentes — Motoboys"
            icon={Banknote}
            rows={payoutsPending}
            emptyMsg="Nenhum saque pendente"
            columns={[
              { key: "requested_at", label: "Solicitado", fmt: (v: string) => fmtDate(v) },
              { key: "motoboy_profile_id", label: "Motoboy ID", fmt: (v: string) => v ? v.slice(0, 8) + "…" : "—" },
              { key: "whatsapp", label: "WhatsApp" },
              { key: "requested_amount", label: "Solicitado", align: "right", fmt: (v: number) => fmt(v) },
              { key: "fee_amount", label: "Taxa", align: "right", fmt: (v: number) => fmt(v) },
              { key: "net_amount", label: "Líquido", align: "right", fmt: (v: number) => fmt(v) },
              { key: "provider_name", label: "Provedor" },
            ]}
          />
        </TabsContent>
      </Tabs>

      {/* ═══ FOOTER ═══ */}
      <div className="text-center py-3 border-t border-border/50">
        <p className="text-[9px] text-muted-foreground/40 font-medium tracking-wider">
          PAY Centro Financeiro · Views reais Supabase · Sem mocks · Auto-refresh 30s
        </p>
      </div>
    </div>
  );
}
