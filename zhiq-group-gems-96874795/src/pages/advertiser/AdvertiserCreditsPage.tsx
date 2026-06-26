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

export default function AdvertiserCreditsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Modo IMÓVEIS / VEÍCULOS / VIAGENS: mostra pacotes do segmento e esconde os históricos do lojista.
  const isImoveis = window.location.pathname.startsWith("/anunciante/imoveis");
  const isVeiculos = window.location.pathname.startsWith("/anunciante/veiculos");
  const isServicos = window.location.pathname.startsWith("/anunciante/servicos");
  const isFretes = window.location.pathname.startsWith("/anunciante/fretes");
  const isViagens = window.location.pathname.startsWith("/anunciante/viagens");
  const isSpecialModule = isImoveis || isVeiculos || isServicos || isFretes || isViagens;

  // Custos por evento — RESPEITA os valores configurados no painel admin
  // (merchant_credit_usage_rules). Fallback só se a regra não existir.
  const { data: ruleCosts = { click: 6, interest: 9, whatsapp: 12 } } = useQuery({
    queryKey: ["credit-rule-costs", isVeiculos ? "vehicle" : isServicos ? "service" : isFretes ? "freight" : isViagens ? "travel" : "real_estate"],
    enabled: isSpecialModule,
    queryFn: async () => {
      const seg = isVeiculos ? "vehicle" : isServicos ? "service" : isFretes ? "freight" : isViagens ? "travel" : "real_estate";
      const codes = [`${seg}_listing_click`, `${seg}_interest_click`, `${seg}_unlock_whatsapp`];
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("feature_code, credits_cost")
        .in("feature_code", codes);
      const out = { click: 6, interest: 9, whatsapp: 12 };
      (data || []).forEach((r: any) => {
        const c = Number(r.credits_cost);
        if (!Number.isFinite(c)) return;
        if (r.feature_code === `${seg}_listing_click`) out.click = c;
        else if (r.feature_code === `${seg}_interest_click`) out.interest = c;
        else if (r.feature_code === `${seg}_unlock_whatsapp`) out.whatsapp = c;
      });
      return out;
    },
  });
  const { data: packages, isLoading: packagesLoading } = useRealEstatePackages();
  const merchantCredits = useMerchantCredits();
  const merchantLoading = merchantCredits.isLoading;

  // Histórico de créditos (advertiser_credit_ledger) — já buscado pelo hook
  const { ledger } = useAdvertiserCredits();
  const consumo = useMemo(
    () => isSpecialModule ? [] : (ledger || []).filter((e: any) => e.entry_type === "debit"),
    [ledger, isSpecialModule]
  );

  // Aquisições = compras de pacotes (tabela credit_purchases, por store_id).
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

  // "Ocultar" cards de aquisição — cosmético, por dispositivo (localStorage).
  // O registro NUNCA é apagado do banco (auditoria intacta).
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

  // Ocultos só na vitrine — pacotes seguem intactos no banco e no painel admin.
  const HIDDEN_VEHICLE_PACKAGE_SLUGS = ['venda-rapida-veiculos', 'turbo-veiculos', 'revenda-pro-veiculos'];
  const realEstatePkgs = packages?.filter(p => p.category === 'real_estate') || [];
  const vehiclePkgs = packages?.filter(p => p.category === 'vehicles' && !HIDDEN_VEHICLE_PACKAGE_SLUGS.includes(p.slug)) || [];
  const servicePkgs = packages?.filter(p => p.category === 'services') || [];
  const freightPkgs = packages?.filter(p => p.category === 'freight') || [];
  const travelPkgs = packages?.filter(p => p.category === 'travel') || [];

  // Real merchant products (Configured by Admin)
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
            {pkgs.map((p) => (
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
                    </div>
                  </div>

                  <Button
                    className={cn(
                      "w-full h-16 rounded-[24px] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-2xl gap-3 group/btn mt-8",
                      p.is_recommended
                        ? "bg-yellow-400 text-zinc-900 hover:bg-yellow-300 shadow-yellow-400/30"
                        : "bg-yellow-400 text-zinc-900 hover:bg-yellow-300 shadow-yellow-400/20 border border-yellow-500/40"
                    )}
                    onClick={() => navigate(`/anunciante/checkout/${p.id}${isImoveis ? '?ret=imoveis' : isVeiculos ? '?ret=veiculos' : isServicos ? '?ret=servicos' : isFretes ? '?ret=fretes' : isViagens ? '?ret=viagens' : ''}`)}
                  >
                    {p.button_label || "ADQUIRIR AGORA"} <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-2 transition-all" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-20 animate-in fade-in duration-700 pb-20">
      {/* Root Header */}
      <div className="space-y-3">
        <h1 className="text-4xl font-black text-[#F5F7FA] tracking-tighter uppercase flex items-center gap-3">
           <CreditCard className="w-10 h-10 text-[#FF6A00]" />
           Gestão e Pacotes
        </h1>
        <p className="text-[#A7B0BE] font-bold uppercase text-xs tracking-widest ml-14 opacity-70">Potencialize seus anúncios em múltiplos segmentos</p>
        
        {/* Chamada Comercial */}
        <div className="ml-14 mt-6 p-4 bg-[#FF6A00]/10 border-l-4 border-[#FF6A00] rounded-r-2xl max-w-2xl animate-in slide-in-from-left-4 duration-1000">
           <p className="text-[#FF6A00] text-lg md:text-xl font-extrabold tracking-tight leading-tight">
             Adquira os planos que mais atendem seu negócio e mantenha seu contato desbloqueado
           </p>
        </div>
      </div>

      {/* Aviso do modelo de cobrança (imóveis/veículos) — antes de iniciar a compra */}
      {isSpecialModule && (
        <div className="ml-0 md:ml-14 -mt-10 p-5 md:p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl max-w-3xl flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <p className="text-emerald-300 font-black text-sm uppercase tracking-wide">Como a plataforma trabalha por você</p>
            <p className="text-[#C9D2DE] text-[13px] leading-relaxed">
              Assim que um potencial cliente <strong>navega e clica no seu anúncio</strong>, ele chega até você —
              <strong> mesmo que você ainda não tenha adquirido um pacote</strong>, sem exigir créditos na hora.
              Esses créditos ficam <strong>registrados como consumo</strong> e, ao adquirir um pacote, são
              <strong> descontados automaticamente do seu saldo</strong>. Assim você nunca perde um interessado por falta de crédito.
            </p>
            <p className="text-emerald-200/90 text-[13px] leading-relaxed mt-2 pt-2 border-t border-emerald-500/20">
              E mais: <strong>até você desbloquear o WhatsApp do seu cliente, tudo fica sem cobrança</strong> — o consumo
              é apenas somado e só <strong>entra na conta no momento do desbloqueio do contato</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Regras de crédito (imóveis/veículos) — valores vêm do painel admin */}
      {isSpecialModule && (
        <div className="ml-0 md:ml-14 -mt-10 bg-[#1B1F24] border border-[#2A3038] rounded-3xl p-6 md:p-7 max-w-3xl space-y-5">
          <p className="text-[#FF6A00] font-black text-sm uppercase tracking-wide">Como funcionam os créditos</p>

          {/* Benefícios */}
          <ul className="space-y-2.5">
            {[
              "Divulgação gratuita do seu anúncio.",
              "Adquira pacotes de créditos apenas quando precisar.",
              "Todos os pacotes possuem validade de 30 dias.",
              "Proteção automática contra cliques inválidos.",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[#C9D2DE] text-sm leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" /> {b}
              </li>
            ))}
          </ul>

          <p className="text-[13px] text-[#A7B0BE] leading-relaxed">
            Ao adquirir pacotes, os créditos ficam disponíveis e pontuados no seu painel de <strong>visitas</strong> e <strong>interessados</strong>.
          </p>

          {/* Custos por evento (valores do admin) */}
          <ul className="space-y-3 pt-1">
            {[
              { cr: ruleCosts.click, label: "serão descontados quando um usuário clicar no seu anúncio." },
              { cr: ruleCosts.interest, label: "serão descontados quando um usuário clicar no botão INTERESSE." },
              { cr: ruleCosts.whatsapp, label: "serão descontados quando você desbloquear o WhatsApp do cliente interessado." },
            ].map((r, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="shrink-0 inline-flex items-center justify-center min-w-[44px] h-9 px-2 rounded-lg bg-[#FF6A00]/15 text-[#FF6A00] font-black text-sm border border-[#FF6A00]/30">
                  {r.cr}
                </span>
                <span className="text-[#C9D2DE] text-[13px] leading-snug"><strong>{r.cr} créditos</strong> {r.label}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 pt-3 border-t border-[#2A3038]">
            <p className="flex items-start gap-2 text-[12px] text-[#A7B0BE] leading-relaxed">
              <span className="shrink-0">📊</span>
              Todos os consumos são registrados no seu painel — acompanhe em detalhe os créditos usados e o saldo disponível.
            </p>
            <p className="flex items-start gap-2 text-[12px] text-[#A7B0BE] leading-relaxed">
              <span className="shrink-0">💳</span>
              Os créditos são descontados automaticamente conforme a utilização dos serviços dos pacotes adquiridos.
            </p>
          </div>
        </div>
      )}

      {(packagesLoading || merchantLoading) ? (
        <div className="flex flex-col items-center justify-center py-32 bg-[#1B1F24] rounded-[32px] border border-[#2A3038] shadow-xl shadow-black/30">
           <Loader2 className="w-12 h-12 text-[#FF6A00] animate-spin" />
           <p className="mt-4 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest">Sincronizando Ofertas...</p>
        </div>
      ) : (
        <div className="space-y-24">
          {/* Modo imóveis/veículos: pacotes do segmento; senão: pacotes do mercado */}
          {isImoveis
            ? renderSection("Pacotes de Imóveis", "Plano mensal — renove todo mês", null, Building2, realEstatePkgs, true)
            : isVeiculos
              ? renderSection("Pacotes de Veículos", "Compre quando precisar", null, CarFront, vehiclePkgs, false)
              : isServicos
                ? renderSection("Pacotes de Serviços", "Compre quando precisar", null, Briefcase, servicePkgs, false)
                : isFretes
                  ? renderSection("Mudanças & Fretes", "Compre quando precisar", null, Truck, freightPkgs, false)
                  : isViagens
                    ? renderSection("Pacotes de Viagens & Turismo", "Compre quando precisar", null, Plane, travelPkgs, false)
                    : renderSection("Pacotes Mercado", "Créditos de Comunicação", "PACOTES CONFIGURADOS PELO ADMINISTRADOR", Sparkles, productPkgs)}
        </div>
      )}

      {/* Relatório de créditos (imóveis): débitos de navegação + compras atuais */}
      {isImoveis && <RealEstateCreditReportCard />}
      
      {/* Relatório de créditos (veículos): débitos de navegação, interesses + compras atuais */}
      {isVeiculos && <VehicleCreditReportCard />}

      {/* Relatório de créditos (serviços): débitos de navegação, interesses + compras atuais */}
      {isServicos && <ServiceCreditReportCard />}

      {/* Relatório de créditos (fretes): débitos de navegação, interesses + compras atuais */}
      {isFretes && <FreightCreditReportCard />}

      {/* Relatório de créditos (viagens): débitos de navegação, interesses + compras atuais */}
      {isViagens && <TravelCreditReportCard />}

      {/* ═══ HISTÓRICO DE CONSUMO (oculto no modo imóveis e veículos, exibido para mercado) ═══ */}
      {!isSpecialModule && (<section className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase flex items-center gap-3">
            <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
              <TrendingDown className="w-6 h-6 text-[#FF6A00]" />
            </div>
            Histórico de Consumo
          </h2>
          <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em] ml-16">
            Cada crédito gasto pelas ações dos seus clientes
          </p>
        </div>

        {consumo.length === 0 ? (
          <div className="bg-[#1B1F24] border-2 border-dashed border-[#2A3038] rounded-[32px] p-16 flex flex-col items-center text-center space-y-4 shadow-xl shadow-black/20">
            <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center text-[#2A3038]">
              <Coins className="w-8 h-8" />
            </div>
            <p className="text-[#A7B0BE] font-black uppercase tracking-widest text-xs">Nenhum consumo registrado ainda</p>
          </div>
        ) : (
          <div className="bg-[#1B1F24] border border-[#2A3038] rounded-[24px] overflow-hidden shadow-xl shadow-black/20 divide-y divide-[#2A3038]">
            {consumo.map((e: any) => (
              <div key={e.id} className="flex items-center gap-4 px-6 py-4 hover:bg-[#2A3038]/30 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#F5F7FA] truncate">{labelFor(e.reason_code)}</p>
                  <p className="text-[11px] text-[#A7B0BE] mt-0.5">
                    {format(new Date(e.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {typeof e.balance_after === "number" ? ` · saldo após: ${e.balance_after}` : ""}
                  </p>
                  {e.description && <p className="text-[10px] text-[#A7B0BE]/60 mt-0.5 truncate">{e.description}</p>}
                </div>
                <p className="text-sm font-black text-red-400 tabular-nums shrink-0">
                  − {Math.abs(Number(e.amount || 0))} cr
                </p>
              </div>
            ))}
          </div>
        )}
      </section>)}

      {/* Trust and Shield Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-[#2A3038]">
          {!isSpecialModule && (<section className="space-y-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xl font-black text-[#F5F7FA] uppercase tracking-tight flex items-center gap-2">
                 <History className="w-6 h-6 text-[#A7B0BE]" /> Histórico de Aquisições
              </h3>
              {hiddenCount > 0 && (
                <button
                  onClick={() => setShowHidden((v) => !v)}
                  className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-white flex items-center gap-1 shrink-0"
                >
                  {showHidden
                    ? (<><EyeOff className="w-3.5 h-3.5" /> esconder ocultas</>)
                    : (<><Eye className="w-3.5 h-3.5" /> ver {hiddenCount} oculta{hiddenCount > 1 ? "s" : ""}</>)}
                </button>
              )}
            </div>

            {visibleAquisicoes.length === 0 ? (
              <div className="bg-[#1B1F24] border-2 border-dashed border-[#2A3038] rounded-[32px] p-20 flex flex-col items-center text-center space-y-4 shadow-xl shadow-black/20">
                 <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center text-[#2A3038]">
                    <History className="w-8 h-8" />
                 </div>
                 <p className="text-[#A7B0BE] font-black uppercase tracking-widest text-xs">Nenhum pacote adquirido até o momento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleAquisicoes.map((e: any) => {
                  const isHidden = hiddenIds.includes(e.id);
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        "relative bg-[#1B1F24] border rounded-[20px] p-5 shadow-lg shadow-black/20 transition-all",
                        isHidden ? "border-[#2A3038] opacity-50" : "border-[#2A3038] hover:border-[#FF6A00]/30"
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] shrink-0">
                          <PackageCheck className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-[#F5F7FA] truncate">{e.product_name || "Pacote de créditos"}</p>
                          <p className="text-[11px] text-[#A7B0BE] mt-0.5">
                            {format(new Date(e.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1.5 bg-[#22C55E]/10 text-[#22C55E] px-3 py-1 rounded-lg text-xs font-black">
                              <Zap className="w-3.5 h-3.5" /> +{e.credits_granted} créditos
                            </span>
                            <span className="inline-flex items-center bg-[#2A3038] text-[#F5F7FA] px-3 py-1 rounded-lg text-xs font-black">
                              {formatCurrencyBRL(Number(e.amount_paid || 0))}
                            </span>
                          </div>
                        </div>
                        {!isHidden && (
                          <button
                            onClick={() => hideCard(e.id)}
                            title="Ocultar este card"
                            className="shrink-0 text-[#A7B0BE]/60 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                          >
                            <EyeOff className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {showHidden && hiddenCount > 0 && (
                  <button
                    onClick={unhideAll}
                    className="w-full text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-white py-2"
                  >
                    restaurar todas as ocultas
                  </button>
                )}
              </div>
            )}
         </section>)}

         <div className="space-y-6">
            <h3 className="text-xl font-black text-[#F5F7FA] uppercase tracking-tight flex items-center gap-2">
               <ShieldCheck className="w-6 h-6 text-[#22C55E]" /> Segurança no Pagamento
            </h3>
            <div className="bg-[#1B1F24] rounded-[32px] p-10 border border-[#2A3038] flex flex-col gap-8 h-full shadow-lg shadow-black/20">
               <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] shadow-xl shrink-0">
                     <ShieldCheck className="w-8 h-8" />
                  </div>
                  <div className="space-y-1 pt-1">
                     <p className="text-sm font-black text-[#F5F7FA] uppercase tracking-tight">Criptografia Bancária</p>
                     <p className="text-xs text-[#A7B0BE] font-medium leading-relaxed">Usamos criptografia de ponta (SSL) para garantir que seus dados nunca fiquem expostos.</p>
                  </div>
               </div>
               
               <div className="flex items-start gap-6 pt-4 border-t border-[#2A3038]">
                  <div className="w-14 h-14 rounded-2xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00] shadow-xl shrink-0">
                     <PackageCheck className="w-8 h-8" />
                  </div>
                  <div className="space-y-1 pt-1">
                     <p className="text-sm font-black text-[#F5F7FA] uppercase tracking-tight">Liberação Imediata</p>
                     <p className="text-xs text-[#A7B0BE] font-medium leading-relaxed">Após a confirmação real do Pix ou Cartão, seus créditos entram na hora.</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
