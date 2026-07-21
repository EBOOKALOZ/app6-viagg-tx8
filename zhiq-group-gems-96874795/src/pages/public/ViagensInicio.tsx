import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Plane, Compass, BrainCircuit, CheckCircle2 } from "lucide-react";
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
    id:           "viagens",
    emoji:        "✈️",
    title:        "PASSAGENS & EXCURSÕES",
    subtitle:     "VIAGENS",
    description:  "Passagens, viagens e excursões para todo o Brasil.",
    benefits:     [
      "Excursões e pacotes rodoviários ou aéreos",
      "Negociação direta com agências e guias",
      "Roteiros personalizados e em grupo",
      "Segurança, conforto e ótimos preços"
    ],
    badge:        "✈️ Viagens & Excursões",
    accent:       "#0284C7",
    gradientFrom: "#0284C7",
    gradientTo:   "#0369A1",
    Icon:         Plane,
    route:        "/viagens/anuncios?subcategoria=Viagens",
    buttonLabel:  "Ver Anúncios de Viagens",
    registerRoute:"/auth?entry=advertiser",
    registerLabel:"Anunciar Minha Viagem",
    imageSrc:     "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=500&q=70&auto=format&fit=crop",
    callRoute:    "/viagens/anuncios?subcategoria=Viagens",
    callLabel:    "Acessar Viagens",
  },
  {
    id:           "turismo",
    emoji:        "🏖️",
    title:        "PASSEIOS & PACOTES",
    subtitle:     "TURISMO",
    description:  "Passeios, pacotes e turismo regional e nacional.",
    benefits:     [
      "Passeios ecológicos, praias e aventura",
      "Turismo regional de fim de semana e feriados",
      "Pacotes gastronômicos, culturais e religiosos",
      "Atendimento por guias certificados"
    ],
    badge:        "🏖️ Turismo & Lazer",
    accent:       "#F59E0B",
    gradientFrom: "#D97706",
    gradientTo:   "#B45309",
    Icon:         Compass,
    route:        "/viagens/anuncios?subcategoria=Turismo",
    buttonLabel:  "Ver Anúncios de Turismo",
    registerRoute:"/auth?entry=advertiser",
    registerLabel:"Anunciar Meu Pacote",
    imageSrc:     "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=70&auto=format&fit=crop",
    callRoute:    "/viagens/anuncios?subcategoria=Turismo",
    callLabel:    "Acessar Turismo",
  },
  {
    id:           "ia",
    emoji:        "🤖",
    title:        "ASSISTENTE VIAGG-TX8™",
    subtitle:     "INTELIGENTE",
    description:  "Atendimento 24h, roteiros personalizados, sugestões de passeios e dicas turísticas com o Viagg-TX8™.",
    benefits:     [
      "Disponível 24 horas",
      "Dúvidas sobre roteiros e destinos",
      "Sugestões ideais para sua viagem",
      "100% automático e instantâneo"
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
        className="group relative h-full overflow-hidden bg-gradient-to-br from-[#1C2028] via-[#171A21] to-[#121417] border border-[#F5E62B]/35 rounded-[28px] shadow-[0_18px_45px_rgba(0,0,0,0.45)] flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#F5E62B] hover:shadow-[0_30px_60px_rgba(0,0,0,0.55),0_0_35px_rgba(245,230,43,0.18)] w-full"
      >
        <div className="w-full flex items-center justify-center pt-6 px-8 relative">
           <span className="text-[11px] font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider bg-gradient-to-r from-[#F5E62B]/15 to-[#F5E62B]/5 text-[#F5E62B] border border-[#F5E62B]/20 shadow-sm transition-all duration-300">
             {profile.badge}
           </span>
        </div>

        <div
          className="mt-6 w-24 h-24 rounded-3xl overflow-hidden shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 border-2 border-[#F5E62B]/30 shadow-[0_0_30px_rgba(245,230,43,0.20)] ring-4 ring-[#1C2028] bg-[#1a1f28]"
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
              : <Icon className="w-12 h-12 text-[#F5E62B]" />
            }
          </div>
        </div>

        <div className="px-8 pt-6 w-full flex flex-col items-center">
          <p className="text-[14px] font-medium tracking-[0.2em] text-[#C9CED8] uppercase mb-1">{profile.title}</p>
          <p className="text-[34px] leading-none font-black tracking-tight text-[#F5E62B]">
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
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl shadow-[0_10px_25px_rgba(245,230,43,0.30)] font-black text-[18px] text-[#0A192F] transition-all duration-250 bg-[#F5E62B] hover:bg-[#EADB15] active:scale-[0.98]"
                >
                  {profile.registerLabel}
                  <ArrowRight className="w-5 h-5 text-[#0A192F]" />
                </button>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); onAccess(); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[17px] transition-all duration-250 bg-[#F5E62B] hover:bg-[#EADB15] text-[#0A192F] shadow-sm active:scale-[0.98]"
              >
                {profile.buttonLabel}
              </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onAccess(); }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl shadow-[0_10px_25px_rgba(245,230,43,0.30)] font-black text-[18px] text-[#0A192F] transition-all duration-250 bg-[#F5E62B] hover:bg-[#EADB15] active:scale-[0.98]"
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

export default function ViagensInicio() {
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
      blueFooterLabel="✈️ Viagens & Turismo"
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
          <h1 className="text-3xl font-black text-white drop-shadow">Módulo Viagens & Turismo</h1>
          <p className="text-white/90 text-base mt-1 font-semibold">Plataforma VIAGG-TX8™</p>
        </div>

        {/* Card de destaque — VIAGENS E TURISMO (full width) */}
        <div className="w-full max-w-3xl mb-5">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-3xl shadow-2xl border-2 border-[#F5E62B]/50 p-6 text-left">
            <span className="hidden sm:block absolute top-4 right-4 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide bg-[#F5E62B]/20 text-[#F5E62B] border border-[#F5E62B]/40">
              NACIONAL & REGIONAL
            </span>

            <div className="flex items-start sm:items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 shadow-lg border border-[#F5E62B]/40">
                {userAvatar ? (
                  <img src={userAvatar} alt="Foto do usuário" className="w-full h-full object-cover" />
                ) : (
                  <img src={viaggLogo} alt="Viagg-TX8 Logo" className="w-full h-full object-cover" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <span className="inline-block sm:hidden text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide bg-[#F5E62B]/20 text-[#F5E62B] border border-[#F5E62B]/40 mb-1.5 w-fit">
                  NACIONAL & REGIONAL
                </span>
                <p className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">EXPLORE DESTINOS E PASSEIOS</p>
                <p className="text-sm sm:text-base font-black text-[#F5E62B] tracking-tight">VIAGENS OU TURISMO</p>
                <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 leading-snug">
                  Selecione abaixo a modalidade desejada para explorar excursões ou reservar pacotes turísticos incríveis.
                </p>
              </div>
            </div>

            {/* ESCOLHA RÁPIDA DE MODALIDADE */}
            <div className="mt-6 pt-5 border-t border-white/15">
              <p className="text-xs font-black tracking-wider uppercase text-[#F5E62B] mb-3.5 flex items-center gap-1.5">
                ⚡ Escolha a modalidade de passeio:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* ── CARD RÁPIDO 1: VIAGENS ── */}
                <button
                  onClick={() => navigate("/viagens/anuncios?subcategoria=Viagens")}
                  className="group relative flex flex-col justify-between bg-zinc-900/90 border-2 border-[#0284C7]/60 hover:border-[#38BDF8] rounded-2xl p-4 shadow-xl hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#0284C7]/20 transition-all text-left overflow-hidden"
                >
                  <div className="w-full h-36 rounded-xl overflow-hidden mb-4 relative bg-[#141820] border border-white/10 shrink-0 shadow-inner">
                    <img src={PROFILES[0].imageSrc} alt="Viagens" className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div>
                    <span className="inline-block text-[9px] font-black tracking-widest uppercase bg-[#0284C7]/20 text-[#38BDF8] px-2.5 py-0.5 rounded-full border border-[#0284C7]/40 mb-1.5">
                      PASSAGENS & EXCURSÕES
                    </span>
                    <h4 className="text-xl font-black text-white tracking-tight">✈️ VIAGENS</h4>
                    <p className="text-xs text-[#A7B0BE] mt-1 leading-snug">
                      Passagens, excursões completas e viagens para diversos destinos rodoviários ou aéreos.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between w-full">
                    <span className="text-xs font-black text-[#38BDF8] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Ver Anúncios de Viagens <ArrowRight className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] text-white/60 font-bold">Destinos</span>
                  </div>
                </button>

                {/* ── CARD RÁPIDO 2: TURISMO ── */}
                <button
                  onClick={() => navigate("/viagens/anuncios?subcategoria=Turismo")}
                  className="group relative flex flex-col justify-between bg-zinc-900/90 border-2 border-[#F59E0B]/60 hover:border-[#FBBF24] rounded-2xl p-4 shadow-xl hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#F59E0B]/20 transition-all text-left overflow-hidden"
                >
                  <div className="w-full h-36 rounded-xl overflow-hidden mb-4 relative bg-[#141820] border border-white/10 shrink-0 shadow-inner">
                    <img src={PROFILES[1].imageSrc} alt="Turismo" className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  <div>
                    <span className="inline-block text-[9px] font-black tracking-widest uppercase bg-[#F59E0B]/20 text-[#FBBF24] px-2.5 py-0.5 rounded-full border border-[#F59E0B]/40 mb-1.5">
                      PASSEIOS & PACOTES
                    </span>
                    <h4 className="text-xl font-black text-white tracking-tight">🏖️ TURISMO</h4>
                    <p className="text-xs text-[#A7B0BE] mt-1 leading-snug">
                      Passeios, pacotes turísticos, ecoturismo e turismo regional com guias e agências especializadas.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between w-full">
                    <span className="text-xs font-black text-[#FBBF24] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Ver Anúncios de Turismo <ArrowRight className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] text-white/60 font-bold">Lazer</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-2.5 py-1">
              <BrainCircuit className="w-3 h-3 text-[#F5E62B]" />
              <span className="text-[10px] text-[#F5E62B] font-semibold">Viagg-TX8</span>
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
              <p className="text-sm text-white/70 leading-snug">Seus anúncios, agência e pacotes — tudo num lugar</p>
            </div>
            <ArrowRight className="w-5 h-5 text-white/70 shrink-0" />
          </div>
        </button>

        {/* Voltar */}
        <button
          onClick={() => { window.location.href = "/mercado"; }}
          className="mt-8 flex items-center gap-1.5 text-black/80 hover:text-black text-sm font-bold transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar ao mercado
        </button>
      </div>
      <ViaggAIChat welcomeMessage="Olá! 👋 Sou o Assistente da plataforma Viagg-TX8. Como posso te ajudar com Viagens, Excursões ou Turismo hoje?" />
    </MarketLayout>
  );
}
