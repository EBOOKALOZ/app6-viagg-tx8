/**
 * PromotionPlansModal.tsx
 * Modal de planos de promoção — Bronze, Prata, Ouro por perfil.
 * Busca do banco filtrado pelo perfil do anunciante (profile_type).
 * Fallback hardcoded enquanto a migration não foi rodada.
 */

import { useState, useEffect } from "react";
import {
  X, Megaphone, Check, Sparkles, Zap, Star, ChevronRight, Loader2, Shield, MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────── */

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
  profile_type: ProfileType | null; // null = global (todos os perfis)
}

/* ── Rótulos dos perfis ─────────────────────────── */

export const PROFILE_LABELS: Record<ProfileType, { label: string; emoji: string }> = {
  viagens:  { label: "Viagens & Turismo",    emoji: "✈️" },
  fretes:   { label: "Fretes & Transportes", emoji: "🚛" },
  servicos: { label: "Serviços",             emoji: "🛠️" },
  veiculos: { label: "Veículos",             emoji: "🚗" },
  imoveis:  { label: "Imóveis",              emoji: "🏠" },
  produtos: { label: "Produtos",             emoji: "🛍️" },
};

/* ── Fallback por perfil ────────────────────────── */

function buildFallback(profile?: ProfileType): PromotionPackage[] {
  const p = profile ?? null;
  const meta = profile ? PROFILE_LABELS[profile] : null;
  const suffix = meta ? ` ${meta.emoji}` : "";

  return [
    {
      id: `${p ?? "global"}-bronze`,
      name: "Bronze",
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
      id: `${p ?? "global"}-prata`,
      name: "Prata",
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
      id: `${p ?? "global"}-ouro`,
      name: "Ouro",
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

/* ── Component ─────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
  profileType?: ProfileType;
  whatsappNumber?: string;
  listingModule?: string;
}

export function PromotionPlansModal({
  open,
  onClose,
  profileType,
  whatsappNumber = "5566999999999",
  listingModule = "travel",
}: Props) {
  const [packages, setPackages] = useState<PromotionPackage[]>(() => buildFallback(profileType));
  const [loading, setLoading] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<Record<string, number>>({});
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPackages(buildFallback(profileType));
    (async () => {
      setLoading(true);
      try {
        // Busca pacotes do perfil específico. Fallback: pacotes globais (profile_type IS NULL)
        let query = (supabase as any)
          .from("promotion_packages")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (profileType) {
          query = query.eq("profile_type", profileType);
        } else {
          query = query.is("profile_type", null);
        }

        const { data } = await query;

        if (data && data.length > 0) {
          setPackages(data as PromotionPackage[]);
        } else if (profileType) {
          // Fallback: pacotes globais
          const { data: global } = await (supabase as any)
            .from("promotion_packages")
            .select("*")
            .eq("is_active", true)
            .is("profile_type", null)
            .order("sort_order", { ascending: true });
          if (global && global.length > 0) setPackages(global as PromotionPackage[]);
        }
      } catch {
        /* usa fallback */
      } finally {
        setLoading(false);
      }
    })();
  }, [open, profileType]);

  if (!open) return null;

  const profileMeta = profileType ? PROFILE_LABELS[profileType] : null;

  async function handleCTA(pkg: PromotionPackage) {
    const periods   = pkg.period_options ?? [30];
    const period    = selectedPeriods[pkg.id] ?? periods[periods.length - 1];
    const amountBrl = Number((pkg.price_monthly / 30 * period).toFixed(2));

    setCheckingOut(pkg.id);
    try {
      const { data, error } = await (supabase.functions as any).invoke("promotion-checkout", {
        body: {
          listing_module: listingModule,
          package_id:    pkg.id,
          package_name:  pkg.name,
          period_days:   period,
          amount_brl:    amountBrl,
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0D0F12] border border-[#2A3038]/60 shadow-2xl shadow-black custom-scrollbar">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 sm:px-7 py-4 bg-[#0D0F12] border-b border-[#2A3038]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-[#FF6A00]" />
            </div>
            <div>
              <h2 className="text-white font-black text-base sm:text-lg uppercase tracking-wider">
                Planos de Promoção
                {profileMeta && (
                  <span className="ml-2 text-[#FF6A00]">{profileMeta.emoji} {profileMeta.label}</span>
                )}
              </h2>
              <p className="text-[#A7B0BE] text-[11px]">
                Impulsione seus anúncios e venda muito mais
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#1B1F24] border border-[#2A3038]/60 flex items-center justify-center text-[#A7B0BE] hover:text-white hover:bg-[#2A3038] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Plans */}
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {packages.map((pkg) => {
                const periods = pkg.period_options ?? [7, 15, 30];
                const selPeriod = selectedPeriods[pkg.id] ?? periods[periods.length - 1];
                const c = pkg.color;
                const c2 = pkg.color_secondary ?? c;

                return (
                  <div
                    key={pkg.id}
                    className="relative rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                    style={{ border: `1px solid ${c}40`, boxShadow: pkg.is_popular ? `0 0 24px ${c}20` : undefined }}
                  >
                    {pkg.is_popular && (
                      <div
                        className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shadow-lg"
                        style={{ background: c, color: "#000" }}
                      >
                        <Star className="w-2.5 h-2.5" />
                        {pkg.badge_text ?? "Mais Popular"}
                      </div>
                    )}

                    {/* Header */}
                    <div
                      className="px-5 py-4"
                      style={{ background: `linear-gradient(135deg, ${c}28 0%, ${c2}12 100%)`, borderBottom: `1px solid ${c}30` }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl leading-none">{pkg.icon ?? "🏅"}</span>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: c }}>Plano</p>
                          <h3 className="text-white font-black text-xl uppercase tracking-wide leading-tight">{pkg.name}</h3>
                          <p className="text-[#A7B0BE] text-[10px] mt-0.5 leading-tight">{pkg.description}</p>
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="bg-[#0D0F12] px-5 py-4 flex flex-col gap-4 flex-1">
                      {/* Boosts */}
                      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: `${c}15`, border: `1px solid ${c}30` }}>
                        <Megaphone className="w-6 h-6 shrink-0" style={{ color: c }} />
                        <div>
                          <p className="font-black text-4xl leading-none" style={{ color: c }}>{pkg.daily_boosts}</p>
                          <p className="text-[9px] font-black text-white uppercase tracking-widest leading-tight">
                            IMPULSIONAMENTOS<br />por dia
                          </p>
                        </div>
                      </div>

                      {/* Benefits */}
                      <ul className="space-y-2 flex-1">
                        {(pkg.benefits ?? []).map((benefit, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <div
                              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                              style={{ background: `${c}25`, border: `1px solid ${c}50` }}
                            >
                              <Check className="w-2.5 h-2.5" style={{ color: c }} />
                            </div>
                            <span className="text-[11px] text-[#A7B0BE] leading-snug">{benefit}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Period selector */}
                      <div>
                        <p className="text-[9px] font-black text-[#A7B0BE]/50 uppercase tracking-widest mb-2">Escolha o período:</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {periods.map((days) => (
                            <button
                              key={days}
                              onClick={() => setSelectedPeriods((prev) => ({ ...prev, [pkg.id]: days }))}
                              className="px-3 py-1 rounded-lg text-[10px] font-black transition-all"
                              style={selPeriod === days
                                ? { background: c, color: "#000" }
                                : { background: `${c}12`, color: c, border: `1px solid ${c}30` }}
                            >
                              {days} dias
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Price — calculado pelo período selecionado */}
                      <div>
                        <p className="text-[10px] text-[#A7B0BE]/50 font-medium">
                          {selPeriod === 30 ? "valor mensal" : `valor para ${selPeriod} dias`}
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm text-[#A7B0BE] font-bold">R$</span>
                          <span className="text-4xl font-black text-white leading-none">
                            {(pkg.price_monthly / 30 * selPeriod).toFixed(2).replace(".", ",")}
                          </span>
                          <span className="text-[11px] text-[#A7B0BE]">
                            /{selPeriod === 30 ? "mês" : `${selPeriod} dias`}
                          </span>
                        </div>
                        {selPeriod !== 30 && (
                          <p className="text-[9px] text-[#A7B0BE]/40 mt-0.5">
                            equivale a R$ {pkg.price_monthly.toFixed(2).replace(".", ",")} /mês
                          </p>
                        )}
                      </div>

                      {/* CTA */}
                      <button
                        onClick={() => handleCTA(pkg)}
                        disabled={!!checkingOut}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-wider text-xs transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: c, color: pkg.slug.includes("prata") ? "#fff" : "#000" }}
                      >
                        {checkingOut === pkg.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Zap className="w-4 h-4" />}
                        {checkingOut === pkg.id ? "Aguarde…" : "Promover Agora"}
                        {checkingOut !== pkg.id && <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 flex items-center justify-center gap-2">
            <Shield className="w-3.5 h-3.5 text-[#A7B0BE]/30 shrink-0" />
            <p className="text-[10px] text-[#A7B0BE]/35 text-center">
              Sem fidelidade · Cancele quando quiser · Suporte via WhatsApp
            </p>
            <Sparkles className="w-3.5 h-3.5 text-[#FF6A00]/30 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
