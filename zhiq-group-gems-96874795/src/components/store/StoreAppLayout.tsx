import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyStore } from "@/hooks/useMyStore";
import { StoreBottomNav } from "./StoreBottomNav";
import { Loader2 } from "lucide-react";

export function StoreAppLayout() {
  const { user, activeProfile } = useAuth();
  const { store, isLoading, error } = useMyStore();

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // We explicitly check if they are in the allowed profiles if necessary,
  // but since we are unifying, both 'merchant' and 'advertiser' are treated as shop owners.
  if (activeProfile !== 'merchant' && activeProfile !== 'advertiser') {
    // If not merchant or advertiser, they shouldn't be in the store dashboard
    return <Navigate to="/choose-profile" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
          <p className="text-zinc-400 text-sm">Carregando painel da loja...</p>
        </div>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <p className="text-red-500 mb-4">Falha ao acessar os dados da loja.</p>
        <p className="text-zinc-500 text-sm mb-6">{error?.message}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-yellow-500 text-black font-semibold rounded-md"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 pb-20 md:pb-0">
      <main className="w-full max-w-7xl mx-auto min-h-screen">
        {/* Aqui renderizamos as páginas internas protegidas pelo layout da loja */}
        <Outlet context={{ store }} />
      </main>
      
      <StoreBottomNav />
    </div>
  );
}
