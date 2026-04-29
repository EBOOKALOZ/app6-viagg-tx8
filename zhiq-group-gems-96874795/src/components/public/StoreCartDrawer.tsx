/**
 * StoreCartDrawer — CESTA1 Premium Cart + Checkout
 *
 * 4-step flow:
 *  1. CART     — items with image, qty, subtotal
 *  2. SIGNUP   — VisitorMiniSignup (or compact summary)
 *  3. REVIEW   — store info + payment + fee + transparency
 *  4. SUCCESS  — confirmation + WhatsApp link
 *
 * The platform does NOT process payments.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  ShoppingCart, Minus, Plus, Trash2, MessageCircle,
  Loader2, CheckCircle, Package, ChevronLeft, CreditCard, Store, QrCode,
  MapPin, Building2, Phone, Shield, AlertTriangle, Banknote, Send, Heart,
} from "lucide-react";
import { CartItem, useStoreCart } from "@/hooks/useStoreCart";
import { useStorePaymentSettings } from "@/hooks/useStorePaymentSettings";
import { useVisitorProfile, VisitorProfile } from "@/hooks/useVisitorProfile";
import { VisitorMiniSignup } from "./VisitorMiniSignup";
import { supabase } from "@/integrations/supabase/client";

// ─── Helpers ────────────────────────────
function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Step = "cart" | "signup" | "review" | "success";

// ─── Props ──────────────────────────────
interface StoreCartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  storeName: string;
  cart: ReturnType<typeof useStoreCart>;
}

export type CheckoutMode = "online_payment" | "in_store";

// ─── Store Info ─────────────────────────
interface StoreInfo {
  bairro: string | null;
  city: string | null;
  state: string | null;
  street: string | null;
  number: string | null;
  whatsapp: string | null;
  logo_url: string | null;
  fullAddress: string;
}

// ─── Component ──────────────────────────
export function StoreCartDrawer({ open, onOpenChange, storeId, storeName, cart }: StoreCartDrawerProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("cart");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>("in_store");
  const { hasDirectPayment, hasInStoreOption, settings } = useStorePaymentSettings(storeId);
  const visitor = useVisitorProfile();
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch store info from merchant_stores with profiles fallback
  useEffect(() => {
    if (!storeId) return;
    (async () => {
      try {
        const { data: s } = await (supabase.from("merchant_stores") as any)
          .select("*")
          .eq("id", storeId).single();
        if (!s) return;

        // Fallback: get missing data from profiles
        let phone: string | null = null;
        let rua = s.rua, numero = s.numero, bairro = s.bairro, cidade = s.cidade, estado = s.estado;
        let logoUrl = s.logo_url;

        if (s.user_id) {
          const { data: prof } = await (supabase.from("profiles") as any)
            .select("*")
            .eq("id", s.user_id).single();
          if (prof) {
            phone = prof.telefone || null;
            if (!logoUrl) logoUrl = prof.logo_url || null;
            if (!rua) rua = prof.rua || null;
            if (!numero) numero = prof.numero || null;
            if (!bairro) bairro = prof.bairro || null;
            if (!cidade) cidade = prof.cidade || null;
            if (!estado) estado = prof.estado || null;
          }
        }

        // Build full address
        const streetPart = [rua, numero].filter(Boolean).join(", ");
        const locationPart = [bairro, cidade].filter(Boolean).join(", ");
        const statePart = estado || "";
        const fullAddress = [streetPart, locationPart, statePart].filter(Boolean).join(" — ");

        setStoreInfo({
          bairro: bairro || null,
          city: cidade || null,
          state: estado || null,
          street: rua || null,
          number: numero || null,
          whatsapp: phone,
          logo_url: logoUrl || null,
          fullAddress,
        });
      } catch (err) {
        console.warn("[StoreCartDrawer] Failed to load store info:", err);
      }
    })();
  }, [storeId]);

  // Reset step when drawer opens
  useEffect(() => {
    if (open && !cart.isSubmitted) setStep("cart");
  }, [open]);

  // Show success on submit
  useEffect(() => {
    if (cart.isSubmitted && cart.submitResult?.success) setStep("success");
  }, [cart.isSubmitted, cart.submitResult]);

  const handleQuantityChange = async (item: CartItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      await cart.removeItem(item.id);
    } else {
      await cart.updateItem(item.id, newQty);
    }
  };

  const handleSaveNote = async (itemId: string) => {
    const item = cart.items.find(i => i.id === itemId);
    if (item) await cart.updateItem(itemId, item.quantity, noteText);
    setEditingNoteId(null);
    setNoteText("");
  };

  const platformFee = Math.round(cart.subtotal * 0.03 * 100) / 100;

  const handleFinalSubmit = async () => {
    if (!cart.cartId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await cart.submitIntention(checkoutMode, {
        name: visitor.profile.full_name,
        whatsapp: visitor.profile.whatsapp.replace(/\D/g, ""),
        email: visitor.profile.email || undefined,
        note: "",
        visitor_id: visitor.profile.id,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const storeWhatsApp = storeInfo?.whatsapp || settings.store_whatsapp || "";
  const cleanPhone = storeWhatsApp.replace(/\D/g, "").replace(/^55/, "");

  // ── STEP: SUCCESS ──
  if (step === "success" && cart.submitResult?.success) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) { cart.resetSubmit(); setStep("cart"); } onOpenChange(v); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-white flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Intenção Enviada</SheetTitle>
            <SheetDescription>Sua intenção de compra foi registrada</SheetDescription>
          </SheetHeader>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-5 shadow-lg animate-in zoom-in duration-500">
              <CheckCircle className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-black text-gray-800 mb-2">Intenção Enviada!</h2>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-5">
              A loja <strong>{storeName}</strong> recebeu sua intenção de compra e entrará em contato com você.
            </p>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 w-full max-w-xs space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Itens</span>
                <span className="font-bold text-gray-700">{cart.submitResult.total_items}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-bold text-gray-700">{formatCurrency(cart.submitResult.subtotal || 0)}</span>
              </div>
            </div>

            {/* Transparency */}
            <div className="bg-amber-50 rounded-xl p-3 w-full max-w-xs mb-5 border border-amber-100">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-700 text-left leading-relaxed">
                  A plataforma Viagg-TX8 organizou sua intenção de compra. O pagamento será feito <strong>diretamente com a loja</strong>, conforme as condições combinadas entre vocês.
                </p>
              </div>
            </div>

            {/* WhatsApp CTA */}
            {cleanPhone && (
              <a
                href={`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá ${storeName}! Acabei de enviar uma intenção de compra pela plataforma Viagg-TX8. Meu nome é ${visitor.profile.full_name}.`)}`}
                target="_blank" rel="noopener noreferrer"
                className="w-full max-w-xs py-3.5 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-xl text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 mb-3"
              >
                <Phone className="h-4 w-4" /> Falar com a Loja via WhatsApp
              </a>
            )}

            <button
              onClick={() => { cart.resetSubmit(); setStep("cart"); onOpenChange(false); navigate("/mercado"); }}
              className="w-full max-w-xs py-3 text-gray-500 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Continuar Comprando
            </button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── STEP: REVIEW ──
  if (step === "review") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-gray-50 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Resumo do Pedido</SheetTitle>
            <SheetDescription>Revise e envie sua intenção</SheetDescription>
          </SheetHeader>

          {/* Header */}
          <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] px-5 py-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("signup")} className="text-white/80 hover:text-white">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-white font-bold text-lg">Resumo da Compra</h2>
                <p className="text-white/70 text-xs">Revise antes de enviar</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Store Card */}
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                {storeInfo?.logo_url ? (
                  <img src={storeInfo.logo_url} alt={storeName} className="w-12 h-12 rounded-xl object-cover border border-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center text-white font-black text-lg">
                    {storeName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-black text-gray-800 truncate">{storeName}</h3>
                  {storeInfo?.fullAddress && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-[#FF6A00] shrink-0" />
                      <span className="truncate">{storeInfo.fullAddress}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Produtos ({cart.totalItems})
                </h4>
              </div>
              <div className="divide-y divide-gray-50">
                {cart.items.map((item) => {
                  const imgSrc = normalizeImageUrl(item.product_image_url);
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                        {imgSrc ? (
                          <img src={imgSrc} alt={item.product_title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-4 w-4 text-gray-200" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-700 truncate">{item.product_title}</p>
                        <p className="text-[11px] text-gray-400">{item.quantity}x {formatCurrency(item.product_price)}</p>
                      </div>
                      <span className="text-sm font-bold text-gray-800">{formatCurrency(item.product_price * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment Methods */}
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Pagamento direto com a loja
              </h4>

              {/* Checkout mode selector */}
              <div className="space-y-2 mb-3">
                {hasDirectPayment && (
                  <button
                    onClick={() => setCheckoutMode("online_payment")}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      checkoutMode === "online_payment"
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <QrCode className={`h-5 w-5 ${checkoutMode === "online_payment" ? "text-blue-600" : "text-gray-400"}`} />
                    <div>
                      <p className="text-sm font-bold text-gray-700">PIX / Transferência</p>
                      <p className="text-[10px] text-gray-400">Pague com os dados da loja</p>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => setCheckoutMode("in_store")}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    checkoutMode === "in_store"
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <Banknote className={`h-5 w-5 ${checkoutMode === "in_store" ? "text-emerald-600" : "text-gray-400"}`} />
                  <div>
                    <p className="text-sm font-bold text-gray-700">Pagamento Presencial</p>
                    <p className="text-[10px] text-gray-400">Dinheiro, cartão ou combinar com a loja</p>
                  </div>
                </button>
              </div>

              {/* PIX details if selected */}
              {checkoutMode === "online_payment" && settings.pix_key && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-blue-500">Chave PIX:</span>
                    <span className="font-bold text-blue-800 break-all text-right max-w-[180px]">{settings.pix_key}</span>
                  </div>
                  {settings.pix_holder_name && (
                    <div className="flex justify-between">
                      <span className="text-blue-500">Favorecido:</span>
                      <span className="font-bold text-blue-800">{settings.pix_holder_name}</span>
                    </div>
                  )}
                  {settings.bank_name && (
                    <div className="flex justify-between">
                      <span className="text-blue-500">Banco:</span>
                      <span className="font-bold text-blue-800">{settings.bank_name}</span>
                    </div>
                  )}
                  {settings.payment_instructions && (
                    <p className="text-[10px] text-blue-500 pt-1.5 border-t border-blue-200">{settings.payment_instructions}</p>
                  )}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-bold text-gray-700">{formatCurrency(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  Taxa de serviço <span className="text-[10px]">(3%)</span>
                </span>
                <span className="font-medium text-gray-500">{formatCurrency(platformFee)}</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-gray-100">
                <span className="font-bold text-gray-800">Total</span>
                <span className="font-black text-xl text-[#FF6A00]">{formatCurrency(cart.subtotal)}</span>
              </div>
              <p className="text-[9px] text-gray-300 pt-1">
                * A taxa de serviço é cobrada da loja, não do comprador
              </p>
            </div>

            {/* Transparency */}
            <div className="bg-amber-50/70 rounded-xl p-4 border border-amber-100">
              <div className="flex items-start gap-2.5">
                <Shield className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-amber-700">Transparência Total</p>
                  <ul className="text-[11px] text-amber-600 space-y-1 leading-relaxed">
                    <li>• A plataforma atua como <strong>vitrine digital</strong> e organiza a intenção de compra</li>
                    <li>• <strong>Não processamos</strong> nem recebemos valores da transação</li>
                    <li>• O pagamento é feito <strong>diretamente com a loja</strong></li>
                    <li>• A loja define os meios e instruções de pagamento</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="border-t border-gray-200 bg-white p-4 space-y-2">
            <button
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-base shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Enchendo o Carrinho...</>
              ) : (
                <><Send className="h-5 w-5" /> Enviar Intenção para a Loja</>
              )}
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              Ao enviar, a loja receberá seus dados e os produtos selecionados
            </p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── STEP: SIGNUP ──
  if (step === "signup") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-white flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Mini-Cadastro</SheetTitle>
            <SheetDescription>Seus dados para enviar a intenção</SheetDescription>
          </SheetHeader>

          {/* Header */}
          <div className="bg-zinc-900 px-5 py-4 shadow-xl">
            <div className="flex gap-3">
              <button onClick={() => setStep("cart")} className="text-white/40 hover:text-white transition-colors mt-0.5">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <div className="flex-1">
                <h2 className="text-white font-black text-lg leading-tight uppercase tracking-tight italic">Seus Dados</h2>
                <p className="text-emerald-500 font-bold text-[10px] uppercase tracking-widest mb-2">{cart.totalItems} item(ns) • {formatCurrency(cart.subtotal)}</p>
                {/* Lista de Produtos em verde */}
                <div className="space-y-1 border-t border-emerald-900/30 pt-2">
                  {cart.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="text-emerald-400/90 line-clamp-1 flex-1">• {item.quantity}x {item.product_title}</span>
                      <span className="text-emerald-500/80 font-medium shrink-0">{formatCurrency(item.product_price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <VisitorMiniSignup
              visitor={visitor}
              storeName={storeName}
              onComplete={() => setStep("review")}
              cartSummaryNode={
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-emerald-800 mb-1 flex justify-between">
                    <span>Itens do Pedido</span>
                    <span className="text-emerald-600">{cart.totalItems} item(ns)</span>
                  </p>
                  {cart.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-2 text-[11px] text-emerald-700">
                      <span className="line-clamp-1 flex-1">• {item.quantity}x {item.product_title}</span>
                      <span className="font-bold shrink-0">{formatCurrency(item.product_price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1.5 mt-1.5 border-t border-emerald-200/40 text-[12px] font-black text-emerald-800">
                    <span>Subtotal</span>
                    <span>{formatCurrency(cart.subtotal)}</span>
                  </div>
                </div>
              }
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── STEP: CART (default) ──
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-gray-50 flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>Cesta de Compras</SheetTitle>
          <SheetDescription>Itens selecionados da loja</SheetDescription>
        </SheetHeader>

          {/* Header */}
          <div className="bg-zinc-900 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                  {storeInfo?.logo_url ? (
                    <img src={storeInfo.logo_url} alt={storeName} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingCart className="h-5 w-5 text-emerald-500" />
                  )}
                </div>
                <div>
                  <h2 className="text-white font-black text-lg leading-tight uppercase tracking-tight italic">Cesta de Compras</h2>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">{storeName}</p>
                </div>
              </div>
              {cart.totalItems > 0 && (
                <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-lg shadow-emerald-500/20">
                  {cart.totalItems} ITEM
                </span>
              )}
            </div>
          </div>

          {/* Store info mini-banner */}
          {storeInfo && storeInfo.fullAddress && (
            <div className="mx-4 mt-3 bg-white rounded-2xl p-3 border border-zinc-100 flex items-center gap-2 shadow-xl shadow-zinc-200/20">
              {storeInfo.logo_url ? (
                <img src={storeInfo.logo_url} alt={storeName} className="w-8 h-8 rounded-lg object-cover border border-zinc-50" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-black text-[10px]">
                  {storeName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-zinc-900 truncate uppercase tracking-tight">{storeName}</p>
                <p className="text-[9px] text-zinc-400 flex items-center gap-1 truncate font-bold uppercase tracking-widest">
                  <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                  {storeInfo.fullAddress}
                </p>
              </div>
            </div>
          )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {cart.loadingItems ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mb-3" />
              <p className="text-sm text-gray-400">Carregando cesta...</p>
            </div>
          ) : cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-600 mb-1">Cesta vazia</h3>
              <p className="text-sm text-gray-400 text-center">
                Adicione produtos desta loja para começar.
              </p>
              <button
                onClick={() => { onOpenChange(false); }}
                className="mt-6 px-6 py-2.5 bg-[#FF6A00] text-white font-bold rounded-xl text-sm hover:bg-[#e65c00] transition-colors"
              >
                Ver Produtos
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {cart.items.map((item) => {
                const imgSrc = normalizeImageUrl(item.product_image_url);
                return (
                  <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                    <div className="flex gap-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                        {imgSrc ? (
                          <img src={imgSrc} alt={item.product_title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-6 w-6 text-gray-200" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-gray-800 line-clamp-2 leading-snug">
                          {item.product_title}
                        </h4>
                        <p className="text-sm font-bold text-[#FF6A00] mt-0.5">
                          {formatCurrency(item.product_price)}
                        </p>
                      </div>
                      <button
                        onClick={() => cart.removeItem(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors self-start p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                      <div className="flex items-center gap-0 bg-gray-50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => handleQuantityChange(item, -1)}
                          disabled={cart.isUpdating}
                          className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="px-3 py-1.5 text-sm font-bold text-gray-800 min-w-[2rem] text-center bg-white border-x border-gray-100">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleQuantityChange(item, 1)}
                          disabled={cart.isUpdating}
                          className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-gray-700">
                        {formatCurrency(item.product_price * item.quantity)}
                      </span>
                    </div>

                    {editingNoteId === item.id ? (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Observação..."
                          className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/30"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveNote(item.id)}
                          className="px-3 py-2 bg-[#FF6A00] text-white text-xs font-bold rounded-lg"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingNoteId(item.id); setNoteText(item.customer_note || ""); }}
                        className="mt-2 text-[10px] text-gray-400 hover:text-[#FF6A00] transition-colors flex items-center gap-1"
                      >
                        <MessageCircle className="h-3 w-3" />
                        {item.customer_note || "Adicionar observação"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.items.length > 0 && (
          <div className="border-t border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Subtotal ({cart.totalItems} item{cart.totalItems !== 1 ? "s" : ""})</span>
              <span className="text-xl font-black text-gray-800">{formatCurrency(cart.subtotal)}</span>
            </div>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setStep("signup"); }}
              className="w-full py-4 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white font-black rounded-xl text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Send className="h-5 w-5" /> Finalizar Pedido
            </button>

            <p className="text-[10px] text-gray-400 text-center flex items-center justify-center gap-1">
              <Shield className="h-3 w-3" /> Pagamento feito diretamente com a loja
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
