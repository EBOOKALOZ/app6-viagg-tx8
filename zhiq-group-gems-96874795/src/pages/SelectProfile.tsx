import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { FooterNeutralPublic } from "@/components/FooterNeutralPublic";
import { PROFILE_TYPES, getProfileRoute } from "@/lib/profileTypes";
import { cn } from "@/lib/utils";
import { requestAudioAndNotificationPermissions } from "@/lib/audioUnlock";
import LoadingButton from "@/components/LoadingButton";
import vendaAnuncioHero from "@/assets/venda-anuncio-hero.png";

/** Onboarding routes per profile */
const ONBOARDING_ROUTES: Record<string, string> = {
  motoboy: "/motoboy/profile",
  mototaxi: "/mototaxi/profile",
  merchant: "/loja/minha-loja", // Redirecionado diretamente para o dashboard unificado!
  driver: "/driver/completar",
  passenger: "/passenger/completar",
};

/* ================================
   CONSTANTS
================================ */

const PROFILE_HERO_IMAGES: Record<string, string> = {
  merchant: new URL("@/assets/comerciante-hero.png", import.meta.url).href,
  motoboy: new URL("@/assets/motoboy-hero.png", import.meta.url).href,
};

const PROFILE_DESCRIPTIONS: Record<string, string> = {
  motoboy: "Entregas rápidas de moto",
  merchant: "Gerencie sua loja, solicite motoboys e acompanhe seus pedidos",
};

const CARD_ORDER = ["motoboy", "merchant"];
const isPassengerEnabled = import.meta.env.VITE_ENABLE_PASSENGER_DEV === "true";

/* ================================
   COMPONENT
================================ */

export default function SelectProfile() {
  const navigate = useNavigate();
  const { initialized, isLoading, user, setAvailableProfiles, setActiveProfile, signOut, refreshProfiles } = useAuth();
  const { toast } = useToast();

  const [selected, setSelected] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progressActive, setProgressActive] = useState(false);
  /** Backend confirmed success — controls LoadingButton readiness */
  const [backendReady, setBackendReady] = useState(false);
  /** Where to navigate after loading completes */
  const navigationTarget = useRef<string | null>(null);

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
    window.location.replace("/auth");
    return null;
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
    const isAnimatedProfile = selected === "motoboy" || selected === "merchant" || isQueroVender;

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
      }

      await setAvailableProfiles([selected]);
      await setActiveProfile(selected, [selected]);

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

      // Forçar Lojista para o painel de anunciante como entrada principal
      if (selected === "merchant") {
        target = "/anunciante/painel";
      }

      navigationTarget.current = target;

      if (isAnimatedProfile) {
        // Signal LoadingButton that backend is ready
        setBackendReady(true);
      } else {
        // Non-animated: navigate immediately
        navigate(target, { replace: true });
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
            <Logo size="2xl" />
            <h1 className="text-2xl font-bold text-white mt-4">Selecione seu Perfil</h1>
            <p className="text-sm text-white/50">Escolha como deseja usar a plataforma</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {profileList.map((profile) => {
              const isComingSoon = profile.id === "passenger" && !isPassengerEnabled;
              const isSel = selected === profile.id && !isComingSoon;
              const heroImage = PROFILE_HERO_IMAGES[profile.id];
              const isMotoboy = profile.id === "motoboy";
              const isMerchant = profile.id === "merchant";
              const isHighlighted = isMotoboy || isMerchant;

              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleCardClick(profile.id)}
                  disabled={isComingSoon}
                  className={cn(
                    "group relative w-full overflow-hidden rounded-2xl aspect-[3/4] transition-all duration-300 select-none",
                    isComingSoon
                      ? "cursor-not-allowed"
                      : isSel
                        ? cn(
                          "scale-[1.03] ring-[5px]",
                          isMotoboy
                            ? "ring-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.5)]"
                            : isMerchant
                              ? "ring-emerald-600 shadow-[0_0_24px_rgba(5,150,105,0.5)]"
                              : "ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.35)]",
                        )
                        : cn(
                          "ring-1 ring-white/15",
                          isMotoboy && "hover:ring-orange-400/50 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)]",
                          isMerchant && "hover:ring-emerald-500/50 hover:shadow-[0_0_12px_rgba(5,150,105,0.2)]",
                        ),
                  )}
                >
                  {/* Background layer */}
                  {isMotoboy && isSel ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700" />
                  ) : isMerchant && isSel ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-black/60" />
                  )}

                  {/* Hero image */}
                  {heroImage && (
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
                  )}

                  {/* Bottom gradient for text readability */}
                  <div className={cn(
                    "absolute inset-0",
                    isMotoboy && isSel
                      ? "bg-gradient-to-t from-orange-900/70 via-transparent to-transparent"
                      : isMerchant && isSel
                        ? "bg-gradient-to-t from-emerald-900/70 via-transparent to-transparent"
                        : "bg-gradient-to-t from-black/80 to-transparent",
                  )} />

                  {/* Coming soon overlay */}
                  {isComingSoon && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Badge className="bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-lg">Em breve</Badge>
                    </div>
                  )}

                  {/* Text content */}
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <h3 className="font-bold">{profile.label}</h3>
                    <p className={cn(
                      "text-xs",
                      isHighlighted && isSel ? "text-white/80" : "text-white/70",
                    )}>{PROFILE_DESCRIPTIONS[profile.id]}</p>
                  </div>
                </button>
              );
            })}

            {/* Quero Vender — Purple Premium Entry integrada ao estado */}
            <button
              type="button"
              onClick={() => handleCardClick("quero_vender")}
              className={cn(
                "group relative w-full overflow-hidden rounded-2xl aspect-[3/4] transition-all duration-500 select-none border border-white/5 hover:scale-[1.02]",
                selected === "quero_vender"
                  ? "ring-[4px] ring-[#B06CFF] shadow-[0_0_40px_rgba(123,63,228,0.4)] scale-[1.03]"
                  : "hover:shadow-[0_20px_50px_rgba(123,63,228,0.25)]"
              )}
            >
              {/* Hero image with zoom effect */}
              <img
                src={vendaAnuncioHero}
                alt="Quero Vender na plataforma Viagg"
                className={cn(
                  "absolute inset-0 h-full w-full object-cover object-top transition-all duration-700",
                  selected === "quero_vender" ? "scale-110 opacity-100" : "scale-100 opacity-90 group-hover:scale-110 group-hover:opacity-100"
                )}
              />
              
              {/* Premium Dark Gradient Overlay */}
              <div 
                className="absolute inset-0 transition-opacity duration-500"
                style={{ background: selected === "quero_vender" 
                  ? 'linear-gradient(to top, rgba(123,63,228,0.5) 0%, rgba(0,0,0,0.8) 100%)' 
                  : 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)' 
                }}
              />

              {/* Text content */}
              <div className="absolute inset-x-0 bottom-0 p-6 text-white text-center flex flex-col items-center gap-4">
                <div className="space-y-1 text-center w-full">
                  <h3 className={cn(
                    "font-bold text-2xl tracking-tighter uppercase transition-colors",
                    selected === "quero_vender" ? "text-white" : "text-[#B06CFF]"
                  )}>Quero Vender</h3>
                  <p className="text-[11px] text-white/85 font-medium leading-tight px-4">Anuncie seus produtos ou imóveis na plataforma</p>
                </div>
                
                <div 
                   className={cn(
                     "text-white text-[10px] font-bold uppercase tracking-[0.2em] py-3 px-8 rounded-full transition-all duration-300",
                     selected === "quero_vender" 
                       ? "bg-[#B06CFF] shadow-[0_0_20px_rgba(176,108,255,0.6)]" 
                       : "shadow-[0_8px_20px_rgba(123,63,228,0.3)] group-hover:shadow-[0_12px_25px_rgba(123,63,228,0.4)]"
                   )}
                   style={{ background: 'linear-gradient(135deg, #7B3FE4, #B06CFF)' }}
                >
                   {selected === "quero_vender" ? "SELECIONADO" : "ANUNCIANTE"}
                </div>
              </div>
            </button>

          </div>

          {progressActive ? (
            <LoadingButton
              icon="none"
              color={selected === "motoboy" ? "motoboy" : selected === "merchant" ? "merchant" : selected === "quero_vender" ? "quero_vender" : "default"}
              label=""
              ready={backendReady}
              onComplete={() => {
                const target = navigationTarget.current;
                if (target) {
                  navigate(target, { replace: true });
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={handleContinue}
              disabled={isSaving || !selected}
              className={cn(
                "relative w-full h-14 sm:h-16 rounded-xl font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-500 overflow-hidden shadow-2xl",
                !selected && "bg-neutral-900 text-neutral-600",
                selected === "motoboy" && !isSaving
                  ? "bg-orange-500 text-white hover:bg-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.4)]"
                  : selected === "merchant" && !isSaving
                    ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                    : selected === "quero_vender" && !isSaving
                      ? "bg-gradient-to-r from-[#7B3FE4] to-[#B06CFF] text-white hover:opacity-90 shadow-[0_0_30px_rgba(123,63,228,0.4)]"
                      : "bg-black text-white",
              )}
            >
              <span className="relative z-10 transition-transform duration-300 group-active:scale-95">
                {isSaving ? "Iniciando…" : "Continuar"}
              </span>
            </button>
          )}

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
