import React, { useState, useEffect } from "react";
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
  MessageSquare,
  ShoppingBag,
  Eye,
  Headphones
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useContactIntentions } from "@/hooks/useContactIntentions";
import { FloatingMessageButton } from "./FloatingMessageButton";
import { FooterProfile } from "@/components/FooterProfile";
import { FooterNeutral } from "@/components/FooterNeutral";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AdvertiserPanelLayoutProps {
  children: React.ReactNode;
}

export function AdvertiserPanelLayout({ children }: AdvertiserPanelLayoutProps) {
  const { user, signOut, activeProfile, availableProfiles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Trava a rolagem do fundo enquanto o menu mobile está aberto (evita scroll duplo)
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);
  const { intentions } = useContactIntentions();
  // O checkout (/anunciante/checkout/:id) fica FORA dos prefixos /imoveis|/veiculos,
  // mas carrega ?ret=imoveis|veiculos (ver AdvertiserCreditsPage) para saber de onde
  // veio. Sem isso, o painel "perde" o contexto e cai no menu genérico da loja.
  const checkoutRet = location.pathname.startsWith("/anunciante/checkout")
    ? new URLSearchParams(location.search).get("ret")
    : null;
  // Badge de Mensagens por segmento (igual ao filtro da AdvertiserMessagesPage):
  // imóveis→real_estate, veículos→vehicles, loja→demais (produtos/mercado).
  const isImoveisCtx = location.pathname.startsWith("/anunciante/imoveis") || checkoutRet === "imoveis";
  const isVeiculosCtx = location.pathname.startsWith("/anunciante/veiculos") || checkoutRet === "veiculos";
  const isServicosCtx = location.pathname.startsWith("/anunciante/servicos") || checkoutRet === "servicos";
  const isFretesCtx = location.pathname.startsWith("/anunciante/fretes") || checkoutRet === "fretes";
  const isViagensCtx = location.pathname.startsWith("/anunciante/viagens") || checkoutRet === "viagens";
  const pendingLeadCount = intentions.filter((i) => {
    if (i.status === "unlocked") return false;
    if (isImoveisCtx) return i.listing_module === "real_estate";
    if (isVeiculosCtx) return i.listing_module === "vehicles";
    if (isServicosCtx) return i.listing_module === "services";
    if (isFretesCtx) return i.listing_module === "freight";
    if (isViagensCtx) return i.listing_module === "travel";
    return i.listing_module !== "real_estate" && i.listing_module !== "vehicles" && i.listing_module !== "services" && i.listing_module !== "freight" && i.listing_module !== "travel";
  }).length;

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

  // Mensagens agora conta SÓ leads (Pedidos e Ofertas têm badges próprios)
  const totalMessagesCount = pendingLeadCount;
  void marketplaceCount;

  // Contagem de OFERTAS pendentes (discount_requests)
  const { data: pendingOffersCount = 0 } = useQuery({
    queryKey: ["sidebar-pending-offers", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const storeIds: string[] = [];
      const { data: advList } = await (supabase.from("advertiser_accounts" as any).select("id").eq("user_id", user!.id)) as any;
      ((advList || []) as any[]).forEach((a: any) => { if (a?.id) storeIds.push(a.id); });
      const { data: msList } = await (supabase.from("merchant_stores" as any).select("id").eq("user_id", user!.id)) as any;
      ((msList || []) as any[]).forEach((s: any) => { if (s?.id) storeIds.push(s.id); });
      if (storeIds.length === 0) return 0;
      const { count } = await (supabase.from("discount_requests" as any)
        .select("id", { count: "exact", head: true })
        .in("store_id", storeIds)
        .neq("status", "deleted")) as any;
      return count || 0;
    },
  });

  // Contagem de PEDIDOS novos — RLS "pi_select_store_owner" filtra por ownership
  // automaticamente; não precisa buscar store_id manualmente.
  const { data: pendingOrdersCount = 0 } = useQuery({
    queryKey: ["sidebar-pending-orders", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { count } = await (supabase.from("purchase_intentions" as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "new")) as any;
      return count || 0;
    },
  });

  // Contagem de VISITAS da loja (marketplace_product_click_events — visitas cobradas)
  const { data: visitsCount = 0 } = useQuery({
    queryKey: ["sidebar-visits-count", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data: stores } = await (supabase.from("merchant_stores" as any).select("id").eq("user_id", user!.id)) as any;
      const storeIds = ((stores || []) as any[]).map((s: any) => s.id).filter(Boolean);
      if (storeIds.length === 0) return 0;
      const { count } = await (supabase.from("marketplace_product_click_events" as any)
        .select("id", { count: "exact", head: true })
        .in("store_id", storeIds)
        .not("status", "in", "(owner_skip,dry_run)")) as any;
      return count || 0;
    },
  });

  // Modo IMÓVEIS detectado pela ROTA (não vaza pro painel lojista): só quando a
  // URL está em /anunciante/imoveis/... o menu fica enxuto (sem itens de loja).
  const imoveisMode = isImoveisCtx;
  const veiculosMode = isVeiculosCtx;
  const servicosMode = isServicosCtx;
  const fretesMode = isFretesCtx;
  const viagensMode = isViagensCtx;

  // Persiste o contexto do painel para que páginas compartilhadas (ex.: Suporte,
  // que fica fora dos prefixos /anunciante/imoveis|veiculos|servicos|fretes|viagens) saibam para onde voltar.
  useEffect(() => {
    const ctx = veiculosMode ? "veiculos" : imoveisMode ? "imoveis" : servicosMode ? "servicos" : fretesMode ? "fretes" : viagensMode ? "viagens" : (activeProfile || "");
    sessionStorage.setItem("viagg_panel_context", ctx);
  }, [imoveisMode, veiculosMode, servicosMode, fretesMode, viagensMode, activeProfile]);

  // Lojista é caso EXCEPCIONAL: mostra os itens extras (Chamar Corridas,
  // Pedidos, Ofertas, Carteira, etc.) sempre que o usuário É lojista —
  // não só quando o perfil ativo transitório é "merchant".
  const showMerchantOnlyItems =
    activeProfile === "merchant" || (availableProfiles?.includes("merchant") ?? false);

  const navigation = veiculosMode ? [
    { name: "Painel Geral", href: "/anunciante/veiculos", icon: LayoutDashboard },
    { name: "Meus Anúncios", href: "/anunciante/veiculos/meus-anuncios", icon: Package },
    { name: "Divulgar Grátis", href: "/anunciante/veiculos/divulgar-gratis", icon: Megaphone },
    { name: "Mensagens", href: "/anunciante/veiculos/mensagens", icon: MessageSquare },
    { name: "Gestão e Pacotes", href: "/anunciante/veiculos/creditos", icon: Coins },
    { name: "Suporte", href: "/suporte/novo", icon: Headphones },
    { name: "Sair", href: "#", icon: LogOut, action: "logout" },
  ] : servicosMode ? [
    { name: "Painel Geral", href: "/anunciante/servicos", icon: LayoutDashboard },
    { name: "Meus Anúncios", href: "/anunciante/servicos/meus-anuncios", icon: Package },
    { name: "Divulgar Grátis", href: "/anunciante/servicos/divulgar-gratis", icon: Megaphone },
    { name: "Mensagens", href: "/anunciante/servicos/mensagens", icon: MessageSquare },
    { name: "Gestão e Pacotes", href: "/anunciante/servicos/creditos", icon: Coins },
    { name: "Suporte", href: "/suporte/novo", icon: Headphones },
    { name: "Sair", href: "#", icon: LogOut, action: "logout" },
  ] : fretesMode ? [
    { name: "Painel Geral", href: "/anunciante/fretes", icon: LayoutDashboard },
    { name: "Meus Anúncios", href: "/anunciante/fretes/meus-anuncios", icon: Package },
    { name: "Divulgar Grátis", href: "/anunciante/fretes/divulgar-gratis", icon: Megaphone },
    { name: "Mensagens", href: "/anunciante/fretes/mensagens", icon: MessageSquare },
    { name: "Gestão e Pacotes", href: "/anunciante/fretes/creditos", icon: Coins },
    { name: "Suporte", href: "/suporte/novo", icon: Headphones },
    { name: "Sair", href: "#", icon: LogOut, action: "logout" },
  ] : viagensMode ? [
    { name: "Painel Geral", href: "/anunciante/viagens", icon: LayoutDashboard },
    { name: "Meus Anúncios", href: "/anunciante/viagens/meus-anuncios", icon: Package },
    { name: "Divulgar Grátis", href: "/anunciante/viagens/divulgar-gratis", icon: Megaphone },
    { name: "Mensagens", href: "/anunciante/viagens/mensagens", icon: MessageSquare },
    { name: "Gestão e Pacotes", href: "/anunciante/viagens/creditos", icon: Coins },
    { name: "Suporte", href: "/suporte/novo", icon: Headphones },
    { name: "Sair", href: "#", icon: LogOut, action: "logout" },
  ] : imoveisMode ? [
    { name: "Painel Geral", href: "/anunciante/imoveis", icon: LayoutDashboard },
    { name: "Meus Anúncios", href: "/anunciante/imoveis/meus-anuncios", icon: Package },
    { name: "Divulgar Grátis", href: "/anunciante/imoveis/divulgar-gratis", icon: Megaphone },
    { name: "Mensagens", href: "/anunciante/imoveis/mensagens", icon: MessageSquare },
    { name: "Gestão e Pacotes", href: "/anunciante/imoveis/creditos", icon: Coins },
    { name: "Suporte", href: "/suporte/novo", icon: Headphones },
    { name: "Sair", href: "#", icon: LogOut, action: "logout" },
  ] : [
    { name: "Painel Geral", href: "/anunciante/painel", icon: LayoutDashboard },
    ...(showMerchantOnlyItems ? [
      { name: "Chamar Corridas", href: "/merchant/create-delivery", icon: Truck },
      { name: "Minha Loja", href: "/loja/minha-loja", icon: Store },
    ] : []),
    { name: "Meus Anúncios", href: "/anunciante/meus-anuncios", icon: Package },
    { name: "Divulgar Grátis", href: "/anunciante/divulgar-gratis", icon: Megaphone },
    { name: "Mensagens", href: "/anunciante/mensagens", icon: MessageSquare },
    ...(showMerchantOnlyItems ? [
      { name: "Ofertas Recebidas", href: "/anunciante/ofertas-recebidas", icon: Tag },
      { name: "Pedidos", href: "/anunciante/pedidos", icon: ShoppingBag },
      { name: "Visitas", href: "/anunciante/visitas", icon: Eye },
      { name: "Entregas e Rotas", href: "/anunciante/entregas", icon: ClipboardList },
      { name: "Carteira", href: "/anunciante/carteira", icon: Wallet },
    ] : []),
    { name: "Gestão e Pacotes", href: "/anunciante/creditos", icon: Coins },
    { name: "Minha Conta", href: "/anunciante/conta", icon: User },
    { name: "Suporte", href: "/suporte/novo", icon: Headphones },
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
          "w-full h-10 flex items-center gap-3 px-3 rounded-xl font-black text-[9px] uppercase tracking-[0.15em] transition-all duration-300 group",
          isActive 
            ? "bg-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/20" 
            : isLogout
              ? "text-[#EF4444]/70 hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
              : "text-[#A7B0BE] hover:bg-[#1B1F24] hover:text-[#F5F7FA]"
        )}
      >
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
          <item.icon className={cn(
            "w-4 h-4 transition-colors", 
            isActive ? "text-white" : isLogout ? "text-[#EF4444]/70 group-hover:text-[#EF4444]" : "text-[#A7B0BE] group-hover:text-[#F5F7FA]"
          )} />
        </div>
        <span className="truncate">{item.name}</span>
        {(() => {
          const badge =
            item.name === "Mensagens" ? totalMessagesCount :
            item.name === "Ofertas Recebidas" ? pendingOffersCount :
            item.name === "Pedidos" ? pendingOrdersCount :
            item.name === "Visitas" ? visitsCount :
            0;
          if (!badge || badge <= 0) return null;
          return (
            <span className="ml-auto text-[21px] font-black tabular-nums leading-none text-[#22C55E] animate-pulse">
              {badge}
            </span>
          );
        })()}
      </button>
    );

    if (item.action === "logout") return content;
    
    return (
      <Link
        to={item.href}
        className="block w-full"
        onClick={(e) => {
          if (isMobile) setMobileMenuOpen(false);
          // Força reload apenas dentro do painel /anunciante/ para evitar
          // stale location do React Router v7 startTransition.
          // Links externos (ex: /loja/...) usam navegação normal do React Router.
          if (item.href.startsWith("/anunciante/")) {
            e.preventDefault();
            window.location.href = item.href;
          }
        }}
      >
        {content}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#14171B] flex flex-col md:flex-row overflow-x-clip">
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
            className="h-12 w-auto rounded-lg shadow-md"
          />
          <div className="flex flex-col ml-1">
             <h2 className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em] leading-tight">Painel Vendedor</h2>
             {veiculosMode && <span className="text-[9px] font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Veículos</span>}
             {imoveisMode && <span className="text-[9px] font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Imóveis</span>}
             {servicosMode && <span className="text-[9px] font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Serviços</span>}
             {fretesMode && <span className="text-[9px] font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Fretes</span>}
             {viagensMode && <span className="text-[9px] font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Viagens</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div id="global-audio-portal-mobile" className="relative flex items-center shrink-0" />
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white hover:bg-white/10">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-20 md:hidden pt-20">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <nav className="relative bg-[#0D0F12] border-t border-[#2A3038]/60 px-4 pt-3 pb-24 shadow-2xl shadow-black/60 animate-in slide-in-from-top duration-300 h-[calc(100vh-5rem)] overflow-y-auto custom-scrollbar flex flex-col justify-start gap-0.5">
            {navigation.map((item) => (
              <SidebarItem key={item.name} item={item} isMobile />
            ))}
          </nav>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-x-clip">
        {/* Top Desktop Bar */}
        <header className="hidden md:flex h-20 bg-[#0D0F12]/95 border-b border-[#2A3038]/60 px-10 items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex flex-col">
             <h2 className="text-sm font-black text-[#A7B0BE] uppercase tracking-[0.2em]">Painel Vendedor</h2>
             {veiculosMode && <span className="text-xs font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Veículos</span>}
             {imoveisMode && <span className="text-xs font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Imóveis</span>}
             {servicosMode && <span className="text-xs font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Serviços</span>}
             {fretesMode && <span className="text-xs font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Fretes</span>}
             {viagensMode && <span className="text-xs font-bold text-[#FF6A00] uppercase tracking-widest mt-0.5">Viagens</span>}
          </div>
          <div className="flex items-center gap-6">
            <div id="global-audio-portal-desktop" className="relative flex items-center shrink-0" />
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
        <div className="p-4 sm:p-6 md:p-10 lg:p-12 pb-24 min-h-screen bg-[#14171B] flex flex-col">
          <div className="max-w-7xl mx-auto w-full min-w-0 flex-1 flex flex-col">
            {children}
          </div>
        </div>

        {(veiculosMode || imoveisMode || servicosMode || fretesMode || viagensMode) ? <FooterNeutral /> : <FooterProfile profile="advertiser" />}
      </main>

      {/* Botão flutuante para Mensagens */}
      <FloatingMessageButton />

      {/* Sem bottom nav aqui: o menu hambúrguer do painel já cobre toda a
          navegação (inclusive "Minha Loja"). A barra inferior só aparece
          depois que o usuário sai deste painel e entra em /loja/minha-loja
          (StoreAppLayout tem sua própria <StoreBottomNav /> sempre visível). */}
    </div>
  );
}
