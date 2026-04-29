import { Store, ShieldCheck, Zap, Share2, Phone, MapPin, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StoreInfo {
    store_name: string;
    city: string | null;
    region: string | null;
    bairro?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    cep?: string | null;
    logo_url: string | null;
    banner_url: string | null;
    description: string | null;
}

interface StoreHeaderProps {
    store: StoreInfo;
    stats: { average: string, count: number } | null;
    productsCount: number;
    whatsappNumber: string | null;
    onShare: () => void;
    logoUrl: string | null;
    bannerUrl: string | null;
    compact?: boolean;
    sidebarMode?: boolean;
}

export function StoreHeader({ store, stats, productsCount, whatsappNumber, onShare, logoUrl, bannerUrl, compact = false, sidebarMode = false }: StoreHeaderProps) {
    const followerCount = Math.floor(Math.random() * 5000) + 1200; // Mock until real backend is supported
    const followersText = followerCount > 1000 ? `${(followerCount / 1000).toFixed(1)}k` : followerCount;

    // --- PRIVACY FILTER (Endereço Tímido e Remoção de Sensíveis) ---
    const sanitize = (val: string | null | undefined): string | null => {
        if (!val) return null;
        const s = String(val);
        // Bloco de privacidade
        if (s.includes("@")) return null;
        if (/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}/.test(s)) return null;
        if (/token|cookie|pwd|password|secret|account_id|user_id/i.test(s)) return null;
        return s;
    };

    const safeStoreName = sanitize(store.store_name) || "Loja Parceira";
    const safeDescription = sanitize(store.description) || "Confira nossos lançamentos exclusivos e ofertas especiais na região.";
    
    // Construindo o "Endereço Tímido" (Sem exibir porta, número logradouro ou CEP)
    const sLogradouro = sanitize(store.logradouro);
    const sBairro = sanitize(store.bairro);
    const sCity = sanitize(store.city);
    const sRegion = sanitize(store.region);

    let timidAddress = "Atendimento Local";
    if (sLogradouro && sBairro && sCity) {
        timidAddress = `${sLogradouro}, ${sBairro} - ${sCity}${sRegion ? `/${sRegion}` : ""}`;
    } else if (sBairro && sCity) {
        timidAddress = `${sBairro}, ${sCity}${sRegion ? `/${sRegion}` : ""}`;
    } else if (sCity) {
        timidAddress = `Atendendo na região de ${sCity}${sRegion ? `/${sRegion}` : ""}`;
    }

    return (
        <div className="relative animate-in fade-in duration-1000">

            {/* Store Card */}
            <div className={cn("w-full px-4 lg:px-8 xl:px-12 relative z-10 mb-8 flex justify-center", compact ? "mt-0" : "mt-4 lg:mt-6")}>
                <div className="w-full max-w-7xl">
                <Card className="border-none shadow-2xl rounded-3xl lg:rounded-[40px] bg-[#1B1F24] ring-1 ring-zinc-700 overflow-hidden">
                    <div className={cn("flex items-center", sidebarMode ? "flex-col text-center p-4 gap-3" : cn("flex-col xl:flex-row", compact ? "p-3 lg:p-4 gap-4 xl:items-end" : "p-6 lg:p-10 gap-6 lg:gap-10 xl:items-end"))}>
                        
                        {/* Logo Avatar */}
                        <div className={cn("relative group shrink-0")}>
                            <div className={cn("bg-[#14171B] shadow-xl ring-[#2A3038] relative overflow-hidden", sidebarMode ? "w-16 h-16 rounded-2xl p-1 ring-2" : compact ? "w-16 h-16 lg:w-20 lg:h-20 rounded-[14px] lg:rounded-2xl p-1 lg:p-1.5 ring-1 lg:ring-2" : "w-28 h-28 lg:w-40 lg:h-40 rounded-3xl lg:rounded-[32px] p-1.5 ring-2 lg:ring-4")}>
                                {logoUrl ? (
                                    <img src={logoUrl} className={cn("w-full h-full object-cover", compact ? "rounded-[10px] lg:rounded-xl" : "rounded-[24px] lg:rounded-[26px]")} alt="Logo" />
                                ) : (
                                    <div className={cn("w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center", compact ? "rounded-[10px] lg:rounded-xl" : "rounded-[24px] lg:rounded-[26px]")}>
                                        <Store className={cn("text-white", compact ? "w-6 h-6 lg:w-8 lg:h-8" : "w-10 h-10 lg:w-16 lg:h-16")} />
                                    </div>
                                )}
                            </div>
                            <div className={cn("absolute -bottom-1 -right-1 bg-[#1B1F24] text-white rounded-lg lg:rounded-xl shadow-lg ring-2 ring-[#2A3038] flex items-center justify-center", compact ? "p-1 w-5 h-5 lg:w-6 lg:h-6" : "p-2 lg:p-2.5 w-8 h-8 lg:w-10 lg:h-10")}>
                                <CheckCircle2 className={cn("text-emerald-500", compact ? "w-3 h-3 lg:w-3.5 lg:h-3.5" : "w-4 h-4 lg:w-5 lg:h-5")} />
                            </div>
                        </div>

                        {/* Info Text */}
                        <div className={cn("flex-1 space-y-1", sidebarMode ? "text-center" : "text-center xl:text-left")}>
                            <div className={cn("flex items-center gap-2 flex-wrap mb-0.5", sidebarMode ? "justify-center" : "justify-center xl:justify-start")}>
                                <Badge className="bg-[#FF6A00] hover:bg-[#E65C00] text-white border-none rounded-md px-1.5 py-0 font-bold uppercase text-[8px] lg:text-[9px] tracking-wider shadow-sm">
                                    Loja Oficial
                                </Badge>
                                <div className="flex items-center gap-1 text-zinc-400 font-semibold text-[9px] lg:text-[10px] uppercase tracking-wider">
                                    <MapPin className="w-3 h-3" /> 
                                    {sCity || "Brasil"}{sRegion ? `, ${sRegion}` : ""}
                                </div>
                                {stats && (
                                    <div className="flex items-center gap-1 text-amber-400 font-bold text-[9px] lg:text-[10px] bg-amber-500/10 px-1.5 py-0 rounded-md">
                                        <Star className="w-3 h-3 fill-current" />
                                        {stats.average} ({stats.count})
                                    </div>
                                )}
                            </div>
                            <h1 className={cn("font-black text-[#F5F7FA] tracking-tight leading-none", sidebarMode ? "text-lg" : compact ? "text-xl lg:text-2xl" : "text-3xl lg:text-5xl")}>
                                {safeStoreName}
                            </h1>
                            <p className={cn("text-zinc-400 font-medium max-w-2xl mt-1", sidebarMode ? "text-[10px] block line-clamp-1" : compact ? "hidden xl:block text-[10px] lg:text-xs line-clamp-1" : "text-xs lg:text-sm line-clamp-2")}>
                                {safeDescription}
                            </p>
                            
                            {/* Privacy Filtered Address Block */}
                            {(sLogradouro || sBairro || sCity) && (
                                <div className={cn("flex items-center gap-1.5 mt-2 text-zinc-400 font-medium", sidebarMode ? "hidden" : "text-[10px] lg:text-xs justify-center xl:justify-start")}>
                                    <MapPin className="w-3.5 h-3.5 text-[#FF6A00] shrink-0"/> 
                                    <span>{timidAddress}</span>
                                </div>
                            )}
                        </div>

                        {/* Quick Stats Panel */}
                        <div className={cn("flex justify-center w-full", sidebarMode ? "gap-4 pt-4 border-t border-zinc-700 mt-2" : cn("xl:justify-end xl:w-auto xl:border-l xl:border-zinc-700", compact ? "gap-4 lg:gap-6 pt-0 xl:pl-5" : "gap-6 lg:gap-10 pt-4 xl:pt-0 xl:pl-10"))}>
                            <div className="text-center">
                                <p className={cn("font-black text-[#F5F7FA] tracking-tight", sidebarMode ? "text-lg" : compact ? "text-lg lg:text-xl" : "text-xl lg:text-3xl")}>
                                    {productsCount}
                                </p>
                                <p className={cn("font-bold text-zinc-400 uppercase tracking-wider", sidebarMode ? "text-[10px]" : compact ? "text-[8px] lg:text-[9px]" : "text-[10px]")}>Produtos</p>
                            </div>
                            <div className={cn("bg-zinc-700 self-center", compact ? "w-[1px] h-6 lg:h-8" : "w-[1px] h-8 lg:h-12")} />
                            <div className="text-center">
                                <p className={cn("font-black text-[#F5F7FA] tracking-tight", sidebarMode ? "text-lg" : compact ? "text-lg lg:text-xl" : "text-xl lg:text-3xl")}>
                                    {followersText}
                                </p>
                                <p className={cn("font-bold text-zinc-400 uppercase tracking-wider", sidebarMode ? "text-[10px]" : compact ? "text-[8px] lg:text-[9px]" : "text-[10px]")}>Seguidores</p>
                            </div>
                            <div className={cn("bg-zinc-700 self-center", compact ? "w-[1px] h-6 lg:h-8" : "w-[1px] h-8 lg:h-12")} />
                            <div className="text-center">
                                <p className={cn("font-black text-[#F5F7FA] tracking-tight flex items-center justify-center", sidebarMode ? "text-lg" : compact ? "text-lg lg:text-xl" : "text-xl lg:text-3xl")}>
                                    98<span className={compact ? "text-xs" : "text-sm"}>%</span>
                                </p>
                                <p className={cn("font-bold text-zinc-400 uppercase tracking-wider", sidebarMode ? "text-[10px]" : compact ? "text-[8px] lg:text-[9px]" : "text-[10px]")}>Resposta</p>
                            </div>
                        </div>

                    </div>

                    {/* Footer Actions Desktop */}
                    <div className={cn("bg-[#14171B]/80 border-t border-zinc-700 flex flex-wrap items-center gap-3", sidebarMode ? "hidden" : "justify-between", !sidebarMode && compact ? "px-4 py-2 lg:py-2.5 gap-3" : !sidebarMode ? "px-6 py-4 lg:py-5 gap-4" : "")}>
                        <div className={cn("items-center gap-4 lg:gap-5", sidebarMode ? "hidden" : "hidden lg:flex")}>
                            <div className={cn("flex items-center gap-1.5 font-bold text-zinc-400 uppercase tracking-wider", compact ? "text-[9px]" : "text-[11px]")}>
                                <ShieldCheck className={cn("text-emerald-500", compact ? "w-3.5 h-3.5" : "w-4 h-4")} /> Compra Segura
                            </div>
                            <div className={cn("flex items-center gap-1.5 font-bold text-zinc-400 uppercase tracking-wider", compact ? "text-[9px]" : "text-[11px]")}>
                                <Zap className={cn("text-[#FF6A00]", compact ? "w-3.5 h-3.5" : "w-4 h-4")} /> Entrega Rápida
                            </div>
                        </div>
                        <div className={cn("flex items-center w-full", sidebarMode ? "gap-2 justify-center flex-wrap" : "gap-2 lg:gap-3 lg:w-auto justify-center lg:justify-end")}>
                            <Button 
                                variant="outline" 
                                className={cn("flex-1 lg:flex-none rounded-lg lg:rounded-xl border-[#FF6A00]/30 font-black uppercase tracking-wider hover:bg-[#FF6A00]/10 text-[#FF6A00]", compact ? "text-[9px] h-8 lg:h-9 px-3 lg:px-4" : "text-[11px] h-11 lg:h-12 px-5")}
                            >
                                <Plus className={cn("mr-1.5", compact ? "w-3 h-3" : "w-4 h-4")} /> Seguir
                            </Button>
                            
                            <Button 
                                variant="outline" 
                                onClick={onShare}
                                className={cn("p-0 border-[#FF6A00]/30 hover:bg-[#FF6A00]/10 text-[#FF6A00] shrink-0", compact ? "rounded-lg w-8 h-8 lg:w-9 lg:h-9" : "rounded-xl w-11 h-11 lg:w-12 lg:h-12")}
                                title="Compartilhar"
                            >
                                <Share2 className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
                            </Button>

                            {whatsappNumber && (
                                <Button 
                                    className={cn("flex-1 lg:flex-none bg-emerald-500 hover:bg-emerald-600 text-white font-bold uppercase tracking-wider shadow-md shadow-emerald-500/20", compact ? "rounded-lg text-[9px] h-8 lg:h-9 px-3 lg:px-4" : "rounded-xl text-[11px] h-11 lg:h-12 px-6")}
                                    onClick={() => window.open(`https://wa.me/55${whatsappNumber.replace(/\D/g, "")}`, "_blank")}
                                >
                                    <Phone className={cn("mr-1.5", compact ? "w-3 h-3" : "w-4 h-4")} /> Contato
                                </Button>
                            )}
                        </div>
                    </div>
                </Card>
                </div>
            </div>
        </div>
    );
}

const Plus = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
);

export default StoreHeader;
