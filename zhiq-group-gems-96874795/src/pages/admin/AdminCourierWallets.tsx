/**
 * AdminCourierWallets — PI2 Admin: Motoboy Financial Management
 * Consumes: admin_pi2_motoboy_wallet_overview, split_details, withdrawal_details
 */
import { useState, useMemo } from "react";
import {
  Bike, Wallet, TrendingUp, Clock, CheckCircle, XCircle,
  Search, Filter, Eye, ChevronLeft, ChevronRight, Send,
  Banknote, Activity, AlertTriangle, Layers, BadgeDollarSign,
  Calendar, X, BarChart3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  usePI2Summary,
  usePI2WalletOverview,
  usePI2SplitDetails,
  usePI2WithdrawalDetails,
} from "@/hooks/useAdminCourierWallets";
import { formatBRL, formatDate, formatDateFull, truncateId, getPayoutStatusLabel, getPayoutStatusColor } from "@/skills/pay/payUtils";

const STATUSES = [
  { value: "all", label: "Todos" },
  { value: "pending_approval", label: "Pendente" },
  { value: "approved", label: "Aprovado" },
  { value: "queued", label: "Na Fila" },
  { value: "processing", label: "Processando" },
  { value: "paid", label: "Pago" },
  { value: "failed", label: "Falhou" },
  { value: "canceled", label: "Cancelado" },
];

const SPLIT_STATUSES = [
  { value: "all", label: "Todos" },
  { value: "completed", label: "Concluído" },
  { value: "pending", label: "Pendente" },
  { value: "processing", label: "Processando" },
  { value: "failed", label: "Falhou" },
];

/* Custom chart tooltip */
function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg p-3 border text-xs">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function AdminCourierWallets() {
  const { data: summary } = usePI2Summary();

  console.log('[DEBUG AdminCourierWallets] Summary:', summary);

  // Overview tab
  const [overviewUserId, setOverviewUserId] = useState("");
  const [overviewPage, setOverviewPage] = useState(0);
  const { data: overviewData, isLoading: overviewLoading } = usePI2WalletOverview({ userId: overviewUserId, page: overviewPage });

  console.log('[DEBUG AdminCourierWallets] Overview Data:', overviewData);

  // Splits tab
  const [splitStatus, setSplitStatus] = useState("all");
  const [splitUserId, setSplitUserId] = useState("");
  const [splitPage, setSplitPage] = useState(0);
  const { data: splitsData, isLoading: splitsLoading } = usePI2SplitDetails({ status: splitStatus, userId: splitUserId, page: splitPage });

  // Withdrawals tab
  const [wdStatus, setWdStatus] = useState("all");
  const [wdUserId, setWdUserId] = useState("");
  const [wdPage, setWdPage] = useState(0);
  const { data: wdData, isLoading: wdLoading } = usePI2WithdrawalDetails({ status: wdStatus, userId: wdUserId, page: wdPage });

  // Detail drawers
  const [selectedSplit, setSelectedSplit] = useState<any>(null);
  const [selectedWd, setSelectedWd] = useState<any>(null);

  // Chart data from splits
  const chartData = useMemo(() => {
    const rows = splitsData?.rows || [];
    const grouped: Record<string, { date: string; splitPaid: number; platformFee: number; courierNet: number }> = {};
    rows.forEach((r: any) => {
      const d = r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
      if (!grouped[d]) grouped[d] = { date: d, splitPaid: 0, platformFee: 0, courierNet: 0 };
      grouped[d].splitPaid += Number(r.gross_amount_cents || r.valor_bruto || 0);
      grouped[d].platformFee += Number(r.platform_fee_cents || r.comissao_plataforma || 0);
      grouped[d].courierNet += Number(r.net_courier_cents || r.liquido_motoboy || 0);
    });
    return Object.values(grouped).reverse().slice(0, 14);
  }, [splitsData]);

  const summaryCards = [
    { label: "Saldo Disponível Total", value: formatBRL(summary?.totalAvailable || 0), icon: Wallet, color: "text-emerald-600", gradient: "from-emerald-500 to-teal-600" },
    { label: "Total Split Repassado", value: formatBRL(summary?.totalSplitPaid || 0), icon: BadgeDollarSign, color: "text-pink-600", gradient: "from-pink-500 to-rose-600" },
    { label: "Total Saques Pagos", value: formatBRL(summary?.totalWithdrawalsPaid || 0), icon: CheckCircle, color: "text-teal-600", gradient: "from-teal-500 to-cyan-600" },
    { label: "Total Pendente de Saque", value: formatBRL(summary?.totalPendingWithdrawals || 0), icon: Clock, color: "text-amber-600", gradient: "from-amber-500 to-orange-600" },
    { label: "Saques Abertos", value: String(summary?.openWithdrawalsCount || 0), icon: Send, color: "text-blue-600", gradient: "from-blue-500 to-indigo-600" },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* ═══════════════════ HEADER ═══════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 ring-2 ring-violet-400/20">
            <Bike className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">PI2</h1>
              <div className="h-6 w-px bg-border mx-1" />
              <span className="text-base font-light text-muted-foreground">Carteira do Motoboy</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">
              Split automático · Wallet dedicada · Integração PAY · Backend-driven
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Badge className="text-[9px] bg-violet-100 text-violet-700 border-violet-200 font-bold gap-1 px-3">
            <Activity className="h-3 w-3" /> {summary?.motoboyCount || 0} motoboys
          </Badge>
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-3 py-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-extrabold text-emerald-600 tracking-wider">LIVE</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════ KPI CARDS ═══════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summaryCards.map(c => (
          <Card key={c.label} className="group border shadow-md hover:shadow-lg transition-all overflow-hidden">
            <div className={`h-1 bg-gradient-to-r ${c.gradient}`} />
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                <span className="text-[8px] text-muted-foreground font-extrabold uppercase tracking-[0.12em]">{c.label}</span>
              </div>
              <p className={`text-lg font-black tabular-nums ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══════════════════ TABS ═══════════════════ */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="border-b">
          <TabsList className="h-11 bg-transparent rounded-none p-0 gap-0 w-full justify-start">
            {[
              { value: "overview", label: "Visão por Motoboy", icon: Wallet },
              { value: "splits", label: "Repasses (Split)", icon: Layers },
              { value: "withdrawals", label: "Saques", icon: Banknote },
              { value: "charts", label: "Gráficos", icon: BarChart3 },
            ].map(t => (
              <TabsTrigger key={t.value} value={t.value} className="h-11 px-5 text-[12px] font-bold text-muted-foreground rounded-none border-b-2 border-transparent data-[state=active]:border-b-violet-500 data-[state=active]:text-foreground data-[state=active]:font-black hover:text-foreground hover:bg-accent/30 transition-all">
                <t.icon className="h-4 w-4 mr-2" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ────────────── OVERVIEW TAB ────────────── */}
        <TabsContent value="overview" className="mt-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Filtrar por user_id..." value={overviewUserId} onChange={e => { setOverviewUserId(e.target.value); setOverviewPage(0); }} className="pl-8 h-8 text-[11px]" />
            </div>
          </div>

          {overviewLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {["Motoboy","Saldo Disponível","Total Créditos","Total Débitos","Split Concluído","Saques Abertos","Valor em Aberto","Última Mov."].map(h => (
                          <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(overviewData?.rows || []).map((r: any) => (
                        <tr key={r.user_id || r.id} className="border-b hover:bg-accent/30 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-[10px]">
                            <Link 
                              to={`/admin/users/${r.user_id || r.id}`}
                              className="text-violet-600 hover:text-violet-800 hover:underline"
                            >
                              {truncateId(r.user_id || r.id, 12)}
                            </Link>
                          </td>
                          <td className="py-2.5 px-3 font-bold tabular-nums text-emerald-600">{formatBRL(r.available_balance || r.saldo_disponivel || 0)}</td>
                          <td className="py-2.5 px-3 tabular-nums">{formatBRL(r.total_credits || r.total_creditos || 0)}</td>
                          <td className="py-2.5 px-3 tabular-nums text-red-500">{formatBRL(r.total_debits || r.total_debitos || 0)}</td>
                          <td className="py-2.5 px-3 tabular-nums">{formatBRL(r.total_split_completed || r.total_split_concluido || 0)}</td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge className={`text-[8px] ${(r.open_withdrawals_count || r.saques_em_aberto || 0) > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                              {r.open_withdrawals_count || r.saques_em_aberto || 0}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 tabular-nums text-amber-600">{formatBRL(r.open_withdrawal_value || r.valor_em_aberto || 0)}</td>
                          <td className="py-2.5 px-3 text-muted-foreground text-[10px] whitespace-nowrap">{r.last_movement_at || r.ultima_movimentacao ? formatDate(r.last_movement_at || r.ultima_movimentacao) : "—"}</td>
                        </tr>
                      ))}
                      {(overviewData?.rows || []).length === 0 && (
                        <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">
                          <Wallet className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                          <p className="text-sm">Nenhum motoboy encontrado</p>
                          <p className="text-[10px] mt-1">Consumindo <code className="bg-muted px-1 rounded">admin_pi2_motoboy_wallet_overview</code></p>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {(overviewData?.count || 0) > 30 && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Página {overviewPage + 1} · {overviewData?.count} registros</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOverviewPage(p => Math.max(0, p - 1))} disabled={overviewPage === 0}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setOverviewPage(p => p + 1)} disabled={(overviewPage + 1) * 30 >= (overviewData?.count || 0)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ────────────── SPLITS TAB ────────────── */}
        <TabsContent value="splits" className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={splitStatus} onValueChange={v => { setSplitStatus(v); setSplitPage(0); }}>
              <SelectTrigger className="w-[140px] h-8 text-[11px]"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>{SPLIT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Filtrar por user_id..." value={splitUserId} onChange={e => { setSplitUserId(e.target.value); setSplitPage(0); }} className="pl-8 h-8 text-[11px]" />
            </div>
          </div>

          {splitsLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {["Data","Motoboy","Serviço","Valor Bruto","Comissão Plat.","Líquido Motoboy","Status","Provider Ref.","Erro",""].map(h => (
                          <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(splitsData?.rows || []).map((s: any, i: number) => (
                        <tr key={s.id || i} className="border-b hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setSelectedSplit(s)}>
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{formatDate(s.created_at)}</td>
                          <td className="py-2.5 px-3 font-mono text-[10px]">{truncateId(s.user_id || s.courier_id, 10)}</td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">{truncateId(s.delivery_order_id || s.service_order_id, 10)}</td>
                          <td className="py-2.5 px-3 font-bold tabular-nums">{formatBRL(s.gross_amount_cents || s.valor_bruto || 0)}</td>
                          <td className="py-2.5 px-3 text-red-500 tabular-nums">{formatBRL(s.platform_fee_cents || s.comissao_plataforma || 0)}</td>
                          <td className="py-2.5 px-3 font-bold tabular-nums text-emerald-600">{formatBRL(s.net_courier_cents || s.liquido_motoboy || 0)}</td>
                          <td className="py-2.5 px-3">
                            <Badge className={`text-[8px] font-bold ${
                              (s.status === "completed" || s.status === "paid") ? "bg-emerald-100 text-emerald-700" :
                              s.status === "pending" ? "bg-amber-100 text-amber-700" :
                              s.status === "failed" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{s.status || "—"}</Badge>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">{s.provider_reference ? truncateId(s.provider_reference, 10) : "—"}</td>
                          <td className="py-2.5 px-3 text-red-400 text-[10px] max-w-[120px] truncate">{s.processing_error || s.erro_processamento || "—"}</td>
                          <td className="py-2.5 px-3"><Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Eye className="h-3 w-3" /></Button></td>
                        </tr>
                      ))}
                      {(splitsData?.rows || []).length === 0 && (
                        <tr><td colSpan={10} className="py-16 text-center text-muted-foreground">
                          <Layers className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                          <p className="text-sm">Nenhum repasse encontrado</p>
                          <p className="text-[10px] mt-1">Consumindo <code className="bg-muted px-1 rounded">admin_pi2_motoboy_split_details</code></p>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {(splitsData?.count || 0) > 30 && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Página {splitPage + 1} · {splitsData?.count} registros</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSplitPage(p => Math.max(0, p - 1))} disabled={splitPage === 0}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setSplitPage(p => p + 1)} disabled={(splitPage + 1) * 30 >= (splitsData?.count || 0)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ────────────── WITHDRAWALS TAB ────────────── */}
        <TabsContent value="withdrawals" className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={wdStatus} onValueChange={v => { setWdStatus(v); setWdPage(0); }}>
              <SelectTrigger className="w-[140px] h-8 text-[11px]"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Filtrar por user_id..." value={wdUserId} onChange={e => { setWdUserId(e.target.value); setWdPage(0); }} className="pl-8 h-8 text-[11px]" />
            </div>
          </div>

          {wdLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {["Data","Motoboy","Valor","Taxa","Líquido","Status","provider_payout_id","Erro","paid_at",""].map(h => (
                          <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(wdData?.rows || []).map((w: any, i: number) => (
                        <tr key={w.id || i} className="border-b hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setSelectedWd(w)}>
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{formatDate(w.created_at)}</td>
                          <td className="py-2.5 px-3 font-mono text-[10px]">{truncateId(w.user_id || w.courier_id, 10)}</td>
                          <td className="py-2.5 px-3 font-bold tabular-nums">{formatBRL(w.amount_cents || w.valor_solicitado || 0)}</td>
                          <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{(w.fee_cents || w.taxa) ? formatBRL(w.fee_cents || w.taxa || 0) : "—"}</td>
                          <td className="py-2.5 px-3 font-bold tabular-nums">{formatBRL(w.net_amount_cents || w.valor_liquido || w.amount_cents || w.valor_solicitado || 0)}</td>
                          <td className="py-2.5 px-3"><Badge className={`text-[8px] font-bold ${getPayoutStatusColor(w.status)}`}>{getPayoutStatusLabel(w.status)}</Badge></td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-muted-foreground">{w.provider_payout_id ? truncateId(w.provider_payout_id, 10) : "—"}</td>
                          <td className="py-2.5 px-3 text-red-400 text-[10px] max-w-[120px] truncate">{w.failure_reason || w.erro || "—"}</td>
                          <td className="py-2.5 px-3 text-muted-foreground text-[10px] whitespace-nowrap">{w.paid_at ? formatDate(w.paid_at) : "—"}</td>
                          <td className="py-2.5 px-3"><Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Eye className="h-3 w-3" /></Button></td>
                        </tr>
                      ))}
                      {(wdData?.rows || []).length === 0 && (
                        <tr><td colSpan={10} className="py-16 text-center text-muted-foreground">
                          <Banknote className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                          <p className="text-sm">Nenhum saque encontrado</p>
                          <p className="text-[10px] mt-1">Consumindo <code className="bg-muted px-1 rounded">admin_pi2_motoboy_withdrawal_details</code></p>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {(wdData?.count || 0) > 30 && (
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Página {wdPage + 1} · {wdData?.count} registros</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setWdPage(p => Math.max(0, p - 1))} disabled={wdPage === 0}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setWdPage(p => p + 1)} disabled={(wdPage + 1) * 30 >= (wdData?.count || 0)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ────────────── CHARTS TAB ────────────── */}
        <TabsContent value="charts" className="mt-5 space-y-6">
          {/* Split por dia */}
          <Card className="border shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-violet-500" />
                <h4 className="text-sm font-black">Split Concluído por Dia</h4>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v: number) => `R$${(v / 100).toFixed(0)}`} tick={{ fontSize: 10 }} />
                  <ReTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="courierNet" name="Líquido Motoboy" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="platformFee" name="Comissão Plataforma" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Saques por dia */}
          <Card className="border shadow-md">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-teal-500" />
                <h4 className="text-sm font-black">Distribuição: Comissão Plataforma vs Líquido Motoboy</h4>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v: number) => `R$${(v / 100).toFixed(0)}`} tick={{ fontSize: 10 }} />
                  <ReTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="splitPaid" name="Total Bruto" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="courierNet" name="Líquido Motoboy" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="platformFee" name="Comissão" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ ARCHITECTURE FOOTER ═══════════════════ */}
      <Card className="border shadow-sm bg-slate-50/50 dark:bg-slate-950/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-violet-500" />
            <p className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Arquitetura PI2</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {[
              "Wallet Dedicada por Motoboy",
              "Ledger Append-Only",
              "Split Automático por Corrida",
              "Reserva de Saldo antes do Payout",
              "Reconciliação Backend-Driven",
              "Anti-Fraude Ready",
            ].map(label => (
              <span key={label} className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400 rounded-lg border border-violet-200 dark:border-violet-800 font-bold">
                <CheckCircle className="h-3 w-3" /> {label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════ SPLIT DETAIL DRAWER ═══════════════════ */}
      <Sheet open={!!selectedSplit} onOpenChange={o => !o && setSelectedSplit(null)}>
        <SheetContent className="w-[460px] sm:max-w-[460px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4" /> Detalhe do Repasse</SheetTitle>
            <SheetDescription>Informações do split automático</SheetDescription>
          </SheetHeader>
          {selectedSplit && (
            <div className="space-y-4 mt-4">
              <div className="rounded-xl bg-gradient-to-r from-pink-900 to-rose-800 p-5 text-white">
                <p className="text-[10px] text-white/50 mb-1">Valor bruto</p>
                <p className="text-2xl font-black tabular-nums">{formatBRL(selectedSplit.gross_amount_cents || selectedSplit.valor_bruto || 0)}</p>
                <div className="flex gap-4 mt-2 text-[11px] text-white/50">
                  <span>Comissão: {formatBRL(selectedSplit.platform_fee_cents || selectedSplit.comissao_plataforma || 0)}</span>
                  <span>Líquido: {formatBRL(selectedSplit.net_courier_cents || selectedSplit.liquido_motoboy || 0)}</span>
                </div>
              </div>
              <div className="space-y-2">
                {Object.entries(selectedSplit).filter(([k]) => !k.startsWith("_")).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-[11px] py-1.5 border-b border-border/40">
                    <span className="font-bold text-muted-foreground min-w-[130px] shrink-0">{key}</span>
                    <span className="font-mono text-[10px] break-all">{value != null ? String(value) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ═══════════════════ WITHDRAWAL DETAIL DRAWER ═══════════════════ */}
      <Sheet open={!!selectedWd} onOpenChange={o => !o && setSelectedWd(null)}>
        <SheetContent className="w-[460px] sm:max-w-[460px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" /> Detalhe do Saque</SheetTitle>
            <SheetDescription>Trilha operacional do payout do motoboy</SheetDescription>
          </SheetHeader>
          {selectedWd && (
            <div className="space-y-4 mt-4">
              <div className="rounded-xl bg-gradient-to-r from-violet-900 to-purple-800 p-5 text-white">
                <Badge className={`text-[9px] mb-2 font-bold ${getPayoutStatusColor(selectedWd.status)}`}>{getPayoutStatusLabel(selectedWd.status)}</Badge>
                <p className="text-2xl font-black tabular-nums">{formatBRL(selectedWd.amount_cents || selectedWd.valor_solicitado || 0)}</p>
                <div className="flex gap-4 mt-2 text-[11px] text-white/50">
                  <span>Taxa: {(selectedWd.fee_cents || selectedWd.taxa) ? formatBRL(selectedWd.fee_cents || selectedWd.taxa || 0) : "R$ 0,00"}</span>
                  <span>Líquido: {formatBRL(selectedWd.net_amount_cents || selectedWd.valor_liquido || selectedWd.amount_cents || 0)}</span>
                </div>
              </div>
              <div className="space-y-2">
                {Object.entries(selectedWd).filter(([k]) => !k.startsWith("_")).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-[11px] py-1.5 border-b border-border/40">
                    <span className="font-bold text-muted-foreground min-w-[130px] shrink-0">{key}</span>
                    <span className="font-mono text-[10px] break-all">{value != null ? String(value) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <div className="text-center py-3 border-t border-border/50">
        <p className="text-[9px] text-muted-foreground/40 font-medium tracking-wider">
          PI2 v2.0 · Views: wallet_overview · split_details · withdrawal_details · Backend-driven · Reconciliação ativa
        </p>
      </div>
    </div>
  );
}
