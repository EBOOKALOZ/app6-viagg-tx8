import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Car, Bike, Package, BrainCircuit, UserPlus, MapPin, CheckCircle2 } from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { ViaggAIChat } from "@/components/public/ViaggAIChat";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import viaggLogo from "@/assets/logo.png";
import motoboyHero from "@/assets/motoboy-hero.png";
// ─── Tipo ─────────────────────────────────────────────────────────────────────
interface ProfileCard {
  id:             string;
  emoji:          string;
  title:          string;
  subtitle:       string;
  description:    string;
  benefits?:      string[];       // nova propriedade
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

// ─── Cards ────────────────────────────────────────────────────────────────────
const PROFILES: ProfileCard[] = [
  {
    id:           "mototaxi",
    emoji:        "🚖",
    title:        "MOTO-TÁXI",
    subtitle:     "PASSAGEIRO",
    description:  "Conecte-se rapidamente aos passageiros próximos e aumente sua renda com segurança.",
    benefits:     [
      "Cadastro 100% gratuito",
      "Sem mensalidade fixa",
      "Receba direto na carteira",
      "Trabalhe no seu horário"
    ],
    badge:        "⭐ Profissional Parceiro",
    accent:       "#FF6A00",
    gradientFrom: "#FF6A00",
    gradientTo:   "#FF8C00",
    Icon:         Bike,
    route:        "/mototaxi/profile",
    buttonLabel:  "Entrar como Moto Táxi",
    registerRoute:"/mototaxi/profile",
    registerLabel:"Cadastrar Agora",
    imageSrc:     "https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/platform-assets/moto-taxi.png",
    callRoute:    "/solicitar-corrida?service=mototaxi",
    callLabel:    "Chamar Moto Táxi",
  },
  {
    id:           "motoboy",
    emoji:        "🏍️",
    title:        "MOTOBOY",
    subtitle:     "ENTREGAS",
    description:  "Faça entregas rápidas na sua região, gerencie suas corridas e maximize seus ganhos diários.",
    benefits:     [
      "Sem taxa de adesão",
      "Corridas e entregas locais",
      "Saques direto no app",
      "Suporte humanizado"
    ],
    badge:        "🚀 Mais Chamadas",
    accent:       "#DC2626",
    gradientFrom: "#DC2626",
    gradientTo:   "#EF4444",
    Icon:         Package,
    route:        "/motoboy/profile",
    buttonLabel:  "Acessar Meu Painel",
    registerRoute:"/motoboy/profile",
    registerLabel:"Cadastrar Agora",
    imageSrc:     motoboyHero,
    callRoute:    "/solicitar-corrida?service=motoboy",
    callLabel:    "Chamar Motoboy",
  },
  {
    id:           "motorista",
    emoji:        "🚗",
    title:        "MOTORISTA",
    subtitle:     "PARTICULAR",
    description:  "Realize viagens seguras, tenha previsibilidade de ganhos e conquiste mais clientes.",
    benefits:     [
      "Menor taxa do mercado",
      "Passageiros verificados",
      "Pagamentos no Pix",
      "Clube de benefícios"
    ],
    badge:        "🟢 Cadastro Gratuito",
    accent:       "#D97706",
    gradientFrom: "#D97706",
    gradientTo:   "#F59E0B",
    Icon:         Car,
    route:        "/driver/profile",
    buttonLabel:  "Acessar Meu Painel",
    registerRoute:"/driver/profile",
    registerLabel:"Cadastrar Agora",
    imageSrc:     "https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/motorista-card.png/Motorista.png",
    callRoute:    "/solicitar-corrida?service=motorista",
    callLabel:    "Chamar Motorista",
  },
  {
    id:           "ia",
    emoji:        "🤖",
    title:        "ASSISTENTE IA",
    subtitle:     "INTELIGENTE",
    description:  "Atendimento 24h, suporte, análise de corridas e sugestões automáticas com IA de ponta.",
    benefits:     [
      "Disponível 24 horas",
      "Solução rápida de dúvidas",
      "Suporte e integrações",
      "100% automático"
    ],
    badge:        "✨ Tecnologia",
    accent:       "#6366F1",
    gradientFrom: "#6366F1",
    gradientTo:   "#8B5CF6",
    Icon:         BrainCircuit,
    route:        null,
    buttonLabel:  "Falar com a IA",
    registerRoute:null,
    registerLabel:"",
    callRoute:    null,
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
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full">
      {/* Card principal */}
      <div
        className="group relative h-full overflow-hidden bg-gradient-to-br from-[#1C2028] via-[#171A21] to-[#121417] border border-[#FF7A00]/35 rounded-[28px] shadow-[0_18px_45px_rgba(0,0,0,0.45)] flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#FF7A00] hover:shadow-[0_30px_60px_rgba(0,0,0,0.55),0_0_35px_rgba(255,122,0,0.18)] w-full"
      >
        {/* Cabeçalho do Card (Top bar c/ Badge) */}
        <div className="w-full flex items-center justify-center pt-6 px-8 relative">
           <span className="text-[11px] font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider bg-gradient-to-r from-[#FF7A00]/15 to-[#FF7A00]/5 text-[#FF7A00] border border-[#FF7A00]/20 shadow-sm transition-all duration-300">
             {profile.badge}
           </span>
        </div>

        {/* Imagem */}
        <div
          className="mt-6 w-24 h-24 rounded-3xl overflow-hidden shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 border-2 border-[#FF7A00]/30 shadow-[0_0_30px_rgba(255,122,0,0.20)] ring-4 ring-[#1C2028] bg-[#1a1f28]"
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
              : <Icon className="w-12 h-12 text-[#FF7A00]" />
            }
          </div>
        </div>

        {/* Categoria e Título */}
        <div className="px-8 pt-6 w-full flex flex-col items-center">
          <p className="text-[14px] font-medium tracking-[0.2em] text-[#C9CED8] uppercase mb-1">{profile.title}</p>
          <p className="text-[34px] leading-none font-black tracking-tight text-[#FF7A00]">
            {profile.subtitle}
          </p>
          <p className="text-[16px] mt-4 leading-snug text-[#D7DCE5] line-clamp-2 px-2">
            {profile.description}
          </p>
        </div>

        {/* Área de Benefícios */}
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

        {/* Espaçador flexível para empurrar os botões para o final se houver variação de altura */}
        <div className="flex-1 min-h-[1.5rem]" />

        {/* Botões de Ação */}
        <div className="flex flex-col gap-3 px-8 pb-8 w-full shrink-0">
          {profile.callRoute ? (
            <>
              {/* Botão Principal (Cadastrar) */}
              {onRegister && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRegister(); }}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl shadow-[0_10px_25px_rgba(0,184,77,0.30)] font-black text-[18px] text-white transition-all duration-250 bg-[#00B84D] hover:bg-[#00D65A] active:scale-[0.98]"
                >
                  {profile.registerLabel}
                  <ArrowRight className="w-5 h-5 text-white" />
                </button>
              )}

              {/* Botão Secundário (Painel) */}
              <button
                onClick={(e) => { e.stopPropagation(); onAccess(); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[17px] transition-all duration-250 bg-[#FFC928] hover:bg-[#FFD447] text-[#1B1B1B] shadow-sm active:scale-[0.98]"
              >
                {profile.buttonLabel}
              </button>

              {/* Botão Chamar (Terciário) */}
              <button
                onClick={(e) => { e.stopPropagation(); navigate("/meus-dados?next=" + encodeURIComponent(profile.callRoute!)); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-[15px] text-[#9AA3B3] border border-[#404957] bg-transparent transition-all duration-250 hover:bg-[#252A34] hover:text-[#D7DCE5] active:scale-[0.98]"
              >
                🚖 {profile.callLabel ?? "Chamar"}
              </button>
            </>
          ) : (
            /* Botão Único (ex: IA) */
            <button
              onClick={(e) => { e.stopPropagation(); onAccess(); }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl shadow-[0_10px_25px_rgba(0,184,77,0.30)] font-black text-[18px] text-white transition-all duration-250 bg-[#00B84D] hover:bg-[#00D65A] active:scale-[0.98]"
            >
              {profile.buttonLabel}
              <ArrowRight className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function CorridasInicio() {
  const navigate  = useNavigate();
  const { user, avatarUrl, displayName } = useAuth();
  const [search, setSearch] = useState("");

  const userAvatar = avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

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
      myAccountPath="/minha-carteira"
      mainClassName="bg-gradient-to-b from-[#FF6A00] via-[#FF7E1A] to-[#FF8C00]"
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
            className="group w-full relative overflow-hidden bg-gradient-to-br from-[#68c7f2] to-[#4aa8d8] rounded-3xl shadow-2xl shadow-sky-900/40 border border-[#68c7f2]/40 p-6 text-left hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] transition-all"
          >
            {/* Badge */}
            <span className="absolute top-4 right-4 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide bg-white/20 text-black border border-white/30">
              24H
            </span>

            <div className="flex items-center gap-4">
              {/* Ícone: foto do usuário (se tiver) → logo da plataforma */}
              <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 shadow-lg border border-white/20">
                {userAvatar ? (
                  <img src={userAvatar} alt="Foto do usuário" className="w-full h-full object-cover" />
                ) : (
                  <img src={viaggLogo} alt="Viagg-TX8 Logo" className="w-full h-full object-cover" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-2xl font-black text-black tracking-tight">PEDIDOS DE CORRIDAS</p>
                <p className="text-base font-black text-black/80 tracking-tight">SOLICITAR AGORA</p>
                <p className="text-sm text-black/70 mt-1 leading-snug">
                  Moto Táxi, Motorista, Táxi, Motoboy, Entrega Expressa ou Frete — rastreio em tempo real e pagamento pela plataforma.
                </p>
              </div>
            </div>

            {/* Botão interno */}
            <div className="mt-5 flex items-center gap-2 bg-white/15 border border-white/20 rounded-2xl px-5 py-3 w-fit">
              <span className="font-black text-black text-sm">🚖 Solicitar Corrida</span>
              <ArrowRight className="w-4 h-4 text-black" />
            </div>

            {/* IA badge */}
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-2.5 py-1">
              <BrainCircuit className="w-3 h-3 text-black/70" />
              <span className="text-[10px] text-black/70 font-semibold">IA VIAGG</span>
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

        {/* Card fixo — Minha Conta (perfis + carteira + dados, sempre visível) */}
        <button
          onClick={() => navigate("/conta")}
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
              <p className="text-sm text-white/70 leading-snug">Perfis, carteira e seus dados — tudo num lugar</p>
            </div>
            <ArrowRight className="w-5 h-5 text-white/70 shrink-0" />
          </div>
        </button>

        {/* Banner — saldo mínimo para chamar uma corrida (UI; regra liga com o pagamento) */}
        <button
          onClick={() => navigate("/minha-carteira")}
          className="w-full max-w-3xl mt-3 group flex items-center gap-3 rounded-2xl border border-[#FF6A00]/40 bg-[#FF6A00]/10 px-5 py-3.5 text-left hover:bg-[#FF6A00]/15 active:scale-[0.99] transition-all"
        >
          <span className="text-2xl shrink-0">💰</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">Adicione R$ 35,00 (mínimo) para chamar uma corrida</p>
            <p className="text-xs text-orange-100/70">O saldo garante o pagamento ao profissional. Toque para adicionar.</p>
          </div>
          <span className="hidden sm:inline-flex shrink-0 rounded-xl bg-[#FF6A00] px-3 py-1.5 text-xs font-black text-white shadow-md">Adicionar saldo</span>
        </button>

        {/* Voltar */}
        <button
          onClick={() => { window.location.href = "/mercado"; }}
          className="mt-8 flex items-center gap-1.5 text-white/50 hover:text-white text-sm font-medium transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar ao mercado
        </button>
      </div>
      <ViaggAIChat welcomeMessage="Olá! 👋 Sou o Assistente IA VIAGG. Como posso te ajudar com as corridas hoje?" />
    </MarketLayout>
  );
}
