import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Building2, 
  Package, 
  Megaphone, 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  User, 
  CreditCard,
  Menu,
  X,
  Sparkles,
  Store,
  Wallet,
  ClipboardList,
  BarChart3,
  Coins,
  Gavel,
  Tag,
  TrendingUp,
  Star,
  Truck,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useContactIntentions } from "@/hooks/useContactIntentions";
import { FloatingMessageButton } from "./FloatingMessageButton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AdvertiserPanelLayoutProps {
  children: React.ReactNode;
}

export function AdvertiserPanelLayout({ children }: AdvertiserPanelLayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { intentions } = useContactIntentions();
  const pendingLeadCount = intentions.filter(i => i.status !== "unlocked").length;

  const { data: marketplaceCount = 0 } = useQuery({
    queryKey: ["advertiser-marketplace-messages-count", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: stores } = await (supabase.from("merchant_stores") as any)
        .select("id")
        .eq("user_id", user!.id);
      const storeIds = (stores || []).map((s: any) => s.id);
      if (storeIds.length === 0) return 0;
      const { count } = await (supabase.from("purchase_intentions") as any)
        .select("id", { count: "exact", head: true })
        .in("store_id", storeIds)
        .eq("status", "new");
      return count || 0;
    },
  });

  const totalMessagesCount = pendingLeadCount + marketplaceCount;

  const navigation = [
    { name: "Painel Geral", href: "/anunciante/painel", icon: LayoutDashboard },
    { name: "Minha Loja", href: "/loja/minha-loja", icon: Store },
    { name: "Meus Anúncios", href: "/anunciante/meus-anuncios", icon: Package },
    { name: "Divulgar Grátis", href: "/anunciante/divulgar-gratis", icon: Megaphone },
    { name: "Mensagens", href: "/anunciante/mensagens", icon: MessageSquare },
    // Leilão / Arremate / Nova Entrega ocultados
    { name: "Entregas e Rotas", href: "/anunciante/entregas", icon: ClipboardList },
    { name: "Créditos", href: "/anunciante/creditos", icon: Coins },
    { name: "Carteira", href: "/anunciante/carteira", icon: Wallet },
    { name: "Minha Conta", href: "/anunciante/conta", icon: User },
    { name: "Sair", href: "#", icon: LogOut, action: "logout" },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/mercado");
  };

  const SidebarItem = ({ item, isMobile = false }: { item: typeof navigation[0], isMobile?: boolean }) => {
    const isActive = location.pathname === item.href;
    const isLogout = item.name === "Sair";
    
    const content = (
      <button 
        onClick={item.action === "logout" ? handleSignOut : undefined}
        className={cn(
          "w-full h-12 flex items-center gap-4 px-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 group",
          isActive 
            ? "bg-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/20" 
            : isLogout
              ? "text-[#EF4444]/70 hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
              : "text-[#A7B0BE] hover:bg-[#1B1F24] hover:text-[#F5F7FA]"
        )}
      >
        <div className="w-6 h-6 flex items-center justify-center shrink-0">
          <item.icon className={cn(
            "w-4 h-4 transition-colors", 
            isActive ? "text-white" : isLogout ? "text-[#EF4444]/70 group-hover:text-[#EF4444]" : "text-[#A7B0BE] group-hover:text-[#F5F7FA]"
          )} />
        </div>
        <span className="truncate">{item.name}</span>
        {item.name === "Mensagens" && totalMessagesCount > 0 && (
          <span className="ml-auto bg-[#22C55E] text-white text-base font-black min-w-[35px] h-[35px] flex items-center justify-center rounded-full px-2 shadow-lg shadow-emerald-500/30 animate-pulse">
            {totalMessagesCount}
          </span>
        )}
      </button>
    );

    if (item.action === "logout") return content;
    
    return (
      <Link to={item.href} className="block w-full" onClick={isMobile ? () => setMobileMenuOpen(false) : undefined}>
        {content}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#14171B] flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 bg-[#0D0F12] text-white flex-col border-r border-[#2A3038]/60 z-20 sticky top-0 h-screen">
        <div className="h-32 flex items-center justify-center p-8 border-b border-[#2A3038]/60">
          <img 
            src="/assets/brand/logo-advertiser.jpg" 
            alt="Viagg-Tx8" 
            className="h-20 w-auto rounded-xl shadow-2xl transition-all duration-500 hover:scale-105 saturate-[1.1]"
          />
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-1.5 overflow-y-auto custom-scrollbar">
          {navigation.map((item) => (
            <SidebarItem key={item.name} item={item} />
          ))}
        </nav>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden h-20 bg-[#0D0F12] text-white flex items-center justify-between px-6 z-30 sticky top-0 border-b border-[#2A3038]/60 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-3">
          <img 
            src="/assets/brand/logo-advertiser.jpg" 
            alt="Viagg-Tx8" 
            className="h-16 w-auto rounded-lg shadow-md"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:bg-white/10">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-20 md:hidden pt-20">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <nav className="relative bg-[#0D0F12] border-t border-[#2A3038]/60 p-6 space-y-1.5 shadow-2xl shadow-black/60 animate-in slide-in-from-top duration-300">
            {navigation.map((item) => (
              <SidebarItem key={item.name} item={item} isMobile />
            ))}
          </nav>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top Desktop Bar */}
        <header className="hidden md:flex h-20 bg-[#0D0F12]/95 border-b border-[#2A3038]/60 px-10 items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div>
             <h2 className="text-sm font-black text-[#A7B0BE] uppercase tracking-[0.2em]">Área Administrativa</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="h-8 w-px bg-[#2A3038]" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-[#F5F7FA] uppercase tracking-tight">{user?.email}</p>
                 <p className="text-[10px] font-bold text-[#FF6A00] uppercase tracking-widest">Conta Premium</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#FF6A00]/15 border border-[#FF6A00]/30 flex items-center justify-center text-[#FF6A00] font-black shadow-sm shadow-[#FF6A00]/10">
                {user?.email?.[0].toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content Wrapper */}
        <div className="p-6 md:p-10 lg:p-12 pb-24 min-h-screen bg-[#14171B]">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* Botão flutuante para Mensagens */}
      <FloatingMessageButton />
    </div>
  );
}
