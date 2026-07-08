// ── MinhaCarteira ────────────────────────────────────────────────────────────
// Carteira do CLIENTE/PASSAGEIRO (mini-conta via magic link — sem perfil
// profissional). Mostra saldo pay do cliente (pay_financial_accounts,
// owner_type='customer', account_type='customer_wallet') e o histórico de
// corridas que ele mesmo solicitou em service_orders (merchant_id/payer_uid
// = auth.uid(), convenção do fluxo "cliente chama profissional" — ver
// create_customer_delivery_order_v2).
//
// Recarga real ("Adicionar saldo") via TravelerWalletTopup → Mercado Pago
// (payments-charge), creditando o mesmo customer_wallet.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { TravelerWalletTopup } from "@/components/wallet/TravelerWalletTopup";
import { goToMiniLogin } from "@/lib/auth/miniReturn";
import viaggLogo from "@/assets/logo.png";
import {
  Wallet, Package, Bike, Car, Clock,
  CheckCircle2, XCircle, Loader2, Receipt, User, X, EyeOff,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface RideRow {
  id: string;
  service_type: string | null;
  total_price: number | null;
  estimated_value: number | null;
  status: string | null;
  driver_status: string | null;
  payment_status: string | null;
  destination: string | null;
  created_at: string;
}

type StatusTone = "wait" | "progress" | "done" | "cancel";
interface StatusInfo {
  label: string;
  tone: StatusTone;
}

// ── Helpers puros ─────────────────────────────────────────────────────────────

/** Deriva um driver_status a partir do `status` legado das tabelas que NÃO
 *  têm driver_status (moto_taxi_corridas etc.), para o badge funcionar igual. */
function mapStatusToDriver(status: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (["finalizada", "completed", "concluida", "concluída", "delivered"].includes(s)) return "completed";
  if (["cancelada", "cancelled", "canceled"].includes(s)) return "cancelled";
  if (["em_andamento", "in_progress"].includes(s)) return "in_progress";
  if (["aceita", "accepted", "a_caminho"].includes(s)) return "driver_on_the_way";
  return null;
}

/** Mapa PT do estado da corrida a partir de driver_status/payment_status
 *  (mesma lógica de resolução usada no AcceptedRideCard, resumida para
 *  o histórico — aqui não há "tempo real", é uma foto do estado salvo). */
function resolveRideStatus(driverStatus: string | null, paymentStatus: string | null): StatusInfo {
  if (driverStatus === "cancelled") return { label: "Cancelada", tone: "cancel" };
  if (driverStatus === "payment_timeout") return { label: "Expirada", tone: "cancel" };
  if (driverStatus === "completed") return { label: "Concluída", tone: "done" };
  if (driverStatus === "driver_on_the_way" || paymentStatus === "paid") {
    return { label: "Pago / A caminho", tone: "done" };
  }
  if (driverStatus === "in_progress") return { label: "Em andamento", tone: "progress" };
  if (driverStatus === "arrived") return { label: "Profissional chegou", tone: "progress" };
  if (driverStatus === "waiting_payment") return { label: "Aguardando pagamento", tone: "wait" };
  if (driverStatus === "accepted" || driverStatus === "waiting_accept") {
    return { label: "Profissional confirmado", tone: "wait" };
  }
  // fallback: status cru (legado) ou "Solicitada"
  return { label: driverStatus || paymentStatus || "Solicitada", tone: "wait" };
}

const TONE_STYLES: Record<StatusTone, string> = {
  wait: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  progress: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  cancel: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800",
};

/** Ícone + rótulo por tipo de serviço (delivery/mototaxi/ride/freight). */
function serviceMeta(serviceType: string | null): { icon: React.ComponentType<{ className?: string }>; label: string } {
  switch (serviceType) {
    case "mototaxi":
      return { icon: Bike, label: "Moto-táxi" };
    case "ride":
      return { icon: Car, label: "Corrida" };
    case "freight":
      return { icon: Package, label: "Frete" };
    case "delivery":
    default:
      return { icon: Package, label: "Entrega" };
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function shortDestination(destination: string | null): string {
  if (!destination) return "Destino não informado";
  const first = destination.split(",").slice(0, 2).join(", ");
  return first.length > 42 ? `${first.slice(0, 42)}…` : first;
}

// ── Card de transação (histórico) ────────────────────────────────────────────
function RideHistoryItem({ ride, index, currentBalance, onHide }: { ride: RideRow; index: number; currentBalance?: number; onHide?: (id: string) => void }) {
  const meta = serviceMeta(ride.service_type);
  const Icon = meta.icon;
  const status = resolveRideStatus(ride.driver_status, ride.payment_status);
  const value = ride.total_price ?? ride.estimated_value ?? null;

  const ToneIcon = status.tone === "wait" ? Clock
    : status.tone === "progress" ? Loader2
    : status.tone === "done" ? CheckCircle2
    : XCircle;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.4) }}
    >
      <Card className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-md transition-all hover:bg-zinc-50">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 overflow-hidden p-0.5 shadow-sm">
                <img src={viaggLogo} alt="Viagg" className="h-full w-full object-cover rounded-lg" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-zinc-900">{meta.label}</p>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 gap-1 border px-1.5 py-0 text-[10px] font-semibold", TONE_STYLES[status.tone])}
                  >
                    <ToneIcon className={cn("h-3 w-3", status.tone === "progress" && "animate-spin")} />
                    {status.label}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs font-medium text-zinc-600">{shortDestination(ride.destination)}</p>
                <p className="mt-0.5 text-[11px] font-medium text-zinc-400">{formatDate(ride.created_at)}</p>
              </div>
            </div>

            {onHide && (
              <button
                type="button"
                onClick={() => onHide(ride.id)}
                title="Esconder card da carteira"
                aria-label="Esconder card da carteira"
                className="shrink-0 flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-xs transition-all hover:bg-zinc-200 hover:border-zinc-400 hover:text-zinc-950 active:scale-95"
              >
                <EyeOff className="h-3.5 w-3.5" />
                <span>Esconder</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
            {currentBalance !== undefined ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-black text-emerald-800 shadow-xs">
                <span>💰 Recarga atual:</span>
                <span>{formatCurrencyBRL(currentBalance)}</span>
              </div>
            ) : <div />}

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                Débito de Corrida
              </span>
              <span className="text-sm font-extrabold text-red-600">- {formatCurrencyBRL(value)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Mini-stat ─────────────────────────────────────────────────────────────────
function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-3 text-center shadow-md">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 overflow-hidden p-0.5 shadow-xs">
        <img src={viaggLogo} alt="Viagg" className="h-full w-full object-cover rounded-md" />
      </div>
      <p className="text-base font-black text-zinc-900">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MinhaCarteira() {
  const navigate = useNavigate();
  const { user, initialized } = useAuth();

  const [search, setSearch] = useState("");

  const [balance, setBalance] = useState<number>(0);
  const [loadingBalance, setLoadingBalance] = useState(true);

  const [rides, setRides] = useState<RideRow[]>([]);

  // Cards escondidos pelo usuário — persistente (localStorage), NÃO deleta o
  // registro real da corrida; apenas oculta da lista da carteira.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem("viagg_wallet_hidden") || "[]")); }
    catch { return new Set<string>(); }
  });
  const hideRide = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("viagg_wallet_hidden", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const restoreHiddenRides = () => {
    setHiddenIds(new Set());
    try { localStorage.removeItem("viagg_wallet_hidden"); } catch { /* ignore */ }
    toast.success("Cards restaurados com sucesso!");
  };
  const visibleRides = rides.filter((r) => !hiddenIds.has(r.id));
  const [loadingRides, setLoadingRides] = useState(true);

  // ── 1) Saldo pay do cliente (best-effort — RLS pode não liberar) ───────────
  // Callback reutilizável: usado no load inicial e no refetch pós-recarga.
  const fetchBalance = useCallback(async () => {
    if (!user) { setLoadingBalance(false); return; }
    setLoadingBalance(true);
    const { data, error } = await (supabase as any)
      .from("pay_financial_accounts")
      .select("available_balance,current_balance")
      .eq("owner_type", "customer")
      .eq("owner_id", user.id)
      .eq("account_type", "customer_wallet")
      .maybeSingle();
    if (error) {
      console.warn("[MinhaCarteira] erro ao buscar saldo (fallback R$ 0,00):", error);
      setBalance(0);
    } else {
      const raw = data?.available_balance ?? data?.current_balance ?? 0;
      setBalance(Number(raw) || 0);
    }
    setLoadingBalance(false);
  }, [user]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // ── 2) Histórico — MESCLA os 3 destinos onde o cliente solicita corrida:
  //    service_orders (chamar profissional), moto_taxi_corridas (passageiro
  //    moto-táxi) e motorista_corridas (passageiro carro). Colunas variam por
  //    tabela → normalização defensiva. Se uma falhar (RLS/tabela), as outras
  //    ainda aparecem. ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setLoadingRides(false); return; }
    let alive = true;
    setLoadingRides(true);
    const uid = user.id;
    const sb = supabase as any;

    const norm = (row: any, defaultService: string): RideRow => {
      const rawStatus: string | null = row.status ?? null;
      return {
        id: String(row.id),
        service_type: row.service_type ?? defaultService,
        total_price: row.total_price ?? row.valor ?? row.estimated_price ?? null,
        estimated_value: row.estimated_value ?? row.estimated_price ?? row.valor ?? null,
        status: rawStatus,
        driver_status: row.driver_status ?? mapStatusToDriver(rawStatus),
        payment_status: row.payment_status ?? null,
        destination: row.destination ?? row.destination_address ?? row.destino ?? null,
        created_at: row.created_at,
      };
    };

    Promise.all([
      sb.from("service_orders").select("*")
        .or(`merchant_id.eq.${uid},payer_uid.eq.${uid}`)
        .order("created_at", { ascending: false }).limit(30),
      sb.from("moto_taxi_corridas").select("*")
        .eq("passenger_id", uid)
        .order("created_at", { ascending: false }).limit(30),
      sb.from("motorista_corridas").select("*")
        .eq("passenger_id", uid)
        .order("created_at", { ascending: false }).limit(30),
    ]).then((res: any[]) => {
      if (!alive) return;
      const [so, mt, mo] = res;
      const merged: RideRow[] = [
        ...(((so?.data ?? []) as any[]).map((r) => norm(r, "delivery"))),
        ...(((mt?.data ?? []) as any[]).map((r) => norm(r, "mototaxi"))),
        ...(((mo?.data ?? []) as any[]).map((r) => norm(r, "ride"))),
      ]
        .filter((r) => r.created_at)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 40);
      setRides(merged);
      setLoadingRides(false);
    }).catch((e: any) => {
      if (!alive) return;
      console.warn("[MinhaCarteira] erro ao buscar histórico:", e);
      setLoadingRides(false);
    });

    return () => { alive = false; };
  }, [user]);

  // ── Mini-stats derivados do histórico ───────────────────────────────────────
  const stats = useMemo(() => {
    const totalRides = rides.length;
    const completed = rides.filter((r) => r.driver_status === "completed");
    const totalSpent = completed.reduce((sum, r) => sum + Number(r.total_price ?? r.estimated_value ?? 0), 0);
    const active = rides.filter((r) =>
      r.driver_status && !["completed", "cancelled", "payment_timeout"].includes(r.driver_status),
    ).length;
    return { totalRides, totalSpent, active };
  }, [rides]);

  // ── Estado: autenticação ainda resolvendo (evita "piscar" R$ 0,00) ─────────
  if (!initialized) {
    return (
      <div className="mx-auto max-w-lg space-y-5 px-4 pt-5">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="flex gap-2.5">
          <Skeleton className="h-20 flex-1 rounded-2xl" />
          <Skeleton className="h-20 flex-1 rounded-2xl" />
          <Skeleton className="h-20 flex-1 rounded-2xl" />
        </div>
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  // ── Estado: não autenticado ──────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5E62B] px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-sm"
        >
          <Card className="rounded-2xl border-border/50 shadow-lg">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 p-1 shadow-sm">
                <img src={viaggLogo} alt="Viagg" className="h-full w-full object-cover rounded-xl" />
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">Faça login para ver sua carteira</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Entre com o link enviado ao seu e-mail para acompanhar saldo e corridas.
                </p>
              </div>
              <Button className="w-full" onClick={() => goToMiniLogin(navigate, "/minha-carteira")}>
                Fazer login
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ── Layout principal ──────────────────────────────────────────────────────
  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      onSearchSubmit={(val) => navigate(`/mercado?q=${encodeURIComponent(val)}`)}
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="💳 Minha Carteira"
    >
      <main className="mx-auto max-w-lg space-y-5 px-4 pb-10 pt-5">

        {/* Título */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[#FF6A00]" />
            <h1 className="text-lg font-black tracking-tight text-zinc-900">Minha Carteira</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/meus-dados")}
          >
            <User className="h-4 w-4" />
            Meus dados
          </Button>
        </div>

        {/* Card de saldo em destaque */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Card
            className="overflow-hidden rounded-2xl border-0 text-white shadow-xl"
            style={{ background: "linear-gradient(135deg, #FF6A00, #FF4500)" }}
          >
            <CardContent className="relative space-y-4 p-6">
              <div className="absolute -right-6 -top-6 opacity-10">
                <Wallet className="h-28 w-28" />
              </div>
              <div className="relative flex items-center gap-2 opacity-90">
                <Wallet className="h-4 w-4" />
                <span className="text-sm font-medium">Saldo disponível</span>
              </div>

              {loadingBalance ? (
                <Skeleton className="h-10 w-40 bg-white/20" />
              ) : (
                <p className="relative text-4xl font-extrabold tracking-tight">
                  {formatCurrencyBRL(balance)}
                </p>
              )}

              <TravelerWalletTopup
                onSuccess={fetchBalance}
                className="relative bg-white text-[#FF4500] shadow-md transition-transform hover:bg-white/90 active:scale-95"
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Mini-stats */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
          className="flex gap-2.5"
        >
          <MiniStat label="Corridas" value={loadingRides ? "—" : String(stats.totalRides)} icon={Receipt} />
          <MiniStat label="Em andamento" value={loadingRides ? "—" : String(stats.active)} icon={Loader2} />
          <MiniStat label="Total gasto" value={loadingRides ? "—" : formatCurrencyBRL(stats.totalSpent)} icon={Wallet} />
        </motion.div>

        {/* Histórico */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-zinc-900 font-bold" />
              <h2 className="text-sm font-black uppercase tracking-wide text-zinc-900">Histórico</h2>
            </div>
            {hiddenIds.size > 0 && (
              <button
                type="button"
                onClick={restoreHiddenRides}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 shadow-xs transition-all hover:bg-amber-200 active:scale-95"
              >
                <span>Restaurar ({hiddenIds.size})</span>
              </button>
            )}
          </div>

          {loadingRides ? (
            <div className="space-y-2.5">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : visibleRides.length === 0 ? (
            <Card className="rounded-2xl border-dashed border-zinc-300 bg-white shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 p-1 shadow-sm">
                  <img src={viaggLogo} alt="Viagg" className="h-full w-full object-cover rounded-xl" />
                </div>
                <div>
                  <p className="font-bold text-zinc-900">
                    {hiddenIds.size > 0 ? "Todos os cards foram escondidos" : "Nenhuma corrida ainda"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-600">
                    {hiddenIds.size > 0
                      ? "Você ocultou todos os cards do histórico. Clique no botão abaixo para restaurá-los e exibi-los novamente."
                      : "Suas corridas e entregas vão aparecer aqui assim que você chamar um profissional."}
                  </p>
                </div>
                {hiddenIds.size > 0 && (
                  <Button
                    onClick={restoreHiddenRides}
                    variant="outline"
                    className="mt-2 border-zinc-300 bg-zinc-100 font-bold text-zinc-900 shadow-sm hover:bg-zinc-200"
                  >
                    Restaurar cards escondidos ({hiddenIds.size})
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {visibleRides.map((ride, i) => (
                <RideHistoryItem key={ride.id} ride={ride} index={i} currentBalance={balance} onHide={hideRide} />
              ))}
            </div>
          )}
        </motion.div>

        {/* 🧪 Ambiente de teste (Sandbox) — dados enviados para testar a recarga */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: "easeOut" }}
        >
          <Card className="rounded-2xl border border-amber-400/30 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="text-base">🧪</span>
                <h2 className="text-sm font-black text-amber-700 dark:text-amber-300">Ambiente de teste (Sandbox)</h2>
              </div>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                Dinheiro fictício. Use estes dados no checkout do Mercado Pago para testar a recarga.
              </p>
              <div className="grid gap-2 text-xs">
                <div className="rounded-lg bg-white/70 p-2.5 dark:bg-black/20">
                  <p className="font-bold text-amber-800 dark:text-amber-200">Comprador de teste</p>
                  <p className="text-amber-700/90 dark:text-amber-300/90">
                    Usuário: <span className="font-mono">TESTUSER5867…</span> · Senha: <span className="font-mono">hrOrfYgN41</span>
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 p-2.5 dark:bg-black/20">
                  <p className="font-bold text-amber-800 dark:text-amber-200">Cartão aprovado (APRO)</p>
                  <p className="font-mono text-amber-700/90 dark:text-amber-300/90">5031 4332 1540 6351 · 11/30 · CVV 123</p>
                  <p className="text-amber-700/90 dark:text-amber-300/90">
                    Titular: <span className="font-mono">APRO</span> · CPF: <span className="font-mono">12345678909</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </MarketLayout>
  );
}
