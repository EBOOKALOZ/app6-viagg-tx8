/**
 * ProfileFinancialDashboard — Dashboard Financeiro Analítico por Perfil Operacional
 *
 * Suporta os perfis:
 *  · Motoboy (service_type: "delivery", tabela: "service_orders")
 *  · Moto Táxi (service_type: "mototaxi", tabela: "moto_taxi_corridas")
 *  · Motorista (service_type: "ride", tabela: "motorista_corridas")
 *
 * Infraestrutura Oficial de Dados:
 *  · Ledger Financeiro / Escrow: pay_escrow_holds (amount_cents, platform_fee_cents, professional_amount_cents)
 *  · Perfis & Profissionais: profiles (id, name, cidade, estado)
 *  · Indicadores Operacionais & Detalhes de Corrida: tabelas operacionais respectivas (distância, tempo, status em tempo real)
 */
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, DollarSign, Award, Calendar, MapPin, CreditCard,
  Download, FileSpreadsheet, FileText, CheckCircle2, XCircle, Clock, User,
  Filter, Search, RefreshCw, BarChart3, PieChart, Activity, ArrowUpRight,
  ArrowDownRight, Sparkles, ShieldCheck, Car, Bike, Zap, Navigation,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart as RePieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

export type OperationalProfileType = "delivery" | "mototaxi" | "ride";

export interface ProfileFinancialDashboardProps {
  profileType: OperationalProfileType;
  title: string;
  subtitle: string;
  accentColor: string;
  professionalId?: string;
  professionalName?: string;
}

interface EscrowOperationRow {
  id: string;
  created_at: string;
  released_at: string | null;
  service_type: string;
  service_id: string | null;
  status: string;
  professional_user_id: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  professional_amount_cents: number;
  metadata: Record<string, unknown> | null;
}

const COLORS_PIE = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"];

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const fmtNumber = (num: number, decimals = 1) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals }).format(num);

export function ProfileFinancialDashboard({
  profileType,
  title,
  subtitle,
  accentColor,
  professionalId,
  professionalName,
}: ProfileFinancialDashboardProps) {
  // ── Filtros Analíticos ──────────────────────────────────────────────────────
  const [filterPeriod, setFilterPeriod] = useState<string>("30");
  const [filterCity, setFilterCity] = useState<string>("all");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterProf, setFilterProf] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPayMethod, setFilterPayMethod] = useState<string>("all");
  const [filterMinVal, setFilterMinVal] = useState<string>("");
  const [filterMaxVal, setFilterMaxVal] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("overview");

  // ── Consulta Principal no Ledger Oficial (pay_escrow_holds) + Perfis ──────
  const financialQuery = useQuery({
    queryKey: ["admin-profile-financial", profileType, professionalId],
    queryFn: async () => {
      // 1. Busca transações financeiras deste perfil ou profissional
      // @ts-expect-error - Table not fully typed in Supabase generated types
      let queryBuilder = supabase.from("pay_escrow_holds")
        .select("id, created_at, released_at, service_type, service_id, status, professional_user_id, amount_cents, platform_fee_cents, professional_amount_cents, metadata");
      
      queryBuilder = queryBuilder.eq("service_type", profileType);
      if (professionalId) {
        queryBuilder = queryBuilder.eq("professional_user_id", professionalId);
      }

      const { data: escrowData, error: escrowError } = await queryBuilder
        .order("created_at", { ascending: false })
        .limit(2000);

      if (escrowError) throw escrowError;
      const rawEscrows: EscrowOperationRow[] = escrowData || [];

      // 2. Busca nomes e cidades dos profissionais no profiles
      const profIds = Array.from(new Set([
        ...rawEscrows.map((e) => e.professional_user_id).filter(Boolean),
        ...(professionalId ? [professionalId] : []),
      ]));
      const profMap: Record<string, { name: string; cidade: string; estado: string }> = {};

      if (profIds.length > 0) {
        // @ts-expect-error - Profiles table missing specific fields in types
        const { data: profData } = await supabase.from("profiles")
          .select("id, name, cidade, estado")
          .in("id", profIds);

        for (const p of profData || []) {
          profMap[p.id] = {
            name: p.name || "Profissional",
            cidade: p.cidade || "Não informada",
            estado: p.estado || "BR",
          };
        }
      }

      // 3. Busca métricas operacionais na tabela respectiva (se houver service_id)
      const opTable =
        profileType === "delivery"
          ? "service_orders"
          : profileType === "mototaxi"
          ? "moto_taxi_corridas"
          : "motorista_corridas";

      const orderIds = Array.from(new Set(rawEscrows.map((e) => e.service_id).filter(Boolean)));
      const orderMap: Record<string, { distance_km: number; duration_min: number; client_name: string }> = {};

      if (orderIds.length > 0) {
        try {
          // @ts-expect-error - Dynamic table name not indexable in Supabase types
          const { data: ordersData } = await supabase.from(opTable)
            .select("id, distance_km, estimated_time_minutes, client_name")
            .in("id", orderIds.slice(0, 300));

          for (const o of ordersData || []) {
            orderMap[o.id] = {
              distance_km: Number(o.distance_km || 0),
              duration_min: Number(o.estimated_time_minutes || 15),
              client_name: o.client_name || "Cliente Plataforma",
            };
          }
        } catch {
          // Fallback silencioso se a coluna não existir na tabela
        }
      }

      // 4. Também busca contagem de corridas na tabela operacional (concluídas vs canceladas vs em andamento)
      let opStats = { completed: 0, cancelled: 0, inProgress: 0 };
      try {
        // @ts-expect-error - Dynamic table name not indexable in Supabase types
        let opQuery = supabase.from(opTable).select("driver_status");
        if (professionalId) {
          opQuery = opQuery.eq("driver_id", professionalId);
        }
        const { data: statusRows } = await opQuery.limit(1000);

        for (const row of statusRows || []) {
          const st = row.driver_status || "";
          if (st === "completed") opStats.completed++;
          else if (st === "cancelled" || st === "payment_timeout") opStats.cancelled++;
          else opStats.inProgress++;
        }
      } catch {
        // Fallback pelos status dos escrows
        for (const e of rawEscrows) {
          if (e.status === "released") opStats.completed++;
          else if (e.status === "refunded" || e.status === "cancelled") opStats.cancelled++;
          else opStats.inProgress++;
        }
      }

      return {
        escrows: rawEscrows,
        profMap,
        orderMap,
        opStats,
      };
    },
    refetchInterval: 20_000,
    staleTime: 15_000,
  });

  const loading = financialQuery.isLoading;

  // ── Aplicação de Filtros ────────────────────────────────────────────────────
  const filteredOperations = useMemo(() => {
    const escrows = financialQuery.data?.escrows || [];
    const profMap = financialQuery.data?.profMap || {};
    const orderMap = financialQuery.data?.orderMap || {};

    const now = new Date();
    const cutoffDate =
      filterPeriod === "all"
        ? null
        : new Date(now.getTime() - Number(filterPeriod) * 86400_000);

    const minCents = filterMinVal ? Number(filterMinVal) * 100 : null;
    const maxCents = filterMaxVal ? Number(filterMaxVal) * 100 : null;

    return escrows
      .filter((op) => {
        if (professionalId && op.professional_user_id !== professionalId) return false;
        if (cutoffDate && new Date(op.created_at) < cutoffDate) return false;
        if (filterStatus !== "all" && op.status !== filterStatus) return false;

        const profInfo = op.professional_user_id ? profMap[op.professional_user_id] : null;
        const cidade = profInfo?.cidade || "Não informada";
        const estado = profInfo?.estado || "BR";

        if (filterCity !== "all" && cidade !== filterCity) return false;
        if (filterState !== "all" && estado !== filterState) return false;

        if (filterProf.trim()) {
          const q = filterProf.trim().toLowerCase();
          const profName = (profInfo?.name || "").toLowerCase();
          const profId = (op.professional_user_id || "").toLowerCase();
          if (!profName.includes(q) && !profId.includes(q)) return false;
        }

        const payMethod = op.metadata?.payment_method || "Pix";
        if (filterPayMethod !== "all" && payMethod !== filterPayMethod) return false;

        if (minCents !== null && op.amount_cents < minCents) return false;
        if (maxCents !== null && op.amount_cents > maxCents) return false;

        return true;
      })
      .map((op) => {
        const profInfo = op.professional_user_id ? profMap[op.professional_user_id] : null;
        const orderInfo = op.service_id ? orderMap[op.service_id] : null;
        const pct =
          op.amount_cents > 0
            ? Math.round((op.platform_fee_cents / op.amount_cents) * 1000) / 10
            : 0;

        return {
          id: op.id,
          service_id: op.service_id || op.id,
          created_at: op.created_at,
          dateFormatted: new Date(op.created_at).toLocaleDateString("pt-BR"),
          timeFormatted: new Date(op.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          profId: op.professional_user_id,
          profName: profInfo?.name || "Parceiro " + (op.professional_user_id ? op.professional_user_id.slice(0, 6) : "—"),
          city: profInfo?.cidade || "São Paulo",
          state: profInfo?.estado || "SP",
          clientName: orderInfo?.client_name || op.metadata?.client_name || "Cliente Plataforma",
          distanceKm: orderInfo?.distance_km || op.metadata?.distance_km || 4.2,
          durationMin: orderInfo?.duration_min || op.metadata?.duration_min || 18,
          grossCents: op.amount_cents,
          profCents: op.professional_amount_cents,
          feeCents: op.platform_fee_cents,
          pct,
          payMethod: op.metadata?.payment_method || "Pix",
          status: op.status,
        };
      });
  }, [financialQuery.data, filterPeriod, filterCity, filterState, filterProf, filterStatus, filterPayMethod, filterMinVal, filterMaxVal]);

  // ── Listas de Cidades e Estados para Filtro ─────────────────────────────────
  const citiesList = useMemo(() => {
    const set = new Set<string>();
    filteredOperations.forEach((o) => set.add(o.city));
    return Array.from(set).sort();
  }, [filteredOperations]);

  const statesList = useMemo(() => {
    const set = new Set<string>();
    filteredOperations.forEach((o) => set.add(o.state));
    return Array.from(set).sort();
  }, [filteredOperations]);

  // ── Agregação de Métricas Executivas e Cards ────────────────────────────────
  const metrics = useMemo(() => {
    const totalOps = filteredOperations.length;
    let grossTotal = 0;
    let profTotal = 0;
    let feeTotal = 0;
    let totalDistanceKm = 0;
    let totalDurationMin = 0;

    const daySums: Record<string, number> = {};
    const monthSums: Record<string, { gross: number; fee: number; prof: number }> = {};
    const payMethodMap: Record<string, number> = {};
    const cityMap: Record<string, number> = {};
    const statusMap: Record<string, number> = {};

    filteredOperations.forEach((o) => {
      grossTotal += o.grossCents;
      profTotal += o.profCents;
      feeTotal += o.feeCents;
      totalDistanceKm += o.distanceKm;
      totalDurationMin += o.durationMin;

      // Por dia
      daySums[o.dateFormatted] = (daySums[o.dateFormatted] || 0) + o.grossCents;

      // Por mês (yyyy-mm)
      const ym = o.created_at.slice(0, 7);
      const mCur = monthSums[ym] || { gross: 0, fee: 0, prof: 0 };
      mCur.gross += o.grossCents;
      mCur.fee += o.feeCents;
      mCur.prof += o.profCents;
      monthSums[ym] = mCur;

      // Forma de pgto
      payMethodMap[o.payMethod] = (payMethodMap[o.payMethod] || 0) + o.grossCents;

      // Cidade
      cityMap[o.city] = (cityMap[o.city] || 0) + o.grossCents;

      // Status
      const stLabel = o.status === "released" ? "Pago (Liberado)" : o.status === "held" ? "Em Escrow" : "Estornado/Cancelado";
      statusMap[stLabel] = (statusMap[stLabel] || 0) + 1;
    });

    const avgTicket = totalOps > 0 ? grossTotal / totalOps : 0;
    const avgCommissionPct = grossTotal > 0 ? (feeTotal / grossTotal) * 100 : 0;
    const avgDistanceKm = totalOps > 0 ? totalDistanceKm / totalOps : 0;
    const avgDurationMin = totalOps > 0 ? totalDurationMin / totalOps : 0;
    const revenuePerKm = totalDistanceKm > 0 ? grossTotal / totalDistanceKm : 0;
    const commissionPerKm = totalDistanceKm > 0 ? feeTotal / totalDistanceKm : 0;

    // Melhor dia e Pior dia
    const dayEntries = Object.entries(daySums);
    let bestDay = { date: "—", cents: 0 };
    let worstDay = { date: "—", cents: Number.MAX_SAFE_INTEGER };
    if (dayEntries.length > 0) {
      dayEntries.forEach(([d, c]) => {
        if (c > bestDay.cents) bestDay = { date: d, cents: c };
        if (c < worstDay.cents) worstDay = { date: d, cents: c };
      });
    } else {
      worstDay = { date: "—", cents: 0 };
    }

    // Gráficos diários (últimos 30 dias)
    const now = new Date();
    const dailyChart: { label: string; receita: number; comissao: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dStr = d.toLocaleDateString("pt-BR");
      const dIso = d.toISOString().slice(0, 10);

      const dayOps = filteredOperations.filter((o) => o.created_at.slice(0, 10) === dIso);
      const rSum = dayOps.reduce((acc, curr) => acc + curr.grossCents, 0);
      const cSum = dayOps.reduce((acc, curr) => acc + curr.feeCents, 0);

      dailyChart.push({
        label: dStr.slice(0, 5),
        receita: rSum / 100,
        comissao: cSum / 100,
      });
    }

    // Gráfico mensal
    const monthlyChart = Object.entries(monthSums)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ym, vals]) => ({
        label: ym.slice(5, 7) + "/" + ym.slice(2, 4),
        receita: vals.gross / 100,
        comissao: vals.fee / 100,
        parceiros: vals.prof / 100,
        pct: vals.gross > 0 ? Number(((vals.fee / vals.gross) * 100).toFixed(1)) : 0,
      }));

    // Gráfico formas de pagamento
    const payMethodChart = Object.entries(payMethodMap).map(([name, value]) => ({
      name,
      value: value / 100,
    }));

    // Gráfico cidades
    const cityChart = Object.entries(cityMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({
        name,
        value: value / 100,
      }));

    // Gráfico status
    const statusChart = Object.entries(statusMap).map(([name, count]) => ({
      name,
      value: count,
    }));

    // Crescimento (comparação hoje vs ontem para exemplo)
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yestStr = yesterday.toISOString().slice(0, 10);

    const revToday = filteredOperations.filter((o) => o.created_at.slice(0, 10) === todayStr).reduce((acc, o) => acc + o.grossCents, 0);
    const revYesterday = filteredOperations.filter((o) => o.created_at.slice(0, 10) === yestStr).reduce((acc, o) => acc + o.grossCents, 0);
    const growthDailyPct = revYesterday > 0 ? ((revToday - revYesterday) / revYesterday) * 100 : revToday > 0 ? 100 : 0;

    return {
      totalOps,
      grossTotal,
      profTotal,
      feeTotal,
      avgTicket,
      avgCommissionPct,
      bestDay,
      worstDay,
      dailyChart,
      monthlyChart,
      payMethodChart,
      cityChart,
      statusChart,
      avgDistanceKm,
      avgDurationMin,
      revenuePerKm,
      commissionPerKm,
      growthDailyPct,
    };
  }, [filteredOperations]);

  // ── Rankings de Profissionais ───────────────────────────────────────────────
  const rankings = useMemo(() => {
    const map = new Map<string, {
      profId: string;
      name: string;
      gross: number;
      fee: number;
      count: number;
      distance: number;
    }>();

    filteredOperations.forEach((o) => {
      const key = o.profId || o.profName;
      const cur = map.get(key) || {
        profId: key,
        name: o.profName,
        gross: 0,
        fee: 0,
        count: 0,
        distance: 0,
      };
      cur.gross += o.grossCents;
      cur.fee += o.feeCents;
      cur.count += 1;
      cur.distance += o.distanceKm;
      map.set(key, cur);
    });

    const arr = Array.from(map.values());

    return {
      topEarners: [...arr].sort((a, b) => b.gross - a.gross).slice(0, 5),
      topRides: [...arr].sort((a, b) => b.count - a.count).slice(0, 5),
      topCommission: [...arr].sort((a, b) => b.fee - a.fee).slice(0, 5),
      topTicket: [...arr]
        .filter((i) => i.count >= 1)
        .sort((a, b) => b.gross / b.count - a.gross / a.count)
        .slice(0, 5),
      topDistance: [...arr].sort((a, b) => b.distance - a.distance).slice(0, 5),
    };
  }, [filteredOperations]);

  // ── Exportação dos Relatórios (CSV / Excel / PDF) ───────────────────────────
  const exportCSV = () => {
    const headers = [
      "ID Operação",
      "Data",
      "Hora",
      "Cliente",
      "Profissional",
      "Cidade",
      "Estado",
      "Distância (km)",
      "Valor Total (R$)",
      "Ganho Profissional (R$)",
      "Comissão Plataforma (R$)",
      "Percentual (%)",
      "Forma Pagamento",
      "Status",
    ];

    const rows = filteredOperations.map((o) => [
      o.id,
      o.dateFormatted,
      o.timeFormatted,
      `"${o.clientName}"`,
      `"${o.profName}"`,
      o.city,
      o.state,
      fmtNumber(o.distanceKm),
      (o.grossCents / 100).toFixed(2),
      (o.profCents / 100).toFixed(2),
      (o.feeCents / 100).toFixed(2),
      o.pct.toFixed(1) + "%",
      o.payMethod,
      o.status === "released" ? "Pago" : o.status === "held" ? "Escrow" : o.status,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio_${profileType}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExcel = () => {
    const tableHtml = `
      <table border="1">
        <thead>
          <tr style="background-color: #f1f5f9; font-weight: bold;">
            <th>ID Operação</th>
            <th>Data</th>
            <th>Hora</th>
            <th>Cliente</th>
            <th>Profissional</th>
            <th>Cidade</th>
            <th>Distância (km)</th>
            <th>Valor Total (R$)</th>
            <th>Ganho Prof. (R$)</th>
            <th>Comissão (R$)</th>
            <th>%</th>
            <th>Forma Pgto</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${filteredOperations
            .map(
              (o) => `
            <tr>
              <td>${o.id}</td>
              <td>${o.dateFormatted}</td>
              <td>${o.timeFormatted}</td>
              <td>${o.clientName}</td>
              <td>${o.profName}</td>
              <td>${o.city}</td>
              <td>${fmtNumber(o.distanceKm)}</td>
              <td>${(o.grossCents / 100).toFixed(2)}</td>
              <td>${(o.profCents / 100).toFixed(2)}</td>
              <td>${(o.feeCents / 100).toFixed(2)}</td>
              <td>${o.pct}%</td>
              <td>${o.payMethod}</td>
              <td>${o.status}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    const blob = new Blob([tableHtml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `relatorio_excel_${profileType}_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* ── Cabeçalho do Dashboard por Perfil ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b pb-4 w-full">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-3 w-3 rounded-full animate-pulse shrink-0"
              style={{ backgroundColor: accentColor }}
            />
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            <Badge variant="outline" className="font-bold text-black dark:text-white border-slate-300">
              Tempo Real • Oficial
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>

        {/* Botões de Exportação */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800 hover:text-white">
            <Download className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800 hover:text-white">
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} className="text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800 hover:text-white">
            <FileText className="mr-1.5 h-3.5 w-3.5 text-blue-400" /> PDF / Imprimir
          </Button>
        </div>
      </div>

      {/* ── Barra de Filtros Analíticos ── */}
      <Card className="bg-muted/30 border w-full">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filtros e Parametrização da Análise
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o histórico</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Cidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as cidades</SelectItem>
                {citiesList.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterState} onValueChange={setFilterState}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {statesList.map((st) => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="released">Pago / Liberado</SelectItem>
                <SelectItem value="held">Em Escrow</SelectItem>
                <SelectItem value="refunded">Estornado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPayMethod} onValueChange={setFilterPayMethod}>
              <SelectTrigger className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 hover:bg-slate-800"><SelectValue placeholder="Pgto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Formas Pgto</SelectItem>
                <SelectItem value="Pix">Pix</SelectItem>
                <SelectItem value="Cartão">Cartão</SelectItem>
                <SelectItem value="Saldo">Saldo Carteira</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={filterProf}
              onChange={(e) => setFilterProf(e.target.value)}
              placeholder="Profissional..."
              className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 placeholder:text-slate-300"
            />

            <Input
              type="number"
              value={filterMinVal}
              onChange={(e) => setFilterMinVal(e.target.value)}
              placeholder="R$ Mínimo"
              className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 placeholder:text-slate-300"
            />

            <Input
              type="number"
              value={filterMaxVal}
              onChange={(e) => setFilterMaxVal(e.target.value)}
              placeholder="R$ Máximo"
              className="h-9 text-xs text-white font-medium bg-slate-900 border-slate-700 placeholder:text-slate-300"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs de Visualização ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="overview">Visão Executiva & KPIs</TabsTrigger>
          <TabsTrigger value="charts">Gráficos & Evolução</TabsTrigger>
          <TabsTrigger value="rankings">Rankings de Performance</TabsTrigger>
          <TabsTrigger value="report">Relatório Operacional ({filteredOperations.length})</TabsTrigger>
        </TabsList>

        {/* ── ABA 1: VISÃO EXECUTIVA & CARDS FINANCEIROS ── */}
        <TabsContent value="overview" className="space-y-6">
          {/* Dashboard Executivo (8 KPIs Principais) */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">
              Dashboard Executivo ({title})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground">Receita Bruta Movimentada</span>
                  <DollarSign className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-xl font-black">{loading ? "…" : fmtBRL(metrics.grossTotal)}</div>
                  <span className="text-[10px] text-emerald-600 font-semibold">
                    {metrics.growthDailyPct >= 0 ? "+" : ""}{metrics.growthDailyPct.toFixed(1)}% dia ant.
                  </span>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground">Total Pago aos Profissionais</span>
                  <Award className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-xl font-black">{loading ? "…" : fmtBRL(metrics.profTotal)}</div>
                  <span className="text-[10px] text-muted-foreground">Repasse integral líquido</span>
                </CardContent>
              </Card>

              <Card className="border-2 shadow-sm" style={{ borderColor: accentColor }}>
                <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Comissão da Plataforma</span>
                  <Activity className="h-4 w-4" style={{ color: accentColor }} />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-xl font-black" style={{ color: accentColor }}>
                    {loading ? "…" : fmtBRL(metrics.feeTotal)}
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    Taxa média: {metrics.avgCommissionPct.toFixed(1)}%
                  </span>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground">Quantidade de Operações</span>
                  <Navigation className="h-4 w-4 text-violet-500" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-xl font-black">{loading ? "…" : metrics.totalOps}</div>
                  <span className="text-[10px] text-muted-foreground">Corridas/Entregas filtradas</span>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Cards Financeiros Secundários */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">
              Detalhamento Operacional & Desempenho
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <Card className="p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Ticket Médio</span>
                <p className="text-base font-black mt-1">{loading ? "…" : fmtBRL(metrics.avgTicket)}</p>
              </Card>
              <Card className="p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Comissão Média</span>
                <p className="text-base font-black mt-1">{loading ? "…" : `${metrics.avgCommissionPct.toFixed(1)}%`}</p>
              </Card>
              <Card className="p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Melhor Dia</span>
                <p className="text-xs font-black mt-1 truncate">{metrics.bestDay.date}</p>
                <span className="text-[10px] text-emerald-600 font-bold">{fmtBRL(metrics.bestDay.cents)}</span>
              </Card>
              <Card className="p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Pior Dia</span>
                <p className="text-xs font-black mt-1 truncate">{metrics.worstDay.date}</p>
                <span className="text-[10px] text-amber-600 font-bold">{fmtBRL(metrics.worstDay.cents)}</span>
              </Card>
              <Card className="p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Distância Média</span>
                <p className="text-base font-black mt-1">{fmtNumber(metrics.avgDistanceKm)} km</p>
              </Card>
              <Card className="p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Receita / KM</span>
                <p className="text-base font-black mt-1">{fmtBRL(metrics.revenuePerKm)}</p>
              </Card>
              <Card className="p-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">Comissão / KM</span>
                <p className="text-base font-black mt-1">{fmtBRL(metrics.commissionPerKm)}</p>
              </Card>
            </div>
          </div>

          {/* Indicadores Operacionais */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">
              Indicadores Operacionais em Tempo Real
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-muted-foreground">Concluídas com Sucesso</span>
                  <p className="text-xl font-black text-emerald-600 mt-0.5">
                    {financialQuery.data?.opStats.completed ?? 0}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500/20" />
              </Card>
              <Card className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-muted-foreground">Em Andamento (Ativas)</span>
                  <p className="text-xl font-black text-blue-600 mt-0.5">
                    {financialQuery.data?.opStats.inProgress ?? 0}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-blue-500/20" />
              </Card>
              <Card className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-muted-foreground">Canceladas / Expiradas</span>
                  <p className="text-xl font-black text-zinc-500 mt-0.5">
                    {financialQuery.data?.opStats.cancelled ?? 0}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-zinc-500/20" />
              </Card>
              <Card className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-muted-foreground">Tempo Médio Atendimento</span>
                  <p className="text-xl font-black text-foreground mt-0.5">
                    {fmtNumber(metrics.avgDurationMin, 0)} min
                  </p>
                </div>
                <Clock className="h-8 w-8 text-amber-500/20" />
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── ABA 2: GRÁFICOS & EVOLUÇÃO ── */}
        <TabsContent value="charts" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gráfico 1: Receita por Dia */}
            <Card className="p-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                Receita por Dia (Últimos 30 dias) — Bruto × Comissão
              </CardTitle>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtBRL(v * 100)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="receita" name="Receita Bruta" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="comissao" name="Comissão Plataforma" stroke={accentColor} fill={accentColor} fillOpacity={0.4} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Gráfico 2: Receita por Mês */}
            <Card className="p-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                Receita Mensal (Plataforma × Repasse Parceiros)
              </CardTitle>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtBRL(v * 100)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="parceiros" name="Parceiros" stackId="a" fill="#10b981" />
                    <Bar dataKey="comissao" name="Plataforma" stackId="a" fill={accentColor} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Gráfico 3: Distribuição por Forma de Pagamento */}
            <Card className="p-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                Distribuição por Forma de Pagamento (R$)
              </CardTitle>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={metrics.payMethodChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {metrics.payMethodChart.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtBRL(v * 100)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Gráfico 4: Distribuição por Cidade */}
            <Card className="p-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                Distribuição de Volume por Cidade (Top Cidades)
              </CardTitle>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.cityChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: number) => fmtBRL(v * 100)} />
                    <Bar dataKey="value" name="Faturamento (R$)" fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── ABA 3: RANKINGS DE PERFORMANCE ── */}
        <TabsContent value="rankings" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Top Faturamento */}
            <Card className="p-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" /> Profissionais que Mais Faturaram
              </CardTitle>
              <div className="space-y-2.5">
                {rankings.topEarners.map((item, idx) => (
                  <div key={item.profId} className="flex items-center justify-between text-xs border-b pb-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-5 h-5 flex items-center justify-center p-0 font-bold">
                        {idx + 1}
                      </Badge>
                      <span className="font-semibold truncate max-w-[140px]">{item.name}</span>
                    </div>
                    <span className="font-black text-emerald-600">{fmtBRL(item.gross)}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top Quantidade de Corridas */}
            <Card className="p-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" /> Maior Quantidade de Operações
              </CardTitle>
              <div className="space-y-2.5">
                {rankings.topRides.map((item, idx) => (
                  <div key={item.profId} className="flex items-center justify-between text-xs border-b pb-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-5 h-5 flex items-center justify-center p-0 font-bold">
                        {idx + 1}
                      </Badge>
                      <span className="font-semibold truncate max-w-[140px]">{item.name}</span>
                    </div>
                    <span className="font-black">{item.count} corridas</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top Comissão Gerada */}
            <Card className="p-4">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" style={{ color: accentColor }} /> Maior Comissão Gerada à Plataforma
              </CardTitle>
              <div className="space-y-2.5">
                {rankings.topCommission.map((item, idx) => (
                  <div key={item.profId} className="flex items-center justify-between text-xs border-b pb-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-5 h-5 flex items-center justify-center p-0 font-bold">
                        {idx + 1}
                      </Badge>
                      <span className="font-semibold truncate max-w-[140px]">{item.name}</span>
                    </div>
                    <span className="font-black" style={{ color: accentColor }}>
                      {fmtBRL(item.fee)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── ABA 4: RELATÓRIO OPERACIONAL COMPLETO ── */}
        <TabsContent value="report" className="w-full">
          <Card className="w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Relatório Analítico Operação por Operação ({title})</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Mostrando {filteredOperations.length} registros
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Hora</TableHead>
                      <TableHead className="text-xs">ID Operação</TableHead>
                      <TableHead className="text-xs">Cliente</TableHead>
                      <TableHead className="text-xs">Profissional</TableHead>
                      <TableHead className="text-xs">Cidade</TableHead>
                      <TableHead className="text-xs">Dist.</TableHead>
                      <TableHead className="text-xs text-right">Valor Total</TableHead>
                      <TableHead className="text-xs text-right">Ganho Prof.</TableHead>
                      <TableHead className="text-xs text-right">Comissão</TableHead>
                      <TableHead className="text-xs text-right">%</TableHead>
                      <TableHead className="text-xs">Pgto</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOperations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="py-8 text-center text-xs text-muted-foreground">
                          Nenhuma operação encontrada para os filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOperations.slice(0, 150).map((op) => (
                        <TableRow key={op.id} className="hover:bg-muted/20">
                          <TableCell className="text-xs whitespace-nowrap">{op.dateFormatted}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{op.timeFormatted}</TableCell>
                          <TableCell className="text-[11px] font-mono text-muted-foreground">
                            {op.id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-xs font-semibold max-w-[120px] truncate">
                            {op.clientName}
                          </TableCell>
                          <TableCell className="text-xs font-medium max-w-[130px] truncate">
                            {op.profName}
                          </TableCell>
                          <TableCell className="text-xs">{op.city}/{op.state}</TableCell>
                          <TableCell className="text-xs">{fmtNumber(op.distanceKm)} km</TableCell>
                          <TableCell className="text-xs text-right font-bold">
                            {fmtBRL(op.grossCents)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-emerald-600">
                            {fmtBRL(op.profCents)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold" style={{ color: accentColor }}>
                            {fmtBRL(op.feeCents)}
                          </TableCell>
                          <TableCell className="text-xs text-right">{op.pct.toFixed(1)}%</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{op.payMethod}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "text-[10px]",
                                op.status === "released"
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                  : op.status === "held"
                                  ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-100"
                              )}
                            >
                              {op.status === "released" ? "Pago" : op.status === "held" ? "Escrow" : op.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
