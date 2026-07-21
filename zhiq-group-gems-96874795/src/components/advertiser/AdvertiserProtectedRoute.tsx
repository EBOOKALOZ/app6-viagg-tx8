import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface AdvertiserProtectedRouteProps {
  children: React.ReactNode;
}

export function AdvertiserProtectedRoute({ children }: AdvertiserProtectedRouteProps) {
  const { user, initialized } = useAuth();
  const location = useLocation();
  const [hasAdvertiserAccount, setHasAdvertiserAccount] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!initialized) return;

    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const checkAdvertiserAccount = async () => {
      // Erro de leitura (timeout de rede, RLS momentânea, hiccup) NÃO pode barrar
      // um anunciante válido — a página de destino já é resiliente e cria a conta
      // sozinha se faltar. Só deixa de bloquear quem realmente não está logado.
      // 1 retry rápido antes de liberar mesmo assim.
      const readAccount = async () => {
        const { data, error } = await supabase
          .from("advertiser_accounts")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        return { data, error };
      };

      try {
        let { data, error } = await readAccount();
        if (error) {
          // 1 nova tentativa após um respiro — cobre lentidão/queda momentânea
          await new Promise((r) => setTimeout(r, 1200));
          ({ data, error } = await readAccount());
        }

        if (cancelled) return;

        if (data) {
          setHasAdvertiserAccount(true);
        } else if (!error) {
          // Conta não existe (sem erro) → tenta criar; nunca bloqueia se falhar
          const { error: ensureError } = await supabase.rpc('ensure_advertiser_account', {
            p_full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
            p_whatsapp: user.user_metadata?.phone || null,
          });
          if (ensureError) {
            console.warn("[AdvertiserProtectedRoute] ensure_advertiser_account falhou (seguindo com fallback):", ensureError);
          }
          setHasAdvertiserAccount(true);
        } else {
          // Ainda com erro após o retry: LIBERA mesmo assim (não trava o anunciante);
          // a página usa dados de fallback. Só usuário deslogado é redirecionado.
          console.warn("[AdvertiserProtectedRoute] leitura de conta falhou 2x; liberando com fallback:", error);
          setHasAdvertiserAccount(true);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[AdvertiserProtectedRoute] erro inesperado (liberando):", err);
        setHasAdvertiserAccount(true); // Don't block
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Teto de tempo: se a checagem pendurar (>6s), libera com fallback em vez de
    // deixar o usuário preso em "Verificando Acesso…".
    const failsafe = setTimeout(() => {
      if (!cancelled) { setHasAdvertiserAccount(true); setLoading(false); }
    }, 6000);

    checkAdvertiserAccount();
    return () => { cancelled = true; clearTimeout(failsafe); };
  }, [user, initialized]);

  if (user && loading || !initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
          <p className="text-zinc-400 font-medium animate-pulse uppercase tracking-widest text-xs">Verificando Acesso...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (hasAdvertiserAccount === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shadow-xl shadow-red-500/5">
           <Loader2 className="w-10 h-10" />
        </div>
        <div className="space-y-2 max-w-md">
           <h1 className="text-xl font-black text-white uppercase tracking-tight">Falha na Verificação</h1>
           <p className="text-zinc-400 text-sm leading-relaxed">
             Não conseguimos validar seu acesso de anunciante. Isso pode acontecer se a função do banco de dados estiver desatualizada.
           </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
           <button 
             onClick={() => window.location.reload()}
             className="h-12 bg-white text-zinc-950 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-200 transition-all"
           >
              Tentar Novamente
           </button>
           <button 
             onClick={() => window.location.href = '/auth'}
             className="h-12 bg-zinc-900 text-zinc-400 rounded-2xl font-bold text-xs uppercase hover:text-white transition-all"
           >
              Voltar ao Login
           </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
