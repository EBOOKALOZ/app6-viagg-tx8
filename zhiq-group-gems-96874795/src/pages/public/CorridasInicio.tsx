import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Car, Bike, Package, BrainCircuit, UserPlus, MapPin } from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { useState } from "react";
import viaggLogo from "@/assets/logo.png";
import motoboyHero from "@/assets/motoboy-hero.png";
// ─── Tipo ─────────────────────────────────────────────────────────────────────
interface ProfileCard {
  id:             string;
  emoji:          string;
  title:          string;
  subtitle:       string;
  description:    string;
  badge:          string;
  accent:         string;         // cor principal (Tailwind inline)
  gradientFrom:   string;
  gradientTo:     string;
  Icon:           React.ElementType;
  route:          string | null;  // null = card de IA (abre chat)
  buttonLabel:    string;
  registerRoute:  string | null;  // null = sem botão de cadastro
  registerLabel:  string;
  imageSrc?:      string;
}

// ─── Cards ────────────────────────────────────────────────────────────────────
const PROFILES: ProfileCard[] = [
  {
    id:           "mototaxi",
    emoji:        "🚖",
    title:        "MOTO-TÁXI",
    subtitle:     "PASSAGEIRO",
    description:  "Receba corridas de passageiros, aumente sua renda e cresça na plataforma.",
    badge:        "Ganhe dinheiro",
    accent:       "#FF6A00",
    gradientFrom: "#FF6A00",
    gradientTo:   "#FF8C00",
    Icon:         Bike,
    route:        "/select-profile?profile=mototaxi",
    buttonLabel:  "Acessar Painel",
    registerRoute:"/motoboy/completar",
    registerLabel:"Cadastrar Moto Táxi",
    imageSrc:     "https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/platform-assets/moto-taxi.png",
  },
  {
    id:           "motoboy",
    emoji:        "🏍️",
    title:        "MOTOBOY",
    subtitle:     "ENTREGAS",
    description:  "Faça entregas rápidas, gerencie corridas e maximize seus ganhos diários.",
    badge:        "Ganhe dinheiro",
    accent:       "#DC2626",
    gradientFrom: "#DC2626",
    gradientTo:   "#EF4444",
    Icon:         Package,
    route:        "/select-profile?profile=motoboy",
    buttonLabel:  "Acessar Painel",
    registerRoute:"/motoboy/completar",
    registerLabel:"Cadastrar Motoboy",
    imageSrc:     motoboyHero,
  },
  {
    id:           "motorista",
    emoji:        "🚗",
    title:        "MOTORISTA",
    subtitle:     "PARTICULAR",
    description:  "Realize corridas, gerencie comissões e conquiste mais clientes com seu veículo.",
    badge:        "Ganhe dinheiro",
    accent:       "#D97706",
    gradientFrom: "#D97706",
    gradientTo:   "#F59E0B",
    Icon:         Car,
    route:        "/select-profile?profile=driver",
    buttonLabel:  "Acessar Painel",
    registerRoute:"/select-profile",
    registerLabel:"Cadastrar Motorista",
    imageSrc:     "https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/motorista-card.png/Motorista.png",
  },
  {
    id:           "ia",
    emoji:        "🤖",
    title:        "ASSISTENTE IA",
    subtitle:     "INTELIGENTE",
    description:  "Atendimento 24h, suporte, análise de corridas e sugestões automáticas com IA.",
    badge:        "NOVO",
    accent:       "#6366F1",
    gradientFrom: "#6366F1",
    gradientTo:   "#8B5CF6",
    Icon:         BrainCircuit,
    route:        null,
    buttonLabel:  "Acessar IA",
    registerRoute:null,
    registerLabel:"",
  },
];

// ─── Card individual ──────────────────────────────────────────────────────────
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
    <div className="flex flex-col gap-2">
      {/* Card principal */}
      <button
        onClick={onAccess}
        className="group relative overflow-hidden bg-zinc-900 border border-zinc-700/50 rounded-3xl shadow-2xl flex flex-col items-center text-center hover:scale-[1.02] active:scale-[0.98] transition-all w-full"
      >
        {/* Badge */}
        <span
          className="absolute top-4 right-4 z-10 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide border"
          style={{ color: profile.accent, borderColor: `${profile.accent}40`, background: `${profile.accent}18` }}
        >
          {profile.badge}
        </span>

        {/* Ícone */}
        <div
          className="mt-8 w-20 h-20 rounded-3xl overflow-hidden shadow-xl border-2 border-zinc-700 shrink-0 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${profile.gradientFrom}, ${profile.gradientTo})` }}
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
              : <Icon className="w-11 h-11 text-white" />
            }
          </div>
        </div>

        {/* Texto */}
        <div className="px-6 pt-4 w-full">
          <p className="text-xl font-black tracking-tight text-white">{profile.title}</p>
          <p className="text-2xl font-black tracking-tight" style={{ color: profile.accent }}>{profile.subtitle}</p>
          <p className="text-sm mt-2 leading-relaxed text-zinc-400">{profile.description}</p>
        </div>

        {/* Info de cadastro */}
        {!isIA && (
          <div className="mx-6 mt-4 w-[calc(100%-3rem)] text-left rounded-2xl border border-zinc-700 bg-white/5 px-4 py-3 flex items-start gap-2.5">
            <div className="mt-0.5 shrink-0 w-7 h-7 rounded-xl flex items-center justify-center bg-white/10">
              <UserPlus className="w-3.5 h-3.5" style={{ color: profile.accent }} />
            </div>
            <p className="text-[11px] mt-0.5 leading-relaxed text-zinc-400">
              Cadastre-se gratuitamente e comece a receber chamadas na plataforma.
            </p>
          </div>
        )}

        {isIA && (
          <div className="mx-6 mt-4 w-[calc(100%-3rem)] text-left rounded-2xl border border-indigo-700/30 bg-indigo-900/20 px-4 py-3 flex items-start gap-2.5">
            <div className="mt-0.5 shrink-0 w-7 h-7 rounded-xl flex items-center justify-center bg-white/10">
              <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <p className="text-[11px] mt-0.5 leading-relaxed text-zinc-400">
              Atendimento inteligente, suporte 24h e integração com GPT, DeepSeek e mais.
            </p>
          </div>
        )}

        {/* Botão de acesso */}
        <div
          className="flex items-center gap-2 px-6 py-2.5 mt-4 mb-6 rounded-2xl shadow-lg"
          style={{ background: `linear-gradient(90deg, ${profile.gradientFrom}, ${profile.gradientTo})` }}
        >
          <span className="font-black text-sm text-white">{profile.buttonLabel}</span>
          <ArrowRight className="w-4 h-4 text-white" />
        </div>
      </button>

      {/* Botão de cadastro — abaixo do card */}
      {onRegister && (
        <button
          onClick={(e) => { e.stopPropagation(); onRegister(); }}
          className="w-full py-3 rounded-2xl border font-bold text-sm transition-all hover:bg-white/5 active:scale-[0.98]"
          style={{ borderColor: `${profile.accent}50`, color: profile.accent }}
        >
          + {profile.registerLabel}
        </button>
      )}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function CorridasInicio() {
  const navigate  = useNavigate();
  const [search, setSearch] = useState("");

  function handleAccess(profile: ProfileCard) {
    if (profile.id === "ia") {
      // Abre o chat flutuante
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
      blueFooterLabel="🚗 Corridas"
      mainClassName="bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460]"
    >
      <div className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center px-4 py-10">

        {/* Título */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20">
              <img src={viaggLogo} alt="Viagg-TX8" className="w-full h-full object-cover" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white drop-shadow">Módulo Corridas</h1>
          <p className="text-white/60 text-base mt-1">Plataforma VIAGG-TX8™</p>
        </div>

        {/* Card de destaque — PEDIDOS DE CORRIDAS (full width) */}
        <div className="w-full max-w-3xl mb-5">
          <button
            onClick={() => navigate("/solicitar-corrida")}
            className="group w-full relative overflow-hidden bg-gradient-to-br from-[#FF6A00] to-[#FF4500] rounded-3xl shadow-2xl shadow-orange-900/40 border border-[#FF6A00]/40 p-6 text-left hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] transition-all"
          >
            {/* Badge */}
            <span className="absolute top-4 right-4 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide bg-white/20 text-white border border-white/30">
              24H
            </span>

            <div className="flex items-center gap-4">
              {/* Ícone */}
              <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 shadow-lg">
                <MapPin className="w-8 h-8 text-white" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-2xl font-black text-white tracking-tight">PEDIDOS DE CORRIDAS</p>
                <p className="text-base font-black text-orange-200 tracking-tight">SOLICITAR AGORA</p>
                <p className="text-sm text-orange-100/80 mt-1 leading-snug">
                  Moto Táxi, Motorista, Táxi, Motoboy, Entrega Expressa ou Frete — rastreio em tempo real e pagamento pela plataforma.
                </p>
              </div>
            </div>

            {/* Botão interno */}
            <div className="mt-5 flex items-center gap-2 bg-white/15 border border-white/20 rounded-2xl px-5 py-3 w-fit">
              <span className="font-black text-white text-sm">🚖 Solicitar Corrida</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </div>

            {/* IA badge */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-2.5 py-1">
              <BrainCircuit className="w-3 h-3 text-white/70" />
              <span className="text-[10px] text-white/70 font-semibold">IA VIAGG</span>
            </div>
          </button>
        </div>

        {/* Grid 2×2 — demais serviços */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PROFILES.map((profile) => (
            <ProfileCardItem
              key={profile.id}
              profile={profile}
              onAccess={() => handleAccess(profile)}
              onRegister={profile.registerRoute ? () => handleRegister(profile) : null}
            />
          ))}
        </div>

        {/* Voltar */}
        <button
          onClick={() => { window.location.href = "/mercado"; }}
          className="mt-8 flex items-center gap-1.5 text-white/50 hover:text-white text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar ao mercado
        </button>
      </div>
    </MarketLayout>
  );
}
