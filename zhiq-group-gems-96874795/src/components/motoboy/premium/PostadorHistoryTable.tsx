import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertTriangle, Hash, Camera, Link as LinkIcon, FileText, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostingHistoryEntry } from "@/types/postador";

// ═══════════════════════════════════════
// STATUS CONFIG
// ═══════════════════════════════════════
const FINAL_STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    posted: { label: "Postado", color: "text-emerald-600", bg: "bg-emerald-500/10", icon: <CheckCircle className="h-3 w-3" /> },
    confirmed: { label: "Confirmado", color: "text-emerald-600", bg: "bg-emerald-500/10", icon: <CheckCircle className="h-3 w-3" /> },
    failed: { label: "Falhou", color: "text-rose-600", bg: "bg-rose-500/10", icon: <XCircle className="h-3 w-3" /> },
    error: { label: "Erro", color: "text-rose-600", bg: "bg-rose-500/10", icon: <XCircle className="h-3 w-3" /> },
    blocked: { label: "Bloqueado", color: "text-amber-600", bg: "bg-amber-500/10", icon: <AlertTriangle className="h-3 w-3" /> },
    cooldown: { label: "Cooldown", color: "text-amber-600", bg: "bg-amber-500/10", icon: <Clock className="h-3 w-3" /> },
};

function getStatusCfg(status: string) {
    return FINAL_STATUS_CFG[status] || { label: status, color: "text-muted-foreground", bg: "bg-muted/30", icon: <Clock className="h-3 w-3" /> };
}

// Proof type badge configuration
const PROOF_TYPE_CFG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
    file: { label: "📷", icon: <Camera className="h-2.5 w-2.5" />, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    link: { label: "🔗", icon: <LinkIcon className="h-2.5 w-2.5" />, color: "text-sky-600", bg: "bg-sky-500/10" },
    text: { label: "📝", icon: <FileText className="h-2.5 w-2.5" />, color: "text-violet-600", bg: "bg-violet-500/10" },
};

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════
interface PostadorHistoryTableProps {
    history: PostingHistoryEntry[];
    isLoading: boolean;
}

export default function PostadorHistoryTable({ history, isLoading }: PostadorHistoryTableProps) {
    if (isLoading) {
        return (
            <div className="rounded-2xl border border-foreground/[0.06] p-8 flex justify-center" style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F6 100%)",
            }}>
                <div className="flex items-center gap-2 text-muted-foreground/50">
                    <Clock className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">Carregando histórico...</span>
                </div>
            </div>
        );
    }

    if (!history.length) {
        return (
            <div className="rounded-2xl border border-dashed border-foreground/[0.08] p-8 text-center" style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F6 100%)",
            }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-foreground/[0.06]" style={{
                    background: "rgba(255,228,225,0.25)",
                }}>
                    <Clock className="h-6 w-6 text-muted-foreground/25" />
                </div>
                <p className="text-xs font-bold text-muted-foreground">Nenhum registro ainda</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[220px] mx-auto">
                    Suas postagens confirmadas aparecerão aqui automaticamente.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-foreground/[0.06] overflow-hidden" style={{
            background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F6 100%)",
        }}>
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 px-4 py-2.5 border-b border-foreground/[0.05]" style={{
                background: "rgba(255,228,225,0.15)",
            }}>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Data</p>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Mensagem</p>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Prova</p>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Hash</p>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.15em]">Status</p>
            </div>

            {/* Rows */}
            <div className="divide-y divide-foreground/[0.04]">
                {history.map((entry) => {
                    const cfg = getStatusCfg(entry.final_status);
                    const proofCfg = entry.proof_type && entry.proof_type !== "none"
                        ? PROOF_TYPE_CFG[entry.proof_type] || null
                        : null;
                    const hasProof = !!proofCfg;
                    const proofIsViewable = !!(entry.proof_url);

                    return (
                        <div
                            key={entry.id}
                            className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 px-4 py-3 items-center hover:bg-foreground/[0.02] transition-colors"
                        >
                            {/* Date */}
                            <div>
                                <p className="text-[11px] font-bold text-foreground/60">
                                    {entry.posted_at ? new Date(entry.posted_at).toLocaleDateString("pt-BR") : "—"}
                                </p>
                                <p className="text-[9px] text-muted-foreground/50">
                                    {entry.posted_at ? new Date(entry.posted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                                </p>
                            </div>

                            {/* Message text */}
                            <p className="text-[10px] text-muted-foreground truncate">
                                {entry.message_text || "—"}
                            </p>

                            {/* Proof indicator */}
                            <div className="flex items-center justify-center min-w-[36px]">
                                {hasProof ? (
                                    proofIsViewable ? (
                                        <a
                                            href={entry.proof_url!}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={cn(
                                                "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-colors hover:opacity-80",
                                                proofCfg!.bg, proofCfg!.color,
                                            )}
                                            title={`Ver prova (${entry.proof_type})`}
                                        >
                                            {proofCfg!.icon}
                                            <ExternalLink className="h-2 w-2" />
                                        </a>
                                    ) : (
                                        <span className={cn(
                                            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold",
                                            proofCfg!.bg, proofCfg!.color,
                                        )} title={`Prova: ${entry.proof_type}`}>
                                            {proofCfg!.icon}
                                        </span>
                                    )
                                ) : (
                                    <span className="text-[9px] text-muted-foreground/30">—</span>
                                )}
                            </div>

                            {/* Template hash */}
                            <span className="text-[9px] text-muted-foreground/40 font-mono flex items-center gap-0.5">
                                {entry.template_hash ? (
                                    <><Hash className="h-2.5 w-2.5" />{entry.template_hash.substring(0, 6)}</>
                                ) : "—"}
                            </span>

                            {/* Status */}
                            <span className={cn(
                                "inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                                cfg.bg, cfg.color,
                            )}>
                                {cfg.icon} {cfg.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
