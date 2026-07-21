/**
 * PromotionPlansGrid.tsx
 *
 * Componente reutilizável que gerencia a busca (`promotion_packages`), realtime,
 * seletor de períodos e checkout dos Pacotes de Anúncios (Impulsionamento).
 * 
 * Reutilizado em:
 *   • `PromotionPlansModal.tsx` (quando aberto em modal flutuante)
 *   • `AdvertiserCreditsPage.tsx` e `MerchantCredits.tsx` (exibição inline unificada com créditos)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Megaphone, Check, Zap, Star, ChevronRight,
  Loader2, Shield, AlertCircle, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────── */

export type ProfileType = "viagens" | "fretes" | "servicos" | "veiculos" | "imoveis" | "produtos";

export interface PromotionPackage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  color_secondary: string | null;
  icon: string | null;
  daily_boosts: number;
  price_monthly: number;
  period_options: number[] | null;
  benefits: string[] | null;
  is_active: boolean;
  is_popular: boolean;
  badge_text: string | null;
  sort_order: number;
  profile_type: ProfileType | null;
  max_publications?: number | null;
  interval_minutes?: number | null;
  priority?: number | null;
  duration_days?: number | null;
}

/* ── Rótulos dos perfis ─────────────────────────────────── */

export const PROFILE_LABELS: Record<ProfileType, { label: string; emoji: string }> = {
  viagens:  { label: "Viagens & Turismo",    emoji: "✈️" },
  fretes:   { label: "Fretes & Transportes", emoji: "🚛" },
  servicos: { label: "Serviços",             emoji: "🛠️" },
  veiculos: { label: "Veículos",             emoji: "🚗" },
  imoveis:  { label: "Imóveis",              emoji: "🏠" },
  produtos: { label: "Produtos",             emoji: "🛍️" },
  leiloes:  { label: "Leilões",              emoji: "🏷️" },
} as Record<string, { label: string; emoji: string }>;

/* ── Mapeamento profileType → listingModule (checkout) ─── */

export const PROFILE_MODULE: Record<string, string> = {
  viagens:  "travel",
  fretes:   "freight",
  servicos: "service",
  veiculos: "vehicle",
  imoveis:  "realestate",
  produtos: "marketplace",
  leiloes:  "auction",
};

/* ── Cor do texto sobre um fundo colorido ────────────────── */

export function textOnColor(hex: string): string {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? "#000" : "#fff";
  } catch {
    return "#fff";
  }
}

/* ── Fallback mínimo (apenas quando banco sem pacotes) ──── */

export function buildFallback(profile?: ProfileType): PromotionPackage[] {
  const p = profile ?? null;
  const meta = profile ? PROFILE_LABELS[profile] : null;
  const suffix = meta ? ` ${meta.emoji}` : "";
  return [
    {
      id: `${p ?? "global"}-bronze`, name: "Bronze",
      slug: `${p ?? "global"}-bronze`,
      description: `Mais visibilidade para ${meta ? `seus ${meta.label.toLowerCase()}` : "seu anúncio"}`,
      color: "#CD7F32", color_secondary: "#B87333", icon: "🥉",
      daily_boosts: 5, price_monthly: 9.9,
      period_options: [7, 15, 30],
      benefits: [
        `Destaque no feed de ${meta?.label.toLowerCase() ?? "anúncios"}${suffix}`,
        "Mais visualizações para seu anúncio",
        "Distribuição ao longo do dia",
        "Relatório de desempenho básico",
      ],
      is_active: true, is_popular: false, badge_text: null, sort_order: 1, profile_type: p,
    },
    {
      id: `${p ?? "global"}-prata`, name: "Prata",
      slug: `${p ?? "global"}-prata`,
      description: `Mais alcance para você ${profile === "servicos" || profile === "fretes" ? "conquistar clientes" : "vender mais"}`,
      color: "#9E9E9E", color_secondary: "#757575", icon: "🥈",
      daily_boosts: 15, price_monthly: 19.9,
      period_options: [7, 15, 30],
      benefits: [
        `Destaque no feed de ${meta?.label.toLowerCase() ?? "anúncios"}${suffix}`,
        "Mais visualizações para seu anúncio",
        "Distribuição ao longo do dia",
        "Prioridade nas buscas",
        "Relatório de desempenho completo",
      ],
      is_active: true, is_popular: true, badge_text: "Mais Popular", sort_order: 2, profile_type: p,
    },
    {
      id: `${p ?? "global"}-ouro`, name: "Ouro",
      slug: `${p ?? "global"}-ouro`,
      description: "Máxima exposição para resultados reais",
      color: "#FFD700", color_secondary: "#FFA500", icon: "🥇",
      daily_boosts: 30, price_monthly: 39.9,
      period_options: [7, 15, 30],
      benefits: [
        `Topo do feed de ${meta?.label.toLowerCase() ?? "anúncios"}${suffix}`,
        "Máxima prioridade nas buscas",
        "Distribuição estratégica ao longo do dia",
        "Selo de anúncio promovido",
        "Relatórios avançados com gráficos",
      ],
      is_active: true, is_popular: false, badge_text: null, sort_order: 3, profile_type: p,
    },
  ];
}

/* ── Props ──────────────────────────────────────────────── */

export interface PromotionPlansGridProps {
  profileType?: ProfileType;
  whatsappNumber?: string;
  listingModule?: string;
  inline?: boolean;
  showHeader?: boolean;
  title?: string;
}

export function PromotionPlansGrid({
  profileType,
  listingModule,
  inline = false,
  showHeader = true,
  title,
}: PromotionPlansGridProps) {
  const [packages, setPackages]           = useState<PromotionPackage[]>([]);
  const [loading, setLoading]             = useState(false);
  const [fetchError, setFetchError]       = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<Record<string, number>>({});
  const [checkingOut, setCheckingOut]     = useState<string | null>(null);

  const resolvedModule = listingModule ?? PROFILE_MODULE[profileType ?? ""] ?? "travel";

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setUsingFallback(false);

    try {
      let data: PromotionPackage[] | null = null;

      if (profileType) {
        const { data: specific, error: e1 } = await (supabase as any)
          .from("promotion_packages")
          .select("*")
          .eq("is_active", true)
          .eq("profile_type", profileType)
          .order("sort_order", { ascending: true });

        if (e1) throw e1;
        if (specific && specific.length > 0) {
          data = specific as PromotionPackage[];
        }
      }

      if (!data || data.length === 0) {
        const { data: global, error: e2 } = await (supabase as any)
          .from("promotion_packages")
          .select("*")
          .eq("is_active", true)
          .is("profile_type", null)
          .order("sort_order", { ascending: true });

        if (e2) throw e2;
        if (global && global.length > 0) {
          data = global as PromotionPackage[];
        }
      }

      if (data && data.length > 0) {
        setPackages(data);
        setUsingFallback(false);
      } else {
        setPackages(buildFallback(profileType));
        setUsingFallback(true);
      }
    } catch (err: any) {
      console.error("[PromotionPlansGrid] Erro ao buscar pacotes:", err);
      setFetchError(err?.message ?? "Erro desconhecido ao carregar pacotes.");
      setPackages(buildFallback(profileType));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [profileType]);

  useEffect(() => {
    fetchPackages();

    const channel = supabase
      .channel(`promotion-plans-grid-rt-${profileType || 'global'}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "promotion_packages" },
        () => { fetchPackages(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profileType, fetchPackages]);

  async function handleCTA(pkg: PromotionPackage) {
    const periods   = pkg.period_options ?? [30];
    const period    = selectedPeriods[pkg.id] ?? periods[periods.length - 1];
    const amountBrl = Number((pkg.price_monthly / 30 * period).toFixed(2));

    setCheckingOut(pkg.id);
    try {
      const { data, error } = await (supabase.functions as any).invoke("promotion-checkout", {
        body: {
          listing_module: resolvedModule,
          package_id:     pkg.id,
          package_name:   pkg.name,
          period_days:    period,
          amount_brl:     amountBrl,
        },
      });

      if (error || !data?.checkout_url) {
        toast.error("Não foi possível gerar o link de pagamento. Tente novamente.");
        return;
      }

      toast.success("Abrindo pagamento no Mercado Pago…");
      window.open(data.checkout_url, "_blank");
    } catch {
      toast.error("Erro ao iniciar pagamento. Tente novamente.");
    } finally {
      setCheckingOut(null);
    }
  }

  const profileMeta = profileType ? PROFILE_LABELS[profileType] : null;

  return (
    <div className="w-full">
      {showHeader && (
        <div className="space-y-3 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
              <Megaphone className="w-6 h-6 text-[#FF6A00]" />
            </div>
            <h2 className="text-3xl font-black text-[#F5F7FA] tracking-tighter uppercase">
              {title || "Pacotes de Anúncios e Impulsionamento"}
              {profileMeta && !title && (
                <span className="ml-2.5 text-[#FF6A00] text-2xl font-bold tracking-normal">
                  {profileMeta.emoji} {profileMeta.label}
                </span>
              )}
            </h2>
          </div>
          <div className="ml-0 sm:ml-16 space-y-1">
            <p className="text-[#A7B0BE] font-bold uppercase text-[10px] tracking-[0.2em]">
              Destaque seu anúncio no topo das buscas oficiais e nos feeds do marketplace
            </p>
            <p className="text-[#FF6A00] font-black uppercase text-[10px] tracking-widest bg-[#FF6A00]/10 w-fit px-3 py-1 rounded-lg border border-[#FF6A00]/20">
              VISIBILIDADE PREMIUM E IMPULSIONAMENTOS DIÁRIOS
            </p>
          </div>
        </div>
      )}

      {/* ═══ FAIXA INFORMATIVA PREMIUM — ANÚNCIOS GRATUITOS ═══ */}
      <div className="mb-8 rounded-[32px] bg-gradient-to-br from-[#1B1F24] via-[#1E232A] to-[#14171B] border border-[#FF6A00]/40 p-6 sm:p-8 shadow-2xl shadow-black/40 animate-in fade-in slide-in-from-bottom-4 duration-700 relative overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6A00]/10 rounded-full blur-3xl pointer-events-none -translate-y-20 translate-x-20" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none translate-y-16 -translate-x-16" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Ícone de Destaque */}
          <div className="w-14 h-14 rounded-2xl bg-white/10 p-0.5 border border-white/20 overflow-hidden shadow-xl shadow-orange-900/40 shrink-0 flex items-center justify-center">
            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="w-full h-full object-cover rounded-xl" />
          </div>

          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📢</span>
              <h3 className="text-xl sm:text-2xl font-black text-[#F5F7FA] tracking-tight uppercase">
                ANUNCIE GRATUITAMENTE
              </h3>
            </div>

            <div className="space-y-2 text-[#A7B0BE] text-sm font-medium leading-relaxed">
              <p>
                Na <span className="text-white font-bold">VIAGG-TX8</span> você sempre poderá publicar anúncios gratuitamente, respeitando os limites do seu perfil.
              </p>
              <p>
                Os <span className="text-[#FF6A00] font-bold">Pacotes de Divulgação e Impulsionamento</span> são opcionais e destinam-se a quem deseja obter mais visibilidade, aparecer nas primeiras posições, alcançar mais clientes e acelerar suas vendas.
              </p>
              <p className="text-[#F5F7FA] font-bold text-xs sm:text-sm pt-1">
                👉 Você escolhe quando impulsionar o seu negócio.
              </p>
            </div>

            {/* Quatro Badges de Destaque */}
            <div className="pt-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide shadow-sm">
                <span>✅</span>
                <span>Publicação Gratuita</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 text-[#FF6A00] text-xs font-bold tracking-wide shadow-sm">
                <span>🚀</span>
                <span>Mais Visibilidade</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wide shadow-sm">
                <span>⭐</span>
                <span>Destaque nas Buscas</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold tracking-wide shadow-sm">
                <span>📈</span>
                <span>Mais Oportunidades de Venda</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {usingFallback && !fetchError && !loading && !inline && (
        <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-300">
            Nenhum pacote cadastrado no banco para este perfil. Exibindo configuração padrão.
          </p>
        </div>
      )}

      {fetchError && !loading && (
        <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[11px] text-red-300 font-bold">Erro ao carregar pacotes do banco</p>
            <p className="text-[10px] text-red-400/70 mt-0.5 break-all">{fetchError}</p>
          </div>
          <button
            onClick={fetchPackages}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-[#1B1F24] rounded-[32px] border border-[#2A3038] shadow-xl">
          <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
          <p className="text-[#A7B0BE]/60 text-xs font-bold uppercase tracking-widest">
            Carregando pacotes de divulgação...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg) => {
            const periods   = pkg.period_options ?? [7, 15, 30];
            const selPeriod = selectedPeriods[pkg.id] ?? periods[periods.length - 1];
            const c  = pkg.color ?? "#FF6A00";
            const c2 = pkg.color_secondary ?? c;
            const ctaTextColor = textOnColor(c);

            return (
              <div
                key={pkg.id}
                className="relative rounded-[32px] overflow-hidden flex flex-col transition-all duration-300 hover:translate-y-[-6px] hover:shadow-2xl bg-[#1B1F24]"
                style={{
                  border: `2px solid ${c}50`,
                  boxShadow: pkg.is_popular ? `0 0 32px ${c}25` : `0 12px 32px rgba(0,0,0,0.3)`,
                }}
              >
                {pkg.is_popular && pkg.badge_text && (
                  <div
                    className="absolute top-4 right-4 z-10 flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shadow-lg"
                    style={{ background: c, color: ctaTextColor }}
                  >
                    <Star className="w-2.5 h-2.5" />
                    {pkg.badge_text}
                  </div>
                )}

                {/* Header do Card */}
                <div
                  className="px-6 py-6"
                  style={{
                    background: `linear-gradient(135deg, ${c}28 0%, ${c2}12 100%)`,
                    borderBottom: `1px solid ${c}30`,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-4xl leading-none">{pkg.icon ?? "🏅"}</span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: c }}>
                        Plano de Divulgação
                      </p>
                      <h3 className="text-white font-black text-2xl uppercase tracking-wide leading-tight">
                        {pkg.name}
                      </h3>
                      {pkg.description && (
                        <p className="text-[#A7B0BE] text-[11px] mt-1 leading-snug font-medium">
                          {pkg.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Body do Card */}
                <div className="bg-[#14171B] px-6 py-6 flex flex-col gap-5 flex-1">
                  {/* Impulsionamentos */}
                  <div
                    className="flex items-center gap-4 p-4 rounded-2xl"
                    style={{ background: `${c}15`, border: `1px solid ${c}30` }}
                  >
                    <Megaphone className="w-7 h-7 shrink-0" style={{ color: c }} />
                    <div>
                      <p className="font-black text-4xl leading-none" style={{ color: c }}>
                        {pkg.daily_boosts}
                      </p>
                      <p className="text-[10px] font-black text-white uppercase tracking-widest leading-tight mt-0.5">
                        IMPULSIONAMENTOS<br />por dia
                      </p>
                    </div>
                  </div>

                  {/* Benefícios */}
                  <ul className="space-y-3 flex-1 py-1">
                    {(pkg.benefits ?? []).map((benefit, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: `${c}25`, border: `1px solid ${c}50` }}
                        >
                          <Check className="w-3 h-3" style={{ color: c }} />
                        </div>
                        <span className="text-xs text-[#C9D2DE] font-medium leading-relaxed">{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Seletor de período */}
                  <div className="pt-2 border-t border-[#2A3038]">
                    <p className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-2.5">
                      Escolha o período da campanha:
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {periods.map((days) => (
                        <button
                          key={days}
                          onClick={() =>
                            setSelectedPeriods((prev) => ({ ...prev, [pkg.id]: days }))
                          }
                          className="px-3.5 py-1.5 rounded-xl text-xs font-black transition-all"
                          style={
                            selPeriod === days
                              ? { background: c, color: ctaTextColor }
                              : { background: `${c}15`, color: c, border: `1px solid ${c}35` }
                          }
                        >
                          {days} dias
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preço */}
                  <div className="pt-2">
                    <p className="text-[10px] text-[#A7B0BE] font-bold uppercase tracking-wider">
                      {selPeriod === 30
                        ? "investimento mensal"
                        : `investimento para ${selPeriod} dias`}
                    </p>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-sm text-[#A7B0BE] font-black">R$</span>
                      <span className="text-4xl font-black text-white leading-none tracking-tight">
                        {(pkg.price_monthly / 30 * selPeriod)
                          .toFixed(2)
                          .replace(".", ",")}
                      </span>
                      <span className="text-xs font-bold text-[#A7B0BE]">
                        /{selPeriod === 30 ? "mês" : `${selPeriod} dias`}
                      </span>
                    </div>
                    {selPeriod !== 30 && (
                      <p className="text-[10px] text-[#A7B0BE]/60 mt-1 font-medium">
                        equivale a R$ {pkg.price_monthly.toFixed(2).replace(".", ",")} /mês
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handleCTA(pkg)}
                    disabled={!!checkingOut}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black uppercase tracking-wider text-xs transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg mt-2"
                    style={{ background: c, color: ctaTextColor, boxShadow: `0 8px 24px ${c}30` }}
                  >
                    {checkingOut === pkg.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    {checkingOut === pkg.id ? "Aguarde…" : "Promover Agora"}
                    {checkingOut !== pkg.id && <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-center justify-center gap-2">
        <Shield className="w-4 h-4 text-[#A7B0BE]/40 shrink-0" />
        <p className="text-[11px] text-[#A7B0BE]/50 text-center font-bold">
          Sem fidelidade · Cancele quando quiser · Suporte VIP via WhatsApp e IA
        </p>
      </div>
    </div>
  );
}
