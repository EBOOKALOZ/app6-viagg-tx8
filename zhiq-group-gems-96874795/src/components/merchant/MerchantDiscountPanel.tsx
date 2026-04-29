/**
 * 🏷️ MerchantDiscountPanel — Pedidos de Desconto
 * 
 * Shows discount requests from consumers.
 * Allows: Accept, Counter, Reject with WhatsApp contact.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Phone, Tag, User, Loader2, Bell, Check, X, MessageCircle,
    ArrowDown, ShoppingBag, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface DiscountRequest {
    id: string;
    product_id: string;
    product_price: string | null;
    customer_name: string;
    customer_phone: string;
    requested_price: number;
    message: string | null;
    status: string;
    store_response: string | null;
    counter_price: number | null;
    responded_at: string | null;
    city: string | null;
    created_at: string;
}

export default function MerchantDiscountPanel() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<DiscountRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [merchantStoreId, setMerchantStoreId] = useState<string | null>(null);
    const [counterModal, setCounterModal] = useState<DiscountRequest | null>(null);
    const [counterPrice, setCounterPrice] = useState("");
    const [counterMsg, setCounterMsg] = useState("");
    const [responding, setResponding] = useState<string | null>(null);

    // Find merchant store
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const { data } = await (supabase.from("merchant_stores") as any)
                .select("id")
                .eq("user_id", user.id)
                .limit(1)
                .single();
            if (data) setMerchantStoreId(data.id);
        })();
    }, [user?.id]);

    // Load requests
    const loadData = useCallback(async () => {
        if (!merchantStoreId) return;
        setLoading(true);
        try {
            const { data } = await (supabase.from("discount_requests") as any)
                .select("*")
                .eq("store_id", merchantStoreId)
                .order("created_at", { ascending: false })
                .limit(50);
            setRequests(data || []);
        } catch (err) {
            console.error("[MerchantDiscountPanel] error:", err);
        } finally {
            setLoading(false);
        }
    }, [merchantStoreId]);

    useEffect(() => { loadData(); }, [loadData]);

    // Real-time
    useEffect(() => {
        if (!merchantStoreId) return;
        const channel = supabase
            .channel("merchant-discounts")
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "discount_requests",
                filter: `store_id=eq.${merchantStoreId}`,
            }, (payload) => {
                const newReq = payload.new as DiscountRequest;
                setRequests(prev => [newReq, ...prev]);
                toast.info("🏷️ Novo pedido de desconto!", {
                    description: `${newReq.customer_name} propôs R$ ${newReq.requested_price?.toFixed(2).replace(".", ",")}`,
                    duration: 8000,
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [merchantStoreId]);

    // Respond to request
    const handleRespond = async (req: DiscountRequest, action: "accepted" | "rejected" | "countered", counterVal?: number) => {
        setResponding(req.id);
        try {
            const updateData: any = {
                status: action,
                responded_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            if (action === "countered" && counterVal) {
                updateData.counter_price = counterVal;
                updateData.store_response = counterMsg.trim() || null;
            }

            const { error } = await (supabase.from("discount_requests") as any)
                .update(updateData)
                .eq("id", req.id);
            if (error) throw error;

            setRequests(prev =>
                prev.map(r => r.id === req.id ? { ...r, ...updateData } : r)
            );

            const msgs = { accepted: "Oferta aceita!", rejected: "Oferta recusada.", countered: "Contraproposta enviada!" };
            toast.success(msgs[action]);
            setCounterModal(null);
        } catch (err) {
            toast.error("Erro ao responder");
        } finally {
            setResponding(null);
        }
    };

    const pending = requests.filter(r => r.status === "pending");
    const responded = requests.filter(r => r.status !== "pending");

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-merchant" />
            </div>
        );
    }

    if (requests.length === 0) {
        return (
            <Card className="border-dashed border-2 border-purple-200">
                <CardContent className="p-8 text-center">
                    <div className="w-14 h-14 rounded-full bg-purple-50 flex items-center justify-center mx-auto mb-3">
                        <Tag className="h-7 w-7 text-purple-400" />
                    </div>
                    <h3 className="font-bold text-gray-700 mb-1">Nenhum pedido de desconto</h3>
                    <p className="text-sm text-gray-400">
                        Pedidos de desconto dos clientes aparecerão aqui.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Pending */}
            {pending.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                        <Bell className="h-3.5 w-3.5 text-purple-500" />
                        Pedidos Pendentes ({pending.length})
                    </h3>
                    {pending.map(req => (
                        <Card key={req.id} className="border-purple-200 bg-purple-50/50 shadow-sm">
                            <CardContent className="p-4 space-y-3">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <Tag className="h-3.5 w-3.5 text-purple-500" />
                                        <span className="text-xs font-bold text-purple-600">Pedido de desconto</span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        <User className="h-3 w-3 inline mr-1" />
                                        {req.customer_name}
                                    </p>
                                    <div className="flex items-center gap-3">
                                        {req.product_price && (
                                            <span className="text-sm text-gray-400 line-through">R$ {req.product_price}</span>
                                        )}
                                        <ArrowDown className="h-3 w-3 text-purple-500" />
                                        <span className="text-lg font-black text-purple-700">
                                            R$ {req.requested_price?.toFixed(2).replace(".", ",")}
                                        </span>
                                    </div>
                                    {req.message && (
                                        <p className="text-xs text-gray-400 italic">"{req.message}"</p>
                                    )}
                                    <p className="text-[10px] text-gray-300">
                                        {new Date(req.created_at).toLocaleString("pt-BR")}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                                        disabled={responding === req.id}
                                        onClick={() => handleRespond(req, "accepted")}>
                                        <Check className="h-3.5 w-3.5 mr-1" /> Aceitar
                                    </Button>
                                    <Button size="sm" variant="outline" className="flex-1 border-purple-300 text-purple-600 hover:bg-purple-50"
                                        onClick={() => { setCounterModal(req); setCounterPrice(""); setCounterMsg(""); }}>
                                        <MessageCircle className="h-3.5 w-3.5 mr-1" /> Contraproposta
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-red-200 text-red-500 hover:bg-red-50"
                                        disabled={responding === req.id}
                                        onClick={() => handleRespond(req, "rejected")}>
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Responded */}
            {responded.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-gray-400" />
                        Respondidos ({responded.length})
                    </h3>
                    {responded.map(req => (
                        <Card key={req.id} className="border-gray-100 bg-gray-50/50 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <p className="text-sm text-gray-600">{req.customer_name}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full font-bold
                                                ${req.status === 'accepted' ? 'bg-green-100 text-green-700' :
                                                req.status === 'countered' ? 'bg-purple-100 text-purple-700' :
                                                'bg-red-100 text-red-700'}">
                                                {req.status === "accepted" ? "✅ Aceito" :
                                                 req.status === "countered" ? `💬 R$ ${req.counter_price?.toFixed(2).replace(".", ",")}` :
                                                 "❌ Recusado"}
                                            </span>
                                        </div>
                                    </div>
                                    {(req.status === "accepted" || req.status === "countered") && (
                                        <a href={`https://wa.me/${req.customer_phone}?text=${encodeURIComponent(
                                            `Olá ${req.customer_name}, vi seu pedido de desconto. ${
                                                req.status === "accepted" ? "Aceitamos sua proposta!" :
                                                `Podemos oferecer por R$ ${req.counter_price?.toFixed(2).replace(".", ",")}.`
                                            }`
                                        )}`} target="_blank" rel="noopener noreferrer">
                                            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white">
                                                <Phone className="h-3.5 w-3.5 mr-1" /> WhatsApp
                                            </Button>
                                        </a>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Counter Modal */}
            <Dialog open={!!counterModal} onOpenChange={(v) => !v && setCounterModal(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageCircle className="h-5 w-5 text-purple-600" />
                            Contraproposta
                        </DialogTitle>
                    </DialogHeader>
                    {counterModal && (
                        <div className="space-y-4">
                            <div className="bg-gray-50 rounded-xl p-3 text-sm">
                                <p className="text-gray-500">Cliente propôs:</p>
                                <p className="text-lg font-black text-purple-700">
                                    R$ {counterModal.requested_price?.toFixed(2).replace(".", ",")}
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600">Seu valor</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                                    <input
                                        type="text" inputMode="decimal" placeholder="0,00"
                                        value={counterPrice}
                                        onChange={(e) => setCounterPrice(e.target.value.replace(/[^\d,\.]/g, ""))}
                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-bold"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600">Mensagem (opcional)</label>
                                <textarea
                                    placeholder="Ex: Posso fazer por esse valor..."
                                    value={counterMsg}
                                    onChange={(e) => setCounterMsg(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none"
                                    rows={2}
                                />
                            </div>
                            <Button
                                className="w-full bg-purple-600 hover:bg-purple-700"
                                disabled={!counterPrice.trim() || responding === counterModal.id}
                                onClick={() => {
                                    const val = parseFloat(counterPrice.replace(",", "."));
                                    if (isNaN(val) || val <= 0) { toast.error("Informe um valor válido"); return; }
                                    handleRespond(counterModal, "countered", val);
                                }}
                            >
                                {responding === counterModal.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <MessageCircle className="h-4 w-4 mr-2" />
                                )}
                                Enviar Contraproposta
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
