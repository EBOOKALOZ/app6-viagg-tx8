/**
 * /convenio-admin/login — Login exclusivo do Gestor (Comando Convênio Fase 1).
 *
 * Usa o mesmo Supabase Auth da plataforma (signInWithPassword), sem sistema
 * de autenticação paralelo. Após login, o gate GestorConvenioProtectedRoute
 * verifica o papel "gestor_convenio" e libera ou barra o acesso ao painel.
 */
import { useRef, useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { HeartHandshake, Loader2, Lock, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGestorConvenioRole } from "@/hooks/useGestorConvenioRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MathCaptchaDialog } from "@/components/ui/math-captcha-dialog";
import { useLoginBruteForceGuard } from "@/hooks/useLoginBruteForceGuard";

export default function GestorLoginPage() {
  const { user, signInWithPassword, initialized } = useAuth();
  const { isGestorConvenio, isLoading: roleLoading } = useGestorConvenioRole();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname || "/convenio-admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Anti-brute-force de login por senha — mitigação client-side apenas.
  // Ver nota de limitação honesta em src/hooks/useLoginBruteForceGuard.ts.
  const { loginCooldown, checkCooldown, needsCaptcha, registerFailedAttempt, registerSuccessfulLogin } =
    useLoginBruteForceGuard(email);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const pendingSubmitRef = useRef(false);

  // Já logado e já com o papel confirmado → segue direto para o painel.
  if (initialized && user && !roleLoading && isGestorConvenio) {
    return <Navigate to={from} replace />;
  }

  const runSubmit = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { error } = await signInWithPassword(email, password);
      if (error) {
        registerFailedAttempt(email);
        setErrorMsg("E-mail ou senha inválidos.");
        return;
      }
      registerSuccessfulLogin();
      navigate(from, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const remaining = checkCooldown(email);
    if (remaining > 0) {
      setErrorMsg(`Muitas tentativas. Aguarde ${remaining}s antes de tentar novamente.`);
      return;
    }
    if (needsCaptcha(email)) {
      pendingSubmitRef.current = true;
      setCaptchaOpen(true);
      return;
    }

    await runSubmit();
  };

  const handleCaptchaConfirmed = async () => {
    if (!pendingSubmitRef.current) return;
    pendingSubmitRef.current = false;
    await runSubmit();
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-zinc-950 overflow-hidden p-6">
      <div className="absolute top-0 right-0 -mt-32 -mr-32 w-[420px] h-[420px] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 -mb-32 -ml-32 w-[380px] h-[380px] bg-teal-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/15">
            <HeartHandshake className="h-8 w-8 text-emerald-400" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-black text-white tracking-tight">Comando Convênio</h1>
            <p className="text-xs text-white/50 uppercase tracking-widest font-bold">Super Painel do Gestor</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6"
        >
          <div className="space-y-1.5">
            <Label htmlFor="gestor-email" className="text-white/70 text-xs">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                id="gestor-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                placeholder="gestor@plataforma.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gestor-password" className="text-white/70 text-xs">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                id="gestor-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                placeholder="••••••••"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-400 font-semibold">{errorMsg}</p>
          )}

          <Button
            type="submit"
            disabled={submitting || loginCooldown > 0}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : loginCooldown > 0 ? (
              `Aguarde ${loginCooldown}s`
            ) : (
              "Entrar no Painel"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-white/30 uppercase tracking-widest font-bold">
          Acesso restrito · Gestor de Convênios
        </p>
      </div>

      <MathCaptchaDialog
        open={captchaOpen}
        onOpenChange={(open) => {
          setCaptchaOpen(open);
          if (!open) pendingSubmitRef.current = false;
        }}
        onConfirmed={handleCaptchaConfirmed}
        title="Verificação de segurança"
        description="Detectamos várias tentativas de login seguidas. Resolva a soma abaixo para tentar novamente."
      />
    </div>
  );
}
