import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { FooterNeutral } from "@/components/FooterNeutral";
import {
    Search,
    ShoppingBag,
    ShoppingCart,
    Megaphone,
    Building2,
    Car,
    Menu,
    Home,
    LogIn,
    Gavel,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface MarketLayoutProps {
    children: React.ReactNode;
    search?: string;
    setSearch?: (val: string) => void;
    showSearch?: boolean;
    headerChildren?: React.ReactNode;
    headerRight?: React.ReactNode;
    hideHeaderAuth?: boolean;
    mainClassName?: string;
    onSearchSubmit?: (val: string) => void;
    hideCart?: boolean;
}

export function MarketLayout({
    children,
    search = "",
    setSearch,
    showSearch = true,
    headerChildren,
    headerRight,
    hideHeaderAuth = false,
    mainClassName,
    onSearchSubmit,
    hideCart = false
}: MarketLayoutProps) {
    const navigate = useNavigate();
    const { user, isLoading } = useAuth();
    const [cartOpen, setCartOpen] = useState(false);
    const globalCart = useGlobalCart();

    return (
        <div className={cn("min-h-screen flex flex-col", !mainClassName && "bg-[#F5E62B]")}>
            {/* ═══ TOP BAR ═══ */}
            <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] sticky top-0 z-50 shadow-md">
                <div className="max-w-[1920px] mx-auto px-4 lg:px-6">
                    <div className="flex items-center gap-4 h-[72px] relative w-full">
                        {<div className="lg:hidden">
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <button
                type="button"
                aria-label="Abrir menu"
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white shrink-0 transition-colors outline-none"
            >
                <Menu className="w-6 h-6" />
            </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-[260px] bg-white rounded-xl shadow-xl border border-zinc-100 p-2 lg:hidden">
            <DropdownMenuItem onClick={() => navigate("/mercado")} className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg hover:bg-zinc-50 focus:bg-zinc-50 text-zinc-800">
                <Home className="w-5 h-5 text-[#FF6A00]" />
                <span className="font-bold text-[15px]">Início</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/mercado?view=produtos")} className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg hover:bg-zinc-50 focus:bg-zinc-50 text-zinc-800">
                <ShoppingBag className="w-5 h-5 text-[#FF6A00]" />
                <span className="font-bold text-[15px]">Mercado</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/imoveis")} className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg hover:bg-zinc-50 focus:bg-zinc-50 text-zinc-800">
                <Building2 className="w-5 h-5 text-[#FF6A00]" />
                <span className="font-bold text-[15px]">Imóveis</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/automoveis")} className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg hover:bg-zinc-50 focus:bg-zinc-50 text-zinc-800">
                <Car className="w-5 h-5 text-[#FF6A00]" />
                <span className="font-bold text-[15px]">Veículos</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/mercado/leiloes")} className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg hover:bg-zinc-50 focus:bg-zinc-50 text-zinc-800">
                <Gavel className="w-5 h-5 text-[#FF6A00]" />
                <span className="font-bold text-[15px]">Leilões</span>
            </DropdownMenuItem>

            {!user && !isLoading && (
                <>
                    <div className="h-px bg-zinc-100 my-2 mx-2" />
                    <DropdownMenuItem onClick={() => navigate("/auth?entry=advertiser")} className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg hover:bg-zinc-50 focus:bg-zinc-50 text-zinc-800">
                        <Megaphone className="w-5 h-5 text-[#FF6A00]" />
                        <span className="font-bold text-[15px]">Área do Anunciante</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/auth")} className="flex items-center gap-3 px-4 py-3 cursor-pointer rounded-lg hover:bg-zinc-50 focus:bg-zinc-50 text-zinc-800">
                        <LogIn className="w-5 h-5 text-[#FF6A00]" />
                        <span className="font-bold text-[15px]">Entrar / Cadastrar</span>
                    </DropdownMenuItem>
                </>
            )}
        </DropdownMenuContent>
    </DropdownMenu>
</div>}

                        <div className="flex items-center gap-4 shrink-0 absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0">
                            {/* The dark cart button next to logo, ALWAYS FIXED */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setCartOpen(true); }}
                                className="relative flex items-center gap-2 bg-[#F5E62B] text-gray-900 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-lg hover:brightness-95 hover:scale-105 active:scale-95 transition-all outline-none"
                            >
                                <ShoppingCart className="h-5 w-5" />
                                <span className="text-sm font-black whitespace-nowrap">
                                    <span className="hidden sm:inline">Cesta — </span>{globalCart.totalItems} {globalCart.totalItems === 1 ? "item" : "itens"}
                                </span>
                                {globalCart.totalItems > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-[#FF6A00] text-white text-[10px] font-black rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow-md border-2 border-[#F5E62B] animate-pulse">
                                        {globalCart.totalItems}
                                    </span>
                                )}
                            </button>

                            {/* Desktop Logo (hidden on mobile) */}
                            <div className="hidden lg:flex items-center gap-2 cursor-pointer" onClick={() => navigate("/mercado")}>
                                <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-12 w-12 rounded-lg object-contain" />
                                <span className="text-xl font-black text-white tracking-tight">
                                    Mercado Local <span className="text-yellow-200">Viagg-TX8</span>
                                </span>
                            </div>
                        </div>

                        {/* Real Estate Quick Link */}
                        <div 
                          className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full cursor-pointer border border-white/20 transition-all text-white font-bold text-sm"
                          onClick={() => navigate("/imoveis")}
                        >
                          <Building2 className="w-4 h-4" />
                          Imóveis
                        </div>
                        {/* Vehicles Quick Link */}
                        <div 
                          className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full cursor-pointer border border-white/20 transition-all text-white font-bold text-sm"
                          onClick={() => navigate("/automoveis")}
                        >
                          <Car className="w-4 h-4" />
                          Veículos
                        </div>
                        {/* Auctions Quick Link */}
                        <div 
                          className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-[#FF6A00]/20 hover:bg-[#FF6A00]/30 rounded-full cursor-pointer border border-[#FF6A00]/40 transition-all text-white font-bold text-sm"
                          onClick={() => navigate("/mercado/leiloes")}
                        >
                          <Gavel className="w-4 h-4" />
                          Leilões
                        </div>
                        {/* Mercado Quick Link */}
                        <div 
                          className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full cursor-pointer border border-white/20 transition-all text-white font-bold text-sm"
                          onClick={() => navigate("/mercado?view=produtos")}
                        >
                          <ShoppingBag className="w-4 h-4" />
                          Mercado
                        </div>

                        {/* Search (desktop inline) */}
                        {showSearch && (
                            <div className="hidden lg:block flex-1 max-w-2xl mx-auto">
                                <div className="relative flex">
                                    <Input
                                        placeholder="Buscar produtos, lojas..."
                                        value={search}
                                        onChange={e => setSearch?.(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter" && onSearchSubmit) {
                                                onSearchSubmit(search);
                                            }
                                        }}
                                        className="w-full pl-4 pr-12 py-2 h-[52px] rounded-l-lg rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-[15px] font-medium focus-visible:ring-0"
                                    />
                                    <button
                                        onClick={() => onSearchSubmit?.(search)}
                                        className="px-5 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-lg flex items-center"
                                    >
                                        <Search className="h-6 w-6 text-white" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Spacer for mobile to push cart to the right */}
                        <div className="flex-1 lg:hidden" />

                        <div className="flex items-center gap-3 text-white shrink-0">
                            {headerRight}

                            {/* Mobile Logo (hidden on desktop) */}
                            <div className="lg:hidden flex items-center gap-2 cursor-pointer" onClick={() => navigate("/mercado")}>
                                <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-10 w-10 rounded-lg object-contain shadow-sm" />
                            </div>
                            
                            {!user && !isLoading && !hideHeaderAuth && (
                              <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => navigate('/auth?entry=advertiser')}
                                    variant="ghost"
                                    className="text-[#FF6A00] bg-white hover:bg-zinc-100 font-black text-xs h-[44px] px-6 rounded-xl shadow-lg border-0 uppercase tracking-widest whitespace-nowrap hidden md:flex items-center gap-2"
                                >
                                    <Building2 className="w-4 h-4" />
                                    Área do Anunciante
                                </Button>

                              </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile search row */}
                    {showSearch && (
                        <div className="lg:hidden pb-3">
                            <div className="relative flex">
                                <Input
                                    placeholder="Buscar produtos, lojas..."
                                    value={search}
                                    onChange={e => setSearch?.(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" && onSearchSubmit) {
                                            onSearchSubmit(search);
                                        }
                                    }}
                                    className="w-full pl-4 pr-12 py-2 h-[46px] rounded-l-lg rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-[14px] font-medium focus-visible:ring-0"
                                />
                                <button
                                    onClick={() => onSearchSubmit?.(search)}
                                    className="px-4 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-lg flex items-center"
                                    aria-label="Buscar"
                                >
                                    <Search className="h-5 w-5 text-white" />
                                </button>
                            </div>
                        </div>
                    )}

                    {headerChildren}
                </div>
            </div>

            {/* ═══ MAIN CONTENT ═══ */}
            <main className={cn("flex-1", mainClassName)}>
                {children}
            </main>

            {/* ═══ FOOTER ═══ */}
            <FooterNeutral />

            {/* ── Drawers/Modals ── */}
            {!hideCart && <GlobalCartDrawer open={cartOpen} onOpenChange={setCartOpen} globalCart={globalCart} />}


        </div>
    );
}
