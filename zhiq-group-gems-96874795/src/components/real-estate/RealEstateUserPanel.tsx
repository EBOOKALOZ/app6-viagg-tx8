import { useRealEstateUserStats } from "@/hooks/useRealEstateUserStats";
import { 
  Trophy, 
  CreditCard, 
  LayoutDashboard, 
  TrendingUp, 
  Plus, 
  ChevronRight,
  ShieldCheck,
  Star,
  Settings,
  LogOut,
  User
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";



export function RealEstateUserPanel() {
  const { data: stats, isLoading } = useRealEstateUserStats();
  console.log("[RealEstateUserPanel] Render state:", { hasStats: !!stats, isLoading });
  const { signOut } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-[32px] p-8 border border-zinc-100 shadow-sm animate-pulse">
        <div className="h-20 bg-zinc-50 rounded-2xl w-full" />
      </div>
    );
  }

  // Classification styling
  const getClassificationColor = (classification: string) => {
    switch (classification) {
      case "Diamante": return "text-blue-600 bg-blue-50 border-blue-100";
      case "Ouro": return "text-yellow-600 bg-yellow-50 border-yellow-100";
      case "Prata": return "text-zinc-500 bg-zinc-50 border-zinc-200";
      default: return "text-orange-700 bg-orange-50 border-orange-100";
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="bg-white rounded-[32px] p-6 md:p-8 border border-zinc-100 shadow-xl shadow-zinc-200/40 relative overflow-hidden group">
        {/* Decorative Background Element */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-50/50 rounded-full blur-3xl group-hover:bg-orange-100/50 transition-colors" />
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-6">
            {/* User Classification Badge */}
            <div className={cn(
              "w-20 h-20 rounded-[24px] flex flex-col items-center justify-center border-2 shadow-sm transition-transform hover:scale-105",
              getClassificationColor(stats?.classification || "Bronze")
            )}>
              <Trophy className="w-8 h-8 mb-1" />
              <span className="text-[10px] font-black uppercase tracking-tighter">
                {stats?.classification || "Bronze"}
              </span>
            </div>

              <div className="flex flex-col">
                <h2 className="text-xl font-black text-zinc-900 leading-tight uppercase tracking-tight">
                  Seu Painel de Anunciante
                </h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500 font-bold text-[10px] uppercase tracking-widest mt-1">
                  <div className={cn(
                    "flex items-center gap-1.5",
                    stats?.email_verified ? "text-emerald-500" : "text-amber-500"
                  )}>
                    <ShieldCheck className={cn("w-3.5 h-3.5", stats?.email_verified ? "text-emerald-500" : "text-amber-500")} />
                    {stats?.email_verified ? "Email Verificado" : "Aguardando Verificação"}
                  </div>
                  <div className="w-1 h-1 rounded-full bg-zinc-300 hidden sm:block" />
                  <div className="text-zinc-400 lowercase font-medium">
                    {stats?.email || "anunciante@vendas.com"}
                  </div>
                </div>
              </div>
          </div>

          <div className="grid grid-cols-2 md:flex items-center gap-4 w-full md:w-auto">
            {/* Credits Card */}
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                <CreditCard className="w-3 h-3" /> Pacotes / Créditos
              </div>
              <div className="text-xl font-black text-zinc-900">
                {stats?.available_credits || 0} <span className="text-[10px] text-zinc-400">UNID.</span>
              </div>
            </div>

            {/* Listings Card */}
            <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex flex-col gap-1 min-w-[120px]">
              <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                <LayoutDashboard className="w-3 h-3" /> Meus Cadastros
              </div>
              <div className="text-xl font-black text-zinc-900">
                {stats?.total_listings || 0} <span className="text-[10px] text-zinc-400">IMÓVEIS</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto mt-6 md:mt-0">
            <Button 
                onClick={() => navigate('/mercado/meus-anuncios')}
                variant="outline"
                className="w-full md:w-auto h-14 px-6 border-2 border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 rounded-2xl font-black text-xs uppercase tracking-widest text-zinc-600 transition-all flex items-center justify-center gap-2"
            >
                Ver Meus Anúncios <TrendingUp className="w-4 h-4" />
            </Button>
            
            <Button 
                onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })}
                className="w-full md:w-auto h-14 px-8 bg-[#FF6A00] hover:bg-[#e65c00] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
            >
                Novo Anúncio <Plus className="w-4 h-4" />
            </Button>

            <div className="flex items-center justify-center gap-2">
                <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => navigate('/mercado/meus-anuncios')}
                    className="h-14 w-14 rounded-2xl bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-all"
                    title="Painel Completo"
                >
                    <Settings className="w-5 h-5" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => signOut()}
                    className="h-14 w-14 rounded-2xl bg-zinc-50 border border-zinc-100 hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-all"
                    title="Sair"
                >
                    <LogOut className="w-5 h-5" />
                </Button>
            </div>
          </div>
        </div>

        {/* Info Strip */}
        <div className="mt-8 pt-6 border-t border-zinc-50 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-400 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto whitespace-nowrap scrollbar-hide">
            <div className="flex items-center gap-1.5 bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-100">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {stats?.published_listings || 0} PUBLICADOS
            </div>
            <div className="flex items-center gap-1.5 bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-100">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              {stats?.pending_listings || 0} EM ANÁLISE
            </div>
            <div className="flex items-center gap-1.5 bg-zinc-50 px-3 py-1.5 rounded-lg border border-zinc-100">
               PROT. ANTIGRAVITY IA ATIVA
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-xs font-black text-[#FF6A00]">
            MAIS VENDIDO: PACOTE CIDADES GOLD <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
