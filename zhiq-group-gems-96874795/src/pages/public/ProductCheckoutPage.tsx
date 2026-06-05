import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
    ShoppingCart, 
    CheckCircle2, 
    ArrowLeft, 
    ShieldCheck, 
    Loader2,
    QrCode,
    Copy,
    Timer,
    Clock,
    XCircle,
    Zap,
    Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { useAuth } from "@/contexts/AuthContext";

type CheckoutStep = "details" | "payment" | "confirmed" | "failed";

export default function ProductCheckoutPage() {
    const { productId } = useParams();
    const navigate = useNavigate();

    const { user } = useAuth();
    const [product, setProduct] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [step, setStep] = useState<CheckoutStep>("details");
    const [activeOrder, setActiveOrder] = useState<any>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    // Campos de visitante (preenchidos só quando não logado)
    const [guestName, setGuestName] = useState("");
    const [guestPhone, setGuestPhone] = useState("");
    const [guestEmail, setGuestEmail] = useState("");

    // 1. Fetch Product
    useEffect(() => {
        const fetchProduct = async () => {
            if (!productId) return;
            const { data, error } = await supabase
                .from("merchant_products" as any)
                .select("id, nome, preco, descricao, imagem_url, user_id")
                .eq("id", productId)
                .single();
            
            if (error || !data) {
                toast.error("Produto não localizado.");
                navigate("/mercado");
                return;
            }
            setProduct({
                id: data.id,
                title: data.nome,
                price: data.preco,
                description: data.descricao,
                cover_image_url: data.imagem_url,
                owner_user_id: data.user_id,
                category_name: "Produto",
                condition: "new"
            });
            setIsLoading(false);
        };
        fetchProduct();
    }, [productId, navigate]);

    // 2. Poll for Payment Status
    useEffect(() => {
        if (step !== "payment" || !activeOrder?.id || isExpired) return;

        const interval = setInterval(async () => {
            const { data, error } = await supabase
                .from("purchase_intentions")
                .select("payment_status")
                .eq("id", activeOrder.id)
                .single();

            if (!error && data?.payment_status === 'paid') {
                setStep("confirmed");
                toast.success("Pagamento confirmado! Acesso liberado. 🎉");
                clearInterval(interval);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [step, activeOrder, isExpired]);

    // 3. Timer Logic
    useEffect(() => {
        if (!activeOrder || isExpired) return;
        const target = Date.now() + 30 * 60 * 1000; // 30 mins
        const updateTimer = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((target - now) / 1000));
            setTimeLeft(diff);
            if (diff <= 0) setIsExpired(true);
        };
        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [activeOrder, isExpired]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleGeneratePayment = async () => {
        if (!product || isProcessing) return;

        // Visitante (não logado) precisa preencher nome + whatsapp pra o lojista poder retornar
        const isGuest = !user;
        if (isGuest) {
            if (!guestName.trim() || !guestPhone.trim()) {
                toast.error("Preencha nome e WhatsApp para continuar.");
                return;
            }
            if (guestPhone.replace(/\D/g, "").length < 10) {
                toast.error("WhatsApp inválido. Digite com DDD.");
                return;
            }
        }

        setIsProcessing(true);

        try {
            const customerName  = isGuest ? guestName.trim() : (user!.email?.split('@')[0] || 'Cliente');
            const customerPhone = isGuest ? guestPhone.replace(/\D/g, "") : '000000000';
            const customerEmail = isGuest ? (guestEmail.trim() || null) : user!.email;
            const customerUserId = isGuest ? null : user!.id;

            // Create Purchase Intention diretamente (RPC é pra carrinho multi-item).
            const { data: intention, error: insError } = await supabase
                .from('purchase_intentions')
                .insert({
                    store_id: product.owner_user_id,
                    customer_name: customerName,
                    customer_whatsapp: customerPhone,
                    customer_email: customerEmail,
                    subtotal: product.price,
                    total_items: 1,
                    status: 'new',
                    checkout_mode: 'online_payment',
                    payment_status: 'pending',
                    customer_user_id: customerUserId,
                })
                .select()
                .single();

            if (insError) throw insError;

            // Add the item
            await supabase.from('purchase_intention_items').insert({
                intention_id: intention.id,
                product_id: product.id,
                product_title: product.title,
                product_image_url: product.cover_image_url,
                unit_price: product.price,
                quantity: 1,
                subtotal: product.price
            });

            const pixCode = `00020126580014br.gov.bcb.pix0136viagg-product-${intention.id.substring(0,8)}520400005303986540${product.price.toFixed(2)}5802BR5925VIAGG TX86009SAO PAULO62070503***6304`;
            
            setActiveOrder({ ...intention, pix_code: pixCode });
            setStep("payment");
            toast.info("Pix gerado com sucesso!");
        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao processar checkout.");
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) return <MarketLayout><div className="min-h-screen flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-emerald-500" /></div></MarketLayout>;

    return (
        <MarketLayout>
            <div className="bg-[#F5E62B] min-h-screen py-12 px-4">
                <div className="container max-w-4xl mx-auto space-y-8">
                    
                    <Button variant="ghost" onClick={() => navigate(-1)} className="font-black uppercase text-[10px] tracking-widest text-zinc-400 gap-2 mb-4">
                        <ArrowLeft className="w-4 h-4" /> Cancelar
                    </Button>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                        
                        {/* LEFT: ORDER SUMMARY */}
                        <div className="md:col-span-12 lg:col-span-7 space-y-6">
                            <Card className="border-none shadow-3xl rounded-[40px] p-8 bg-white ring-1 ring-zinc-50">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-20 h-20 bg-zinc-100 rounded-3xl overflow-hidden shadow-inner">
                                            {product.cover_image_url ? (
                                                <img src={product.cover_image_url} alt={product.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <ShoppingCart className="w-8 h-8 text-zinc-300 m-6" />
                                            )}
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-xl font-black text-zinc-900 tracking-tight uppercase leading-tight">{product.title}</h3>
                                            <div className="flex items-center gap-2">
                                                {product.is_digital && (
                                                    <span className="bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                                                        <Zap className="w-2.5 h-2.5 fill-current" /> Entrega Digital
                                                    </span>
                                                )}
                                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Condição: {product.condition}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-zinc-50" />

                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Total do Pedido</span>
                                        <div className="text-right">
                                            <span className="text-xs font-black text-zinc-900 mr-1">R$</span>
                                            <span className="text-3xl font-black text-zinc-900 tracking-tighter">{formatCurrencyBRL(product.price).replace("R$", "")}</span>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <div className="flex items-center gap-4 bg-emerald-50/50 p-6 rounded-[32px] border border-emerald-100/50">
                                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                                <div className="space-y-0.5">
                                    <p className="text-[11px] font-black text-zinc-900 uppercase tracking-tight">Compra 100% Protegida</p>
                                    <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Garantia Viagg-TX8 de satisfação ou reembolso.</p>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: PAYMENT AREA */}
                        <div className="md:col-span-12 lg:col-span-5">
                            
                            {step === "details" && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                                    <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Finalizar Compra</h2>

                                    {/* Formulário do visitante — só aparece se NÃO estiver logado */}
                                    {!user && (
                                        <div className="space-y-3 rounded-3xl bg-white p-5 border border-zinc-100 shadow-sm">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                                Seus dados (pra o lojista te contatar)
                                            </p>
                                            <div className="space-y-2">
                                                <Label htmlFor="guest-name" className="text-xs font-bold text-zinc-700">Nome *</Label>
                                                <Input id="guest-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Seu nome" className="h-11" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="guest-phone" className="text-xs font-bold text-zinc-700">WhatsApp *</Label>
                                                <Input id="guest-phone" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" className="h-11" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="guest-email" className="text-xs font-bold text-zinc-700">E-mail (opcional)</Label>
                                                <Input id="guest-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="seu@email.com" className="h-11" />
                                            </div>
                                            <p className="text-[9px] text-zinc-400 leading-relaxed pt-1">
                                                Quer salvar seus dados pra próximas compras?
                                                <button type="button" onClick={() => navigate('/auth')} className="text-emerald-600 font-bold ml-1 hover:underline">Crie uma conta</button>
                                            </p>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleGeneratePayment}
                                        disabled={isProcessing}
                                        className="w-full h-20 rounded-[28px] bg-zinc-900 hover:bg-zinc-800 text-white font-black uppercase text-sm tracking-[0.2em] shadow-2xl transition-all"
                                    >
                                        {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : "Pagar via Pix"}
                                    </Button>
                                    <p className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-loose">
                                        Liberação instantânea imediata <br /> após o processamento bancário.
                                    </p>
                                </div>
                            )}

                            {step === "payment" && activeOrder && (
                                <div className="space-y-8 animate-in zoom-in-95 duration-500">
                                    <div className="text-center space-y-4">
                                        <div className={cn(
                                            "w-16 h-16 rounded-full mx-auto flex items-center justify-center transition-all shadow-xl shadow-amber-500/10",
                                            isExpired ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500 animate-pulse"
                                        )}>
                                            {isExpired ? <XCircle className="w-8 h-8" /> : <Timer className="w-8 h-8" />}
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tighter">Aguardando Pix</h3>
                                            {timeLeft !== null && !isExpired && (
                                                <div className="inline-flex items-center gap-2 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                                                    <Clock className="w-3 h-3" />Expira em {formatTime(timeLeft)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-[40px] shadow-3xl border border-zinc-100 flex flex-col items-center gap-6">
                                        <Card className="p-4 border-none shadow-inner bg-zinc-50 rounded-3xl">
                                            <QrCode className="w-48 h-48 text-zinc-900" />
                                        </Card>
                                        
                                        <div className="w-full space-y-2">
                                            <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest text-center">Pix Copia e Cola</p>
                                            <div className="flex gap-2">
                                                <div className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl px-4 py-3 text-[10px] font-mono text-zinc-400 truncate">
                                                    {activeOrder.pix_code}
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(activeOrder.pix_code);
                                                        toast.success("Código copiado!");
                                                    }}
                                                    className="w-12 h-12 bg-zinc-900 text-white rounded-2xl flex items-center justify-center shadow-xl"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center gap-3 text-zinc-400">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Confirmando pagamento...</span>
                                    </div>
                                </div>
                            )}

                            {step === "confirmed" && (
                                <div className="text-center space-y-10 animate-in zoom-in duration-700">
                                    <div className="w-24 h-24 bg-emerald-500 text-white rounded-full mx-auto flex items-center justify-center shadow-2xl shadow-emerald-500/20 active:scale-110 transition-transform">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-4xl font-black text-zinc-900 uppercase tracking-tighter leading-tight">Compra Concluída</h3>
                                        <p className="text-zinc-500 text-sm font-medium leading-relaxed">
                                            Obrigado! Seu pagamento foi processado. Se for um produto digital, seus arquivos já estão disponíveis.
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        <Button 
                                            onClick={() => navigate("/minha-biblioteca")}
                                            className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[24px] font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-3"
                                        >
                                            <Download className="w-5 h-5" /> Acessar Meus Downloads
                                        </Button>
                                        <Button 
                                            variant="ghost"
                                            onClick={() => navigate("/mercado")}
                                            className="w-full text-zinc-400 font-black uppercase text-[10px] tracking-widest"
                                        >
                                            Continuar Comprando
                                        </Button>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>
        </MarketLayout>
    );
}
