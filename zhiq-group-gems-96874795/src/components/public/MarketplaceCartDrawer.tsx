/**
 * MarketplaceCartDrawer — Unified cart drawer for multi-store shopping
 *
 * Shows items grouped by store. At checkout, sends contact to each store.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  ShoppingCart, Minus, Plus, Trash2, Loader2, Package,
  Store, ChevronRight, MessageCircle, CheckCircle, User, Phone,
} from "lucide-react";
import { FormDisclaimerStrip } from "@/components/public/FormDisclaimerStrip";
import { StoreGroup, useMarketplaceCart } from "@/hooks/useMarketplaceCart";

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

// ─── Props ──────────────────────────────
interface MarketplaceCartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: ReturnType<typeof useMarketplaceCart>;
}

// ─── Component ──────────────────────────
export function MarketplaceCartDrawer({ open, onOpenChange, cart }: MarketplaceCartDrawerProps) {
  const navigate = useNavigate();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [checkoutStep, setCheckoutStep] = useState<"cart" | "form" | "submitting" | "success">("cart");
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [submittedCount, setSubmittedCount] = useState(0);

  const handleSaveNote = async (itemId: string) => {
    const item = cart.items.find(i => i.id === itemId);
    if (item) {
      await cart.updateItem(itemId, item.quantity, noteText);
    }
    setEditingNoteId(null);
    setNoteText("");
  };

  const handleSubmitOrder = async () => {
    if (!customerName.trim() || !customerWhatsapp.trim()) return;
    // Save count BEFORE submitting (cart will be cleared after)
    setSubmittedCount(cart.storeCount);
    setCheckoutStep("submitting");

    // Get unique cart_ids from items
    const cartIds = [...new Set(cart.items.map(i => i.cart_id))];

    for (const cartId of cartIds) {
      try {
        const { data, error } = await supabase.rpc("submit_marketplace_order", {
          p_cart_id: cartId,
          p_customer_name: customerName.trim(),
          p_customer_whatsapp: customerWhatsapp.trim(),
          p_checkout_mode: "in_store",
        });
        if (error) console.error("[checkout] RPC error for cart", cartId, error);
        else if (!(data as any)?.success) console.error("[checkout] RPC failed for cart", cartId, data);
      } catch (err) {
        console.error("[checkout] exception for cart", cartId, err);
      }
    }

    setCheckoutStep("success");
    cart.refetch();
  };

  // Reset on close
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setCheckoutStep("cart");
      setCustomerName("");
      setCustomerWhatsapp("");
    }
    onOpenChange(v);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-gray-50 flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>Sua Cesta</SheetTitle>
          <SheetDescription>Itens selecionados do marketplace</SheetDescription>
        </SheetHeader>

        {/* ═══ HEADER ═══ */}
        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">Sua Cesta</h2>
                <p className="text-white/70 text-xs">
                  {cart.storeCount > 0
                    ? `${cart.storeCount} loja${cart.storeCount !== 1 ? "s" : ""} • ${cart.totalItems} item${cart.totalItems !== 1 ? "s" : ""}`
                    : "Nenhum item"}
                </p>
              </div>
            </div>
            {cart.totalItems > 0 && (
              <span className="bg-white text-[#FF6A00] text-xs font-black px-2.5 py-1 rounded-full">
                {cart.totalItems}
              </span>
            )}
          </div>
        </div>

        {/* ═══ SUCCESS SCREEN ═══ */}
        {checkoutStep === "success" ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">Pedido Enviado!</h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              Seu pedido foi enviado para <b>{submittedCount} loja{submittedCount !== 1 ? "s" : ""}</b>.
            </p>
            <p className="text-xs text-gray-400 text-center mb-6">
              As lojas receberão sua intenção de compra e entrarão em contato pelo WhatsApp.
            </p>
            <button
              onClick={() => { handleOpenChange(false); navigate("/mercado"); }}
              className="px-6 py-3 bg-[#FF6A00] text-white font-bold rounded-xl text-sm hover:bg-[#e65c00] transition-colors"
            >
              Continuar Explorando
            </button>
          </div>
        ) : checkoutStep === "submitting" ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-[#FF6A00] mb-4" />
            <p className="text-sm font-bold text-gray-600">Enviando pedido...</p>
            <p className="text-xs text-gray-400 mt-1">Notificando as lojas</p>
          </div>
        ) : checkoutStep === "form" ? (
          /* ═══ CUSTOMER INFO FORM ═══ */
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Seus Dados</h3>
              <p className="text-xs text-gray-400 mb-4">Para que as lojas entrem em contato com você</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  <User className="h-3.5 w-3.5 inline mr-1" /> Seu Nome *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/30 focus:border-[#FF6A00]"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  <Phone className="h-3.5 w-3.5 inline mr-1" /> WhatsApp *
                </label>
                <input
                  type="tel"
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(e.target.value)}
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/30 focus:border-[#FF6A00]"
                />
              </div>
            </div>

            <FormDisclaimerStrip />

            {/* Order summary */}
            <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-2 mt-4">
              <p className="text-xs font-bold text-gray-500 uppercase">Resumo</p>
              {cart.storeGroups.map(g => (
                <div key={g.store_id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[200px]">
                    <Store className="h-3 w-3 inline mr-1" />{g.store_name} ({g.totalItems} item{g.totalItems !== 1 ? "s" : ""})
                  </span>
                  <span className="font-bold text-gray-700">{formatCurrency(g.subtotal)}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-600">Total</span>
                <span className="text-lg font-black text-gray-800">{formatCurrency(cart.subtotal)}</span>
              </div>
            </div>
          </div>
        ) : (
          /* ═══ ITEMS GROUPED BY STORE ═══ */
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
                  Adicione produtos do mercado para começar.
                </p>
                <button
                  onClick={() => { handleOpenChange(false); navigate("/mercado"); }}
                  className="mt-6 px-6 py-2.5 bg-[#FF6A00] text-white font-bold rounded-xl text-sm hover:bg-[#e65c00] transition-colors"
                >
                  Explorar o Mercado
                </button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {cart.storeGroups.map((group) => (
                  <StoreGroupSection
                    key={group.store_id}
                    group={group}
                    cart={cart}
                    editingNoteId={editingNoteId}
                    noteText={noteText}
                    onEditNote={(id) => { setEditingNoteId(id); setNoteText(cart.items.find(i => i.id === id)?.customer_note || ""); }}
                    onNoteTextChange={setNoteText}
                    onSaveNote={handleSaveNote}
                    onNavigateStore={() => { handleOpenChange(false); navigate(`/loja/${group.store_id}`); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ FOOTER ═══ */}
        {cart.items.length > 0 && checkoutStep === "cart" && (
          <div className="border-t border-gray-200 bg-white p-4 space-y-3">
            {cart.storeGroups.length > 1 && (
              <div className="space-y-1">
                {cart.storeGroups.map(g => (
                  <div key={g.store_id} className="flex items-center justify-between text-xs text-gray-400">
                    <span className="truncate max-w-[180px]">{g.store_name}</span>
                    <span className="font-bold">{formatCurrency(g.subtotal)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-100 my-1" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Total ({cart.totalItems} item{cart.totalItems !== 1 ? "s" : ""} • {cart.storeCount} loja{cart.storeCount !== 1 ? "s" : ""})
              </span>
              <span className="text-xl font-black text-gray-800">{formatCurrency(cart.subtotal)}</span>
            </div>

            <button
              onClick={() => setCheckoutStep("form")}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white font-bold rounded-xl text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-4 w-4" />
              Enviar Pedido para {cart.storeCount > 1 ? `${cart.storeCount} Lojas` : "a Loja"}
            </button>

            <button
              onClick={() => { handleOpenChange(false); navigate("/mercado"); }}
              className="w-full py-2.5 px-4 text-gray-500 font-medium rounded-xl text-xs hover:bg-gray-50 transition-colors"
            >
              ＋ Explorar Mais Produtos
            </button>
          </div>
        )}

        {/* ═══ FORM FOOTER ═══ */}
        {checkoutStep === "form" && (
          <div className="border-t border-gray-200 bg-white p-4 space-y-2">
            <button
              onClick={handleSubmitOrder}
              disabled={!customerName.trim() || !customerWhatsapp.trim()}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="h-4 w-4" />
              Confirmar Pedido ({formatCurrency(cart.subtotal)})
            </button>
            <button
              onClick={() => setCheckoutStep("cart")}
              className="w-full py-2 text-gray-400 text-xs font-medium hover:text-gray-600 transition-colors"
            >
              ← Voltar para a cesta
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Store Group Section ────────────────
function StoreGroupSection({
  group, cart, editingNoteId, noteText,
  onEditNote, onNoteTextChange, onSaveNote, onNavigateStore,
}: {
  group: StoreGroup;
  cart: ReturnType<typeof useMarketplaceCart>;
  editingNoteId: string | null;
  noteText: string;
  onEditNote: (id: string) => void;
  onNoteTextChange: (text: string) => void;
  onSaveNote: (id: string) => void;
  onNavigateStore: () => void;
}) {
  const logoSrc = normalizeImageUrl(group.store_logo);

  return (
    <div>
      {/* Store header */}
      <button
        onClick={onNavigateStore}
        className="flex items-center gap-2 mb-2 group/store hover:opacity-80 transition-opacity"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center overflow-hidden">
          {logoSrc ? (
            <img src={logoSrc} alt={group.store_name} className="w-full h-full object-cover" />
          ) : (
            <Store className="h-3.5 w-3.5 text-white" />
          )}
        </div>
        <span className="text-xs font-bold text-gray-600 group-hover/store:text-[#FF6A00] transition-colors">
          {group.store_name}
        </span>
        <ChevronRight className="h-3 w-3 text-gray-300" />
        <span className="text-[10px] text-gray-400 ml-auto">
          {formatCurrency(group.subtotal)}
        </span>
      </button>

      {/* Items */}
      <div className="space-y-2">
        {group.items.map((item) => {
          const imgSrc = normalizeImageUrl(item.product_image_url);
          return (
            <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="flex gap-3">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                  {imgSrc ? (
                    <img src={imgSrc} alt={item.product_title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-5 w-5 text-gray-200" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug">
                    {item.product_title}
                  </h4>
                  <p className="text-xs font-bold text-[#FF6A00] mt-0.5">
                    {formatCurrency(item.product_price)}
                  </p>
                </div>
                <button
                  onClick={() => cart.removeItem(item.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors self-start p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Quantity controls */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                <div className="flex items-center gap-0 bg-gray-50 rounded-lg overflow-hidden">
                  <button
                    onClick={() => {
                      if (item.quantity <= 1) cart.removeItem(item.id);
                      else cart.updateItem(item.id, item.quantity - 1);
                    }}
                    disabled={cart.isUpdating}
                    className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="px-2.5 py-1 text-xs font-bold text-gray-800 min-w-[1.5rem] text-center bg-white border-x border-gray-100">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => cart.updateItem(item.id, item.quantity + 1)}
                    disabled={cart.isUpdating}
                    className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-xs font-bold text-gray-700">
                  {formatCurrency(item.product_price * item.quantity)}
                </span>
              </div>

              {/* Customer note */}
              {editingNoteId === item.id ? (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => onNoteTextChange(e.target.value)}
                    placeholder="Observação..."
                    className="flex-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/30"
                    autoFocus
                  />
                  <button
                    onClick={() => onSaveNote(item.id)}
                    className="px-3 py-1.5 bg-[#FF6A00] text-white text-xs font-bold rounded-lg"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onEditNote(item.id)}
                  className="mt-1.5 text-[9px] text-gray-400 hover:text-[#FF6A00] transition-colors flex items-center gap-1"
                >
                  <MessageCircle className="h-2.5 w-2.5" />
                  {item.customer_note || "Observação"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
