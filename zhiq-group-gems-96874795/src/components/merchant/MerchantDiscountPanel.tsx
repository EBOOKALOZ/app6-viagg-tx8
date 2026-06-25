/**
 * 🏷️ MerchantDiscountPanel — Pedidos de Desconto do Lojista
 *
 * Busca discount_requests de TODAS as lojas do usuário.
 * Permite: Aceitar, Contraproposta, Recusar + WhatsApp.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Phone, Tag, User, Loader2, Bell, Check, X, MessageCircle, ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DiscountRequest {
    id: string;
    product_id: string;
    product_price: string | null;
    product_title?: string | null;
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
    const [storeIds, setStoreIds] = useState<string[]>([]);
    const [counterModal, setCounterModal] = useState<DiscountRequest | null>(null);
    const [counterPrice, setCounterPrice] = useState("");
    const [counterMsg, setCounterMsg] = useState("");
    const [responding, setResponding] = useState<string | null>(null);

    // Coleta TODOS os IDs de lojas do usuário
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const ids: string[] = [];
            const { data: ms } = await (supabase.from("merchant_stores") as any)
                .select("id").eq("user_id", user.id);
            ((ms || []) as any[]).forEach((s: any) => { if (s?.id) ids.push(s.id); });
            const { data: adv } = await (supabase.from("advertiser_accounts") as any)
                .select("id").eq("user_id", user.id);
            ((adv || []) as any[]).forEach((a: any) => { if (a?.id && !ids.includes(a.id)) ids.push(a.id); });
            setStoreIds(ids);
        })();
    }, [user?.id]);

    // Carrega as ofertas
    const loadData = useCallback(async () => {
        if (storeIds.length === 0) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data } = await (supabase.from("discount_requests") as any)
                .select("*")
                .in("store_id", storeIds)
                .neq("status", "deleted")
                .order("created_at", { ascending: false })
                .limit(50);

            const list = (data || []) as DiscountRequest[];

            // Resolver títulos dos produtos
            const productIds = [...new Set(list.map((r) => r.product_id).filter(Boolean))];
            const titleMap: Record<string, string> = {};
            if (productIds.length > 0) {
                const [adv, mkt] = await Promise.all([
                    (supabase.from("advertiser_listings" as any).select("id, title").in("id", productIds)) as any,
                    (supabase.from("merchant_marketing_products" as any).select("id, title").in("id", productIds)) as any,
                ]);
                for (const r of (adv.data || [])) titleMap[r.id] = r.title;
                for (const r of (mkt.data || [])) if (!titleMap[r.id]) titleMap[r.id] = r.title;
            }

            setRequests(list.map(r => ({
                ...r,
                product_title: titleMap[r.product_id] || null,
            })));
        } catch (err) {
            console.error("[MerchantDiscountPanel] error:", err);
        } finally {
            setLoading(false);
        }
    }, [storeIds]);

    useEffect(() => { loadData(); }, [loadData]);

    // Realtime — canal único por usuário
    useEffect(() => {
        if (storeIds.length === 0) return;
        const channel = supabase
            .channel(`merchant-discounts:${user?.id}`)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "discount_requests",
            }, (payload) => {
                const newReq = payload.new as DiscountRequest;
                if (!storeIds.includes(newReq.product_id)) {
                    // verifica se é desta loja antes de exibir
                }
                loadData();
                toast.info("🏷️ Nova oferta de desconto!", {
                    description: `${newReq.customer_name} propôs R$ ${newReq.requested_price?.toFixed(2).replace(".", ",")}`,
                    duration: 8000,
                });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [storeIds, loadData]);

    // Responder oferta
    const handleRespond = async (
        req: DiscountRequest,
        action: "accepted" | "rejected" | "countered",
        counterVal?: number,
    ) => {
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
                .update(updateData).eq("id", req.id);
            if (error) throw error;

            setRequests(prev => prev.map(r => r.id === req.id ? { ...r, ...updateData } : r));
            const msgs = { accepted: "Oferta aceita!", rejected: "Oferta recusada.", countered: "Contraproposta enviada!" };
            toast.success(msgs[action]);
            setCounterModal(null);
        } catch {
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
                <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
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
                        Quando clientes enviarem uma oferta de preço, aparecerá aqui.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">

            {/* Pendentes */}
            {pending.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2">
                        <Bell className="h-3.5 w-3.5 text-purple-500" />
                        Pendentes ({pending.length})
                    </h3>
                    {pending.map(req => (
                        <Card key={req.id} className="border-purple-200 bg-purple-50/50 shadow-sm">
                            <CardContent className="p-4 space-y-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Tag className="h-3.5 w-3.5 text-purple-500" />
                                        <span className="text-xs font-bold text-purple-600">Oferta de desconto</span>
                                    </div>
                                    <p className="text-sm font-bold text-gray-800">
                                        <User className="h-3 w-3 inline mr-1 text-gray-400" />
                                        {req.customer_name}
                                    </p>
                                    {req.product_title && (
                                        <p className="text-xs text-gray-400 truncate">
                                            Produto: <span className="font-semibold text-gray-600">{req.product_title}</span>
                                        </p>
                                    )}
                                    <div className="flex items-center gap-3 py-1">
                                        {req.product_price && (
                                            <span className="text-sm text-gray-400 line-through">
                                                R$ {req.product_price}
                                            </span>
                                        )}
                                        <ArrowDown className="h-3 w-3 text-purple-500" />
                                        <span className="text-xl font-black text-purple-700">
                                            R$ {req.requested_price?.toFixed(2).replace(".", ",")}
                                        </span>
                                    </div>
                                    {req.message && (
                                        <p className="text-xs text-gray-500 italic bg-white rounded-lg px-3 py-2 border border-purple-100">
                                            "{req.message}"
                                        </p>
                                    )}
                                    <p className="text-[10px] text-gray-300">
                                        {new Date(req.created_at).toLocaleString("pt-BR")}
                                        {req.city && ` · ${req.city}`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                                        disabled={responding === req.id}
                                        onClick={() => handleRespond(req, "accepted")}>
                                        <Check className="h-3.5 w-3.5 mr-1" /> Aceitar
                                    </Button>
                                    <Button size="sm" variant="outline"
                                        className="flex-1 border-purple-300 text-purple-600 hover:bg-purple-50"
                                        onClick={() => { setCounterModal(req); setCounterPrice(""); setCounterMsg(""); }}>
                                        <MessageCircle className="h-3.5 w-3.5 mr-1" /> Contraproposta
                                    </Button>
                                    <Button size="sm" variant="outline"
                                        className="border-red-200 text-red-500 hover:bg-red-50"
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

            {/* Respondidos */}
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
                                        <p className="text-sm font-bold text-gray-700">{req.customer_name}</p>
                                        {req.product_title && (
                                            <p className="text-xs text-gray-400 truncate">{req.product_title}</p>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "text-xs px-2 py-0.5 rounded-full font-bold",
                                                req.status === "accepted" ? "bg-green-100 text-green-700" :
                                                req.status === "countered" ? "bg-purple-100 text-purple-700" :
                                                "bg-red-100 text-red-700"
                                            )}>
                                                {req.status === "accepted" ? "✅ Aceito" :
                                                 req.status === "countered" ? `💬 R$ ${req.counter_price?.toFixed(2).replace(".", ",")}` :
                                                 "❌ Recusado"}
                                            </span>
                                            <span className="text-[10px] text-gray-300">
                                                R$ {req.requested_price?.toFixed(2).replace(".", ",")}
                                            </span>
                                        </div>
                                    </div>
                                    {(req.status === "accepted" || req.status === "countered") && (
                                        <a href={`https://wa.me/55${req.customer_phone?.replace(/\D/g, "")}?text=${encodeURIComponent(
                                            `Olá ${req.customer_name}! ${
                                                req.status === "accepted"
                                                    ? `Aceitamos sua oferta de R$ ${req.requested_price?.toFixed(2).replace(".", ",")}. Vamos combinar a entrega?`
                                                    : `Podemos oferecer por R$ ${req.counter_price?.toFixed(2).replace(".", ",")}. Topas?`
                                            }`
                                        )}`} target="_blank" rel="noopener noreferrer">
                                            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white shrink-0">
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

            {/* Modal Contraproposta */}
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
                            <div className="bg-purple-50 rounded-xl p-3 text-sm">
                                <p className="text-gray-500 text-xs">Cliente propôs:</p>
                                <p className="text-xl font-black text-purple-700">
                                    R$ {counterModal.requested_price?.toFixed(2).replace(".", ",")}
                                </p>
                                {counterModal.product_title && (
                                    <p className="text-xs text-gray-400 mt-1 truncate">{counterModal.product_title}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600">Seu valor</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">R$</span>
                                    <input
                                        type="text" inputMode="decimal" placeholder="0,00"
                                        value={counterPrice}
                                        onChange={(e) => setCounterPrice(e.target.value.replace(/[^\d,\.]/g, ""))}
                                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-bold focus:outline-none focus:border-purple-400"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-600">Mensagem (opcional)</label>
                                <textarea
                                    placeholder="Ex: Posso fazer por esse valor com entrega inclusa..."
                                    value={counterMsg}
                                    onChange={(e) => setCounterMsg(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-purple-400"
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
                                {responding === counterModal.id
                                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    : <MessageCircle className="h-4 w-4 mr-2" />}
                                Enviar Contraproposta
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
