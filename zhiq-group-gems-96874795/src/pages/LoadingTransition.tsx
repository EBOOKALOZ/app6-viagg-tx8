import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const DURATION_MS = 1200; // visual premium curto

export default function LoadingTransition() {
  const navigate = useNavigate();
  const { initialized, profileReady, isProfileComplete, role, activeProfile, user } = useAuth();

  const [percent, setPercent] = useState(0);
  const navigatedRef = useRef(false);

  const isMotoboy = activeProfile === "motoboy" || activeProfile === "mototaxi";

  // Theme colors based on active profile
  const bgGradient = isMotoboy
    ? "linear-gradient(160deg, #c2410c 0%, #ea580c 40%, #f97316 100%)"
    : "#000000"; // Fundo preto liso
  const strokeColor = isMotoboy ? "#fff" : "#ffffff";
  const strokeBg = isMotoboy ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.15)";
  const textClass = isMotoboy ? "text-white" : "text-white";
  const subtextClass = isMotoboy ? "text-white/80" : "text-white/70";

  useEffect(() => {
    if (!initialized || !profileReady || role === null) return;

    const start = performance.now();

    const tick = async (now: number) => {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      setPercent(Math.round(progress * 100));

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        if (!navigatedRef.current) {
          navigatedRef.current = true;
          const returnTo = sessionStorage.getItem('returnTo');
          if (window.location.pathname.startsWith("/anunciante")) {
            console.log("[LoadingTransition] In advertiser path, skipping redirect.");
            return;
          }

          const authEntry = localStorage.getItem("viagg_auth_entry");
          console.log("[LoadingTransition] authEntry:", authEntry, "user:", user?.id);

          if (authEntry === "advertiser") {
            // Priority for advertiser mode
            const handleAdvertiserRedirect = async () => {
              try {
                // Ensure record exists via RPC
                await supabase.rpc('ensure_advertiser_account', {
                  p_full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0],
                  p_whatsapp: user?.user_metadata?.phone || null
                });
              } catch (err) {
                console.error("[LoadingTransition] Advertiser sync failed:", err);
              } finally {
                // Redirect first, then clean up flag (or keep it briefly for persistence)
                navigate("/anunciante/painel", { replace: true });
                // Note: We don't remove it here to allow RedirectByProfile to also see it if needed
                // during the initial load sequence.
              }
            };
            handleAdvertiserRedirect();
            return;
          }

          if (authEntry === "motoboy") {
            // Usuário veio do botão "MOTOBOY" → direto pro cadastro/onboarding
            localStorage.removeItem("viagg_auth_entry");
            navigate("/motoboy/completar", { replace: true });
            return;
          }

          if (returnTo) {
            sessionStorage.removeItem('returnTo');
            navigate(returnTo, { replace: true });
          } else {
            // Sempre passar pela seleção de perfil após login
            navigate("/select-profile", { replace: true });
          }
        }
      }
    };

    requestAnimationFrame(tick);
  }, [initialized, profileReady, role, navigate, user, activeProfile]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center"
      style={{ background: bgGradient }}
    >
      <div className="relative" style={{ width: 180, height: 180 }}>
        <svg viewBox="0 0 160 160" width="180" height="180">
          <circle cx="80" cy="80" r="70" stroke={strokeBg} strokeWidth="10" fill="none" />
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke={strokeColor}
            strokeWidth="10"
            fill="none"
            strokeDasharray={440}
            strokeDashoffset={440 - (440 * percent) / 100}
            strokeLinecap="round"
          />
        </svg>

        <div className={`absolute inset-0 flex items-center justify-center text-5xl font-bold ${textClass}`}>
          {percent}%
        </div>
      </div>

      <p className="mt-12 text-center px-4 max-w-[320px] sm:max-w-md uppercase tracking-widest text-white whitespace-nowrap">Painel Viagg-TX8</p>
    </div>
  );
}
