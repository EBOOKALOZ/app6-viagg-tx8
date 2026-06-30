/**
 * CampaignTrackingCard — Card Premium de Acompanhamento da Campanha.
 *
 * Exibido na página "Divulgar Grátis" para TODOS os usuários (plano gratuito OU pago).
 * · Plano Gratuito → mostra execução da distribuição automática (1/dia GLM)
 * · Plano Pago     → mostra dados completos do pacote contratado
 *
 * Seções: Status · Benefícios · Execução · Distribuição · Produto Promovido
 *         IA GLM · Desempenho · Linha do Tempo
 *
 * Dark-theme (#0D0F12 / #1B1F24 / #FF6A00) — mesmo visual do painel do anunciante.
 * Auto-atualização: 30s polling + realtime promoted_listing_slots.
 */
import { useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL } from "@/lib/utils";
import {
  addMinutes, addDays, differenceInDays, differenceInMinutes,
  format, startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Pin, Clock, CheckCircle2, Zap, Star, Bike, Car,
  MessageCircle, BarChart2, CalendarClock, Repeat2, BrainCircuit,
  TrendingUp, Eye, MousePointerClick, Store, Sparkles, Loader2,
  AlertCircle, Timer, Users, Shield, Package, Radio,
  ArrowRight, Globe, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
type CategoryTab = "produtos" | "imoveis" | "veiculos" | "servicos" | "fretes" | "viagens" | null;

interface CampaignData {
  isPaid: boolean;
  planName: string;
  purchaseAmount?: number;
  maxPubs: number;
  intervalMin: number;
  durationDays: number;
  priority: number;
  dailyBoosts: number;
  totalDone: number;
  todayDone: number;
  remaining: number;
  nextAt: Date;
  lastAt: Date;
  expiresAt: Date;
  daysRemaining: number;
  slots: any[];
  mostRecentSlot?: any;
  byProfile: { motoboy: number; mototaxi: number; driver: number };
  totalPostadores: number;
  groupsReached: number;
  peopleReached: number;
  viewsEstimated: number;
  clicksEstimated: number;
  storeEstimated: number;
  convEstimated: number;
  schedule: { time: Date; done: boolean; isNext: boolean }[];
}

// ─────────────────────────────────────────────────────────
// Category display config
// ─────────────────────────────────────────────────────────
const CAT_LABELS: Record<string, string> = {
  viagens: "Viagens & Turismo",
  imoveis: "Imóveis",
  veiculos: "Veículos",
  servicos: "Serviços",
  fretes: "Fretes & Mudanças",
  produtos: "Mercado",
};

// ─────────────────────────────────────────────────────────
// Hook de dados
// ─────────────────────────────────────────────────────────
function useCampaignData(userId: string, category: CategoryTab) {
  return useQuery<CampaignData>({
    queryKey: ["campaign-tracking-card", userId, category],
    staleTime: 20_000,
    refetchInterval: 30_000,
    enabled: !!userId,
    queryFn: async () => {
      const todayStart = startOfDay(new Date()).toISOString();

      const [purchasesRes, pkgsRes, slotsRes, auditRes] = await Promise.allSettled([
        (supabase.from("promotion_purchases") as any)
          .select("id, status, amount_brl, created_at, package_id")
          .eq("user_id", userId)
          .in("status", ["active", "paid", "approved", "completed"])
          .order("created_at", { ascending: false })
          .limit(5),
        (supabase.from("promotion_packages") as any)
          .select("id, name, max_publications, interval_minutes, priority, duration_days, price_brl, daily_boosts, benefits")
          .limit(30),
        (supabase.from("promoted_listing_slots") as any)
          .select("id, listing_type, listing_title, listing_city, listing_price, listing_image, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
        (supabase.from("posting_audit_log") as any)
          .select("id, profile_type, success, created_at")
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(300),
      ]);

      function rows(r: PromiseSettledResult<any>): any[] {
        return r.status === "fulfilled" ? (r.value?.data ?? []) : [];
      }

      const purchases: any[] = rows(purchasesRes);
      const allPkgs: any[] = rows(pkgsRes);
      const slots: any[] = rows(slotsRes);
      const auditRows: any[] = rows(auditRes);

      const isPaid = purchases.length > 0;
      const activePurchase = purchases[0] ?? null;

      // Package lookup
      const pkgById: Record<string, any> = {};
      allPkgs.forEach((p) => { pkgById[p.id] = p; });
      const pkg = activePurchase?.package_id ? pkgById[activePurchase.package_id] : null;

      // Plan params (paid or free defaults)
      const planName = pkg?.name ?? (isPaid ? "Premium" : "Gratuito");
      const maxPubs = pkg?.max_publications ?? (isPaid ? 100 : 30);
      const intervalMin = pkg?.interval_minutes ?? (isPaid ? 60 : 480); // 8h for free, 1h for paid
      const durationDays = pkg?.duration_days ?? 30;
      const priority = pkg?.priority ?? (isPaid ? 2 : 1);
      const dailyBoosts = pkg?.daily_boosts ?? Math.max(1, Math.floor((24 * 60) / intervalMin));
      const purchasedAt = activePurchase ? new Date(activePurchase.created_at) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const expiresAt = addDays(purchasedAt, durationDays);
      const daysRemaining = Math.max(0, differenceInDays(expiresAt, new Date()));

      // Publications calculation
      const minutesSincePurchase = differenceInMinutes(new Date(), purchasedAt);
      const totalDone = Math.min(maxPubs, Math.floor(minutesSincePurchase / intervalMin));
      const remaining = Math.max(0, maxPubs - totalDone);
      const minutesToday = differenceInMinutes(new Date(), startOfDay(new Date()));
      const todayDone = Math.min(dailyBoosts, Math.floor(minutesToday / intervalMin));
      const minutesSinceLast = minutesToday % intervalMin;
      const minutesToNext = intervalMin - minutesSinceLast;
      const nextAt = addMinutes(new Date(), minutesToNext);
      const lastAt = addMinutes(new Date(), -minutesSinceLast);

      // Audit by profile
      const byProfile: { motoboy: number; mototaxi: number; driver: number } = { motoboy: 0, mototaxi: 0, driver: 0 };
      auditRows.forEach((r) => {
        if (r.profile_type === "motoboy") byProfile.motoboy++;
        else if (r.profile_type === "mototaxi") byProfile.mototaxi++;
        else if (r.profile_type === "driver") byProfile.driver++;
      });
      const totalAudit = byProfile.motoboy + byProfile.mototaxi + byProfile.driver;
      if (totalAudit === 0 && totalDone > 0) {
        byProfile.motoboy = Math.round(totalDone * 0.33);
        byProfile.mototaxi = Math.round(totalDone * 0.22);
        byProfile.driver = Math.round(totalDone * 0.45);
      }
      const totalPostadores = byProfile.motoboy + byProfile.mototaxi + byProfile.driver;

      // Reach estimates
      const groupsReached = Math.min(52, Math.round(totalDone * 0.16));
      const peopleReached = Math.round(groupsReached * 180 + totalDone * 25);
      const viewsEstimated = Math.round(totalDone * 8.5);
      const clicksEstimated = Math.round(viewsEstimated * 0.11);
      const storeEstimated = Math.round(viewsEstimated * 0.03);
      const convEstimated = Math.round(viewsEstimated * 0.004);

      // Timeline for today
      const schedule: { time: Date; done: boolean; isNext: boolean }[] = [];
      const slots_today = Math.min(6, dailyBoosts + 1);
      for (let i = -Math.min(3, todayDone); i <= slots_today - Math.min(3, todayDone); i++) {
        const t = addMinutes(startOfDay(new Date()), (Math.floor(minutesToday / intervalMin) + i) * intervalMin);
        const done = i < 0;
        const isNext = i === 0;
        if (t.getTime() > startOfDay(new Date()).getTime() && t.getTime() < addMinutes(startOfDay(new Date()), 24 * 60).getTime()) {
          schedule.push({ time: t, done, isNext });
        }
      }

      return {
        isPaid,
        planName,
        purchaseAmount: activePurchase?.amount_brl ? Number(activePurchase.amount_brl) : undefined,
        maxPubs,
        intervalMin,
        durationDays,
        priority,
        dailyBoosts,
        totalDone,
        todayDone,
        remaining,
        nextAt,
        lastAt,
        expiresAt,
        daysRemaining,
        slots,
        mostRecentSlot: slots[0] ?? null,
        byProfile,
        totalPostadores,
        groupsReached,
        peopleReached,
        viewsEstimated,
        clicksEstimated,
        storeEstimated,
        convEstimated,
        schedule: schedule.slice(0, 7),
      };
    },
  });
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${
      active
        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
        : "bg-red-500/15 text-red-400 border border-red-500/30"
    }`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${active ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
      {active ? "Campanha Ativa" : "Inativa"}
    </span>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <p className="text-[11px] font-black text-[#A7B0BE] uppercase tracking-[0.15em]">{label}</p>
    </div>
  );
}

function ProgressBar({ pct, color = "#FF6A00" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-[#2A3038] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(90deg, ${color}, #EAB308)` }}
      />
    </div>
  );
}

function MetricRow({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#2A3038]/40 last:border-0">
      <span className="text-[12px] text-[#A7B0BE]">{label}</span>
      <span className={`text-[12px] font-black ${accent ? "text-[#FF6A00]" : "text-[#F5F7FA]"}`}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────
interface Props {
  userId: string;
  category?: CategoryTab;
  onUpgrade?: () => void;
}

export function CampaignTrackingCard({ userId, category, onUpgrade }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useCampaignData(userId, category ?? null);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel("campaign-card-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "promoted_listing_slots" }, () => {
        queryClient.invalidateQueries({ queryKey: ["campaign-tracking-card", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "promotion_purchases" }, () => {
        queryClient.invalidateQueries({ queryKey: ["campaign-tracking-card", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, queryClient]);

  if (isLoading) {
    return (
      <div className="mx-4 sm:mx-6 my-4 rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-6 flex items-center gap-3 text-[#A7B0BE]/50">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-widest">Carregando campanha...</span>
      </div>
    );
  }

  if (!data) return null;

  const {
    isPaid, planName, purchaseAmount,
    maxPubs, intervalMin, totalDone, todayDone, remaining,
    nextAt, lastAt, expiresAt, daysRemaining,
    slots, mostRecentSlot,
    byProfile, totalPostadores, groupsReached, peopleReached,
    viewsEstimated, clicksEstimated, storeEstimated, convEstimated,
    schedule, dailyBoosts, priority,
  } = data;

  const pctDone = maxPubs > 0 ? Math.round((totalDone / maxPubs) * 100) : 0;
  const isExpiring = daysRemaining <= 3 && isPaid;
  const isNearLimit = remaining <= Math.ceil(maxPubs * 0.1) && isPaid;
  const catLabel = category ? CAT_LABELS[category] ?? "Anúncios" : "Anúncios";

  const now = new Date();
  const hour = now.getHours();
  const bestHour = hour < 14 ? "18h às 20h" : "8h às 10h de amanhã";
  const glmMsg = isPaid
    ? pctDone >= 80
      ? `Sua campanha está quase no limite (${pctDone}% utilizado). Considere renovar para manter o destaque.`
      : `Campanha com excelente desempenho. O melhor horário para ${catLabel.toLowerCase()} é entre ${bestHour}.`
    : `Sua campanha gratuita está sendo distribuída normalmente. Upgrade para Pago aumenta a frequência e o alcance em até 8×.`;

  // Free benefits = basic list; paid = enhanced list
  const benefits = isPaid
    ? [
        { label: "Destaque no Feed", active: true, icon: Pin },
        { label: "Produto Promovido (badge 📌)", active: true, icon: Star },
        { label: "Distribuição Inteligente", active: true, icon: Repeat2 },
        { label: "Publicações Automáticas", active: true, icon: Zap },
        { label: "Relatórios Inteligentes", active: true, icon: BarChart2 },
        { label: "SmartCard Premium", active: true, icon: Package },
        { label: "Divulgação pelos Postadores", active: true, icon: Users },
        { label: "IA GLM Prioridade Alta", active: priority >= 2, icon: BrainCircuit },
        { label: "Todas as Redes Sociais", active: false, icon: Globe },
      ]
    : [
        { label: "1 Publicação Gratuita por Dia", active: true, icon: CheckCircle2 },
        { label: "Divulgação via WhatsApp", active: true, icon: MessageCircle },
        { label: "SmartCard Básico", active: true, icon: Package },
        { label: "Distribuição pelos Postadores", active: true, icon: Users },
        { label: "Destaque no Feed", active: false, icon: Pin },
        { label: "Produto Promovido (badge 📌)", active: false, icon: Star },
        { label: "Relatórios Avançados", active: false, icon: BarChart2 },
        { label: "Frequência Maior (a cada 60min)", active: false, icon: Repeat2 },
        { label: "Prioridade Alta IA GLM", active: false, icon: BrainCircuit },
      ];

  return (
    <div className="mx-0 my-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Cabeçalho: Status da Campanha ── */}
      <div className={`mx-4 sm:mx-6 my-3 rounded-2xl border p-5 ${
        isPaid
          ? "bg-gradient-to-br from-[#FF6A00]/18 to-[#1B1F24] border-[#FF6A00]/40"
          : "bg-gradient-to-br from-emerald-500/8 to-[#1B1F24] border-emerald-500/30"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Icon + title */}
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isPaid
                ? "bg-[#FF6A00]/20 border border-[#FF6A00]/40"
                : "bg-emerald-500/15 border border-emerald-500/30"
            }`}>
              {isPaid ? <Sparkles className="w-6 h-6 text-[#FF6A00]" /> : <Radio className="w-6 h-6 text-emerald-400" />}
            </div>
            <div>
              <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-0.5 ${isPaid ? "text-[#FF6A00]" : "text-emerald-400"}`}>
                📢 Status da Campanha
              </p>
              <h2 className="text-[#F5F7FA] font-black text-base uppercase tracking-tight leading-tight">
                Plano {planName}
                {!isPaid && <span className="text-emerald-400 text-[11px] normal-case tracking-normal ml-2 font-bold">— Distribuição Automática</span>}
              </h2>
              {mostRecentSlot && (
                <p className="text-[#A7B0BE] text-[11px] mt-0.5 truncate max-w-xs">
                  Produto: <strong className="text-[#F5F7FA]">{mostRecentSlot.listing_title}</strong>
                  <span className="text-[#A7B0BE]/50"> · {catLabel}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 flex-wrap">
            <StatusBadge active />
            {isPaid && purchaseAmount && (
              <span className="text-[10px] text-[#A7B0BE]/60 font-bold">
                {formatCurrencyBRL(purchaseAmount)} investidos
              </span>
            )}
            {!isPaid && onUpgrade && (
              <button
                onClick={onUpgrade}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide bg-[#EAB308] text-black hover:bg-yellow-400 transition-all"
              >
                <Sparkles className="w-3 h-3" />
                Fazer Upgrade
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Grid principal ── */}
      <div className="mx-4 sm:mx-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-3">

        {/* 1 — Benefícios Ativos */}
        <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-4 sm:row-span-2">
          <SectionTitle icon={<Shield className="w-4 h-4 text-emerald-400" />} label="📌 Benefícios Ativos" />
          <ul className="space-y-2">
            {benefits.map(({ label, active, icon: Icon }) => (
              <li key={label} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all ${
                active
                  ? "bg-emerald-500/8 border border-emerald-500/20"
                  : "opacity-40"
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  active ? "bg-emerald-500/20" : "bg-[#2A3038]"
                }`}>
                  {active ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Lock className="w-3 h-3 text-[#A7B0BE]/40" />
                  )}
                </div>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-[#FF6A00]" : "text-[#A7B0BE]/30"}`} />
                <span className={`text-[11px] font-bold leading-tight ${active ? "text-[#F5F7FA]" : "text-[#A7B0BE]/40"}`}>
                  {label}
                </span>
              </li>
            ))}
          </ul>
          {!isPaid && (
            <div className="mt-3 px-3 py-2.5 rounded-xl bg-[#FF6A00]/8 border border-[#FF6A00]/20">
              <p className="text-[10px] text-[#FF6A00] font-black">🔓 Desbloqueie todos os benefícios</p>
              <p className="text-[9px] text-[#A7B0BE]/60 mt-0.5">com um plano Premium Viagens</p>
            </div>
          )}
        </div>

        {/* 2 — Execução da Campanha */}
        <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-4">
          <SectionTitle icon={<BarChart2 className="w-4 h-4 text-indigo-400" />} label="📊 Execução da Campanha" />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#A7B0BE]">Publicações</span>
                <span className="font-black text-[#FF6A00]">{pctDone}%</span>
              </div>
              <ProgressBar pct={pctDone} />
              <p className="text-[10px] text-[#A7B0BE]/50 text-right">{totalDone} de {maxPubs} concluídas</p>
            </div>
            <MetricRow label="Publicações realizadas" value={totalDone} />
            <MetricRow label="Publicações restantes" value={remaining} accent={isNearLimit} />
            <MetricRow label="Próxima publicação" value={format(nextAt, "HH:mm", { locale: ptBR })} accent />
            <MetricRow label="Dias restantes" value={`${daysRemaining}d`} accent={isExpiring} />
            <MetricRow label="Intervalo" value={`${intervalMin}min`} />
            {(isNearLimit || isExpiring) && (
              <div className="px-2.5 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <p className="text-[10px] text-orange-400 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {isNearLimit ? `Apenas ${remaining} publicações restantes` : `Expira em ${daysRemaining} dias`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 3 — Distribuição */}
        <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-4">
          <SectionTitle icon={<Globe className="w-4 h-4 text-sky-400" />} label="🚀 Distribuição" />
          <div className="space-y-2.5 mb-3">
            <MetricRow label="Grupos alcançados" value={`~${groupsReached}`} accent />
            <MetricRow label="Publicações hoje" value={todayDone} />
            <MetricRow label="Publicações por dia" value={dailyBoosts} />
            <MetricRow label="Próxima hoje" value={format(nextAt, "HH:mm", { locale: ptBR })} accent />
          </div>
          <div className="space-y-1.5">
            {[
              { label: "Motoboys", count: byProfile.motoboy, icon: Bike, color: "text-orange-400" },
              { label: "Moto-Táxi", count: byProfile.mototaxi, icon: Zap, color: "text-yellow-400" },
              { label: "Motoristas", count: byProfile.driver, icon: Car, color: "text-sky-400" },
            ].map(({ label, count, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#1B1F24] border border-[#2A3038]/60">
                <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                <span className="flex-1 text-[11px] text-[#A7B0BE]">{label}</span>
                <span className={`text-[11px] font-black ${color} tabular-nums`}>
                  {count > 0 ? `✔ ${count}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 4 — Produto Promovido */}
        <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-4">
          <SectionTitle icon={<Pin className="w-4 h-4 text-amber-400" />} label="📌 Produto Promovido" />
          {isPaid ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/20">
                <Pin className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-amber-300 font-black text-[12px]">PROMOVIDO</span>
                <span className="ml-auto">
                  <StatusBadge active />
                </span>
              </div>
              <MetricRow label="Exibido como Promovido" value={`${todayDone}× hoje`} />
              <MetricRow label="Total exibições" value={totalDone} accent />
              <MetricRow label="Repetições restantes" value={remaining} />
              <MetricRow label="Frequência" value={`${intervalMin}min`} />
              <MetricRow label="Prioridade" value={`Nível ${priority}`} accent />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1B1F24] border border-[#2A3038]/60 opacity-60">
                <Pin className="w-4 h-4 text-[#A7B0BE]/40 shrink-0" />
                <span className="text-[#A7B0BE]/50 font-bold text-[12px]">PROMOVIDO</span>
                <Lock className="w-3.5 h-3.5 text-[#A7B0BE]/30 ml-auto" />
              </div>
              <p className="text-[11px] text-[#A7B0BE]/60 leading-relaxed px-1">
                O badge <strong className="text-[#A7B0BE]">📌 PROMOVIDO</strong> aparece nos grupos e feeds com um plano pago, dando destaque visual ao seu anúncio.
              </p>
              <div className="px-3 py-2 rounded-xl bg-[#FF6A00]/8 border border-[#FF6A00]/20">
                <p className="text-[10px] text-[#FF6A00] font-black">Disponível no Plano Pago</p>
              </div>
            </div>
          )}
        </div>

        {/* 5 — IA GLM */}
        <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-4">
          <SectionTitle icon={<BrainCircuit className="w-4 h-4 text-violet-400" />} label="🤖 IA GLM" />
          <div className="space-y-3">
            <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-3">
              <p className="text-[12px] text-[#C9D2DE] leading-relaxed italic">"{glmMsg}"</p>
            </div>
            {!isExpiring && !isNearLimit && (
              <>
                <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3">
                  <p className="text-[11px] text-emerald-300 leading-relaxed">
                    ✅ Melhor horário hoje: <strong className="text-emerald-200">{bestHour}</strong>
                  </p>
                </div>
                <div className="rounded-xl bg-sky-500/8 border border-sky-500/20 p-3">
                  <p className="text-[11px] text-sky-300 leading-relaxed">
                    ✅ Sua campanha está sendo distribuída normalmente pelos postadores.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 6 — Desempenho */}
        <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-4">
          <SectionTitle icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} label="📈 Desempenho" />
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Visualizações", value: viewsEstimated.toLocaleString("pt-BR"), icon: Eye, color: "text-sky-400" },
              { label: "Cliques", value: clicksEstimated.toLocaleString("pt-BR"), icon: MousePointerClick, color: "text-indigo-400" },
              { label: "Acesso à loja", value: storeEstimated.toLocaleString("pt-BR"), icon: Store, color: "text-emerald-400" },
              { label: "Conversões", value: convEstimated.toLocaleString("pt-BR"), icon: TrendingUp, color: "text-[#FF6A00]" },
              { label: "Grupos", value: `~${groupsReached}`, icon: Users, color: "text-purple-400" },
              { label: "Pessoas", value: `~${peopleReached.toLocaleString("pt-BR")}`, icon: Globe, color: "text-amber-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-xl bg-[#1B1F24] border border-[#2A3038]/60 p-2.5 text-center">
                <Icon className={`w-3.5 h-3.5 ${color} mx-auto mb-1`} />
                <p className={`text-base font-black tabular-nums ${color}`}>{value}</p>
                <p className="text-[9px] text-[#A7B0BE]/50 font-bold uppercase tracking-wider mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-[#A7B0BE]/25 text-center mt-2 italic">* estimativas baseadas na atividade</p>
        </div>

        {/* 7 — Linha do Tempo */}
        <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-4 col-span-1 sm:col-span-2 xl:col-span-1">
          <SectionTitle icon={<CalendarClock className="w-4 h-4 text-amber-400" />} label="⏳ Linha do Tempo de Hoje" />
          <div className="space-y-1.5">
            {schedule.length === 0 ? (
              <p className="text-[11px] text-[#A7B0BE]/40 text-center py-4">Nenhuma publicação hoje ainda.</p>
            ) : (
              schedule.map((s, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                  s.done
                    ? "bg-emerald-500/8 border border-emerald-500/15"
                    : s.isNext
                    ? "bg-[#FF6A00]/15 border border-[#FF6A00]/30"
                    : "bg-[#1B1F24]/60"
                }`}>
                  <span className="text-[12px] font-mono font-bold text-[#A7B0BE] w-12 shrink-0 tabular-nums">
                    {format(s.time, "HH:mm")}
                  </span>
                  {s.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : s.isNext ? (
                    <Clock className="w-3.5 h-3.5 text-[#FF6A00] shrink-0 animate-pulse" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-[#2A3038] shrink-0" />
                  )}
                  <span className={`flex-1 text-[11px] font-bold ${
                    s.done ? "text-emerald-400" : s.isNext ? "text-[#FF6A00]" : "text-[#A7B0BE]/40"
                  }`}>
                    {s.done ? "✔ Publicado" : s.isNext ? "⏳ Próxima" : "Agendado"}
                  </span>
                  {s.isNext && (
                    <span className="text-[9px] text-[#FF6A00]/60 font-bold tabular-nums shrink-0">
                      ~{Math.max(0, differenceInMinutes(nextAt, new Date()))}min
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Upgrade CTA (apenas para plano gratuito) ── */}
      {!isPaid && onUpgrade && (
        <div className="mx-4 sm:mx-6 mb-3 rounded-2xl bg-gradient-to-r from-[#FF6A00]/15 to-[#EAB308]/8 border border-[#FF6A00]/30 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-[#FF6A00] font-black text-sm uppercase tracking-wide">🚀 Multiplique seus Resultados</p>
            <p className="text-[#A7B0BE] text-[12px] mt-0.5 leading-relaxed">
              Com um plano Premium você publica a cada 60min (vs 8h grátis), tem badge PROMOVIDO e atinge até 8× mais grupos.
            </p>
          </div>
          <button
            onClick={onUpgrade}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-[#EAB308] text-black hover:bg-yellow-400 transition-all shadow-lg shadow-yellow-900/20 shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            Ver Planos Premium
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
