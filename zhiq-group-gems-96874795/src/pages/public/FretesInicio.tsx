import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Truck, Package, BrainCircuit, CheckCircle2 } from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { ViaggAIChat } from "@/components/public/ViaggAIChat";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import viaggLogo from "@/assets/logo.png";

interface ProfileCard {
  id:             string;
  emoji:          string;
  title:          string;
  subtitle:       string;
  description:    string;
  benefits?:      string[];
  badge:          string;
  accent:         string;
  gradientFrom:   string;
  gradientTo:     string;
  Icon:           React.ElementType;
  route:          string | null;
  buttonLabel:    string;
  registerRoute:  string | null;
  registerLabel:  string;
  imageSrc?:      string;
  callRoute?:     string | null;
  callLabel?:     string;
}

const PROFILES: ProfileCard[] = [
  {
    id:           "fretes",
    emoji:        "🚚",
    title:        "TRANSPORTE DE CARGAS",
    subtitle:     "FRETES",
    description:  "Fretes urbanos, empresariais e transporte de cargas.",
    benefits:     [
      "Coleta e entrega expressa ou agendada",
      "Veículos utilitários, vans e caminhões",
      "Rastreamento e segurança na carga",
      "Negociação direta com profissionais"
    ],
    badge:        "🚚 Transporte de Cargas",
    accent:       "#0284C7",
    gradientFrom: "#0284C7",
    gradientTo:   "#0369A1",
    Icon:         Truck,
    route:        "/fretes/anuncios?subcategoria=Fretes",
    buttonLabel:  "Ver Anúncios de Fretes",
    registerRoute:"/auth?entry=advertiser",
    registerLabel:"Anunciar Meu Frete",
    imageSrc:     "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=500&q=70&auto=format&fit=crop",
    callRoute:    "/fretes/anuncios?subcategoria=Fretes",
    callLabel:    "Acessar Fretes",
  },
  {
    id:           "mudancas",
    emoji:        "📦",
    title:        "RESIDENCIAL & COMERCIAL",
    subtitle:     "MUDANÇAS",
    description:  "Mudanças residenciais e comerciais.",
    benefits:     [
      "Montagem e desmontagem de móveis",
      "Embalagem e cuidado com itens frágeis",
      "Equipes preparadas para içamento",
      "Orçamento rápido sem compromisso"
    ],
    badge:        "📦 Mudanças Completas",
    accent:       "#10B981",
    gradientFrom: "#10B981",
    gradientTo:   "#059669",
    Icon:         Package,
    route:        "/fretes/anuncios?subcategoria=Mudanças",
    buttonLabel:  "Ver Anúncios de Mudanças",
    registerRoute:"/auth?entry=advertiser",
    registerLabel:"Anunciar Minha Mudança",
    imageSrc:     "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500&q=70&auto=format&fit=crop",
    callRoute:    "/fretes/anuncios?subcategoria=Mudanças",
    callLabel:    "Acessar Mudanças",
  },
  {
    id:           "ia",
    emoji:        "🤖",
    title:        "ASSISTENTE IA",
    subtitle:     "INTELIGENTE",
    description:  "Atendimento 24h, suporte, cálculo de cubagem/peso e sugestões automáticas com IA de ponta.",
    benefits:     [
      "Disponível 24 horas",
      "Dúvidas sobre fretes e mudanças",
      "Sugestões de tipo de veículo ideal",
      "100% automático"
    ],
    badge:        "✨ Tecnologia",
    accent:       "#6366F1",
    gradientFrom: "#6366F1",
    gradientTo:   "#8B5CF6",
    Icon:         BrainCircuit,
    route:        null,
    buttonLabel:  "Falar com a Plataforma Viagg-TX8",
    registerRoute:null,
    registerLabel:"",
    callRoute:    null,
  },
];

function ProfileCardItem({
  profile,
  onAccess,
  onRegister,
}: {
  profile:    ProfileCard;
  onAccess:   () => void;
  onRegister: (() => void) | null;
}) {
  const { Icon } = profile;
  const isIA = profile.id === "ia";

  return (
    <div className="flex flex-col h-full">
      <div
        className="group relative h-full overflow-hidden bg-gradient-to-br from-[#1C2028] via-[#171A21] to-[#121417] border border-[#0284C7]/35 rounded-[28px] shadow-[0_18px_45px_rgba(0,0,0,0.45)] flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#0284C7] hover:shadow-[0_30px_60px_rgba(0,0,0,0.55),0_0_35px_rgba(2,132,199,0.18)] w-full"
      >
        <div className="w-full flex items-center justify-center pt-6 px-8 relative">
           <span className="text-[11px] font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider bg-gradient-to-r from-[#0284C7]/15 to-[#0284C7]/5 text-[#38BDF8] border border-[#0284C7]/20 shadow-sm transition-all duration-300">
             {profile.badge}
           </span>
        </div>

        <div
          className="mt-6 w-24 h-24 rounded-3xl overflow-hidden shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 border-2 border-[#0284C7]/30 shadow-[0_0_30px_rgba(2,132,199,0.20)] ring-4 ring-[#1C2028] bg-[#1a1f28]"
        >
          {profile.imageSrc ? (
            <img
              src={profile.imageSrc}
              alt={profile.title}
              className="w-full h-full object-cover object-top"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div className={profile.imageSrc ? "hidden w-full h-full flex items-center justify-center" : "w-full h-full flex items-center justify-center"}>
            {isIA
              ? <img src={viaggLogo} alt="IA" className="w-full h-full object-cover" />
              : <Icon className="w-12 h-12 text-[#38BDF8]" />
            }
          </div>
        </div>

        <div className="px-8 pt-6 w-full flex flex-col items-center">
          <p className="text-[14px] font-medium tracking-[0.2em] text-[#C9CED8] uppercase mb-1">{profile.title}</p>
          <p className="text-[34px] leading-none font-black tracking-tight text-[#38BDF8]">
            {profile.subtitle}
          </p>
          <p className="text-[16px] mt-4 leading-snug text-[#D7DCE5] line-clamp-2 px-2">
            {profile.description}
          </p>
        </div>

        {profile.benefits && profile.benefits.length > 0 && (
          <div className="w-full px-8 mt-7">
            <div className="bg-[#22262E] border border-[#2E3441] rounded-[18px] p-5 text-left flex flex-col gap-3 shadow-inner">
              {profile.benefits.map((benefit, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-[18px] h-[18px] shrink-0 mt-[1px] text-[#00C853]" />
                  <span className="text-[15px] font-medium text-[#F4F6F8] leading-snug">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-[1.5rem]" />

        <div className="flex flex-col gap-3 px-8 pb-8 w-full shrink-0">
          {profile.callRoute ? (
            <>
              {onRegister && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRegister(); }}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl shadow-[0_10px_25px_rgba(104,199,242,0.30)] font-black text-[18px] text-[#0A192F] transition-all duration-250 bg-[#68c7f2] hover:bg-[#54B5E0] active:scale-[0.98]"
                >
                  {profile.registerLabel}
                  <ArrowRight className="w-5 h-5 text-[#0A192F]" />
                </button>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); onAccess(); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[17px] transition-all duration-250 bg-[#68c7f2] hover:bg-[#54B5E0] text-[#0A192F] shadow-sm active:scale-[0.98]"
              >
                {profile.buttonLabel}
              </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onAccess(); }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl shadow-[0_10px_25px_rgba(104,199,242,0.30)] font-black text-[18px] text-[#0A192F] transition-all duration-250 bg-[#68c7f2] hover:bg-[#54B5E0] active:scale-[0.98]"
            >
              {profile.buttonLabel}
              <ArrowRight className="w-5 h-5 text-[#0A192F]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FretesInicio() {
  const navigate  = useNavigate();
  const { user, avatarUrl, displayName } = useAuth();
  const [search, setSearch] = useState("");

  const userAvatar = avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  function handleAccess(profile: ProfileCard) {
    if (profile.id === "ia") {
      window.dispatchEvent(new CustomEvent("viagg-ai:open"));
      return;
    }
    if (profile.route) navigate(profile.route);
  }

  function handleRegister(profile: ProfileCard) {
    if (profile.registerRoute) navigate(profile.registerRoute);
  }

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      onSearchSubmit={(val) => navigate(`/mercado?q=${encodeURIComponent(val)}`)}
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="🚚 Fretes & Mudanças"
      myAccountPath="/viagens/minha-conta"
      mainClassName="bg-gradient-to-b from-[#0284C7] via-[#0369A1] to-[#075985]"
    >
      <div className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center px-4 py-10">

        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20">
              <img src={viaggLogo} alt="Viagg-TX8" className="w-full h-full object-cover" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white drop-shadow">Módulo Fretes & Mudanças</h1>
          <p className="text-white/80 text-base mt-1">Plataforma VIAGG-TX8™</p>
        </div>

        {/* Card de destaque — FRETES E MUDANÇAS (full width) */}
        <div className="w-full max-w-3xl mb-5">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#68c7f2] to-[#4aa8d8] rounded-3xl shadow-2xl shadow-sky-900/40 border border-[#68c7f2]/40 p-6 text-left">
            <span className="hidden sm:block absolute top-4 right-4 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide bg-white/20 text-black border border-white/30">
              EXPRESSO & AGENDADO
            </span>

            <div className="flex items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 shadow-lg border border-white/20">
                {userAvatar ? (
                  <img src={userAvatar} alt="Foto do usuário" className="w-full h-full object-cover" />
                ) : (
                  <img src={viaggLogo} alt="Viagg-TX8 Logo" className="w-full h-full object-cover" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <span className="inline-block sm:hidden text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide bg-white/20 text-black border border-white/30 mb-1.5 w-fit">
                  EXPRESSO & AGENDADO
                </span>
                <p className="text-xl sm:text-2xl font-black text-black tracking-tight leading-tight">SOLICITAÇÕES DE FRETES</p>
                <p className="text-sm sm:text-base font-black text-black/80 tracking-tight">FRETES OU MUDANÇAS</p>
                <p className="text-xs sm:text-sm text-black/70 mt-1.5 leading-snug">
                  Selecione abaixo a modalidade ideal para transportar sua carga ou realizar sua mudança com segurança.
                </p>
              </div>
            </div>

            {/* ESCOLHA RÁPIDA DE MODALIDADE */}
            <div className="mt-6 pt-5 border-t border-black/15">
              <p className="text-xs font-black tracking-wider uppercase text-black/90 mb-3.5 flex items-center gap-1.5">
                ⚡ Escolha a modalidade de transporte:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ── CARD RÁPIDO 1: FRETES ── */}
                <button
                  onClick={() => navigate("/fretes/anuncios?subcategoria=Fretes")}
                  className="group relative flex flex-col justify-between bg-gradient-to-br from-[#1E293B] to-[#0F172A] border-2 border-[#0284C7]/60 hover:border-[#38BDF8] rounded-2xl p-4 shadow-xl hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#0284C7]/20 transition-all text-left overflow-hidden"
                >
                  <div className="w-full h-36 rounded-xl overflow-hidden mb-4 relative bg-[#141820] border border-white/10 shrink-0 shadow-inner">
                    <img src={PROFILES[0].imageSrc} alt="Fretes" className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div>
                    <span className="inline-block text-[9px] font-black tracking-widest uppercase bg-[#0284C7]/20 text-[#38BDF8] px-2.5 py-0.5 rounded-full border border-[#0284C7]/40 mb-1.5">
                      CARGAS & COMERCIAIS
                    </span>
                    <h4 className="text-xl font-black text-white tracking-tight">🚚 FRETES</h4>
                    <p className="text-xs text-[#A7B0BE] mt-1 leading-snug">
                      Fretes urbanos, empresariais e transporte de cargas em geral com veículos utilitários ou caminhões.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between w-full">
                    <span className="text-xs font-black text-[#38BDF8] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Ver Anúncios de Fretes <ArrowRight className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] text-white/60 font-bold">Rápido</span>
                  </div>
                </button>

                {/* ── CARD RÁPIDO 2: MUDANÇAS ── */}
                <button
                  onClick={() => navigate("/fretes/anuncios?subcategoria=Mudanças")}
                  className="group relative flex flex-col justify-between bg-gradient-to-br from-[#1E293B] to-[#0F172A] border-2 border-[#10B981]/60 hover:border-[#34D399] rounded-2xl p-4 shadow-xl hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#10B981]/20 transition-all text-left overflow-hidden"
                >
                  <div className="w-full h-36 rounded-xl overflow-hidden mb-4 relative bg-[#141820] border border-white/10 shrink-0 shadow-inner">
                    <img src={PROFILES[1].imageSrc} alt="Mudanças" className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div>
                    <span className="inline-block text-[9px] font-black tracking-widest uppercase bg-[#10B981]/20 text-[#34D399] px-2.5 py-0.5 rounded-full border border-[#10B981]/40 mb-1.5">
                      RESIDENCIAL & EMPRESARIAL
                    </span>
                    <h4 className="text-xl font-black text-white tracking-tight">📦 MUDANÇAS</h4>
                    <p className="text-xs text-[#A7B0BE] mt-1 leading-snug">
                      Mudanças completas residenciais ou comerciais com opções de desmontagem, montagem e embalagem.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between w-full">
                    <span className="text-xs font-black text-[#34D399] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Ver Anúncios de Mudanças <ArrowRight className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] text-white/60 font-bold">Completo</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-2.5 py-1">
              <BrainCircuit className="w-3 h-3 text-black/70" />
              <span className="text-[10px] text-black/70 font-semibold">Viagg-TX8</span>
            </div>
          </div>
        </div>

        {/* Grid de Cards Grandes */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
          {PROFILES.map((profile) => (
            <ProfileCardItem
              key={profile.id}
              profile={profile}
              onAccess={() => handleAccess(profile)}
              onRegister={profile.registerRoute ? () => handleRegister(profile) : null}
            />
          ))}
        </div>

        {/* Card fixo — Minha Conta */}
        <button
          onClick={() => navigate("/viagens/minha-conta")}
          className="w-full max-w-3xl mt-5 group relative overflow-hidden bg-gradient-to-br from-[#0f3460] to-[#16213e] rounded-3xl shadow-xl border border-white/10 p-5 text-left hover:scale-[1.01] hover:brightness-110 active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 shadow-lg text-3xl overflow-hidden">
                {!user ? (
                  <img src={viaggLogo} alt="Viagg-TX8 Logo" className="w-full h-full object-cover" />
                ) : userAvatar ? (
                  <img src={userAvatar} alt="Avatar do usuário" className="w-full h-full object-cover" />
                ) : (
                  <img src={viaggLogo} alt="Viagg-TX8 Logo" className="w-full h-full object-cover" />
                )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-black text-white tracking-tight truncate">
                {displayName ? `Minha Conta • ${displayName}` : "Minha Conta"}
              </p>
              <p className="text-sm text-white/70 leading-snug">Seus anúncios, contatos e dados — tudo num lugar</p>
            </div>
            <ArrowRight className="w-5 h-5 text-white/70 shrink-0" />
          </div>
        </button>

        {/* Voltar */}
        <button
          onClick={() => { window.location.href = "/mercado"; }}
          className="mt-8 flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar ao mercado
        </button>
      </div>
      <ViaggAIChat welcomeMessage="Olá! 👋 Sou o Assistente da plataforma Viagg-TX8. Como posso te ajudar com Fretes ou Mudanças hoje?" />
    </MarketLayout>
  );
}
