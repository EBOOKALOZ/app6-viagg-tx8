/**
 * GlobalCartDrawer — Multi-store Cart + Checkout
 *
 * Full checkout flow:
 * Step 1: Cart review (items grouped by store)
 * Step 2: Signup + confirmations
 * Step 3: Success screen
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ShoppingBag, Minus, Plus, Trash2, MapPin, X, Loader2,
  ChevronDown, CheckCircle, Store as StoreIcon, Send, PartyPopper,
} from "lucide-react";
import { useGlobalCart, StoreGroup, GlobalCartItem, MultiSubmitResult } from "@/hooks/useGlobalCart";
import { VisitorMiniSignup } from "@/components/public/VisitorMiniSignup";
import { useVisitorProfile } from "@/hooks/useVisitorProfile";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  globalCart: ReturnType<typeof useGlobalCart>;
}

type Step = "cart" | "signup" | "success";

export function GlobalCartDrawer({ open, onOpenChange, globalCart }: Props) {
  const { storeGroups, totalItems, totalSubtotal, totalStores } = globalCart;
  const navigate = useNavigate();
  const { activeProfile } = useAuth();
  const [step, setStep] = useState<Step>("cart");
  const [submitResult, setSubmitResult] = useState<MultiSubmitResult | null>(null);
  const [savedGroups, setSavedGroups] = useState<StoreGroup[]>([]);
  const visitor = useVisitorProfile();

  const handleQuantityChange = async (item: GlobalCartItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      await globalCart.removeItem(item.item_id);
    } else {
      await globalCart.updateItem(item.item_id, newQty);
    }
  };

  const handleSubmit = async () => {
    // Save store data BEFORE submit (cart gets cleared on success)
    setSavedGroups([...storeGroups]);
    try {
      const result = await globalCart.submitIntention({
        checkoutMode: "in_store",
        name: visitor.profile.full_name,
        whatsapp: visitor.profile.whatsapp,
        email: visitor.profile.email || undefined,
        note: undefined,
        visitor_id: undefined,
        bairro: visitor.profile.bairro || undefined,
        city: visitor.profile.city || undefined,
      });
      setSubmitResult(result);
      setStep("success");
    } catch (error: any) {
      console.error("[GlobalCartDrawer] Submit error:", error);
      toast.error("Erro ao finalizar pedido: " + (error?.message || "Erro desconhecido"));
    }
  };

  const handleClose = () => {
    if (step === "success") {
      setStep("cart");
      setSubmitResult(null);
    }
    onOpenChange(false);
  };

   useEffect(() => {
     if (step === "success") {
       const timer = setTimeout(() => {
         handleClose();
         navigate("/anunciante/mensagens");
       }, 2500);
       return () => clearTimeout(timer);
     }
   }, [step, navigate, activeProfile]);

  // ═══ EMPTY STATE ═══
  if (totalItems === 0 && step !== "success" && open) {
    return (
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-white flex flex-col">
          <SheetHeader className="sr-only"><SheetTitle>Cesta Vazia</SheetTitle></SheetHeader>
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
              <ShoppingBag className="h-10 w-10 text-gray-200" />
            </div>
            <h3 className="text-lg font-bold text-gray-700">Sua cesta está vazia</h3>
            <p className="text-sm text-gray-400 text-center">
              Adicione produtos das lojas do mercado para começar.
            </p>
            <button onClick={handleClose}
              className="px-6 py-3 bg-[#FF6A00] text-white font-bold rounded-xl text-sm">
              Explorar Produtos
            </button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 bg-gray-50 flex flex-col">
        <SheetHeader className="sr-only"><SheetTitle>Cesta de Compras</SheetTitle></SheetHeader>

        {/* ═══ HEADER ═══ */}
        <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-6 w-6 text-white" />
            <div>
              <h2 className="text-white font-black text-lg">
                {step === "success" ? "Pedido Enviado" : "Cesta de Compras"}
              </h2>
              {step === "cart" && (
                <p className="text-white/70 text-xs font-medium">
                  {totalItems} {totalItems === 1 ? "item" : "itens"} • {totalStores} {totalStores === 1 ? "loja" : "lojas"} • R$ {totalSubtotal.toFixed(2).replace(".", ",")}
                </p>
              )}
              {step === "signup" && (
                <p className="text-white/70 text-xs font-medium">Complete seus dados</p>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="text-white/60 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ═══ STEP: CART REVIEW ═══ */}
        {step === "cart" && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Info banner */}
              <div className="bg-amber-50/70 border border-amber-100 rounded-xl px-4 py-2.5 text-center">
                <p className="text-[11px] text-amber-700 font-medium">
                  Sua intenção de compra será enviada para {totalStores} {totalStores === 1 ? "loja" : "lojas"}
                </p>
              </div>

              {/* Store groups */}
              {storeGroups.map((group) => (
                <StoreCard key={group.store_id} group={group}
                  onQuantityChange={handleQuantityChange}
                  onRemove={(item) => globalCart.removeItem(item.item_id)} />
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 bg-white px-5 py-4 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Total ({totalItems} {totalItems === 1 ? "item" : "itens"} de {totalStores} {totalStores === 1 ? "loja" : "lojas"})
                </span>
                <span className="text-xl font-black text-gray-900">
                  R$ {totalSubtotal.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <button onClick={() => setStep("signup")}
                className="w-full py-4 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white font-bold rounded-xl text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
                <Send className="h-5 w-5" />
                Finalizar Pedido
              </button>
              <button onClick={() => { onOpenChange(false); navigate("/mercado"); }}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm shadow transition-all flex items-center justify-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Continuar Pedido
              </button>
              <p className="text-[10px] text-gray-400 text-center">
                Pagamento e condições tratados diretamente com cada loja.
              </p>
            </div>
          </>
        )}

        {/* ═══ STEP: SIGNUP ═══ */}
        {step === "signup" && (
          <div className="flex-1 overflow-y-auto">
            {/* Review summary */}
            <div className="px-4 py-3 bg-white border-b border-gray-100">
              <p className="text-[12px] text-gray-500 font-medium mb-2">
                Revise abaixo as lojas e os produtos que receberão sua intenção:
              </p>
              {storeGroups.map(g => (
                <div key={g.store_id} className="py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3 mb-2">
                    {g.store_logo ? (
                      <img src={g.store_logo} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center text-white text-[11px] font-black shrink-0">
                        {g.store_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[16px] font-semibold text-gray-700 flex-1 truncate">{g.store_name}</span>
                    <span className="text-[14px] text-gray-400 shrink-0">{g.total_items} {g.total_items === 1 ? "item" : "itens"}</span>
                    <span className="text-[16px] font-bold text-gray-700 shrink-0">R$ {g.subtotal.toFixed(2).replace(".", ",")}</span>
                  </div>
                  {/* Lista de Produtos com imagem */}
                  <div className="pl-[52px] space-y-2">
                    {(g.items || []).map((item) => (
                      <div key={item.item_id} className="flex items-center gap-3 text-[14px]">
                        <div className="h-10 w-10 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {item.product_image_url ? (
                            <img
                              src={item.product_image_url}
                              alt={item.product_title}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <span className="text-gray-300 text-[10px]">📦</span>
                          )}
                        </div>
                        <span className="text-gray-600 line-clamp-1 flex-1">{item.quantity}x {item.product_title}</span>
                        <span className="text-gray-500 font-medium shrink-0">R$ {(item.product_price * item.quantity).toFixed(2).replace(".", ",")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-100">
                <span className="text-[16px] font-bold text-gray-500">Total Geral</span>
                <span className="text-[18px] font-black text-gray-800">R$ {totalSubtotal.toFixed(2).replace(".", ",")}</span>
              </div>
              <button onClick={() => setStep("cart")}
                className="mt-2 text-[11px] text-[#FF6A00] font-bold hover:underline">
                ← Voltar para a cesta
              </button>
            </div>

            {/* Signup form */}
            <div className="px-4 py-4">
               <VisitorMiniSignup
                 visitor={visitor}
                 isSubmitting={globalCart.isSubmitting}
                 onComplete={async (_profile) => {
                   await handleSubmit();
                 }}
                 cartSummaryNode={
                   <div className="space-y-2">
                     <p className="text-[11px] font-bold text-emerald-800 flex justify-between">
                       <span>Itens do Pedido ({totalStores} loja{totalStores > 1 ? "s" : ""})</span>
                       <span className="text-emerald-600">{totalItems} item(ns)</span>
                     </p>
                     {storeGroups.map(g => (
                       <div key={g.store_id} className="pt-1.5 border-t border-emerald-200/30">
                         <p className="text-[10px] font-bold text-emerald-700/80 mb-1">{g.store_name}</p>
                         {(g.items || []).map((item) => (
                           <div key={item.item_id} className="flex items-start justify-between gap-2 text-[10px] text-emerald-700">
                             <span className="line-clamp-1 flex-1">• {item.quantity}x {item.product_title}</span>
                             <span className="font-bold shrink-0">R$ {(item.product_price * item.quantity).toFixed(2).replace(".", ",")}</span>
                           </div>
                         ))}
                       </div>
                     ))}
                     <div className="flex justify-between pt-1.5 mt-1.5 border-t border-emerald-200/40 text-[12px] font-black text-emerald-800">
                       <span>Total Geral</span>
                       <span>R$ {totalSubtotal.toFixed(2).replace(".", ",")}</span>
                     </div>
                   </div>
                 }
               />
            </div>
          </div>
        )}

        {/* ═══ STEP: SUCCESS ═══ */}
        {step === "success" && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center gap-6">
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center">
              <PartyPopper className="h-10 w-10 text-emerald-500" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-gray-800">
                Já já o vendedor já fala com você
              </h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
                Seu pedido foi enviado. Aguarde, em instantes o vendedor entra em contato.
              </p>
            </div>

            {/* Results summary — uses savedGroups snapshot */}
            <div className="w-full space-y-3">
              {submitResult?.purchase_intentions?.length ? (
                submitResult.purchase_intentions.map((pi, i) => {
                  const group = savedGroups.find(g => g.store_id === pi.store_id);
                  return (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3"
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">
                          {group?.store_name || "Loja"}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {pi.total_items} {pi.total_items === 1 ? "item" : "itens"} • R$ {(pi.subtotal || 0).toFixed(2).replace(".", ",")}
                        </p>
                      </div>
                      <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                    </div>
                  );
                })
              ) : (
                savedGroups.map((g, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{g.store_name}</p>
                      <p className="text-[11px] text-gray-400">
                        {g.total_items} {g.total_items === 1 ? "item" : "itens"} • R$ {g.subtotal.toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                  </div>
                ))
              )}
            </div>

            <div className="w-full bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                A plataforma Viagg-TX8 organizou sua intenção de compra. O pagamento será feito diretamente com a loja, conforme as condições combinadas entre vocês.
              </p>
            </div>

            <button onClick={() => {
                handleClose();
                navigate("/anunciante/mensagens");
              }}
              className="w-full py-4 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white font-bold rounded-xl text-base shadow-lg">
              Ver Mensagens
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Store Card Component ─────────────────
function StoreCard({ group, onQuantityChange, onRemove }: {
  group: StoreGroup;
  onQuantityChange: (item: GlobalCartItem, delta: number) => void;
  onRemove: (item: GlobalCartItem) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* Store Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center gap-3">
        {group.store_logo ? (
          <img src={group.store_logo} alt="" className="h-9 w-9 rounded-xl object-cover" />
        ) : (
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center text-white text-xs font-black">
            {group.store_name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-800 truncate">{group.store_name}</h3>
          {group.store_address && (
            <p className="text-[11px] text-gray-400 flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" /> {group.store_address}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">{group.total_items} {group.total_items === 1 ? "item" : "itens"}</p>
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-50">
        {(group.items || []).map((item) => (
          <div key={item.item_id} className="px-4 py-3 flex gap-3">
            <div className="w-14 h-14 rounded-lg bg-gray-50 overflow-hidden shrink-0">
              {item.product_image_url ? (
                <img src={item.product_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="h-5 w-5 text-gray-200" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-gray-800 line-clamp-1">{item.product_title}</h4>
              <p className="text-sm font-bold text-[#FF6A00]">
                R$ {(item.product_price || 0).toFixed(2).replace(".", ",")}
              </p>
              {item.customer_note && (
                <p className="text-[10px] text-gray-400 italic mt-0.5">📝 {item.customer_note}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => onQuantityChange(item, -1)}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-7 h-7 flex items-center justify-center text-sm font-bold text-gray-700 border-x border-gray-200">
                    {item.quantity}
                  </span>
                  <button onClick={() => onQuantityChange(item, 1)}
                    className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-sm font-bold text-gray-700 ml-auto">
                  R$ {(item.item_subtotal || 0).toFixed(2).replace(".", ",")}
                </span>
                <button onClick={() => onRemove(item)}
                  className="text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Store Subtotal */}
      <div className="px-4 py-2.5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">Subtotal desta loja</span>
        <span className="text-sm font-bold text-gray-800">
          R$ {(group.subtotal || 0).toFixed(2).replace(".", ",")}
        </span>
      </div>
    </div>
  );
}
