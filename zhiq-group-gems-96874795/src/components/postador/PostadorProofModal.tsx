import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
    Send, Loader2, CheckCircle, Shield, Timer, Radio,
    MapPin, Camera, Link, FileText, AlertTriangle, Sparkles,
    Upload, Image as ImageIcon, X,
} from "lucide-react";
import type { PostadorOperacionalBoardItem, GroupRuntimeView } from "@/types/postador";

// ═══════════════════════════════════════
// MODAL DE PROVA DO POSTADOR (POSTADOR PROOF MODAL)
// Confirmação de postagem com prova real
// Orientado por target_id (POSTADOR 2)
// Upload real ao Supabase Storage
// ═══════════════════════════════════════

const BUCKET_NAME = "postador-proofs";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

interface PostadorProofModalProps {
    open: boolean;
    onClose: () => void;
    boardItem: PostadorOperacionalBoardItem;
    groupRuntimes: GroupRuntimeView[];
    actionState: Record<string, "loading" | "success" | "error">;
    onConfirm: (
        targetId: string,
        proofType?: string,
        proofText?: string,
        proofUrl?: string,
        postedMessage?: string,
        notes?: string,
    ) => void;
}

export default function PostadorProofModal({
    open, onClose, boardItem, groupRuntimes, actionState, onConfirm,
}: PostadorProofModalProps) {
    const { user } = useAuth();
    const [notes, setNotes] = useState("");
    const [proofUrl, setProofUrl] = useState("");
    const [proofText, setProofText] = useState("");
    const [postedMessage, setPostedMessage] = useState("");
    const [proofType, setProofType] = useState<"file" | "link" | "text">("file");

    // File upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const key = boardItem.target_id;
    const isActing = actionState[key] === "loading" || uploading;
    const isSuccess = actionState[key] === "success";

    const readyGroups = groupRuntimes.filter((r) => !r.is_in_cooldown);

    // ── Seleção de Arquivo ──
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUploadError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
            setUploadError("Arquivo muito grande. Máximo: 5MB.");
            return;
        }
        if (!file.type.startsWith("image/")) {
            setUploadError("Apenas imagens são aceitas (JPG, PNG, WebP).");
            return;
        }

        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setFilePreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    };

    const clearFile = () => {
        setSelectedFile(null);
        setFilePreview(null);
        setUploadError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // ── Upload para o Storage ──
    const uploadProofFile = async (): Promise<{ url: string; path: string } | null> => {
        if (!selectedFile || !user) return null;

        const ext = selectedFile.name.split(".").pop() || "jpg";
        const timestamp = Date.now();
        const storagePath = `${user.id}/${boardItem.target_id}/${timestamp}-proof.${ext}`;

        setUploading(true);
        setUploadError(null);

        try {
            const { error: uploadErr } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(storagePath, selectedFile, { upsert: true });

            if (uploadErr) {
                console.error("[ProofModal] Upload error:", uploadErr);
                setUploadError(`Erro no upload: ${uploadErr.message}`);
                return null;
            }

            const { data: { publicUrl } } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(storagePath);

            return { url: publicUrl, path: storagePath };
        } catch (err: any) {
            console.error("[ProofModal] Upload exception:", err);
            setUploadError("Falha no upload. Tente novamente.");
            return null;
        } finally {
            setUploading(false);
        }
    };

    // ── Manipulador de Confirmação ──
    const handleConfirm = async () => {
        let finalProofUrl = "";
        const finalProofType = proofType;

        if (proofType === "file" && selectedFile) {
            const result = await uploadProofFile();
            if (!result) return; // upload failed, error already set
            finalProofUrl = result.url;
        } else if (proofType === "link") {
            finalProofUrl = proofUrl;
        }

        onConfirm(
            boardItem.target_id,
            finalProofType,
            proofType === "text" ? proofText : undefined,
            finalProofUrl || undefined,
            postedMessage || undefined,
            notes || undefined,
        );
    };

    const title = boardItem.campaign_title || "Campanha";

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-md bg-white border-rose-200/40 text-foreground rounded-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto shadow-xl" style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8F6 100%)",
            }}>
                {/* Cabeçalho */}
                <div className="relative p-5 pb-4 border-b border-rose-200/25">
                    <div className="absolute -top-10 -left-10 w-32 h-32 bg-emerald-500/[0.06] rounded-full blur-3xl" />
                    <DialogHeader className="relative z-10">
                        <DialogTitle className="flex items-center gap-2 text-lg font-black text-foreground/90">
                            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20">
                                <Send className="h-4 w-4 text-emerald-600" />
                            </div>
                            Confirmar Postagem
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-3 p-3 rounded-xl" style={{
                        background: "rgba(255,228,225,0.20)",
                        border: "1px solid rgba(255,200,190,0.25)",
                    }}>
                        <p className="text-xs font-bold text-foreground/70 truncate">{title}</p>
                        {boardItem.store_name && (
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                <span className="w-3 h-3 bg-orange-500/20 rounded flex items-center justify-center">
                                    <span className="text-[6px]">🏪</span>
                                </span>
                                {boardItem.store_name}
                            </p>
                        )}
                    </div>
                </div>

                {/* Corpo */}
                <div className="p-5 space-y-4">
                    {/* Status do Grupo */}
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-3">
                            Grupos ({readyGroups.length} liberados / {groupRuntimes.length} total)
                        </p>

                        {groupRuntimes.length === 0 ? (
                            <div className="p-4 rounded-xl border border-dashed border-foreground/[0.08] text-center">
                                <Shield className="h-5 w-5 text-muted-foreground/30 mx-auto mb-2" />
                                <p className="text-[11px] text-muted-foreground/50">Nenhum grupo com runtime</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                                {groupRuntimes.map((rt) => {
                                    const inCooldown = rt.is_in_cooldown;
                                    return (
                                        <div
                                            key={rt.whatsapp_group_id}
                                            className={cn(
                                                "w-full flex items-center gap-2.5 p-2.5 rounded-xl border text-left",
                                                inCooldown
                                                    ? "border-amber-500/20 bg-amber-500/[0.05]"
                                                    : "border-emerald-500/20 bg-emerald-500/[0.05]"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                                inCooldown ? "bg-amber-500/10" : "bg-emerald-500/10"
                                            )}>
                                                {inCooldown
                                                    ? <Timer className="h-3 w-3 text-amber-600" />
                                                    : <Radio className="h-3 w-3 text-emerald-600" />
                                                }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-foreground/70 truncate">
                                                    {rt.group_name || "Grupo"}
                                                </p>
                                                {rt.city_name && (
                                                    <p className="text-[9px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                                                        <MapPin className="h-2.5 w-2.5" /> {rt.city_name}
                                                    </p>
                                                )}
                                            </div>
                                            <Badge className={cn(
                                                "text-[7px] font-black shrink-0",
                                                inCooldown
                                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                            )}>
                                                {inCooldown ? "ESPERA" : "LIVRE"}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ═══════════════════════════════════════ */}
                    {/* SEÇÃO DE PROVA — Arquivo / Link / Texto  */}
                    {/* ═══════════════════════════════════════ */}
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-2">
                            Prova de Postagem (opcional)
                        </p>

                        {/* Seletor de tipo de prova */}
                        <div className="flex gap-1.5 mb-3">
                            {([
                                { key: "file" as const, label: "Screenshot", icon: Camera },
                                { key: "link" as const, label: "Link", icon: Link },
                                { key: "text" as const, label: "Texto", icon: FileText },
                            ]).map(({ key: k, label, icon: Icon }) => (
                                <button
                                    key={k}
                                    onClick={() => setProofType(k)}
                                    className={cn(
                                        "flex-1 text-[10px] font-bold py-2 rounded-lg border transition-all flex items-center justify-center gap-1",
                                        proofType === k
                                            ? k === "file" ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600"
                                                : k === "link" ? "bg-sky-500/10 border-sky-500/25 text-sky-600"
                                                    : "bg-violet-500/10 border-violet-500/25 text-violet-600"
                                            : "bg-foreground/[0.02] border-foreground/[0.06] text-muted-foreground"
                                    )}
                                >
                                    <Icon className="h-3 w-3" /> {label}
                                </button>
                            ))}
                        </div>

                        {/* Upload de arquivo */}
                        {proofType === "file" && (
                            <div className="space-y-2">
                                {!selectedFile ? (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isActing || isSuccess}
                                        className="w-full py-6 rounded-xl border-2 border-dashed border-foreground/[0.08] hover:border-emerald-500/30 transition-colors flex flex-col items-center gap-2 text-muted-foreground hover:text-emerald-600"
                                    >
                                        <Upload className="h-6 w-6" />
                                        <span className="text-xs font-bold">Selecionar screenshot</span>
                                        <span className="text-[10px] text-muted-foreground/60">JPG, PNG ou WebP · max 5MB</span>
                                    </button>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/20">
                                        {filePreview && (
                                            <img
                                                src={filePreview}
                                                alt="Preview da prova"
                                                className="w-full max-h-36 object-cover"
                                            />
                                        )}
                                        <div className="flex items-center gap-2 p-2.5 bg-emerald-500/[0.05]">
                                            <ImageIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                            <span className="text-[10px] font-bold text-foreground/60 truncate flex-1">
                                                {selectedFile.name}
                                            </span>
                                            <span className="text-[9px] text-muted-foreground shrink-0">
                                                {(selectedFile.size / 1024).toFixed(0)}KB
                                            </span>
                                            <button
                                                onClick={clearFile}
                                                className="text-muted-foreground hover:text-rose-500 transition-colors shrink-0"
                                                disabled={isActing}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </div>
                        )}

                        {/* Entrada de Link */}
                        {proofType === "link" && (
                            <Input
                                value={proofUrl}
                                onChange={(e) => setProofUrl(e.target.value)}
                                placeholder="https://link-da-postagem..."
                                className="bg-foreground/[0.02] border-foreground/[0.06] text-foreground/70 text-xs h-9 placeholder:text-muted-foreground/40 rounded-xl"
                                disabled={isActing || isSuccess}
                            />
                        )}

                        {/* Entrada de Texto */}
                        {proofType === "text" && (
                            <textarea
                                value={proofText}
                                onChange={(e) => setProofText(e.target.value)}
                                placeholder="Descreva onde/como postou..."
                                className="w-full bg-foreground/[0.02] border border-foreground/[0.06] text-foreground/70 text-xs p-2.5 placeholder:text-muted-foreground/40 rounded-xl resize-none h-16"
                                disabled={isActing || isSuccess}
                            />
                        )}

                        {/* Erro de upload */}
                        {uploadError && (
                            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-500/[0.06] border border-rose-500/20">
                                <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                                <p className="text-[10px] text-rose-600 font-medium">{uploadError}</p>
                            </div>
                        )}
                    </div>

                    {/* Mensagem Postada */}
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-2">
                            Mensagem Postada (opcional)
                        </p>
                        <textarea
                            value={postedMessage}
                            onChange={(e) => setPostedMessage(e.target.value)}
                            placeholder="Cole aqui a mensagem que foi postada no grupo..."
                            className="w-full bg-foreground/[0.02] border border-foreground/[0.06] text-foreground/70 text-xs p-2.5 placeholder:text-muted-foreground/40 rounded-xl resize-none h-16"
                            disabled={isActing || isSuccess}
                        />
                    </div>

                    {/* Observação */}
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em] mb-2">
                            Observação
                        </p>
                        <Input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ex: Postei no grupo Centro - Blumenau"
                            className="bg-foreground/[0.02] border-foreground/[0.06] text-foreground/70 text-xs h-9 placeholder:text-muted-foreground/40 rounded-xl"
                            disabled={isActing || isSuccess}
                        />
                    </div>

                    {/* Mensagem Estratégica */}
                    <div className="p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.12]">
                        <div className="flex items-start gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            <p className="text-[10px] text-muted-foreground leading-[1.7]">
                                <strong className="text-emerald-600">Postagem confirmada = benefício ativo.</strong>{" "}
                                Grupos com postagem real contam para sua comissão e mantêm o ecossistema territorial vivo.
                            </p>
                        </div>
                    </div>

                    {/* Botão de Confirmação */}
                    <Button
                        onClick={handleConfirm}
                        disabled={isActing || isSuccess}
                        className={cn(
                            "w-full h-12 text-sm font-black rounded-xl shadow-lg transition-all",
                            isSuccess
                                ? "bg-emerald-600 text-white"
                                : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-500/20"
                        )}
                    >
                        {uploading ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando prova...</>
                        ) : isActing ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Confirmando...</>
                        ) : isSuccess ? (
                            <><CheckCircle className="h-4 w-4 mr-2" /> Postagem Confirmada!</>
                        ) : (
                            <><Send className="h-4 w-4 mr-2" /> Confirmar Postagem</>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
