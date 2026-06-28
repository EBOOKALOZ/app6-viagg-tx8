import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, Car, Bike, UserPlus } from "lucide-react";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import motoristaHero from "@/assets/motorista-hero.png";
import { useState } from "react";

// ─── Definição dos perfis ─────────────────────────────────────────────────────
// Para adicionar novos perfis: basta incluir um novo objeto neste array.
interface ProfileCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  badgeStyle: string;
  cardBg: string;
  iconBg: string;
  Icon: React.ElementType;
  iconColor: string;
  titleColor: string;
  subtitleColor: string;
  descColor: string;
  buttonBg: string;
  buttonText: string;
  route: string;
  buttonLabel: string;
  imageSrc?: string;           // foto de destaque (opcional)
  imagePosition?: string;      // object-position da foto
  ctaTitle: string;
  ctaText: string;
  ctaBg: string;
  ctaBorderColor: string;
  ctaIconColor: string;
  ctaTitleColor: string;
  ctaTextColor: string;
  ctaRegisterRoute: string;
}

const PROFILES: ProfileCard[] = [
  {
    id: "mototaxi",
    title: "MOTO-TÁXI",
    subtitle: "PASSAGEIRO",
    description: "Sou Moto-Taxista e quero receber corridas de passageiros e aumentar minha renda na plataforma.",
    badge: "Ganhe dinheiro",
    badgeStyle: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    cardBg: "bg-zinc-900",
    iconBg: "bg-gradient-to-br from-[#FF6A00] to-[#FF8C00]",
    Icon: Bike,
    iconColor: "text-white",
    titleColor: "text-white",
    subtitleColor: "text-[#FF8C00]",
    descColor: "text-zinc-400",
    buttonBg: "bg-[#FF6A00]",
    buttonText: "text-white",
    route: "/select-profile?profile=mototaxi",
    buttonLabel: "Acessar Painel Moto-Táxi",
    imageSrc: "https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/platform-assets/moto-taxi.png",
    imagePosition: "object-top",
    ctaTitle: "Seja um Moto-Taxista Parceiro!",
    ctaText: "Cadastre-se gratuitamente, receba chamadas de corridas e aumentar sua renda com a plataforma.",
    ctaBg: "bg-white/10",
    ctaBorderColor: "border-white/20",
    ctaIconColor: "text-[#FF8C00]",
    ctaTitleColor: "text-white",
    ctaTextColor: "text-zinc-300",
    ctaRegisterRoute: "/motoboy/completar",
  },
  {
    id: "motorista",
    title: "MOTORISTA",
    subtitle: "PARTICULAR",
    description: "Sou Motorista Particular e quero realizar corridas e gerenciar minhas comissões pela plataforma.",
    badge: "Ganhe dinheiro",
    badgeStyle: "bg-amber-100 text-amber-700",
    cardBg: "bg-white",
    iconBg: "bg-gradient-to-br from-amber-500 to-amber-600",
    Icon: Car,
    iconColor: "text-white",
    titleColor: "text-zinc-900",
    subtitleColor: "text-amber-600",
    descColor: "text-zinc-500",
    buttonBg: "bg-amber-500",
    buttonText: "text-white",
    route: "/select-profile?profile=driver",
    buttonLabel: "Acessar Painel Motorista",
    imageSrc: motoristaHero,
    imagePosition: "object-center",
    ctaTitle: "Seja um Motorista Parceiro!",
    ctaText: "Faça seu cadastro, receba solicitações de viagens e comece a gerar renda utilizando seu veículo.",
    ctaBg: "bg-amber-50",
    ctaBorderColor: "border-amber-300",
    ctaIconColor: "text-amber-500",
    ctaTitleColor: "text-amber-900",
    ctaTextColor: "text-zinc-600",
    ctaRegisterRoute: "/select-profile",
  },
];

// ─── Card individual ──────────────────────────────────────────────────────────
function ProfileCardItem({
  profile,
  onClick,
}: {
  profile: ProfileCard;
  onClick: () => void;
}) {
  const { Icon } = profile;

  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden ${profile.cardBg} rounded-3xl shadow-2xl flex flex-col items-center text-center hover:scale-[1.02] active:scale-[0.98] transition-transform w-full`}
    >
      {/* Badge */}
      <span className={`absolute top-4 right-4 z-10 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide ${profile.badgeStyle}`}>
        {profile.badge}
      </span>

      {/* Ícone com foto ou SVG — tamanho e posição fixos */}
      <div className="mt-8 w-20 h-20 rounded-3xl overflow-hidden shadow-xl border-2 border-zinc-600 shrink-0 flex items-center justify-center">
        {profile.imageSrc ? (
          <img
            src={profile.imageSrc}
            alt={profile.title}
            className={`w-full h-full object-cover ${profile.imagePosition ?? "object-center"}`}
          />
        ) : (
          <div className={`w-full h-full ${profile.iconBg} flex items-center justify-center`}>
            <Icon className={`w-11 h-11 ${profile.iconColor}`} />
          </div>
        )}
      </div>

      {/* Título + descrição */}
      <div className="px-6 pt-4 w-full">
        <p className={`text-xl font-black tracking-tight ${profile.titleColor}`}>{profile.title}</p>
        <p className={`text-2xl font-black tracking-tight ${profile.subtitleColor}`}>{profile.subtitle}</p>
        <p className={`text-sm mt-2 leading-relaxed ${profile.descColor}`}>{profile.description}</p>
      </div>

      {/* CTA integrado */}
      <div className={`mx-6 mt-4 w-[calc(100%-3rem)] text-left rounded-2xl border ${profile.ctaBorderColor} ${profile.ctaBg} px-4 py-3 flex items-start gap-2.5`}>
        <div className="mt-0.5 shrink-0 w-7 h-7 rounded-xl flex items-center justify-center bg-white/10">
          <UserPlus className={`w-3.5 h-3.5 ${profile.ctaIconColor}`} />
        </div>
        <div>
          <p className={`text-xs font-black ${profile.ctaTitleColor}`}>{profile.ctaTitle}</p>
          <p className={`text-[11px] mt-0.5 leading-relaxed ${profile.ctaTextColor}`}>{profile.ctaText}</p>
        </div>
      </div>

      {/* Botão */}
      <div className={`flex items-center gap-2 px-6 py-2.5 mt-4 mb-6 ${profile.buttonBg} rounded-2xl shadow-lg`}>
        <span className={`font-black text-sm ${profile.buttonText}`}>{profile.buttonLabel}</span>
        <ArrowRight className={`w-4 h-4 ${profile.buttonText}`} />
      </div>
    </button>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function CorridasInicio() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

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
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shadow-lg">
              <Car className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white drop-shadow">Módulo Corridas</h1>
          <p className="text-white/60 text-base mt-1">Plataforma VIAGG-TX8™</p>
        </div>

        {/* Cards — grid 2 colunas em desktop, 1 coluna em mobile */}
        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PROFILES.map((profile) => (
            <ProfileCardItem
              key={profile.id}
              profile={profile}
              onClick={() => navigate(profile.route)}
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
