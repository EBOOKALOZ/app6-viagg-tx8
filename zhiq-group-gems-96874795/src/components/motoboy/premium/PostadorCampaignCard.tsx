import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Clock, CheckCircle, AlertTriangle,
    Copy, ChevronDown, Loader2, Timer, Send,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type {
    CampaignQueueItem,
    WhatsAppGroupItem,
    GroupRuntime,
    GroupPostingStatus,
} from "@/types/postador";
import WhatsAppPreviewModal from "@/components/postador/WhatsAppPreviewModal";

// ═══════════════════════════════════════
// STATUS CONFIGS
// ═══════════════════════════════════════
const STATUS_MAP: Record<GroupPostingStatus, {
    label: string; color: string; icon: typeof CheckCircle; badgeBg: string; badgeText: string;
}> = {
    eligible: {
        label: "Elegível", color: "text-emerald-600", icon: CheckCircle,
        badgeBg: "bg-emerald-500/10", badgeText: "text-emerald-600",
    },
    cooldown: {
        label: "Em Cooldown", color: "text-amber-600", icon: Clock,
        badgeBg: "bg-amber-500/10", badgeText: "text-amber-600",
    },
    posted: {
        label: "Postado", color: "text-sky-600", icon: CheckCircle,
        badgeBg: "bg-sky-500/10", badgeText: "text-sky-600",
    },
    inactive: {
        label: "Inativo", color: "text-rose-600", icon: AlertTriangle,
        badgeBg: "bg-rose-500/10", badgeText: "text-rose-600",
    },
    invalid: {
        label: "Inválido", color: "text-rose-600", icon: AlertTriangle,
        badgeBg: "bg-rose-500/10", badgeText: "text-rose-600",
    },
};

// ═══════════════════════════════════════
// COOLDOWN COUNTDOWN
// ═══════════════════════════════════════
function CooldownCountdown({ until }: { until: string }) {
    const [label, setLabel] = useState("…");
    useState(() => {
        const update = () => {
            const diff = new Date(until).getTime() - Date.now();
            if (diff <= 0) { setLabel("Liberado"); return; }
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            setLabel(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
        };
        update();
        const iv = setInterval(update, 1000);
        return () => clearInterval(iv);
    });
    return (
        <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{
            background: "linear-gradient(135deg, #FFF5F3, #FFE4E1)",
            border: "1px solid rgba(255,180,165,0.30)",
        }}>
            <Timer className="h-3.5 w-3.5 text-amber-500" />
            <div>
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Próxima liberação em</p>
                <p className="text-sm font-black text-amber-700">{label}</p>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
type PostadorCampaignCardProps = {
    campaign: CampaignQueueItem;
    group: WhatsAppGroupItem;
    runtime?: GroupRuntime;
    groupStatus: GroupPostingStatus;
    postingState?: "loading" | "success" | "error" | null;
    onMarkAsPosted: (campaignId: string, groupId: string, templateHash?: string | null, notes?: string | null) => void;
};

export default function PostadorCampaignCard({
    campaign, group, runtime, groupStatus, postingState, onMarkAsPosted,
}: PostadorCampaignCardProps) {
    const [showDetails, setShowDetails] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const statusCfg = STATUS_MAP[groupStatus] ?? STATUS_MAP.inactive;
    const StatusIcon = statusCfg.icon;

    const copyText = () => {
        const text = campaign.message_text;
        if (text) { navigator.clipboard.writeText(text); toast.success("Texto copiado!"); }
    };

    /** Monta a mensagem completa que vai pro WhatsApp */
    const shareUrl = `https://broifhfqmnzqoongtokm.supabase.co/functions/v1/campaign-share?id=${campaign.id}`;
    const waText = [
        campaign.message_text ?? "",
        "",
        `🔗 ${shareUrl}`,
        "",
        "─────────────────────",
        "📢 Quer anunciar seu produto aqui?",
        "👉 https://zhiq-group-gems-96874795.lovable.app/anunciante/meus-anuncios",
    ].join("\n");

    /** Abre WhatsApp e registra a postagem (chamado após confirmação no preview) */
    const handlePostWhatsApp = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank", "noopener,noreferrer");
        onMarkAsPosted(campaign.id, group.id);
        toast.success("WhatsApp aberto! Selecione o grupo e envie.", { duration: 4000 });
    };

    const canPost = groupStatus === "eligible" && !postingState && postingState !== "success";

    return (
        <>
        <div className={cn(
            "relative rounded-2xl border overflow-hidden transition-all duration-300",
            "hover:shadow-lg",
            postingState === "success" && "ring-1 ring-emerald-500/25 shadow-emerald-500/[0.05]",
        )} style={{
            background: "linear-gradient(145deg, #FFFFFF 0%, #FFF8F6 60%, #FFE4E1 100%)",
            borderColor: "rgba(255,200,190,0.35)",
            boxShadow: "0 4px 20px rgba(255,228,225,0.15)",
        }}>
            {/* Top warm accent line */}
            <div className="absolute top-0 left-4 right-4 h-[2px]" style={{
                background: groupStatus === "eligible"
                    ? "linear-gradient(90deg, transparent, rgba(16,185,129,0.4), rgba(255,180,165,0.40), transparent)"
                    : groupStatus === "cooldown"
                        ? "linear-gradient(90deg, transparent, rgba(245,158,11,0.4), rgba(255,180,165,0.30), transparent)"
                        : "linear-gradient(90deg, transparent, rgba(255,180,165,0.50), transparent)",
            }} />

            <div className="p-4 space-y-3">
                {/* Row 1: Campaign Header + Status */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <h4 className="font-black text-[13px] text-foreground/90 line-clamp-1 tracking-tight leading-tight">
                            {campaign.title || "Campanha"}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                            {group.city_name && (
                                <span className="text-[10px] text-muted-foreground font-medium">
                                    📍 {group.city_name}{group.state_code ? ` · ${group.state_code}` : ""}
                                </span>
                            )}
                            {campaign.campaign_type && (
                                <Badge className="bg-violet-500/10 text-violet-600 border-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0 h-4">
                                    {campaign.campaign_type}
                                </Badge>
                            )}
                        </div>
                    </div>
                    <Badge className={cn("flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-lg border-0", statusCfg.badgeBg, statusCfg.badgeText)}>
                        <StatusIcon className="h-3 w-3" /> {statusCfg.label}
                    </Badge>
                </div>

                {/* Row 2: Media */}
                {campaign.media_url && (
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,200,190,0.25)" }}>
                        <img
                            src={campaign.media_url}
                            alt="Mídia da campanha"
                            className="w-full max-h-40 object-cover"
                        />
                    </div>
                )}

                {/* Row 3: Message Text */}
                {campaign.message_text && (
                    <div className="p-3 rounded-xl text-[12px] text-foreground/60 leading-relaxed whitespace-pre-wrap break-words max-h-28 overflow-y-auto" style={{
                        background: "rgba(255,245,243,0.6)",
                        border: "1px solid rgba(255,200,190,0.20)",
                    }}>
                        {campaign.message_text}
                    </div>
                )}

                {/* Row 4: Group Info Bar */}
                <div className="flex items-center gap-2.5 p-3 rounded-xl" style={{
                    background: "rgba(255,245,243,0.5)",
                    border: "1px solid rgba(255,200,190,0.20)",
                }}>
                    <div className={cn("w-1.5 h-9 rounded-full shrink-0",
                        groupStatus === "eligible" ? "bg-emerald-500" :
                            groupStatus === "cooldown" ? "bg-amber-500" :
                                groupStatus === "posted" ? "bg-sky-500" : "bg-zinc-400"
                    )} />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground/75 truncate">{group.group_name || "Grupo"}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                            {group.neighborhood || "—"}
                            {group.members_count ? ` · 👥 ${group.members_count}` : ""}
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        {runtime && runtime.total_posts > 0 && (
                            <p className="text-[10px] text-muted-foreground font-bold">{runtime.total_posts} posts</p>
                        )}
                    </div>
                </div>

                {/* Row 5: Cooldown */}
                {groupStatus === "cooldown" && runtime?.cooldown_until && (
                    <CooldownCountdown until={runtime.cooldown_until} />
                )}

                {/* Row 6: Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                    {/* Copy Text */}
                    {campaign.message_text && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={copyText}
                            className="flex-1 text-[11px] font-bold h-10 gap-1.5 border-foreground/[0.08] text-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.04] hover:border-foreground/[0.12] rounded-xl transition-all duration-200"
                        >
                            <Copy className="h-3 w-3" /> Copiar
                        </Button>
                    )}

                    {/* Postar no WhatsApp */}
                    {canPost ? (
                        <Button
                            size="sm"
                            className={cn(
                                "flex-[2] text-[11px] font-black h-10 gap-1.5 rounded-xl transition-all duration-200",
                                "text-white",
                            )}
                            style={{ background: "linear-gradient(135deg, #25D366, #128C7E)" }}
                            onClick={() => setShowPreview(true)}
                            disabled={postingState === "loading"}
                        >
                            {postingState === "loading" ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirmando…</>
                            ) : (
                                <><Send className="h-3.5 w-3.5" /> Postar no WhatsApp</>
                            )}
                        </Button>

                    ) : (
                        <div className={cn("flex-[2] flex items-center justify-center h-10 rounded-xl text-[11px] font-bold",
                            postingState === "success"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : postingState === "loading"
                                    ? "bg-foreground/[0.04] text-muted-foreground cursor-wait"
                                    : "bg-foreground/[0.03] text-muted-foreground/60 cursor-not-allowed border border-foreground/[0.04]",
                        )}>
                            {postingState === "success" ? (
                                <><CheckCircle className="h-3.5 w-3.5 mr-1" /> Postagem registrada ✓</>
                            ) : postingState === "loading" ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Processando…</>
                            ) : groupStatus === "cooldown" ? (
                                <><Clock className="h-3.5 w-3.5 mr-1" /> Aguarde {runtime?.next_allowed_at ? new Date(runtime.next_allowed_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "..."}</>
                            ) : (
                                "Indisponível"
                            )}
                        </div>
                    )}
                </div>

                {/* Row 7: Details Toggle */}
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold hover:text-foreground/60 transition-colors w-full justify-center pt-1"
                >
                    <ChevronDown className={cn("h-3 w-3 transition-transform", showDetails && "rotate-180")} />
                    {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
                </button>

                {/* Row 8: Expanded Details */}
                {showDetails && (
                    <div className="space-y-2.5 pt-2 border-t border-foreground/[0.04] animate-in slide-in-from-top-2 duration-200">
                        {/* Group Details */}
                        <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-wider">Detalhes do Grupo</p>
                        <div className="grid grid-cols-3 gap-1.5">
                            {[
                                { label: "Membros", value: group.members_count?.toString() || "—" },
                                { label: "Bairro", value: group.neighborhood || "—" },
                                { label: "Cidade", value: group.city_name || "—" },
                                { label: "Status", value: group.validation_status || "—" },
                                { label: "Comissão", value: group.valid_for_commission ? "Sim ✓" : "Não" },
                            ].map((item) => (
                                <div key={item.label} className="p-2.5 rounded-lg" style={{
                                    background: "rgba(255,245,243,0.5)",
                                    border: "1px solid rgba(255,200,190,0.15)",
                                }}>
                                    <p className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider">{item.label}</p>
                                    <p className="text-[11px] font-bold text-foreground/60 mt-0.5">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Runtime Details (if available) */}
                        {runtime && (
                            <>
                                <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-wider mt-3">Runtime do Grupo</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {[
                                        { label: "Último Post", value: runtime.last_posted_at ? new Date(runtime.last_posted_at).toLocaleString("pt-BR") : "Nunca" },
                                        { label: "Próx. Liberação", value: runtime.next_allowed_at ? new Date(runtime.next_allowed_at).toLocaleString("pt-BR") : "Agora" },
                                        { label: "Total Posts", value: runtime.total_posts?.toString() || "0" },
                                    ].map((item) => (
                                        <div key={item.label} className="p-2.5 rounded-lg" style={{
                                            background: "rgba(255,245,243,0.5)",
                                            border: "1px solid rgba(255,200,190,0.15)",
                                        }}>
                                            <p className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider">{item.label}</p>
                                            <p className="text-[11px] font-bold text-foreground/60 mt-0.5">{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Modal de pré-visualização WhatsApp */}
        <WhatsAppPreviewModal
            open={showPreview}
            onClose={() => setShowPreview(false)}
            onConfirm={handlePostWhatsApp}
            messageText={waText}
            imageUrl={campaign.media_url}
            ogTitle={campaign.title ?? undefined}
            ogDesc={campaign.message_text?.slice(0, 120) ?? undefined}
        />
        </>
    );
}
