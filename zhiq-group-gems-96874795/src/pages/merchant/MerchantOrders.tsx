/**
 * MerchantOrders — Pedidos do Lojista
 *
 * Premium page showing purchase intentions received by the merchant.
 * KPI cards, expandable intention cards with details, credit info,
 * and checkout_mode / payment_status visibility.
 */
import { useState } from "react";
import {
  ClipboardList, Eye, ShoppingCart, CheckCircle, XCircle, Coins,
  Loader2, ChevronUp, Phone, User, Mail, Package, MapPin,
  Clock, MessageSquare, CreditCard, AlertCircle, Store,
} from "lucide-react";
import {
  useMerchantOrders,
  PurchaseIntention,
  IntentionDetail,
} from "@/hooks/useMerchantOrders";
import { useMerchantCredits } from "@/hooks/useMerchantCredits";
import { toast } from "sonner";
import { MerchantRecentEvents } from "@/components/merchant/MerchantRecentEvents";

// ─── Helpers ────────────────────────────
function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Eye }> = {
  new: { label: "Nova", color: "text-blue-600", bg: "bg-blue-50", icon: AlertCircle },
  viewed: { label: "Visualizada", color: "text-amber-600", bg: "bg-amber-50", icon: Eye },
  converted: { label: "Convertida", color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle },
  cancelled: { label: "Cancelada", color: "text-red-500", bg: "bg-red-50", icon: XCircle },
};

const CHECKOUT_MODE_CONFIG: Record<string, { label: string; icon: typeof CreditCard; color: string; bg: string }> = {
  online_payment: { label: "Pagamento Online", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
  in_store: { label: "Compra Presencial", icon: Store, color: "text-emerald-600", bg: "bg-emerald-50" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "text-amber-600" },
  processing: { label: "Processando", color: "text-blue-600" },
  paid: { label: "Pago", color: "text-emerald-600" },
  failed: { label: "Falhou", color: "text-red-500" },
  refunded: { label: "Reembolsado", color: "text-violet-600" },
  not_applicable: { label: "", color: "" },
};

// ─── KPI Card ───────────────────────────
function KPICard({ icon: Icon, label, value, color, accent }: {
  icon: typeof Eye; label: string; value: number | string; color: string; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 min-w-[140px]">
      <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-black text-gray-800 leading-tight">{value}</p>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

// ─── Intention Card ─────────────────────
function IntentionCard({ intention, onExpand }: {
  intention: PurchaseIntention;
  onExpand: (id: string) => void;
}) {
  const status = STATUS_CONFIG[intention.status] || STATUS_CONFIG.new;
  const StatusIcon = status.icon;
  const checkout = CHECKOUT_MODE_CONFIG[intention.checkout_mode] || CHECKOUT_MODE_CONFIG.in_store;
  const CheckoutIcon = checkout.icon;
  const imgSrc = normalizeImageUrl(intention.first_product_image);
  const paymentInfo = intention.checkout_mode === "online_payment" && intention.payment_status
    ? PAYMENT_STATUS_CONFIG[intention.payment_status] : null;
  const location = [intention.customer_bairro, intention.customer_city].filter(Boolean).join(", ");

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onExpand(intention.id)}
    >
      <div className="p-4">
        <div className="flex gap-3">
          {/* Product image */}
          <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
            {imgSrc ? (
              <img src={imgSrc} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-6 w-6 text-gray-200" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  {intention.customer_name}
                </h3>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" />
                  {intention.customer_whatsapp}
                </p>
                {location && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {location}
                  </p>
                )}
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${status.bg} ${status.color}`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </span>
            </div>

            {/* Product info */}
            {intention.first_product_title && (
              <div className="mt-1.5 flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1">
                <Package className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="text-[11px] font-semibold text-gray-600 truncate">
                  {intention.first_product_title}
                </span>
                {intention.first_product_price > 0 && (
                  <span className="text-[11px] font-bold text-[#FF6A00] ml-auto shrink-0">
                    {formatCurrency(intention.first_product_price)}
                  </span>
                )}
                {intention.total_items > 1 && (
                  <span className="text-[9px] text-gray-400 shrink-0">
                    +{intention.total_items - 1}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Checkout mode badge */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${checkout.bg} ${checkout.color}`}>
                <CheckoutIcon className="h-3 w-3" />
                {checkout.label}
              </span>
              {/* Payment status */}
              {paymentInfo && paymentInfo.label && (
                <span className={`text-[10px] font-bold ${paymentInfo.color}`}>
                  • {paymentInfo.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 mt-1.5 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                {intention.total_items} item{intention.total_items !== 1 ? "s" : ""}
              </span>
              <span className="font-bold text-[#FF6A00]">
                {formatCurrency(intention.subtotal)}
              </span>
              <span className="flex items-center gap-1 ml-auto">
                <Clock className="h-3 w-3" />
                {formatDate(intention.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ───────────────────────
function IntentionDetailPanel({
  detail,
  onClose,
  onUpdateStatus,
  onWhatsAppContact,
  availableCredits,
}: {
  detail: IntentionDetail;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onWhatsAppContact?: (detail: IntentionDetail) => Promise<boolean>;
  availableCredits?: number;
}) {
  const [contactingWA, setContactingWA] = useState(false);
  const status = STATUS_CONFIG[detail.status] || STATUS_CONFIG.new;
  const checkout = CHECKOUT_MODE_CONFIG[detail.checkout_mode] || CHECKOUT_MODE_CONFIG.in_store;
  const CheckoutIcon = checkout.icon;
  const paymentInfo = detail.checkout_mode === "online_payment" && detail.payment_status
    ? PAYMENT_STATUS_CONFIG[detail.payment_status] : null;

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden animate-in slide-in-from-top duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              {detail.customer_name}
            </h3>
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!onWhatsAppContact) {
                    window.open(`https://wa.me/55${detail.customer_whatsapp.replace(/\D/g, "")}`, "_blank");
                    return;
                  }
                  setContactingWA(true);
                  const ok = await onWhatsAppContact(detail);
                  setContactingWA(false);
                  if (ok) {
                    window.open(
                      `https://wa.me/55${detail.customer_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Olá${detail.customer_name ? ` ${detail.customer_name.split(" ")[0]}` : ""}! Vi seu pedido na plataforma Viagg-TX8. Vamos conversar?`
                      )}`,
                      "_blank"
                    );
                  }
                }}
                disabled={contactingWA}
                className="text-white bg-[#25D366] hover:bg-[#1fb855] text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
              >
                {contactingWA ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Phone className="h-3 w-3" />
                )}
                WhatsApp
              </button>
              <span className="text-[9px] text-gray-400">
                Custo: {Math.max(1, Math.ceil(detail.subtotal * 0.06))} crédito{Math.max(1, Math.ceil(detail.subtotal * 0.06)) > 1 ? "s" : ""}
                {typeof availableCredits === "number" && ` (saldo: ${availableCredits})`}
              </span>
              {detail.customer_email && (
                <span className="text-gray-400 text-xs flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {detail.customer_email}
                </span>
              )}
            </div>
            {/* Checkout mode + payment status */}
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${checkout.bg} ${checkout.color}`}>
                <CheckoutIcon className="h-3 w-3" />
                {checkout.label}
              </span>
              {paymentInfo && paymentInfo.label && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 ${paymentInfo.color}`}>
                  💳 {paymentInfo.label}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <ChevronUp className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Itens do Pedido</p>
        {detail.items.map((item) => {
          const imgSrc = normalizeImageUrl(item.product_image_url);
          return (
            <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white flex-shrink-0">
                {imgSrc ? (
                  <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-5 w-5 text-gray-200" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-700 truncate">{item.product_title}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                  <span>{item.quantity}x {formatCurrency(item.unit_price)}</span>
                  <span className="font-bold text-gray-700">{formatCurrency(item.subtotal)}</span>
                </div>
                {item.customer_note && (
                  <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                    <MessageSquare className="h-2.5 w-2.5" /> {item.customer_note}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Customer note */}
        {detail.customer_note && (
          <div className="bg-amber-50 rounded-lg p-3 mt-2">
            <p className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Observação do Cliente
            </p>
            <p className="text-sm text-amber-700">{detail.customer_note}</p>
          </div>
        )}

        {/* Subtotal */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-sm font-bold text-gray-500">{detail.total_items} item{detail.total_items !== 1 ? "s" : ""}</span>
          <span className="text-xl font-black text-gray-800">{formatCurrency(detail.subtotal)}</span>
        </div>
      </div>

      {/* ═══ CREDIT CARD ═══ */}
      {detail.credit_info && detail.credit_info.reason && (
        <div className="mx-4 mb-4 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-violet-600" />
            </div>
            <h4 className="text-sm font-bold text-violet-700">Créditos</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/70 rounded-lg p-2.5">
              <p className="text-[10px] text-violet-400 font-bold uppercase">Gastos nesta intenção</p>
              <p className="text-lg font-black text-violet-700">{detail.credit_info.credits_charged}</p>
            </div>
            <div className="bg-white/70 rounded-lg p-2.5">
              <p className="text-[10px] text-violet-400 font-bold uppercase">Saldo Restante</p>
              <p className="text-lg font-black text-emerald-600">{detail.credit_info.available_balance}</p>
            </div>
          </div>
          {detail.credit_info.rule_applied && (
            <div className="mt-2 text-[11px] text-violet-500 space-y-0.5">
              <p><b>Regra:</b> {detail.credit_info.rule_applied}</p>
              <p><b>Motivo:</b> {detail.credit_info.reason}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4 border-t border-gray-100 flex gap-2">
        {detail.status !== "converted" && (
          <button
            onClick={() => onUpdateStatus(detail.id, "converted")}
            className="flex-1 py-2.5 bg-emerald-500 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 hover:bg-emerald-600 transition-colors"
          >
            <CheckCircle className="h-4 w-4" /> Convertida
          </button>
        )}
        {detail.status !== "cancelled" && (
          <button
            onClick={() => onUpdateStatus(detail.id, "cancelled")}
            className="flex-1 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors"
          >
            <XCircle className="h-4 w-4" /> Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════
export default function MerchantOrders() {
  const {
    intentions,
    kpis,
    loadingIntentions,
    fetchDetail,
    markAsViewed,
    updateStatus,
  } = useMerchantOrders();
  const { balance, debitCredits, refetch: refetchCredits } = useMerchantCredits();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntentionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setLoadingDetail(true);
    const d = await fetchDetail(id);
    setDetail(d);
    setLoadingDetail(false);
    markAsViewed(id);
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    await updateStatus(id, status);
    setExpandedId(null);
    setDetail(null);
  };

  // ── Pay-per-Lead: deduct 6% credits on WhatsApp contact ──
  const handleWhatsAppContact = async (d: IntentionDetail): Promise<boolean> => {
    const creditCost = Math.max(1, Math.ceil(d.subtotal * 0.06));

    if (balance.available_credits < creditCost) {
      toast.error(`Créditos insuficientes! Precisa de ${creditCost} (6% de ${formatCurrency(d.subtotal)}). Saldo: ${balance.available_credits}.`);
      return false;
    }

    const ok = await debitCredits({
      amount: creditCost,
      reasonCode: "order_whatsapp_contact",
      description: `Contato WhatsApp — pedido de ${formatCurrency(d.subtotal)} (${d.customer_name || "cliente"})`,
      purchaseIntentionId: d.id,
      metadata: {
        intention_id: d.id,
        subtotal: d.subtotal,
        customer_name: d.customer_name,
        customer_whatsapp: d.customer_whatsapp,
        credit_cost_percent: 6,
      },
    });

    if (!ok) {
      toast.error("Falha ao debitar créditos. Tente novamente.");
      return false;
    }

    toast.success(`${creditCost} crédito${creditCost > 1 ? "s" : ""} debitado${creditCost > 1 ? "s" : ""}. Abrindo WhatsApp...`);
    refetchCredits();
    return true;
  };

  return (
    <div className="px-4 pt-4 pb-8 lg:px-10 xl:px-16 max-w-5xl w-full mx-auto">
      {/* ═══ HEADER ═══ */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center shadow-md">
            <ClipboardList className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">Pedidos</h1>
            <p className="text-xs text-gray-400">Intenções de compra recebidas dos seus clientes</p>
          </div>
        </div>
      </div>

      <MerchantRecentEvents module="orders" />

      {/* ═══ KPIs ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KPICard icon={AlertCircle} label="Novas" value={kpis.newCount} color="text-blue-600" accent="bg-blue-50" />
        <KPICard icon={Eye} label="Visualizadas" value={kpis.viewedCount} color="text-amber-600" accent="bg-amber-50" />
        <KPICard icon={CheckCircle} label="Convertidas" value={kpis.convertedCount} color="text-emerald-600" accent="bg-emerald-50" />
        <KPICard icon={XCircle} label="Canceladas" value={kpis.cancelledCount} color="text-red-500" accent="bg-red-50" />
        <KPICard icon={Coins} label="Créditos Usados" value={kpis.totalCreditsSpent} color="text-violet-600" accent="bg-violet-50" />
      </div>

      {/* ═══ INTENTION LIST ═══ */}
      {loadingIntentions ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mb-3" />
          <p className="text-sm text-gray-400">Carregando pedidos...</p>
        </div>
      ) : intentions.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="h-8 w-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-600 mb-1">Nenhum pedido ainda</h3>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">
            Quando clientes enviarem intenções de compra na sua loja, elas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {intentions.map((intention) => (
            <div key={intention.id}>
              {expandedId === intention.id ? (
                loadingDetail ? (
                  <div className="bg-white rounded-xl p-8 flex items-center justify-center shadow-sm border border-gray-100">
                    <Loader2 className="h-6 w-6 animate-spin text-[#FF6A00] mr-3" />
                    <span className="text-sm text-gray-400">Carregando detalhes...</span>
                  </div>
                ) : detail ? (
                  <IntentionDetailPanel
                    detail={detail}
                    onClose={() => { setExpandedId(null); setDetail(null); }}
                    onUpdateStatus={handleUpdateStatus}
                    onWhatsAppContact={handleWhatsAppContact}
                    availableCredits={balance.available_credits}
                  />
                ) : null
              ) : (
                <IntentionCard intention={intention} onExpand={handleExpand} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
