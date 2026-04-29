import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
    ChevronDown, ChevronUp, MapPin, Clock, CheckCircle,
    Users, Megaphone, Copy, Eye, Hash, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
    LojistaCampaign, LojistaPostingEntry, CampaignStats, CampaignVisualStatus,
} from "@/hooks/useLojistaCampaigns";
import { CAMPAIGN_STATUS_CONFIG } from "@/hooks/useLojistaCampaigns";

// ═══════════════════════════════════════
// STATUS BADGE for posting history
// ═══════════════════════════════════════
const POST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
    posted: { label: "Postado", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    confirmed: { label: "Confirmado", color: "text-emerald-400", bg: "bg-emerald-500/10" },
    failed: { label: "Falhou", color: "text-rose-400", bg: "bg-rose-500/10" },
    error: { label: "Erro", color: "text-rose-400", bg: "bg-rose-500/10" },
    blocked: { label: "Bloqueado", color: "text-amber-400", bg: "bg-amber-500/10" },
};

function getPostStatus(status: string) {
    return POST_STATUS[status] || { label: status, color: "text-zinc-400", bg: "bg-zinc-500/10" };
}

// ═══════════════════════════════════════
// PROPS
// ═══════════════════════════════════════
interface LojistaCampaignCardProps {
    campaign: LojistaCampaign;
    stats: CampaignStats;
    visualStatus: CampaignVisualStatus;
    postings: LojistaPostingEntry[];
    isExpanded: boolean;
    onToggle: () => void;
    onDelete?: (id: string) => void;
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════
export default function LojistaCampaignCard({
    campaign, stats, visualStatus, postings, isExpanded, onToggle, onDelete,
}: LojistaCampaignCardProps) {
    const statusCfg = CAMPAIGN_STATUS_CONFIG[visualStatus];
    const hasPosts = stats.totalPosts > 0;

    return (
        <div className={cn(
            "rounded-2xl border overflow-hidden transition-all duration-300",
            "bg-white shadow-sm",
            isExpanded ? "border-gray-200 shadow-md" : "border-gray-100 hover:border-gray-200",
        )}>
            {/* Top accent */}
            <div className={cn(
                "h-[2px] bg-gradient-to-r from-transparent to-transparent",
                visualStatus === "active" ? "via-emerald-500/30" :
                    visualStatus === "queued" ? "via-amber-500/30" :
                        visualStatus === "expired" ? "via-rose-500/20" : "via-white/[0.06]"
            )} />

            {/* ── Header (clickable) ── */}
            <button
                onClick={onToggle}
                className="w-full p-4 flex items-start gap-3 text-left group transition-colors hover:bg-white/[0.02]"
            >
                {/* Icon */}
                <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                    isExpanded ? "bg-orange-500/15" : "bg-white/[0.04]",
                )}>
                    <Megaphone className={cn("h-5 w-5", isExpanded ? "text-orange-400" : "text-white/30")} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[13px] text-white/90 line-clamp-1 tracking-tight">
                        {campaign.title || "Campanha"}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {campaign.target_city && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-white/30 font-medium">
                                <MapPin className="h-3 w-3 text-white/20" /> {campaign.target_city}
                                {campaign.target_region && ` · ${campaign.target_region}`}
                            </span>
                        )}
                        {campaign.campaign_type && (
                            <Badge className="bg-violet-500/10 text-violet-400/70 border-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0 h-4">
                                {campaign.campaign_type}
                            </Badge>
                        )}
                        <span className="text-[10px] text-white/20">
                            {new Date(campaign.created_at).toLocaleDateString("pt-BR")}
                        </span>
                    </div>
                </div>

                {/* Right: Status + Stats */}
                <div className="flex items-center gap-2 shrink-0">
                    {hasPosts ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400/80 bg-emerald-500/[0.08] px-2 py-1 rounded-lg border border-emerald-500/10">
                            <CheckCircle className="h-3 w-3" /> {stats.totalPosts}
                        </span>
                    ) : (
                        <span className="text-[10px] text-white/20 font-medium">
                            sem postagens
                        </span>
                    )}

                    <span className={cn(
                        "inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider",
                        "px-2 py-1.5 rounded-lg border",
                        statusCfg.bg, statusCfg.color, statusCfg.borderColor,
                    )}>
                        {statusCfg.label}
                    </span>

                    {isExpanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/15" />}
                </div>
            </button>

            {/* ── Expanded Content ── */}
            {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
                    {/* Message Preview */}
                    {campaign.message_text && (
                        <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <p className="text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                                {campaign.message_text}
                            </p>
                            <button
                                className="mt-2 inline-flex items-center gap-1 text-[10px] text-sky-400/70 hover:text-sky-300 font-bold transition-colors"
                                onClick={() => {
                                    navigator.clipboard.writeText(campaign.message_text || "");
                                    toast.success("Texto copiado!");
                                }}
                            >
                                <Copy className="h-3 w-3" /> Copiar texto
                            </button>
                        </div>
                    )}

                    {/* Media */}
                    {campaign.media_url && (
                        <div className="rounded-xl overflow-hidden border border-white/[0.05] bg-[#151922]">
                            <img
                                src={campaign.media_url}
                                alt="Mídia da campanha"
                                className="w-full max-h-36 object-cover"
                                loading="lazy"
                            />
                        </div>
                    )}

                    {/* Stats Bar */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: "Postagens", value: stats.totalPosts.toString(), icon: <CheckCircle className="h-3 w-3 text-emerald-400/50" /> },
                            { label: "Grupos", value: stats.uniqueGroups.toString(), icon: <Users className="h-3 w-3 text-sky-400/50" /> },
                            { label: "Última", value: stats.lastPostedAt ? new Date(stats.lastPostedAt).toLocaleDateString("pt-BR") : "—", icon: <Clock className="h-3 w-3 text-amber-400/50" /> },
                        ].map(s => (
                            <div key={s.label} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-center">
                                <div className="flex items-center justify-center gap-1 mb-0.5">{s.icon}</div>
                                <p className="text-[13px] font-black text-white/70">{s.value}</p>
                                <p className="text-[8px] font-bold text-white/20 uppercase tracking-wider">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Posting History */}
                    <div>
                        <p className="text-[9px] font-black text-white/25 uppercase tracking-[0.2em] mb-2">
                            Histórico de Divulgação
                        </p>
                        {postings.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center bg-gray-50">
                                <Clock className="h-5 w-5 text-white/15 mx-auto mb-2" />
                                <p className="text-[10px] text-white/25 font-medium">
                                    Ainda sem postagens registradas para esta campanha.
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
                                {/* Header */}
                                <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 bg-white/[0.02] border-b border-white/[0.04]">
                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-wider">Data</p>
                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-wider">Grupo</p>
                                    <p className="text-[8px] font-black text-white/20 uppercase tracking-wider">Status</p>
                                </div>
                                {/* Rows */}
                                <div className="divide-y divide-white/[0.03] max-h-48 overflow-y-auto">
                                    {postings.slice(0, 20).map(entry => {
                                        const pCfg = getPostStatus(entry.final_status);
                                        return (
                                            <div key={entry.id} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2.5 items-center hover:bg-white/[0.02] transition-colors">
                                                <div>
                                                    <p className="text-[11px] font-bold text-white/50">
                                                        {entry.posted_at ? new Date(entry.posted_at).toLocaleDateString("pt-BR") : "—"}
                                                    </p>
                                                    <p className="text-[9px] text-white/20">
                                                        {entry.posted_at ? new Date(entry.posted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                                                    </p>
                                                </div>
                                                <span className="text-[9px] text-white/25 font-mono">
                                                    {entry.whatsapp_group_id?.substring(0, 8) || "—"}…
                                                </span>
                                                <span className={cn(
                                                    "inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                                                    pCfg.bg, pCfg.color,
                                                )}>
                                                    {pCfg.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Excluir */}
                    {onDelete && (
                        <div className="pt-2 border-t border-white/[0.04]">
                            <button
                                onClick={() => {
                                    if (confirm(`Excluir "${campaign.title}" definitivamente? Essa ação não pode ser desfeita.`)) {
                                        onDelete(campaign.id);
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold text-rose-400/80 bg-rose-500/[0.06] border border-rose-500/10 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Excluir definitivamente
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
