/**
 * /convenio-admin — Dashboard executivo do Super Painel do Gestor.
 * Comando Convênio Fase 1: cards + evolução mensal + indicadores, dados reais
 * de convenio_dashboard_stats (view) e agregação de convenio_donations/campaigns.
 */
import {
  LayoutDashboard, HandCoins, Landmark, Handshake, BadgeCheck,
  Building2, Megaphone, ShieldAlert,
} from "lucide-react";
import type { TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorStatCard } from "@/components/convenio/GestorStatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvenioDashboardStats, useConvenioMonthlyEvolution } from "@/hooks/convenio/useConvenioDashboard";

const CHART_COLORS = { arrecadado: "#3987e5", destinado: "#199e70" };

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CustomTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-bold text-white/70">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: {formatCurrency(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

export default function GestorDashboardPage() {
  const statsQuery = useConvenioDashboardStats();
  const evolutionQuery = useConvenioMonthlyEvolution();
  const stats = statsQuery.data;

  const indicators = stats
    ? [
        { label: "Convênios Encerrados", value: String(stats.convenios_encerrados ?? 0) },
        { label: "Convênios Suspensos", value: String(stats.convenios_suspensos ?? 0) },
        { label: "Prestações Pendentes", value: String(stats.prestacoes_pendentes ?? 0) },
        { label: "Prestações Concluídas", value: String(stats.prestacoes_concluidas ?? 0) },
        { label: "Meta das Campanhas Ativas", value: formatCurrency(Number(stats.total_meta_ativas ?? 0)) },
      ]
    : [];

  return (
    <div>
      <GestorPageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Visão executiva do módulo Doações & Convênios"
      />

      {statsQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <ShieldAlert className="h-4 w-4 flex-shrink-0" />
          Não foi possível carregar os indicadores. Tente novamente em instantes.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsQuery.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : (
          <>
            <GestorStatCard icon={HandCoins} label="Total Arrecadado" value={formatCurrency(Number(stats?.total_arrecadado ?? 0))} accent="emerald" />
            <GestorStatCard icon={Landmark} label="Total Destinado" value={formatCurrency(Number(stats?.total_destinado ?? 0))} accent="cyan" />
            <GestorStatCard icon={Handshake} label="Convênios Ativos" value={String(stats?.convenios_ativos ?? 0)} accent="violet" />
            <GestorStatCard icon={BadgeCheck} label="Convênios (Total)" value={String(stats?.convenios_total ?? 0)} accent="amber" />
            <GestorStatCard icon={Building2} label="Instituições Cadastradas" value={String(stats?.instituicoes_total ?? 0)} accent="cyan" />
            <GestorStatCard icon={Megaphone} label="Campanhas Ativas" value={String(stats?.campanhas_ativas ?? 0)} accent="emerald" />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-black text-white">Evolução Mensal</h2>
          <div className="h-72 w-full">
            {evolutionQuery.isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionQuery.data ?? []} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#2c2c2a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" stroke="#898781" fontSize={12} tickLine={false} axisLine={{ stroke: "#383835" }} />
                  <YAxis stroke="#898781" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#c3c2b7" }} />
                  <Line type="monotone" dataKey="arrecadado" name="Arrecadado" stroke={CHART_COLORS.arrecadado} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="destinado" name="Destinado" stroke={CHART_COLORS.destinado} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="mb-4 text-sm font-black text-white">Indicadores</h2>
          <div className="space-y-3">
            {statsQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
            ) : (
              indicators.map((ind) => (
                <div key={ind.label} className="flex items-center justify-between border-b border-white/5 pb-2 text-xs last:border-0">
                  <span className="text-white/50">{ind.label}</span>
                  <span className="font-bold text-white">{ind.value}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
