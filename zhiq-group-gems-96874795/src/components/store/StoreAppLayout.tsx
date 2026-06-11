import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyStore } from "@/hooks/useMyStore";
import { StoreBottomNav } from "./StoreBottomNav";
import { Loader2 } from "lucide-react";

export function StoreAppLayout() {
  const { user, activeProfile, isLoading: authLoading, availableProfiles } = useAuth();
  const { store, isLoading, error } = useMyStore();

  // Enquanto auth está carregando, mostra loading (evita redirect prematuro no hard reload)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
          <p className="text-zinc-400 text-sm">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Aceita merchant/advertiser por activeProfile OU por availableProfiles
  // (o activeProfile pode ser null se o usuário ainda não escolheu, mas se for elegível, deixa entrar)
  const hasShopAccess =
    activeProfile === 'merchant' ||
    activeProfile === 'advertiser' ||
    availableProfiles?.includes('merchant') ||
    availableProfiles?.includes('advertiser');

  if (!hasShopAccess) {
    return <Navigate to="/select-profile" replace />;
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
      <main className="w-full min-h-screen">
        {/* Aqui renderizamos as páginas internas protegidas pelo layout da loja */}
        <Outlet context={{ store }} />
      </main>
      
      <StoreBottomNav />
    </div>
  );
}
