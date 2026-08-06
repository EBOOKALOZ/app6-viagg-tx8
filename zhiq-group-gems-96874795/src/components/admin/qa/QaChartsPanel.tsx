/**
 * ORION-QA Fase 2 — gráficos (linha, área, barras, pizza) com recharts.
 * Paleta categórica validada (dataviz): azul #2a78d6, laranja #eb6834,
 * verde-água #1baf7a, amarelo #eda100 — ordem fixa por entidade, nunca por
 * ranking. Severidade usa a paleta semântica (mesma dos badges do painel).
 */
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dailySeries, type QaStatRow } from "@/services/qa/metrics";
import {
  QA_ENVIRONMENTS, QA_ENVIRONMENT_LABELS, QA_SEVERITIES, QA_SEVERITY_LABELS,
  qaLabel,
} from "@/services/qa/types";

/** Slots categóricos em ordem fixa (validados p/ modo claro). */
const SERIES = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a", yellow: "#eda100" } as const;

/** Ambiente → slot fixo por entidade (nunca reatribuído por contagem). */
const ENVIRONMENT_COLORS: Record<string, string> = {
  local: SERIES.blue,
  vm_testes: SERIES.orange,
  homologacao: SERIES.aqua,
  producao: SERIES.yellow,
};

/** Severidade → paleta semântica (idêntica aos badges da listagem). */
const SEVERITY_CHART_COLORS: Record<string, string> = {
  critico: "#e34948",
  alto: "#eb6834",
  medio: "#eda100",
  baixo: "#2a78d6",
  melhoria: "#1baf7a",
};

const GRID_STROKE = "hsl(var(--border))";
const TICK_STYLE = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

interface QaChartsPanelProps {
  rows: QaStatRow[];
}

export function QaChartsPanel({ rows }: QaChartsPanelProps) {
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);

  const series = useMemo(() => dailySeries(rows, rangeDays), [rows, rangeDays]);

  const backlogSeries = useMemo(() => {
    let acc = 0;
    return series.map((p) => {
      acc += p.criados - p.fechados;
      return { date: p.date, backlog: Math.max(0, acc) };
    });
  }, [series]);

  const byModule = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.module, (counts.get(r.module) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 8).map(([name, total]) => ({ name, total }));
    const rest = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push({ name: "outros", total: rest });
    return top;
  }, [rows]);

  const byOrigin = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.origin, (counts.get(r.origin) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, total]) => ({ name: qaLabel.origin(key), total }));
  }, [rows]);

  const bySeverity = useMemo(
    () =>
      QA_SEVERITIES
        .map((s) => ({ key: s, name: QA_SEVERITY_LABELS[s], total: rows.filter((r) => r.severity === s).length }))
        .filter((d) => d.total > 0),
    [rows],
  );

  const byEnvironment = useMemo(
    () =>
      QA_ENVIRONMENTS
        .map((e) => ({ key: e, name: QA_ENVIRONMENT_LABELS[e], value: rows.filter((r) => r.environment === e).length }))
        .filter((d) => d.value > 0),
    [rows],
  );

  const dateTick = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Tabs value={String(rangeDays)} onValueChange={(v) => setRangeDays(v === "30" ? 30 : 7)}>
          <TabsList className="h-8">
            <TabsTrigger value="7" className="text-xs">Últimos 7 dias</TabsTrigger>
            <TabsTrigger value="30" className="text-xs">Últimos 30 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Linha: criados × fechados */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Criados × Fechados</CardTitle>
            <CardDescription className="text-xs">Fluxo diário de problemas.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dateTick} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={(d) => dateTick(String(d))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="criados" name="Criados" stroke={SERIES.blue} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="fechados" name="Fechados" stroke={SERIES.orange} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Área: backlog acumulado */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Backlog acumulado</CardTitle>
            <CardDescription className="text-xs">Saldo criados − fechados no período.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={backlogSeries} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="qaBacklogFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES.blue} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={SERIES.blue} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dateTick} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={(d) => dateTick(String(d))} />
                <Area type="monotone" dataKey="backlog" name="Backlog" stroke={SERIES.blue} strokeWidth={2} fill="url(#qaBacklogFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Barras: por módulo (1 matiz — magnitude) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Problemas por módulo</CardTitle>
            <CardDescription className="text-xs">Top 8 + demais agrupados.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byModule} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="name" tick={TICK_STYLE} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={44} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" name="Problemas" fill={SERIES.blue} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Barras: severidade (paleta semântica, rótulos visíveis no eixo) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por severidade</CardTitle>
            <CardDescription className="text-xs">Mesma paleta semântica dos badges.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySeverity} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="name" tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" name="Problemas" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {bySeverity.map((d) => (
                    <Cell key={d.key} fill={SEVERITY_CHART_COLORS[d.key] ?? SERIES.blue} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pizza: ambiente (identidade, ≤4 fatias, rótulos diretos + legenda) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por ambiente</CardTitle>
            <CardDescription className="text-xs">Distribuição entre ambientes.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byEnvironment}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={44}
                  outerRadius={72}
                  paddingAngle={2}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  labelLine={false}
                  style={{ fontSize: 10 }}
                >
                  {byEnvironment.map((d) => (
                    <Cell key={d.key} fill={ENVIRONMENT_COLORS[d.key] ?? SERIES.blue} stroke="hsl(var(--card))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Barras horizontais: origem (1 matiz — magnitude) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por origem</CardTitle>
            <CardDescription className="text-xs">De onde os problemas chegam.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byOrigin} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={92} tick={TICK_STYLE} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="total" name="Problemas" fill={SERIES.blue} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
