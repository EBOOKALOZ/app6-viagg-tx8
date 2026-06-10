import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { FooterNeutral } from "@/components/FooterNeutral";
import { StoreBottomNav } from "@/components/store/StoreBottomNav";
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
    HardHat,
    Store,
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
    hideFooter?: boolean;
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
    hideCart = false,
    hideFooter = false
}: MarketLayoutProps) {
    const navigate = useNavigate();
    const { user, isLoading, availableProfiles, activeProfile } = useAuth();
    const isMerchant = activeProfile === 'merchant';

    const handleMotoboyClick = () => {
        if (!user) {
            localStorage.setItem("viagg_auth_entry", "motoboy");
            // Usuário anônimo vai direto pro cadastro (signup mode já pré-selecionado)
            navigate("/auth?entry=motoboy&signup=1");
            return;
        }
        if (availableProfiles?.includes("motoboy")) {
            navigate("/motoboy/dashboard");
        } else {
            navigate("/motoboy/completar");
        }
    };

    const handleVendedorClick = () => {
        if (!user) {
            localStorage.setItem("viagg_auth_entry", "advertiser");
            navigate("/auth");
            return;
        }
        if (availableProfiles?.includes("merchant")) {
            navigate("/loja/minha-loja");
        } else {
            navigate("/auth");
        }
    };
    const [cartOpen, setCartOpen] = useState(false);
    const globalCart = useGlobalCart();

    useEffect(() => {
        const handleOpenCart = () => setCartOpen(true);
        window.addEventListener("vtx8-cart-add-action", handleOpenCart);
        return () => window.removeEventListener("vtx8-cart-add-action", handleOpenCart);
    }, []);

    return (
        <div className={cn("min-h-screen flex flex-col", !mainClassName && "bg-[#F5E62B]")}>
            {/* ═══ TOP BAR ═══ */}
            <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] sticky top-0 z-50 shadow-md">
                <div className="max-w-[1920px] mx-auto px-4 lg:px-6">
                    <div className="flex items-center gap-4 h-[72px] relative w-full">
                        {/* Mobile logo — esquerda */}
                        <div className="lg:hidden flex items-center cursor-pointer shrink-0" onClick={() => navigate("/mercado")}>
                            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-10 w-10 rounded-lg object-contain shadow-sm" />
                        </div>

                        <div className="flex-1 flex items-center justify-center gap-2 lg:flex-none lg:justify-start lg:gap-3 px-2 lg:px-0">
                            {/* MOTOBOY — esquerda */}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleMotoboyClick(); }}
                                className="group flex h-10 w-[92px] lg:h-auto lg:w-auto lg:px-4 lg:py-2.5 items-center justify-center bg-white rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all outline-none border border-orange-200/50"
                                title="Motoboy"
                            >
                                <span className="text-[11px] lg:text-xs font-black whitespace-nowrap uppercase tracking-wide text-[#FF6A00]">Motoboy</span>
                            </button>

                            {/* CESTA — centro */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setCartOpen(true); }}
                                className="relative flex h-10 w-16 lg:h-auto lg:w-auto lg:px-4 lg:py-2.5 items-center justify-center gap-2 bg-[#F5E62B] text-gray-900 rounded-xl shadow-lg hover:brightness-95 hover:-translate-y-0.5 active:translate-y-0 transition-all outline-none"
                                title="Cesta"
                            >
                                <ShoppingCart className="h-5 w-5" />
                                <span className="hidden lg:inline text-sm font-black whitespace-nowrap">
                                    Cesta — {globalCart.totalItems} {globalCart.totalItems === 1 ? "item" : "itens"}
                                </span>
                                {globalCart.totalItems > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-[#FF6A00] text-white text-[10px] font-black rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow-md border-2 border-[#F5E62B] animate-pulse">
                                        {globalCart.totalItems}
                                    </span>
                                )}
                            </button>

                            {/* LOJISTA — direita */}
                            <button
                                onClick={(e) => { e.stopPropagation(); handleVendedorClick(); }}
                                className="group flex h-10 w-[92px] lg:h-auto lg:w-auto lg:px-4 lg:py-2.5 items-center justify-center bg-white rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all outline-none border border-emerald-200/50"
                                title="Sou Lojista"
                            >
                                <span className="text-[11px] lg:text-xs font-black whitespace-nowrap uppercase tracking-wide text-emerald-600">Lojista</span>
                            </button>

                            {/* Desktop Logo (hidden on mobile) */}
                            <div className="hidden lg:flex items-center gap-2 cursor-pointer" onClick={() => navigate("/mercado")}>
                                <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-12 w-12 rounded-lg object-contain" />
                                <span className="text-xl font-black text-white tracking-tight">
                                    Mercado Local <span className="text-yellow-200">Viagg-TX8</span>
                                </span>
                            </div>
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

                        {/* Spacer (apenas desktop, mobile usa flex-1 no container dos botões) */}

                        <div className="flex items-center gap-3 text-white shrink-0">
                            {headerRight}

                            {!user && !isLoading && !hideHeaderAuth && (
                              <div className="flex items-center gap-2">
                                <Button
                                    onClick={() => navigate('/auth')}
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
            <main className={cn("flex-1", isMerchant && "pb-20 md:pb-0", mainClassName)}>
                {children}
            </main>

            {/* ═══ FOOTER / BOTTOM NAV ═══
                Lojista vê o StoreBottomNav fixo (consistente com as demais telas).
                Demais perfis e visitantes mantêm o FooterNeutral em fluxo. */}
            {isMerchant ? <StoreBottomNav /> : (!hideFooter && <FooterNeutral />)}

            {/* ── Drawers/Modals ── */}
            {!hideCart && <GlobalCartDrawer open={cartOpen} onOpenChange={setCartOpen} globalCart={globalCart} />}


        </div>
    );
}
