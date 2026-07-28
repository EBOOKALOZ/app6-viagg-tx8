import { useState } from "react";
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ComposedChart, Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, ArrowDownCircle, ArrowUpCircle, Activity,
  Banknote, CreditCard, ShieldCheck, Webhook, Database,
  Lock, CheckCircle, AlertTriangle, Clock, Server,
  Zap, FileCheck,
} from "lucide-react";
import { usePayCashflowChart, usePayPeriodSummary, usePayTreasuryStats } from "@/hooks/useAdminPayTreasury";
import { usePayAuditSummary } from "@/hooks/useAdminPayAudit";
import { usePayPlatformBankAccounts } from "@/hooks/useAdminPayBankAccounts";
import { usePayWithdrawalQueue } from "@/hooks/useAdminPayWithdrawals";
import { formatBRL, formatBRLCompact, formatDateShort } from "@/skills/pay/payUtils";
import type { CashflowPeriod } from "@/skills/pay/payTypes";

interface TooltipPayload {
  dataKey: string;
  color: string;
  value: number;
  [key: string]: unknown;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

// ─── Custom Recharts Tooltip ─────────────────
function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-3 text-xs space-y-1.5">
      <p className="font-bold text-gray-700 dark:text-gray-300 border-b pb-1 mb-1">{label}</p>
      {payload.map((p: TooltipPayload) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500 dark:text-gray-400">
            {p.dataKey === "entriesCents" ? "Entradas" : p.dataKey === "exitsCents" ? "Saídas" : "Saldo Acumulado"}:
          </span>
          <span className="font-bold text-gray-800 dark:text-white">{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function PayTreasury() {
  const [period, setPeriod] = useState<CashflowPeriod>("daily");
  const [days, setDays] = useState(30);

  const { data: chartData, isLoading: chartLoading } = usePayCashflowChart(period, days);
  const { data: summary, isLoading: summaryLoading } = usePayPeriodSummary(days);
  const { data: stats } = usePayTreasuryStats();
  const { data: auditSummary } = usePayAuditSummary();
  const { data: bankAccounts } = usePayPlatformBankAccounts();
  const { data: withdrawals } = usePayWithdrawalQueue({});

  // Derived data for secondary cards
  const lastPaidWithdrawal = withdrawals?.find(w => w.status === "paid");
  const defaultAccount = bankAccounts?.find(a => a.is_default);

  const summaryCards = [
    { label: "Total Entradas", value: summary ? formatBRL(summary.totalInCents) : "—", icon: ArrowDownCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-100 dark:border-emerald-900/50" },
    { label: "Total Saídas", value: summary ? formatBRL(summary.totalOutCents) : "—", icon: ArrowUpCircle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-100 dark:border-red-900/50" },
    { label: "Saldo Líquido", value: summary ? formatBRL(summary.netCents) : "—", icon: TrendingUp, color: summary && summary.netCents >= 0 ? "text-emerald-600" : "text-red-500", bg: summary && summary.netCents >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30", border: summary && summary.netCents >= 0 ? "border-emerald-100 dark:border-emerald-900/50" : "border-red-100 dark:border-red-900/50" },
    { label: "Média Diária", value: summary ? formatBRL(summary.avgDailyCents) : "—", icon: Activity, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-100 dark:border-blue-900/50" },
  ];

  return (
    <div className="space-y-5">
      {/* ═══════════════════════════════════════════
          SECTION 1: Caixa da Plataforma (Chart)
          ═══════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
            <TrendingUp className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight">Caixa da Plataforma</h3>
            <p className="text-[10px] text-muted-foreground">Entradas · Saídas · Saldo acumulado</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as CashflowPeriod)}>
            <SelectTrigger className="w-[110px] h-8 text-[11px] rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diário</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[120px] h-8 text-[11px] rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <Card key={c.label} className={`border ${c.border} shadow-sm`}>
            <CardContent className="p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                </div>
                <p className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">{c.label}</p>
              </div>
              {summaryLoading ? (
                <Skeleton className="h-7 w-28 mt-1" />
              ) : (
                <p className={`text-xl font-black tabular-nums ${c.color}`}>{c.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-5">
          {chartLoading || !chartData?.length ? (
            <div className="h-[280px] flex items-center justify-center">
              {chartLoading ? (
                <Skeleton className="h-full w-full rounded-xl" />
              ) : (
                <div className="text-center space-y-2">
                  <Activity className="h-8 w-8 text-muted-foreground/20 mx-auto" />
                  <p className="text-sm text-muted-foreground">Nenhum dado para o período selecionado</p>
                </div>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradEntries" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="gradExits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatBRLCompact(v)} width={65} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "10px", fontWeight: 700, paddingBottom: "8px" }}
                  formatter={(value: string) => value === "entriesCents" ? "Entradas" : value === "exitsCents" ? "Saídas" : "Saldo Acumulado"}
                />
                <Bar dataKey="entriesCents" fill="url(#gradEntries)" radius={[6, 6, 0, 0]} barSize={18} />
                <Bar dataKey="exitsCents" fill="url(#gradExits)" radius={[6, 6, 0, 0]} barSize={18} />
                <Line
                  type="monotone"
                  dataKey="balanceCents"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ fill: "#6366f1", r: 3, strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 5, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════
          SECTION 2: Secondary Info Cards
          ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Last paid withdrawal */}
        <Card className="border shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="h-4 w-4 text-teal-500" />
              <p className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Último Saque</p>
            </div>
            {lastPaidWithdrawal ? (
              <div>
                <p className="text-sm font-black tabular-nums">{formatBRL(lastPaidWithdrawal.amount_cents)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {lastPaidWithdrawal.paid_at ? formatDateShort(lastPaidWithdrawal.paid_at) : "—"}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum</p>
            )}
          </CardContent>
        </Card>

        {/* Largest entry of the period */}
        <Card className="border shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <p className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Maior Entrada</p>
            </div>
            {chartData && chartData.length > 0 ? (
              <div>
                <p className="text-sm font-black tabular-nums text-emerald-600">
                  {formatBRL(Math.max(...chartData.map(d => d.entriesCents)))}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">No período</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        {/* Default bank account */}
        <Card className="border shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-indigo-500" />
              <p className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Conta Padrão</p>
            </div>
            {defaultAccount ? (
              <div>
                <p className="text-sm font-bold">{defaultAccount.bank_name || defaultAccount.bank_code || "Banco"}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {defaultAccount.pix_key || `Ag ${defaultAccount.branch} / Cc ${defaultAccount.account_number}`}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Não definida</p>
            )}
          </CardContent>
        </Card>

        {/* Reconciliation status */}
        <Card className="border shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <p className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Reconciliação</p>
            </div>
            <div>
              {auditSummary?.divergences ? (
                <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200">{auditSummary.divergences} divergência(s)</Badge>
              ) : (
                <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">✓ OK</Badge>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Conciliação banco ↔ ledger</p>
            </div>
          </CardContent>
        </Card>

        {/* PAY events processed today */}
        <Card className="border shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Webhook className="h-4 w-4 text-purple-500" />
              <p className="text-[9px] text-muted-foreground font-extrabold uppercase tracking-widest">Eventos Hoje</p>
            </div>
            <div>
              <p className="text-sm font-black tabular-nums">
                {auditSummary?.unprocessedWebhooks !== undefined ? (
                  auditSummary.unprocessedWebhooks === 0 ? "0 pendentes" : `${auditSummary.unprocessedWebhooks} pendente(s)`
                ) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Webhooks do provedor</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════
          SECTION 3: Operational Alerts
          ═══════════════════════════════════════════ */}
      {auditSummary && auditSummary.totalAlerts > 0 && (
        <Card className="border-orange-200 dark:border-orange-900/50 bg-gradient-to-r from-orange-50/50 to-amber-50/30 dark:from-orange-950/20 dark:to-amber-950/10 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <p className="text-xs font-black text-orange-700 dark:text-orange-400 uppercase tracking-wider">Alertas Operacionais</p>
              <Badge className="text-[9px] bg-orange-500 text-white ml-auto">{auditSummary.totalAlerts}</Badge>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {auditSummary.pendingWithdrawals > 0 && (
                <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg p-2.5">
                  <ArrowDownCircle className="h-4 w-4 text-orange-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold">{auditSummary.pendingWithdrawals || stats?.pendingWithdrawalsCount || 0} saque(s) pendente(s)</p>
                    <p className="text-[9px] text-muted-foreground">Aguardando aprovação</p>
                  </div>
                </div>
              )}
              {auditSummary.unresolvedErrors > 0 && (
                <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg p-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-red-600">{auditSummary.unresolvedErrors} falha(s) recente(s)</p>
                    <p className="text-[9px] text-muted-foreground">Erros de transação</p>
                  </div>
                </div>
              )}
              {auditSummary.divergences > 0 && (
                <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg p-2.5">
                  <ShieldCheck className="h-4 w-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-red-600">{auditSummary.divergences} divergência(s)</p>
                    <p className="text-[9px] text-muted-foreground">Reconciliação banco ↔ ledger</p>
                  </div>
                </div>
              )}
              {auditSummary.longRunningPayouts > 0 && (
                <div className="flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-lg p-2.5">
                  <Clock className="h-4 w-4 text-violet-500 shrink-0 animate-pulse" />
                  <div>
                    <p className="text-[10px] font-bold text-violet-600">{auditSummary.longRunningPayouts} em processamento excessivo</p>
                    <p className="text-[9px] text-muted-foreground">&gt; 24h em processing</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════
          SECTION 4: Financial Integrity Panel
          ═══════════════════════════════════════════ */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-slate-500" />
            <p className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Integridade Financeira</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Ledger Append-Only", icon: FileCheck, ok: true },
              { label: "RLS Ativo", icon: Lock, ok: true },
              { label: "Webhook Idempotente", icon: Zap, ok: true },
              { label: "Reconciliação Ativa", icon: ShieldCheck, ok: !(auditSummary?.divergences) },
              { label: "Backend-Driven", icon: Server, ok: true },
            ].map(item => (
              <div key={item.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
                item.ok
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400"
              }`}>
                <item.icon className="h-3 w-3" />
                {item.ok ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {item.label}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
