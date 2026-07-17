import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    Store, MapPin, ShoppingBag, CheckCircle, Loader2,
    Send, Timer, Shield, Package, ChevronDown, ChevronUp,
    AlertTriangle, Sparkles, MousePointerClick,
} from "lucide-react";
import type { PostingLot, PostingLotItem } from "@/types/postador";
import { chatCompletion } from "@/lib/aiapi";
import WhatsAppPreviewModal from "@/components/postador/WhatsAppPreviewModal";

function buildTrackingUrl(lot: PostingLot): string {
    const base = window.location.origin;
    return lot.tracking_token ? `${base}/c/${lot.tracking_token}` : `${base}/mercado`;
}

function buildLotMessage(lot: PostingLot): string {
    const lines: string[] = [];
    if (lot.store_name) lines.push(`🏪 ${lot.store_name}`);
    const location = [lot.target_bairro || lot.target_region, lot.target_city].filter(Boolean).join(", ");
    if (location) lines.push(`📍 ${location}`);
    lines.push("");
    lines.push("🛍️ Ofertas especiais:");
    (lot.items || []).forEach((item) => {
        const price = item.product_price ? ` — R$ ${Number(item.product_price).toFixed(2).replace(".", ",")}` : "";
        lines.push(`• ${item.product_name}${price}`);
    });
    lines.push("");
    lines.push("─────────────────────");
    lines.push(`🔗 Ver ofertas: ${buildTrackingUrl(lot)}`);
    return lines.join("\n");
}

function buildPromptForLot(lot: PostingLot): string {
    const lines: string[] = [];
    if (lot.store_name) lines.push(`Loja: ${lot.store_name}`);
    const location = [lot.target_bairro || lot.target_region, lot.target_city].filter(Boolean).join(", ");
    if (location) lines.push(`Localização: ${location}`);
    lines.push("Produtos:");
    (lot.items || []).forEach((item) => {
        const price = item.product_price ? ` — R$ ${Number(item.product_price).toFixed(2).replace(".", ",")}` : "";
        lines.push(`• ${item.product_name}${price}`);
    });
    return lines.join("\n");
}

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
// CONFIGURAÇÃO DE STATUS DO LOTE (LOT)
// ═══════════════════════════════════════

const LOT_STATUS_CONFIG: Record<string, {
    label: string; color: string; bg: string; border: string; icon: React.ReactNode;
}> = {
    available: {
        label: "Disponível", color: "text-emerald-400", bg: "bg-emerald-500/10",
        border: "border-emerald-500/20", icon: <Package className="h-3.5 w-3.5" />,
    },
    claimed: {
        label: "Reservado", color: "text-sky-400", bg: "bg-sky-500/10",
        border: "border-sky-500/20", icon: <Shield className="h-3.5 w-3.5" />,
    },
    cooldown: {
        label: "Em Espera", color: "text-amber-400", bg: "bg-amber-500/10",
        border: "border-amber-500/20", icon: <Timer className="h-3.5 w-3.5" />,
    },
    posted: {
        label: "Postado", color: "text-emerald-400", bg: "bg-emerald-500/10",
        border: "border-emerald-500/20", icon: <CheckCircle className="h-3.5 w-3.5" />,
    },
    expired: {
        label: "Libera em breve", color: "text-violet-400", bg: "bg-violet-500/10",
        border: "border-violet-500/20", icon: <Sparkles className="h-3.5 w-3.5" />,
    },
};

// ═══════════════════════════════════════
// MINI CARD DE PRODUTO
// ═══════════════════════════════════════

function MiniProductCard({ item }: { item: PostingLotItem }) {
    return (
        <div
            className="flex items-center gap-3 rounded-xl p-2.5 border transition-all duration-200 hover:border-white/[0.12]"
            style={{
                background: "linear-gradient(135deg, #151922 0%, rgba(255,228,225,0.03) 100%)",
                borderColor: "rgba(255,228,225,0.06)",
            }}
        >
            {/* Product image */}
            {item.product_image_url ? (
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[#1A1F2B] border border-white/[0.04]">
                    <img
                        src={item.product_image_url}
                        alt={item.product_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>
            ) : (
                <div className="w-12 h-12 rounded-lg shrink-0 bg-gradient-to-br from-violet-500/10 to-emerald-500/10 border border-white/[0.06] flex items-center justify-center">
                    <ShoppingBag className="h-5 w-5 text-white/20" />
                </div>
            )}
            {/* Product info */}
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white/80 truncate leading-tight">
                    {item.product_name}
                </p>
                {item.product_price != null && item.product_price > 0 && (
                    <p className="text-[12px] font-black text-emerald-400 mt-0.5">
                        R$ {Number(item.product_price).toFixed(2).replace(".", ",")}
                    </p>
                )}
            </div>
            {/* Position badge */}
            <span className="text-[8px] font-black text-white/15 border border-white/[0.05] rounded-md px-1.5 py-0.5 shrink-0">
                #{item.position}
            </span>
        </div>
    );
}

// ═══════════════════════════════════════
// CARD PRINCIPAL DO LOTE (LOT)
// ═══════════════════════════════════════

export default function PostadorLotCard({
    lot,
    actionState,
    onClaim,
    onOpenProof,
    userId,
}: {
    lot: PostingLot;
    actionState: Record<string, "loading" | "success" | "error">;
    onClaim: (lotId: string) => void;
    onOpenProof: (lot: PostingLot) => void;
    userId?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const key = lot.lot_id;
    const isActing = actionState[key] === "loading";
    const isSuccess = actionState[key] === "success";
    const isError = actionState[key] === "error";

    const [isGenerating, setIsGenerating] = useState(false);
    const [previewText, setPreviewText] = useState("");
    const [showPreview, setShowPreview] = useState(false);

    const handleGenerateAiText = async () => {
        setIsGenerating(true);
        try {
            const context = buildPromptForLot(lot);
            const systemPrompt = `Você é um copywriter especialista em marketing digital e vendas para WhatsApp e Instagram. 
Crie um texto de venda persuasivo (copy) que divulgue os itens fornecidos, usando gatilhos mentais (urgência, escassez, prova social).
O texto deve ser animado, usar emojis adequados e ter um call to action (CTA) claro no final, convidando a pessoa para clicar no link da loja ou entrar em contato.
Mantenha o texto bem formatado e fácil de ler.`;
            const userPrompt = `Por favor, crie um texto de divulgação para os seguintes itens:\n${context}\n\nLembre-se de adicionar placeholders para o link da loja, ex: [LINK DA LOJA].`;

            const aiText = await chatCompletion(userPrompt, undefined, systemPrompt);
            
            const finalMsg = `${aiText}\n\n─────────────────────\n🔗 Ver ofertas: ${buildTrackingUrl(lot)}`;
            
            setPreviewText(finalMsg);
            setShowPreview(true);
        } catch (error) {
            console.error("Erro ao gerar texto:", error);
            toast.error("Erro ao gerar texto com o Viagg-TX8™. Tente novamente.");
            setPreviewText(buildLotMessage(lot));
            setShowPreview(true);
        } finally {
            setIsGenerating(false);
        }
    };

    const statusCfg = LOT_STATUS_CONFIG[lot.lot_status] || LOT_STATUS_CONFIG.available;
    const isMine = lot.operator_user_id === userId;
    const isClaimed = lot.lot_status === "claimed";
    const isAvailable = lot.lot_status === "available";
    const isCooldown = lot.lot_status === "cooldown";
    const isPosted = lot.lot_status === "posted" || lot.lot_status === "expired";

    // Countdown for cooldown or claim expiry
    const countdownTarget = isCooldown ? lot.cooldown_until : (isClaimed ? lot.claimed_until : null);
    const { remaining: countdown, isExpired: countdownExpired } = useCountdown(countdownTarget);

    // Determine CTA
    let ctaLabel = "Assumir Lote";
    let ctaAction: (() => void) | null = () => onClaim(lot.lot_id);
    let ctaEnabled = true;

    if (isClaimed && isMine) {
        ctaLabel = "Confirmar Postagem";
        ctaAction = () => onOpenProof(lot);
    } else if (isClaimed && !isMine) {
        ctaLabel = "Reservado por outro";
        ctaEnabled = false;
        ctaAction = null;
    } else if (isCooldown) {
        ctaLabel = `Espera ${countdown || ""}`;
        ctaEnabled = false;
        ctaAction = null;
    } else if (isPosted) {
        ctaLabel = "Postado ✓";
        ctaEnabled = false;
        ctaAction = null;
    } else if (isAvailable) {
        ctaLabel = "Assumir Lote";
        ctaAction = () => onClaim(lot.lot_id);
    }

    if (isActing || isSuccess) ctaEnabled = false;

    const items = (lot.items || []) as PostingLotItem[];

    // Accent based on status
    const accentGradient = isAvailable
        ? "linear-gradient(90deg, transparent, rgba(16,185,129,0.35), rgba(255,228,225,0.15), transparent)"
        : isClaimed && isMine
            ? "linear-gradient(90deg, transparent, rgba(56,189,248,0.35), rgba(255,228,225,0.15), transparent)"
            : isCooldown
                ? "linear-gradient(90deg, transparent, rgba(245,158,11,0.3), rgba(255,228,225,0.1), transparent)"
                : "linear-gradient(90deg, transparent, rgba(255,228,225,0.15), transparent)";

    return (
        <div
            className={cn(
                "relative rounded-2xl border overflow-hidden transition-all duration-300",
                "hover:shadow-xl",
                isSuccess && "ring-1 ring-emerald-500/25 shadow-emerald-500/[0.08]",
            )}
            style={{
                background: "linear-gradient(145deg, #1A1F2B 0%, #1C2132 50%, rgba(255,228,225,0.04) 100%)",
                borderColor: "rgba(255,228,225,0.10)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,228,225,0.05)",
            }}
        >
            {/* Top accent line */}
            <div className="absolute top-0 left-4 right-4 h-[2px]" style={{ background: accentGradient }} />

            <div className="p-4 space-y-3">
                {/* Row 1: Store Header + Status */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {/* Store Logo */}
                        {lot.store_logo_url ? (
                            <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-white/[0.08] bg-[#151922]">
                                <img src={lot.store_logo_url} alt="" className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className="w-11 h-11 rounded-xl shrink-0 bg-gradient-to-br from-orange-500/15 to-amber-500/15 border border-white/[0.08] flex items-center justify-center">
                                <Store className="h-5 w-5 text-orange-400/60" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <h4 className="font-black text-[14px] text-white/90 line-clamp-1 tracking-tight leading-tight">
                                {lot.store_name || "Loja"}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                                {(lot.target_bairro || lot.target_city) && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-white/40 font-medium">
                                        <MapPin className="h-3 w-3 text-white/25" />
                                        {lot.target_bairro || lot.target_region || lot.target_city}
                                    </span>
                                )}
                                <Badge className="bg-violet-500/15 text-violet-400 border-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0 h-4">
                                    {items.length} ofertas
                                </Badge>
                            </div>
                        </div>
                    </div>
                    {/* Status Badge */}
                    <span className={cn(
                        "inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider",
                        "px-2.5 py-1.5 rounded-lg shrink-0 border",
                        statusCfg.bg, statusCfg.color, statusCfg.border,
                    )}>
                        {statusCfg.icon} {statusCfg.label}
                    </span>
                </div>

                {/* Row 2: Mini Product Cards */}
                <div className="space-y-1.5">
                    {items.map((item) => (
                        <MiniProductCard key={item.id || item.position} item={item} />
                    ))}
                    {items.length === 0 && (
                        <div className="text-center py-4 text-[11px] text-white/25 font-medium">
                            Nenhum produto neste lote
                        </div>
                    )}
                </div>

                {/* Row 3: Countdown */}
                {countdown && !countdownExpired && (
                    <div
                        className="flex items-center justify-between rounded-xl px-3 py-2 border"
                        style={{
                            background: isCooldown
                                ? "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(255,228,225,0.03))"
                                : "linear-gradient(135deg, rgba(56,189,248,0.06), rgba(255,228,225,0.03))",
                            borderColor: isCooldown
                                ? "rgba(245,158,11,0.15)"
                                : "rgba(56,189,248,0.15)",
                        }}
                    >
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            {isCooldown ? "Próximo em" : "Expira em"}
                        </span>
                        <span className={cn(
                            "text-[13px] font-mono font-black",
                            isCooldown ? "text-amber-400" : "text-sky-400"
                        )}>
                            {countdown}
                        </span>
                    </div>
                )}

                {/* Row 4: Territorial Value Banner */}
                {isAvailable && (
                    <div className="rounded-xl p-2.5 flex items-center gap-2" style={{
                        background: "linear-gradient(135deg, rgba(255,228,225,0.02), rgba(16,185,129,0.05))",
                        border: "1px solid rgba(255,228,225,0.06)",
                    }}>
                        <Sparkles className="h-3.5 w-3.5 text-emerald-400/60 shrink-0" />
                        <p className="text-[9px] text-emerald-300/60 leading-relaxed">
                            <strong>Postar fortalece o comércio local</strong> e pode gerar entregas futuras na sua região.
                        </p>
                    </div>
                )}

                {/* Row 5: CTA Buttons */}
                {isClaimed && isMine && !isActing && !isSuccess ? (
                    /* Lote reservado pelo motoboy — dois botões */
                    <div className="flex gap-2">
                        {/* Postar no WhatsApp com IA */}
                        <Button
                            size="sm"
                            className="flex-[2] text-[11px] font-black h-11 gap-1.5 rounded-xl text-white transition-all duration-200"
                            style={{ background: "linear-gradient(135deg, #FF6A00, #FF8C33)" }}
                            onClick={handleGenerateAiText}
                            disabled={isGenerating || isActing}
                        >
                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            {isGenerating ? "Gerando..." : "Gerar com Viagg-TX8™"}
                        </Button>
                        {/* Confirmar no sistema */}
                        <Button
                            size="sm"
                            className="flex-1 text-[11px] font-bold h-11 gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-all duration-200"
                            onClick={() => onOpenProof(lot)}
                            disabled={isActing}
                        >
                            <CheckCircle className="h-4 w-4" /> Confirmar
                        </Button>
                    </div>
                ) : (
                    <Button
                        size="sm"
                        className={cn(
                            "w-full text-[12px] font-bold h-11 gap-2 rounded-xl transition-all duration-300",
                            isActing && "pointer-events-none opacity-80",
                            ctaEnabled && !isActing
                                ? isAvailable
                                    ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:translate-y-[-1px] active:translate-y-0"
                                    : "bg-white/[0.06] text-white/40"
                                : isSuccess
                                    ? "bg-emerald-600/80 text-white pointer-events-none"
                                    : isError
                                        ? "bg-rose-500/15 text-rose-400 border border-rose-500/15 cursor-not-allowed"
                                        : isCooldown
                                            ? "bg-amber-500/10 text-amber-400/70 border border-amber-500/15 cursor-default"
                                            : "bg-white/[0.04] text-white/20 cursor-not-allowed border border-white/[0.04]",
                        )}
                        disabled={!ctaEnabled || isActing}
                        onClick={ctaAction || undefined}
                    >
                        {isActing ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                        ) : isSuccess ? (
                            <><CheckCircle className="h-4 w-4" /> Confirmado!</>
                        ) : isError ? (
                            <><AlertTriangle className="h-4 w-4" /> Erro — Tente novamente</>
                        ) : isCooldown ? (
                            <><Timer className="h-4 w-4" /> {ctaLabel}</>
                        ) : (
                            <><Package className="h-4 w-4" /> {ctaLabel}</>
                        )}
                    </Button>
                )}

                {/* Row 6: lot_id expand toggle */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] text-white/15 hover:text-white/40 py-0.5 transition-colors duration-200"
                >
                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {expanded ? "Ocultar detalhes" : "Ver detalhes"}
                </button>

                {expanded && (
                    <div className="space-y-2 pt-1 border-t border-white/[0.04] animate-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 gap-1.5">
                            {[
                                { label: "Status", value: lot.lot_status },
                                { label: "Itens", value: `${lot.items_count} produtos` },
                                { label: "Cidade", value: lot.target_city || "—" },
                                { label: "Região", value: lot.target_region || lot.target_bairro || "—" },
                                { label: "Criado em", value: lot.lot_created_at ? new Date(lot.lot_created_at).toLocaleDateString("pt-BR") : "—" },
                                { label: "Postado em", value: lot.posted_at ? new Date(lot.posted_at).toLocaleDateString("pt-BR") : "—" },
                            ].map((d) => (
                                <div key={d.label} className="p-2 rounded-lg bg-[#151922]/60 border border-white/[0.03]">
                                    <p className="text-[8px] font-bold text-white/20 uppercase tracking-wider">{d.label}</p>
                                    <p className="text-[10px] font-bold text-white/50 mt-0.5">{d.value}</p>
                                </div>
                            ))}
                        </div>
                        {lot.tracking_token && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                <MousePointerClick className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span className="text-[10px] font-black text-emerald-400">
                                    {lot.click_count} clique{lot.click_count !== 1 ? 's' : ''} no link rastreável
                                </span>
                                {lot.first_clicked_at && (
                                    <span className="text-[9px] text-white/30 ml-auto">
                                        1º: {new Date(lot.first_clicked_at).toLocaleDateString('pt-BR')}
                                    </span>
                                )}
                            </div>
                        )}
                        <p className="text-[8px] text-white/12 font-mono truncate">lote: {lot.lot_id.slice(0, 12)}…</p>
                    </div>
                )}
            </div>

            {/* Modal de pré-visualização WhatsApp */}
            <WhatsAppPreviewModal
                open={showPreview}
                onClose={() => setShowPreview(false)}
                onConfirm={() => {
                    window.open(`https://wa.me/?text=${encodeURIComponent(previewText)}`, "_blank", "noopener,noreferrer");
                    toast.success("WhatsApp aberto! Selecione o grupo e envie.", { duration: 4000 });
                }}
                messageText={previewText}
                imageUrl={lot.store_logo_url}
                ogTitle={lot.store_name ?? undefined}
                ogDesc={previewText.slice(0, 120) ?? undefined}
            />
        </div>
    );
}
