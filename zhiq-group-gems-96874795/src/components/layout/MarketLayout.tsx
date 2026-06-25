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
    Volume2,
    VolumeX,
    User,
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
import { useSoundtrackMusic } from "@/hooks/useSoundtrackMusic";
import appTheme from "@/assets/viagg_search_loop.mp3";

const MERCADO_MUTE_KEY = "viagg_mercado_sound_muted";

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
    hideTopMotoboy = true
}: MarketLayoutProps) {
    const navigate = useNavigate();
    const { user, isLoading, availableProfiles, activeProfile, signOut } = useAuth();
    const isMerchant = activeProfile === 'merchant';

    const [soundMuted, setSoundMuted] = useState<boolean>(
        () => localStorage.getItem(MERCADO_MUTE_KEY) !== "false"
    );
    useEffect(() => {
        localStorage.setItem(MERCADO_MUTE_KEY, String(soundMuted));
    }, [soundMuted]);
    // isPlaying sempre false — música só inicia via play()/stop() explícitos no clique
    const { play: playSound, stop: stopSound } = useSoundtrackMusic({
        src: appTheme,
        startTime: 21,
        endTime: 47,
        volume: 0.12,
        isPlaying: false,
        fadeInDuration: 1500,
        fadeOutDuration: 800,
    });

    const handleMotoboyClick = () => {
        if (!user) {
            localStorage.setItem("viagg_auth_entry", "motoboy");
            // Usuário anônimo vai direto pro cadastro (signup mode já pré-selecionado)
            navigate("/auth?entry=motoboy&signup=1");
            return;
        }
        if (availableProfiles?.includes("motoboy")) {
            navigate("/select-profile?profile=motoboy");
        } else {
            navigate("/motoboy/completar");
        }
    };

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
                    <div className="flex items-center h-[50px] w-full lg:hidden px-2 gap-1.5">
                        {/* Esquerda: Logo */}
                        <div className="cursor-pointer shrink-0" onClick={() => navigate("/mercado")}>
                            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-7 w-7 rounded-md object-contain shadow-sm" />
                        </div>

                        {/* Centro: Cesta */}
                        <div className="flex-1 flex items-center justify-center">
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
                        </div>

                        {/* Direita: Minha Conta / Sair + Som */}
                        <div className="flex items-center gap-1 shrink-0">
                            {user ? (
                                <button
                                    onClick={handleSair}
                                    className="flex items-center gap-0.5 h-7 px-2 bg-red-500 hover:bg-red-600 rounded-lg shadow-lg text-white transition-all"
                                    title="Sair"
                                >
                                    <LogOut className="w-3 h-3 shrink-0" />
                                    <span className="text-[7px] font-black uppercase leading-tight">Sair</span>
                                </button>
                            ) : myAccountPath ? (
                                <button
                                    onClick={() => navigate('/auth')}
                                    className="flex items-center gap-0.5 h-7 px-2 bg-sky-600 hover:bg-sky-700 rounded-lg shadow-lg text-white transition-all"
                                    title="Minha Conta"
                                >
                                    <User className="w-3 h-3 shrink-0" />
                                    <span className="text-[7px] font-black uppercase leading-tight">Minha<br/>Conta</span>
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => {
                                    if (soundMuted) {
                                        setSoundMuted(false);
                                        playSound();
                                    } else {
                                        setSoundMuted(true);
                                        stopSound();
                                    }
                                }}
                                className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white"
                                title={soundMuted ? "Ativar som" : "Desativar som"}
                            >
                                {soundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                            </button>
                            {headerRight}
                        </div>
                    </div>

                    {/* ── DESKTOP HEADER (≥ lg) ── */}
                    <div className="hidden lg:flex items-center h-[72px] w-full gap-4">
                        {/* Logo + título */}
                        <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => navigate("/mercado")}>
                            <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-12 w-12 rounded-lg object-contain" />
                            <span className="text-xl font-black text-white tracking-tight">
                                Mercado Local <span className="text-yellow-200">Viagg-TX8™</span>
                            </span>
                        </div>

                        {/* Cesta */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setCartOpen(true); }}
                            className="relative flex h-auto px-4 py-2.5 items-center justify-center gap-2 bg-[#F5E62B] text-gray-900 rounded-xl shadow-lg hover:brightness-95 hover:-translate-y-0.5 active:translate-y-0 transition-all outline-none shrink-0"
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

                        {/* Motoboy desktop */}
                        {!hideTopMotoboy && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleMotoboyClick(); }}
                                className="flex px-4 py-2.5 items-center justify-center bg-white rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all outline-none border border-orange-200/50 shrink-0"
                            >
                                <span className="text-xs font-black whitespace-nowrap uppercase tracking-wide text-[#FF6A00]">Motoboy</span>
                            </button>
                        )}

                        {/* Search */}
                        {showSearch && (
                            <div className="flex-1 max-w-2xl mx-auto">
                                <div className="relative flex">
                                    <Input
                                        placeholder="Buscar produtos, lojas..."
                                        value={search}
                                        onChange={e => setSearch?.(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter" && onSearchSubmit) onSearchSubmit(search); }}
                                        className="w-full pl-4 pr-12 py-2 h-[52px] rounded-l-lg rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-[15px] font-medium focus-visible:ring-0"
                                    />
                                    <button onClick={() => onSearchSubmit?.(search)} className="px-5 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-lg flex items-center">
                                        <Search className="h-6 w-6 text-white" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Direita desktop */}
                        <div className="flex items-center gap-3 text-white shrink-0">
                            {user && (
                                <Button
                                    onClick={handleSair}
                                    variant="ghost"
                                    className="bg-red-500 hover:bg-red-600 text-white font-black text-xs h-[44px] px-5 rounded-xl shadow-lg border-0 uppercase tracking-widest whitespace-nowrap flex items-center gap-2"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sair
                                </Button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    if (soundMuted) {
                                        setSoundMuted(false);
                                        playSound();
                                    } else {
                                        setSoundMuted(true);
                                        stopSound();
                                    }
                                }}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors text-white"
                                title={soundMuted ? "Ativar som" : "Desativar som"}
                            >
                                {soundMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                            </button>
                            {headerRight}
                            {!user && !isLoading && myAccountPath && (
                                <Button
                                    onClick={() => navigate('/auth')}
                                    variant="ghost"
                                    className="bg-sky-600 hover:bg-sky-700 text-white font-black text-xs h-[44px] px-5 rounded-xl shadow-lg border-0 uppercase tracking-widest whitespace-nowrap flex items-center gap-2"
                                >
                                    <User className="w-4 h-4" />
                                    Minha Conta
                                </Button>
                            )}
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
