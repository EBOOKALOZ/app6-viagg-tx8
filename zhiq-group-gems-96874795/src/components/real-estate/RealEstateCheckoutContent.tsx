import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
    CreditCard, 
    CheckCircle2, 
    ArrowLeft, 
    ShieldCheck, 
    Building2, 
    Loader2,
    Calendar,
    Star,
    X,
    QrCode,
    Copy,
    Timer,
    Clock,
    XCircle,
    CheckCircle,
    Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

type CheckoutStep = "select" | "awaiting" | "confirmed" | "failed";
type PaymentMethod = "pix" | "boleto" | "cartao";

const formatCurrency = (amount: number) => {
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface RealEstateCheckoutContentProps {
    listingId?: string;
    onBack?: () => void;
    onSuccess?: () => void;
    layout?: 'public' | 'dashboard';
}

export function RealEstateCheckoutContent({ listingId: propListingId, onBack, onSuccess, layout = 'public' }: RealEstateCheckoutContentProps) {
    const { listingId: paramListingId } = useParams();
    const listingId = propListingId || paramListingId;
    const navigate = useNavigate();
    
    const [listing, setListing] = useState<any>(null);
    const [pkg, setPkg] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("select");
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
    const [activeOrder, setActiveOrder] = useState<any>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    const [purchaseType, setPurchaseType] = useState<'real_estate_listing' | 'real_estate_package' | 'merchant_product'>('real_estate_listing');

    useEffect(() => {
        const fetchDetails = async () => {
            if (!listingId) return;
            
            try {
                // 1. Try Fetching as Listing
                const { data: listingData, error: listingError } = await supabase
                    .from('real_estate_listings')
                    .select('*, visibility_package_id')
                    .eq('id', listingId)
                    .maybeSingle();

                if (listingData) {
                    setListing(listingData);

                    // If already published, go to success
                    if (listingData.visibility_status === 'published' || listingData.visibility_status === 'payment_confirmed') {
                        setCheckoutStep("confirmed");
                    }

                    // Fetch Package linked to listing
                    if (listingData.visibility_package_id) {
                        const { data: pkgData, error: pkgError } = await supabase
                            .from('real_estate_credit_packages')
                            .select('*')
                            .eq('id', listingData.visibility_package_id)
                            .single();
                        
                        if (pkgError) throw pkgError;
                        setPkg(pkgData);
                    }
                } else {
                    // 2. Try Fetching as Package (Direct Purchase)
                    const { data: pkgData, error: pkgError } = await supabase
                        .from('real_estate_credit_packages')
                        .select('*')
                        .eq('id', listingId)
                        .maybeSingle();

                    if (pkgData) {
                        setPkg(pkgData);
                        setPurchaseType('real_estate_package');
                    } else {
                        // 3. Try Fetching as Merchant Product
                        const { data: merchantPkg, error: merchantError } = await supabase
                            .from('merchant_credit_products')
                            .select('*')
                            .eq('id', listingId)
                            .maybeSingle();
                        
                        if (merchantPkg) {
                            setPkg({
                                id: merchantPkg.id,
                                name: merchantPkg.name,
                                price_brl: merchantPkg.price_brl || (merchantPkg.price_cents / 100),
                                credits_amount: merchantPkg.credits_base || 0,
                                bonus_credits: merchantPkg.credits_bonus || 0,
                            });
                            setPurchaseType('merchant_product');
                        } else {
                            throw new Error("ID não localizado como anúncio, pacote imobiliário ou produto marketplace.");
                        }
                    }
                }
            } catch (error: any) {
                console.error("[RealEstateCheckout] Erro ao carregar detalhes:", error);
                toast.error("Não foi possível carregar os detalhes do pedido.");
                if (onBack) onBack(); else navigate('/anunciante/creditos');
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetails();
    }, [listingId, navigate, onBack]);

    // Polling for Payment Status
    useEffect(() => {
        if (checkoutStep !== "awaiting" || !activeOrder?.id || isExpired) return;

        const interval = setInterval(async () => {
            const table = purchaseType === 'merchant_product' ? 'credit_purchases' : 'real_estate_credit_purchases';
            const { data, error } = await supabase
                .from(table as any)
                .select('*')
                .eq('id', activeOrder.id)
                .single();

            if (error) return;

            const isPaid = data.payment_status === 'paid' || data.status === 'paid';
            const isFailed = data.payment_status === 'failed' || data.payment_status === 'cancelled' || data.status === 'failed' || data.status === 'cancelled';

            if (isPaid) {
                if (listingId && listing) {
                    const { error: updateError } = await supabase
                        .from('real_estate_listings')
                        .update({ 
                            visibility_status: 'published',
                            last_payment_id: data.id,
                            published_at: new Date().toISOString()
                        })
                        .eq('id', listingId);

                    if (!updateError) {
                        setListing(prev => ({ ...prev, visibility_status: 'published' }));
                        setCheckoutStep("confirmed");
                        toast.success("Anúncio publicado com sucesso! 🎉");
                        if (onSuccess) onSuccess();
                        clearInterval(interval);
                    }
                } else {
                    setCheckoutStep("confirmed");
                    toast.success("Créditos adicionados com sucesso! 💎");
                    if (onSuccess) onSuccess();
                    clearInterval(interval);
                }
            } else if (isFailed) {
                setCheckoutStep("failed");
                clearInterval(interval);
            } else if (data.expires_at && new Date(data.expires_at) < new Date()) {
                setIsExpired(true);
                clearInterval(interval);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [checkoutStep, activeOrder, listingId, isExpired, listing, onSuccess]);

    useEffect(() => {
        if (!activeOrder?.expires_at || isExpired) {
            setTimeLeft(null);
            return;
        }
        const target = new Date(activeOrder.expires_at).getTime();
        const updateTimer = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((target - now) / 1000));
            setTimeLeft(diff);
            if (diff <= 0) setIsExpired(true);
        };
        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [activeOrder?.expires_at, isExpired]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleConfirmPurchase = async () => {
        if (!pkg || isProcessing) return;
        setIsProcessing(true);

        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error("Usuário não autenticado");

            const pixCode = paymentMethod === "pix"
                ? `00020126580014br.gov.bcb.pix0136viagg-real-estate-${Date.now()}520400005303986540${pkg.price_brl.toFixed(2)}5802BR5925VIAGG TX86009SAO PAULO62070503***6304`
                : null;

            const boletoLine = paymentMethod === "boleto"
                ? `23793.38128 60000.000${Math.floor(Math.random() * 90000000 + 10000000)} ${Math.floor(Math.random() * 9 + 1)} ${Math.floor(Date.now() / 1000).toString().slice(-8)}`
                : null;

            const providerReference = pixCode || boletoLine || `card_${Date.now()}`;
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

            const purchasePayload: any = {
                owner_user_id: userData.user.id,
                package_id: pkg.id,
                credits_base: pkg.credits_amount || 0,
                credits_bonus: pkg.bonus_credits || 0,
                credits_total: (pkg.credits_amount || 0) + (pkg.bonus_credits || 0),
                amount_brl: pkg.price_brl || 0,
                payment_status: 'awaiting_payment',
                provider_name: paymentMethod,
                provider_reference: providerReference,
                // NOTA: a tabela não tem coluna expires_at — vai no metadata.
                metadata: {
                    pix_code: pixCode,
                    boleto_line: boletoLine,
                    expires_at: expiresAt,
                    listing_id: listing ? listingId : null,
                    is_direct_package: !listing
                }
            };

            let purchase: any = null;
            let purchaseError: any = null;

            if (purchaseType === 'merchant_product') {
                const merchantPayload: any = {
                    store_id: null, // Will be filled by trigger or manually if we have store context
                    product_name: pkg.name,
                    amount_paid: pkg.price_brl,
                    credits_granted: (pkg.credits_amount || 0) + (pkg.bonus_credits || 0),
                    status: 'awaiting_payment',
                    provider_name: paymentMethod,
                    provider_payment_id: providerReference,
                    metadata: {
                        product_id: pkg.id,
                        pix_code: pixCode,
                        boleto_line: boletoLine,
                    }
                };

                // Attempt to find store_id
                const { data: storeInfo } = await supabase.from('merchant_stores').select('id').eq('user_id', userData.user.id).maybeSingle();
                if (storeInfo) merchantPayload.store_id = storeInfo.id;

                const { data: merchantOrder, error: merchantErr } = await (supabase
                    .from('credit_purchases')
                    .insert(merchantPayload)
                    .select()
                    .maybeSingle() as any);
                
                if (merchantErr) throw merchantErr;
                purchase = merchantOrder;
            } else {
                const { data: rePurchase, error: reError } = await (supabase
                    .from('real_estate_credit_purchases')
                    .insert(purchasePayload)
                    .select()
                    .maybeSingle() as any);
                
                purchase = rePurchase;
                purchaseError = reError;
            }
            if (!purchase) throw new Error("Falha ao criar registro de compra.");

            setIsExpired(false);
            setActiveOrder({ ...purchase, pix_code: pixCode, boleto_line: boletoLine, expires_at: expiresAt });
            setCheckoutStep("awaiting");
            toast.info("Cobrança gerada! Aguardando pagamento...", { duration: 3000 });
        } catch (error: any) {
            console.error("[RealEstateCheckout] Erro ao gerar cobrança:", error);
            toast.error("Erro ao gerar cobrança. Tente novamente.");
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
            </div>
        );
    }

    const isListingCheckout = !!listing;

    return (
        <div className={cn(
            "max-w-4xl mx-auto px-4",
            layout === 'public' ? "py-12" : "py-4"
        )}>
            <div className={cn(
                "bg-white rounded-[40px] overflow-hidden border border-zinc-100",
                layout === 'public' ? "shadow-2xl shadow-orange-500/5" : "shadow-xl border-zinc-200"
            )}>
                <div className="grid grid-cols-1 md:grid-cols-2 min-h-[500px]">
                    
                    {/* ── LEFT COLUMN: DETAILS ── */}
                    <div className={cn(
                        "p-10 border-r border-zinc-100 transition-colors duration-500", 
                        checkoutStep === "confirmed" ? "bg-emerald-50/30" : "bg-zinc-50"
                    )}>
                        <div className="space-y-8">
                            <div className="space-y-2">
                                <h2 className="text-2xl font-black text-zinc-900 tracking-tighter uppercase">
                                    {checkoutStep === "confirmed" ? "Pagamento Concluído" : "Resumo do Pedido"}
                                </h2>
                                <p className="text-zinc-500 font-medium text-sm leading-tight">
                                    {checkoutStep === "confirmed" 
                                        ? (isListingCheckout ? "Seu imóvel já está brilhando no mercado!" : "Seus créditos já foram creditados na conta.")
                                        : (isListingCheckout ? "Confirme os detalhes do seu plano de visibilidade." : "Confirme os dados da sua recarga de créditos.")}
                                </p>
                            </div>

                            <div className={cn(
                                "p-6 rounded-3xl bg-white border shadow-xl transition-all duration-500 space-y-6",
                                checkoutStep === "confirmed" ? "border-emerald-200 shadow-emerald-500/5" : "border-orange-100 shadow-orange-500/5"
                            )}>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
                                            checkoutStep === "confirmed" ? "bg-emerald-50 text-emerald-500" : "bg-orange-50 text-orange-600"
                                        )}>
                                            {checkoutStep === "confirmed" ? <CheckCircle2 className="w-7 h-7" /> : <Star className="w-7 h-7 fill-current" />}
                                        </div>
                                        <div>
                                            <h3 className="font-black text-lg text-zinc-900 uppercase tracking-tighter">{pkg?.name}</h3>
                                            <span className={cn(
                                                "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                                                checkoutStep === "confirmed" ? "text-emerald-600 bg-emerald-50" : "text-zinc-400 bg-zinc-100"
                                            )}>
                                                {checkoutStep === "confirmed" ? "Confirmado" : "Aguardando"}
                                            </span>
                                        </div>
                                    </div>

                                    {!isListingCheckout && (
                                       <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                                          <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-1">Conteúdo</p>
                                          <p className="text-sm font-bold text-zinc-700">💎 {(pkg?.credits_amount || 0) + (pkg?.bonus_credits || 0)} créditos inclusos</p>
                                       </div>
                                    )}
                                </div>

                                <div className="pt-6 border-t border-zinc-100 flex items-center justify-between font-black">
                                   <span className="text-zinc-400 uppercase text-[10px] tracking-[0.2em]">Total</span>
                                   <span className="text-3xl text-zinc-900 tracking-tighter">
                                      {formatCurrency(pkg?.price_brl || 0)}
                                   </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 text-zinc-400">
                                <ShieldCheck className={cn("w-5 h-5 shrink-0", checkoutStep === "confirmed" && "text-emerald-500")} />
                                <p className="text-[10px] leading-relaxed font-bold uppercase tracking-widest">
                                    Transação Segura • Viagg Pay Antigravity
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT COLUMN: ACTION ── */}
                    <div className="p-10 flex flex-col justify-center bg-white">
                        
                        {/* STEP: SELECT */}
                        {checkoutStep === "select" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em]">Pagamento</span>
                                        <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tighter">Escolha o método</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <button 
                                            onClick={() => setPaymentMethod("pix")}
                                            className={cn(
                                                "flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all gap-3",
                                                paymentMethod === "pix" ? "border-orange-500 bg-orange-100/30 text-orange-600" : "border-zinc-100 text-zinc-400 grayscale opacity-60 hover:border-zinc-200"
                                            )}
                                        >
                                            <QrCode className="w-8 h-8" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">PIX</span>
                                        </button>
                                        <button 
                                            onClick={() => setPaymentMethod("cartao")}
                                            className={cn(
                                                "flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all gap-3",
                                                paymentMethod === "cartao" ? "border-orange-500 bg-orange-100/30 text-orange-600" : "border-zinc-100 text-zinc-400 grayscale opacity-60 hover:border-zinc-200"
                                            )}
                                        >
                                            <CreditCard className="w-8 h-8" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Cartão</span>
                                        </button>
                                    </div>
                                </div>

                                <Button 
                                    onClick={handleConfirmPurchase}
                                    disabled={isProcessing}
                                    className="w-full h-16 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-orange-500/20 active:scale-[0.98] transition-all"
                                >
                                    {isProcessing ? (
                                        <><Loader2 className="w-6 h-6 animate-spin mr-3" /> Gerando...</>
                                    ) : "Confirmar e Pagar Agora"}
                                </Button>
                                
                                <p className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest leading-loose">
                                    {isListingCheckout 
                                        ? "A liberação do seu anúncio ocorrerá \nimediatamente após a confirmação."
                                        : "Seus créditos estarão disponíveis \nimediatamente após o pagamento."}
                                </p>
                            </div>
                        )}

                        {/* STEP: AWAITING */}
                        {checkoutStep === "awaiting" && activeOrder && (
                            <div className="space-y-8 animate-in zoom-in-95 duration-500">
                                <div className="text-center space-y-4">
                                    <div className={cn(
                                        "w-16 h-16 rounded-full mx-auto flex items-center justify-center transition-all",
                                        isExpired ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500 animate-pulse"
                                    )}>
                                        {isExpired ? <XCircle className="w-8 h-8" /> : <Timer className="w-8 h-8" />}
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tighter">
                                            {isExpired ? "Cobrança Expirada" : "Aguardando Pagamento"}
                                        </h3>
                                        <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest">
                                            {isExpired ? "O código não é mais válido" : "Escaneie o código abaixo"}
                                        </p>
                                    </div>
                                    
                                    {timeLeft !== null && !isExpired && (
                                        <div className="inline-flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">
                                            <Clock className="w-3 h-3 text-orange-500" />
                                            Expira em {formatTime(timeLeft)}
                                        </div>
                                    )}
                                </div>

                                {paymentMethod === "pix" && (
                                    <div className={cn("space-y-6 transition-all", isExpired && "opacity-20 grayscale pointer-events-none")}>
                                        <div className="bg-zinc-900 p-6 rounded-3xl flex flex-col items-center gap-4 shadow-2xl">
                                            <div className="bg-white p-2 rounded-2xl">
                                               <QrCode className="w-40 h-40 text-zinc-900" />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest text-center">Copia e Cola</p>
                                            <div className="flex gap-2">
                                                <div className="flex-1 bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-3 text-[10px] font-mono text-zinc-400 truncate">
                                                    {activeOrder.pix_code}
                                                </div>
                                                <button 
                                                    disabled={isExpired}
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(activeOrder.pix_code);
                                                        toast.success("Código copiado!");
                                                    }}
                                                    className="w-12 h-12 bg-zinc-900 text-white rounded-xl flex items-center justify-center hover:bg-black transition-colors disabled:opacity-50"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isExpired ? (
                                    <div className="space-y-4">
                                        <Button 
                                            onClick={handleConfirmPurchase}
                                            className="w-full h-14 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black text-sm uppercase shadow-xl"
                                        >
                                            Gerar Novo QR Code
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            onClick={() => setCheckoutStep("select")}
                                            className="w-full text-zinc-400 hover:text-zinc-600 font-bold text-xs uppercase"
                                        >
                                            Escolher outro método
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-center gap-2 text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Sincronizando com Banco...
                                        </div>
                                        
                                        <Button 
                                            variant="ghost" 
                                            onClick={() => setCheckoutStep("select")}
                                            className="w-full text-zinc-400 hover:text-zinc-600 font-bold text-xs uppercase"
                                        >
                                            Mudar método
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* STEP: CONFIRMED */}
                        {checkoutStep === "confirmed" && (
                            <div className="text-center space-y-8 animate-in zoom-in duration-500">
                                <div className="w-24 h-24 bg-emerald-500 text-white rounded-full mx-auto flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                                    <CheckCircle2 className="w-12 h-12" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter">Tudo Pronto!</h3>
                                    <p className="text-zinc-500 text-sm font-medium">
                                        {isListingCheckout ? "Seu imóvel já está sendo exibido na vitrine pública." : "Seu pacote de créditos já foi ativado com sucesso!"}
                                    </p>
                                </div>
                                <Button 
                                    onClick={() => {
                                        if (onSuccess) {
                                            onSuccess();
                                        } else {
                                            navigate(isListingCheckout ? '/mercado' : '/anunciante/mensagens');
                                        }
                                    }}
                                    className="w-full h-16 bg-zinc-900 hover:bg-black text-white rounded-2xl font-black text-lg shadow-xl active:scale-[0.98] transition-all"
                                >
                                    {isListingCheckout ? 'Ver na Vitrine' : 'Ir para Mensagens'}
                                </Button>
                            </div>
                        )}

                        {/* STEP: FAILED */}
                        {checkoutStep === "failed" && (
                            <div className="text-center space-y-8 animate-in fade-in duration-500">
                                <div className="w-24 h-24 bg-red-50 text-red-500 rounded-full mx-auto flex items-center justify-center">
                                    <XCircle className="w-12 h-12" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">Ops! Algo deu errado</h3>
                                    <p className="text-zinc-500 text-sm font-medium">Não conseguimos confirmar seu pagamento.</p>
                                </div>
                                <Button 
                                    onClick={() => setCheckoutStep("select")}
                                    className="w-full h-16 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-red-500/20"
                                >
                                    Tentar Novamente
                                </Button>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}
