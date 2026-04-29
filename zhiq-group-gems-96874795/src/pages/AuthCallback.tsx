import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, RefreshCw, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FacebookShareDialog } from "@/components/FacebookShareDialog";
import { cn } from "@/lib/utils";

type AuthStatus = "processing" | "expired" | "error";

const LAST_MAGIC_EMAIL_KEY = "viagg_last_magic_email";
const FB_SHARE_SHOWN_KEY = "viagg_fb_share_shown";

export default function AuthCallback() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<AuthStatus>("processing");
  const [errorMsg, setErrorMsg] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [showFbShare, setShowFbShare] = useState(false);

  /** Guards definitivos */
  const effectHandledRef = useRef(false);
  const redirectHandledRef = useRef(false);

  const lastEmail = (() => {
    try {
      return localStorage.getItem(LAST_MAGIC_EMAIL_KEY) || "";
    } catch {
      return "";
    }
  })();

  /* =============================
     REDIRECT ÚNICO E IMUTÁVEL
  ============================= */
  const redirectToLoadingOnce = () => {
    if (redirectHandledRef.current) return;
    redirectHandledRef.current = true;

    // limpa hash/query para evitar reprocessamento
    window.history.replaceState({}, "", window.location.pathname);

    navigate("/loading", { replace: true });
  };

  const MINI_PROFILE_KEY = "viagg_mini_profile";
  const MINI_RETURN_KEY = "viagg_mini_return_to";

  /* =============================
     CHECK IF FACEBOOK & SHOW SHARE
     + Persist mini cadastro profile
  ============================= */
  const handleSuccessfulAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;

    // Persist mini cadastro profile data if present
    try {
      const miniProfileRaw = localStorage.getItem(MINI_PROFILE_KEY);
      if (miniProfileRaw) {
        const miniProfile = JSON.parse(miniProfileRaw);
        await supabase.auth.updateUser({
          data: {
            customer_name: miniProfile.customer_name,
            customer_whatsapp: miniProfile.customer_whatsapp,
          },
        });
        localStorage.removeItem(MINI_PROFILE_KEY);
      }
    } catch { /* ignore parse errors */ }

    // Check for mini cadastro return URL
    const miniReturnTo = localStorage.getItem(MINI_RETURN_KEY);
    if (miniReturnTo) {
      localStorage.removeItem(MINI_RETURN_KEY);
      if (!redirectHandledRef.current) {
        redirectHandledRef.current = true;
        window.history.replaceState({}, "", window.location.pathname);
        navigate(miniReturnTo, { replace: true });
      }
      return;
    }

    const provider = data.session.user?.app_metadata?.provider;
    const alreadyShown = sessionStorage.getItem(FB_SHARE_SHOWN_KEY);

    if (provider === "facebook" && !alreadyShown) {
      sessionStorage.setItem(FB_SHARE_SHOWN_KEY, "true");
      setShowFbShare(true);
    } else {
      redirectToLoadingOnce();
    }
  };

  const handleShareClose = () => {
    setShowFbShare(false);
    redirectToLoadingOnce();
  };

  const isAdvertiserMode = (() => {
    try {
      return localStorage.getItem("viagg_auth_entry") === "advertiser";
    } catch {
      return false;
    }
  })();

  /* =============================
     BOOTSTRAP CALLBACK
  ============================= */
  useEffect(() => {
    if (effectHandledRef.current) return;
    effectHandledRef.current = true;

    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.substring(1));

    const errorParam = url.searchParams.get("error") || hashParams.get("error");
    const errorDesc = url.searchParams.get("error_description") || hashParams.get("error_description") || "";
    const errorCode = url.searchParams.get("error_code") || hashParams.get("error_code");
    const type = url.searchParams.get("type") || hashParams.get("type");

    /* ── RECOVERY SPECIAL REDIRECT ── */
    if (type === "recovery") {
      console.log("[AuthCallback] Recovery type detected, redirecting to update-password");
      navigate("/update-password", { replace: true });
      return;
    }

    /* ── SUCESSO: ESPERA SESSÃO ── */
    const resolveSession = async (fallbackToError = true) => {
      const { data } = await supabase.auth.getSession();

      if (data?.session) {
        handleSuccessfulAuth();
        return;
      }

      if (!fallbackToError) return;

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          sub.subscription.unsubscribe();
          handleSuccessfulAuth();
        }
      });
    };

    /* ── ERROS NO CALLBACK ── */
    if (errorParam) {
      const isExpired =
        errorCode === "otp_expired" ||
        errorParam === "otp_expired" ||
        errorDesc.toLowerCase().includes("expired") ||
        errorDesc.toLowerCase().includes("invalid");

      const isTransient = errorParam === "server_error" || errorParam === "temporarily_unavailable";

      if (isTransient) {
        navigate("/auth", { replace: true });
        return;
      }

      // NOVO: Mesmo com erro, tentamos ver se a sessão 'pegou' no background (pre-fetch recovery)
      resolveSession(false).then(() => {
        if (redirectHandledRef.current) return; // Se resolveSession funcionou, paramos aqui.

        if (isExpired) {
          setStatus("expired");
          if (lastEmail) autoResend(lastEmail);
        } else {
          setErrorMsg(errorDesc || "Não foi possível completar a autenticação.");
          setStatus("error");
        }
      });
      return;
    }

    resolveSession();
  }, [navigate]);

  /* =============================
     RESEND OTP
  ============================= */
  const autoResend = async (email: string) => {
    setResending(true);
    try {
      const redirectUrl = isAdvertiserMode 
        ? `${window.location.origin}/auth/callback?entry=advertiser`
        : `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      if (!error) setResent(true);
    } finally {
      setResending(false);
    }
  };

  const handleManualResend = () => {
    if (lastEmail) autoResend(lastEmail);
    else navigate(isAdvertiserMode ? "/auth?entry=advertiser" : "/auth", { replace: true });
  };

  const handleRetry = () => navigate(isAdvertiserMode ? "/auth?entry=advertiser" : "/auth", { replace: true });

  /* =============================
     UI — EXPIRED
  ============================= */
  if (status === "expired") {
    return (
      <div className={cn(
        "flex min-h-screen items-center justify-center p-4",
        isAdvertiserMode 
          ? "bg-gradient-to-br from-orange-950 via-zinc-950 to-orange-950" 
          : "bg-gradient-to-br from-[#0B3D2E] via-[#083126] to-[#051F18]"
      )}>
        <Card className={cn(
          "w-full max-w-md border shadow-2xl rounded-[32px] overflow-hidden",
          isAdvertiserMode ? "bg-orange-900/10 border-orange-500/20 backdrop-blur-xl" : "border-0"
        )}>
          <CardHeader className="text-center pt-10">
            <div className={cn(
              "mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110",
              isAdvertiserMode ? "bg-orange-500/20 text-orange-400" : "bg-amber-100 text-amber-600"
            )}>
              <Mail className="h-10 w-10 animate-bounce" style={{ animationDuration: '3s' }} />
            </div>
            <CardTitle className={cn("text-2xl font-black uppercase tracking-tight", isAdvertiserMode && "text-white")}>
              Link expirado
            </CardTitle>
            <CardDescription className={cn(isAdvertiserMode && "text-zinc-400 font-medium")}>
              {resent ? "Um novo link foi enviado para seu e-mail." : "Seu link expirou por segurança."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pb-12 px-10">
            {resending ? (
              <div className="flex justify-center py-4">
                <Loader2 className={cn("h-8 w-8 animate-spin", isAdvertiserMode ? "text-orange-500" : "text-[#FF6A00]")} />
              </div>
            ) : (
              <Button 
                onClick={handleManualResend} 
                className={cn(
                  "w-full h-14 font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl transition-all",
                  isAdvertiserMode ? "bg-orange-600 hover:bg-orange-500" : "bg-[#FF6A00] hover:bg-orange-600"
                )}
              >
                <RefreshCw className="mr-3 h-4 w-4" />
                Enviar novo link
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRetry} 
              className={cn(
                "w-full h-12 font-black uppercase tracking-widest text-[10px]",
                isAdvertiserMode ? "text-orange-400 hover:text-orange-300 hover:bg-white/5" : "text-white/60 hover:text-white"
              )}
            >
              Voltar para login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* =============================
     UI — ERROR
  ============================= */
  if (status === "error") {
    return (
      <div className={cn(
        "flex min-h-screen items-center justify-center p-4",
        isAdvertiserMode 
          ? "bg-gradient-to-br from-orange-950 via-zinc-950 to-orange-950" 
          : "bg-background"
      )}>
        <Card className={cn(
          "w-full max-w-md border shadow-2xl rounded-[32px] overflow-hidden",
          isAdvertiserMode ? "bg-orange-900/10 border-orange-500/20 backdrop-blur-xl" : ""
        )}>
          <CardHeader className="text-center pt-10">
            <div className={cn(
              "mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full shadow-lg",
              isAdvertiserMode ? "bg-red-500/20 text-red-400" : "bg-red-100"
            )}>
              <AlertCircle className="h-10 w-10" />
            </div>
            <CardTitle className={cn("text-2xl font-black uppercase tracking-tight", isAdvertiserMode && "text-white")}>
              Erro de autenticação
            </CardTitle>
            <CardDescription className={cn(isAdvertiserMode && "text-zinc-400 font-medium")}>
              {errorMsg}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-12 px-10">
            <Button 
              onClick={handleRetry} 
              className={cn(
                "w-full h-14 font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl transition-all",
                isAdvertiserMode ? "bg-orange-600 hover:bg-orange-500" : "bg-[#FF6A00] hover:bg-orange-600"
              )}
            >
              Voltar para login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* =============================
     PROCESSING
  ============================= */
  return showFbShare ? <FacebookShareDialog onClose={handleShareClose} /> : null;
}
