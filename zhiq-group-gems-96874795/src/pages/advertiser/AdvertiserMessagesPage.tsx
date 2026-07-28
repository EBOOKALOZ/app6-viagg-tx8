import { useNavigate, useLocation } from "react-router-dom";
import { useState, useMemo } from "react";
import {
  MessageSquare, ArrowLeft, Loader2, Building2, Car, Package,
  User, Phone, MapPin, Clock, Coins, Unlock, Lock, Trash2,
  Briefcase, Truck, Plane, Search, Star, Activity, Eye, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommissionUnlockNotice } from "@/components/advertiser/CommissionUnlockNotice";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useContactIntentions, INTEREST_TYPE_LABELS } from "@/hooks/useContactIntentions";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";
import { quoteUnlockContact, centsToBRL } from "@/lib/credits/unlockContact";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Custos padrão de desbloqueio (segmentos ainda no modelo de créditos) ────
//    Fretes NÃO usa custo fixo: cobra % do valor anunciado convertida em R$
//    (wallet_unlock_charge_cents — cotado por anúncio, exibido no botão).
const UNLOCK_COST        = 12;
const RE_UNLOCK_DEFAULT  = 12;
const VE_UNLOCK_DEFAULT  = 12;
const SE_UNLOCK_DEFAULT  = 12;
const TR_UNLOCK_DEFAULT  = 12;


const INTEREST_ICON: Record<string, React.ElementType> = {
  proposal:        FileText,
  whatsapp_click:  MessageSquare,
  message_request: MessageSquare,
  view_contact:    Eye,
};

const FAV_LEADS_KEY = "viagg_fav_leads";

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { locale: ptBR, addSuffix: true });
  } catch { return ""; }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AdvertiserMessagesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { intentions, isLoading, unlockIntention, deleteIntention } = useContactIntentions();

  const { balance } = useAdvertiserCredits();
  const queryClient = useQueryClient();

  const imoveisMode  = location.pathname.startsWith("/anunciante/imoveis");
  const veiculosMode = location.pathname.startsWith("/anunciante/veiculos");
  const servicosMode = location.pathname.startsWith("/anunciante/servicos");
  const fretesMode   = location.pathname.startsWith("/anunciante/fretes");
  const viagensMode  = window.location.pathname.startsWith("/anunciante/viagens");

  // ── Saldo anunciante genérico ───────────────────────────────────────────
  const { data: fallbackBalance = 0 } = useQuery({
    queryKey: ["seller-credit-balance-for-msgs", user?.id],
    enabled: !!user?.id && !imoveisMode && !veiculosMode && !servicosMode && !fretesMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: adv } = await (supabase.from("advertiser_accounts" as any)
        .select("id").eq("user_id", user!.id).maybeSingle()) as any;
      const accId = (adv as any)?.id;
      if (!accId) return 0;
      const { data: bal } = await (supabase.from("advertiser_credit_balances" as any)
        .select("available_credits").eq("advertiser_account_id", accId).maybeSingle()) as any;
      return Number((bal as any)?.available_credits ?? 0);
    },
  });

  // ── Saldo imóveis ─────────────────────────────────────────────────────
  const { data: reBalance = 0 } = useQuery({
    queryKey: ["real-estate-balance-msgs", user?.id],
    enabled: !!user?.id && imoveisMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  const { data: reUnlockCost = RE_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["real-estate-unlock-whatsapp-cost"],
    enabled: imoveisMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "real_estate_unlock_whatsapp")
        .maybeSingle();
      if (!data) return RE_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || RE_UNLOCK_DEFAULT);
    },
  });

  // ── Saldo veículos ────────────────────────────────────────────────────
  const { data: veBalance = 0 } = useQuery({
    queryKey: ["vehicle-balance-msgs", user?.id],
    enabled: !!user?.id && veiculosMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("vehicle_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  const { data: veUnlockCost = VE_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["vehicle-unlock-whatsapp-cost"],
    enabled: veiculosMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "vehicle_unlock_whatsapp")
        .maybeSingle();
      if (!data) return VE_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || VE_UNLOCK_DEFAULT);
    },
  });

  // ── Saldo serviços ────────────────────────────────────────────────────
  const { data: seBalance = 0 } = useQuery({
    queryKey: ["service-balance-msgs", user?.id],
    enabled: !!user?.id && servicosMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("service_credit_balances") as any)
        .select("available_credits").eq("owner_user_id", user!.id).maybeSingle();
      return Number((data as any)?.available_credits ?? 0);
    },
  });

  const { data: seUnlockCost = SE_UNLOCK_DEFAULT } = useQuery({
    queryKey: ["service-unlock-whatsapp-cost"],
    enabled: servicosMode,
    queryFn: async () => {
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("credits_cost, is_active")
        .eq("feature_code", "service_unlock_whatsapp")
        .maybeSingle();
      if (!data) return SE_UNLOCK_DEFAULT;
      return (data as any).is_active === false ? 0 : (Number((data as any).credits_cost) || SE_UNLOCK_DEFAULT);
    },
  });

  // ── Saldo viagens legado removido em favor da carteira única ───────────

  const isMercado = !imoveisMode && !veiculosMode && !servicosMode && !fretesMode && !viagensMode;
  const walletMode = isMercado || fretesMode || viagensMode;

  // ── Saldo Carteira Única em R$ (motor pay_*) ──────────────────────────
  //    Mercado, Fretes e Viagens utilizam o modelo % (BRL)
  const { data: walletBalanceBRL = 0 } = useQuery({
    queryKey: ["wallet-balance", user?.id],
    enabled: !!user?.id && walletMode,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await (supabase.from("pay_financial_accounts") as any)
        .select("available_balance").eq("owner_id", user!.id);
      return ((data || []) as any[]).reduce((s: number, a: any) => s + Number(a.available_balance || 0), 0);
    },
  });

  const creditBalance = imoveisMode ? reBalance : veiculosMode ? veBalance : servicosMode ? seBalance : walletBalanceBRL;
  const saldoLabel = walletMode
    ? (creditBalance ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : `${creditBalance}`;
  const costForLead = (_lead: any): number => (imoveisMode ? reUnlockCost : veiculosMode ? veUnlockCost : servicosMode ? seUnlockCost : UNLOCK_COST);

  // ── Máscaras ──────────────────────────────────────────────────────────
  const maskName = (n: string | null) => {
    if (!n) return "Visitante";
    const first = n.trim().split(/\s+/)[0] || "Visitante";
    return first[0]?.toUpperCase() + "***";
  };
  const maskPhone = (p: string | null) => {
    if (!p) return "";
    const digits = String(p).replace(/\D/g, "");
    if (digits.length < 4) return "(**) ****-****";
    const ddd = digits.slice(-11, -9) || "**";
    return `(${ddd}) *****-****`;
  };
  const stripContactEmail = (msg: string | null) =>
    (msg || "").replace(/\n*\s*e-?mail:\s*[^\s]+@[^\s]+/i, "").trim();

  // ── Desbloqueio unificado (Carteira de Créditos) ──────────────────────────
  //  API ÚNICA: unlockIntention → wallet_unlock_contact (2% do valor anunciado,
  //  permanente por anúncio+comprador). O módulo/anúncio/comprador é resolvido
  //  a partir da própria intenção — sem lógica por módulo aqui.
  const handleUnlock = async (id: string) => {
    const result = await unlockIntention(id);
    if (result.success) {
      const brl = (result.credits_charged ?? 0) > 0 ? ` R$ ${(result.credits_charged ?? 0).toFixed(2)} debitados.` : "";
      toast.success(`Comprador liberado!${brl}`);
      queryClient.invalidateQueries({ queryKey: ["contact-intentions", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["wallet-balance", user?.id] });
    } else if (result.buy_credits_cta || result.error === "insufficient_credits") {
      toast.error(`Saldo insuficiente. Adicione saldo à sua carteira.`);
      setTimeout(() => navigate("/anunciante/carteira"), 1400);
    } else {
      toast.error("Erro ao liberar comprador: " + (result.error ?? "desconhecido"));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteIntention(id);
    if (res.success) toast.success("Mensagem excluída.");
    else toast.error("Erro: " + res.error);
  };

  const handleCallVisitor = (lead: any) => {
    if (!lead.visitor_phone) return;
    const clean = String(lead.visitor_phone).replace(/\D/g, "").replace(/^55/, "");
    const msg = encodeURIComponent(`Olá ${lead.visitor_name || ""}! Você demonstrou interesse no anúncio "${lead.listing_title || ""}" na Viagg-TX8. Vamos conversar?`);
    window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
  };

  // ── Filtragem por segmento (lógica inalterada) ────────────────────────
  const visibleIntentions = imoveisMode
    ? intentions.filter((i) => i.listing_module === "real_estate")
    : veiculosMode
      ? intentions.filter((i) => i.listing_module === "vehicles")
      : servicosMode
        ? intentions.filter((i) => i.listing_module === "services")
        : fretesMode
          ? intentions.filter((i) => i.listing_module === "freight")
          : viagensMode
            ? intentions.filter((i) => i.listing_module === "travel")
            : intentions.filter((i) => !["real_estate", "vehicles", "services", "freight", "travel"].includes(i.listing_module));

  // ── Cotação de desbloqueio dinâmico (fretes, viagens): % convertida em R$ ──
  //    wallet_unlock_charge_cents é a fonte única (orion_commission_policy).
  const isDynamicQuoteMode = fretesMode || viagensMode;
  const dynamicQuoteIds = useMemo(
    () => isDynamicQuoteMode
      ? Array.from(new Set(visibleIntentions.filter((i) => i.status === "pending_unlock").map((i) => i.listing_id)))
      : [],
    [isDynamicQuoteMode, visibleIntentions],
  );
  const { data: dynamicQuotes = {} } = useQuery({
    queryKey: ["dynamic-unlock-quotes", user?.id, dynamicQuoteIds],
    enabled: isDynamicQuoteMode && dynamicQuoteIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const moduleStr = fretesMode ? "freight" : viagensMode ? "travel" : "product";
      const entries = await Promise.all(dynamicQuoteIds.map(async (id) => {
        const cents = await quoteUnlockContact(moduleStr, id);
        return [id, cents] as const;
      }));
      return Object.fromEntries(entries) as Record<string, number | null>;
    },
  });

  // ── NOVAS funcionalidades de UI ─────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "pending" | "unlocked" | "favoritos">("all");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_LEADS_KEY) || "[]") as string[]); }
    catch { return new Set<string>(); }
  });

  const toggleFavorite = (leadId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      try { localStorage.setItem(FAV_LEADS_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const stats = useMemo(() => ({
    total:    visibleIntentions.length,
    pending:  visibleIntentions.filter(i => i.status === "pending_unlock").length,
    unlocked: visibleIntentions.filter(i => i.status === "unlocked").length,
    favs:     favorites.size,
  }), [visibleIntentions, favorites]);

  const filteredIntentions = useMemo(() => {
    let result = visibleIntentions;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(i =>
        (i.visitor_name   || "").toLowerCase().includes(q) ||
        (i.listing_title  || "").toLowerCase().includes(q) ||
        (i.visitor_message|| "").toLowerCase().includes(q) ||
        (i.city           || "").toLowerCase().includes(q)
      );
    }
    if (activeFilter === "pending")   result = result.filter(i => i.status === "pending_unlock");
    if (activeFilter === "unlocked")  result = result.filter(i => i.status === "unlocked");
    if (activeFilter === "favoritos") result = result.filter(i => favorites.has(i.id));
    return result;
  }, [visibleIntentions, searchTerm, activeFilter, favorites]);

  // Dados visuais por segmento
  const seg = {
    gradient: imoveisMode  ? "bg-gradient-to-br from-blue-700 to-blue-500"
             : veiculosMode ? "bg-gradient-to-br from-cyan-700 to-cyan-500"
             : servicosMode ? "bg-gradient-to-br from-purple-700 to-purple-500"
             : fretesMode   ? "bg-gradient-to-br from-yellow-600 to-amber-500"
             : viagensMode  ? "bg-gradient-to-br from-emerald-700 to-emerald-500"
             : "bg-gradient-to-br from-zinc-700 to-zinc-900",
    label: imoveisMode  ? "Imóveis"
          : veiculosMode ? "Veículos"
          : servicosMode ? "Serviços"
          : fretesMode   ? "Fretes & Mudanças"
          : viagensMode  ? "Viagens & Turismo"
          : "Anunciante",
  };
  const SegIcon = imoveisMode ? Building2 : veiculosMode ? Car : servicosMode ? Briefcase : fretesMode ? Truck : viagensMode ? Plane : Sparkles;

  const FILTER_TABS = [
    { key: "all" as const,      label: "Todos",         count: stats.total    },
    { key: "pending" as const,  label: "🔒 Pendentes",  count: stats.pending  },
    { key: "unlocked" as const, label: "✓ Desbloqueados",count: stats.unlocked},
    { key: "favoritos" as const,label: "⭐ Favoritos",  count: stats.favs     },
  ];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0D0F12] animate-fade-in">

      {/* ── Header com gradiente do segmento ── */}
      <div className={cn(seg.gradient, "px-6 pt-10 pb-8")}>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/70 hover:text-white text-xs font-bold uppercase tracking-widest mb-5 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar ao Menu
        </button>

        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/10 p-0.5 border border-white/20 overflow-hidden shadow-md shrink-0 flex items-center justify-center">
            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="w-full h-full object-cover rounded-xl" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Central de Mensagens</h1>
            <p className="text-white/70 text-sm font-medium mt-0.5">
              {seg.label} · {stats.total} contato{stats.total !== 1 ? "s" : ""} recebido{stats.total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Saldo em destaque */}
        <div className="mt-5 flex items-center gap-3 bg-white/10 border border-white/20 rounded-2xl px-4 py-3">
          <Coins className="w-5 h-5 text-white/80 shrink-0" />
          <div>
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider">{walletMode ? "Saldo da Carteira" : "Saldo disponível"}</p>
            {walletMode ? (
              <p className="text-white text-2xl font-black leading-none">{saldoLabel}</p>
            ) : (
              <p className="text-white text-2xl font-black leading-none">{creditBalance} <span className="text-sm font-bold text-white/70">créditos</span></p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        <CommissionUnlockNotice />

        {/* ── KPI Dashboard ── */}
        {!isLoading && stats.total > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Recebidos", value: stats.total,    icon: Activity,   color: "text-white",       bg: "bg-zinc-700"         },
              { label: "Pendentes",       value: stats.pending,  icon: Lock,       color: "text-amber-400",   bg: "bg-amber-500/10"     },
              { label: "Desbloqueados",   value: stats.unlocked, icon: Unlock,     color: "text-emerald-400", bg: "bg-emerald-500/10"   },
              { label: "Favoritos",       value: stats.favs,     icon: Star,       color: "text-yellow-400",  bg: "bg-yellow-500/10"    },
            ].map(k => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl p-4 flex items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", k.bg)}>
                    <Icon className={cn("h-5 w-5", k.color)} />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-[#F5F7FA]">{k.value}</div>
                    <div className="text-[11px] text-[#A7B0BE] mt-0.5">{k.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}


        {/* ── Search + Filtros ── */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A7B0BE] pointer-events-none" />
            <Input
              placeholder="Buscar por nome, anúncio, mensagem ou cidade..."
              className="pl-10 bg-[#1B1F24] border-[#2A3038] text-[#F5F7FA] placeholder:text-[#A7B0BE]/50 rounded-xl h-11"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border whitespace-nowrap",
                  activeFilter === tab.key
                    ? "bg-[#FF6A00] text-white border-[#FF6A00] shadow-sm shadow-[#FF6A00]/30"
                    : "bg-[#1B1F24] text-[#A7B0BE] border-[#2A3038] hover:border-[#FF6A00]/30 hover:text-white"
                )}
              >
                {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* ── Lead List ── */}
        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
          </div>
        ) : filteredIntentions.length === 0 ? (
          <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-14 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
              <MessageSquare className="w-8 h-8 text-[#A7B0BE]" />
            </div>
            <h3 className="text-lg font-black text-[#F5F7FA] uppercase">
              {stats.total === 0 ? "Nenhuma mensagem ainda" : "Nenhum resultado"}
            </h3>
            <p className="text-sm text-[#A7B0BE] max-w-md mx-auto">
              {stats.total === 0
                ? 'Quando alguém clicar em "Estou Interessado" ou "WhatsApp" em um dos seus anúncios, aparecerá aqui.'
                : "Tente outro filtro ou pesquisa."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredIntentions.map((lead) => {
              const isUnlocked = lead.status === "unlocked";
              // Fretes/Viagens: custo é a cotação em R$ (null = ainda carregando; o
              // banco decide e cobra de qualquer forma). Demais: créditos fixos.
              const isDynamicMode = fretesMode || viagensMode;
              const quoteCents = isDynamicMode ? (dynamicQuotes[lead.listing_id] ?? null) : null;
              const leadCost   = isDynamicMode ? (quoteCents != null ? quoteCents / 100 : null) : costForLead(lead);
              const hasEnough  = leadCost == null ? true : creditBalance >= leadCost;
              const isFav      = favorites.has(lead.id);
              const ITypeIcon  = INTEREST_ICON[lead.interest_type] || MessageSquare;

              const ModuleIcon = lead.listing_module === "real_estate" ? Building2
                : lead.listing_module === "product"   ? Package
                : lead.listing_module === "services"  ? Briefcase
                : lead.listing_module === "freight"   ? Truck
                : lead.listing_module === "travel"    ? Plane
                : Car;
              const moduleLabel = lead.listing_module === "real_estate" ? "Imóvel"
                : lead.listing_module === "product"   ? "Produto"
                : lead.listing_module === "services"  ? "Serviço"
                : lead.listing_module === "freight"   ? "Frete"
                : lead.listing_module === "travel"    ? "Viagem"
                : "Veículo";

              return (
                <div
                  key={lead.id}
                  className={cn(
                    "rounded-2xl border overflow-hidden flex flex-col transition-all hover:shadow-xl hover:shadow-black/30",
                    isUnlocked
                      ? "bg-emerald-950/20 border-emerald-700/30"
                      : "bg-amber-950/20 border-amber-700/30"
                  )}
                >
                  {/* Top color stripe */}
                  <div className={cn("h-0.5", isUnlocked ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-amber-500 to-amber-400")} />

                  {/* Card header */}
                  <div className="p-4 flex items-center gap-3">
                    {/* Avatar */}
                    <div className={cn(
                      "h-11 w-11 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 shadow-sm",
                      isUnlocked ? "bg-emerald-600" : "bg-amber-600"
                    )}>
                      {isUnlocked ? getInitials(lead.visitor_name) : "?"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("font-bold text-[14px]", isUnlocked ? "text-emerald-200" : "text-amber-200")}>
                          {isUnlocked ? (lead.visitor_name || "Visitante") : maskName(lead.visitor_name)}
                        </span>
                        <Badge className={cn("text-[10px] border-0 px-2 py-0 font-bold", isUnlocked ? "bg-emerald-500/30 text-emerald-300" : "bg-amber-500/30 text-amber-300")}>
                          {isUnlocked ? "✓ Desbloqueado" : "🔒 Pendente"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ITypeIcon className={cn("h-3 w-3 shrink-0", isUnlocked ? "text-emerald-500" : "text-amber-500")} />
                        <span className={cn("text-[10px] font-semibold", isUnlocked ? "text-emerald-500" : "text-amber-500")}>
                          {INTEREST_TYPE_LABELS[lead.interest_type as keyof typeof INTEREST_TYPE_LABELS] || lead.interest_type}
                        </span>
                        <span className="text-[10px] text-[#A7B0BE]">· {timeAgo(lead.created_at)}</span>
                      </div>
                    </div>

                    {/* Favorite */}
                    <button
                      onClick={e => toggleFavorite(lead.id, e)}
                      className={cn("shrink-0 p-1.5 rounded-lg transition-colors", isFav ? "text-yellow-400" : "text-[#A7B0BE]/30 hover:text-yellow-400")}
                    >
                      <Star className={cn("h-4 w-4", isFav && "fill-current")} />
                    </button>
                  </div>

                  {/* Location */}
                  {(lead.city || lead.region) && (
                    <div className={cn("px-4 pb-2 flex items-center gap-1.5 text-xs", isUnlocked ? "text-emerald-400" : "text-amber-400")}>
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[lead.city, lead.region].filter(Boolean).join(", ")}
                    </div>
                  )}

                  {/* Phone (unlocked only) */}
                  {isUnlocked && lead.visitor_phone && (
                    <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-emerald-300">
                      <Phone className="h-3 w-3 shrink-0" />
                      {lead.visitor_phone}
                    </div>
                  )}
                  {!isUnlocked && lead.visitor_phone && (
                    <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-amber-400/50">
                      <Phone className="h-3 w-3 shrink-0" />
                      {maskPhone(lead.visitor_phone)}
                    </div>
                  )}

                  {/* Listing info */}
                  <div className={cn("mx-4 mb-3 p-3 rounded-xl border flex gap-3", isUnlocked ? "bg-emerald-950/40 border-emerald-800/30" : "bg-amber-950/40 border-amber-800/30")}>
                    <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-[#14171B] border border-[#2A3038] flex items-center justify-center">
                      {lead.listing_image_url ? (
                        <img src={lead.listing_image_url} alt="" className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <ModuleIcon className="h-6 w-6 text-[#A7B0BE]/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[10px] font-black uppercase tracking-wider mb-0.5", isUnlocked ? "text-emerald-500" : "text-amber-500")}>
                        {moduleLabel}
                      </p>
                      <p className={cn("text-sm font-bold line-clamp-2", isUnlocked ? "text-emerald-200" : "text-amber-200")}>
                        {lead.listing_title || moduleLabel}
                      </p>
                    </div>
                  </div>

                  {/* Message preview */}
                  {isUnlocked && lead.visitor_message ? (
                    <p className="mx-4 mb-3 text-xs italic leading-relaxed text-emerald-200/70 bg-emerald-950/30 border border-emerald-800/20 rounded-lg p-3 whitespace-pre-line">
                      "{lead.visitor_message}"
                    </p>
                  ) : !isUnlocked && stripContactEmail(lead.visitor_message) ? (
                    <p className="mx-4 mb-3 text-xs italic leading-relaxed text-amber-200/60 bg-amber-950/30 border border-amber-800/20 rounded-lg p-3 whitespace-pre-line">
                      "{stripContactEmail(lead.visitor_message)}"
                    </p>
                  ) : !isUnlocked && lead.masked_preview ? (
                    <p className="mx-4 mb-3 text-xs font-mono text-center text-amber-500/50 border border-dashed border-amber-700/30 rounded-lg p-3 bg-black/10">
                      {lead.masked_preview}
                    </p>
                  ) : null}


                  {/* Balance indicator */}
                  <div className={cn("mx-4 mb-3 flex items-center justify-between px-3 py-2.5 rounded-xl border", hasEnough ? "bg-emerald-950/30 border-emerald-700/30" : "bg-red-950/30 border-red-700/30")}>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest flex items-center gap-1", hasEnough ? "text-emerald-400" : "text-red-400")}>
                      <Coins className="h-3.5 w-3.5" /> {walletMode ? "Saldo da carteira" : "Saldo atual"}
                    </span>
                    <span className={cn("text-xl font-black", hasEnough ? "text-emerald-300" : "text-red-400")}>
                      {walletMode ? saldoLabel : `${creditBalance} cr`}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="px-4 pb-4 space-y-2">
                    {!isUnlocked ? (
                      <Button
                        onClick={() => handleUnlock(lead.id)}
                        className="w-full h-11 bg-emerald-700 hover:bg-emerald-600 text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-emerald-900/30"
                      >
                        <Unlock className="w-4 h-4" />
                        {isDynamicMode
                          ? (quoteCents != null ? `Desbloquear (−${centsToBRL(quoteCents)})` : "Desbloquear")
                          : `Desbloquear (−${leadCost} cr)`}
                      </Button>
                    ) : (
                      lead.visitor_phone && (
                        <Button
                          onClick={() => handleCallVisitor(lead)}
                          className="w-full h-11 bg-zhiq-teal hover:bg-zhiq-green text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl"
                        >
                          <MessageSquare className="w-4 h-4" /> Contatar via WhatsApp
                        </Button>
                      )
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(lead.id)}
                      className="w-full h-9 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 font-black text-[10px] uppercase gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
