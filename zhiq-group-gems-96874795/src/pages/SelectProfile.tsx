import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Loader2, CarFront, Car, Briefcase, Truck, Plane } from "lucide-react";
import { Logo } from "@/components/Logo";
import { FooterNeutralPublic } from "@/components/FooterNeutralPublic";
import { PROFILE_TYPES, getProfileRoute } from "@/lib/profileTypes";
import { cn } from "@/lib/utils";
import { requestAudioAndNotificationPermissions } from "@/lib/audioUnlock";
import LoadingButton from "@/components/LoadingButton";
import vendaAnuncioHero from "@/assets/venda-anuncio-hero.png";
import { useSoundtrackMusic } from "@/hooks/useSoundtrackMusic";
import appTheme from "@/assets/viagg_search_loop.mp3";

/** Onboarding routes per profile */
const ONBOARDING_ROUTES: Record<string, string> = {
  motoboy: "/motoboy/profile",
  mototaxi: "/mototaxi",
  merchant: "/loja/minha-loja", // Redirecionado diretamente para o dashboard unificado!
  driver: "/driver",
  passenger: "/passenger/completar",
};

/* ================================
   CONSTANTS
================================ */

const PROFILE_HERO_IMAGES: Record<string, string> = {
  merchant: new URL("@/assets/comerciante-hero.png", import.meta.url).href,
  motoboy: new URL("@/assets/motoboy-hero.png", import.meta.url).href,
  mototaxi: "https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/platform-assets/moto-taxi.png",
  driver: "https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/motorista-card.png/Motorista.png",
};

const PROFILE_DESCRIPTIONS: Record<string, string> = {
  motoboy: "Entregas rápidas de moto",
  mototaxi: "Transporte de passageiros de moto",
  driver: "Realize corridas de carro e gerencie suas comissões",
  merchant: "Aqui você gerencia sua loja, vende seus produtos e solicita aqui sua entrega",
  imoveis: "Anuncie imóveis e fale direto com os interessados",
  veiculos: "Anuncie veículos e fale direto com os interessados",
  servicos: "Divulgue sua empresa e receba contatos de clientes interessados",
  freteiro: "Transporte de cargas pesadas, mudanças, móveis e mercadorias",
  viagem: "Anuncie pacotes de viagem e receba contatos de viajantes interessados",
};

// Mosaico de 6 imagens (misturadas) usado como fundo do card de Imóveis.
const IMOVEIS_MOSAIC = [
  // casa
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&q=70&auto=format&fit=crop",
  // sítio / campo
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400&q=70&auto=format&fit=crop",
  // casa
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=70&auto=format&fit=crop",
  // fazenda / campo
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=70&auto=format&fit=crop",
  // casa
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=70&auto=format&fit=crop",
  // sítio / fazenda
  "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400&q=70&auto=format&fit=crop",
];

// Mosaico de 3 imagens usado como fundo do card de Viagens & Turismo.
const VIAGENS_MOSAIC = [
  // praia tropical
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=70&auto=format&fit=crop",
  // avião / viagem
  "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=500&q=70&auto=format&fit=crop",
  // montanha / natureza
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500&q=70&auto=format&fit=crop",
];

// Mosaico de 3 imagens (carro, moto, utilitário) usado como fundo do card de Veículos.
const VEICULOS_MOSAIC = [
  // carro
  "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=500&q=70&auto=format&fit=crop",
  // moto
  "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=500&q=70&auto=format&fit=crop",
  // utilitário / van
  "https://images.unsplash.com/photo-1606577924006-27d39b132ae2?w=500&q=70&auto=format&fit=crop",
];

// Mosaico de 3 imagens usado como fundo do card de Fretes & Transportes.
const FRETES_MOSAIC = [
  // caminhão baú
  "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=500&q=70&auto=format&fit=crop",
  // carregando caixas / mudança
  "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500&q=70&auto=format&fit=crop",
  // outro caminhão
  "https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=500&q=70&auto=format&fit=crop",
];

// Mosaico de 6 imagens (negócios/serviços) usado como fundo do card de Serviços.
const SERVICOS_MOSAIC = [
  // academia
  "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=70&auto=format&fit=crop",
  // dentista
  "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=400&q=70&auto=format&fit=crop",
  // farmácia
  "https://images.unsplash.com/photo-1576602976047-174e57a47881?w=400&q=70&auto=format&fit=crop",
  // mecânico (oficina escura, motor à noite)
  "https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?w=400&q=70&auto=format&fit=crop",
  // pedreiro / construção (obra ao entardecer, tons escuros)
  "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&q=70&auto=format&fit=crop",
  // jardineiro (mãos na terra escura)
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=70&auto=format&fit=crop",
];

// Mosaico de 3 imagens para o card de Motorista.
const DRIVER_MOSAIC = [
  "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=500&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=500&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=500&q=70&auto=format&fit=crop",
];

// Cards de oportunidades: Motoboy (entregas), Lojista (mercado), Imóveis, Veículos, Serviços, Fretes, Viagens e Comprador.
const CARD_ORDER = ["motoboy", "mototaxi", "driver", "merchant", "imoveis", "veiculos", "servicos", "freteiro", "viagem"];
const isPassengerEnabled = import.meta.env.VITE_ENABLE_PASSENGER_DEV === "true";

/* ================================
   COMPONENT
================================ */

export default function SelectProfile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { initialized, isLoading, user, availableProfiles, setAvailableProfiles, setActiveProfile, signOut, refreshProfiles } = useAuth();
  const { toast } = useToast();

  // Som do app ao abrir a tela de seleção de perfil
  useSoundtrackMusic({
    src: appTheme,
    startTime: 21,
    endTime: 47,
    volume: 0.2,
    isPlaying: true,
    fadeInDuration: 1000,
    fadeOutDuration: 500,
  });

  // Permite chegar com ?profile=motoboy (ex: botão Motoboy do topo) já com aquele
  // card pré-selecionado, sem travar a escolha — o usuário pode trocar livremente.
  const [selected, setSelected] = useState<string | null>(() => {
    const preselect = searchParams.get("profile");
    return preselect && CARD_ORDER.includes(preselect) ? preselect : null;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [progressActive, setProgressActive] = useState(false);
  /** Backend confirmed success — controls LoadingButton readiness */
  const [backendReady, setBackendReady] = useState(false);
  /** 0–100 progress fill for the Continue button */
  const [percent, setPercent] = useState(0);
  /** Where to navigate after loading completes */
  const navigationTarget = useRef<string | null>(null);
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!progressActive) {
      setPercent(0);
      navigatedRef.current = false;
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / 6000, 1);
      setPercent(Math.round(p * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progressActive]);

  useEffect(() => {
    if (!progressActive || navigatedRef.current) return;
    if (percent >= 100 && backendReady) {
      navigatedRef.current = true;
      const target = navigationTarget.current;
      if (target) window.location.href = target;
    }
  }, [percent, backendReady, progressActive, navigate]);

  const profileList = useMemo(() => CARD_ORDER.map((id) => PROFILE_TYPES[id]).filter(Boolean), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { };
  }, []);

  /* ================================
     GUARDS INICIAIS
  ================================ */

  if (!initialized || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  /* ================================
     HANDLERS
  ================================ */

  const handleCardClick = (profileId: string) => {
    if (profileId === "passenger" && !isPassengerEnabled) return;
    setSelected((prev) => (prev === profileId ? null : profileId));
  };

  const handleContinue = async () => {
    if (isSaving || !selected) return;

    setIsSaving(true);
    setBackendReady(false);

    const isQueroVender = selected === "quero_vender";
    const isAnimatedProfile = true;

    if (isAnimatedProfile) {
      setProgressActive(true);
    }

    if (isQueroVender) {
      try {
        navigationTarget.current = "/anunciante/painel";
        // Simulate a brief "check" to trigger the 0-100% progress feel
        setTimeout(() => {
          setBackendReady(true);
        }, 1200); // Slightly more premium delay for the 0-100% animation
        return;
      } catch (err: any) {
        setIsSaving(false);
        setProgressActive(false);
        return;
      }
    }

    // Lojista: vai direto para o painel do anunciante (AdvertiserProtectedRoute cuida do acesso).
    // Não usa a rota /loja/minha-loja para evitar bloqueio por loja inexistente.
    if (selected === "merchant") {
      navigationTarget.current = "/anunciante/painel";
      // Atualiza perfil no BD em background (sem bloquear a navegação)
      void (async () => {
        try {
          await supabase.rpc("ensure_merchant_profile", { p_user_id: user.id } as any).catch(() => {});
          const updated = availableProfiles.includes("merchant")
            ? availableProfiles
            : [...availableProfiles, "merchant"];
          await (supabase.from("profiles") as any)
            .update({ available_profiles: updated, active_profile: "merchant" })
            .eq("id", user.id);
        } catch { /* silencioso */ }
      })();
      setTimeout(() => { setBackendReady(true); }, 1200);
      return;
    }

    // Imóveis: vai pro painel resumido de vendedores de imóveis.
    if (selected === "imoveis") {
      navigationTarget.current = "/anunciante/imoveis";
      setTimeout(() => { setBackendReady(true); }, 1200);
      return;
    }

    // Veículos: vai pro painel resumido de vendedores de veículos.
    if (selected === "veiculos") {
      navigationTarget.current = "/anunciante/veiculos";
      setTimeout(() => { setBackendReady(true); }, 1200);
      return;
    }

    // Serviços: vai pro painel resumido de anunciantes de serviços.
    if (selected === "servicos") {
      navigationTarget.current = "/anunciante/servicos";
      setTimeout(() => { setBackendReady(true); }, 1200);
      return;
    }

    // Fretes: vai pro painel resumido de anunciantes de fretes.
    if (selected === "freteiro") {
      navigationTarget.current = "/anunciante/fretes";
      setTimeout(() => { setBackendReady(true); }, 1200);
      return;
    }

    // Viagens: vai pro painel resumido de agências de viagem.
    if (selected === "viagem") {
      navigationTarget.current = "/anunciante/viagens";
      setTimeout(() => { setBackendReady(true); }, 1200);
      return;
    }

    try {
      await requestAudioAndNotificationPermissions();

      // Ensure profile exists in backend
      if (selected === "motoboy") {
        const { error } = await supabase.rpc("ensure_motoboy_profile", {
          p_user_id: user.id,
        } as any);
        if (error) console.warn("[SelectProfile] ensure_motoboy_profile function is not ready in backend, continuing anyway:", error.message);
      } else if (selected === "merchant") {
        const { error } = await supabase.rpc("ensure_merchant_profile", {
          p_user_id: user.id,
        } as any);
        if (error) console.warn("[SelectProfile] ensure_merchant_profile function is not ready in backend, continuing anyway:", error.message);
      } else if (selected === "driver") {
        // Garante que a linha driver_profiles existe (upsert silencioso)
        const { error } = await supabase
          .from("driver_profiles")
          .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
        if (error) console.warn("[SelectProfile] driver_profiles upsert failed, continuing anyway:", error.message);
      }

      // Adiciona o novo perfil ao array existente (não substitui)
      const updatedProfiles = availableProfiles.includes(selected)
        ? availableProfiles
        : [...availableProfiles, selected];
      await setAvailableProfiles(updatedProfiles);
      await setActiveProfile(selected, updatedProfiles);

      // Re-sync all profile data from backend after creation
      await refreshProfiles();

      // Check onboarding status via backend RPC
      const { data: isOnboarded, error: onboardingError } = await supabase.rpc(
        "check_profile_onboarding" as any,
        { p_profile_type: selected }
      );

      if (onboardingError) {
        console.warn("[SelectProfile] Onboarding check failed, defaulting to dashboard:", onboardingError.message);
      }

      // Determine navigation target based on backend response
      const onboardingComplete = isOnboarded === true;
      let target = onboardingComplete
        ? getProfileRoute(selected)
        : (ONBOARDING_ROUTES[selected] || getProfileRoute(selected));

      navigationTarget.current = target;

      if (isAnimatedProfile) {
        // Signal LoadingButton that backend is ready
        setBackendReady(true);
      } else {
        // Non-animated: navigate immediately
        window.location.href = target;
      }
    } catch (err: any) {
      toast({
        title: "Erro ao continuar",
        description: err?.message || "Erro inesperado.",
        variant: "destructive",
      });
      setIsSaving(false);
      setProgressActive(false);
      setBackendReady(false);
    }
  };

  /* ================================
     RENDER
  ================================ */

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="flex items-center gap-4 justify-center relative">
              <Logo size="2xl" />
              <div id="global-audio-portal" className="relative flex items-center shrink-0" />
            </div>
            <h1 className="text-2xl font-bold text-white mt-4">Selecione seu Perfil</h1>
            <p className="text-sm text-white/50">Escolha como deseja usar a plataforma</p>
          </div>

          <div className="flex justify-center">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
            {profileList.map((profile) => {
              const isComingSoon = profile.id === "passenger" && !isPassengerEnabled;
              const isSel = selected === profile.id && !isComingSoon;
              const heroImage = PROFILE_HERO_IMAGES[profile.id];
              const isMotoboy = profile.id === "motoboy";
              const isMotoTaxi = profile.id === "mototaxi";
              const isMerchant = profile.id === "merchant";
              const isImoveis = profile.id === "imoveis";
              const isVeiculos = profile.id === "veiculos";
              const isServicos = profile.id === "servicos";
              const isFretes = profile.id === "freteiro";
              const isViagem = profile.id === "viagem";
              const isDriver = profile.id === "driver";
              const isHighlighted = isMotoboy || isMotoTaxi || isMerchant || isImoveis || isVeiculos || isServicos || isFretes || isViagem || isDriver;

              return (
                <div
                  key={profile.id}
                  role="button"
                  tabIndex={isComingSoon ? -1 : 0}
                  onClick={() => !isComingSoon && handleCardClick(profile.id)}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isComingSoon) handleCardClick(profile.id); }}
                  aria-disabled={isComingSoon}
                  className={cn(
                    "group relative w-full overflow-hidden rounded-2xl aspect-[3/4] transition-all duration-300 select-none",
                    isComingSoon
                      ? "cursor-not-allowed"
                      : "cursor-pointer",
                    !isComingSoon && (isSel
                      ? cn(
                        "scale-[1.03] ring-[5px]",
                        isMotoboy
                          ? "ring-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.5)]"
                          : isMotoTaxi
                            ? "ring-blue-500 shadow-[0_0_24px_rgba(59,130,246,0.6)]"
                          : isMerchant
                            ? "ring-yellow-400 shadow-[0_0_24px_rgba(234,179,8,0.5)]"
                            : isImoveis
                              ? "ring-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.5)]"
                              : isVeiculos
                                ? "ring-blue-400 shadow-[0_0_24px_rgba(59,130,246,0.5)]"
                                : isServicos
                                  ? "ring-violet-400 shadow-[0_0_24px_rgba(139,92,246,0.5)]"
                                  : isFretes
                                    ? "ring-indigo-400 shadow-[0_0_24px_rgba(99,102,241,0.5)]"
                                    : isViagem
                                      ? "ring-sky-400 shadow-[0_0_24px_rgba(14,165,233,0.5)]"
                                      : isDriver
                                      ? "ring-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.5)]"
                                      : "ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.35)]",
                      )
                      : cn(
                        "ring-1 ring-white/15",
                        isMotoboy && "hover:ring-orange-400/50 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)]",
                        isMotoTaxi && "hover:ring-blue-400/60 hover:shadow-[0_0_12px_rgba(59,130,246,0.25)]",
                        isMerchant && "hover:ring-yellow-300/50 hover:shadow-[0_0_12px_rgba(234,179,8,0.2)]",
                        isImoveis && "hover:ring-emerald-400/50 hover:shadow-[0_0_12px_rgba(16,185,129,0.2)]",
                        isVeiculos && "hover:ring-blue-400/50 hover:shadow-[0_0_12px_rgba(59,130,246,0.2)]",
                        isServicos && "hover:ring-violet-400/50 hover:shadow-[0_0_12px_rgba(139,92,246,0.2)]",
                        isFretes && "hover:ring-indigo-400/50 hover:shadow-[0_0_12px_rgba(99,102,241,0.2)]",
                        isViagem && "hover:ring-sky-400/50 hover:shadow-[0_0_12px_rgba(14,165,233,0.2)]",
                        isDriver && "hover:ring-amber-400/50 hover:shadow-[0_0_12px_rgba(245,158,11,0.2)]",
                      )),
                  )}
                >
                  {/* Background layer */}
                  {isMotoboy && isSel ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700" />
                  ) : isMotoTaxi && isSel ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700" />
                  ) : isMerchant && isSel ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600" />
                  ) : isImoveis && isSel ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700" />
                  ) : isServicos ? (
                    <div className="absolute inset-0 bg-black" />
                  ) : isFretes ? (
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br transition-all duration-300",
                      isSel ? "from-indigo-600 via-indigo-700 to-indigo-900" : "from-indigo-800 via-indigo-900 to-slate-900"
                    )} />
                  ) : isDriver ? (
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br transition-all duration-300",
                      isSel ? "from-amber-500 via-amber-600 to-orange-800" : "from-amber-800 via-amber-900 to-slate-900"
                    )} />
                  ) : isViagem ? (
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br transition-all duration-300",
                      isSel ? "from-sky-500 via-sky-600 to-sky-800" : "from-sky-700 via-sky-800 to-slate-900"
                    )} />
                  ) : isVeiculos ? (
                    /* Veículos: card SEM imagem — fundo gradiente azul sólido */
                    <div className={cn(
                      "absolute inset-0 bg-gradient-to-br transition-all duration-300",
                      isSel ? "from-blue-500 via-blue-600 to-blue-800" : "from-blue-700 via-blue-800 to-slate-900"
                    )} />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-black/60" />
                  )}

                  {/* Imagem de fundo: mosaico de 6 imagens (imóveis/serviços) ou hero único */}
                  {isImoveis ? (
                    <div
                      className={cn(
                        "absolute inset-0 grid grid-cols-2 grid-rows-3 gap-0.5 transition-opacity duration-300",
                        isSel ? "opacity-25 blur-[2px]" : "opacity-100",
                      )}
                    >
                      {IMOVEIS_MOSAIC.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                          className="h-full w-full object-cover"
                        />
                      ))}
                    </div>
                  ) : isServicos ? (
                    <div
                      className={cn(
                        "absolute inset-0 grid grid-cols-3 grid-rows-2 gap-0.5 transition-opacity duration-300",
                        isSel ? "opacity-25 blur-[2px]" : "opacity-100",
                      )}
                    >
                      {SERVICOS_MOSAIC.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                          className="h-full w-full object-cover brightness-[0.55]"
                        />
                      ))}
                    </div>
                  ) : isVeiculos ? (
                    /* Card de Veículos: mosaico de 3 imagens (carro, moto, utilitário).
                       Ícone fica como fallback atrás caso as imagens não carreguem. */
                    <>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <CarFront className={cn(
                          "transition-all duration-300",
                          isSel ? "w-28 h-28 text-white/30" : "w-24 h-24 text-white/15"
                        )} />
                      </div>
                      <div className={cn(
                        "absolute inset-0 grid grid-cols-1 grid-rows-3 gap-0.5 transition-opacity duration-300",
                        isSel ? "opacity-25 blur-[2px]" : "opacity-100"
                      )}>
                        {VEICULOS_MOSAIC.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                            className="h-full w-full object-cover"
                          />
                        ))}
                      </div>
                    </>
                  ) : isFretes ? (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Truck className={cn(
                          "transition-all duration-300",
                          isSel ? "w-28 h-28 text-white/30" : "w-24 h-24 text-white/15"
                        )} />
                      </div>
                      <div className={cn(
                        "absolute inset-0 grid grid-cols-1 grid-rows-3 gap-0.5 transition-opacity duration-300",
                        isSel ? "opacity-25 blur-[2px]" : "opacity-100"
                      )}>
                        {FRETES_MOSAIC.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                            className="h-full w-full object-cover"
                          />
                        ))}
                      </div>
                    </>
                  ) : isDriver ? (
                    <img
                      src={heroImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                      className={cn(
                        "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-300",
                        isSel ? "opacity-25 blur-[2px]" : "opacity-90",
                      )}
                    />
                  ) : isViagem ? (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Plane className={cn(
                          "transition-all duration-300",
                          isSel ? "w-28 h-28 text-white/30" : "w-24 h-24 text-white/15"
                        )} />
                      </div>
                      <div className={cn(
                        "absolute inset-0 grid grid-cols-1 grid-rows-3 gap-0.5 transition-opacity duration-300",
                        isSel ? "opacity-25 blur-[2px]" : "opacity-100"
                      )}>
                        {VIAGENS_MOSAIC.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                            className="h-full w-full object-cover"
                          />
                        ))}
                      </div>
                    </>
                  ) : heroImage ? (
                    <img
                      src={heroImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
                        isHighlighted && isSel ? "opacity-25 blur-[2px]" : "opacity-100",
                      )}
                    />
                  ) : null}

                  {/* Bottom gradient for text readability */}
                  <div className={cn(
                    "absolute inset-0",
                    isMotoboy && isSel
                      ? "bg-gradient-to-t from-orange-900/70 via-transparent to-transparent"
                      : isMotoTaxi && isSel
                        ? "bg-gradient-to-t from-blue-900/60 via-transparent to-transparent"
                      : isMerchant && isSel
                        ? "bg-gradient-to-t from-yellow-900/70 via-transparent to-transparent"
                        : isImoveis && isSel
                          ? "bg-gradient-to-t from-emerald-900/70 via-transparent to-transparent"
                          : isServicos && isSel
                            ? "bg-gradient-to-t from-violet-900/70 via-transparent to-transparent"
                            : isFretes && isSel
                              ? "bg-gradient-to-t from-indigo-900/70 via-transparent to-transparent"
                              : isViagem && isSel
                              ? "bg-gradient-to-t from-sky-900/70 via-transparent to-transparent"
                              : isServicos
                                ? "bg-gradient-to-t from-black/90 via-black/20 to-transparent"
                                : "bg-gradient-to-t from-black/80 to-transparent",
                  )} />

                  {/* Coming soon overlay */}
                  {isComingSoon && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Badge className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg">Em breve</Badge>
                    </div>
                  )}

                  {/* Text content */}
                  <div className={cn(
                    "absolute inset-x-0 bottom-0 p-5 text-[#FDF6E3] text-center transition-opacity duration-300",
                    isSel ? "opacity-0 pointer-events-none" : "opacity-100"
                  )}>
                    <h3 className="font-extrabold text-xl tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">{profile.label}</h3>
                    <p className={cn(
                      "text-sm leading-snug mt-1 min-h-[2.5rem] drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]",
                      isHighlighted && isSel ? "text-[#FDF6E3]/90" : "text-[#FDF6E3]/80",
                    )}>{PROFILE_DESCRIPTIONS[profile.id]}</p>
                  </div>

                  {/* Continuar overlay — visível só quando esse card está selecionado */}
                  {isSel && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleContinue(); }}
                      disabled={isSaving || progressActive}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 h-12 w-[calc(100%-1.5rem)] rounded-xl font-bold text-base shadow-2xl overflow-hidden bg-emerald-900 hover:bg-emerald-800 text-white transition-all disabled:cursor-not-allowed animate-in fade-in zoom-in-95 duration-300"
                    >
                      {progressActive && (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 bg-blue-500 transition-[width] duration-100 ease-linear"
                          style={{ width: `${percent}%` }}
                        />
                      )}
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {isSaving ? "Iniciando…" : "Continuar"}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}

            {/* Quero Vender — OCULTO TEMPORARIAMENTE */}
            {/* <div
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick("quero_vender")}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick("quero_vender"); }}
              className={cn(
                "group relative w-full overflow-hidden rounded-2xl aspect-[3/4] transition-all duration-500 select-none border border-white/5 hover:scale-[1.02] cursor-pointer",
                selected === "quero_vender"
                  ? "ring-[4px] ring-[#B06CFF] shadow-[0_0_40px_rgba(123,63,228,0.4)] scale-[1.03]"
                  : "hover:shadow-[0_20px_50px_rgba(123,63,228,0.25)]"
              )}
            >
              <img
                src={vendaAnuncioHero}
                alt="Quero Vender na plataforma Viagg"
                className={cn(
                  "absolute inset-0 h-full w-full object-cover object-top transition-all duration-700",
                  selected === "quero_vender" ? "scale-110 opacity-100" : "scale-100 opacity-90 group-hover:scale-110 group-hover:opacity-100"
                )}
              />
              <div 
                className="absolute inset-0 transition-opacity duration-500"
                style={{ background: selected === "quero_vender" 
                  ? 'linear-gradient(to top, rgba(123,63,228,0.5) 0%, rgba(0,0,0,0.8) 100%)' 
                  : 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)' 
                }}
              />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white text-center flex flex-col items-center gap-4">
                <div className="space-y-1 text-center w-full">
                  <h3 className={cn(
                    "font-bold text-2xl tracking-tighter uppercase transition-colors",
                    selected === "quero_vender" ? "text-white" : "text-[#B06CFF]"
                  )}>Quero Vender</h3>
                  <p className="text-[11px] text-white/85 font-medium leading-tight px-4">Anuncie seus produtos ou imóveis na plataforma</p>
                </div>
                {selected !== "quero_vender" && (
                  <div
                     className="text-white text-[10px] font-bold uppercase tracking-[0.2em] py-3 px-8 rounded-full transition-all duration-300 shadow-[0_8px_20px_rgba(123,63,228,0.3)] group-hover:shadow-[0_12px_25px_rgba(123,63,228,0.4)]"
                     style={{ background: 'linear-gradient(135deg, #7B3FE4, #B06CFF)' }}
                  >
                    ANUNCIANTE
                  </div>
                )}
              </div>
              {selected === "quero_vender" && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleContinue(); }}
                  disabled={isSaving || progressActive}
                  className="absolute inset-x-3 bottom-3 z-20 h-12 rounded-xl font-bold text-base shadow-2xl overflow-hidden bg-emerald-900 hover:bg-emerald-800 text-white transition-all disabled:cursor-not-allowed animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  {progressActive && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-blue-500 transition-[width] duration-100 ease-linear"
                      style={{ width: `${percent}%` }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isSaving ? "Iniciando…" : "Continuar"}
                  </span>
                </button>
              )}
            </div> */}

          </div>
          </div>

          {/* Botão global Continuar removido — agora aparece dentro do card selecionado */}
          <button
            type="button"
            onClick={handleContinue}
            disabled={isSaving || !selected || progressActive}
            className={cn(
              "hidden",
              !selected && !progressActive && "bg-neutral-900 text-neutral-600 opacity-40",
              selected === "motoboy" && !isSaving
                ? "bg-orange-500 text-white hover:bg-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.4)]"
                : selected === "merchant" && !isSaving
                  ? "bg-yellow-400 text-black hover:bg-yellow-300 shadow-[0_0_30px_rgba(234,179,8,0.45)]"
                  : selected === "quero_vender" && !isSaving
                    ? "bg-gradient-to-r from-[#7B3FE4] to-[#B06CFF] text-white hover:opacity-90 shadow-[0_0_30px_rgba(123,63,228,0.4)]"
                    : "bg-black text-white",
            )}
          >
            {progressActive && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-100 ease-linear"
                style={{ width: `${percent}%` }}
              />
            )}
            <span className="relative z-10 transition-transform duration-300 group-active:scale-95 flex items-center justify-center gap-3">
              {isSaving ? "Iniciando…" : "Continuar"}
            </span>
          </button>

          <Button
            variant="ghost"
            className="w-full text-white/40"
            onClick={async () => {
              await signOut();
              window.location.replace("/auth");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Deslogar da conta
          </Button>
        </div>
      </div>

      <FooterNeutralPublic />
    </div>
  );
}
