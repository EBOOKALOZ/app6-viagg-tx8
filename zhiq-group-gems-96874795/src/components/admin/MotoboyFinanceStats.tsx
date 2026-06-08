import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bike, Wallet, TrendingUp, TrendingDown, Clock,
  CheckCircle2, MapPin, DollarSign,
} from "lucide-react";

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
}

export function MotoboyFinanceStats() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-motoboy-finances"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase.rpc as any)("admin_list_motoboy_finances");
      if (error) {
        console.error("[MotoboyFinanceStats] erro RPC:", error);
        throw error;
      }
      const list: MotoboyFinance[] = (rows || []) as any[];

      const totalAvailable = list.reduce((s, r) => s + Number(r.available_balance || 0), 0);
      const totalReserved = list.reduce((s, r) => s + Number(r.reserved_balance || 0), 0);
      const totalReceived = list.reduce((s, r) => s + Number(r.total_received || 0), 0);
      const totalWithdrawn = list.reduce((s, r) => s + Number(r.total_withdrawn || 0), 0);
      const pendingWithdraw = list.reduce((s, r) => s + Number(r.pending_withdraw || 0), 0);

      return { list, totalAvailable, totalReserved, totalReceived, totalWithdrawn, pendingWithdraw };
    },
    staleTime: 9_000,
    refetchInterval: 9_000,
  });

  const formatBRL = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

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
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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
      </div>

      {/* Tabela por motoboy */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-gray-900">
            <Bike className="h-5 w-5 text-primary" />
            Detalhamento por Motoboy
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : data && data.list.length > 0 ? (
            <div className="space-y-3">
              {data.list.map((m, idx) => (
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

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <div className="text-center p-2 rounded-md bg-emerald-50">
                          <p className="text-[10px] text-emerald-700 uppercase font-bold">Saldo</p>
                          <p className="font-bold tabular-nums text-emerald-700">
                            {formatBRL(m.available_balance)}
                          </p>
                        </div>
                        <div className="text-center p-2 rounded-md bg-muted/30">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold flex items-center justify-center gap-1">
                            <TrendingUp className="h-2.5 w-2.5" />
                            Recebido
                          </p>
                          <p className="font-bold tabular-nums text-gray-900">
                            {formatBRL(m.total_received)}
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
