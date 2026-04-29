import React, { useState } from "react";
import { 
    Star, 
    MessageSquare, 
    X, 
    Send, 
    Loader2, 
    CheckCircle2,
    ShieldCheck,
    Quote
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProductReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    productId: string;
    orderId: string;
    productTitle: string;
    onSuccess: () => void;
}

export default function ProductReviewModal({ 
    isOpen, 
    onClose, 
    productId, 
    orderId, 
    productTitle,
    onSuccess 
}: ProductReviewModalProps) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (rating === 0) {
            toast.error("Por favor, selecione uma nota de 1 a 5 estrelas.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            const { error } = await supabase
                .from("product_reviews" as any)
                .insert({
                    product_id: productId,
                    user_id: user.id,
                    order_id: orderId,
                    rating,
                    comment
                });

            if (error) {
                if (error.code === '23505') {
                    toast.error("Você já avaliou este produto nesta compra.");
                } else {
                    throw error;
                }
            } else {
                setIsSuccess(true);
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 2000);
            }
        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao enviar avaliação.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" onClick={onClose} />
            
            {/* Modal */}
            <Card className="relative w-full max-w-lg border-none shadow-3xl rounded-[48px] bg-white overflow-hidden p-10 animate-in zoom-in-95 duration-500">
                
                {isSuccess ? (
                    <div className="text-center py-10 space-y-6 animate-in zoom-in duration-700">
                        <div className="w-24 h-24 bg-emerald-500 text-white rounded-full mx-auto flex items-center justify-center shadow-2xl shadow-emerald-500/20 active:scale-110 transition-transform">
                            <CheckCircle2 className="w-12 h-12" />
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-4xl font-black text-zinc-900 uppercase tracking-tighter leading-tight">Avaliação Enviada</h3>
                            <p className="text-zinc-500 text-sm font-medium leading-relaxed max-w-xs mx-auto">
                                Obrigado pelo seu feedback! Sua avaliação ajuda outros compradores a tomarem a melhor decisão.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.3em]">Sua Opinião Importa</span>
                                <h2 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter leading-none">Avaliar Produto</h2>
                            </div>
                            <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-900 transition-all shadow-inner">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Product Info */}
                        <div className="bg-zinc-50 p-6 rounded-[32px] border border-zinc-100/50 flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-zinc-400">
                                <Quote className="w-6 h-6 rotate-180" />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Produto Adquirido</p>
                                <p className="text-sm font-black text-zinc-900 uppercase tracking-tight line-clamp-1">{productTitle}</p>
                            </div>
                        </div>

                        {/* Star Rating */}
                        <div className="space-y-4 text-center">
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-loose">Como você avalia sua experiência?</p>
                            <div className="flex items-center justify-center gap-3">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        type="button"
                                        className="transition-all duration-300 transform active:scale-125"
                                        onMouseEnter={() => setHover(star)}
                                        onMouseLeave={() => setHover(0)}
                                        onClick={() => setRating(star)}
                                    >
                                        <Star 
                                            className={cn(
                                                "w-12 h-12 transition-all",
                                                (hover || rating) >= star 
                                                    ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" 
                                                    : "text-zinc-100 fill-zinc-100"
                                            )}
                                        />
                                    </button>
                                ))}
                            </div>
                            <div className="h-4">
                                {rating > 0 && (
                                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest animate-in slide-in-from-bottom-2 duration-300">
                                        {rating === 1 ? "Muito Ruim" : rating === 2 ? "Ruim" : rating === 3 ? "Bom" : rating === 4 ? "Muito Bom" : "Excelente!"}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Comment Input */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest items-center flex gap-2">
                                <MessageSquare className="w-3.5 h-3.5" /> Deixe um comentário (opcional)
                            </p>
                            <textarea 
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Conte para nós o que você achou do produto..."
                                className="w-full h-32 bg-zinc-50 border-none rounded-[28px] p-6 text-sm font-medium text-zinc-700 placeholder:text-zinc-300 outline-none focus:ring-2 ring-orange-500/10 shadow-inner resize-none transition-all"
                            />
                        </div>

                        {/* Actions */}
                        <div className="space-y-6 pt-4">
                            <Button 
                                onClick={handleSubmit}
                                disabled={isSubmitting || rating === 0}
                                className="w-full h-16 bg-zinc-900 hover:bg-zinc-800 text-white rounded-[24px] font-black uppercase text-xs tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Enviar Avaliação
                            </Button>
                            <div className="flex items-center justify-center gap-3 text-zinc-300">
                                <ShieldCheck className="w-4 h-4" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Avaliação 100% Verificada por Viagg-TX8</span>
                            </div>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
