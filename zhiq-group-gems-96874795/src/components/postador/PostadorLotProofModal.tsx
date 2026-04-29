import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    X, Upload, Link, FileText, Send, Loader2,
    Store, Package, CheckCircle, ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PostingLot, PostingLotItem } from "@/types/postador";

// ═══════════════════════════════════════
// LOT PROOF MODAL — POSTADOR 3
// Confirmação de postagem com prova
// ═══════════════════════════════════════

export default function PostadorLotProofModal({
    open,
    onClose,
    lot,
    actionState,
    onConfirm,
}: {
    open: boolean;
    onClose: () => void;
    lot: PostingLot;
    actionState: Record<string, "loading" | "success" | "error">;
    onConfirm: (lotId: string, proofType?: string, proofUrl?: string, proofText?: string, notes?: string) => void;
}) {
    const [proofType, setProofType] = useState<"file" | "link" | "text">("file");
    const [proofUrl, setProofUrl] = useState("");
    const [proofText, setProofText] = useState("");
    const [notes, setNotes] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadedUrl, setUploadedUrl] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const key = lot.lot_id;
    const isActing = actionState[key] === "loading";

    if (!open) return null;

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const path = `lots/${lot.lot_id}/${Date.now()}.${ext}`;

            const { data, error } = await supabase.storage
                .from("postador-proofs")
                .upload(path, file, { upsert: true });

            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from("postador-proofs")
                .getPublicUrl(data.path);

            setUploadedUrl(urlData.publicUrl);
            setProofUrl(urlData.publicUrl);
            toast.success("Arquivo enviado!");
        } catch (err: any) {
            console.error("[LotProof] upload error:", err);
            toast.error("Erro ao enviar arquivo.");
        } finally {
            setUploading(false);
        }
    }

    function handleConfirm() {
        const pType = proofType;
        const pUrl = proofType === "file" ? uploadedUrl : proofType === "link" ? proofUrl : undefined;
        const pText = proofType === "text" ? proofText : undefined;
        onConfirm(lot.lot_id, pType, pUrl, pText, notes || undefined);
    }

    const items = (lot.items || []) as PostingLotItem[];
    const hasProof = proofType === "file" ? !!uploadedUrl : proofType === "link" ? !!proofUrl.trim() : !!proofText.trim();

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div
                className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border animate-in slide-in-from-bottom-5 duration-300"
                style={{
                    background: "linear-gradient(180deg, #1A1F2B 0%, #181C28 100%)",
                    borderColor: "rgba(255,228,225,0.12)",
                    boxShadow: "0 -16px 64px rgba(0,0,0,0.5)",
                }}
            >
                {/* Handle bar (mobile) */}
                <div className="sm:hidden flex justify-center pt-3">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                <div className="p-5 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <div>
                            <h3 className="font-black text-[16px] text-white/90 tracking-tight">Confirmar Lote</h3>
                            <p className="text-[11px] text-white/40 mt-0.5 font-medium">
                                {lot.store_name} · {items.length} produtos
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                            <X className="h-4 w-4 text-white/40" />
                        </button>
                    </div>

                    {/* Products Summary */}
                    <div className="space-y-1.5">
                        {items.map((item) => (
                            <div
                                key={item.id || item.position}
                                className="flex items-center gap-2 rounded-lg p-2 border"
                                style={{
                                    background: "rgba(21,25,34,0.6)",
                                    borderColor: "rgba(255,228,225,0.05)",
                                }}
                            >
                                {item.product_image_url ? (
                                    <img src={item.product_image_url} alt="" className="w-8 h-8 rounded-md object-cover border border-white/[0.04]" />
                                ) : (
                                    <div className="w-8 h-8 rounded-md bg-white/[0.04] flex items-center justify-center">
                                        <ShoppingBag className="h-3.5 w-3.5 text-white/15" />
                                    </div>
                                )}
                                <span className="text-[10px] font-bold text-white/60 truncate flex-1">{item.product_name}</span>
                                {item.product_price != null && item.product_price > 0 && (
                                    <span className="text-[10px] font-black text-emerald-400 shrink-0">
                                        R$ {Number(item.product_price).toFixed(2).replace(".", ",")}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Proof Type Selection */}
                    <div>
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em] mb-2">Tipo de Prova</p>
                        <div className="flex gap-1.5">
                            {([
                                { key: "file" as const, label: "Arquivo", icon: <Upload className="h-3.5 w-3.5" /> },
                                { key: "link" as const, label: "Link", icon: <Link className="h-3.5 w-3.5" /> },
                                { key: "text" as const, label: "Texto", icon: <FileText className="h-3.5 w-3.5" /> },
                            ]).map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setProofType(t.key)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold border transition-all duration-200",
                                        proofType === t.key
                                            ? "bg-white/[0.08] text-white/80 border-white/[0.15]"
                                            : "bg-white/[0.02] text-white/30 border-white/[0.05] hover:border-white/[0.10] hover:text-white/50",
                                    )}
                                >
                                    {t.icon} {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Proof Input */}
                    <div className="space-y-2">
                        {proofType === "file" && (
                            <div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*,video/*,.pdf"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-10 text-[11px] font-bold border-dashed border-white/[0.10] text-white/40 hover:text-white/70 hover:border-white/[0.20] rounded-xl"
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Enviando...</>
                                    ) : uploadedUrl ? (
                                        <><CheckCircle className="h-4 w-4 text-emerald-400 mr-1" /> Arquivo enviado ✓</>
                                    ) : (
                                        <><Upload className="h-4 w-4 mr-1" /> Selecionar arquivo</>
                                    )}
                                </Button>
                                {uploadedUrl && (
                                    <p className="text-[9px] text-emerald-400/60 mt-1 truncate font-mono">{uploadedUrl.slice(-40)}</p>
                                )}
                            </div>
                        )}

                        {proofType === "link" && (
                            <input
                                type="url"
                                placeholder="https://..."
                                value={proofUrl}
                                onChange={(e) => setProofUrl(e.target.value)}
                                className="w-full h-10 rounded-xl border bg-white/[0.03] border-white/[0.08] text-[12px] text-white/80 placeholder-white/20 px-3 focus:outline-none focus:border-white/[0.20] transition-colors"
                            />
                        )}

                        {proofType === "text" && (
                            <textarea
                                placeholder="Descreva como a postagem foi feita..."
                                value={proofText}
                                onChange={(e) => setProofText(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border bg-white/[0.03] border-white/[0.08] text-[12px] text-white/80 placeholder-white/20 p-3 focus:outline-none focus:border-white/[0.20] transition-colors resize-none"
                            />
                        )}

                        {/* Notes */}
                        <input
                            type="text"
                            placeholder="Observações (opcional)"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full h-9 rounded-xl border bg-white/[0.02] border-white/[0.06] text-[11px] text-white/60 placeholder-white/15 px-3 focus:outline-none focus:border-white/[0.15] transition-colors"
                        />
                    </div>

                    {/* Submit */}
                    <Button
                        size="sm"
                        className={cn(
                            "w-full h-12 text-[13px] font-bold gap-2 rounded-xl transition-all duration-300",
                            hasProof && !isActing
                                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                                : "bg-white/[0.06] text-white/30 cursor-not-allowed",
                        )}
                        disabled={!hasProof || isActing}
                        onClick={handleConfirm}
                    >
                        {isActing ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Confirmando...</>
                        ) : (
                            <><Send className="h-4 w-4" /> Confirmar Postagem do Lote</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
