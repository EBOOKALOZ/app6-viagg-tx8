/**
 * Resumo Financeiro da Plataforma — módulo Comissão Inteligente (Admin)
 *
 * Fonte oficial: pay_escrow_holds (escrow do módulo PAY) —
 *   amount_cents (bruto) / platform_fee_cents (comissão da plataforma) /
 *   professional_amount_cents (repasse do parceiro), por categoria
 *   (service_type), status e data.
 *
 * Preferência: RPC admin_commission_finance (SECURITY DEFINER).
 * Fallback pré-migration: leitura direta da tabela com agregação local.
 *
 * Regras de cálculo:
 *   · Receita considera status held + released (refunded/expired/cancelled fora)
 *   · Comissões RECEBIDAS = fee de escrows released
 *   · Comissões PENDENTES = fee de escrows held
 *   · Repasses PAGOS aos parceiros = professional de escrows released
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Landmark, Wallet, HandCoins, TrendingUp, AlertTriangle,
  Bike, Zap, Car, Truck, Package,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

interface FinanceRow {
  day: string;               // yyyy-mm-dd
  service_type: string;
  status: string;
  tx_count: number;
  gross_cents: number;
  fee_cents: number;
  professional_cents: number;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  ride:            { label: "Motoristas",  icon: Car,     color: "#f59e0b" },
  mototaxi:        { label: "Moto-Táxi",   icon: Zap,     color: "#3b82f6" },
  delivery:        { label: "Motoboys",    icon: Bike,    color: "#f97316" },
  freight:         { label: "Fretes",      icon: Truck,   color: "#6366f1" },
  credit_purchase: { label: "Créditos",    icon: Package, color: "#10b981" },
};

const catLabel = (t: string) => CATEGORY_META[t]?.label ?? t;

/* Estrito: SÓ função inexistente (PGRST202); erros de runtime vão
   para a faixa vermelha com a mensagem real. */
const isMissingRpc = (err: unknown) =>
  String(err).includes("Could not find the function") || String(err).includes("PGRST202");
const isMissingTable = (err: unknown) =>
  !!err && /could not find the table|PGRST205|relation .* does not exist/i.test(err.message || String(err));

const REVENUE_STATUSES = new Set(["held", "released"]);

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const fmtBRLCompact = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1,
  }).format(cents / 100);

/** Fallback pré-migration: agrega pay_escrow_holds no cliente */
async function fetchFinanceFallback(): Promise<FinanceRow[]> {
  const { data, error } = await supabase.from("pay_escrow_holds")
    .select("service_type, status, amount_cents, platform_fee_cents, professional_amount_cents, created_at")
    .limit(10000);
  if (error) throw error;

  const map = new Map<string, FinanceRow>();
  for (const e of data || []) {
    const day = String(e.created_at).slice(0, 10);
    const key = `${day}|${e.service_type}|${e.status}`;
    const row = map.get(key) || {
      day, service_type: e.service_type, status: e.status,
      tx_count: 0, gross_cents: 0, fee_cents: 0, professional_cents: 0,
    };
    row.tx_count += 1;
    row.gross_cents += e.amount_cents || 0;
    row.fee_cents += e.platform_fee_cents || 0;
    row.professional_cents += e.professional_amount_cents || 0;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

export function CommissionFinancePanel() {
  const financeQuery = useQuery({
    queryKey: ["admin-commission-finance"],
    queryFn: async (): Promise<{ rows: FinanceRow[]; fallback: boolean; missingTable: boolean }> => {
      // @ts-expect-error RPC admin_commission_finance ausente
      const { data, error } = await supabase.rpc("admin_commission_finance", { p_days: 730 });
      if (!error) return { rows: (data || []) as FinanceRow[], fallback: false, missingTable: false };
      if (isMissingTable(error)) return { rows: [], fallback: true, missingTable: true };
      if (isMissingRpc(error)) {
        try {
          return { rows: await fetchFinanceFallback(), fallback: true, missingTable: false };
        } catch (fbErr) {
          if (isMissingTable(fbErr)) return { rows: [], fallback: true, missingTable: true };
          throw fbErr;
        }
      }
      throw error;
    },
    refetchInterval: 20_000,
    staleTime: 15_000,
    retry: 1,
  });

  const rows = financeQuery.data?.rows || [];
  const fallbackMode = financeQuery.data?.fallback ?? false;
  const missingTable = financeQuery.data?.missingTable ?? false;

  // ── OPERAÇÕES CONCLUÍDAS (composição por corrida/entrega) ─────────────────
  const [opDays, setOpDays] = useState("30");
  const [opStatus, setOpStatus] = useState("all");
  const [opCat, setOpCat] = useState("all");
  const [opProf, setOpProf] = useState("");

  const opsQuery = useQuery({
    queryKey: ["admin-commission-ops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pay_escrow_holds")
        .select("id, created_at, released_at, service_type, service_id, status, professional_user_id, amount_cents, platform_fee_cents, professional_amount_cents, metadata")
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      const ops: Record<string, unknown>[] = data || [];
      // Nomes dos profissionais em UMA consulta (admin lê profiles)
      const ids = Array.from(new Set(ops.map((o) => o.professional_user_id).filter(Boolean)));
      const names: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase.from("profiles")
          .select("id, name").in("id", ids);
        for (const p of profs || []) names[p.id] = p.name;
      }
      return { ops, names };
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 1,
  });

  const opsFiltered = useMemo(() => {
    const ops = opsQuery.data?.ops || [];
    const names = opsQuery.data?.names || {};
    const cutoff = opDays === "all" ? null
      : new Date(Date.now() - Number(opDays) * 86400_000).toISOString();
    return ops
      .filter((o) => !cutoff || o.created_at >= cutoff)
      .filter((o) => opStatus === "all" || o.status === opStatus)
      .filter((o) => opCat === "all" || o.service_type === opCat)
      .filter((o) => {
        if (!opProf.trim()) return true;
        const q = opProf.trim().toLowerCase();
        const nome = (names[o.professional_user_id] || "").toLowerCase();
        return nome.includes(q) || String(o.professional_user_id || "").startsWith(q);
      })
      .map((o) => ({
        ...o,
        profName: names[o.professional_user_id]
          || (o.professional_user_id ? String(o.professional_user_id).slice(0, 8) : "—"),
        // % oficial: gravado no metadata pela liquidação; senão derivado dos
        // MESMOS centavos oficiais (formatação, não recálculo).
        pct: o.metadata?.commission_percent
          ?? (o.amount_cents > 0
              ? Math.round((o.platform_fee_cents / o.amount_cents) * 1000) / 10
              : null),
        pagamento: o.metadata?.payment_method || "—",
      }));
  }, [opsQuery.data, opDays, opStatus, opCat, opProf]);
  const loading = financeQuery.isLoading;

  const m = useMemo(() => {
    const revenue = rows.filter((r) => REVENUE_STATUSES.has(r.status));
    const released = rows.filter((r) => r.status === "released");
    const held = rows.filter((r) => r.status === "held");

    const sum = (list: FinanceRow[], f: (r: FinanceRow) => number) =>
      list.reduce((s, r) => s + f(r), 0);

    const grossTotal = sum(revenue, (r) => r.gross_cents);
    const feeTotal = sum(revenue, (r) => r.fee_cents);
    const partnerTotal = sum(revenue, (r) => r.professional_cents);
    const txTotal = sum(revenue, (r) => r.tx_count);

    const feeReceived = sum(released, (r) => r.fee_cents);
    const feePending = sum(held, (r) => r.fee_cents);
    const partnerPaid = sum(released, (r) => r.professional_cents);

    const avgCommission = grossTotal > 0 ? (feeTotal / grossTotal) * 100 : 0;
    const avgTicket = txTotal > 0 ? grossTotal / txTotal : 0;

    // Períodos (dia local)
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
    const weekStr = startOfWeek.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    const yearStr = todayStr.slice(0, 4);

    const feeInPeriod = (test: (day: string) => boolean) =>
      sum(revenue.filter((r) => test(r.day)), (r) => r.fee_cents);

    const feeToday = feeInPeriod((d) => d === todayStr);
    const feeWeek = feeInPeriod((d) => d >= weekStr);
    const feeMonth = feeInPeriod((d) => d.slice(0, 7) === monthStr);
    const feeYear = feeInPeriod((d) => d.slice(0, 4) === yearStr);

    // Por categoria
    const byCat = new Map<string, { gross: number; fee: number; partner: number; count: number }>();
    for (const r of revenue) {
      const c = byCat.get(r.service_type) || { gross: 0, fee: 0, partner: 0, count: 0 };
      c.gross += r.gross_cents; c.fee += r.fee_cents;
      c.partner += r.professional_cents; c.count += r.tx_count;
      byCat.set(r.service_type, c);
    }

    // Gráfico: receita diária da plataforma (últimos 30 dias)
    const daily: { label: string; plataforma: number; bruto: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayRows = revenue.filter((r) => r.day === ds);
      daily.push({
        label: ds.slice(8, 10) + "/" + ds.slice(5, 7),
        plataforma: sum(dayRows, (r) => r.fee_cents) / 100,
        bruto: sum(dayRows, (r) => r.gross_cents) / 100,
      });
    }

    // Gráfico: mensal (12 meses) plataforma × parceiros + comissão média
    const monthly: { label: string; plataforma: number; parceiros: number; pct: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthRows = revenue.filter((r) => r.day.slice(0, 7) === ms);
      const g = sum(monthRows, (r) => r.gross_cents);
      const f = sum(monthRows, (r) => r.fee_cents);
      monthly.push({
        label: ms.slice(5, 7) + "/" + ms.slice(2, 4),
        plataforma: f / 100,
        parceiros: sum(monthRows, (r) => r.professional_cents) / 100,
        pct: g > 0 ? Number(((f / g) * 100).toFixed(1)) : 0,
      });
    }

    // Gráfico: distribuição por categoria (comissão da plataforma)
    const catChart = Array.from(byCat.entries()).map(([type, c]) => ({
      label: catLabel(type),
      plataforma: c.fee / 100,
      parceiros: c.partner / 100,
      color: CATEGORY_META[type]?.color ?? "#94a3b8",
    }));

    return {
      grossTotal, feeTotal, partnerTotal, txTotal,
      feeReceived, feePending, partnerPaid,
      avgCommission, avgTicket,
      feeToday, feeWeek, feeMonth, feeYear,
      byCat, daily, monthly, catChart,
      countRides: byCat.get("ride")?.count ?? 0,
      countMototaxi: byCat.get("mototaxi")?.count ?? 0,
      countDeliveries: byCat.get("delivery")?.count ?? 0,
      countFreight: byCat.get("freight")?.count ?? 0,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pt-2">
        <Landmark className="h-4 w-4 text-motoboy" />
        <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">
          Resumo Financeiro da Plataforma
        </h2>
      </div>

      {missingTable ? (
        <Alert className="bg-amber-50 border-amber-300">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-black">
            <strong>Módulo de escrow ainda não instalado no banco.</strong> A tabela{" "}
            <code className="bg-amber-100 px-1 rounded text-black">pay_escrow_holds</code> não existe no
            projeto Supabase — por isso os valores abaixo aparecem zerados. Para ativar o Resumo
            Financeiro, rode no SQL Editor (nesta ordem):{" "}
            <code className="bg-amber-100 px-1 rounded text-black">supabase/pay_module.sql</code> e depois{" "}
            <code className="bg-amber-100 px-1 rounded text-black">20260705_comissao_financeiro_admin.sql</code>.
            A partir daí, cada cobrança nova passa a alimentar estes indicadores automaticamente.
          </AlertDescription>
        </Alert>
      ) : fallbackMode && (
        <Alert className="bg-amber-50 border-amber-300">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-black">
            Calculado por leitura direta do escrow. Rode a migration{" "}
            <code className="bg-amber-100 px-1 rounded text-black">20260705_comissao_financeiro_admin.sql</code>{" "}
            para ativar a agregação otimizada no banco.
          </AlertDescription>
        </Alert>
      )}

      {financeQuery.isError && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-xs text-black">
            Erro ao carregar dados financeiros: {financeQuery.error instanceof Error ? financeQuery.error.message : String(financeQuery.error)}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Indicadores principais ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MoneyCard icon={<TrendingUp className="h-4 w-4 text-blue-500" />} label="Valor total faturado (bruto)" cents={m.grossTotal} loading={loading} />
        <MoneyCard icon={<Landmark className="h-4 w-4 text-motoboy" />} label="Destinado à plataforma (comissões)" cents={m.feeTotal} loading={loading} highlight />
        <MoneyCard icon={<HandCoins className="h-4 w-4 text-emerald-500" />} label="Destinado aos parceiros" cents={m.partnerTotal} loading={loading} />
        <MoneyCard icon={<Wallet className="h-4 w-4 text-violet-500" />} label="Receita líquida da plataforma" cents={m.feeTotal} loading={loading} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MoneyCard label="Comissões recebidas (liberadas)" cents={m.feeReceived} loading={loading} small />
        <MoneyCard label="Comissões pendentes (em escrow)" cents={m.feePending} loading={loading} small />
        <MoneyCard label="Repasses pagos aos parceiros" cents={m.partnerPaid} loading={loading} small />
        <StatCard label="Comissão média efetiva" value={loading ? null : `${m.avgCommission.toFixed(1)}%`} small />
      </div>

      {/* ── Receita por período ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MoneyCard label="Receita de hoje" cents={m.feeToday} loading={loading} small />
        <MoneyCard label="Receita da semana" cents={m.feeWeek} loading={loading} small />
        <MoneyCard label="Receita do mês" cents={m.feeMonth} loading={loading} small />
        <MoneyCard label="Receita do ano" cents={m.feeYear} loading={loading} small />
      </div>

      {/* ── Volume ── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard label="Operações (total)" value={loading ? null : String(m.txTotal)} small />
        <StatCard label="Ticket médio" value={loading ? null : fmtBRL(m.avgTicket)} small />
        <StatCard label="Corridas (Motorista)" value={loading ? null : String(m.countRides)} small />
        <StatCard label="Corridas (Moto-Táxi)" value={loading ? null : String(m.countMototaxi)} small />
        <StatCard label="Entregas (Motoboy)" value={loading ? null : String(m.countDeliveries)} small />
        <StatCard label="Fretes / Serviços" value={loading ? null : String(m.countFreight)} small />
      </div>

      {/* ── Separação por categoria ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <CategoryCard
          title="Plataforma" icon={Landmark} color="#8b5cf6" loading={loading}
          lines={[
            { label: "Receita bruta (fluxo total)", cents: m.grossTotal },
            { label: "Comissão recebida", cents: m.feeReceived },
            { label: "Receita líquida", cents: m.feeTotal },
            { label: "Total acumulado", cents: m.feeTotal },
          ]}
        />
        {(["ride", "mototaxi", "delivery"] as const).map((type) => {
          const c = m.byCat.get(type) || { gross: 0, fee: 0, partner: 0, count: 0 };
          const meta = CATEGORY_META[type];
          return (
            <CategoryCard
              key={type} title={meta.label} icon={meta.icon} color={meta.color} loading={loading}
              lines={[
                { label: "Total recebido (bruto)", cents: c.gross },
                { label: "Comissão descontada", cents: c.fee },
                { label: "Valor líquido (parceiros)", cents: c.partner },
                { label: `Transações: ${c.count}`, cents: null },
              ]}
            />
          );
        })}
      </div>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Receita diária — últimos 30 dias (R$)">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={m.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number, name: string) => [fmtBRL(Math.round(v * 100)), name === "plataforma" ? "Plataforma" : "Faturamento bruto"]} />
              <Area type="monotone" dataKey="bruto" stroke="#93c5fd" fill="#93c5fd" fillOpacity={0.25} strokeWidth={1.5} />
              <Area type="monotone" dataKey="plataforma" stroke="hsl(var(--motoboy))" fill="hsl(var(--motoboy))" fillOpacity={0.35} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Receita mensal — Plataforma × Parceiros (12 meses)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number, name: string) => [fmtBRL(Math.round(v * 100)), name === "plataforma" ? "Plataforma" : "Parceiros"]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="parceiros" stackId="a" fill="#34d399" name="Parceiros" />
              <Bar dataKey="plataforma" stackId="a" fill="#f97316" name="Plataforma" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolução da comissão média mensal (%)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={m.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip formatter={(v: number) => [`${v}%`, "Comissão média"]} />
              <Line type="monotone" dataKey="pct" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribuição por categoria (R$)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.catChart} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
              <Tooltip formatter={(v: number, name: string) => [fmtBRL(Math.round(v * 100)), name === "plataforma" ? "Plataforma" : "Parceiros"]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="plataforma" fill="#f97316" name="Plataforma" />
              <Bar dataKey="parceiros" fill="#34d399" name="Parceiros" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Operações concluídas: composição financeira POR CORRIDA ──
          Fonte oficial (pay_escrow_holds = cópia exata da liquidação).
          Total = Ganho + Comissão por construção — aqui só formata. */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-motoboy" />
            Operações concluídas — composição por corrida
            <Badge variant="outline" className="ml-1 text-[10px]">{opsFiltered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filtros */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Select value={opDays} onValueChange={setOpDays}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Tudo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={opStatus} onValueChange={setOpStatus}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="released">Liberado (pago)</SelectItem>
                <SelectItem value="held">Em escrow</SelectItem>
                <SelectItem value="refunded">Estornado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={opCat} onValueChange={setOpCat}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                <SelectItem value="delivery">Motoboy</SelectItem>
                <SelectItem value="mototaxi">Moto-Táxi</SelectItem>
                <SelectItem value="ride">Motorista</SelectItem>
                <SelectItem value="freight">Frete</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={opProf}
              onChange={(e) => setOpProf(e.target.value)}
              placeholder="Profissional (nome ou id)"
              className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 placeholder:text-slate-300"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Data/Hora</TableHead>
                  <TableHead className="text-xs">Categoria</TableHead>
                  <TableHead className="text-xs">Profissional</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Pgto</TableHead>
                  <TableHead className="text-xs text-right">Valor Total</TableHead>
                  <TableHead className="text-xs text-right">Ganho Prof.</TableHead>
                  <TableHead className="text-xs text-right">Comissão</TableHead>
                  <TableHead className="text-xs text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opsQuery.isLoading && (
                  <TableRow><TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">Carregando operações…</TableCell></TableRow>
                )}
                {!opsQuery.isLoading && opsFiltered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">Nenhuma operação no filtro atual.</TableCell></TableRow>
                )}
                {opsFiltered.slice(0, 100).map((o: Record<string, unknown>) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{catLabel(o.service_type)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs font-medium">{o.profName}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px]",
                        o.status === "released" ? "bg-emerald-100 text-emerald-700"
                        : o.status === "held" ? "bg-amber-100 text-amber-700"
                        : "bg-zinc-100 text-zinc-600")}>
                        {o.status === "released" ? "Pago" : o.status === "held" ? "Escrow" : o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{o.pagamento}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold">{fmtBRL(o.amount_cents)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-emerald-600">{fmtBRL(o.professional_amount_cents)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-bold text-motoboy">{fmtBRL(o.platform_fee_cents)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{o.pct != null ? `${o.pct}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Sub-componentes ── */

function MoneyCard({ icon, label, cents, loading, highlight, small }: {
  icon?: React.ReactNode; label: string; cents: number; loading: boolean;
  highlight?: boolean; small?: boolean;
}) {
  return (
    <Card className={cn("bg-white", highlight && "border-motoboy/40 bg-motoboy/5")}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-24" />
        ) : (
          <p className={cn("font-black tabular-nums", small ? "text-base" : "text-xl", highlight && "text-motoboy")}
            title={fmtBRL(cents)}>
            {cents >= 100_000_00 ? fmtBRLCompact(cents) : fmtBRL(cents)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, small }: { label: string; value: string | null; small?: boolean }) {
  return (
    <Card className="bg-white">
      <CardContent className="p-4">
        <p className="text-[11px] text-muted-foreground leading-tight mb-1">{label}</p>
        {value === null ? <Skeleton className="h-6 w-16" /> : (
          <p className={cn("font-black tabular-nums", small ? "text-base" : "text-xl")}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryCard({ title, icon: Icon, color, lines, loading }: {
  title: string; icon: React.ElementType; color: string; loading: boolean;
  lines: { label: string; cents: number | null }[];
}) {
  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}1a` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {lines.map((l) => (
          <div key={l.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{l.label}</span>
            {l.cents === null ? (
              <span />
            ) : loading ? (
              <Skeleton className="h-4 w-16" />
            ) : (
              <span className="font-bold tabular-nums">{fmtBRL(l.cents)}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56">{children}</div>
      </CardContent>
    </Card>
  );
}
