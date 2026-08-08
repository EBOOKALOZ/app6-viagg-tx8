import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ChevronLeft,
  ShieldCheck,
  Star,
  Chrome,
  Facebook
} from "lucide-react";
import { MathCaptchaDialog } from "@/components/ui/math-captcha-dialog";
import { useLoginBruteForceGuard } from "@/hooks/useLoginBruteForceGuard";

export function RealEstateAuthCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // Anti-brute-force de login por senha — mitigação client-side apenas.
  // Ver nota de limitação honesta em src/hooks/useLoginBruteForceGuard.ts.
  const { loginCooldown, checkCooldown, needsCaptcha, registerFailedAttempt, registerSuccessfulLogin } =
    useLoginBruteForceGuard(email);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const pendingSubmitRef = useRef(false);

  const { signInWithPassword, signUp, signInWithGoogle, signInWithFacebook } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const runAuthRequest = async () => {
    setLoading(true);
    try {
      const { error } = isSignUp
        ? await signUp(email, password)
        : await signInWithPassword(email, password);

      if (error) {
        if (!isSignUp) registerFailedAttempt(email);
        toast({
          variant: "destructive",
          title: "Erro na autenticação",
          description: error.message,
        });
      } else {
        if (!isSignUp) registerSuccessfulLogin();
        toast({
          title: isSignUp ? "Conta criada!" : "Bem-vindo de volta!",
          description: isSignUp ? "Verifique seu e-mail para confirmar." : "Login realizado com sucesso.",
        });
        navigate("/mercado/quero-vender");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSignUp) {
      const remaining = checkCooldown(email);
      if (remaining > 0) {
        toast({
          variant: "destructive",
          title: "Muitas tentativas",
          description: `Aguarde ${remaining}s antes de tentar novamente.`,
        });
        return;
      }
      if (needsCaptcha(email)) {
        pendingSubmitRef.current = true;
        setCaptchaOpen(true);
        return;
      }
    }

    await runAuthRequest();
  };

  const handleCaptchaConfirmed = async () => {
    if (!pendingSubmitRef.current) return;
    pendingSubmitRef.current = false;
    await runAuthRequest();
  };
  return (
    <div className="w-full max-w-[460px] relative z-10 mx-auto">
        {/* Header Branding */}
          <div className="space-y-6 text-center mb-10">
            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#1A1A1A] border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                <Building2 className="w-4 h-4 text-orange-500" />
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">
                    Sistema de Vendas Viagg-TX8
                </span>
            </div>
            
            <div className="space-y-4">
                <h1 className="text-[36px] md:text-4xl font-black text-white uppercase tracking-tight leading-[1.1]">
                    {!isSignUp ? 'Acesse Seu Painel de Anunciante' : 'Crie Sua Conta de Anunciante'}
                </h1>
                <p className="text-zinc-500 text-sm font-medium">
                    {!isSignUp 
                        ? 'Gerencie seus anúncios, créditos e leads imobiliários.' 
                        : 'Publique seus imóveis e alcance milhares de compradores diariamente.'}
                </p>
            </div>
          </div>

        {/* Form Card */}
        <div className="bg-[#0D0D0D] border border-white/5 rounded-[48px] p-8 md:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] space-y-10">
          <form onSubmit={handleAuth} className="space-y-6">
            {/* Email Input */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">Seu E-mail</label>
              <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                <Input 
                  type="email" 
                  placeholder="email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-16 pl-14 bg-[#141414] border-white/5 text-white placeholder:text-zinc-700 rounded-2xl focus:ring-orange-500/20 focus:border-orange-500/50 transition-all font-medium"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-3">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Sua Senha</label>
                {!isSignUp && (
                  <button type="button" className="text-[10px] font-black text-orange-500 uppercase tracking-widest hover:text-orange-400 transition-colors">
                    Esqueceu?
                  </button>
                )}
              </div>
              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                <Input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-16 pl-14 bg-[#141414] border-white/5 text-white placeholder:text-zinc-700 rounded-2xl focus:ring-orange-500/20 focus:border-orange-500/50 transition-all font-medium"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || (!isSignUp && loginCooldown > 0)}
              className="w-full h-16 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white rounded-2xl font-black text-sm uppercase tracking-[0.25em] shadow-xl shadow-orange-500/10 group transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : !isSignUp && loginCooldown > 0 ? (
                `Aguarde ${loginCooldown}s`
              ) : (
                <div className="flex items-center gap-3">
                  {isSignUp ? "Criar Minha Conta" : "Entrar no Painel"}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              )}
            </Button>
          </form>

          <div className="flex flex-col gap-6 pt-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
              <div className="relative flex justify-center text-[9px] font-black uppercase tracking-widest">
                <span className="bg-[#0D0D0D] px-4 text-zinc-600">Ou continue com</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Button 
                    type="button"
                    variant="outline"
                    onClick={() => signInWithGoogle()}
                    className="h-16 bg-[#141414] border-white/5 hover:bg-[#1A1A1A] hover:border-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                    Google
                </Button>
                <Button 
                    type="button"
                    variant="outline"
                    onClick={() => signInWithFacebook()}
                    className="h-16 bg-[#141414] border-white/5 hover:bg-[#1A1A1A] hover:border-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                    Facebook
                </Button>
            </div>

            <p className="text-center text-zinc-500 text-xs font-medium mt-4">
              {isSignUp ? "Já tem uma conta?" : "Ainda não tem acesso?"}{" "}
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-orange-500 font-black hover:text-orange-400 transition-colors ml-1"
              >
                {isSignUp ? "ENTRAR AGORA" : "CRIAR CONTA GRÁTIS"}
              </button>
            </p>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-12 flex items-center justify-center gap-8">
          <div className="flex items-center gap-2.5 opacity-40 hover:opacity-100 transition-opacity cursor-default">
            <ShieldCheck className="w-5 h-5 text-emerald-500/80" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Seguro</span>
          </div>
          <div className="flex items-center gap-2.5 opacity-40 hover:opacity-100 transition-opacity cursor-default">
            <Star className="w-5 h-5 text-yellow-500/80" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Premium</span>
          </div>
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
