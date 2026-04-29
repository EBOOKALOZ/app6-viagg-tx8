import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bike, Store, Car, Truck, Zap, Flag, Users, BarChart3, TrendingUp, MapPin,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";

/* ─── profile config ─── */
const PROFILES = [
  { key: "motoboy", label: "Motoboys", icon: Bike, color: "hsl(25, 95%, 53%)" },
  { key: "merchant", label: "Lojistas", icon: Store, color: "hsl(270, 70%, 60%)" },
  { key: "passenger", label: "Passageiros", icon: Car, color: "hsl(210, 80%, 55%)" },
  { key: "driver", label: "Motoristas", icon: Truck, color: "hsl(145, 60%, 45%)" },
  { key: "mototaxi", label: "Moto-Táxi", icon: Zap, color: "hsl(185, 70%, 50%)" },
  { key: "freteiro", label: "Fretes", icon: Flag, color: "hsl(45, 90%, 50%)" },
] as const;

/* ─── data hook (uses backend RPC as single source of truth) ─── */
function useMultiProfileData() {
  return useQuery({
    queryKey: ["admin-multi-perfil-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_admin_dashboard_geral")
        .select("*")
        .single();

      if (error) throw error;

      const counts: Record<string, number> = {
        motoboy: data.total_motoboys || 0,
        merchant: data.total_lojistas || 0,
        passenger: data.total_passageiros || 0,
        driver: data.total_motoristas || 0,
        mototaxi: data.total_moto_taxi || 0,
        freteiro: data.total_fretes || 0,
      };

      // Since the generic dashboard view doesn't contain city data directly
      // we'll return an empty array or fetch it separately if needed later.
      const citySummary: any[] = [];

      return {
        counts,
        total: data.total_perfis_ativos || 0,
        citySummary,
        totalUsers: data.total_perfis_ativos || 0
      };
    },
    // Realtime/refresh rule: refetch every minute
    staleTime: 60_000,
  });
}

/* ─── component ─── */
export default function AdminDashboardMultiPerfil() {
  const navigate = useNavigate();
  const { data, isLoading } = useMultiProfileData();

  const CLICKABLE: Record<string, string> = {
    motoboy: "/admin/perfis/motoboys",
    merchant: "/admin/perfis/lojistas",
    passenger: "/admin/perfis/passageiros",
    driver: "/admin/perfis/motoristas",
    mototaxi: "/admin/perfis/mototaxi",
    freteiro: "/admin/perfis/fretes",
  };

  const pieData = useMemo(() => {
    if (!data) return [];
    return PROFILES.map((p) => ({
      name: p.label,
      value: data.counts[p.key] || 0,
      fill: p.color,
    })).filter((d) => d.value > 0);
  }, [data]);

  const barData = useMemo(() => {
    if (!data) return [];
    return PROFILES.map((p) => ({
      name: p.label,
      total: data.counts[p.key] || 0,
      fill: p.color,
    }));
  }, [data]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ─── HEADER ─── */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          Dashboard Geral
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visão consolidada da operação por perfil — Centro de Comando Nacional
        </p>
      </div>

      {/* ─── KPI CARDS ─── */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Total */}
        <Card
          className="shadow-lg border-primary/30 col-span-2 md:col-span-1 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all"
          onClick={() => navigate("/admin/perfis/dashboard")}
        >
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Total de Perfis Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-12 w-24" /> : (
              <div className="flex items-end gap-2">
                <span className="text-5xl font-black text-primary tabular-nums">{data?.total ?? 0}</span>
                <Users className="h-6 w-6 text-muted-foreground mb-1" />
              </div>
            )}
            {!isLoading && (
              <p className="text-xs text-muted-foreground mt-1">
                {data?.totalUsers ?? 0} usuários únicos
              </p>
            )}
          </CardContent>
        </Card>

        {PROFILES.map((p) => {
          const Icon = p.icon;
          const count = data?.counts[p.key] ?? 0;
          const link = CLICKABLE[p.key];
          return (
            <Card
              key={p.key}
              className={`shadow-md transition-all ${link ? "cursor-pointer hover:shadow-xl hover:-translate-y-0.5" : ""}`}
              onClick={link ? () => navigate(link) : undefined}
            >
              <CardHeader className="pb-1">
                <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" style={{ color: p.color }} />
                  {p.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-10 w-16" /> : (
                  <span className="text-4xl font-black tabular-nums" style={{ color: p.color }}>
                    {count}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── CHARTS ROW ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar Chart */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" />
              Comparativo por Perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} barSize={36} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-primary" />
              Distribuição por Perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    strokeWidth={2}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                      fontSize: 13,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── TERRITORIAL + TABLE ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Distribution by city */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5 text-primary" />
              Distribuição Territorial
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : data?.citySummary && data.citySummary.length > 0 ? (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {data.citySummary.map((c, idx) => (
                  <div key={c.city} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-6 text-right font-bold tabular-nums">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium truncate">{c.city}</span>
                        <Badge variant="outline" className="shrink-0 ml-2">{c.total}</Badge>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min((c.total / (data.total || 1)) * 100 * 4, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado disponível</p>
            )}
          </CardContent>
        </Card>

        {/* Summary Table */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-primary" />
              Resumo por Perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Perfil</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ativos</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">%</th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROFILES.map((p) => {
                      const count = data?.counts[p.key] ?? 0;
                      const pct = data?.total ? ((count / data.total) * 100).toFixed(1) : "0";
                      const Icon = p.icon;
                      return (
                        <tr key={p.key} className="border-t hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" style={{ color: p.color }} />
                              <span className="font-medium">{p.label}</span>
                            </div>
                          </td>
                          <td className="text-right px-4 py-3 font-bold tabular-nums" style={{ color: p.color }}>{count}</td>
                          <td className="text-right px-4 py-3 text-muted-foreground tabular-nums">{pct}%</td>
                          <td className="text-center px-4 py-3">
                            <Badge
                              variant={count > 0 ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {count > 0 ? "Ativo" : "Vazio"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
