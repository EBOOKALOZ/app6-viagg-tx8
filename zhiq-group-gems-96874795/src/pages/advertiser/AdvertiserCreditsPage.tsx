import React, { useState, useMemo } from "react";
import {
  CreditCard,
  Plus,
  History,
  Star,
  ShieldCheck,
  Zap,
  CheckCircle2,
  PackageCheck,
  Loader2,
  ArrowRight,
  Building2,
  CarFront,
  Briefcase,
  Truck,
  ShoppingBag,
  Sparkles,
  Coins,
  TrendingDown,
  Eye,
  EyeOff,
  Plane,
  MousePointer,
  MessageCircle,
  TrendingUp,
  Lock,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Megaphone,
  ChevronRight,
  Award,
  RefreshCw,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useRealEstatePackages } from "@/hooks/useRealEstatePackages";
import { useMerchantCredits } from "@/hooks/useMerchantCredits";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";
import { CREDIT_EVENT_LABELS } from "@/lib/credits/creditPricing";
import { useNavigate, useLocation } from "react-router-dom";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RealEstateCreditReportCard } from "@/components/real-estate/RealEstateCreditReportCard";
import { VehicleCreditReportCard } from "@/components/vehicle/VehicleCreditReportCard";
import { ServiceCreditReportCard } from "@/components/services/ServiceCreditReportCard";
import { FreightCreditReportCard } from "@/components/freight/FreightCreditReportCard";
import { TravelCreditReportCard } from "@/components/travel/TravelCreditReportCard";
import { PromotionPlansGrid, PROFILE_MODULE } from "@/components/promotion/PromotionPlansGrid";

// ── Per-segment metadata ─────────────────────────────────────────────────────
const SEGMENT_META: Record<string, { label: string; icon: any; color: string; bgColor: string; borderColor: string }> = {
  imoveis:  { label: "Imóveis",           icon: Building2,  color: "text-blue-400",    bgColor: "bg-blue-500/10",    borderColor: "border-blue-500/20"    },
  veiculos: { label: "Veículos",          icon: CarFront,   color: "text-cyan-400",    bgColor: "bg-cyan-500/10",    borderColor: "border-cyan-500/20"    },
  servicos: { label: "Serviços",          icon: Briefcase,  color: "text-purple-400",  bgColor: "bg-purple-500/10",  borderColor: "border-purple-500/20"  },
  fretes:   { label: "Fretes & Mudanças", icon: Truck,      color: "text-yellow-400",  bgColor: "bg-yellow-500/10",  borderColor: "border-yellow-500/20"  },
  viagens:  { label: "Viagens & Turismo", icon: Plane,      color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  mercado:  { label: "Mercado",           icon: Sparkles,   color: "text-[#FF6A00]",   bgColor: "bg-[#FF6A00]/10",   borderColor: "border-[#FF6A00]/20"   },
};

export default function AdvertiserCreditsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ── Mode detection — UNCHANGED ──────────────────────────────────────────────
  const isImoveis  = window.location.pathname.startsWith("/anunciante/imoveis");
  const isVeiculos = window.location.pathname.startsWith("/anunciante/veiculos");
  const isServicos = window.location.pathname.startsWith("/anunciante/servicos");
  const isFretes   = window.location.pathname.startsWith("/anunciante/fretes");
  const isViagens  = window.location.pathname.startsWith("/anunciante/viagens");
  const isSpecialModule = isImoveis || isVeiculos || isServicos || isFretes || isViagens;

  const segKey = isImoveis ? "imoveis" : isVeiculos ? "veiculos" : isServicos ? "servicos"
    : isFretes ? "fretes" : isViagens ? "viagens" : "mercado";
  const seg = SEGMENT_META[segKey];

  // ── Rule costs — UNCHANGED ───────────────────────────────────────────────────
  const { data: ruleCosts = { click: 6, interest: 9, whatsapp: 12 } } = useQuery({
    queryKey: ["credit-rule-costs", isVeiculos ? "vehicle" : isServicos ? "service" : isFretes ? "freight" : isViagens ? "travel" : "real_estate"],
    enabled: isSpecialModule,
    queryFn: async () => {
      const s = isVeiculos ? "vehicle" : isServicos ? "service" : isFretes ? "freight" : isViagens ? "travel" : "real_estate";
      const codes = [`${s}_listing_click`, `${s}_interest_click`, `${s}_unlock_whatsapp`];
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("feature_code, credits_cost")
        .in("feature_code", codes);
      const out = { click: 6, interest: 9, whatsapp: 12 };
      (data || []).forEach((r: any) => {
        const c = Number(r.credits_cost);
        if (!Number.isFinite(c)) return;
        if (r.feature_code === `${s}_listing_click`)    out.click     = c;
        else if (r.feature_code === `${s}_interest_click`) out.interest = c;
        else if (r.feature_code === `${s}_unlock_whatsapp`) out.whatsapp = c;
      });
      return out;
    },
  });

  const { data: packages, isLoading: packagesLoading } = useRealEstatePackages();
  const merchantCredits = useMerchantCredits();
  const merchantLoading = merchantCredits.isLoading;
  const { ledger } = useAdvertiserCredits();

  // ── consumo — todos os débitos do ledger (todos os segmentos) ───────────────
  const consumo = useMemo(
    () => (ledger || []).filter((e: any) => e.entry_type === "debit"),
    [ledger]
  );

  // ── ledgerPurchases — créditos adicionados via ledger (módulos especiais) ───
  const ledgerPurchases = useMemo(
    () => (ledger || []).filter((e: any) => e.entry_type === "credit"),
    [ledger]
  );

  // ── aquisicoes — UNCHANGED ───────────────────────────────────────────────────
  const storeId = merchantCredits.storeId;
  const { data: aquisicoes = [] } = useQuery({
    queryKey: ["advertiser-credit-purchases", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await (supabase.from("credit_purchases") as any)
        .select("id, product_name, amount_paid, credits_granted, status, created_at")
        .eq("store_id", storeId)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  // ── Hide/show logic — UNCHANGED ──────────────────────────────────────────────
  const HIDDEN_KEY = "viagg_hidden_credit_purchases";
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"); } catch { return []; }
  });
  const [showHidden, setShowHidden] = useState(false);
  const hideCard = (id: string) => {
    setHiddenIds((prev) => {
      const next = [...prev, id];
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const unhideAll = () => {
    setHiddenIds([]);
    try { localStorage.removeItem(HIDDEN_KEY); } catch { /* ignore */ }
  };

  // ── labelFor — UNCHANGED ─────────────────────────────────────────────────────
  const labelFor = (code: string) =>
    (CREDIT_EVENT_LABELS as Record<string, string>)[code] ||
    ({
      package_purchase: "Compra de pacote",
      subscription_activation: "Assinatura ativada",
      offer_accept: "Aceite de oferta",
      manual: "Ajuste manual",
    } as Record<string, string>)[code] ||
    code;

  const hiddenCount = aquisicoes.filter((e: any) => hiddenIds.includes(e.id)).length;
  const visibleAquisicoes = aquisicoes.filter((e: any) => showHidden || !hiddenIds.includes(e.id));

  // ── Package filters — UNCHANGED ──────────────────────────────────────────────
  const HIDDEN_VEHICLE_PACKAGE_SLUGS = ['venda-rapida-veiculos', 'turbo-veiculos', 'revenda-pro-veiculos'];
  const realEstatePkgs = packages?.filter(p => p.category === 'real_estate') || [];
  const vehiclePkgs    = packages?.filter(p => p.category === 'vehicles' && !HIDDEN_VEHICLE_PACKAGE_SLUGS.includes(p.slug)) || [];
  const servicePkgs    = packages?.filter(p => p.category === 'services') || [];
  const freightPkgs    = packages?.filter(p => p.category === 'freight') || [];
  const travelPkgs     = packages?.filter(p => p.category === 'travel') || [];

  // ── productPkgs — UNCHANGED ──────────────────────────────────────────────────
  const productPkgs = merchantCredits.products.filter(p => p.is_active).map(p => ({
    id: p.id,
    name: p.name,
    package_type: p.type === 'pacote' ? 'Exposição Avulsa'
      : p.type === 'mensal' ? 'Assinatura Mensal'
      : p.type === 'semestral' ? 'Assinatura Semestral'
      : p.type === 'anual' ? 'Assinatura Anual'
      : 'Assinatura ' + p.type,
    credits_amount: p.credits_base,
    bonus_credits: p.credits_bonus,
    price_brl: p.price_brl,
    badge_text: p.badge_text,
    features_json: (p.features_json && p.features_json.length > 0)
      ? p.features_json
      : (p.description ? [p.description] : ["Exposição Premium", "Destaque no Marketplace"]),
    is_recommended: p.is_recommended,
    button_label: p.action_label || "ADQUIRIR AGORA",
    category: 'products'
  }));

  // ── History tab state ─────────────────────────────────────────────────────────
  const [historyTab, setHistoryTab] = useState<'all' | 'purchases' | 'consumption'>('all');

  // ── Stats — adaptados por segmento ───────────────────────────────────────────
  const totalCreditsPurchased = useMemo(() => {
    if (isSpecialModule) {
      return ledgerPurchases.reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0);
    }
    return aquisicoes.reduce((s: number, a: any) => s + (Number(a.credits_granted) || 0), 0);
  }, [isSpecialModule, ledgerPurchases, aquisicoes]);

  const totalBRLInvested = useMemo(
    () => aquisicoes.reduce((s: number, a: any) => s + (Number(a.amount_paid) || 0), 0),
    [aquisicoes]
  );

  const totalConsumed = useMemo(
    () => consumo.reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0),
    [consumo]
  );

  // ── Packages for comparison table ────────────────────────────────────────────
  const currentPkgsForComparison = isImoveis ? realEstatePkgs
    : isVeiculos ? vehiclePkgs
    : isServicos ? servicePkgs
    : isFretes ? freightPkgs
    : isViagens ? travelPkgs
    : productPkgs;

  // ── Interleaved history — todos os segmentos ──────────────────────────────────
  type HistItem = {
    id: string; type: 'purchase' | 'consumption'; date: Date;
    label: string; amount: number; brl?: number;
    balanceAfter?: number; description?: string;
  };
  const allHistoryItems = useMemo((): HistItem[] => {
    if (isSpecialModule) {
      // Módulos especiais: usar ledger completo
      return (ledger || []).map((e: any): HistItem => ({
        id: e.id,
        type: e.entry_type === 'credit' ? 'purchase' : 'consumption',
        date: new Date(e.created_at),
        label: e.entry_type === 'credit'
          ? (e.description || "Créditos adicionados")
          : labelFor(e.reason_code),
        amount: Math.abs(Number(e.amount || 0)),
        balanceAfter: e.balance_after,
        description: e.description,
      })).sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    // Mercado: aquisicoes (purchases) + ledger debits (consumption)
    const purchases: HistItem[] = aquisicoes
      .filter((e: any) => !hiddenIds.includes(e.id))
      .map((e: any) => ({
        id: e.id, type: 'purchase' as const,
        date: new Date(e.created_at),
        label: e.product_name || "Pacote de créditos",
        amount: Number(e.credits_granted || 0),
        brl: Number(e.amount_paid || 0),
      }));
    const consumptions: HistItem[] = consumo.map((e: any) => ({
      id: e.id, type: 'consumption' as const,
      date: new Date(e.created_at),
      label: labelFor(e.reason_code),
      amount: Math.abs(Number(e.amount || 0)),
      balanceAfter: e.balance_after,
      description: e.description,
    }));
    return [...purchases, ...consumptions].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [aquisicoes, consumo, ledger, isSpecialModule, hiddenIds]);

  // ── Counts para abas de histórico ─────────────────────────────────────────────
  const purchasesCount  = isSpecialModule ? ledgerPurchases.length : aquisicoes.length;
  const consumptionCount = consumo.length;
  const allCount         = allHistoryItems.length;

  // ────────────────────────────────────────────────────────────────────────────
  // renderSection — identico para todos os segmentos
  // ────────────────────────────────────────────────────────────────────────────
  const renderSection = (title: string, subtitle: string, tagline: string | null, icon: any, pkgs: any[], recurring = false) => {
    const Icon = icon;
    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
              <Icon className="w-6 h-6 text-[#FF6A00]" />
            </div>
            <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase">{title}</h2>
          </div>
          <div className="ml-16 space-y-1">
            <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em]">{subtitle}</p>
            {tagline && (
              <p className="text-[#FF6A00] font-black uppercase text-[10px] tracking-widest bg-[#FF6A00]/10 w-fit px-3 py-1 rounded-lg border border-[#FF6A00]/20">
                {tagline}
              </p>
            )}
          </div>
        </div>

        {pkgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-[#1B1F24] rounded-[32px] border border-dashed border-[#2A3038] text-center space-y-4">
            <p className="text-[#A7B0BE] font-black uppercase tracking-widest text-[10px]">Novos pacotes de {title.toLowerCase()} em breve</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pkgs.map((p) => {
              const totalCredits = (p.credits_amount || 0) + (p.bonus_credits || 0);
              const costPerCredit = (p.price_brl > 0 && totalCredits > 0) ? (p.price_brl / totalCredits) : 0;
              const estWhatsApp = (isSpecialModule && totalCredits > 0 && ruleCosts.whatsapp > 0)
                ? Math.floor(totalCredits / ruleCosts.whatsapp) : 0;
              const estClick = (isSpecialModule && totalCredits > 0 && ruleCosts.click > 0)
                ? Math.floor(totalCredits / ruleCosts.click) : 0;

              return (
                <Card key={p.id} className={cn(
                  "relative border-2 transition-all duration-500 rounded-[32px] overflow-hidden flex flex-col group/card hover:translate-y-[-8px] min-h-[700px]",
                  p.is_recommended
                    ? "border-[#FF6A00] bg-[#1B1F24] ring-4 ring-[#FF6A00]/10 shadow-2xl shadow-black/40"
                    : "border-[#2A3038] bg-[#1B1F24] shadow-xl shadow-black/30 hover:border-[#FF6A00]/30"
                )}>
                  {p.badge_text && (
                    <div className="absolute top-0 right-0 z-10">
                      <div className="bg-orange-600 text-white text-[9px] font-black px-5 py-2 rounded-bl-[24px] uppercase tracking-widest">
                        {p.badge_text}
                      </div>
                    </div>
                  )}

                  <CardHeader className="p-10 pb-4 flex flex-col items-center text-center space-y-6">
                    <div className={cn(
                      "w-28 h-28 rounded-[35px] flex items-center justify-center transition-all duration-500 overflow-hidden bg-white group-hover/card:scale-105",
                      p.is_recommended ? "ring-4 ring-orange-500/20 shadow-xl" : "shadow-sm border border-zinc-100"
                    )}>
                      <img src="/assets/brand/logo-advertiser.jpg" alt="Logo" className="w-full h-full object-contain p-1 rounded-[30px]" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-[32px] font-black uppercase tracking-tight text-[#F5F7FA] leading-none">{p.name}</CardTitle>
                      <p className="text-[13px] text-[#A7B0BE] font-black uppercase tracking-widest">
                        {recurring ? 'Plano Mensal'
                         : p.package_type === 'standard' || p.package_type === 'STANDARD' ? 'Padrão'
                         : p.package_type === 'real_estate' || p.package_type === 'REAL_ESTATE' ? 'Imóveis'
                         : p.package_type === 'vehicles' || p.package_type === 'VEHICLES' ? 'Veículos'
                         : p.package_type === 'services' || p.package_type === 'SERVICES' ? 'Serviços'
                         : p.package_type === 'freight' || p.package_type === 'FREIGHT' ? 'Fretes'
                         : p.package_type}
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent className="p-10 pt-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-8">
                      <div className="space-y-1 text-center">
                        <p className="text-[47px] font-black text-[#F5F7FA] tracking-tighter">
                          {p.price_brl === 0 ? "Grátis" : formatCurrencyBRL(p.price_brl)}
                          {recurring && p.price_brl !== 0 && (
                            <span className="text-xl text-[#A7B0BE] font-bold tracking-normal">/mês</span>
                          )}
                        </p>
                        <p className="text-[14px] text-white font-black uppercase tracking-widest bg-gradient-to-br from-[#FF6A00] to-[#E55A00] py-3 px-4 text-center rounded-[20px] border border-orange-700 shadow-lg shadow-orange-900/30 mt-4 flex flex-col items-center gap-1">
                          <span className="flex items-center gap-2">
                            <Zap className="w-5 h-5 fill-current text-yellow-200" />
                            <span className="text-white">{p.credits_amount} Créditos de Comunicação</span>
                          </span>
                          {(p.bonus_credits || 0) > 0 && (
                            <span className="text-yellow-200 text-[13px]">+ {p.bonus_credits} Créditos Bônus</span>
                          )}
                          <span className="text-[12px] text-white/80 normal-case tracking-wider">acesso para seus clientes</span>
                        </p>

                        {costPerCredit > 0 && (
                          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                            <span className="text-[11px] text-[#A7B0BE] bg-[#2A3038] px-3 py-1.5 rounded-lg font-bold">
                              R$ {costPerCredit.toFixed(2)}/crédito
                            </span>
                            {isSpecialModule && estWhatsApp > 0 && (
                              <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg font-bold border border-emerald-500/20">
                                ~{estWhatsApp} desbloqueios
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="space-y-6 py-8 border-t border-[#2A3038]">
                        <p className="text-[16px] text-[#A7B0BE] font-bold uppercase tracking-widest ml-1">Benefícios Incluídos</p>
                        <ul className="space-y-5">
                          {Array.isArray(p.features_json) && p.features_json.map((feature: string, i: number) => (
                            <li key={i} className="flex items-start gap-4 text-[16px] font-bold text-[#A7B0BE] leading-tight uppercase tracking-tight">
                              <div className="p-1.5 bg-[#22C55E]/10 rounded-xl">
                                <CheckCircle2 className="w-5 h-5 text-[#22C55E] shrink-0" />
                              </div>
                              <span className="pt-1">{feature}</span>
                            </li>
                          ))}
                        </ul>

                        {isSpecialModule && totalCredits > 0 && (
                          <div className="bg-[#0D0F12] rounded-2xl p-4 space-y-3 border border-[#2A3038] mt-2">
                            <p className="text-[10px] text-[#A7B0BE] font-black uppercase tracking-widest">Estimativa de uso</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="text-center bg-[#1B1F24] rounded-xl py-3">
                                <p className="text-[#FF6A00] font-black text-xl">{estClick}</p>
                                <p className="text-[9px] text-[#A7B0BE] uppercase tracking-wider mt-0.5">cliques</p>
                              </div>
                              <div className="text-center bg-[#1B1F24] rounded-xl py-3">
                                <p className="text-emerald-400 font-black text-xl">{estWhatsApp}</p>
                                <p className="text-[9px] text-[#A7B0BE] uppercase tracking-wider mt-0.5">desbloqueios</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      className={cn(
                        "w-full h-16 rounded-[24px] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-2xl gap-3 group/btn mt-8",
                        p.is_recommended
                          ? "bg-yellow-400 text-zinc-900 hover:bg-yellow-300 shadow-yellow-400/30"
                          : "bg-yellow-400 text-zinc-900 hover:bg-yellow-300 shadow-yellow-400/20 border border-yellow-500/40"
                      )}
                      onClick={() => p.category === 'products'
                        ? navigate(`/anunciante/checkout/${p.id}${merchantCredits.storeId ? `?storeId=${merchantCredits.storeId}` : ''}`)
                        : navigate(`/anunciante/checkout/${p.id}${isImoveis ? '?ret=imoveis' : isVeiculos ? '?ret=veiculos' : isServicos ? '?ret=servicos' : isFretes ? '?ret=fretes' : isViagens ? '?ret=viagens' : ''}`)}
                    >
                      {p.button_label || "ADQUIRIR AGORA"} <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-2 transition-all" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Comparison table — idêntica para todos os segmentos ──────────────────────
  const renderComparisonTable = (pkgs: any[]) => {
    if (pkgs.length < 2) return null;
    const pkgsM = pkgs.map((p) => {
      const total = (p.credits_amount || 0) + (p.bonus_credits || 0);
      const cpp = (p.price_brl > 0 && total > 0) ? p.price_brl / total : 0;
      return { ...p, totalCredits: total, costPerCredit: cpp };
    });
    const maxCpp = Math.max(...pkgsM.filter(p => p.costPerCredit > 0).map(p => p.costPerCredit));
    const publicoFor = (p: any, idx: number, len: number) => {
      if (p.is_recommended) return "Recomendado pela plataforma";
      if (len <= 1) return "Todos os perfis";
      if (idx === 0) return "Iniciantes";
      if (idx === len - 1) return "Avançados / Empresas";
      return "Em crescimento";
    };
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
            <BarChart2 className="w-6 h-6 text-[#FF6A00]" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase">Comparativo dos Pacotes</h2>
            <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">
              {seg.label} — escolha a melhor opção para o seu perfil
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-[24px] border border-[#2A3038] bg-[#1B1F24] shadow-xl shadow-black/20">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-[#2A3038]">
                {["Pacote", "Preço", "Créditos", "Custo/crédito", "Economia", "Validade", "Público"].map(h => (
                  <th key={h} className={cn("p-5 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest",
                    h === "Pacote" || h === "Público" ? "text-left" : "text-right",
                    h === "Validade" && "text-center")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A3038]">
              {pkgsM.map((p, idx) => {
                const eco = (maxCpp > 0 && p.costPerCredit > 0 && p.costPerCredit < maxCpp)
                  ? Math.round((1 - p.costPerCredit / maxCpp) * 100) : 0;
                return (
                  <tr key={p.id} className={cn("hover:bg-[#2A3038]/30 transition-colors", p.is_recommended && "bg-[#FF6A00]/5")}>
                    <td className="p-5">
                      <div className="space-y-0.5">
                        <p className="text-sm font-black text-[#F5F7FA]">{p.name}</p>
                        {p.badge_text && (
                          <span className="text-[9px] font-black text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded uppercase tracking-widest">{p.badge_text}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-5 text-right font-black text-[#F5F7FA] text-sm">
                      {p.price_brl === 0 ? "Grátis" : formatCurrencyBRL(p.price_brl)}
                    </td>
                    <td className="p-5 text-right">
                      <p className="font-black text-[#FF6A00]">{p.totalCredits}</p>
                      {(p.bonus_credits || 0) > 0 && <p className="text-[10px] text-yellow-400">+{p.bonus_credits} bônus</p>}
                    </td>
                    <td className="p-5 text-right text-[#A7B0BE] font-bold text-sm">
                      {p.costPerCredit > 0 ? `R$ ${p.costPerCredit.toFixed(2)}` : "—"}
                    </td>
                    <td className="p-5 text-right">
                      {eco > 0
                        ? <span className="text-emerald-400 font-black text-sm bg-emerald-500/10 px-2 py-1 rounded-lg">{eco}% menor</span>
                        : <span className="text-[#A7B0BE] text-sm">—</span>}
                    </td>
                    <td className="p-5 text-center text-[#A7B0BE] text-sm">30 dias</td>
                    <td className="p-5 text-[11px] text-[#A7B0BE]">{publicoFor(p, idx, pkgsM.length)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Seção 2: fluxo adaptado por segmento ─────────────────────────────────────
  const renderPlatformFlow = () => {
    const SegIcon = seg.icon;

    if (isSpecialModule) {
      return (
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#F5F7FA] tracking-tighter uppercase">Como a plataforma trabalha por você</h2>
              <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">
                {seg.label} — entenda o ciclo completo antes de adquirir créditos
              </p>
            </div>
          </div>

          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[32px] p-8 shadow-xl shadow-black/20 overflow-x-auto">
            <div className="flex flex-col md:flex-row items-center gap-4 md:gap-2 justify-between min-w-[560px]">
              {[
                { icon: Megaphone,   label: "Anúncio publicado",   color: "text-[#FF6A00]",  bg: "bg-[#FF6A00]/10"  },
                { icon: Eye,         label: "Cliente visualiza",   color: "text-blue-400",   bg: "bg-blue-500/10"   },
                { icon: Star,        label: "Demonstra interesse", color: "text-yellow-400", bg: "bg-yellow-500/10" },
                { icon: Zap,         label: "Consumo registrado",  color: "text-purple-400", bg: "bg-purple-500/10" },
                { icon: ShoppingBag, label: "Compra do pacote",    color: "text-emerald-400",bg: "bg-emerald-500/10"},
                { icon: Coins,       label: "Débito automático",   color: "text-orange-400", bg: "bg-orange-500/10" },
                { icon: BarChart2,   label: "Histórico atualizado",color: "text-cyan-400",   bg: "bg-cyan-500/10"   },
              ].map((step, idx, arr) => (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center text-center gap-2 flex-1">
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", step.bg)}>
                      <step.icon className={cn("w-6 h-6", step.color)} />
                    </div>
                    <p className="text-[11px] font-black text-[#A7B0BE] uppercase tracking-wide max-w-[72px] leading-tight">{step.label}</p>
                  </div>
                  {idx < arr.length - 1 && <ChevronRight className="w-5 h-5 text-[#2A3038] shrink-0 hidden md:block" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-6 flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-2">
                <p className="text-emerald-300 font-black text-sm uppercase tracking-wide">Sem perder nenhum interessado</p>
                <p className="text-[#C9D2DE] text-[13px] leading-relaxed">
                  Assim que um potencial cliente <strong>navega e clica no seu anúncio</strong>, ele chega até você —
                  <strong> mesmo que você ainda não tenha adquirido um pacote</strong>. Esses créditos ficam
                  <strong> registrados como consumo</strong> e, ao adquirir um pacote, são
                  <strong> descontados automaticamente do seu saldo</strong>. Assim você nunca perde um interessado por falta de crédito.
                </p>
              </div>
            </div>
            <div className="bg-[#1B1F24] border border-[#2A3038] rounded-3xl p-6 flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="space-y-2">
                <p className="text-[#FF6A00] font-black text-sm uppercase tracking-wide">Cobrança só no desbloqueio</p>
                <p className="text-[#C9D2DE] text-[13px] leading-relaxed">
                  <strong>Até você desbloquear o WhatsApp do seu cliente, tudo fica sem cobrança</strong> — o consumo
                  é apenas somado e só <strong>entra na conta no momento do desbloqueio do contato</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Mercado
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#F5F7FA] tracking-tighter uppercase">Como a plataforma trabalha por você</h2>
            <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">
              Mercado — entenda como os créditos impulsionam seus resultados
            </p>
          </div>
        </div>

        <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[32px] p-8 shadow-xl shadow-black/20 overflow-x-auto">
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-2 justify-between min-w-[480px]">
            {[
              { icon: Package,      label: "Cadastro do produto",  color: "text-[#FF6A00]",  bg: "bg-[#FF6A00]/10"  },
              { icon: Megaphone,    label: "Publicação",           color: "text-blue-400",   bg: "bg-blue-500/10"   },
              { icon: Eye,          label: "Visibilidade",         color: "text-yellow-400", bg: "bg-yellow-500/10" },
              { icon: Star,         label: "Cliente interessa",    color: "text-purple-400", bg: "bg-purple-500/10" },
              { icon: MessageCircle,label: "Conexão direta",       color: "text-emerald-400",bg: "bg-emerald-500/10"},
              { icon: Coins,        label: "Negociação & Venda",   color: "text-cyan-400",   bg: "bg-cyan-500/10"   },
            ].map((step, idx, arr) => (
              <React.Fragment key={idx}>
                <div className="flex flex-col items-center text-center gap-2 flex-1">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0", step.bg)}>
                    <step.icon className={cn("w-6 h-6", step.color)} />
                  </div>
                  <p className="text-[11px] font-black text-[#A7B0BE] uppercase tracking-wide max-w-[72px] leading-tight">{step.label}</p>
                </div>
                {idx < arr.length - 1 && <ChevronRight className="w-5 h-5 text-[#2A3038] shrink-0 hidden md:block" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-3xl p-6 flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <p className="text-emerald-300 font-black text-sm uppercase tracking-wide">Visibilidade imediata</p>
              <p className="text-[#C9D2DE] text-[13px] leading-relaxed">
                Seus produtos ficam disponíveis no marketplace assim que publicados.
                Com créditos ativos, <strong>sua exposição é ampliada</strong> para um público qualificado
                e interessado exatamente no que você oferece.
              </p>
            </div>
          </div>
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-3xl p-6 flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <p className="text-[#FF6A00] font-black text-sm uppercase tracking-wide">Controle total do investimento</p>
              <p className="text-[#C9D2DE] text-[13px] leading-relaxed">
                Escolha entre <strong>assinaturas mensais</strong> para visibilidade contínua ou
                <strong> pacotes avulsos</strong> para necessidades pontuais.
                Você decide quando e quanto investir, sem compromissos obrigatórios.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Seção 3: créditos adaptados por segmento ──────────────────────────────────
  const renderCreditRules = () => {
    if (isSpecialModule) {
      return (
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
              <Zap className="w-6 h-6 text-[#FF6A00]" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#F5F7FA] tracking-tighter uppercase">Como funcionam os créditos</h2>
              <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">
                {seg.label} — valores configurados pelo administrador da plataforma
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: MousePointer, cost: ruleCosts.click,    label: "Clique no anúncio",    desc: "Debitado quando um usuário clica e visualiza o seu anúncio.",              color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
              { icon: Star,         cost: ruleCosts.interest, label: "Interesse do cliente", desc: "Debitado quando um usuário clica no botão INTERESSE do seu anúncio.",    color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20"  },
              { icon: MessageCircle,cost: ruleCosts.whatsapp, label: "Desbloqueio WhatsApp", desc: "Debitado quando você desbloqueia o contato direto do cliente interessado.",color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
            ].map((item, i) => (
              <div key={i} className={cn("bg-[#1B1F24] border rounded-3xl p-6 flex flex-col gap-4", item.border)}>
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", item.bg)}>
                  <item.icon className={cn("w-6 h-6", item.color)} />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-4xl font-black", item.color)}>{item.cost}</span>
                    <span className="text-[#A7B0BE] font-bold text-sm">créditos</span>
                  </div>
                  <p className="text-[#F5F7FA] font-black text-sm uppercase tracking-wide mt-1">{item.label}</p>
                </div>
                <p className="text-[#A7B0BE] text-[13px] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-3xl p-7 space-y-5">
            <p className="text-[#FF6A00] font-black text-sm uppercase tracking-wide">Regras gerais — {seg.label}</p>
            <ul className="space-y-3">
              {[
                { icon: CheckCircle2,  color: "text-emerald-400", text: "Divulgação gratuita do seu anúncio — sem custo para estar presente na plataforma." },
                { icon: Zap,           color: "text-[#FF6A00]",   text: "Adquira pacotes de créditos apenas quando precisar, sem assinatura obrigatória." },
                { icon: History,       color: "text-blue-400",    text: "Todos os pacotes possuem validade de 30 dias a partir da data de compra." },
                { icon: ShieldCheck,   color: "text-purple-400",  text: "Proteção automática contra cliques inválidos e tentativas de fraude." },
                { icon: BarChart2,     color: "text-cyan-400",    text: "Todos os consumos ficam registrados no seu painel em detalhe." },
                { icon: Coins,         color: "text-yellow-400",  text: "Créditos descontados automaticamente conforme a utilização dos serviços." },
              ].map((rule, i) => (
                <li key={i} className="flex items-start gap-3 text-[13px] text-[#C9D2DE] leading-relaxed">
                  <rule.icon className={cn("w-4 h-4 shrink-0 mt-0.5", rule.color)} />
                  <span>{rule.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    // Mercado
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
            <Zap className="w-6 h-6 text-[#FF6A00]" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#F5F7FA] tracking-tighter uppercase">Como funcionam os créditos</h2>
            <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">
              Mercado — escolha o modelo que melhor atende seu negócio
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              icon: RefreshCw, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20",
              title: "Assinaturas",
              desc: "Renove automaticamente todo mês. Mantenha visibilidade contínua e previsível no marketplace com créditos sempre disponíveis no ciclo.",
              bullets: ["Renovação automática mensal", "Créditos sempre disponíveis", "Melhor custo-benefício para negócios ativos"],
            },
            {
              icon: Package, color: "text-[#FF6A00]", bg: "bg-[#FF6A00]/10", border: "border-[#FF6A00]/20",
              title: "Pacotes Avulsos",
              desc: "Compre quando precisar, sem compromisso. Ideal para demandas pontuais, sazonalidades ou quando quiser testar o marketplace.",
              bullets: ["Sem assinatura obrigatória", "Validade de 30 dias", "Perfeito para demandas eventuais"],
            },
          ].map((item, i) => (
            <div key={i} className={cn("bg-[#1B1F24] border rounded-3xl p-6 flex flex-col gap-5", item.border)}>
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", item.bg)}>
                <item.icon className={cn("w-6 h-6", item.color)} />
              </div>
              <div className="space-y-2">
                <p className={cn("font-black text-lg uppercase tracking-wide", item.color)}>{item.title}</p>
                <p className="text-[#A7B0BE] text-[13px] leading-relaxed">{item.desc}</p>
              </div>
              <ul className="space-y-2">
                {item.bullets.map((b, j) => (
                  <li key={j} className="flex items-start gap-2 text-[12px] text-[#C9D2DE]">
                    <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="bg-[#1B1F24] border border-[#2A3038] rounded-3xl p-7 space-y-5">
          <p className="text-[#FF6A00] font-black text-sm uppercase tracking-wide">Regras gerais — Mercado</p>
          <ul className="space-y-3">
            {[
              { icon: CheckCircle2, color: "text-emerald-400", text: "Seus produtos ficam visíveis no marketplace assim que publicados, sem custo de publicação." },
              { icon: RefreshCw,    color: "text-[#FF6A00]",   text: "Assinaturas renovam automaticamente e podem ser canceladas a qualquer momento." },
              { icon: History,      color: "text-blue-400",    text: "Pacotes avulsos possuem validade de 30 dias a partir da data de compra." },
              { icon: ShieldCheck,  color: "text-purple-400",  text: "Proteção contra acessos indevidos e monitoramento contínuo das transações." },
              { icon: BarChart2,    color: "text-cyan-400",    text: "Relatórios completos de consumo, alcance e performance disponíveis no painel." },
              { icon: Coins,        color: "text-yellow-400",  text: "Créditos não utilizados dentro da validade são automaticamente encerrados." },
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-3 text-[13px] text-[#C9D2DE] leading-relaxed">
                <rule.icon className={cn("w-4 h-4 shrink-0 mt-0.5", rule.color)} />
                <span>{rule.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // JSX PRINCIPAL
  // ────────────────────────────────────────────────────────────────────────────
  const SegIcon = seg.icon;

  return (
    <div className="space-y-20 animate-in fade-in duration-700 pb-20">

      {/* ═══ 1. CABEÇALHO ════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-gradient-to-br from-[#FF6A00] to-[#E55A00] rounded-2xl shadow-2xl shadow-orange-900/40 shrink-0">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-[#F5F7FA] tracking-tighter uppercase leading-none">
              Gestão e Pacotes
            </h1>
            <div className="flex items-center gap-2">
              <div className={cn("flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border", seg.bgColor, seg.borderColor, seg.color)}>
                <SegIcon className="w-3.5 h-3.5" />
                {seg.label}
              </div>
            </div>
            <p className="text-[#A7B0BE] font-bold text-sm leading-relaxed">
              Potencialize seus anúncios e compre créditos somente quando precisar.
            </p>
          </div>
        </div>

        {!isSpecialModule && (
          <div className="ml-0 md:ml-16 p-5 bg-[#FF6A00]/10 border-l-4 border-[#FF6A00] rounded-r-2xl max-w-2xl">
            <p className="text-[#FF6A00] text-lg font-extrabold tracking-tight leading-tight">
              Adquira os planos que mais atendem seu negócio e mantenha seu contato desbloqueado
            </p>
          </div>
        )}
      </div>

      {/* ═══ 2. COMO A PLATAFORMA TRABALHA (todos os segmentos) ═════════════════ */}
      {renderPlatformFlow()}

      {/* ═══ 3. COMO FUNCIONAM OS CRÉDITOS (todos os segmentos) ════════════════ */}
      {renderCreditRules()}

      {/* ═══ 4. PACOTES ══════════════════════════════════════════════════════════ */}
      {(packagesLoading || merchantLoading) ? (
        <div className="flex flex-col items-center justify-center py-32 bg-[#1B1F24] rounded-[32px] border border-[#2A3038] shadow-xl shadow-black/30">
          <Loader2 className="w-12 h-12 text-[#FF6A00] animate-spin" />
          <p className="mt-4 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest">Sincronizando Ofertas...</p>
        </div>
      ) : (
        <div className="space-y-24">
          {/* 1. Pacotes de Serviços (Créditos de Comunicação e Desbloqueio) */}
          {isImoveis
            ? renderSection("1. Pacotes de Serviços (Imóveis)", "Plano mensal — renove todo mês", null, Building2, realEstatePkgs, true)
            : isVeiculos
              ? renderSection("1. Pacotes de Serviços (Veículos)", "Compre quando precisar", null, CarFront, vehiclePkgs, false)
              : isServicos
                ? renderSection("1. Pacotes de Serviços (Serviços)", "Compre quando precisar", null, Briefcase, servicePkgs, false)
                : isFretes
                  ? renderSection("1. Pacotes de Serviços (Fretes)", "Compre quando precisar", null, Truck, freightPkgs, false)
                  : isViagens
                    ? renderSection("1. Pacotes de Serviços (Viagens)", "Compre quando precisar", null, Plane, travelPkgs, false)
                    : renderSection("1. Pacotes de Serviços (Mercado)", "Créditos de Comunicação", "PACOTES CONFIGURADOS PELO ADMINISTRADOR", Sparkles, productPkgs)}

          {/* 2. Pacotes de Anúncios (Promoção e Impulsionamento) */}
          <div className="pt-12 border-t border-[#2A3038]/80">
            <PromotionPlansGrid
              profileType={segKey === "mercado" ? "produtos" : segKey as any}
              listingModule={PROFILE_MODULE[segKey === "mercado" ? "produtos" : segKey] || "travel"}
              inline={true}
              showHeader={true}
              title="2. Pacotes de Anúncios e Impulsionamento"
            />
          </div>
        </div>
      )}

      {/* ═══ 5. COMPARATIVO DOS PACOTES (todos os segmentos) ════════════════════ */}
      {!packagesLoading && !merchantLoading && renderComparisonTable(currentPkgsForComparison)}

      {/* ═══ 6. RELATÓRIO DE CRÉDITOS ════════════════════════════════════════════ */}
      {isImoveis  && <RealEstateCreditReportCard />}
      {isVeiculos && <VehicleCreditReportCard />}
      {isServicos && <ServiceCreditReportCard />}
      {isFretes   && <FreightCreditReportCard />}
      {isViagens  && <TravelCreditReportCard />}

      {/* ═══ 7. HISTÓRICO COMPLETO (todos os segmentos) ══════════════════════════ */}
      <section className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
            <History className="w-6 h-6 text-[#FF6A00]" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase">Histórico Completo</h2>
            <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">
              {seg.label} — todas as movimentações de crédito
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all',         label: 'Tudo',     count: allCount          },
            { key: 'purchases',   label: 'Compras',  count: purchasesCount    },
            { key: 'consumption', label: 'Consumos', count: consumptionCount  },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setHistoryTab(tab.key as 'all' | 'purchases' | 'consumption')}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all border",
                historyTab === tab.key
                  ? "bg-[#FF6A00] text-white border-[#FF6A00] shadow-lg shadow-orange-900/30"
                  : "bg-[#1B1F24] text-[#A7B0BE] border-[#2A3038] hover:border-[#FF6A00]/30 hover:text-[#F5F7FA]"
              )}
            >
              {tab.label}
              <span className={cn("px-1.5 py-0.5 rounded text-[9px]", historyTab === tab.key ? "bg-white/20" : "bg-[#2A3038]")}>
                {tab.count}
              </span>
            </button>
          ))}

          {!isSpecialModule && hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(v => !v)}
              className="ml-auto text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-white flex items-center gap-1.5"
            >
              {showHidden
                ? <><EyeOff className="w-3.5 h-3.5" /> esconder ocultas</>
                : <><Eye className="w-3.5 h-3.5" /> ver {hiddenCount} oculta{hiddenCount > 1 ? "s" : ""}</>}
            </button>
          )}
        </div>

        {/* Lista */}
        {(() => {
          const empty = (icon: any, msg: string) => {
            const Ic = icon;
            return (
              <div className="bg-[#1B1F24] border-2 border-dashed border-[#2A3038] rounded-[32px] p-16 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center">
                  <Ic className="w-8 h-8 text-[#2A3038]" />
                </div>
                <p className="text-[#A7B0BE] font-black uppercase tracking-widest text-xs">{msg}</p>
              </div>
            );
          };

          // ── COMPRAS ──────────────────────────────────────────────────────────
          if (historyTab === 'purchases') {
            if (isSpecialModule) {
              if (ledgerPurchases.length === 0) return empty(PackageCheck, "Nenhuma compra registrada ainda");
              return (
                <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[24px] overflow-hidden shadow-xl shadow-black/20 divide-y divide-[#2A3038]">
                  {ledgerPurchases.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-4 px-6 py-5 hover:bg-[#2A3038]/30 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#F5F7FA] truncate">{e.description || "Créditos adicionados"}</p>
                        <p className="text-[11px] text-[#A7B0BE] mt-0.5">
                          {format(new Date(e.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          {typeof e.balance_after === "number" ? ` · saldo após: ${e.balance_after} cr` : ""}
                        </p>
                      </div>
                      <p className="text-sm font-black text-emerald-400 tabular-nums shrink-0">
                        +{Math.abs(Number(e.amount || 0))} cr
                      </p>
                    </div>
                  ))}
                </div>
              );
            }
            // Mercado — cards com botão ocultar
            if (visibleAquisicoes.length === 0) return empty(History, "Nenhum pacote adquirido até o momento");
            return (
              <div className="space-y-3">
                {visibleAquisicoes.map((e: any) => {
                  const isHid = hiddenIds.includes(e.id);
                  return (
                    <div key={e.id} className={cn("relative bg-[#1B1F24] border rounded-[20px] p-5 shadow-lg shadow-black/20 transition-all",
                      isHid ? "border-[#2A3038] opacity-50" : "border-[#2A3038] hover:border-[#FF6A00]/30")}>
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] shrink-0">
                          <PackageCheck className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-[#F5F7FA] truncate">{e.product_name || "Pacote de créditos"}</p>
                          <p className="text-[11px] text-[#A7B0BE] mt-0.5">{format(new Date(e.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1.5 bg-[#22C55E]/10 text-[#22C55E] px-3 py-1 rounded-lg text-xs font-black">
                              <Zap className="w-3.5 h-3.5" /> +{e.credits_granted} créditos
                            </span>
                            <span className="inline-flex items-center bg-[#2A3038] text-[#F5F7FA] px-3 py-1 rounded-lg text-xs font-black">
                              {formatCurrencyBRL(Number(e.amount_paid || 0))}
                            </span>
                          </div>
                        </div>
                        {!isHid && (
                          <button onClick={() => hideCard(e.id)} title="Ocultar" className="shrink-0 text-[#A7B0BE]/60 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                            <EyeOff className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {showHidden && hiddenCount > 0 && (
                  <button onClick={unhideAll} className="w-full text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-white py-2">
                    restaurar todas as ocultas
                  </button>
                )}
              </div>
            );
          }

          // ── CONSUMOS ─────────────────────────────────────────────────────────
          if (historyTab === 'consumption') {
            if (consumo.length === 0) return empty(Coins, "Nenhum consumo registrado ainda");
            return (
              <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[24px] overflow-hidden shadow-xl shadow-black/20 divide-y divide-[#2A3038]">
                {consumo.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-4 px-6 py-5 hover:bg-[#2A3038]/30 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                      <ArrowDownRight className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#F5F7FA] truncate">{labelFor(e.reason_code)}</p>
                      <p className="text-[11px] text-[#A7B0BE] mt-0.5">
                        {format(new Date(e.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {typeof e.balance_after === "number" ? ` · saldo após: ${e.balance_after} cr` : ""}
                      </p>
                      {e.description && <p className="text-[10px] text-[#A7B0BE]/60 mt-0.5 truncate">{e.description}</p>}
                    </div>
                    <p className="text-sm font-black text-red-400 tabular-nums shrink-0">
                      − {Math.abs(Number(e.amount || 0))} cr
                    </p>
                  </div>
                ))}
              </div>
            );
          }

          // ── TUDO (interleaved) ───────────────────────────────────────────────
          if (allHistoryItems.length === 0) return empty(History, "Nenhum registro encontrado");
          return (
            <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[24px] overflow-hidden shadow-xl shadow-black/20 divide-y divide-[#2A3038]">
              {allHistoryItems.map((e) => (
                <div key={e.id + e.type} className="flex items-center gap-4 px-6 py-5 hover:bg-[#2A3038]/30 transition-colors">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    e.type === 'purchase' ? "bg-emerald-500/10" : "bg-red-500/10")}>
                    {e.type === 'purchase'
                      ? <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                      : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#F5F7FA] truncate">{e.label}</p>
                    <p className="text-[11px] text-[#A7B0BE] mt-0.5">
                      {format(e.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      {typeof e.balanceAfter === "number" ? ` · saldo após: ${e.balanceAfter} cr` : ""}
                    </p>
                    {e.description && <p className="text-[10px] text-[#A7B0BE]/60 mt-0.5 truncate">{e.description}</p>}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className={cn("text-sm font-black tabular-nums", e.type === 'purchase' ? "text-emerald-400" : "text-red-400")}>
                      {e.type === 'purchase' ? '+' : '−'}{e.amount} cr
                    </p>
                    {e.type === 'purchase' && (e.brl || 0) > 0 && (
                      <p className="text-[11px] text-[#A7B0BE]">{formatCurrencyBRL(e.brl!)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* ═══ 8. ESTATÍSTICAS (todos os segmentos) ════════════════════════════════ */}
      {(totalCreditsPurchased > 0 || totalConsumed > 0) && (
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
              <BarChart2 className="w-6 h-6 text-[#FF6A00]" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase">Estatísticas</h2>
              <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">
                {seg.label} — visão geral do histórico de créditos
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { icon: TrendingUp,   label: "Total comprado",  value: `${totalCreditsPurchased} cr`,                               sub: totalBRLInvested > 0 ? formatCurrencyBRL(totalBRLInvested) + " investidos" : "via pacotes", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
              { icon: TrendingDown, label: "Total consumido", value: `${totalConsumed} cr`,                                        sub: `${consumptionCount} eventos`,                                                             color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20"     },
              { icon: Wallet,       label: "Valor investido", value: totalBRLInvested > 0 ? formatCurrencyBRL(totalBRLInvested) : `${purchasesCount} pacotes`, sub: `${purchasesCount} compra${purchasesCount !== 1 ? "s" : ""}`, color: "text-[#FF6A00]",   bg: "bg-[#FF6A00]/10",   border: "border-[#FF6A00]/20"   },
              { icon: Coins,        label: "Saldo estimado",  value: `${Math.max(0, totalCreditsPurchased - totalConsumed)} cr`,   sub: "créditos restantes",                                                                      color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20"  },
            ].map((stat, i) => (
              <div key={i} className={cn("bg-[#1B1F24] border rounded-3xl p-6 space-y-4", stat.border)}>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.bg)}>
                  <stat.icon className={cn("w-5 h-5", stat.color)} />
                </div>
                <div>
                  <p className="text-[10px] text-[#A7B0BE] font-black uppercase tracking-widest">{stat.label}</p>
                  <p className={cn("text-2xl font-black mt-1", stat.color)}>{stat.value}</p>
                  <p className="text-[11px] text-[#A7B0BE] mt-0.5">{stat.sub}</p>
                </div>
              </div>
            ))}
          </div>

          {totalCreditsPurchased > 0 && (
            <div className="bg-[#1B1F24] border border-[#2A3038] rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-[#F5F7FA] uppercase tracking-wide">Taxa de utilização dos créditos</p>
                <p className="text-sm font-black text-[#FF6A00]">
                  {Math.round((totalConsumed / totalCreditsPurchased) * 100)}%
                </p>
              </div>
              <div className="h-3 bg-[#2A3038] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#FF6A00] to-[#E55A00] rounded-full transition-all duration-1000"
                  style={{ width: `${Math.min(100, Math.round((totalConsumed / totalCreditsPurchased) * 100))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#A7B0BE]">
                <span>{totalConsumed} cr consumidos</span>
                <span>{Math.max(0, totalCreditsPurchased - totalConsumed)} cr restantes</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ═══ 9. SEGURANÇA (todos os segmentos) ═══════════════════════════════════ */}
      <section className="space-y-8 pt-10 border-t border-[#2A3038]">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#F5F7FA] tracking-tighter uppercase">Segurança no Pagamento</h2>
            <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] mt-0.5">Seus dados sempre protegidos</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Lock,         title: "Criptografia SSL",       desc: "Transmissão com criptografia bancária de ponta. Nenhuma informação fica exposta durante o pagamento.",            color: "text-emerald-400",  bg: "bg-emerald-500/10"  },
            { icon: PackageCheck, title: "Liberação Imediata",     desc: "Após confirmação do Pix ou Cartão, seus créditos entram na conta instantaneamente — sem espera.",               color: "text-[#FF6A00]",    bg: "bg-[#FF6A00]/10"    },
            { icon: ShieldCheck,  title: "Pagamento Protegido",    desc: "Processamento seguro via Mercado Pago, com proteção adicional contra transações suspeitas e estornos indevidos.", color: "text-blue-400",     bg: "bg-blue-500/10"     },
            { icon: CheckCircle2, title: "Pix Seguro",             desc: "Pagamentos via Pix auditados em tempo real, com chave criptografada e validação instantânea pelo Banco Central.", color: "text-purple-400",   bg: "bg-purple-500/10"   },
            { icon: History,      title: "Auditoria Completa",     desc: "Toda movimentação registrada com data, hora, tipo e valores — rastreabilidade total de todas as transações.",    color: "text-cyan-400",     bg: "bg-cyan-500/10"     },
            { icon: Award,        title: "Conformidade Garantida", desc: "Operação em conformidade com as regulamentações do Banco Central e LGPD, protegendo seus dados pessoais.",       color: "text-yellow-400",   bg: "bg-yellow-500/10"   },
          ].map((item, i) => (
            <div key={i} className="bg-[#1B1F24] border border-[#2A3038] rounded-3xl p-6 flex items-start gap-4">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", item.bg)}>
                <item.icon className={cn("w-6 h-6", item.color)} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black text-[#F5F7FA] uppercase tracking-tight">{item.title}</p>
                <p className="text-xs text-[#A7B0BE] leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
