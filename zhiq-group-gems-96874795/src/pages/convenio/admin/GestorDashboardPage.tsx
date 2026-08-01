/**
 * /convenio-admin — Dashboard executivo do Super Painel do Gestor.
 * Comando Convênio Fase 1: cards + evolução mensal + indicadores.
 * Dados simulados (permitido nesta fase).
 */
import {
  LayoutDashboard, HandCoins, Landmark, Handshake, BadgeCheck,
  Building2, Megaphone, Users,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { GestorPageHeader } from "@/components/convenio/GestorPageHeader";
import { GestorStatCard } from "@/components/convenio/GestorStatCard";
import { GestorPlaceholderNotice } from "@/components/convenio/GestorPlaceholderNotice";
import {
  SIMULATED_DASHBOARD_STATS, SIMULATED_MONTHLY_EVOLUTION, SIMULATED_INDICATORS,
} from "@/lib/convenio/simulatedData";

const CHART_COLORS = { arrecadado: "#3987e5", destinado: "#199e70" };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-bold text-white/70">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: R$ {Number(p.value).toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
}

export default function GestorDashboardPage() {
  return (
    <div>
      <GestorPageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Visão executiva do módulo Doações & Convênios"
      />
      <GestorPlaceholderNotice />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <GestorStatCard icon={HandCoins} label="Total Arrecadado" value={SIMULATED_DASHBOARD_STATS.totalArrecadado} accent="emerald" />
        <GestorStatCard icon={Landmark} label="Total Destinado" value={SIMULATED_DASHBOARD_STATS.totalDestinado} accent="cyan" />
        <GestorStatCard icon={Handshake} label="Convênios Ativos" value={String(SIMULATED_DASHBOARD_STATS.conveniosAtivos)} accent="violet" />
        <GestorStatCard icon={BadgeCheck} label="Parceiros" value={String(SIMULATED_DASHBOARD_STATS.parceiros)} accent="amber" />
        <GestorStatCard icon={Building2} label="Instituições Cadastradas" value={String(SIMULATED_DASHBOARD_STATS.instituicoesCadastradas)} accent="cyan" />
        <GestorStatCard icon={Megaphone} label="Campanhas Ativas" value={String(SIMULATED_DASHBOARD_STATS.campanhasAtivas)} accent="emerald" />
        <GestorStatCard icon={Users} label="Pessoas Beneficiadas" value={SIMULATED_DASHBOARD_STATS.pessoasBeneficiadas} accent="violet" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-black text-white">Evolução Mensal</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={SIMULATED_MONTHLY_EVOLUTION} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#2c2c2a" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke="#898781" fontSize={12} tickLine={false} axisLine={{ stroke: "#383835" }} />
                <YAxis stroke="#898781" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#c3c2b7" }} />
                <Line type="monotone" dataKey="arrecadado" name="Arrecadado" stroke={CHART_COLORS.arrecadado} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="destinado" name="Destinado" stroke={CHART_COLORS.destinado} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="mb-4 text-sm font-black text-white">Indicadores</h2>
          <div className="space-y-3">
            {SIMULATED_INDICATORS.map((ind) => (
              <div key={ind.label} className="flex items-center justify-between border-b border-white/5 pb-2 text-xs last:border-0">
                <span className="text-white/50">{ind.label}</span>
                <span className="font-bold text-white">{ind.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
