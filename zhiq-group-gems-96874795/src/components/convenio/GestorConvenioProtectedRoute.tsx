import { Navigate, useLocation } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGestorConvenioRole } from "@/hooks/useGestorConvenioRole";

interface GestorConvenioProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Comando Convênio Fase 1 — gate exclusivo do Super Painel do Gestor.
 * Independente do ProtectedRoute genérico: usa a mesma sessão Supabase
 * (AuthContext), mas exige o papel "gestor_convenio" (ou admin/ceo).
 * Nunca cria o papel automaticamente — só bloqueia ou libera.
 */
export function GestorConvenioProtectedRoute({ children }: GestorConvenioProtectedRouteProps) {
  const { user, initialized } = useAuth();
  const { isGestorConvenio, isLoading } = useGestorConvenioRole();
  const location = useLocation();

  if (!initialized || (!!user && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
          <p className="text-zinc-400 font-medium animate-pulse uppercase tracking-widest text-xs">
            Verificando acesso do Gestor...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/convenio-admin/login" state={{ from: location }} replace />;
  }

  if (!isGestorConvenio) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shadow-xl shadow-red-500/5">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <div className="space-y-2 max-w-md">
          <h1 className="text-xl font-black text-white uppercase tracking-tight">Acesso Restrito</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Este painel é exclusivo do Gestor de Convênios. Sua conta não possui essa permissão.
          </p>
        </div>
        <button
          onClick={() => (window.location.href = "/convenio-admin/login")}
          className="h-12 px-8 bg-white text-zinc-950 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-200 transition-all"
        >
          Voltar ao Login do Gestor
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
