import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    Clock, CheckCircle, XCircle, AlertTriangle,
    Store, CalendarDays, User, MessageSquare, Camera, Link,
} from "lucide-react";
import type { PostadorHistoryViewItem, PostadorMyHistoryItem } from "@/types/postador";

// ═══════════════════════════════════════
// POSTADOR HISTORY DRAWER
// Slide-in history panel — premium dark
// ═══════════════════════════════════════

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    posted: { label: "Postado", color: "text-emerald-400", bg: "bg-emerald-500/12", icon: <CheckCircle className="h-3 w-3" /> },
    confirmed: { label: "Confirmado", color: "text-emerald-400", bg: "bg-emerald-500/12", icon: <CheckCircle className="h-3 w-3" /> },
    success: { label: "Sucesso", color: "text-emerald-400", bg: "bg-emerald-500/12", icon: <CheckCircle className="h-3 w-3" /> },
    failed: { label: "Falhou", color: "text-rose-400", bg: "bg-rose-500/12", icon: <XCircle className="h-3 w-3" /> },
    error: { label: "Erro", color: "text-rose-400", bg: "bg-rose-500/12", icon: <XCircle className="h-3 w-3" /> },
    cancelled: { label: "Cancelada", color: "text-zinc-400", bg: "bg-zinc-500/12", icon: <XCircle className="h-3 w-3" /> },
};

function getCfg(status: string) {
    return STATUS_CFG[status] || { label: status, color: "text-zinc-400", bg: "bg-zinc-500/12", icon: <Clock className="h-3 w-3" /> };
}

interface PostadorHistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    data: (PostadorHistoryViewItem | PostadorMyHistoryItem)[];
    isLoading: boolean;
    showOperator?: boolean;
}

export default function PostadorHistoryDrawer({
    open, onClose, title, data, isLoading, showOperator,
}: PostadorHistoryDrawerProps) {
    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-md bg-[#111318] border-l border-white/[0.06] p-0 overflow-hidden"
            >
                {/* Header */}
                <SheetHeader className="p-5 pb-4 border-b border-white/[0.06]">
                    <SheetTitle className="flex items-center gap-2 text-sm font-black text-white/80">
                        <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/15">
                            <CalendarDays className="h-3.5 w-3.5 text-sky-400" />
                        </div>
                        {title}
                        <Badge className="ml-auto bg-white/[0.04] text-white/30 border-white/[0.06] text-[9px] font-black">
                            {data.length}
                        </Badge>
                    </SheetTitle>
                </SheetHeader>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[calc(100vh-80px)]">
                    {isLoading ? (
                        <div className="flex justify-center py-16">
                            <div className="text-center space-y-3">
                                <Clock className="h-5 w-5 animate-spin text-white/20 mx-auto" />
                                <p className="text-[10px] text-white/25 font-bold">Carregando histórico...</p>
                            </div>
                        </div>
                    ) : data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                                <MessageSquare className="h-6 w-6 text-white/12" />
                            </div>
                            <p className="text-xs font-bold text-white/35">Nenhum registro</p>
                            <p className="text-[10px] text-white/15 mt-1 max-w-[180px]">
                                Postagens confirmadas aparecerão aqui automaticamente.
                            </p>
                        </div>
                    ) : (
                        data.map((entry) => {
                            const cfg = getCfg(entry.final_status);
                            const hasOperator = showOperator && "operator_name" in entry;

                            return (
                                <div
                                    key={entry.id}
                                    className="rounded-xl p-3.5 border border-white/[0.04] bg-[#1A1F2B]/60
                                        hover:border-white/[0.08] hover:bg-[#1E2330]/60 transition-all"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0 space-y-1.5">
                                            {/* Store + product */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {entry.store_name && (
                                                    <span className="text-[10px] font-bold text-orange-400/70 flex items-center gap-1">
                                                        <Store className="h-3 w-3" /> {entry.store_name}
                                                    </span>
                                                )}
                                                {entry.product_name && (
                                                    <span className="text-[10px] text-white/25">• {entry.product_name}</span>
                                                )}
                                            </div>

                                            {/* Campaign title */}
                                            <p className="text-[11px] font-bold text-white/65 truncate">
                                                {entry.campaign_title || "Campanha"}
                                            </p>

                                            {/* DateTime + operator */}
                                            <div className="flex items-center gap-3 flex-wrap">
                                                {entry.posted_at && (
                                                    <span className="text-[9px] text-white/25 flex items-center gap-1">
                                                        <CalendarDays className="h-2.5 w-2.5" />
                                                        {new Date(entry.posted_at).toLocaleDateString("pt-BR")} às{" "}
                                                        {new Date(entry.posted_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                )}
                                                {hasOperator && (entry as PostadorHistoryViewItem).operator_name && (
                                                    <span className="text-[9px] text-white/20 flex items-center gap-1">
                                                        <User className="h-2.5 w-2.5" /> {(entry as PostadorHistoryViewItem).operator_name}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Notes */}
                                            {entry.execution_notes && (
                                                <p className="text-[9px] text-white/20 italic truncate">
                                                    💬 {entry.execution_notes}
                                                </p>
                                            )}
                                        </div>

                                        {/* Status badge */}
                                        <span className={cn(
                                            "inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg shrink-0",
                                            cfg.bg, cfg.color,
                                        )}>
                                            {cfg.icon} {cfg.label}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
