import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Megaphone, RefreshCw, Inbox, CheckCircle, Clock, AlertTriangle,
    Users, Shield, Radio, Activity, Timer,
    Target, Loader2, Store, Plus, ExternalLink, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePostadorOperacional } from "@/hooks/usePostadorOperacional";
import PostadorCampaignCard from "@/components/motoboy/premium/PostadorCampaignCard";
import PostadorHistoryTable from "@/components/motoboy/premium/PostadorHistoryTable";
import { useNavigate } from "react-router-dom";

// ═══════════════════════════════════════
// KPI CARD — Dark theme integrado
// ═══════════════════════════════════════
function KpiCard({ icon: Icon, label, value, sub, accentColor, glowHex, onClick, highlight }: {
    icon: any; label: string; value: string | number; sub?: string;
    accentColor: string; glowHex: string; onClick?: () => void; highlight?: boolean;
}) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "relative rounded-2xl p-4 overflow-hidden transition-all duration-300",
                "hover:translate-y-[-2px] hover:shadow-xl",
                onClick && "cursor-pointer",
                highlight && "ring-2 ring-[#FF6A00]/50",
            )}
            style={{
                background: "linear-gradient(145deg, #1B1F24 0%, #0D0F12 100%)",
                border: highlight ? "1px solid rgba(255,106,0,0.40)" : "1px solid rgba(42,48,56,0.80)",
                boxShadow: `0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)`,
            }}
        >
            {/* Linha de destaque no topo */}
            <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                style={{ background: `linear-gradient(90deg, transparent, ${glowHex}, transparent)` }} />
            {/* Glow de fundo */}
            <div className="absolute -top-8 -left-8 w-24 h-24 rounded-full blur-2xl opacity-20 transition-opacity hover:opacity-40"
                style={{ background: glowHex }} />
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg"
                        style={{ background: `${glowHex}18`, border: `1px solid ${glowHex}30` }}>
                        <Icon className={cn("h-3.5 w-3.5", accentColor)} />
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#A7B0BE]/50">{label}</p>
                </div>
                <p className="text-[28px] font-black text-white leading-none tracking-tight">{value}</p>
                {sub && <p className="text-[10px] text-[#A7B0BE]/55 mt-1.5 font-medium">{sub}</p>}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════
// COUNTDOWN HELPER
// ═══════════════════════════════════════
function useCountdownLabel(targetDate: string | null) {
    const [label, setLabel] = useState("—");
    useEffect(() => {
        if (!targetDate) { setLabel("Agora"); return; }
        const update = () => {
            const diff = new Date(targetDate).getTime() - Date.now();
            if (diff <= 0) { setLabel("Agora"); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`);
        };
        update();
        const iv = setInterval(update, 30000);
        return () => clearInterval(iv);
    }, [targetDate]);
    return label;
}

// ═══════════════════════════════════════
// SECTION TITLE
// ═══════════════════════════════════════
function SectionTitle({ icon: Icon, title, iconColor }: { icon: any; title: string; iconColor?: string }) {
    return (
        <div className="flex items-center gap-2.5 mb-4">
            <div className="p-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/[0.06]">
                <Icon className={cn("h-3.5 w-3.5", iconColor || "text-foreground/40")} />
            </div>
            <h3 className="text-xs font-black text-foreground/55 uppercase tracking-[0.15em]">{title}</h3>
        </div>
    );
}

// ═══════════════════════════════════════
// PROMO CARD WIDGET — Card de Divulgação
// ═══════════════════════════════════════
interface PromoSlotItem {
    id: string;
    title: string;
    price: number | null;
    image: string | null;
    city?: string;
    storeName?: string;
    storeId?: string;
}

function PromoCardWidget({ onCountChange }: { onCountChange?: (n: number) => void }) {
    const [items, setItems] = useState<PromoSlotItem[]>([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchPromoItems();
        // Auto-refresh a cada 60 s
        const iv = setInterval(fetchPromoItems, 60_000);
        return () => clearInterval(iv);
    }, []);

    async function fetchPromoItems() {
        setLoading(true);
        try {
            // 1. Busca os slots promovidos (inclui user_id para buscar nome da loja)
            const { data, error } = await supabase
                .from("promoted_listing_slots" as any)
                .select("listing_id, listing_title, listing_price, listing_image, listing_city, user_id")
                .order("created_at", { ascending: false })
                .limit(5);

            if (error) throw error;

            const rows = (data ?? []) as any[];

            // 2. Busca nome e ID das lojas para os user_ids únicos
            const uniqueUserIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
            let storeMap = new Map<string, { name: string; id: string }>();
            if (uniqueUserIds.length > 0) {
                const { data: stores } = await supabase
                    .from("merchant_stores")
                    .select("user_id, id, store_name")
                    .in("user_id", uniqueUserIds);
                (stores ?? []).forEach((s: any) => {
                    if (s.user_id) storeMap.set(s.user_id, { name: s.store_name ?? "", id: s.id ?? "" });
                });
            }

            const sliced: PromoSlotItem[] = rows.slice(0, 5).map((r) => {
                const storeInfo = r.user_id ? storeMap.get(r.user_id) : undefined;
                return {
                    id: r.listing_id,
                    title: r.listing_title ?? "Sem título",
                    price: r.listing_price ?? null,
                    image: r.listing_image ?? null,
                    city: r.listing_city ?? undefined,
                    storeName: storeInfo?.name || undefined,
                    storeId: storeInfo?.id || undefined,
                };
            });

            setItems(sliced);
            onCountChange?.(sliced.length);
        } catch (err) {
            console.error("[PromoCard] fetch error:", err);
        } finally {
            setLoading(false);
        }
    }

    const fmtPrice = (p: number | null) =>
        p ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p) : "";

    // Monta o texto da mensagem como será visto no grupo
    const storeNames = [...new Set(items.map(i => i.storeName).filter(Boolean))];
    const cities = [...new Set(items.map(i => i.city).filter(Boolean))];
    const firstImage = items.find(i => i.image)?.image ?? null;
    const firstStore = storeNames[0] ?? "Loja Parceira";
    const firstCity = cities[0] ?? "";

    const msgLines: string[] = [];
    if (firstStore) msgLines.push(`🏪 ${firstStore}`);
    if (firstCity) msgLines.push(`📍 ${firstCity}`);
    msgLines.push("");
    msgLines.push("🛍️ Ofertas especiais:");
    items.forEach(item => {
        const price = item.price ? ` — ${fmtPrice(item.price)}` : "";
        msgLines.push(`• ${item.title}${price}`);
    });
    const msgText = msgLines.join("\n");

    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    return (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#0D0F12", border: "1px solid rgba(42,48,56,0.6)" }}>
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ background: "linear-gradient(to right, #FF6A00, #FF8C33)" }}>
                <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-white shrink-0" />
                    <div>
                        <p className="text-white font-black text-xs uppercase tracking-wider">Prévia — Como aparece no grupo</p>
                        <p className="text-white/70 text-[9px]">Visualização real antes de postar</p>
                    </div>
                </div>
                {loading && <Loader2 className="w-4 h-4 text-white animate-spin" />}
            </div>

            {/* Chat background */}
            <div className="p-3" style={{
                backgroundColor: "#0b141a",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cg fill='none' stroke='%23182229' stroke-width='1'%3E%3Cellipse cx='20' cy='20' rx='8' ry='5'/%3E%3Cellipse cx='60' cy='20' rx='8' ry='5'/%3E%3Cellipse cx='20' cy='60' rx='8' ry='5'/%3E%3Cellipse cx='60' cy='60' rx='8' ry='5'/%3E%3Ccircle cx='40' cy='40' r='6'/%3E%3Cpath d='M14 20 Q20 12 26 20'/%3E%3Cpath d='M54 20 Q60 12 66 20'/%3E%3Cpath d='M14 60 Q20 52 26 60'/%3E%3Cpath d='M54 60 Q60 52 66 60'/%3E%3C/g%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
            }}>

                {/* Data separador */}
                <div className="flex justify-center mb-3">
                    <span className="text-[10px] px-3 py-0.5 rounded-md font-medium" style={{ background: "rgba(17,27,33,0.85)", color: "#e9edef" }}>
                        Hoje
                    </span>
                </div>

                {items.length === 0 ? (
                    /* Estado vazio */
                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,106,0,0.1)", border: "1px solid rgba(255,106,0,0.2)" }}>
                            <Plus className="w-6 h-6 text-[#FF6A00]/60" />
                        </div>
                        <div className="text-center">
                            <p className="text-[#A7B0BE]/60 text-xs font-bold">Nenhum anúncio em divulgação</p>
                            <p className="text-[#A7B0BE]/40 text-[10px] mt-1">Quando lojistas promoverem produtos, aparecerão aqui</p>
                        </div>
                        <button
                            onClick={() => navigate('/anunciante/divulgar-gratis')}
                            className="text-[10px] font-black px-4 py-1.5 rounded-lg"
                            style={{ background: "rgba(255,106,0,0.15)", color: "#FF6A00", border: "1px solid rgba(255,106,0,0.3)" }}
                        >
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            Anunciar grátis aqui
                        </button>
                    </div>
                ) : (
                    /* Bolha de mensagem WhatsApp */
                    <div className="flex items-end gap-2">
                        {/* Avatar motoboy */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                            style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}>
                            M
                        </div>

                        <div className="flex-1 min-w-0 overflow-hidden" style={{ background: "#202c33", borderRadius: "8px 8px 8px 0" }}>
                            {/* Nome do motoboy */}
                            <p className="text-[12px] font-bold px-3 pt-2 pb-0.5" style={{ color: "#53bdeb" }}>
                                Motoboy Viagg
                            </p>

                            {/* Texto da mensagem */}
                            <pre className="text-[12px] px-3 pb-2 leading-relaxed whitespace-pre-wrap break-words font-sans"
                                style={{ color: "#e9edef" }}>
                                {msgText}
                            </pre>

                            {/* OG Preview Card — clicável para a loja */}
                            {(() => {
                                const storeUrl = items.find(i => i.storeId)?.storeId
                                    ? `/loja/${items.find(i => i.storeId)!.storeId}`
                                    : "/mercado";
                                return (
                                    <button
                                        onClick={() => navigate(storeUrl)}
                                        className="w-full text-left mx-0 mb-2 overflow-hidden transition-opacity hover:opacity-80"
                                        style={{ borderLeft: "4px solid #25D366", background: "#1a2229" }}
                                    >
                                        {firstImage ? (
                                            <img src={firstImage} alt="preview" className="w-full object-cover" style={{ maxHeight: 140 }} />
                                        ) : (
                                            <div className="w-full flex items-center justify-center text-3xl"
                                                style={{ height: 80, background: "linear-gradient(135deg,#1e3a2f,#0d2b20)" }}>
                                                🏪
                                            </div>
                                        )}
                                        <div className="px-3 py-2">
                                            <p className="text-[10px] mb-0.5" style={{ color: "#8696a0" }}>Viagg · Promoção</p>
                                            <p className="text-[12px] font-bold leading-tight" style={{ color: "#e9edef" }}>
                                                {firstStore} — Ofertas especiais
                                            </p>
                                            <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "#8696a0" }}>
                                                {items.map(i => i.title).join(", ")}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })()}

                            {/* Timestamp */}
                            <div className="flex items-center justify-end gap-1 px-3 pb-2">
                                <span className="text-[10px]" style={{ color: "#8696a0" }}>{now}</span>
                                <span className="text-[12px]" style={{ color: "#53bdeb" }}>✓✓</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 flex items-center gap-2" style={{ background: "#0D0F12", borderTop: "1px solid rgba(42,48,56,0.4)" }}>
                <ExternalLink className="w-3 h-3 shrink-0 text-[#25D366]" />
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "rgba(37,211,102,0.7)" }}>
                    Toque no card → vai para a loja do anunciante
                </span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════
// MAIN — CENTRAL DE POSTAGENS
// ═══════════════════════════════════════
export default function MotoboyCampaignInbox() {
    const postador = usePostadorOperacional();
    const [activeTab, setActiveTab] = useState<"campanhas" | "historico">("campanhas");
    const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
    const [promoCount, setPromoCount] = useState(0);
    const promoCardRef = useRef<HTMLDivElement>(null);

    const nextReleaseLabel = useCountdownLabel(postador.kpis.nextRelease);

    // Auto-refresh global a cada 30 s
    useEffect(() => {
        const iv = setInterval(() => postador.refetchAll(), 30_000);
        return () => clearInterval(iv);
    }, []);

    // CORR #4: Campaign-first. Toggle to expand and show eligible groups per campaign.
    const toggleCampaign = (id: string) =>
        setExpandedCampaign((prev) => (prev === id ? null : id));

    // Auto-expand if only one campaign
    useEffect(() => {
        if (postador.campaigns.length === 1 && !expandedCampaign) {
            setExpandedCampaign(postador.campaigns[0].id);
        }
    }, [postador.campaigns.length]);

    // Operational status
    const opStatus = postador.campaigns.length > 0
        ? { label: "Campanhas Ativas", dot: "bg-sky-400", text: "text-sky-400" }
        : postador.eligibleGroups.length > 0
            ? { label: "Tudo em dia", dot: "bg-emerald-400", text: "text-emerald-400" }
            : { label: "Aguardando campanhas", dot: "bg-amber-400", text: "text-amber-400" };

    // ── Loading ──
    if (postador.isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
                <div className="text-center space-y-4">
                    <div className="relative mx-auto w-14 h-14">
                        <div className="absolute inset-0 rounded-full border-2 border-orange-500/15 animate-ping" />
                        <div className="absolute inset-2 rounded-full border-2 border-orange-400/30 animate-spin border-t-transparent" />
                        <div className="absolute inset-4 rounded-full bg-orange-500/[0.07] flex items-center justify-center">
                            <Radio className="h-4 w-4 text-orange-400/80" />
                        </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em]">Sincronizando</p>
                </div>
            </div>
        );
    }

    // ── Error State ──
    if (postador.hasError) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
                <div className="text-center space-y-4 max-w-[280px]">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/[0.08] border border-rose-500/[0.12] flex items-center justify-center mx-auto">
                        <AlertTriangle className="h-6 w-6 text-rose-400/70" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-foreground/70">Erro ao carregar dados</p>
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                            Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.
                        </p>
                    </div>
                    <Button
                        onClick={postador.refetchAll}
                        className="bg-orange-500/15 text-orange-500 hover:bg-orange-500/25 border border-orange-500/20 text-xs font-bold px-6 h-9 rounded-xl"
                    >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Tentar novamente
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto min-h-screen bg-background pb-28">
            {/* Subtle ambient warm glow at top */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[radial-gradient(ellipse,rgba(255,228,225,0.15),transparent_70%)] pointer-events-none" />

            <div className="relative max-w-lg mx-auto px-4 py-6 space-y-5">

                {/* ═══════════════════════════════════════ */}
                {/* 1. HEADER — Executive Command Center    */}
                {/* ═══════════════════════════════════════ */}
                <div className="relative rounded-2xl overflow-hidden" style={{
                    background: "linear-gradient(145deg, #FFF8F6 0%, #FFF5F3 60%, rgba(255,228,225,0.08) 100%)",
                    border: "1px solid rgba(255,228,225,0.18)",
                    boxShadow: "0 6px 28px rgba(255,228,225,0.06)",
                }}>
                    {/* Subtle warm glow at top-left */}
                    <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full blur-3xl" style={{ background: "rgba(255,228,225,0.08)" }} />
                    {/* Bottom warm divider */}
                    <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,228,225,0.25), transparent)" }} />

                    <div className="relative z-10 p-5 pb-5">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3.5">
                                <div className="relative p-3 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/[0.08] border border-orange-400/[0.12]">
                                    <Megaphone className="h-6 w-6 text-orange-400" />
                                    {/* Subtle glow behind icon */}
                                    <div className="absolute inset-0 rounded-xl bg-orange-500/[0.08] blur-lg -z-10" />
                                </div>
                                <div>
                                    <h1 className="text-[22px] font-black text-foreground/95 tracking-tight leading-none">
                                        Central de Postagens
                                    </h1>
                                    <p className="text-[11px] text-muted-foreground font-medium mt-2 max-w-[220px] leading-snug">
                                        Campanhas, grupos, cooldown e histórico em tempo real.
                                    </p>
                                </div>
                            </div>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-9 w-9 rounded-xl text-muted-foreground/70 hover:text-foreground/70 hover:bg-foreground/[0.06] border border-foreground/[0.06] hover:border-foreground/[0.12] transition-all duration-200"
                                onClick={postador.refetchAll}
                            >
                                <RefreshCw className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Status Bar */}
                        <div className="flex items-center gap-5 mt-4 pt-3.5 border-t border-foreground/[0.05]">
                            <div className="flex items-center gap-2">
                                <div className={cn("h-2 w-2 rounded-full", opStatus.dot)} style={{ animation: "pulse 2s ease-in-out infinite" }} />
                                <span className={cn("text-[11px] font-bold", opStatus.text)}>{opStatus.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Activity className="h-3 w-3" />
                                <span className="text-[10px] font-semibold">{postador.campaigns.length} campanhas</span>
                            </div>
                            <div className="flex items-center gap-1.5 ml-auto">
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/[0.08] border border-emerald-500/[0.12]">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-wider">Ao vivo</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* 2. CARD DE DIVULGAÇÃO DOS LOJISTAS      */}
                {/* ═══════════════════════════════════════ */}
                <div ref={promoCardRef}>
                    <PromoCardWidget onCountChange={setPromoCount} />
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* 3. KPI CARDS                            */}
                {/* ═══════════════════════════════════════ */}
                <div className="grid grid-cols-2 gap-3">
                    <KpiCard
                        icon={Users}
                        label="Grupos"
                        value={postador.kpis.totalGroups}
                        sub={postador.kpis.totalGroups === 0 ? "Nenhum elegível" : "elegíveis"}
                        glowHex="#10b981"
                        accentColor="text-emerald-400"
                    />
                    <KpiCard
                        icon={Clock}
                        label="Em Cooldown"
                        value={postador.kpis.groupsInCooldown}
                        sub={postador.kpis.groupsInCooldown === 0 ? "Todos livres" : "aguardando"}
                        glowHex="#f59e0b"
                        accentColor="text-amber-400"
                    />
                    <KpiCard
                        icon={CheckCircle}
                        label="Postagens"
                        value={postador.kpis.totalPostings}
                        sub="registradas"
                        glowHex="#f97316"
                        accentColor="text-orange-400"
                    />
                    <KpiCard
                        icon={Timer}
                        label="Próx. Liberação"
                        value={nextReleaseLabel}
                        sub={postador.kpis.nextRelease ? "até liberação" : "livre para postar!"}
                        glowHex={postador.kpis.nextRelease ? "#0ea5e9" : "#10b981"}
                        accentColor={postador.kpis.nextRelease ? "text-sky-400" : "text-emerald-400"}
                        highlight={!postador.kpis.nextRelease}
                    />
                    <KpiCard
                        icon={Sparkles}
                        label="Anúncios Ativos"
                        value={promoCount}
                        sub={promoCount === 0 ? "nenhum promovido" : "em divulgação"}
                        glowHex="#FF6A00"
                        accentColor="text-orange-400"
                        highlight={promoCount > 0}
                        onClick={() => promoCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    />
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* 3. INFO — Como funciona                 */}
                {/* ═══════════════════════════════════════ */}
                <div className="relative rounded-xl overflow-hidden" style={{
                    background: "linear-gradient(135deg, #FFFFFF 0%, #FFF8F6 60%, #FFE4E1 100%)",
                    border: "1px solid rgba(255,200,190,0.35)",
                }}>
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-orange-500/60 via-orange-400/20 to-transparent rounded-full" />
                    <div className="p-4 pl-5">
                        <div className="flex items-start gap-3">
                            <Shield className="h-4 w-4 text-sky-400/50 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-[11px] font-bold text-foreground/55 mb-1.5">Como funciona</p>
                                <p className="text-[11px] text-muted-foreground leading-[1.7]">
                                    Escolha uma campanha e expanda para ver seus grupos elegíveis. Clique em "Postar no WhatsApp" — o WhatsApp abre com a mensagem pronta, você seleciona o grupo e envia. A postagem é registrada automaticamente.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* 4. TABS                                 */}
                {/* ═══════════════════════════════════════ */}
                <div className="flex gap-1 p-1 rounded-xl" style={{
                    background: "#FFF5F3",
                    border: "1px solid rgba(255,200,190,0.30)",
                }}>
                    {[
                        { key: "campanhas" as const, label: "Campanhas", count: postador.campaigns.length, icon: Inbox },
                        { key: "historico" as const, label: "Histórico", count: postador.history.length, icon: Clock },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex-1 py-2.5 px-3 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2",
                                activeTab === tab.key
                                    ? "bg-white text-foreground shadow-md shadow-rose-200/30 border border-rose-200/40"
                                    : "text-muted-foreground hover:text-foreground/60 hover:bg-white/60"
                            )}
                        >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                            <span className={cn(
                                "text-[9px] font-black min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1",
                                activeTab === tab.key ? "bg-sky-500/15 text-sky-400" : "bg-foreground/[0.04] text-muted-foreground/60"
                            )}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* ═══════════════════════════════════════ */}
                {/* 5. CAMPAIGNS — EXPANDABLE SECTION       */}
                {/* CORR #4: Campaign-first, no blind cross */}
                {/* ═══════════════════════════════════════ */}
                {activeTab === "campanhas" && (
                    <div className="space-y-3">
                        {postador.loadingCampaigns || postador.loadingGroups ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
                            </div>
                        ) : postador.campaigns.length === 0 ? (
                            <div className="rounded-2xl p-12 text-center" style={{
                                background: "#FFF8F6",
                                border: "2px dashed rgba(255,200,190,0.40)",
                            }}>
                                <div className="w-14 h-14 rounded-2xl bg-emerald-500/[0.06] flex items-center justify-center mx-auto mb-4 border border-emerald-500/[0.08]">
                                    <CheckCircle className="h-6 w-6 text-emerald-500/40" />
                                </div>
                                <p className="font-bold text-foreground/55 text-sm">Nenhuma campanha pendente</p>
                                <p className="text-[11px] text-muted-foreground/70 mt-2 max-w-[240px] mx-auto leading-relaxed">
                                    Novas campanhas chegam automaticamente conforme a demanda da sua região.
                                </p>
                            </div>
                        ) : (
                            postador.campaigns.map((campaign) => {
                                const isExpanded = expandedCampaign === campaign.id;
                                const cards = postador.buildCardsForCampaign(campaign);
                                const eligibleCount = cards.filter((c) => c.groupStatus === "eligible").length;
                                const cooldownCount = cards.filter((c) => c.groupStatus === "cooldown").length;

                                return (
                                    <div
                                        key={campaign.id}
                                        className={cn(
                                            "rounded-2xl overflow-hidden transition-all duration-300",
                                        )}
                                        style={{
                                            background: "linear-gradient(145deg, #FFFFFF 0%, #FFF8F6 70%, #FFE4E1 100%)",
                                            border: isExpanded
                                                ? "1px solid rgba(255,180,165,0.45)"
                                                : "1px solid rgba(255,200,190,0.30)",
                                            boxShadow: isExpanded ? "0 8px 30px rgba(255,228,225,0.20)" : "0 2px 12px rgba(255,228,225,0.10)",
                                        }}
                                    >
                                        {/* Campaign Header — click to expand */}
                                        <button
                                            onClick={() => toggleCampaign(campaign.id)}
                                            className={cn(
                                                "w-full p-4 text-left flex items-center gap-3 transition-colors duration-200",
                                                "hover:bg-foreground/[0.02] active:bg-foreground/[0.04]",
                                            )}
                                        >
                                            <div className={cn(
                                                "p-2.5 rounded-xl border flex-shrink-0 transition-all duration-200",
                                                isExpanded
                                                    ? "bg-orange-500/15 border-orange-400/20"
                                                    : "bg-foreground/[0.03] border-foreground/[0.06] group-hover:border-foreground/[0.1]"
                                            )}>
                                                <Megaphone className={cn(
                                                    "h-4 w-4 transition-colors",
                                                    isExpanded ? "text-orange-400" : "text-muted-foreground"
                                                )} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-bold text-foreground/85 truncate leading-tight">
                                                    {campaign.title || campaign.message_text?.slice(0, 50) || "Campanha"}
                                                </p>
                                                <div className="flex items-center gap-2.5 mt-1.5">
                                                    {campaign.target_city && (
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                                                            <Target className="h-2.5 w-2.5 text-muted-foreground/70" /> {campaign.target_city}
                                                        </span>
                                                    )}
                                                    {campaign.campaign_type && (
                                                        <Badge className="bg-violet-500/10 text-violet-400/70 border-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0 h-4">
                                                            {campaign.campaign_type}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {eligibleCount > 0 && (
                                                    <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/[0.12] rounded-md px-2 py-0.5">
                                                        {eligibleCount} ✓
                                                    </span>
                                                )}
                                                {cooldownCount > 0 && (
                                                    <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/[0.12] rounded-md px-2 py-0.5">
                                                        {cooldownCount} ⏳
                                                    </span>
                                                )}
                                                <svg
                                                    className={cn(
                                                        "h-4 w-4 text-muted-foreground/60 transition-transform duration-300 ease-out",
                                                        isExpanded && "rotate-180 text-orange-400/50"
                                                    )}
                                                    viewBox="0 0 20 20"
                                                    fill="currentColor"
                                                >
                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        </button>

                                        {/* Expanded: show group cards for this campaign */}
                                        {isExpanded && (
                                            <div className="p-3 space-y-3" style={{
                                                borderTop: "1px solid rgba(255,200,190,0.25)",
                                                background: "linear-gradient(180deg, #FFFAF9, #FFF5F3)",
                                            }}>
                                                {postador.eligibleGroups.length === 0 ? (
                                                    <div className="p-8 text-center">
                                                        <Users className="h-5 w-5 mx-auto text-muted-foreground/50 mb-2" />
                                                        <p className="text-[11px] text-muted-foreground font-medium">Nenhum grupo elegível</p>
                                                        <p className="text-[10px] text-muted-foreground/50 mt-1">Grupos precisam ser ativos e válidos para aparecer aqui</p>
                                                    </div>
                                                ) : (
                                                    cards.map((card) => {
                                                        const key = `${card.campaign.id}-${card.group.id}`;
                                                        return (
                                                            <PostadorCampaignCard
                                                                key={key}
                                                                campaign={card.campaign}
                                                                group={card.group}
                                                                runtime={card.runtime || undefined}
                                                                groupStatus={card.groupStatus}
                                                                postingState={postador.postingState[key]}
                                                                onMarkAsPosted={postador.markAsPosted}
                                                            />
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════ */}
                {/* 6. HISTORY TAB                          */}
                {/* ═══════════════════════════════════════ */}
                {activeTab === "historico" && (
                    <div>
                        <SectionTitle icon={Clock} title="Histórico de Postagens" iconColor="text-amber-400/60" />
                        <PostadorHistoryTable
                            history={postador.history}
                            isLoading={postador.loadingHistory}
                        />
                    </div>
                )}

            </div>
        </div>
    );
}
