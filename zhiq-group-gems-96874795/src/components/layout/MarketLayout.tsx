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
    LogOut,
    Gavel,
    HardHat,
    Store,
    Truck,
    Shield,
    Tag,
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
    /** Força FooterNeutral mesmo para merchants (impede StoreBottomNav em páginas públicas de outros módulos). */
    hideStoreNav?: boolean;
    /** Exibe rodapé azul Viagg-TX8 e oculta StoreBottomNav. Ideal para páginas públicas de módulos. */
    blueFooter?: boolean;
    /** Texto do módulo exibido no rodapé azul (ex: "🏠 Imóveis", "🚗 Veículos"). Padrão: "Mercado Local". */
    blueFooterLabel?: string;
    /** Rota da página "Minha Conta" do módulo. Quando fornecida, exibe botão no header para usuário logado. */
    myAccountPath?: string;
    /** Esconde o botão Motoboy do topo (usado quando ele é exibido em outra linha). */
    hideTopMotoboy?: boolean;
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
    hideFooter = false,
    hideStoreNav = false,
    blueFooter = false,
    blueFooterLabel = "Mercado Local",
    myAccountPath,
    hideTopMotoboy = false
}: MarketLayoutProps) {
    const navigate = useNavigate();
    const { user, isLoading, availableProfiles, activeProfile, signOut } = useAuth();
    const isMerchant = activeProfile === 'merchant';


    const handleVendedorClick = () => {
        navigate("/auth");
    };

    const handleSair = async () => {
        await signOut();
        navigate("/");
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
                    {/* ── MOBILE HEADER (< lg) ── */}
                    <div className="relative flex items-center h-[50px] w-full lg:hidden px-2">
                        {/* Centro absoluto: Logo + Cesta */}
                        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                            <div className="cursor-pointer" onClick={() => navigate("/mercado")}>
                                <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-7 w-7 rounded-md object-contain shadow-sm" />
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setCartOpen(true); }}
                                className="relative flex h-7 w-10 items-center justify-center bg-[#F5E62B] text-gray-900 rounded-lg shadow-lg hover:brightness-95 transition-all outline-none"
                                title="Cesta"
                            >
                                <ShoppingCart className="h-4 w-4" />
                                {globalCart.totalItems > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-[#FF6A00] text-white text-[8px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 shadow-md border border-[#F5E62B] animate-pulse">
                                        {globalCart.totalItems}
                                    </span>
                                )}
                            </button>
                            <div id="global-audio-portal-mobile" className="relative flex items-center shrink-0" onClick={(e) => e.stopPropagation()} />
                        </div>

                        {/* Direita */}
                        <div className="ml-auto flex items-center gap-1">
                            {headerRight}
                        </div>
                    </div>

                    {/* ── DESKTOP HEADER (≥ lg) ── */}
                    <div className="hidden lg:flex items-center h-[72px] w-full gap-4">
                        {/* Logo + título */}
                        <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => navigate("/mercado")}>
                            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-12 w-12 rounded-lg object-contain" />
                            <span className="text-xl font-black text-white tracking-tight whitespace-nowrap">
                                Mercado Local <span className="text-yellow-200">Viagg-TX8™</span>
                            </span>
                            <div id="global-audio-portal-desktop" className="relative flex items-center shrink-0" onClick={(e) => e.stopPropagation()} />
                        </div>

                        {/* Search — ocupa todo o espaço central */}
                        {showSearch && (
                            <div className="flex-1 min-w-0">
                                <div className="relative flex">
                                    <Input
                                        placeholder="Buscar produtos, lojas..."
                                        value={search}
                                        onChange={e => setSearch?.(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter" && onSearchSubmit) onSearchSubmit(search); }}
                                        className="w-full pl-4 h-[44px] rounded-l-xl rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-[15px] font-medium focus-visible:ring-0"
                                    />
                                    <button onClick={() => onSearchSubmit?.(search)} className="px-5 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-xl flex items-center shrink-0">
                                        <Search className="h-5 w-5 text-white" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Direita: Cesta + headerRight */}
                        <div className="flex items-center gap-3 shrink-0">
                            <button
                                onClick={(e) => { e.stopPropagation(); setCartOpen(true); }}
                                className="relative flex h-auto px-4 py-2 items-center justify-center gap-2 bg-[#F5E62B] text-gray-900 rounded-xl shadow-lg hover:brightness-95 hover:-translate-y-0.5 active:translate-y-0 transition-all outline-none"
                                title="Cesta"
                            >
                                <ShoppingCart className="h-5 w-5" />
                                <span className="text-sm font-black whitespace-nowrap">
                                    Cesta — {globalCart.totalItems} {globalCart.totalItems === 1 ? "item" : "itens"}
                                </span>
                                {globalCart.totalItems > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-[#FF6A00] text-white text-[10px] font-black rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow-md border-2 border-[#F5E62B] animate-pulse">
                                        {globalCart.totalItems}
                                    </span>
                                )}
                            </button>

                            <div className="flex items-center gap-2 text-white">
                                {headerRight}
                            </div>
                        </div>
                    </div>

                    {/* Mobile search row */}
                    {showSearch && (
                        <div className="lg:hidden pb-2">
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
                                    className="w-full pl-3 pr-10 py-1.5 h-[32px] rounded-l-lg rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-[12px] font-medium focus-visible:ring-0"
                                />
                                <button
                                    onClick={() => onSearchSubmit?.(search)}
                                    className="px-3 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-lg flex items-center"
                                    aria-label="Buscar"
                                >
                                    <Search className="h-4 w-4 text-white" />
                                </button>
                            </div>
                        </div>
                    )}

                    {headerChildren}
                </div>
            </div>

            {/* ═══ TRUST BAR ═══ */}
            <div className="bg-[#F5E62B] px-4 lg:py-1.5 py-1 flex items-center justify-center gap-4 lg:gap-6 text-[9px] lg:text-[11px] text-gray-600">
                <span className="flex items-center gap-1 font-medium">
                    <Truck className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-[#FF6A00]" /> Entrega Local
                </span>
                <span className="flex items-center gap-1 font-medium">
                    <Shield className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-green-500" /> Comerciantes Verificados
                </span>
                <span className="flex items-center gap-1 font-medium hidden sm:flex">
                    <Tag className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-blue-500" /> Melhores Preços
                </span>
            </div>

            {/* ═══ MAIN CONTENT ═══ */}
            <main className={cn("flex-1", isMerchant && !hideStoreNav && !blueFooter && "pb-20 md:pb-0", mainClassName)}>
                {children}
            </main>

            {/* ═══ FOOTER / BOTTOM NAV ═══ */}
            {blueFooter ? (
                <footer className="w-full bg-sky-700 text-white text-center py-3 text-xs font-medium space-y-1">
                    <p>Viagg-TX8™ · {blueFooterLabel} · viagg-tx8.com</p>
                    <p className="text-white/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
                </footer>
            ) : (
                isMerchant && !hideStoreNav ? <StoreBottomNav /> : (!hideFooter && <FooterNeutral />)
            )}

            {/* ── Drawers/Modals ── */}
            {!hideCart && <GlobalCartDrawer open={cartOpen} onOpenChange={setCartOpen} globalCart={globalCart} />}


        </div>
    );
}
