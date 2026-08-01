import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { GlobalFooter } from "@/components/GlobalFooter";
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
import { NotificationCenter } from "@/components/public/notifications/NotificationCenter";
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
    /** Mantém o cabeçalho SEMPRE expandido (clima/rádio + navegação visíveis), sem retrair no scroll. */
    lockHeaderExpanded?: boolean;
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
    hideTopMotoboy = false,
    lockHeaderExpanded = false
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
        // Cabeçalho travado expandido: sem listener de scroll, nunca recolhe.
        if (lockHeaderExpanded) {
            setHeaderCollapsed(false);
            return;
        }
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
    }, [lockHeaderExpanded]);

    const handleToggleHeader = () => {
        if (headerCollapsed) {
            setHeaderCollapsed(false);
            setUserOverride(null);
            // Volta ao topo para o conteúdo (ex.: card da loja) aparecer INTEIRO
            // na tela — sem isso a página fica rolada e o card aparece cortado.
            window.scrollTo({ top: 0, behavior: "smooth" });
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
        <div className={cn("min-h-screen flex flex-col", !mainClassName && "bg-institutional-yellow")}>
            {/* ═══ TOP BAR (STICKY HEADER WITH RETRACTABLE TRANSITIONS) ═══ */}
            <div className={cn(
                "sticky top-0 z-50 transition-all duration-300 ease-in-out border-b border-black/5 shadow-[0_4px_24px_rgba(0,0,0,0.06)]",
                isCorridasRoute ? "bg-gradient-to-r from-[#FF6A00] to-[#FF8C00]" : "bg-institutional-yellow"
            )}>
                <div className="max-w-[1920px] mx-auto px-4 lg:px-6 pb-2">
                    {/* ── MOBILE HEADER (< lg): card do clima alinhado à linha logo/cesta (RETRÁTIL) ── */}
                    <div className={cn(
                        "lg:hidden transition-all duration-300 ease-in-out overflow-hidden",
                        headerCollapsed ? "max-h-0 opacity-0 -translate-y-2 pointer-events-none pt-0 pb-0" : "max-h-[300px] opacity-100 translate-y-0 pt-2 pb-1"
                    )}>
                        <div className="flex items-stretch gap-2">
                            {/* Logo mobile — antes do clima */}
                            <div className="flex shrink-0 cursor-pointer items-center hover:scale-105 transition-transform" onClick={() => navigate("/mercado")}>
                                <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-10 w-10 rounded-xl object-cover shadow-sm border border-black/10" />
                            </div>
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

                            <div className="bg-[#1A1F24] rounded-full px-1 border border-[#323A45]">
                                <NotificationCenter />
                            </div>

                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                                {headerRight}
                            </div>
                        </div>
                    </div>

                    {/* Mobile search row - SEMPRE VISÍVEL NO ESTADO RECOLHIDO */}
                    {showSearch && (
                        <div className="lg:hidden pt-0.5 pb-1">
                            <GlobalSearchBar initialValue={effSearch} />
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

                {/* ═══ BARRA PREMIUM DE ACESSO RÁPIDO (UI-01/UI-02 · FAIXA LARANJA · FIXA / SEMPRE VISÍVEL) ═══
                    👤 Minha Conta · 🔊 Som · Favoritos · Notificações · Compartilhar.
                    O portal de áudio (#global-audio-portal-trustbar) vive dentro do componente,
                    logo à direita do seletor de conta/loja (botão branco "Som" — UI-02). */}
                <div className="w-full bg-gradient-to-r from-[#FF6A00] via-[#FF7A00] to-[#FF8C00] border-t border-black/10 shadow-md">
                    <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-1 w-full">
                        <PremiumQuickAccessBar onCartOpen={() => setCartOpen(true)} cartItemCount={globalCart.totalItems} />
                    </div>
                </div>

                {/* ═══ SETA CENTRAL DE CONTROLE RETRÁTIL (▼ / ▲) ═══ */}
                {!lockHeaderExpanded && (
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 z-50 flex items-center justify-center pointer-events-auto">
                    <button
                        type="button"
                        onClick={handleToggleHeader}
                        aria-label={headerCollapsed ? "Expandir cabeçalho" : "Recolher cabeçalho"}
                        aria-expanded={!headerCollapsed}
                        className={cn(
                            "flex items-center gap-1 px-3 py-0.5 rounded-full font-bold text-[10px] shadow-md border transition-all duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-black/30 hover:scale-105 active:scale-95 cursor-pointer select-none backdrop-blur-sm",
                            !headerCollapsed
                                ? "bg-white/90 text-red-600 border-red-200 hover:bg-red-50"
                                : "bg-white/90 text-emerald-600 border-emerald-200 hover:bg-emerald-50 shadow-[0_2px_8px_rgba(34,197,94,0.25)]"
                        )}
                        title={headerCollapsed ? "Expandir cabeçalho" : "Recolher cabeçalho"}
                    >
                        <svg className={cn("w-3 h-3 transition-transform duration-300", headerCollapsed ? "rotate-0" : "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                        <span className="tracking-tight">
                            {headerCollapsed ? "Expandir" : "Recolher"}
                        </span>
                    </button>
                </div>
                )}
            </div>



            {/* ═══ MAIN CONTENT ═══ */}
            <main className={cn("flex-1", isMerchant && !hideStoreNav && !blueFooter && "pb-20 md:pb-0", mainClassName)}>
                {children}
            </main>

            {/* ═══ FOOTER / BOTTOM NAV ═══
                Rodapé = GlobalFooter (componente único). O merchant logado usa a
                bottom-nav mobile no lugar; fora isso o rodapé global aparece sempre
                (a menos que a página peça hideFooter explicitamente). */}
            {blueFooter ? (
                <GlobalFooter label={blueFooterLabel} compact />
            ) : (
                isMerchant && !hideStoreNav ? <StoreBottomNav /> : (!hideFooter && <GlobalFooter />)
            )}

            {/* ── Drawers/Modals ── */}
            {!hideCart && <GlobalCartDrawer open={cartOpen} onOpenChange={setCartOpen} globalCart={globalCart} />}


        </div>
    );
}
