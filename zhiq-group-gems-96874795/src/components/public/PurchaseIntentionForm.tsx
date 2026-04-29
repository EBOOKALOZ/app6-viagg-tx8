/**
 * PurchaseIntentionForm — Customer data collection for purchase intention
 *
 * Collects name, WhatsApp, optional email and note before submitting
 * the cart as a purchase intention. Supports dual checkout modes:
 *   - online_payment: "Pagar para a Loja" (direct payment, no gateway)
 *   - in_store: "Ir Diretamente na Loja"
 */
import { useState } from "react";
import { Loader2, User, Phone, Mail, MessageSquare, CreditCard, Store } from "lucide-react";
import { useStoreCart } from "@/hooks/useStoreCart";
import type { CheckoutMode } from "./StoreCartDrawer";

interface Props {
  cart: ReturnType<typeof useStoreCart>;
  storeName: string;
  checkoutMode: CheckoutMode;
  onSuccess: () => void;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function PurchaseIntentionForm({ cart, storeName, checkoutMode, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isOnline = checkoutMode === "online_payment";

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Nome é obrigatório";
    const digits = whatsapp.replace(/\D/g, "");
    if (digits.length < 10) errs.whatsapp = "WhatsApp inválido";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Email inválido";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || cart.isSubmitting) return;

    try {
      await cart.submitIntention({
        checkoutMode,
        customerName: name.trim(),
        customerWhatsapp: whatsapp.replace(/\D/g, ""),
        customerEmail: email.trim() || undefined,
        customerNote: note.trim() || undefined,
      });
      onSuccess();
    } catch {
      // Error handled by hook
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Mode indicator */}
      <div className={`rounded-xl p-3 flex items-center gap-3 ${
        isOnline ? "bg-blue-50 border border-blue-100" : "bg-emerald-50 border border-emerald-100"
      }`}>
        {isOnline ? (
          <CreditCard className="h-5 w-5 text-blue-600 shrink-0" />
        ) : (
          <Store className="h-5 w-5 text-emerald-600 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-bold ${isOnline ? "text-blue-700" : "text-emerald-700"}`}>
            {isOnline ? "Pagamento Direto à Loja" : "Compra Presencial"}
          </p>
          <p className={`text-[11px] ${isOnline ? "text-blue-500" : "text-emerald-500"}`}>
            {isOnline
              ? "Você pagará diretamente para a loja usando os dados de pagamento fornecidos"
              : "A loja receberá seu interesse para atendimento presencial"
            }
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-100">
        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Resumo do Pedido</p>
        <div className="space-y-1.5">
          {cart.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-gray-600 truncate flex-1 mr-2">
                {item.quantity}x {item.product_title}
              </span>
              <span className="font-bold text-gray-700 shrink-0">
                {(item.product_price * item.quantity).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
          ))}
          <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
            <span className="font-bold text-gray-600">Total</span>
            <span className="font-black text-lg text-[#FF6A00]">
              {cart.subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Seu Nome *
        </label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como o vendedor deve te chamar?"
            className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none transition-colors ${
              errors.name ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#FF6A00]"
            }`}
          />
        </div>
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      {/* WhatsApp */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Seu WhatsApp *
        </label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none transition-colors ${
              errors.whatsapp ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#FF6A00]"
            }`}
          />
        </div>
        {errors.whatsapp && <p className="text-xs text-red-500 mt-1">{errors.whatsapp}</p>}
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Email <span className="text-gray-300">(opcional)</span>
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none transition-colors ${
              errors.email ? "border-red-300 focus:border-red-500" : "border-gray-200 focus:border-[#FF6A00]"
            }`}
          />
        </div>
        {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Observação Geral <span className="text-gray-300">(opcional)</span>
        </label>
        <div className="relative">
          <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-300" />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Algo a mais que o vendedor precise saber?"
            rows={3}
            className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-[#FF6A00] transition-colors resize-none"
          />
        </div>
      </div>

      {/* Privacy */}
      <div className="flex items-start gap-2 bg-blue-50 rounded-xl p-3">
        <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-blue-500 text-xs">ℹ</span>
        </div>
        <p className="text-[11px] text-blue-600 leading-relaxed">
          Seus dados serão compartilhados apenas com o vendedor desta loja para viabilizar o contato comercial.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={cart.isSubmitting}
        className={`w-full py-4 text-white font-bold rounded-xl text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${
          isOnline
            ? "bg-gradient-to-r from-blue-600 to-blue-700"
            : "bg-gradient-to-r from-emerald-500 to-emerald-600"
        }`}
      >
        {cart.isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando...
          </>
        ) : isOnline ? (
          <>
            <CreditCard className="h-5 w-5" />
            Enviar Pedido e Pagar
          </>
        ) : (
          <>
            <Store className="h-5 w-5" />
            Confirmar Visita à Loja
          </>
        )}
      </button>
    </form>
  );
}
