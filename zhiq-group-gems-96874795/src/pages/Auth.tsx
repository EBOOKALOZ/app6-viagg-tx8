import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Mail, 
  CheckCircle2, 
  Lock, 
  ShieldCheck, 
  Star, 
  ArrowRight, 
  Building2,
  Twitter
} from "lucide-react";
import { z } from "zod";
import { getRadioState } from "@/lib/radioPlayer";
import themeMusic from "@/assets/viagg_search_loop.mp3";
import logoImage from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ComplianceBadge } from "@/components/compliance/ComplianceBadge";

const emailSchema = z.string().email("Email inválido");
const COOLDOWN_KEY = "viagg_auth_cooldown_until";

type AuthState = "idle" | "sending" | "sent" | "error";

const getPersistedCooldown = (): number => {
  try {
    const until = localStorage.getItem(COOLDOWN_KEY);
    if (!until) return 0;
    const remaining = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authMethod, setAuthMethod] = useState<"magic" | "password">("password");
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [cooldown, setCooldown] = useState(() => getPersistedCooldown());
  const [errorMessage, setErrorMessage] = useState("");

  const { 
    signInWithPassword, 
    signUp, 
    signInWithGoogle, 
    signInWithFacebook, 
    signInWithTwitter 
  } = useAuth();
  
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [twitterLoading, setTwitterLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const entry = searchParams.get("entry");
  const wantsSignup = searchParams.get("signup") === "1" || searchParams.get("mode") === "signup";
  const isAdvertiserMode = entry === "advertiser";
  const isMotoboyMode = entry === "motoboy";
  const isBuyerMode = entry === "buyer";

  useEffect(() => {
    if (isAdvertiserMode) {
      console.log("[Auth] Setting viagg_auth_entry to advertiser");
      localStorage.setItem("viagg_auth_entry", "advertiser");
    }
    if (isMotoboyMode) {
      console.log("[Auth] Setting viagg_auth_entry to motoboy");
      localStorage.setItem("viagg_auth_entry", "motoboy");
    }
    // Salva o redirect pendente no sessionStorage para sobreviver a OAuth/magic link
    const redirect = searchParams.get("redirect");
    if (redirect) {
      sessionStorage.setItem("viagg_pending_redirect", redirect);
    }
  }, [isAdvertiserMode, isMotoboyMode]);

  useEffect(() => {
    if (wantsSignup) setIsSignUp(true);
  }, [wantsSignup]);

  const isSubmittingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicStarted, setMusicStarted] = useState(false);

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    toast({
      title: "Erro na autenticação",
      description: "Não foi possível completar a operação. Tente novamente.",
      variant: "destructive",
    });
    window.history.replaceState({}, "", "/auth");
  }, [searchParams, toast]);

  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    } else {
      localStorage.removeItem(COOLDOWN_KEY);
    }
  }, [cooldown]);

  const setPersistentCooldown = (seconds: number) => {
    const until = Date.now() + seconds * 1000;
    localStorage.setItem(COOLDOWN_KEY, until.toString());
    setCooldown(seconds);
  };

  useEffect(() => {
    audioRef.current = new Audio(themeMusic);
    audioRef.current.loop = true;
    audioRef.current.volume = 0.07;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const startMusic = () => {
    // rádio no ar = áudio prioritário → tema do login não entra por cima
    if (getRadioState().playing || getRadioState().loading) return;
    if (!musicStarted && audioRef.current) {
      audioRef.current.play().catch(() => { });
      setMusicStarted(true);
    }
  };

  const handleMagicLink = async () => {
    if (isSubmittingRef.current || authState === "sending") return;
    try {
      emailSchema.parse(email);
    } catch {
      setErrorMessage("Email inválido. Digite seu e-mail acima.");
      return;
    }
    isSubmittingRef.current = true;
    startMusic();
    setAuthState("sending");
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/auth/callback' }
      });
      if (error) {
        setErrorMessage(error.message.includes("rate_limit") ? "Aguarde um minuto antes de tentar novamente." : error.message);
        setAuthState("error");
      } else {
        localStorage.setItem("viagg_last_magic_email", email);
        setAuthState("sent");
        setPersistentCooldown(60);
        toast({ title: "Link enviado!", description: "Confira sua caixa de entrada e spam." });
      }
    } catch (e: any) {
      setErrorMessage("Erro ao enviar o link mágico.");
      setAuthState("error");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const translateError = (msg: string): string => {
    const lMsg = msg.toLowerCase();
    if (lMsg.includes("user already registered")) return "Usuário já cadastrado";
    if (lMsg.includes("invalid login credentials")) return "E-mail ou senha incorretos";
    if (lMsg.includes("email not confirmed")) return "E-mail ainda não confirmado";
    return msg;
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setErrorMessage("Por favor, digite seu e-mail no campo acima para recuperar a senha.");
      toast({
        title: "E-mail necessário",
        description: "Digite seu e-mail de acesso para enviarmos o link.",
        variant: "destructive",
      });
      return;
    }

    try {
      emailSchema.parse(email);
    } catch {
      setErrorMessage("O formato do e-mail é inválido.");
      return;
    }

    setForgotLoading(true);
    setErrorMessage("");
    
    const redirectUrl = isAdvertiserMode 
      ? `${window.location.origin}/auth/callback?type=recovery&entry=advertiser`
      : `${window.location.origin}/auth/callback?type=recovery`;

    console.log("[Auth] Attempting password reset for:", email);
    console.log("[Auth] Redirect URL:", redirectUrl);

    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      console.log("[Auth] Reset password response:", { data, error });

      if (error) {
        setErrorMessage(translateError(error.message));
        toast({
          title: "Erro no envio",
          description: translateError(error.message),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Instruções enviadas!",
          description: "Se o e-mail estiver cadastrado, você receberá um link em instantes.",
        });
      }
    } catch (err: any) {
      console.error("[Auth] Fatal error in forgot password:", err);
      setErrorMessage("Erro ao processar solicitação de senha.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handlePasswordAuth = async () => {
    if (isSubmittingRef.current || authState === "sending") return;
    try {
      emailSchema.parse(email);
      if (password.length < 6) {
        setErrorMessage("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
    } catch {
      setErrorMessage("Email inválido.");
      return;
    }
    isSubmittingRef.current = true;
    startMusic();
    setAuthState("sending");
    setErrorMessage("");
    try {
      const { error } = isSignUp ? await signUp(email, password) : await signInWithPassword(email, password);
      if (error) {
        const lMsg = error.message.toLowerCase();
        // E-mail já cadastrado → troca automaticamente para modo login
        if (isSignUp && lMsg.includes("user already registered")) {
          setIsSignUp(false);
          setErrorMessage(
            isBuyerMode
              ? "Você já tem uma conta! Entre com sua senha para continuar como comprador."
              : "Você já tem uma conta! Entre com sua senha para acessar seu painel."
          );
        } else if (!isSignUp && lMsg.includes("invalid login credentials")) {
          // Senha incorreta ou conta criada via Google/OAuth (sem senha)
          // → troca para magic link automaticamente
          setAuthMethod("magic");
          setErrorMessage(
            "Não foi possível entrar com senha. Se você entrou com Google antes, use o botão Google acima — ou clique em \"Enviar Link de Acesso\" abaixo."
          );
        } else {
          setErrorMessage(translateError(error.message));
        }
        setAuthState("error");
      } else {
        if (isSignUp) {
          toast({ title: "Conta criada!", description: "Verifique seu e-mail para confirmar o cadastro." });
          setAuthState("sent");
        }
        if (isAdvertiserMode) {
          console.log("[Auth] Advertiser mode detected, allowing LoadingTransition to handle redirect.");
        }
      }
    } catch (e: any) {
      setErrorMessage("Erro durante a autenticação.");
      setAuthState("error");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  if (authState === "sent") {
    return (
      <div className="flex min-h-screen flex-col bg-black items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-yellow-400/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-yellow-400/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/3" />
        
        <Card className="w-full max-w-[460px] border border-yellow-400/40 overflow-hidden shadow-[0_0_100px_rgba(234,179,8,0.2)] rounded-[48px] relative z-10 bg-yellow-400/[0.4] backdrop-blur-[60px] transition-all duration-700">
           <CardContent className="relative p-10 md:p-14 text-center space-y-8">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-orange-500/10 border border-orange-500/20 shadow-[0_0_30px_rgba(249,115,22,0.15)] animate-pulse">
                <CheckCircle2 className="h-12 w-12 text-[#FF6A00]" />
              </div>
              <div className="space-y-3">
                  <h1 className="text-3xl font-black text-white uppercase tracking-tight leading-none">Link enviado!</h1>
                  <p className="text-white text-sm font-black leading-relaxed">Enviamos um link de acesso inteligente para o seu e-mail:</p>
                  <div className="py-2.5 px-6 rounded-2xl bg-orange-600/10 border border-orange-600/10 inline-block">
                    <p className="text-[#FF6A00] font-black text-sm tracking-tight">{email}</p>
                  </div>
              </div>
              <p className="text-[11px] text-white/60 font-black leading-relaxed px-4 uppercase tracking-tighter">Verifique sua caixa de entrada e spam. O acesso seguro expira em alguns minutos.</p>
              <div className="pt-4">
                  {cooldown > 0 ? (
                    <div className="py-4 px-8 rounded-2xl bg-white/10 border border-white/10 inline-block">
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Reenviar em <span className="font-mono text-sm">{cooldown}s</span></p>
                    </div>
                  ) : (
                    <Button onClick={() => { setAuthState("idle"); handleMagicLink(); }} className="bg-[#FF6A00] hover:bg-orange-600 text-white font-black uppercase text-[10px] tracking-[0.25em] rounded-2xl px-12 h-16 shadow-xl transition-all">
                        REENVIAR AGORA
                    </Button>
                  )}
              </div>
            </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex min-h-screen flex-col selection:text-white font-sans",
      isAdvertiserMode ? "bg-[#F7E7CE] selection:bg-orange-200" : "bg-black selection:bg-[#FF6A00]"
    )}>
      <div className="flex flex-1 items-center justify-center p-2 sm:p-10 relative overflow-hidden">
        {/* Animated Background Orbs */}
        <div className={cn(
          "absolute top-0 right-0 w-[700px] h-[700px] rounded-full blur-[150px] -translate-y-1/2 translate-x-1/3 transition-colors duration-1000",
          isAdvertiserMode ? "bg-orange-300/20" : "bg-yellow-400/[0.15]"
        )} />
        <div className={cn(
          "absolute bottom-0 left-0 w-[700px] h-[700px] rounded-full blur-[150px] translate-y-1/2 -translate-x-1/3 transition-colors duration-1000",
          isAdvertiserMode ? "bg-orange-200/10" : "bg-yellow-400/[0.1]"
        )} />

        <div className="w-full max-w-[460px] relative z-10">
          {isAdvertiserMode && (
            <div className="flex justify-center mb-10 animate-in fade-in slide-in-from-top-4 duration-1000">
               <img 
                 src="/assets/brand/logo-advertiser.jpg" 
                 alt="Viagg-Tx8 Logo" 
                 className="h-28 w-auto rounded-[32px] shadow-[0_32px_64px_-16px_rgba(59,31,20,0.4)] border border-[#D6A75C]/10 transition-transform duration-700 hover:scale-105"
               />
            </div>
          )}
          <div className="text-center mb-2 sm:mb-5 space-y-1.5 sm:space-y-3">
             {!isAdvertiserMode && (
               <div className="flex justify-center">
                 <img
                   src={logoImage}
                   alt="Viagg-Tx8"
                   className="h-24 sm:h-28 w-auto rounded-2xl drop-shadow-[0_0_30px_rgba(234,179,8,0.45)]"
                 />
               </div>
             )}
             <div className="space-y-1.5 px-4 text-center">
                <h1 className={cn("text-[22px] sm:text-[28px] md:text-[34px] font-black uppercase tracking-tighter leading-[0.95]", isAdvertiserMode ? "text-[#3B1F14]" : "text-white")}>
                   {isAdvertiserMode
                     ? (isSignUp ? "Cadastro de Parceiro" : "Portal do Anunciante")
                     : isBuyerMode
                       ? (isSignUp ? "Crie Sua Conta" : "Minha Conta")
                       : (isSignUp ? "Crie Sua Conta" : "Acesse Seu Painel")}
                </h1>
             </div>
          </div>

          <Card className={cn(
            "border overflow-hidden rounded-[36px] backdrop-blur-[60px] transition-all duration-500 relative",
            isAdvertiserMode
              ? "border-[#D6A75C]/40 shadow-[0_48px_160px_-16px_rgba(59,31,20,0.5)] bg-[#3B1F14] text-[#FFF4E6]"
              : "border-emerald-800/80 shadow-[0_0_128px_rgba(1,20,15,0.7)] bg-[#01140F]"
          )}>
            <CardContent className={cn("relative p-4 space-y-3.5", isAdvertiserMode ? "md:p-6" : "md:p-8 md:space-y-6")}>
              <div className={cn(
                "absolute top-0 left-0 w-full h-full bg-gradient-to-br pointer-events-none",
                isAdvertiserMode ? "from-orange-500/5 via-transparent to-transparent" : "from-emerald-500/10 via-transparent to-transparent"
              )} />

              <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner relative z-10">
                <button onClick={() => { setAuthMethod("password"); setErrorMessage(""); }} className={cn("flex-1 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all duration-500", authMethod === "password" ? (isAdvertiserMode ? "bg-[#EA580C] text-[#FFF4E6] shadow-xl" : "bg-[#FF6A00] text-white shadow-xl") : (isAdvertiserMode ? "text-[#FFF4E6]/40 hover:text-[#FFF4E6]" : "text-white/60 hover:text-white"))}>Com Senha</button>
                <button onClick={() => { setAuthMethod("magic"); setErrorMessage(""); }} className={cn("flex-1 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all duration-500", authMethod === "magic" ? (isAdvertiserMode ? "bg-[#EA580C] text-[#FFF4E6] shadow-xl" : "bg-[#FF6A00] text-white shadow-xl") : (isAdvertiserMode ? "text-[#FFF4E6]/40 hover:text-[#FFF4E6]" : "text-white/60 hover:text-white"))}>Sem Senha</button>
              </div>

              <div className="space-y-4 relative z-10">
                <div className="space-y-2">
                  <label className={cn("text-[10px] font-black uppercase tracking-[0.3em] ml-2", isAdvertiserMode ? "text-[#FFF4E6]/90" : "text-white/80")}>{isBuyerMode ? "Seu e-mail" : "Identificação Comercial"}</label>
                  <div className="relative group">
                      <Mail className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 transition-colors", isAdvertiserMode ? "group-focus-within:text-[#EA580C]" : "group-focus-within:text-[#FF6A00]")} />
                      <Input type="email" placeholder={isBuyerMode ? "seu@email.com" : "comercial@suaempresa.com"} value={email} onChange={(e) => setEmail(e.target.value)} disabled={authState === "sending"} required className={cn("h-10 pl-10 text-white placeholder:text-white/20 focus:ring-[#EA580C]/40 focus:border-[#EA580C]/70 rounded-xl font-black transition-all", isAdvertiserMode ? "bg-[#422618] border-[#D6A75C]/30" : "bg-black/30 border-white/10")} />
                  </div>
                </div>

                {authMethod === "password" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-2">
                       <label className={cn("text-[10px] font-black uppercase tracking-[0.3em]", isAdvertiserMode ? "text-[#FFF4E6]/90" : "text-white/80")}>Senha de Acesso</label>
                      <button
                        type="button"
                        disabled={forgotLoading}
                        onClick={handleForgotPassword}
                        className={cn(
                          "text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-2",
                          isAdvertiserMode ? "text-[#D6A75C] hover:text-[#EA580C]" : "text-white hover:text-orange-400",
                          forgotLoading && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {forgotLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                        Esqueci a senha
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 transition-colors", isAdvertiserMode ? "group-focus-within:text-[#EA580C]" : "group-focus-within:text-[#FF6A00]")} />
                      <Input type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={authState === "sending"} required className={cn("h-10 pl-10 text-white placeholder:text-white/20 focus:ring-[#EA580C]/40 focus:border-[#EA580C]/70 rounded-xl font-black transition-all", isAdvertiserMode ? "bg-[#422618] border-[#D6A75C]/30" : "bg-black/30 border-white/10")} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/60 hover:text-white uppercase tracking-widest transition-colors">{showPassword ? "Ocultar" : "Mostrar"}</button>
                    </div>
                  </div>
                )}

                <Button
                  onClick={authMethod === "magic" ? handleMagicLink : handlePasswordAuth}
                  disabled={authState === "sending" || (authMethod === "magic" && cooldown > 0)}
                  className={cn(
                    "w-full h-11 text-[#FFF4E6] shadow-2xl rounded-xl font-black uppercase text-xs tracking-[0.25em] group transition-all",
                    isAdvertiserMode ? "bg-[#EA580C] hover:bg-orange-600 shadow-orange-950/40" : "bg-[#FF6A00] hover:bg-orange-600 shadow-[0_12px_32px_rgba(255,106,0,0.3)]"
                  )}
                >
                  {authState === "sending" ? <Loader2 className="h-5 w-5 animate-spin" /> : authMethod === "magic" && cooldown > 0 ? `Reenviar em ${cooldown}s` : <div className="flex items-center gap-2">{authMethod === "magic" ? "Enviar Link de Acesso" : (isSignUp ? (isBuyerMode ? "Criar Conta" : "Criar Painel") : (isBuyerMode ? "Entrar" : "Acessar Painel"))} <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" /></div>}
                </Button>

                {errorMessage && (
                  <div className="text-white text-xs text-center font-black mt-2 bg-black/40 p-3 rounded-xl border border-white/10 shadow-2xl animate-in fade-in zoom-in duration-300">
                    {errorMessage}
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-1">
                  <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                      <div className="relative flex justify-center text-[9px] font-black uppercase tracking-[0.4em] leading-none"><span className={cn("bg-transparent px-4 font-black", isAdvertiserMode ? "text-[#FFF4E6]/50" : "text-white")}>Acesso Externo</span></div>
                  </div>
                  <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        onClick={() => signInWithGoogle()}
                        disabled={googleLoading}
                        className="h-11 w-full bg-black/20 border-white/10 hover:bg-white/[0.05] hover:border-white/20 text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all shadow-inner group relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex items-center justify-center gap-2 relative z-10">
                          <svg className="w-4 h-4 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span>Google</span>
                        </div>
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => signInWithFacebook()}
                        disabled={facebookLoading}
                        className="h-11 w-full bg-black/20 border-white/10 hover:bg-white/[0.05] hover:border-white/20 text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all shadow-inner group relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex items-center justify-center gap-2 relative z-10">
                          <svg className="w-4 h-4 group-hover:scale-110 transition-transform text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                          <span>Facebook</span>
                        </div>
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => signInWithTwitter()}
                        disabled={twitterLoading}
                        className="h-11 w-full bg-black/20 border-white/10 hover:bg-white/[0.05] hover:border-white/20 text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] transition-all shadow-inner group relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex items-center justify-center gap-2 relative z-10">
                          <Twitter className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          <span>X</span>
                        </div>
                      </Button>
                  </div>
                </div>

                <p className="relative z-10 flex items-center justify-center flex-wrap gap-2 text-center text-[11px] font-black uppercase tracking-[0.15em] text-white">
                  <span>{isSignUp ? "Já possui acesso?" : (isBuyerMode ? "Ainda não tem conta?" : "Ainda não tem acesso comercial?")}</span>
                  <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="inline-flex items-center px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-[0.15em] shadow-md transition-colors"
                  >
                    {isSignUp ? "Acessar Agora" : "Cadastrar Agora"}
                  </button>
                </p>

              </div>
            </CardContent>
          </Card>
          
          <div className={cn("mt-3 flex items-center justify-center gap-6", isAdvertiserMode ? "opacity-60" : "opacity-40")}>
            <div className="flex items-center gap-3 hover:opacity-100 transition-opacity cursor-default">
                <ShieldCheck className={cn("w-5 h-5", isAdvertiserMode ? "text-[#EA580C]" : "text-yellow-500")} />
                <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isAdvertiserMode ? "text-[#3B1F14]" : "text-white")}>Criptografia SSL</span>
            </div>
            <div className="flex items-center gap-3 hover:opacity-100 transition-opacity cursor-default">
                <Star className={cn("w-5 h-5", isAdvertiserMode ? "text-[#EA580C]" : "text-yellow-500")} />
                <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isAdvertiserMode ? "text-[#3B1F14]" : "text-white")}>Padrão Elite</span>
            </div>
          </div>

          <div className="mt-3 flex justify-center opacity-60 hover:opacity-100 transition-opacity">
            <ComplianceBadge variant="dark" size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
