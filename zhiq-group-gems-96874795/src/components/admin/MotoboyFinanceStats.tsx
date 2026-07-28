import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bike, Wallet, TrendingUp, TrendingDown, Clock,
  CheckCircle2, MapPin, DollarSign, Percent, Users2,
} from "lucide-react";
import { calculateCommissionRate } from "@/lib/api";
import { cn } from "@/lib/utils";

const COMMISSION_TIERS = [25, 20, 16, 12, 9, 6] as const;

interface MotoboyFinance {
  user_id: string;
  full_name: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  available_balance: number;
  reserved_balance: number;
  pending_balance: number;
  total_received: number;
  total_withdrawn: number;
  pending_withdraw: number;
  payout_requests_count: number;
  last_movement_at: string | null;
  groups_count: number;
}

export function MotoboyFinanceStats() {
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-motoboy-finances"],
    queryFn: async () => {
      // @ts-expect-error RPC admin_list_motoboy_finances ausente nos tipos
      const { data: rows, error } = await supabase.rpc("admin_list_motoboy_finances");
      if (error) {
        console.error("[MotoboyFinanceStats] erro RPC:", error);
        throw error;
      }

      const { data: groupRows, error: groupsError } = await supabase
        .from("motoboy_whatsapp_groups")
        .select("user_id")
        .eq("status", "ativo");
      if (groupsError) console.error("[MotoboyFinanceStats] erro grupos:", groupsError);

      const groupsCountByUser = new Map<string, number>();
      (groupRows || []).forEach((g: Record<string, unknown>) => {
        groupsCountByUser.set(g.user_id, (groupsCountByUser.get(g.user_id) || 0) + 1);
      });

      // Todo motoboy cadastrado deve aparecer aqui, mesmo sem nenhuma
      // movimentação financeira ainda (RPC só lista quem já tem carteira) e
      // mesmo sem motoboy_profiles preenchido — a fonte da verdade de "é
      // motoboy" é o profiles.available_profiles, não motoboy_profiles.
      const { data: profileRows, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, name, cidade, estado")
        .contains("available_profiles", ["motoboy"]);
      if (profilesErr) console.error("[MotoboyFinanceStats] erro profiles:", profilesErr);

      const motoboyUserIds = (profileRows || []).map((p: Record<string, unknown>) => p.id);
      const operationalMap = new Map<string, Record<string, unknown>>();
      if (motoboyUserIds.length > 0) {
        const { data: opRows } = await supabase
          .from("motoboy_profiles")
          .select("user_id, cidade, estado")
          .in("user_id", motoboyUserIds);
        (opRows || []).forEach((m: Record<string, unknown>) => operationalMap.set(m.user_id as string, m));
      }

      const financeByUser = new Map<string, Record<string, unknown>>();
      (rows || []).forEach((r: Record<string, unknown>) => financeByUser.set(r.user_id as string, r));

      const allUserIds = new Set<string>();
      (profileRows || []).forEach((p: Record<string, unknown>) => allUserIds.add(p.id as string));
      (rows || []).forEach((r: Record<string, unknown>) => allUserIds.add(r.user_id as string));

      const profileMap = new Map<string, Record<string, unknown>>();
      (profileRows || []).forEach((p: Record<string, unknown>) => profileMap.set(p.id as string, p));

      const list: MotoboyFinance[] = Array.from(allUserIds).map((id) => {
        const p = profileMap.get(id);
        const fin = financeByUser.get(id);
        const op = operationalMap.get(id);
        return {
          user_id: id,
          full_name: fin?.full_name ?? p?.name ?? null,
          email: fin?.email ?? null,
          cidade: fin?.cidade ?? op?.cidade ?? p?.cidade ?? null,
          estado: fin?.estado ?? op?.estado ?? p?.estado ?? null,
          available_balance: Number(fin?.available_balance || 0),
          reserved_balance: Number(fin?.reserved_balance || 0),
          pending_balance: Number(fin?.pending_balance || 0),
          total_received: Number(fin?.total_received || 0),
          total_withdrawn: Number(fin?.total_withdrawn || 0),
          pending_withdraw: Number(fin?.pending_withdraw || 0),
          payout_requests_count: Number(fin?.payout_requests_count || 0),
          last_movement_at: fin?.last_movement_at ?? null,
          groups_count: groupsCountByUser.get(id) || 0,
        };
      });

      const totalAvailable = list.reduce((s, r) => s + Number(r.available_balance || 0), 0);
      const totalReserved = list.reduce((s, r) => s + Number(r.reserved_balance || 0), 0);
      const totalReceived = list.reduce((s, r) => s + Number(r.total_received || 0), 0);
      const totalWithdrawn = list.reduce((s, r) => s + Number(r.total_withdrawn || 0), 0);
      const pendingWithdraw = list.reduce((s, r) => s + Number(r.pending_withdraw || 0), 0);
      const totalGroups = groupRows?.length || 0;
      const motoboysComGrupo = list.filter((r) => r.groups_count > 0).length;
      const pctEmCarteira = totalReceived > 0 ? (totalAvailable / totalReceived) * 100 : 0;
      const pctComGrupo = list.length > 0 ? (motoboysComGrupo / list.length) * 100 : 0;

      const tierCounts = new Map<number, number>(COMMISSION_TIERS.map((t) => [t, 0]));
      const tierReceived = new Map<number, number>(COMMISSION_TIERS.map((t) => [t, 0]));
      const tierRevenue = new Map<number, number>(COMMISSION_TIERS.map((t) => [t, 0]));

      let platformRevenue = 0;
      list.forEach((r) => {
        const tier = calculateCommissionRate(r.groups_count);
        tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1);

        const received = Number(r.total_received || 0);
        const revenue = received * (tier / 100);

        tierReceived.set(tier, (tierReceived.get(tier) || 0) + received);
        tierRevenue.set(tier, (tierRevenue.get(tier) || 0) + revenue);

        platformRevenue += revenue;
      });

      return {
        list, totalAvailable, totalReserved, totalReceived, totalWithdrawn, pendingWithdraw,
        totalGroups, pctEmCarteira, pctComGrupo, tierCounts, platformRevenue,
        tierReceived, tierRevenue,
      };
    },
    staleTime: 9_000,
    refetchInterval: 9_000,
  });

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const formatPct = (v: number) => `${v.toFixed(1)}%`;

  const formatDate = (iso: string | null) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bike className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold tracking-tight text-gray-900">
          Finanças dos Motoboys — Entrada, Saldo e Saques
        </h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Resumo do que cada motoboy recebeu por entregas, o saldo atual em carteira e o quanto já sacou.
      </p>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
        <Card className="shadow-md border-emerald-500/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-emerald-500" />
              Saldo Total (R$)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatBRL(data?.totalAvailable ?? 0)}
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              em carteira de {data?.list?.length ?? 0} motoboy(s)
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              Total Recebido
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatBRL(data?.totalReceived ?? 0)}
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              ganhos históricos (entregas)
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-rose-500" />
              Total Sacado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatBRL(data?.totalWithdrawn ?? 0)}
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              saques confirmados
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-amber-500/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" />
              Saques Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatBRL(data?.pendingWithdraw ?? 0)}
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              aguardando processamento
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              Reservado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatBRL(data?.totalReserved ?? 0)}
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              em entregas em andamento
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-sky-500/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Percent className="h-3 w-3 text-sky-500" />
              % em Carteira
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {formatPct(data?.pctEmCarteira ?? 0)}
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              do recebido ainda não sacado
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-md border-violet-500/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
              <Users2 className="h-3 w-3 text-violet-500" />
              Grupos WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-24" /> : (
              <span className="text-2xl font-black text-gray-900 tabular-nums">
                {data?.totalGroups ?? 0}
              </span>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatPct(data?.pctComGrupo ?? 0)} dos motoboys têm grupo
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Faixas de comissão por grupos ativos */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-3 gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Motoboys por Faixa de Comissão</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Total de <strong>{data?.list?.length ?? 0} motoboys</strong> cadastrados • Receita da plataforma: <strong>{formatBRL(data?.platformRevenue ?? 0)}</strong>
            </p>
          </div>
          {selectedTier !== null && (
            <button
              type="button"
              onClick={() => setSelectedTier(null)}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Limpar filtro ({selectedTier}%)
            </button>
          )}
        </div>
        <div className="grid gap-3 grid-cols-3 md:grid-cols-6">
          {COMMISSION_TIERS.map((tier) => {
            const isActive = selectedTier === tier;
            return (
              <Card
                key={tier}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTier((prev) => (prev === tier ? null : tier))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedTier((prev) => (prev === tier ? null : tier));
                }}
                className={cn(
                  "shadow-md text-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5",
                  isActive && "ring-2 ring-primary border-primary",
                  !isActive && tier === 6 && "border-emerald-500/30",
                  !isActive && tier === 25 && "border-zinc-300"
                )}
              >
                <CardHeader className="pb-1">
                  <CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    {tier}%
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-2">
                  {isLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : (
                    <div className="flex flex-col items-center">
                      <span className="text-2xl font-black text-gray-900 tabular-nums leading-none mt-1">
                        {data?.tierCounts?.get(tier) ?? 0}
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1 mb-2">
                        {isActive ? "filtrando…" : "motoboy(s)"}
                      </p>

                      <div className="w-full bg-muted/40 rounded px-2 py-1.5 flex flex-col gap-1 border border-border/40">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold" title="Total que os motoboys desta faixa receberam">Bruto</span>
                          <span className="text-[10px] font-bold text-gray-900">{formatBRL(data?.tierReceived?.get(tier) ?? 0)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-primary/80 uppercase font-bold" title="Receita da plataforma (taxa)">Plataforma</span>
                          <span className="text-[10px] font-bold text-primary">{formatBRL(data?.tierRevenue?.get(tier) ?? 0)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Tabela por motoboy */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-gray-900">
            <Bike className="h-5 w-5 text-primary" />
            Detalhamento por Motoboy
            {selectedTier !== null && (
              <Badge variant="outline" className="ml-1 font-bold">
                Faixa {selectedTier}%
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : data && data.list.length > 0 ? (
            (() => {
              const filteredList = selectedTier === null
                ? data.list
                : data.list.filter((m) => calculateCommissionRate(m.groups_count) === selectedTier);

              if (filteredList.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum motoboy na faixa de {selectedTier}%.
                  </p>
                );
              }

              return (
            <div className="space-y-3">
              {filteredList.map((m, idx) => (
                <div
                  key={m.user_id}
                  className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg font-black text-gray-900 w-7 text-right tabular-nums shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Bike className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-bold text-gray-900 truncate">
                          {m.full_name || "Motoboy sem nome"}
                        </span>
                        {idx === 0 && m.available_balance > 0 && (
                          <Badge className="bg-amber-500 text-white border-0 text-[10px] font-bold">
                            Maior saldo
                          </Badge>
                        )}
                        {m.available_balance === 0 && (
                          <Badge variant="destructive" className="text-[10px] font-bold">
                            Sem saldo
                          </Badge>
                        )}
                        {m.pending_withdraw > 0 && (
                          <Badge className="bg-amber-500 text-white border-0 text-[10px] font-bold">
                            <Clock className="h-2.5 w-2.5 mr-1" />
                            Saque pendente
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {m.email && <span className="text-primary/70">{m.email}</span>}
                        {(m.cidade || m.estado) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {m.cidade}{m.estado ? ` - ${m.estado}` : ""}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                        <div className="text-center p-2 rounded-md bg-emerald-50">
                          <p className="text-[10px] text-emerald-700 uppercase font-bold">Saldo</p>
                          <p className="font-bold tabular-nums text-emerald-700">
                            {formatBRL(m.available_balance)}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-muted/30">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center justify-center gap-1" title="Ganhos brutos do motoboy">
                            <TrendingUp className="h-2.5 w-2.5" />
                            Recebido
                          </p>
                          <p className="font-bold tabular-nums text-gray-900">
                            {formatBRL(m.total_received)}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-primary/5">
                          <p className="text-[10px] text-primary/80 uppercase font-bold flex items-center justify-center gap-1" title="Sua comissão / receita da plataforma">
                            <DollarSign className="h-2.5 w-2.5" />
                            Plataforma ({calculateCommissionRate(m.groups_count)}%)
                          </p>
                          <p className="font-bold tabular-nums text-primary">
                            {formatBRL(m.total_received * (calculateCommissionRate(m.groups_count) / 100))}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-rose-50">
                          <p className="text-[10px] text-rose-700 uppercase font-bold flex items-center justify-center gap-1">
                            <TrendingDown className="h-2.5 w-2.5" />
                            Sacado
                          </p>
                          <p className="font-bold tabular-nums text-rose-700">
                            {formatBRL(m.total_withdrawn)}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-amber-50">
                          <p className="text-[10px] text-amber-700 uppercase font-bold flex items-center justify-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            Pend. Saque
                          </p>
                          <p className="font-bold tabular-nums text-amber-700">
                            {formatBRL(m.pending_withdraw)}
                          </p>
                          {m.payout_requests_count > 0 && (
                            <p className="text-[9px] text-amber-600/80">
                              {m.payout_requests_count} solicitação(ões)
                            </p>
                          )}
                        </div>
                        <div className="text-center p-2 rounded-md bg-sky-50">
                          <p className="text-[10px] text-sky-700 uppercase font-bold flex items-center justify-center gap-1">
                            <Percent className="h-2.5 w-2.5" />
                            Em Carteira
                          </p>
                          <p className="font-bold tabular-nums text-sky-700">
                            {formatPct(m.total_received > 0 ? (m.available_balance / m.total_received) * 100 : 0)}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-violet-50">
                          <p className="text-[10px] text-violet-700 uppercase font-bold flex items-center justify-center gap-1">
                            <Users2 className="h-2.5 w-2.5" />
                            Grupos
                          </p>
                          <p className="font-bold tabular-nums text-violet-700">
                            {m.groups_count}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-muted/30">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Última movim.
                          </p>
                          <p className="font-bold tabular-nums text-gray-900 text-sm">
                            {formatDate(m.last_movement_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
              );
            })()
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum motoboy com carteira ainda.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
