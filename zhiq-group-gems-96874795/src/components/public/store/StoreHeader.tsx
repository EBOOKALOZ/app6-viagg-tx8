import { useEffect } from "react";
import { Store, ShieldCheck, Zap, Share2, Phone, MapPin, CheckCircle2, Star, Plus, Check, MessageCircle, Instagram, Facebook, Globe, Mail } from "lucide-react";
import { useStoreTheme } from "@/components/public/store/StoreThemeScope";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
    stats?: { average: string, count: number } | null;
    productsCount?: number;
    whatsappNumber?: string | null;
    onShare?: () => void;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    compact?: boolean;
    sidebarMode?: boolean;
}

export function StoreHeader({ store, stats, productsCount, whatsappNumber, onShare, logoUrl, bannerUrl, compact = false, sidebarMode = false }: StoreHeaderProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const theme = useStoreTheme(); // null quando a loja não personalizou
    const effectiveLogoUrl = logoUrl || store?.logo_url || (store as any)?.avatar_url || null;

    // Botões de contato personalizados (só com tema; valores já sanitizados)
    const contactLinks = (() => {
        const c = theme?.contact;
        if (!c) return [];
        const list: { key: string; icon: typeof Phone; href: string; label: string }[] = [];
        const wa = c.whatsapp || whatsappNumber?.replace(/\D/g, "") || "";
        if (wa) list.push({ key: "wa", icon: MessageCircle, href: `https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`, label: "WhatsApp" });
        if (c.phone) list.push({ key: "tel", icon: Phone, href: `tel:+55${c.phone}`, label: "Telefone" });
        if (c.instagram) list.push({ key: "ig", icon: Instagram, href: `https://instagram.com/${c.instagram}`, label: "Instagram" });
        if (c.facebook) list.push({ key: "fb", icon: Facebook, href: c.facebook, label: "Facebook" });
        if (c.site) list.push({ key: "site", icon: Globe, href: c.site, label: "Site" });
        if (c.email) list.push({ key: "mail", icon: Mail, href: `mailto:${c.email}`, label: "E-mail" });
        return list;
    })();

    // Chave única por loja
    const storeKey = (store.store_name || "default").trim().toLowerCase();

    // ID anônimo persistido em localStorage
    const getAnonId = (): string => {
        try {
            let id = localStorage.getItem("viagg_anon_id");
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem("viagg_anon_id", id);
            }
            return id;
        } catch { return "anon-fallback"; }
    };

    // Query do total de seguidores
    const { data: followerCount = 0 } = useQuery({
        queryKey: ["store-followers-count", storeKey],
        queryFn: async () => {
            const { count } = await (supabase.from("store_followers" as any)
                .select("id", { count: "exact", head: true })
                .eq("store_key", storeKey)) as any;
            return count ?? 0;
        },
        refetchInterval: 30_000,
    });

    // Query do estado "estou seguindo?"
    const anonId = getAnonId();
    const { data: isFollowing = false } = useQuery({
        queryKey: ["store-followers-mine", storeKey, user?.id ?? anonId],
        queryFn: async () => {
            const q = (supabase.from("store_followers" as any)
                .select("id", { count: "exact", head: true })
                .eq("store_key", storeKey)) as any;
            const { count } = user?.id
                ? await q.eq("user_id", user.id)
                : await q.eq("visitor_anon_id", anonId);
            return (count ?? 0) > 0;
        },
    });

    // Realtime: invalida queries em qualquer mudança
    useEffect(() => {
        const ch = supabase
            .channel(`store-followers:${storeKey}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "store_followers", filter: `store_key=eq.${storeKey}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["store-followers-count", storeKey] });
                    queryClient.invalidateQueries({ queryKey: ["store-followers-mine", storeKey] });
                })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [storeKey, queryClient]);

    const toggleFollow = async () => {
        console.log("[StoreHeader] toggleFollow clicked", { storeKey, isFollowing, userId: user?.id, anonId });
        if (isFollowing) {
            // Unfollow
            const q = (supabase.from("store_followers" as any).delete().eq("store_key", storeKey)) as any;
            const { error, count } = user?.id
                ? await q.eq("user_id", user.id)
                : await q.eq("visitor_anon_id", anonId);
            console.log("[StoreHeader] unfollow result", { error, count });
            if (error) { toast.error("Erro ao deixar de seguir: " + error.message); return; }
            toast.success("Você deixou de seguir esta loja.");
        } else {
            // Follow
            const payload = {
                store_key: storeKey,
                user_id: user?.id ?? null,
                visitor_anon_id: user?.id ? null : anonId,
            };
            console.log("[StoreHeader] follow payload", payload);
            const { error, data } = await (supabase.from("store_followers" as any).insert(payload).select()) as any;
            console.log("[StoreHeader] follow result", { error, data });
            if (error) {
                if (error.code === "23505") toast.info("Você já segue esta loja.");
                else toast.error("Erro ao seguir: " + (error.message || error.code || "desconhecido"));
                return;
            }
            toast.success("Agora você segue esta loja! 🎉");
        }
        queryClient.invalidateQueries({ queryKey: ["store-followers-count", storeKey] });
        queryClient.invalidateQueries({ queryKey: ["store-followers-mine", storeKey] });
    };

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

    // Constrói o endereço priorizando a CIDADE (sempre que disponível)
    let timidAddress = "Cidade não cadastrada";
    if (sCity) {
        // Mostra cidade SEMPRE de forma destacada, com bairro/região se houver
        const parts: string[] = [];
        if (sBairro) parts.push(sBairro);
        parts.push(`${sCity}${sRegion ? `/${sRegion}` : ""}`);
        timidAddress = parts.join(", ");
    } else if (sRegion) {
        timidAddress = sRegion;
    }

    return (
        <div className="relative animate-in fade-in duration-1000">

            {/* Store Card */}
            <div className={cn("w-full px-2 lg:px-3 xl:px-4 relative z-10 mb-8 flex justify-center", compact ? "mt-0" : "mt-4 lg:mt-6")}>
                <div className="w-full max-w-[1920px]">
                <Card 
                    className="st-banner border-none shadow-2xl rounded-3xl lg:rounded-[40px] bg-[#68c7f2] ring-1 ring-[#68c7f2]/60 overflow-hidden"
                    style={!theme?.banner?.imageUrl && bannerUrl ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url("${bannerUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                >
                    <div className={cn("flex items-center", sidebarMode ? "flex-col text-center p-4 gap-3" : cn("flex-col xl:flex-row", compact ? "p-3 lg:p-4 gap-4 xl:items-end" : "p-6 lg:p-10 gap-6 lg:gap-10 xl:items-end"))}>
                        
                        {/* Logo Avatar */}
                        <div className={cn("relative group shrink-0")}>
                            <div className={cn("bg-white shadow-xl ring-white/40 relative overflow-hidden", sidebarMode ? "w-16 h-16 rounded-2xl p-1 ring-2" : compact ? "w-16 h-16 lg:w-20 lg:h-20 rounded-[14px] lg:rounded-2xl p-1 lg:p-1.5 ring-1 lg:ring-2" : "w-28 h-28 lg:w-40 lg:h-40 rounded-3xl lg:rounded-[32px] p-1.5 ring-2 lg:ring-4")}>
                                {effectiveLogoUrl ? (
                                    <img src={effectiveLogoUrl} className={cn("w-full h-full object-cover", compact ? "rounded-[10px] lg:rounded-xl" : "rounded-[24px] lg:rounded-[26px]")} alt="Logo" />
                                ) : (
                                    <div className={cn("w-full h-full bg-gradient-to-br from-white/90 to-white/60 flex items-center justify-center", compact ? "rounded-[10px] lg:rounded-xl" : "rounded-[24px] lg:rounded-[26px]")}>
                                        <Store className={cn("text-[#68c7f2]", compact ? "w-6 h-6 lg:w-8 lg:h-8" : "w-10 h-10 lg:w-16 lg:h-16")} />
                                    </div>
                                )}
                            </div>
                            <div className={cn("absolute -bottom-1 -right-1 bg-white text-white rounded-lg lg:rounded-xl shadow-lg ring-2 ring-[#68c7f2]/50 flex items-center justify-center", compact ? "p-1 w-5 h-5 lg:w-6 lg:h-6" : "p-2 lg:p-2.5 w-8 h-8 lg:w-10 lg:h-10")}>
                                <CheckCircle2 className={cn("text-[#68c7f2]", compact ? "w-3 h-3 lg:w-3.5 lg:h-3.5" : "w-4 h-4 lg:w-5 lg:h-5")} />
                            </div>
                        </div>

                        {/* Info Text */}
                        <div className={cn("flex-1 space-y-1", sidebarMode ? "text-center" : "text-center xl:text-left")}>
                            <div className={cn("flex items-center gap-2 flex-wrap mb-0.5", sidebarMode ? "justify-center" : "justify-center xl:justify-start")}>
                                <Badge className="bg-[#FF6A00] hover:bg-[#E65C00] text-white border-none rounded-md px-1.5 py-0 font-bold uppercase text-[8px] lg:text-[9px] tracking-wider shadow-sm">
                                    Loja Oficial
                                </Badge>
                                <div className="flex items-center gap-1 text-white/90 font-bold text-[9px] lg:text-[10px] uppercase tracking-wider">
                                    <MapPin className="w-3 h-3" /> 
                                    {sCity || "Brasil"}{sRegion ? `, ${sRegion}` : ""}
                                </div>
                                {stats && (
                                    <div className="flex items-center gap-1 text-white font-bold text-[9px] lg:text-[10px] bg-white/25 px-1.5 py-0 rounded-md">
                                        <Star className="w-3 h-3 fill-current" />
                                        {stats.average} ({stats.count})
                                    </div>
                                )}
                            </div>
                            <h1 className={cn("font-black text-white tracking-tight leading-none", sidebarMode ? "text-lg" : compact ? "text-xl lg:text-2xl" : "text-3xl lg:text-5xl")}>
                                {safeStoreName}
                            </h1>
                            <p className={cn("text-white/90 font-medium max-w-2xl mt-1", sidebarMode ? "text-[10px] block line-clamp-1" : compact ? "hidden xl:block text-[10px] lg:text-xs line-clamp-1" : "text-xs lg:text-sm line-clamp-2")}>
                                {safeDescription}
                            </p>
                            
                            {/* Privacy Filtered Address Block */}
                            {(sLogradouro || sBairro || sCity) && (
                                <div className={cn("flex items-center gap-1.5 mt-2 text-white/90 font-bold", sidebarMode ? "hidden" : "text-[10px] lg:text-xs justify-center xl:justify-start")}>
                                    <MapPin className="w-3.5 h-3.5 text-white shrink-0"/>
                                    <span>{timidAddress}</span>
                                </div>
                            )}
                        </div>

                        {/* Quick Stats Panel */}
                        <div className={cn("flex justify-center w-full", sidebarMode ? "gap-4 pt-4 border-t border-white/30 mt-2" : cn("xl:justify-end xl:w-auto xl:border-l xl:border-white/30", compact ? "gap-4 lg:gap-6 pt-0 xl:pl-5" : "gap-6 lg:gap-10 pt-4 xl:pt-0 xl:pl-10"))}>
                            <div className="text-center">
                                <p className={cn("font-black text-white tracking-tight", sidebarMode ? "text-lg" : compact ? "text-lg lg:text-xl" : "text-xl lg:text-3xl")}>
                                    {productsCount}
                                </p>
                                <p className={cn("font-black text-white/80 uppercase tracking-wider", sidebarMode ? "text-[10px]" : compact ? "text-[8px] lg:text-[9px]" : "text-[10px]")}>Produtos</p>
                            </div>
                            <div className={cn("bg-white/30 self-center", compact ? "w-[1px] h-6 lg:h-8" : "w-[1px] h-8 lg:h-12")} />
                            <div className="text-center">
                                <p className={cn("font-black text-white tracking-tight", sidebarMode ? "text-lg" : compact ? "text-lg lg:text-xl" : "text-xl lg:text-3xl")}>
                                    {followersText}
                                </p>
                                <p className={cn("font-black text-white/80 uppercase tracking-wider", sidebarMode ? "text-[10px]" : compact ? "text-[8px] lg:text-[9px]" : "text-[10px]")}>Seguidores</p>
                            </div>
                            {/* "98% Resposta" REMOVIDO (07-21): era hardcoded/falso, sem fonte de dado. */}
                        </div>

                    </div>

                    {/* Footer Actions Desktop */}
                    <div className={cn("bg-black/10 border-t border-white/20 flex flex-wrap items-center gap-3", sidebarMode ? "hidden" : "justify-between", !sidebarMode && compact ? "px-4 py-2 lg:py-2.5 gap-3" : !sidebarMode ? "px-6 py-4 lg:py-5 gap-4" : "")}>
                        <div className={cn("items-center gap-4 lg:gap-5", sidebarMode ? "hidden" : "hidden lg:flex")}>
                            <div className={cn("flex items-center gap-1.5 font-bold text-white/90 uppercase tracking-wider", compact ? "text-[9px]" : "text-[11px]")}>
                                <ShieldCheck className={cn("text-white", compact ? "w-3.5 h-3.5" : "w-4 h-4")} /> Compra com Comércio Local
                            </div>
                            <div className={cn("flex items-center gap-1.5 font-bold text-white/90 uppercase tracking-wider", compact ? "text-[9px]" : "text-[11px]")}>
                                <Zap className={cn("text-[#FF6A00]", compact ? "w-3.5 h-3.5" : "w-4 h-4")} /> Entrega Rápida
                            </div>
                        </div>
                        <div className={cn("flex items-center w-full", sidebarMode ? "gap-2 justify-center flex-wrap" : "gap-2 lg:gap-3 lg:w-auto justify-center lg:justify-end")}>
                            {/* Contatos personalizados do tema da loja */}
                            {contactLinks.map(({ key, icon: Icon, href, label }) => (
                                <a
                                    key={key}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={label}
                                    className={cn(
                                        "st-btn flex items-center justify-center bg-white text-[#FF6A00] border border-[#FF6A00] shrink-0 transition-transform hover:scale-105",
                                        compact ? "rounded-lg w-8 h-8 lg:w-9 lg:h-9" : "rounded-xl w-11 h-11 lg:w-12 lg:h-12"
                                    )}
                                >
                                    <Icon className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
                                </a>
                            ))}
                            <Button
                                variant="outline"
                                onClick={toggleFollow}
                                className={cn(
                                    "flex-1 lg:flex-none rounded-lg lg:rounded-xl font-black uppercase tracking-wider",
                                    isFollowing
                                        ? "border-white/40 bg-white/20 hover:bg-white/30 text-white"
                                        : "border-[#FF6A00] bg-white hover:bg-white/90 text-[#FF6A00]",
                                    compact ? "text-[9px] h-8 lg:h-9 px-3 lg:px-4" : "text-[11px] h-11 lg:h-12 px-5"
                                )}
                            >
                                {isFollowing ? (
                                    <><Check className={cn("mr-1.5", compact ? "w-3 h-3" : "w-4 h-4")} /> Seguindo</>
                                ) : (
                                    <><Plus className={cn("mr-1.5", compact ? "w-3 h-3" : "w-4 h-4")} /> Seguir</>
                                )}
                            </Button>
                            
                            <Button 
                                variant="outline" 
                                onClick={onShare}
                                className={cn("p-0 border-[#FF6A00] hover:bg-white/90 bg-white text-[#FF6A00] shrink-0", compact ? "rounded-lg w-8 h-8 lg:w-9 lg:h-9" : "rounded-xl w-11 h-11 lg:w-12 lg:h-12")}
                                title="Compartilhar"
                            >
                                <Share2 className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4")} />
                            </Button>

                        </div>
                    </div>
                </Card>
                </div>
            </div>
        </div>
    );
}

export default StoreHeader;
