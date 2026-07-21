import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { HeroClimaRadio } from "@/components/public/HeroClimaRadio";
import { GlobalSearchBar } from "@/components/public/GlobalSearchBar";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { PremiumQuickAccessBar } from "@/components/layout/PremiumQuickAccessBar";
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
    const location = useLocation();
    const isCorridasRoute = location.pathname.startsWith('/corridas') ||
                            location.pathname.startsWith('/motoboy') ||
                            location.pathname.startsWith('/solicitar-corrida') ||
                            location.pathname.startsWith('/chamar-motoboy') ||
                            location.pathname.startsWith('/corrida/') ||
                            location.pathname.startsWith('/mototaxi') ||
                            location.pathname.startsWith('/motorista');
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

    /* CABEÇALHO GLOBAL: busca funciona em QUALQUER página — sem props,
       usa estado interno e envia para /mercado?q= (pesquisa persistente). */
    const [innerSearch, setInnerSearch] = useState("");
    const effSearch = setSearch ? search : innerSearch;
    const effSetSearch = setSearch ?? setInnerSearch;
    const effSubmit = onSearchSubmit ?? ((v: string) => {
        if (v.trim()) navigate(`/mercado?q=${encodeURIComponent(v.trim())}`);
        else navigate('/mercado');
    });

    // ── CABEÇALHO INTELIGENTE RETRÁTIL (EXPANDIDO vs RECOLHIDO) ──
    const [headerCollapsed, setHeaderCollapsed] = useState(false);
    const [userOverride, setUserOverride] = useState<'expanded' | 'collapsed' | null>(null);

    useEffect(() => {
        let ticking = false;
        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const currentScrollY = window.scrollY;
                    const isTop = currentScrollY <= 30;

                    setUserOverride((prevOverride) => {
                        if (prevOverride === 'collapsed') {
                            setHeaderCollapsed((prev) => (prev ? prev : true));
                            return prevOverride;
                        }
                        if (prevOverride === 'expanded') {
                            if (isTop) {
                                setHeaderCollapsed((prev) => (prev ? prev : false));
                                return null;
                            }
                            setHeaderCollapsed((prev) => (prev ? prev : false));
                            return prevOverride;
                        }
                        if (isTop) {
                            setHeaderCollapsed((prev) => (prev ? prev : false));
                        } else if (currentScrollY > 80) {
                            setHeaderCollapsed((prev) => (prev ? prev : true));
                        }
                        return prevOverride;
                    });
                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const handleToggleHeader = () => {
        if (headerCollapsed) {
            setHeaderCollapsed(false);
            setUserOverride(window.scrollY <= 30 ? null : 'expanded');
        } else {
            setHeaderCollapsed(true);
            setUserOverride('collapsed');
        }
    };

    useEffect(() => {
        const handleOpenCart = () => setCartOpen(true);
        window.addEventListener("vtx8-cart-add-action", handleOpenCart);
        return () => window.removeEventListener("vtx8-cart-add-action", handleOpenCart);
    }, []);

    return (
        <div className={cn("min-h-screen flex flex-col", !mainClassName && "bg-[#F5E62B]")}>
            {/* ═══ TOP BAR (STICKY HEADER WITH RETRACTABLE TRANSITIONS) ═══ */}
            <div className={cn(
                "sticky top-0 z-50 transition-all duration-300 ease-in-out border-b border-black/5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]",
                isCorridasRoute ? "bg-gradient-to-r from-[#FF6A00] to-[#FF8C00]" : "bg-gradient-to-b from-[#FAF24A] via-[#F5E62B] to-[#ECD70B]"
            )}>
                <div className="max-w-[1920px] mx-auto px-4 lg:px-6 pb-2">
                    {/* ── MOBILE HEADER (< lg): card do clima alinhado à linha logo/cesta (RETRÁTIL) ── */}
                    <div className={cn(
                        "lg:hidden transition-all duration-300 ease-in-out overflow-hidden",
                        headerCollapsed ? "max-h-0 opacity-0 -translate-y-2 pointer-events-none pt-0 pb-0" : "max-h-[300px] opacity-100 translate-y-0 pt-2 pb-1"
                    )}>
                        <div className="flex items-stretch gap-2">
                            {/* Card de clima (estreitado pela coluna de botões) — após apresentar, cede o lugar ao player da rádio */}
                            <div className="min-w-0 flex-1">
                                <HeroClimaRadio />
                            </div>

                            {/* Coluna lateral: apenas extras */}
                            {headerRight && (
                                <div className="flex shrink-0 flex-col items-center justify-center gap-1.5">
                                    {headerRight}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Hero Card de Clima + IA RIDV — ACIMA da pesquisa (desktop - RETRÁTIL) */}
                    <div className={cn(
                        "hidden lg:block w-full transition-all duration-300 ease-in-out overflow-hidden",
                        headerCollapsed ? "max-h-0 opacity-0 -translate-y-2 pointer-events-none pt-0" : "max-h-[300px] opacity-100 translate-y-0 pt-2"
                    )}>
                        <HeroClimaRadio compact />
                    </div>

                    {/* ── DESKTOP HEADER (≥ lg) - SEMPRE VISÍVEL NO ESTADO RECOLHIDO ── */}
                    <div className="hidden lg:flex items-center h-[80px] w-full gap-6">
                        {/* Logo + título */}
                        <div className="flex items-center gap-3 cursor-pointer shrink-0 py-2 hover:opacity-95 transition-all duration-200" onClick={() => navigate("/mercado")}>
                            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-12 w-12 rounded-xl object-contain shadow-sm border border-black/10" />
                            <span className="text-xl font-black text-slate-950 tracking-tight whitespace-nowrap">
                                Mercado Local <span className="text-[#075985]">Viagg-TX8™</span>
                            </span>
                        </div>

                        {/* Search */}
                        {showSearch && (
                            <GlobalSearchBar initialValue={effSearch} />
                        )}


                        {/* Direita: Cesta + headerRight */}
                        <div className="flex items-center gap-3.5 shrink-0">
                            <button
                                onClick={(e) => { e.stopPropagation(); setCartOpen(true); }}
                                aria-label="Abrir Cesta / Carrinho"
                                className="relative flex h-auto px-4 py-2.5 items-center justify-center gap-2.5 bg-white text-black border-2 border-[#68C7F2] rounded-[22px] shadow-[0_4px_16px_rgba(104,199,242,0.28)] hover:shadow-[0_6px_24px_rgba(104,199,242,0.48)] hover:scale-[1.04] active:scale-95 transition-all duration-200 ease-out outline-none cursor-pointer select-none"
                                title="Cesta / Carrinho"
                            >
                                <ShoppingCart className="h-5 w-5 text-black shrink-0 transition-transform group-hover:scale-110" />
                                <span className="text-sm font-black whitespace-nowrap">
                                    Cesta — {globalCart.totalItems} {globalCart.totalItems === 1 ? "item" : "itens"}
                                </span>
                                {globalCart.totalItems > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-[#FF6A00] text-white text-[11px] font-black rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1 shadow-md border-2 border-white animate-in zoom-in-50 fade-in duration-300">
                                        {globalCart.totalItems}
                                    </span>
                                )}
                            </button>

                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                                {headerRight}
                            </div>
                        </div>
                    </div>

                    {/* Mobile search row - SEMPRE VISÍVEL NO ESTADO RECOLHIDO */}
                    {showSearch && (
                        <div className="lg:hidden pt-0.5 pb-1 flex items-center gap-2.5">
                            {/* Logo à esquerda da pesquisa */}
                            <div className="flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center hover:scale-105 transition-transform" onClick={() => navigate("/mercado")}>
                                <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="block h-[46px] w-[46px] rounded-xl object-cover shadow-sm border border-black/10" />
                            </div>
                            
                            <GlobalSearchBar initialValue={effSearch} />

                            {/* Cesta à direita da pesquisa */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setCartOpen(true); }}
                                aria-label="Abrir Cesta / Carrinho"
                                className="relative ml-auto flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[18px] bg-white text-black border-2 border-[#68C7F2] shadow-[0_4px_16px_rgba(104,199,242,0.28)] transition-all duration-200 ease-out hover:shadow-[0_6px_24px_rgba(104,199,242,0.48)] hover:scale-[1.04] active:scale-95 outline-none cursor-pointer select-none"
                                title="Cesta / Carrinho"
                            >
                                <ShoppingCart className="h-5 w-5 text-black transition-transform group-hover:scale-110" />
                                {globalCart.totalItems > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-white bg-[#FF6A00] px-1 text-[10px] font-black text-white shadow-md animate-in zoom-in-50 fade-in duration-300">
                                        {globalCart.totalItems}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Navegação principal — GLOBAL (RETRÁTIL) */}
                    <div className={cn(
                        "transition-all duration-300 ease-in-out overflow-hidden",
                        headerCollapsed ? "max-h-0 opacity-0 -translate-y-2 pointer-events-none" : "max-h-[250px] opacity-100 translate-y-0"
                    )}>
                        {headerChildren ?? <MarketNavButtons />}
                    </div>
                </div>

                {/* ═══ BARRA PREMIUM DE ACESSO RÁPIDO (UI-01 · FAIXA LARANJA · FIXA / SEMPRE VISÍVEL) ═══
                    Entrega Local · Verificados · 👤 Minha Conta · Favoritos · Notificações · Som.
                    O portal de áudio (#global-audio-portal-trustbar) vive dentro do componente. */}
                <div className="w-full bg-gradient-to-r from-[#FF6A00] via-[#FF7A00] to-[#FF8C00] border-t border-black/10 shadow-md">
                    <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-1 w-full">
                        <PremiumQuickAccessBar />
                    </div>
                </div>

                {/* ═══ SETA CENTRAL DE CONTROLE RETRÁTIL (▼ / ▲) ═══ */}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-6 sm:-bottom-7 z-50 flex items-center justify-center pointer-events-auto">
                    <button
                        type="button"
                        onClick={handleToggleHeader}
                        aria-label={headerCollapsed ? "Expandir cabeçalho" : "Recolher cabeçalho"}
                        aria-expanded={!headerCollapsed}
                        className={cn(
                            "flex items-center gap-1 sm:gap-1.5 px-3.5 sm:px-4.5 py-1 rounded-b-xl sm:rounded-b-2xl font-black text-[11px] sm:text-xs shadow-[0_4px_12px_rgba(0,0,0,0.18)] border border-t-0 border-black/15 transition-all duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-black/40 hover:scale-105 active:scale-95 cursor-pointer select-none",
                            !headerCollapsed
                                ? "bg-[#EF4444] text-white hover:bg-[#DC2626]"
                                : "bg-[#22C55E] text-white hover:bg-[#16A34A] shadow-[0_4px_14px_rgba(34,197,94,0.4)]"
                        )}
                        title={headerCollapsed ? "Expandir cabeçalho" : "Recolher cabeçalho"}
                    >
                        <span className="text-[10px] sm:text-xs transition-transform duration-300">
                            {headerCollapsed ? "▼" : "▲"}
                        </span>
                        <span className="tracking-tight font-black">
                            {headerCollapsed ? "Expandir" : "Recolher"}
                        </span>
                    </button>
                </div>
            </div>



            {/* ═══ MAIN CONTENT ═══ */}
            <main className={cn("flex-1", isMerchant && !hideStoreNav && !blueFooter && "pb-20 md:pb-0", mainClassName)}>
                {children}
            </main>

            {/* ═══ FOOTER / BOTTOM NAV ═══ */}
            {blueFooter ? (
                <footer className="w-full bg-[#68c7f2] text-zinc-900 text-center py-1.5 text-xs font-medium space-y-0">
                    <p className="flex items-center justify-center gap-1.5">
                        <img src="/logo.png" alt="Viagg" className="h-8 w-auto object-contain rounded-lg shadow-sm mt-1" />
                        Viagg-TX8™ · {blueFooterLabel}
                    </p>
                    <p className="text-zinc-900/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
                </footer>
            ) : (
                isMerchant && !hideStoreNav ? <StoreBottomNav /> : (!hideFooter && <FooterNeutral />)
            )}

            {/* ── Drawers/Modals ── */}
            {!hideCart && <GlobalCartDrawer open={cartOpen} onOpenChange={setCartOpen} globalCart={globalCart} />}


        </div>
    );
}
