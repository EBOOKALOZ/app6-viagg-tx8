import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePostadorPremium } from "@/hooks/usePostadorPremium";
import { usePostadorLotes } from "@/hooks/usePostadorLotes";
import { useAuth } from "@/contexts/AuthContext";
import { MotoboyPageTemplate } from "@/components/motoboy/MotoboyPageTemplate";
import { SafeErrorBoundary } from "@/components/SafeErrorBoundary";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PostadorProofModal from "@/components/postador/PostadorProofModal";
import PostadorLotCard from "@/components/postador/PostadorLotCard";
import PostadorLotSkeleton from "@/components/postador/PostadorLotSkeleton";
import PostadorLotProofModal from "@/components/postador/PostadorLotProofModal";
import {
    Zap, Clock, CheckCircle, XCircle, ArrowLeft, RefreshCw,
    Loader2, Send, MapPin, Star, CalendarDays, Store,
    ShoppingBag, FileText, MessageSquare, User, ChevronDown,
    ChevronUp, AlertTriangle, Trophy, Shield, Timer, Radio,
    Image as ImageIcon, Copy, ExternalLink, Target, Package,
    TrendingUp, Sparkles,
} from "lucide-react";
import type {
    PostadorOperacionalBoardItem, PostadorHistoryViewItem,
    PostadorMyHistoryItem, GroupRuntimeView, PostingLot,
} from "@/types/postador";
import { toast } from "sonner";

// ═══════════════════════════════════════
// GANCHO DE CONTAGEM REGRESSIVA (COUNTDOWN)
// ═══════════════════════════════════════

function useCountdown(targetDate: string | null) {
    const [remaining, setRemaining] = useState("");
    const [isExpired, setIsExpired] = useState(true);

    useEffect(() => {
        if (!targetDate) { setRemaining(""); setIsExpired(true); return; }
        const target = new Date(targetDate).getTime();

        function update() {
            const diff = target - Date.now();
            if (diff <= 0) { setRemaining("Liberado"); setIsExpired(true); return; }
            setIsExpired(false);
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            if (d > 0) setRemaining(`${d}d ${h}h ${m}m`);
            else if (h > 0) setRemaining(`${h}h ${m}m ${s}s`);
            else setRemaining(`${m}m ${s}s`);
        }

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [targetDate]);

    return { remaining, isExpired };
}

// ═══════════════════════════════════════
// BARRA DE KPIs
// ═══════════════════════════════════════

function KpiBar({
    kpis, operatorKpis, isLoading,
}: {
    kpis: { pending_count: number; posted_count: number; cancelled_count: number; last_posted_at: string | null };
    operatorKpis: { my_posted_count: number; my_last_posted_at: string | null };
    isLoading: boolean;
}) {
    const fmt = (d: string | null) => {
        if (!d) return "—";
        const dt = new Date(d);
        return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " " +
            dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    };

    const items = [
        { label: "Pendentes", value: kpis.pending_count, icon: <Clock className="h-4 w-4" />, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
        { label: "Postadas", value: kpis.posted_count, icon: <CheckCircle className="h-4 w-4" />, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
        { label: "Canceladas", value: kpis.cancelled_count, icon: <XCircle className="h-4 w-4" />, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
        { label: "Última Post.", value: fmt(kpis.last_posted_at), icon: <CalendarDays className="h-4 w-4" />, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20", isDate: true },
        { label: "Meu Total", value: operatorKpis.my_posted_count, icon: <Trophy className="h-4 w-4" />, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
        { label: "Minha Última", value: fmt(operatorKpis.my_last_posted_at), icon: <User className="h-4 w-4" />, color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20", isDate: true },
    ];

    return (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {items.map((item) => (
                <Card
                    key={item.label}
                    className={cn("border shadow-lg overflow-hidden relative", item.border)}
                    style={{
                        background: "linear-gradient(135deg, #1A1F2B 0%, #1E2233 50%, rgba(255,228,225,0.06) 100%)",
                        borderColor: "rgba(255,228,225,0.12)",
                        boxShadow: "0 4px 20px rgba(255,228,225,0.04), inset 0 1px 0 rgba(255,228,225,0.06)",
                    }}
                >
                    {/* Warm glow accent — topo */}
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,228,225,0.25), transparent)" }} />
                    <CardContent className="p-3 flex flex-col items-center justify-center text-center min-h-[80px] relative z-10">
                        {isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                            <>
                                <span className={cn("mb-1", item.color)}>{item.icon}</span>
                                <p className={cn("font-black", item.isDate ? "text-[10px]" : "text-xl", "text-white/90")}>{item.value}</p>
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-0.5">{item.label}</p>
                            </>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════
// CONFIGURAÇÃO DE STATUS DO ALVO (TARGET)
// ═══════════════════════════════════════

const TARGET_STATUS_CONFIG: Record<string, {
    label: string; color: string; bg: string; border: string; icon: React.ReactNode;
}> = {
    available: {
        label: "Disponível", color: "text-emerald-400", bg: "bg-emerald-500/10",
        border: "border-emerald-500/20", icon: <Target className="h-3.5 w-3.5" />,
    },
    pending: {
        label: "Pendente", color: "text-amber-400", bg: "bg-amber-500/10",
        border: "border-amber-500/20", icon: <Clock className="h-3.5 w-3.5" />,
    },
    claimed: {
        label: "Reivindicado", color: "text-sky-400", bg: "bg-sky-500/10",
        border: "border-sky-500/20", icon: <Shield className="h-3.5 w-3.5" />,
    },
    posted: {
        label: "Postado", color: "text-emerald-400", bg: "bg-emerald-500/10",
        border: "border-emerald-500/20", icon: <CheckCircle className="h-3.5 w-3.5" />,
    },
    failed: {
        label: "Falhou", color: "text-rose-400", bg: "bg-rose-500/10",
        border: "border-rose-500/20", icon: <XCircle className="h-3.5 w-3.5" />,
    },
    cancelled: {
        label: "Cancelada", color: "text-zinc-400", bg: "bg-zinc-500/10",
        border: "border-zinc-500/20", icon: <XCircle className="h-3.5 w-3.5" />,
    },
};

// ═══════════════════════════════════════
// CARD DO BOARD OPERACIONAL (OPERATIONAL BOARD)
// Renderiza um item do postador_operacional_board
// Chave primária: target_id
// ═══════════════════════════════════════

function OperationalBoardCard({
    item, actionState, onOpenProof,
}: {
    item: PostadorOperacionalBoardItem;
    actionState: Record<string, "loading" | "success" | "error">;
    onOpenProof: (item: PostadorOperacionalBoardItem) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    const key = item.target_id;
    const isActing = actionState[key] === "loading";
    const isSuccess = actionState[key] === "success";
    const isError = actionState[key] === "error";

    const statusCfg = TARGET_STATUS_CONFIG[item.target_status] || TARGET_STATUS_CONFIG.pending;
    const title = item.campaign_title || "Campanha sem título";
    const image = item.product_image || item.campaign_media_url;
    const canAct = (item.target_status === "available" || item.target_status === "pending" || item.target_status === "claimed")
        && !isActing && !isSuccess;

    const handleCopy = () => {
        const text = item.campaign_message || item.campaign_title || "";
        if (text) { navigator.clipboard.writeText(text); toast.success("Texto copiado!"); }
    };

    return (
        <div
            className={cn(
                "relative rounded-2xl border overflow-hidden transition-all duration-300",
                "hover:shadow-lg",
                isSuccess && "ring-1 ring-emerald-500/25 shadow-emerald-500/[0.05]",
            )}
            style={{
                background: "linear-gradient(145deg, #1A1F2B 0%, #1C2132 60%, rgba(255,228,225,0.04) 100%)",
                borderColor: `rgba(255,228,225,0.10)`,
                boxShadow: "0 6px 24px rgba(255,228,225,0.03), inset 0 1px 0 rgba(255,228,225,0.05)",
            }}
        >
            {/* Top warm accent line */}
            <div
                className="absolute top-0 left-4 right-4 h-[1px]"
                style={{
                    background: item.target_status === "available"
                        ? "linear-gradient(90deg, transparent, rgba(16,185,129,0.3), rgba(255,228,225,0.15), transparent)"
                        : item.target_status === "claimed"
                            ? "linear-gradient(90deg, transparent, rgba(56,189,248,0.3), rgba(255,228,225,0.15), transparent)"
                            : "linear-gradient(90deg, transparent, rgba(255,228,225,0.2), transparent)",
                }}
            />

            <div className="p-4 space-y-3">
                {/* Row 1: Header + Status Badge */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <h4 className="font-black text-[13px] text-white/90 line-clamp-1 tracking-tight leading-tight">
                            {title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {item.store_name && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-white/50 font-semibold">
                                    <Store className="h-3 w-3 text-orange-400/60" /> {item.store_name}
                                </span>
                            )}
                            {item.product_name && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-white/35 font-medium">
                                    <ShoppingBag className="h-3 w-3 text-white/25" /> {item.product_name}
                                    {item.product_price != null && (
                                        <span className="text-emerald-400/80 font-bold ml-0.5">
                                            R$ {item.product_price.toFixed(2).replace(".", ",")}
                                        </span>
                                    )}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {item.target_city && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-white/35 font-medium">
                                    <MapPin className="h-3 w-3 text-white/25" /> {item.target_city}
                                    {item.target_region && ` · ${item.target_region}`}
                                </span>
                            )}
                            {item.target_bairro && (
                                <span className="text-[10px] text-white/25 font-medium">{item.target_bairro}</span>
                            )}
                            {item.campaign_type && (
                                <Badge className="bg-violet-500/10 text-violet-400/70 border-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0 h-4">
                                    {item.campaign_type}
                                </Badge>
                            )}
                        </div>
                    </div>
                    {/* Status badge */}
                    <span className={cn(
                        "inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider",
                        "px-2.5 py-1.5 rounded-lg shrink-0 border",
                        statusCfg.bg, statusCfg.color, statusCfg.border,
                    )}>
                        {statusCfg.icon} {statusCfg.label}
                    </span>
                </div>

                {/* Row 2: Media */}
                {image && (
                    <div className="rounded-xl overflow-hidden border border-white/[0.05] bg-[#151922]">
                        <img
                            src={image}
                            alt={item.product_name || "Mídia da campanha"}
                            className="w-full max-h-40 object-cover"
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>
                )}

                {/* Row 3: Message Text */}
                {item.campaign_message && (
                    <div className="p-3 rounded-xl bg-[#151922]/80 border border-white/[0.04] text-[12px] text-white/55 leading-relaxed whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
                        {item.campaign_message}
                    </div>
                )}

                {/* Row 4: Group Info */}
                {item.whatsapp_group_name && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#151922]/60 border border-white/[0.04]">
                        <div className="w-1.5 h-9 rounded-full shrink-0 bg-emerald-500" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white/75 truncate leading-tight">
                                {item.whatsapp_group_name}
                            </p>
                            <p className="text-[10px] text-white/30 flex items-center gap-1.5 mt-0.5 font-medium">
                                {item.group_neighborhood && <span>{item.group_neighborhood}</span>}
                                {item.group_city && <span>· {item.group_city}</span>}
                            </p>
                        </div>
                    </div>
                )}

                {/* Linha 5: indicador de target_id */}
                <p className="text-[8px] text-white/15 font-mono truncate">
                    alvo: {item.target_id.slice(0, 8)}… | {(item.target_created_at || (item as any).created_at) ? new Date(item.target_created_at || (item as any).created_at).toLocaleDateString("pt-BR") : "—"}
                </p>

                {/* Row 6: Action Buttons */}
                <div className="flex gap-2 pt-0.5">
                    {item.campaign_message && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-[11px] font-bold h-10 gap-1.5 border-white/[0.06] text-white/45 hover:text-white/80 hover:bg-white/[0.04] hover:border-white/[0.12] rounded-xl transition-all duration-200"
                            onClick={handleCopy}
                        >
                            <Copy className="h-3.5 w-3.5" /> Copiar Texto
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className={cn(
                            "flex-1 text-[11px] font-bold h-10 gap-1.5 rounded-xl transition-all duration-300",
                            isActing && "pointer-events-none opacity-80",
                            canAct
                                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/25 hover:translate-y-[-1px] active:translate-y-0"
                                : isSuccess
                                    ? "bg-emerald-600/80 text-white pointer-events-none"
                                    : isError
                                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/15 cursor-not-allowed"
                                        : isActing
                                            ? "bg-white/[0.06] text-white/40 cursor-wait"
                                            : "bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.04]",
                        )}
                        disabled={!canAct}
                        onClick={() => onOpenProof(item)}
                    >
                        {isActing ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Confirmando...</>
                        ) : isSuccess ? (
                            <><CheckCircle className="h-4 w-4" /> Confirmado!</>
                        ) : isError ? (
                            <><AlertTriangle className="h-4 w-4" /> Erro</>
                        ) : (
                            <><Send className="h-3.5 w-3.5" /> Confirmar Postagem</>
                        )}
                    </Button>
                </div>

                {/* Row 7: Expand toggle */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] text-white/18 hover:text-white/45 py-1 transition-colors duration-200"
                >
                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {expanded ? "Ocultar detalhes" : "Ver detalhes"}
                </button>

                {/* Expanded Details */}
                {expanded && (
                    <div className="space-y-2.5 pt-2 border-t border-white/[0.04] animate-in slide-in-from-top-2 duration-200">
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.2em]">Detalhes do Target</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {[
                                { label: "Status", value: item.target_status },
                                { label: "Campanha", value: item.campaign_type || "—" },
                                { label: "Grupo", value: item.whatsapp_group_name || "—" },
                                { label: "Cidade", value: item.target_city || "—" },
                                { label: "Bairro", value: item.target_bairro || item.group_neighborhood || "—" },
                                { label: "Tem Mídia", value: item.has_media ? "Sim ✓" : "Não" },
                                { label: "Criado em", value: (item.target_created_at || (item as any).created_at) ? new Date(item.target_created_at || (item as any).created_at).toLocaleString("pt-BR") : "—" },
                                { label: "Claimed em", value: item.claimed_at ? new Date(item.claimed_at).toLocaleString("pt-BR") : "—" },
                            ].map((detail) => (
                                <div key={detail.label} className="p-2.5 rounded-lg bg-[#151922]/60 border border-white/[0.03]">
                                    <p className="text-[8px] font-bold text-white/20 uppercase tracking-wider">{detail.label}</p>
                                    <p className="text-[11px] font-bold text-white/55 mt-0.5">{detail.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════
// PAINEL DE STATUS DE RUNTIME DOS GRUPOS
// ═══════════════════════════════════════

function GroupRuntimePanel({ groupRuntimes, isLoading }: { groupRuntimes: GroupRuntimeView[]; isLoading: boolean }) {
    if (isLoading) {
        return (
            <Card className="border-border/30" style={{ background: "linear-gradient(135deg, #1A1F2B, #1E2233)", borderColor: "rgba(255,228,225,0.08)" }}>
                <CardContent className="p-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                    <span className="text-xs text-muted-foreground">Carregando runtime dos grupos...</span>
                </CardContent>
            </Card>
        );
    }

    if (!groupRuntimes.length) {
        return (
            <Card className="border-dashed border-2 shadow-none" style={{ background: "rgba(26,31,43,0.5)", borderColor: "rgba(255,228,225,0.08)" }}>
                <CardContent className="flex flex-col items-center py-8 text-center">
                    <Shield className="h-8 w-8 text-muted-foreground/20 mb-2" />
                    <p className="text-xs font-semibold text-muted-foreground">Nenhum grupo com runtime</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                        O runtime será criado automaticamente na primeira postagem.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const ready = groupRuntimes.filter((r) => !r.is_in_cooldown);
    const cooling = groupRuntimes.filter((r) => r.is_in_cooldown);

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <Timer className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-bold text-foreground tracking-wide">Espera (Cooldown) dos Grupos</h3>
                <div className="ml-auto flex gap-2">
                    <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-600">{ready.length} liberados</Badge>
                    <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-600">{cooling.length} em cooldown</Badge>
                </div>
            </div>

            {/* Info banner */}
            <div className="rounded-xl p-2.5 flex items-center gap-2" style={{ background: "linear-gradient(135deg, #1A1F2B, rgba(245,158,11,0.06))", border: "1px solid rgba(255,228,225,0.10)" }}>
                <Shield className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    <strong>Postar mantém seu grupo ativo</strong> e reforça seu benefício operacional. Tempo de espera (cooldown) de 6 dias após cada postagem.
                </p>
            </div>

            <div className="space-y-1.5">
                {groupRuntimes.map((rt) => (
                    <GroupCooldownChipReadonly key={rt.whatsapp_group_id} runtime={rt} />
                ))}
            </div>
        </div>
    );
}

function GroupCooldownChipReadonly({ runtime }: { runtime: GroupRuntimeView }) {
    const { remaining, isExpired } = useCountdown(runtime.is_in_cooldown ? runtime.next_allowed_at : null);
    const inCooldown = runtime.is_in_cooldown && !isExpired;

    return (
        <div
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 border"
            style={{
                background: inCooldown
                    ? "linear-gradient(135deg, #1A1F2B 0%, rgba(245,158,11,0.06) 100%)"
                    : "linear-gradient(135deg, #1A1F2B 0%, rgba(16,185,129,0.06) 100%)",
                borderColor: inCooldown
                    ? "rgba(255,228,225,0.12)"
                    : "rgba(16,185,129,0.15)",
            }}
        >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                inCooldown ? "bg-amber-500/15" : "bg-emerald-500/15"
            )}>
                {inCooldown ? <Timer className="h-4 w-4 text-amber-500" /> : <Radio className="h-4 w-4 text-emerald-500" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{runtime.group_name || "Grupo"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    {runtime.city_name && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" /> {runtime.city_name}</span>}
                    {runtime.neighborhood && <span className="text-[10px] text-muted-foreground/70">{runtime.neighborhood}</span>}
                    <span className="text-[10px] text-muted-foreground">{runtime.total_posts} posts</span>
                </div>
                {runtime.last_posted_at && (
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                        Última: {new Date(runtime.last_posted_at).toLocaleDateString("pt-BR")} às{" "}
                        {new Date(runtime.last_posted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                )}
            </div>
            {inCooldown ? (
                <div className="text-right shrink-0">
                    <Badge variant="outline" className="text-[8px] font-black border-amber-500/30 text-amber-500 bg-amber-500/10 mb-0.5">ESPERA</Badge>
                    <p className="text-[9px] font-mono font-bold text-amber-400">{remaining}</p>
                    {runtime.next_allowed_at && (
                        <p className="text-[8px] text-muted-foreground/40">
                            {new Date(runtime.next_allowed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </p>
                    )}
                </div>
            ) : (
                <Badge variant="outline" className="text-[8px] font-black border-emerald-500/30 text-emerald-500 bg-emerald-500/10 shrink-0">LIBERADO</Badge>
            )}
        </div>
    );
}

// ═══════════════════════════════════════
// HISTORY SECTION
// ═══════════════════════════════════════

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    posted: { label: "Postado", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    confirmed: { label: "Confirmado", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    success: { label: "Sucesso", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    failed: { label: "Falhou", color: "text-rose-500", bg: "bg-rose-500/10" },
    error: { label: "Erro", color: "text-rose-500", bg: "bg-rose-500/10" },
    cancelled: { label: "Cancelada", color: "text-zinc-500", bg: "bg-zinc-500/10" },
};

function HistorySection({ title, icon, data, isLoading, showOperator }: {
    title: string; icon: React.ReactNode;
    data: (PostadorHistoryViewItem | PostadorMyHistoryItem)[];
    isLoading: boolean; showOperator?: boolean;
}) {
    if (isLoading) {
        return (
            <Card className="border-border/30" style={{ background: "linear-gradient(135deg, #1A1F2B, #1E2233)", borderColor: "rgba(255,228,225,0.08)" }}>
                <CardContent className="p-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                    <span className="text-xs text-muted-foreground">Carregando histórico...</span>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                {icon}
                <h3 className="text-sm font-bold text-foreground tracking-wide">{title}</h3>
                <Badge variant="outline" className="text-[9px] ml-auto">{data.length} registros</Badge>
            </div>

            {!data.length ? (
                <Card className="border-dashed border-2 shadow-none" style={{ background: "rgba(26,31,43,0.5)", borderColor: "rgba(255,228,225,0.08)" }}>
                    <CardContent className="flex flex-col items-center py-8 text-center">
                        <MessageSquare className="h-8 w-8 text-muted-foreground/20 mb-2" />
                        <p className="text-xs font-semibold text-muted-foreground">Nenhum registro encontrado</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Postagens confirmadas aparecerão aqui.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {data.map((entry) => {
                        const badge = STATUS_BADGE[entry.final_status] || { label: entry.final_status, color: "text-zinc-400", bg: "bg-zinc-500/10" };
                        const hasOperator = showOperator && "operator_name" in entry;
                        return (
                            <Card key={entry.id} className="hover:border-border/50 transition-colors" style={{ background: "linear-gradient(145deg, #1A1F2B, rgba(255,228,225,0.03))", borderColor: "rgba(255,228,225,0.08)" }}>
                                <CardContent className="p-3 sm:p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex items-center gap-2">
                                                {entry.store_name && <span className="text-[10px] font-bold text-primary/70 flex items-center gap-1"><Store className="h-3 w-3" /> {entry.store_name}</span>}
                                                {entry.product_name && <span className="text-[10px] text-muted-foreground">• {entry.product_name}</span>}
                                            </div>
                                            <p className="text-xs font-semibold text-foreground truncate">{entry.campaign_title || "Campanha"}</p>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                                {entry.posted_at && (
                                                    <span className="flex items-center gap-1">
                                                        <CalendarDays className="h-3 w-3" />
                                                        {new Date(entry.posted_at).toLocaleDateString("pt-BR")} às{" "}
                                                        {new Date(entry.posted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                )}
                                                {hasOperator && (entry as PostadorHistoryViewItem).operator_name && (
                                                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {(entry as PostadorHistoryViewItem).operator_name}</span>
                                                )}
                                            </div>
                                            {entry.execution_notes && <p className="text-[10px] text-muted-foreground/70 italic truncate">💬 {entry.execution_notes}</p>}
                                        </div>
                                        <Badge variant="outline" className={cn("shrink-0 text-[9px] font-black", badge.color, badge.bg)}>{badge.label}</Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════
// BARRA DE KPIs DE LOTES — POSTADOR 3
// ═══════════════════════════════════════

function LotKpiBar({ kpis, isLoading }: {
    kpis: { posted_count: number; claimed_count: number; cooldown_count: number; last_posted_at: string | null; next_available_at: string | null };
    isLoading: boolean;
}) {
    const fmt = (d: string | null) => {
        if (!d) return "—";
        const dt = new Date(d);
        return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " " +
            dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    };

    const items = [
        { label: "Postados", value: kpis.posted_count, icon: <CheckCircle className="h-4 w-4" />, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
        { label: "Reservados", value: kpis.claimed_count, icon: <Shield className="h-4 w-4" />, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
        { label: "Em Espera", value: kpis.cooldown_count, icon: <Timer className="h-4 w-4" />, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
        { label: "Última Post.", value: fmt(kpis.last_posted_at), icon: <CalendarDays className="h-4 w-4" />, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20", isDate: true },
    ];

    return (
        <div className="grid grid-cols-4 gap-2">
            {items.map((item) => (
                <Card
                    key={item.label}
                    className={cn("border shadow-lg overflow-hidden relative", item.border)}
                    style={{
                        background: "linear-gradient(135deg, #1A1F2B 0%, #1E2233 50%, rgba(255,228,225,0.06) 100%)",
                        borderColor: "rgba(255,228,225,0.12)",
                        boxShadow: "0 4px 20px rgba(255,228,225,0.04), inset 0 1px 0 rgba(255,228,225,0.06)",
                    }}
                >
                    <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,228,225,0.25), transparent)" }} />
                    <CardContent className="p-3 flex flex-col items-center justify-center text-center min-h-[80px] relative z-10">
                        {isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                            <>
                                <span className={cn("mb-1", item.color)}>{item.icon}</span>
                                <p className={cn("font-black", item.isDate ? "text-[10px]" : "text-xl", "text-white/90")}>{item.value}</p>
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-0.5">{item.label}</p>
                            </>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════
// PÁGINA PRINCIPAL — POSTADOR 3 + POSTADOR 2 LEGADO
// Aba padrão: Lotes (POSTADOR 3)
// ═══════════════════════════════════════

export default function PostadorPremiumPanel() {
    const navigate = useNavigate();
    const { user } = useAuth();

    // POSTADOR 3 — Lots
    const lots = usePostadorLotes();

    // POSTADOR 2 — Legacy operational board
    const legacy = usePostadorPremium();

    const [activeTab, setActiveTab] = useState<"lotes" | "board" | "groups" | "history">("lotes");

    // POSTADOR 3 proof modal
    const [lotProofTarget, setLotProofTarget] = useState<PostingLot | null>(null);
    // POSTADOR 2 proof modal
    const [proofTarget, setProofTarget] = useState<PostadorOperacionalBoardItem | null>(null);

    const tabs = [
        { key: "lotes" as const, label: "Lotes", count: lots.availableLots.length, accent: true },
        { key: "board" as const, label: "Board", count: legacy.operationalBoard.length },
        { key: "groups" as const, label: "Grupos", count: legacy.groupRuntimes.length },
        { key: "history" as const, label: "Histórico", count: legacy.historyMine.length },
    ];

    const handleRefresh = () => {
        lots.refetchAll();
        legacy.refetchAll();
    };

    return (
        <MotoboyPageTemplate
            title="Postador TX8"
            subtitle="Fortaleça as lojas locais da sua região com campanhas territoriais"
            icon={Zap}
            headerRight={
                <div className="flex items-center gap-2">
                    <Button onClick={handleRefresh} size="sm" variant="outline" className="border-primary/20 text-primary/80">
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button onClick={() => navigate("/motoboy/grupos")} size="sm" variant="outline" className="border-motoboy text-motoboy">
                        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Grupos
                    </Button>
                </div>
            }
        >
            <SafeErrorBoundary>
                <div className="space-y-4 pb-16">

                    {/* ── KPI BAR (POSTADOR 3) ── */}
                    {activeTab === "lotes" ? (
                        <LotKpiBar kpis={lots.kpis} isLoading={lots.loadingKpis} />
                    ) : (
                        <KpiBar kpis={legacy.kpis} operatorKpis={legacy.operatorKpis} isLoading={legacy.loadingKpis || legacy.loadingOperatorKpis} />
                    )}

                    {/* ── COMMISSION ELIGIBILITY BANNER ── */}
                    <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg, #1A1F2B, rgba(16,185,129,0.06))", border: "1px solid rgba(255,228,225,0.10)" }}>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                            <TrendingUp className="h-4 w-4 text-emerald-500" />
                        </div>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                            <strong>Comissão depende de atividade real.</strong> Confirme suas postagens para manter a elegibilidade. Grupo sem postagem confirmada não gera benefício.
                        </p>
                    </div>

                    {/* ── TABS ── */}
                    <div className="flex gap-1 rounded-lg p-1" style={{ background: "rgba(26,31,43,0.8)", border: "1px solid rgba(255,228,225,0.06)" }}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    "flex-1 text-xs font-bold py-2 px-2 rounded-md transition-all flex items-center justify-center gap-1",
                                    activeTab === tab.key
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:text-foreground/70"
                                )}
                            >
                                {tab.label}
                                {tab.count > 0 && (
                                    <span className={cn(
                                        "text-[9px] font-black px-1.5 py-0.5 rounded-full",
                                        activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                    )}>{tab.count}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── ERROR ── */}
                    {(lots.hasError || legacy.hasError) && (
                        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
                            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-rose-600 dark:text-rose-400">Erro ao carregar dados</p>
                                <p className="text-xs text-rose-500/70">Verifique sua conexão e tente novamente.</p>
                            </div>
                            <Button onClick={handleRefresh} size="sm" variant="outline" className="ml-auto shrink-0">
                                <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
                            </Button>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════ */}
                    {/* TAB: LOTES (POSTADOR 3) — DEFAULT     */}
                    {/* ═══════════════════════════════════════ */}
                    {activeTab === "lotes" && (
                        <div className="space-y-6">
                            {/* Lotes Disponíveis */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                    <Package className="h-5 w-5 text-emerald-500" />
                                    <h3 className="text-sm font-bold text-foreground tracking-wide">Lotes Disponíveis</h3>
                                    <Badge variant="outline" className="text-[9px] ml-auto border-emerald-500/30 text-emerald-600">
                                        {lots.availableLots.length} lotes
                                    </Badge>
                                </div>

                                {lots.loadingAvailable ? (
                                    <PostadorLotSkeleton />
                                ) : !lots.availableLots.length ? (
                                    <Card className="border-dashed border-2 shadow-none" style={{ background: "rgba(26,31,43,0.5)", borderColor: "rgba(255,228,225,0.08)" }}>
                                        <CardContent className="flex flex-col items-center py-10 text-center">
                                            <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
                                                <Sparkles className="h-7 w-7 text-violet-500/40" />
                                            </div>
                                            <p className="text-sm font-bold text-muted-foreground">Nenhum lote disponível</p>
                                            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                                                Lotes aparecem quando lojas cadastram produtos. Volte em breve!
                                            </p>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="space-y-4">
                                        {lots.availableLots.map((lot) => (
                                            <PostadorLotCard
                                                key={lot.lot_id}
                                                lot={lot}
                                                actionState={lots.actionState}
                                                onClaim={(id) => lots.claimLot(id)}
                                                onOpenProof={(l) => setLotProofTarget(l)}
                                                userId={user?.id}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Lotes em Espera (Cooldown) */}
                            {lots.cooldownLots.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1">
                                        <Timer className="h-5 w-5 text-amber-500" />
                                        <h3 className="text-sm font-bold text-foreground tracking-wide">Em Espera</h3>
                                        <Badge variant="outline" className="text-[9px] ml-auto border-amber-500/30 text-amber-600">
                                            {lots.cooldownLots.length} lotes
                                        </Badge>
                                    </div>
                                    <div className="space-y-3">
                                        {lots.cooldownLots.map((lot) => (
                                            <PostadorLotCard
                                                key={lot.lot_id}
                                                lot={lot}
                                                actionState={lots.actionState}
                                                onClaim={() => {}}
                                                onOpenProof={() => {}}
                                                userId={user?.id}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Histórico de Lotes Postados */}
                            {lots.historyLots.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1">
                                        <Trophy className="h-5 w-5 text-violet-500" />
                                        <h3 className="text-sm font-bold text-foreground tracking-wide">Meus Lotes Postados</h3>
                                        <Badge variant="outline" className="text-[9px] ml-auto border-violet-500/30 text-violet-600">
                                            {lots.historyLots.length} lotes
                                        </Badge>
                                    </div>
                                    <div className="space-y-3">
                                        {lots.historyLots.map((lot) => (
                                            <PostadorLotCard
                                                key={lot.lot_id}
                                                lot={lot}
                                                actionState={lots.actionState}
                                                onClaim={() => {}}
                                                onOpenProof={() => {}}
                                                userId={user?.id}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══════════════════════════════════════ */}
                    {/* TAB: BOARD OPERACIONAL (POSTADOR 2)    */}
                    {/* ═══════════════════════════════════════ */}
                    {activeTab === "board" && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1">
                                <Target className="h-5 w-5 text-emerald-500" />
                                <h3 className="text-sm font-bold text-foreground tracking-wide">Board Operacional</h3>
                                <Badge variant="outline" className="text-[9px] ml-auto border-emerald-500/30 text-emerald-600">{legacy.operationalBoard.length} targets</Badge>
                            </div>

                            {legacy.loadingBoard ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <Card key={i} className="border-border/20" style={{ background: "linear-gradient(135deg, #1A1F2B, #1E2233)", borderColor: "rgba(255,228,225,0.06)" }}>
                                            <CardContent className="p-4">
                                                <div className="animate-pulse space-y-3">
                                                    <div className="h-3 bg-muted rounded w-1/3" />
                                                    <div className="h-4 bg-muted rounded w-2/3" />
                                                    <div className="h-3 bg-muted rounded w-1/2" />
                                                    <div className="h-8 bg-muted rounded w-full" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : !legacy.operationalBoard.length ? (
                                <Card className="border-dashed border-2 shadow-none" style={{ background: "rgba(26,31,43,0.5)", borderColor: "rgba(255,228,225,0.08)" }}>
                                    <CardContent className="flex flex-col items-center py-10 text-center">
                                        <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
                                            <CheckCircle className="h-7 w-7 text-emerald-500/40" />
                                        </div>
                                        <p className="text-sm font-bold text-muted-foreground">Nenhum target disponível</p>
                                        <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                                            Todos os targets foram processados. Novos targets aparecerão automaticamente quando campanhas forem criadas.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="space-y-3">
                                    {legacy.operationalBoard.map((item) => (
                                        <OperationalBoardCard
                                            key={item.target_id}
                                            item={item}
                                            actionState={legacy.actionState}
                                            onOpenProof={(boardItem) => setProofTarget(boardItem)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TAB: GROUPS RUNTIME ── */}
                    {activeTab === "groups" && (
                        <GroupRuntimePanel groupRuntimes={legacy.groupRuntimes} isLoading={legacy.loadingRuntimes} />
                    )}

                    {/* ── TAB: HISTÓRICO ── */}
                    {activeTab === "history" && (
                        <HistorySection
                            title="Minhas Postagens"
                            icon={<User className="h-5 w-5 text-violet-500" />}
                            data={legacy.historyMine} isLoading={legacy.loadingMyHistory} />
                    )}

                </div>
            </SafeErrorBoundary>

            {/* ── POSTADOR 3 — LOT PROOF MODAL ── */}
            {lotProofTarget && (
                <PostadorLotProofModal
                    open={!!lotProofTarget}
                    onClose={() => setLotProofTarget(null)}
                    lot={lotProofTarget}
                    actionState={lots.actionState}
                    onConfirm={lots.confirmLot}
                />
            )}

            {/* ── POSTADOR 2 — LEGACY PROOF MODAL ── */}
            {proofTarget && (
                <PostadorProofModal
                    open={!!proofTarget}
                    onClose={() => setProofTarget(null)}
                    boardItem={proofTarget}
                    groupRuntimes={legacy.groupRuntimes}
                    actionState={legacy.actionState}
                    onConfirm={legacy.confirmPosting}
                />
            )}
        </MotoboyPageTemplate>
    );
}
