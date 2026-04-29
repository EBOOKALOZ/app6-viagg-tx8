/**
 * MerchantCredits — Créditos e Resultado (Real Schema)
 *
 * Uses: merchant_credit_balances, merchant_credit_ledger,
 *       merchant_credit_products, merchant_credit_subscriptions,
 *       merchant_credit_usage_rules, merchant_credit_result_metrics
 */
import { useState, useEffect, useRef } from "react";
import {
  Coins, Sparkles, ChevronRight, CreditCard, Loader2,
  TrendingUp, ShoppingCart, Eye, MousePointerClick,
  ArrowDownCircle, ArrowUpCircle, CheckCircle, Star,
  Zap, Shield, RotateCcw, Crown, Package, Clock,
  Award, BarChart3, Gift, BadgePercent, Lock, Copy, QrCode,
  Timer, XCircle, CheckCircle2, AlertCircle,
  RefreshCw, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useMerchantCredits, CreditProduct, LedgerEntry } from "@/hooks/useMerchantCredits";
import { useMerchantPayWallet } from "@/hooks/useMerchantPayWallet";
import { MerchantRecentEvents } from "@/components/merchant/MerchantRecentEvents";
import logoImage from '@/assets/logo.png';

// ─── Helpers ────────────────────────────
function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const TYPE_LABELS: Record<string, string> = {
  pacote: "Avulso",
  mensal: "Mensal",
  semestral: "Semestral",
  anual: "Anual",
};

const MODULE_ICONS: Record<string, typeof Eye> = {
  CESTA1: ShoppingCart,
  M1: Zap,
  LEILAO: Zap,
  ARREMATE: Award,
};

const MODULE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  CESTA1: { text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  M1: { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  LEILAO: { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  ARREMATE: { text: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
};

const REASON_LABELS: Record<string, string> = {
  purchase_intention_received: "Intenção de compra recebida",
  m1_buy_click: "Adicionar cada produto cesta (M1)",
  m1_product_click: "clique produto na plataforma (M1)",
  bid_received: "Lance recebido",
  arremate_confirmed: "Oferta aceita no arremate",
  subscription_activation: "Ativação de assinatura",
  package_purchase: "Compra de pacote",
  subscription_renewal: "Renovação de assinatura",
  rollover_credit: "Rollover de créditos",
  manual_credit: "Crédito manual",
  manual_debit: "Débito manual",
};

// ═══════════════════════════════════════
// PLAN CARD
// ═══════════════════════════════════════
function PlanCard({ product, isCurrentPlan, onSelect }: {
  product: CreditProduct;
  isCurrentPlan: boolean;
  onSelect: (p: CreditProduct) => void;
}) {
  const isSubscription = product.type !== "pacote";
  const isRecommended = product.is_recommended;

  return (
    <div
      className={`relative rounded-2xl border-2 overflow-hidden transition-all hover:shadow-lg ${
        isRecommended
          ? "border-[#FF6A00] shadow-md shadow-orange-100 bg-yellow-300"
          : isCurrentPlan
          ? "border-emerald-400 bg-emerald-50/30"
          : "border-gray-200 hover:border-gray-300 bg-yellow-300"
      }`}
    >
      {product.badge_text && (
        <div className={`text-center py-1.5 text-[10px] font-black tracking-wider uppercase ${
          isRecommended
            ? "bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white"
            : "bg-gray-100 text-gray-600"
        }`}>
          {product.badge_text}
        </div>
      )}

      {isCurrentPlan && (
        <div className="text-center py-1 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider">
          ✅ SEU PLANO ATUAL
        </div>
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isRecommended ? "bg-[#FF6A00] text-white" : "bg-gray-100 text-gray-500"
          }`}>
            {isSubscription ? <Crown className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-800">{product.name}</h3>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
              isSubscription ? "bg-violet-100 text-violet-600" : "bg-gray-100 text-gray-500"
            }`}>
              {TYPE_LABELS[product.type]}
            </span>
          </div>
        </div>

        {/* Credits */}
        <div className="bg-gray-50 rounded-xl p-3 mb-3">
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-black text-gray-800">{product.credits_total}</span>
              <span className="text-xs text-gray-400 ml-1">créditos</span>
            </div>
            {product.credits_bonus > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <Gift className="h-2.5 w-2.5" />
                +{product.credits_bonus} bônus
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
            <span>{product.credits_base} base</span>
            {product.rollover_enabled && (
              <span className="flex items-center gap-0.5 text-violet-500">
                <RotateCcw className="h-2.5 w-2.5" />
                Rollover {product.rollover_percent}%
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="text-center mb-3">
          <p className="text-2xl font-black text-gray-800">
            {formatCurrency(product.price_cents)}
          </p>
          <p className="text-[11px] text-gray-400">
            {formatCurrency(product.cost_per_credit_cents)}/crédito
          </p>
          {isSubscription && (
            <p className="text-[10px] text-violet-500 font-bold mt-0.5">
              recorrente • cancele quando quiser
            </p>
          )}
        </div>

        {product.description && (
          <p className="text-sm text-gray-500 text-center mb-3">{product.description}</p>
        )}

        {/* Features */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>Ativação imediata</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>Para cliques de clientes, leilões e arremates</span>
          </div>
          {product.rollover_enabled && product.rollover_percent > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Créditos não usados acumulam ({product.rollover_percent}%)</span>
            </div>
          )}
          {isSubscription && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shield className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Renovação automática</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => onSelect(product)}
          disabled={isCurrentPlan || product.action_enabled === false}
          className={`w-full py-3 rounded-xl text-sm font-black transition-all ${
            isCurrentPlan
              ? "bg-emerald-100 text-emerald-600 cursor-default"
              : product.action_enabled === false
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : isRecommended
              ? "bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
              : "bg-gray-800 text-white hover:bg-gray-700 active:scale-[0.99]"
          }`}
        >
          {isCurrentPlan ? (
            <span className="flex items-center justify-center gap-1.5">
              <CheckCircle className="h-4 w-4" /> Plano Ativo
            </span>
          ) : product.action_enabled === false ? (
            <span className="flex items-center justify-center gap-1.5">
              Indisponível
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              {isSubscription ? <Crown className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
              {product.action_label || (isSubscription ? "Assinar" : "Comprar Créditos")}
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// LEDGER ENTRY ROW
// ═══════════════════════════════════════
function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.entry_type === "credit";
  const label = REASON_LABELS[entry.reason_code] || entry.description || entry.reason_code || "Movimentação";

  // Determine type badge
  const reasonCode = entry.reason_code || "";
  const typeBadge = reasonCode.includes("subscription")
    ? { text: "Assinatura", bg: "bg-violet-100 text-violet-700" }
    : reasonCode.includes("package") || reasonCode.includes("manual_credit")
    ? { text: "Recarga", bg: "bg-emerald-100 text-emerald-700" }
    : reasonCode.includes("rollover")
    ? { text: "Rollover", bg: "bg-blue-100 text-blue-700" }
    : !isCredit
    ? { text: "Consumo", bg: "bg-red-100 text-red-600" }
    : { text: "Crédito", bg: "bg-emerald-100 text-emerald-700" };

  return (
    <div className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-white border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isCredit ? (
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ArrowDownCircle className="h-5 w-5 text-emerald-500" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <ArrowUpCircle className="h-5 w-5 text-red-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-sm font-bold ${isCredit ? "text-emerald-700" : "text-red-600"}`}>
              {isCredit ? `Entrada de ${entry.amount} créditos` : `Consumo de ${entry.amount} créditos`}
            </p>
          </div>
          <p className="text-[11px] text-gray-600 font-medium truncate">{label}</p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
            <span>{new Date(entry.created_at).toLocaleString("pt-BR")}</span>
            <span className={`px-1.5 py-0.5 rounded-full font-bold text-[9px] ${typeBadge.bg}`}>
              {typeBadge.text}
            </span>
            {entry.purchase_intention_id && (
              <span className="bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-bold">CESTA1</span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3">
        <span className={`text-base font-black ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
          {isCredit ? "+" : "−"}{entry.amount} créditos
        </span>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Saldo após: <span className="font-bold text-gray-600">{entry.balance_after}</span>
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════
export default function MerchantCredits() {
  const {
    balance, subscription, products, ledger,
    usageRules, resultMetrics, isLoading,
    createCreditOrder, getOrderStatus, cancelOrder,
  } = useMerchantCredits();

  const { purchases: payPurchases, consumption: payConsumption, debits: payDebits, rechargeAdvice } = useMerchantPayWallet();

  const [activeSection, setActiveSection] = useState<"plans" | "results" | "statement" | "wallet">("plans");
  const [checkoutProduct, setCheckoutProduct] = useState<CreditProduct | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "cartao">("pix");
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<"select" | "awaiting" | "confirmed" | "failed">("select");
  const [activeOrder, setActiveOrder] = useState<any>(null);

  const pacotes = products.filter(p => p.type === "pacote");
  const planos = products.filter(p => p.type !== "pacote");
  const planosMensais = products.filter(p => p.type === "mensal");
  const planosSemestrais = products.filter(p => p.type === "semestral");
  const planosAnuais = products.filter(p => p.type === "anual");
  const activePlan = subscription ? products.find(p => p.id === subscription.product_id) : null;

  // Monthly debit
  const monthlyDebits = ledger
    .filter(e => {
      const d = new Date(e.created_at);
      const now = new Date();
      return e.entry_type === "debit" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, e) => sum + e.amount, 0);

  // Open checkout drawer (step 1)
  const handleSelectProduct = (product: CreditProduct) => {
    setCheckoutProduct(product);
    setPaymentMethod("pix");
    setIsProcessing(false);
    setCheckoutStep("select");
    setActiveOrder(null);
  };

  // Confirm: create order then go to awaiting step
  const handleConfirmPurchase = async () => {
    if (!checkoutProduct || isProcessing) return;
    setIsProcessing(true);
    try {
      const order = await createCreditOrder(checkoutProduct, paymentMethod);
      setActiveOrder(order);
      setCheckoutStep("awaiting");
      toast.info("Cobrança gerada! Aguardando pagamento...", { duration: 3000 });
    } catch (err: any) {
      toast.error("Erro ao gerar cobrança", { description: err?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // Poll for payment status
  useEffect(() => {
    if (checkoutStep !== "awaiting" || !activeOrder?.id) return;
    const interval = setInterval(async () => {
      const updated = await getOrderStatus(activeOrder.id);
      if (!updated) return;
      if (updated.status === "paid") {
        setActiveOrder(updated);
        setCheckoutStep("confirmed");
        toast.success(`${checkoutProduct?.credits_total} créditos adicionados! 🎉`, { duration: 5000 });
        clearInterval(interval);
      } else if (updated.status === "failed" || updated.status === "expired") {
        setActiveOrder(updated);
        setCheckoutStep("failed");
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [checkoutStep, activeOrder?.id, getOrderStatus, checkoutProduct?.credits_total]);

  // Close checkout (cancel if pending)
  const handleCloseCheckout = async () => {
    if (activeOrder && (activeOrder.status === "awaiting_payment" || activeOrder.status === "pending")) {
      await cancelOrder(activeOrder.id);
    }
    setCheckoutProduct(null);
    setActiveOrder(null);
    setCheckoutStep("select");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mb-3" />
        <p className="text-sm text-gray-400">Carregando créditos...</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 lg:px-10 xl:px-16 max-w-[1600px] w-full mx-auto">

      {/* ═══ HEADER ═══ */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center shadow-md">
            <Coins className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-800">Créditos e Resultado</h1>
            <p className="text-xs text-gray-400">Ativação comercial mensurável da sua loja</p>
          </div>
        </div>
      </div>

      <MerchantRecentEvents module="credits" />

      {/* ═══ HERO — 4 KPIs ═══ */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-xl mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Available Credits */}
          <div className="col-span-2 lg:col-span-1">
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Saldo Disponível</p>
            <p className="text-4xl font-black mt-1">{balance.available_credits}</p>
            <p className="text-[10px] text-white/40">créditos ativos</p>
          </div>

          {/* Current Plan */}
          <div>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Plano Atual</p>
            <p className="text-lg font-black mt-1">
              {activePlan ? activePlan.name : "Nenhum"}
            </p>
            {subscription && (
              <p className="text-[10px] text-emerald-400 font-bold">● Ativo</p>
            )}
          </div>

          {/* Next Renewal */}
          <div>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Próx. Renovação</p>
            <p className="text-lg font-black mt-1">
              {subscription ? formatDate(subscription.next_renewal_at) : "—"}
            </p>
          </div>

          {/* Monthly consumed */}
          <div>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Consumidos no Mês</p>
            <p className="text-lg font-black mt-1">{monthlyDebits}</p>
            <p className="text-[10px] text-white/40">créditos utilizados</p>
          </div>
        </div>

        {/* Reserved & Consumed totals */}
        {(balance.reserved_credits > 0 || balance.consumed_credits > 0) && (
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10 text-[11px]">
            {balance.reserved_credits > 0 && (
              <span className="flex items-center gap-1 text-amber-300">
                <Lock className="h-3 w-3" /> {balance.reserved_credits} reservados
              </span>
            )}
            <span className="flex items-center gap-1 text-white/40">
              <TrendingUp className="h-3 w-3" /> {balance.consumed_credits} total consumidos
            </span>
          </div>
        )}

        {/* Low balance alert */}
        {balance.available_credits < 5 && (
          <div className="mt-4 flex items-center gap-2 bg-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-200">
              Saldo baixo! Recarregue para não perder oportunidades de venda.
            </p>
          </div>
        )}
      </div>

      {/* ═══ SECTION TABS ═══ */}
      <div className="flex rounded-xl bg-gray-100 p-1 mb-6">
        {[
          { key: "plans", label: "Planos e Pacotes", icon: Crown },
          { key: "results", label: "Resultado", icon: BarChart3 },
          { key: "statement", label: "Extrato", icon: Clock },
          { key: "wallet", label: "Carteira PAY", icon: CreditCard },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key as any)}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeSection === key ? "bg-white shadow-sm text-[#FF6A00]" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ═══ PLANS SECTION ═══ */}
      {activeSection === "plans" && (
        <div className="space-y-8">

          <div className="bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-900 rounded-2xl p-6 text-white shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-400/15 rounded-full blur-3xl -translate-y-10 translate-x-10" />
            <div className="relative z-10">
              <h3 className="text-base font-black uppercase tracking-wider text-white/70 flex items-center gap-2 mb-6">
                <MousePointerClick className="h-5 w-5 text-[#FF6A00]" />
                Como seus créditos são consumidos
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(() => {
                  const {
                    products,
                    creditPackages,
                    usageRules,
                    isLoading
                  } = useMerchantCredits();

                  // Calculate cost per credit for each plan type from cheapest source
                  const costPerCredit: Record<string, number | null> = {
                    mensal: null,
                    semestral: null,
                    anual: null,
                    pacote: null,
                  };

                  // 1. Calculate for products (cycles & packages)
                  ["mensal", "semestral", "anual", "pacote"].forEach(type => {
                    const items = products.filter(p => p.type === type && p.is_active);
                    if (items.length > 0) {
                      const unitPrices = items.map(p => {
                        const price = p.price_brl || (p.price_cents / 100);
                        const credits = p.credits_amount || p.credits_total || 1;
                        return price / credits;
                      });
                      costPerCredit[type] = Math.min(...unitPrices) * 100; // Store in cents
                    }
                  });

                  // 2. Calculate for packages (Specific Avulso table) - Overrides if found
                  if (creditPackages && creditPackages.length > 0) {
                    const activePkgs = creditPackages.filter(p => p.active);
                    if (activePkgs.length > 0) {
                      const unitPrices = activePkgs.map(p => p.reference_credit_value_brl || (p.price_brl / p.credits_amount));
                      costPerCredit["pacote"] = Math.min(...unitPrices) * 100; // Store in cents
                    }
                  }

                  // 3. Final Fallback for Avulso (ensure visibility as requested)
                  // Use at least 30 cents (R$ 0,30) as per user request
                  if (costPerCredit["pacote"] === null || costPerCredit["pacote"] < 30) {
                    costPerCredit["pacote"] = 30; // R$ 0,30
                  }

                  // Diagnostic Log
                  if (!isLoading) {
                    console.log("[Diagnostic] Credit Pricing Data Loaded:", {
                      productsCount: products.length,
                      packagesCount: creditPackages.length,
                      costs: costPerCredit
                    });
                    if (Object.values(costPerCredit).every(v => v === null)) {
                      console.warn("[Diagnostic] No active pricing data found in merchant_credit_products or credit_packages.");
                    }
                  }

                  const STEP_ICONS: Record<string, typeof Eye> = {
                    M1: Zap,
                    CESTA1: ShoppingCart,
                    LEILAO: Zap,
                    ARREMATE: Award,
                  };

                  return usageRules
                    .filter(rule => rule.module !== "CESTA1")
                    .map((rule, idx) => {
                    const Icon = STEP_ICONS[rule.module] || Zap;
                    const costLabel = rule.credits_cost === 0
                      ? "FREE"
                      : `${rule.credits_cost} ${rule.credits_cost === 1 ? "Crédito" : "Créditos"}`;

                    return (
                      <div key={rule.feature_code || idx} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-all group flex flex-col h-full">
                        <div className="flex items-start gap-3 mb-4 min-h-[56px]">
                          <img src={logoImage} alt="Logo" className="w-5 h-5 object-contain mt-0.5 shrink-0" />
                          <p className="text-lg text-white/80 leading-tight">
                            {rule.description
                              ?.replace(/Arremate [Cc]onfirmado/i, "Oferta aceita no arremate")
                              ?.replace(/Oferta no arremate/i, "Oferta aceita no arremate")
                              ?.replace(/Clique no produto/i, "clique no produto na loja")
                              ?.replace(/Clique na loja/i, "clique produto na plataforma")
                              ?.replace(/Clique em comprar/i, "Adicionar cada produto cesta") || rule.description}
                          </p>
                        </div>
                        <div className="mt-auto pt-4 border-t border-white/10">
                          <p className="text-5xl font-black text-white">{costLabel}</p>
                          <p className="text-base text-white/40 font-bold uppercase tracking-wider">por evento</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
                              <span className="text-base font-bold text-white/60">
                                Mensal R$ {costPerCredit["mensal"] != null 
                                  ? ((rule.credits_cost * costPerCredit["mensal"]) / 100).toFixed(2).replace(".", ",") 
                                  : "--"}
                              </span>
                              <>
                                <span className="text-xs text-white/30">|</span>
                                <span className="text-base font-bold text-amber-300/80">
                                  Semestral R$ {costPerCredit["semestral"] != null 
                                    ? ((rule.credits_cost * costPerCredit["semestral"]) / 100).toFixed(2).replace(".", ",") 
                                    : "--"}
                                </span>
                              </>
                              <>
                                <span className="text-xs text-white/30">|</span>
                                <span className="text-base font-bold text-emerald-300/80">
                                  Anual R$ {costPerCredit["anual"] != null 
                                    ? ((rule.credits_cost * costPerCredit["anual"]) / 100).toFixed(2).replace(".", ",") 
                                    : "--"}
                                </span>
                              </>
                              <>
                                <span className="text-xs text-white/30">|</span>
                                <span className="text-base font-bold text-white/60">
                                  Avulso R$ {costPerCredit["pacote"] != null 
                                    ? ((rule.credits_cost * costPerCredit["pacote"]) / 100).toFixed(2).replace(".", ",") 
                                    : "--"}
                                </span>
                              </>
                            </div>
                        </div>
                      </div>
                    );
                  });
                })()}

                <div className="bg-white/5 backdrop-blur-sm border border-amber-400/30 rounded-2xl p-5 hover:bg-white/10 transition-all group flex flex-col h-full">
                  <div className="flex items-center gap-2.5 mb-4 min-h-[56px]">
                    <div className="w-8 h-8 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-300 text-sm font-black shrink-0">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <p className="text-sm text-white/80 leading-tight">Comissão sobre o envio da intenção de compra, descontada em créditos sobre o valor do produto</p>
                  </div>
                  <div className="mt-auto pt-4 border-t border-white/10">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-300/70 mb-1">Comissão</p>
                    <p className="text-3xl font-black text-amber-300">2,5%</p>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-white/25 mt-4 text-center">
                Valores debitados automaticamente do seu saldo de créditos conforme interações reais dos clientes
              </p>

              {/* ── Compact Package Summary ── */}
              {products.length > 0 && (
                <div className="mt-6 pt-5 border-t border-white/10">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Pacotes Avulsos */}
                    {pacotes.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-1.5 mb-3">
                          <Package className="h-3.5 w-3.5 text-emerald-400" />
                          Pacotes Avulsos
                        </h4>
                        <div className="space-y-2">
                          {pacotes.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 border border-white/5 hover:bg-white/10 transition-all">
                              <div className="flex items-center gap-2 min-w-0">
                                {p.badge_text && (
                                  <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full uppercase shrink-0">
                                    {p.badge_text}
                                  </span>
                                )}
                                <span className="text-xs font-bold text-white/80 truncate">{p.name}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 ml-2">
                                <span className="text-[10px] font-bold text-white/30">{formatCurrency(Math.round(p.price_cents / p.credits_total))}/cr.</span>
                                <span className="text-xs font-black text-emerald-400">{p.credits_total} cr.</span>
                                <span className="text-sm font-black text-white">{formatCurrency(p.price_cents)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Planos de Assinatura */}
                    {planos.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-1.5 mb-3">
                          <Crown className="h-3.5 w-3.5 text-violet-400" />
                          Planos de Assinatura
                        </h4>
                        <div className="space-y-2">
                          {planos.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 border border-white/5 hover:bg-white/10 transition-all">
                              <div className="flex items-center gap-2 min-w-0">
                                {p.is_recommended && (
                                  <span className="text-[8px] font-black bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full uppercase shrink-0">
                                    ⭐ Melhor
                                  </span>
                                )}
                                <span className="text-xs font-bold text-white/80 truncate">{p.name}</span>
                                <span className="text-[9px] text-white/30 font-bold">/{TYPE_LABELS[p.type]?.toLowerCase()}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 ml-2">
                                <span className="text-[10px] font-bold text-white/30">{formatCurrency(Math.round(p.price_cents / p.credits_total))}/cr.</span>
                                <span className="text-xs font-black text-violet-400">{p.credits_total} cr.</span>
                                <span className="text-sm font-black text-white">{formatCurrency(p.price_cents)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Packages */}
          <div className="bg-emerald-50/60 rounded-2xl p-5 border border-emerald-100">
            <h2 className="text-2xl font-black text-gray-700 uppercase tracking-wider flex items-center justify-center gap-2 mb-4">
              <Package className="h-5 w-5 text-[#FF6A00]" />
              Pacotes Avulsos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {pacotes.map(p => (
                <PlanCard key={p.id} product={p} isCurrentPlan={false} onSelect={handleSelectProduct} />
              ))}
            </div>
          </div>

          {/* Planos Mensais */}
          {planosMensais.length > 0 && (
            <div className="bg-emerald-50/60 rounded-2xl p-5 border border-emerald-100">
              <h2 className="text-2xl font-black text-gray-700 uppercase tracking-wider flex items-center justify-center gap-2 mb-4">
                <Crown className="h-4 w-4 text-violet-500" />
                Planos de Assinatura
                <span className="text-[9px] font-bold bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full ml-1">
                  PLANO MENSAL
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {planosMensais.map(p => (
                  <PlanCard key={p.id} product={p} isCurrentPlan={activePlan?.id === p.id} onSelect={handleSelectProduct} />
                ))}
              </div>
            </div>
          )}

          {/* Planos Semestrais */}
          {planosSemestrais.length > 0 && (
            <div className="bg-emerald-50/60 rounded-2xl p-5 border border-emerald-100">
              <h2 className="text-2xl font-black text-gray-700 uppercase tracking-wider flex items-center justify-center gap-2 mb-4">
                <Crown className="h-4 w-4 text-amber-500" />
                Planos de Assinatura
                <span className="text-[9px] font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full ml-1">
                  PLANO SEMESTRAL
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {planosSemestrais.map(p => (
                  <PlanCard key={p.id} product={p} isCurrentPlan={activePlan?.id === p.id} onSelect={handleSelectProduct} />
                ))}
              </div>
            </div>
          )}

          {/* Planos Anuais */}
          {planosAnuais.length > 0 && (
            <div className="bg-emerald-50/60 rounded-2xl p-5 border border-emerald-100">
              <h2 className="text-2xl font-black text-gray-700 uppercase tracking-wider flex items-center justify-center gap-2 mb-4">
                <Crown className="h-4 w-4 text-emerald-500" />
                Planos de Assinatura
                <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full ml-1">
                  PLANO ANUAL
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {planosAnuais.map(p => (
                  <PlanCard key={p.id} product={p} isCurrentPlan={activePlan?.id === p.id} onSelect={handleSelectProduct} />
                ))}
              </div>
            </div>
          )}

          {/* Savings comparison table */}
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-2xl p-5 border border-violet-100">
            <h3 className="text-sm font-black text-violet-700 flex items-center gap-2 mb-3">
              <BadgePercent className="h-4 w-4" />
              Economia por plano
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-violet-200">
                    <th className="text-left py-2 px-3 font-bold text-violet-600">Plano</th>
                    <th className="text-center py-2 px-3 font-bold text-violet-600">Créditos</th>
                    <th className="text-center py-2 px-3 font-bold text-violet-600">Bônus</th>
                    <th className="text-right py-2 px-3 font-bold text-violet-600">Valor</th>
                    <th className="text-right py-2 px-3 font-bold text-violet-600">Por Crédito</th>
                    <th className="text-center py-2 px-3 font-bold text-violet-600">Economia</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => {
                    const baseRate = products[0]?.cost_per_credit_cents || p.cost_per_credit_cents;
                    const savings = baseRate > 0 ? Math.round((1 - p.cost_per_credit_cents / baseRate) * 100) : 0;
                    return (
                      <tr key={p.id} className={`${i % 2 === 0 ? "bg-white/50" : ""} ${p.is_recommended ? "bg-orange-50" : ""}`}>
                        <td className="py-2 px-3 font-bold text-gray-700">
                          {p.is_recommended && <Star className="h-3 w-3 inline mr-1 text-[#FF6A00]" />}
                          {p.name}
                        </td>
                        <td className="py-2 px-3 text-center text-gray-600">{p.credits_base}</td>
                        <td className="py-2 px-3 text-center">
                          {p.credits_bonus > 0 ? (
                            <span className="text-emerald-600 font-bold">+{p.credits_bonus}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-gray-700">{formatCurrency(p.price_cents)}</td>
                        <td className="py-2 px-3 text-right font-black text-[#FF6A00]">{formatCurrency(p.cost_per_credit_cents)}</td>
                        <td className="py-2 px-3 text-center">
                          {savings > 0 ? (
                            <span className="text-emerald-600 font-black">−{savings}%</span>
                          ) : (
                            <span className="text-gray-300">ref.</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RESULTS SECTION ═══ */}
      {activeSection === "results" && (
        <div className="space-y-4">
          {/* Per-module breakdown from ledger */}
          {(() => {
            const moduleBreakdown: Record<string, { debits: number; credits: number; count: number }> = {};
            for (const entry of ledger) {
              const mod = entry.reason_code?.startsWith("m1") ? "M1"
                : entry.reason_code?.includes("purchase_intention") ? "CESTA1"
                : entry.reason_code?.includes("bid") ? "LEILÃO"
                : entry.reason_code?.includes("arremate") ? "ARREMATE"
                : null;
              if (mod && entry.entry_type === "debit") {
                if (!moduleBreakdown[mod]) moduleBreakdown[mod] = { debits: 0, credits: 0, count: 0 };
                moduleBreakdown[mod].debits += entry.amount;
                moduleBreakdown[mod].count += 1;
              }
            }

            const modules = Object.keys(moduleBreakdown);
            if (modules.length === 0 && resultMetrics.length === 0) {
              return (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <BarChart3 className="h-8 w-8 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-600 mb-1">Nenhuma métrica ainda</h3>
                  <p className="text-sm text-gray-400 max-w-xs mx-auto">
                    Quando seus créditos gerarem resultados, as métricas aparecerão aqui.
                  </p>
                </div>
              );
            }

            return (
              <>
                {/* From ledger aggregation */}
                {modules.length > 0 && (
                  <div>
                    <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-[#FF6A00]" />
                      Consumo recente por módulo
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {modules.map(mod => {
                        const mc = MODULE_COLORS[mod] || { text: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };
                        const Icon = MODULE_ICONS[mod] || Zap;
                        const data = moduleBreakdown[mod];
                        return (
                          <div key={mod} className={`rounded-2xl border p-4 ${mc.bg} ${mc.border}`}>
                            <div className="flex items-center gap-2 mb-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/80 ${mc.text}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <h4 className="text-sm font-black text-gray-700">{mod}</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white/70 rounded-lg p-2.5">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Créditos Gastos</p>
                                <p className="text-xl font-black text-gray-800">{data.debits}</p>
                              </div>
                              <div className="bg-white/70 rounded-lg p-2.5">
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Eventos</p>
                                <p className="text-xl font-black text-gray-800">{data.count}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* From result_metrics table */}
                {resultMetrics.length > 0 && (
                  <div>
                    <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-3 mt-4">
                      <Award className="h-4 w-4 text-violet-500" />
                      Resultado detalhado
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {resultMetrics.map(m => {
                        const mc = MODULE_COLORS[m.module] || { text: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };
                        const Icon = MODULE_ICONS[m.module] || Zap;
                        return (
                          <div key={`${m.module}-${m.period_month}`} className="bg-white rounded-2xl border border-gray-100 p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mc.bg} ${mc.text}`}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <h4 className="text-sm font-black text-gray-700">{m.module}</h4>
                              <span className="text-[9px] text-gray-400 ml-auto">{m.period_month}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[9px] text-gray-400 font-bold uppercase">Créditos</p>
                                <p className="text-lg font-black text-gray-800">{m.credits_spent}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[9px] text-gray-400 font-bold uppercase">Intenções</p>
                                <p className="text-lg font-black text-blue-600">{m.intentions_received}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[9px] text-gray-400 font-bold uppercase">Cliques</p>
                                <p className="text-lg font-black text-emerald-600">{m.clicks_generated}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-2">
                                <p className="text-[9px] text-gray-400 font-bold uppercase">Eventos</p>
                                <p className="text-lg font-black text-gray-800">{m.events_generated}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ═══ STATEMENT SECTION ═══ */}
      {activeSection === "statement" && (
        <div className="space-y-2">
          {ledger.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-gray-600 mb-1">Nenhuma movimentação</h3>
              <p className="text-sm text-gray-400">Compre créditos para iniciar seu extrato.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black text-gray-700 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-gray-400" />
                  Últimas {ledger.length} movimentações
                </h3>
              </div>
              {ledger.map(entry => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ═══ WALLET PAY SECTION ═══ */}
      {activeSection === "wallet" && (
        <div className="space-y-6">

          {/* Recharge advice banner */}
          {rechargeAdvice.urgency !== "low" && (
            <div className={`rounded-2xl p-4 flex items-center gap-3 ${
              rechargeAdvice.urgency === "critical" ? "bg-red-50 border border-red-200" :
              rechargeAdvice.urgency === "high" ? "bg-amber-50 border border-amber-200" :
              "bg-blue-50 border border-blue-200"
            }`}>
              <AlertTriangle className={`h-5 w-5 shrink-0 ${
                rechargeAdvice.urgency === "critical" ? "text-red-500" :
                rechargeAdvice.urgency === "high" ? "text-amber-500" :
                "text-blue-500"
              }`} />
              <div className="flex-1">
                <p className={`text-sm font-bold ${
                  rechargeAdvice.urgency === "critical" ? "text-red-700" :
                  rechargeAdvice.urgency === "high" ? "text-amber-700" :
                  "text-blue-700"
                }`}>
                  {rechargeAdvice.urgency === "critical"
                    ? "⚠️ Créditos acabando! Restam apenas ~" + rechargeAdvice.daysRemaining + " dias"
                    : rechargeAdvice.urgency === "high"
                    ? "Seus créditos duram mais ~" + rechargeAdvice.daysRemaining + " dias"
                    : "Sugestão de recarga em breve (~" + rechargeAdvice.daysRemaining + " dias restantes)"}
                </p>
                <p className="text-[11px] text-gray-500">
                  Consumo médio: {rechargeAdvice.avgDailyConsumption} créditos/dia · Sugerimos o {rechargeAdvice.suggestedPackage}
                </p>
              </div>
            </div>
          )}

          {/* Module consumption breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-[#FF6A00]" />
              Consumo por Módulo
            </h3>
            {payConsumption.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum consumo registrado</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {payConsumption.map(c => (
                  <div key={c.module} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{c.label}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-2xl font-black text-gray-800">{c.credits_consumed}</span>
                      <span className="text-[10px] text-gray-400">créditos</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{c.event_count} eventos</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Purchase history with BRL */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-4">
              <CreditCard className="h-4 w-4 text-emerald-500" />
              Histórico de Compras de Créditos
            </h3>
            {payPurchases.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhuma compra realizada</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-bold text-gray-500">Data</th>
                      <th className="text-left py-2 px-3 font-bold text-gray-500">Produto</th>
                      <th className="text-center py-2 px-3 font-bold text-gray-500">Créditos</th>
                      <th className="text-right py-2 px-3 font-bold text-gray-500">Valor Pago</th>
                      <th className="text-center py-2 px-3 font-bold text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payPurchases.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-gray-600">
                          {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-gray-700">{p.product_name}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-600">+{p.credits_added}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-700">
                          {(p.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-[9px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Debit justifications */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-black text-gray-700 flex items-center gap-2 mb-4">
              <ArrowUpCircle className="h-4 w-4 text-red-400" />
              Débitos com Justificativa
            </h3>
            {payDebits.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum débito registrado</p>
            ) : (
              <div className="space-y-2">
                {payDebits.map(d => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <ArrowUpCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate font-medium">{d.description}</p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                          <span>{new Date(d.created_at).toLocaleString("pt-BR")}</span>
                          {d.purchase_intention_id && (
                            <span className="bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded font-bold">CESTA1</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="text-sm font-black text-red-500">−{d.amount} cr.</span>
                      <p className="text-[9px] text-gray-300">saldo: {d.balance_after}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ═══ CHECKOUT DRAWER (Multi-step) ═══ */}
      {checkoutProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isProcessing && checkoutStep === "select" && handleCloseCheckout()}
          />

          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg mx-auto p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto">

            {/* Close (only on select and confirmed/failed) */}
            {(checkoutStep === "select" || checkoutStep === "confirmed" || checkoutStep === "failed") && (
              <button
                onClick={handleCloseCheckout}
                disabled={isProcessing}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <span className="text-gray-500 font-bold text-sm">✕</span>
              </button>
            )}

            {/* ─── STEP 1: SELECT PAYMENT ─── */}
            {checkoutStep === "select" && (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center shadow-md">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-800">Checkout</h2>
                    <p className="text-xs text-gray-400">Confirme sua compra de créditos</p>
                  </div>
                </div>

                {/* Order Summary */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-4 mb-5 border border-gray-200">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Resumo do Pedido</p>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-700">{checkoutProduct.name}</span>
                    <span className="text-[9px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full uppercase">
                      {TYPE_LABELS[checkoutProduct.type]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-gray-200">
                    <span className="text-xs text-gray-500">Créditos</span>
                    <span className="text-sm font-black text-gray-800">{checkoutProduct.credits_total}</span>
                  </div>
                  {checkoutProduct.credits_bonus > 0 && (
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-gray-500">Bônus incluído</span>
                      <span className="text-sm font-bold text-emerald-600">+{checkoutProduct.credits_bonus}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-t border-gray-200 mt-1">
                    <span className="text-sm font-black text-gray-800">Total</span>
                    <span className="text-xl font-black text-[#FF6A00]">
                      {formatCurrency(checkoutProduct.price_cents)}
                    </span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mb-5">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-3">Forma de Pagamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: "pix" as const, label: "PIX", icon: "⚡", desc: "Aprovação imediata" },
                      { key: "boleto" as const, label: "Boleto", icon: "📄", desc: "1-3 dias úteis" },
                      { key: "cartao" as const, label: "Cartão", icon: "💳", desc: "Aprovação rápida" },
                    ]).map(m => (
                      <button
                        key={m.key}
                        onClick={() => setPaymentMethod(m.key)}
                        disabled={isProcessing}
                        className={`p-3 rounded-xl border-2 transition-all text-center ${
                          paymentMethod === m.key
                            ? "border-[#FF6A00] bg-orange-50 shadow-md"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <span className="text-xl block mb-1">{m.icon}</span>
                        <p className="text-xs font-black text-gray-700">{m.label}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2 mb-5 border border-emerald-100">
                  <Shield className="h-4 w-4 text-emerald-500 shrink-0" />
                  <p className="text-[10px] text-emerald-700 font-medium">
                    Pagamento seguro. Créditos ativados após confirmação real do pagamento.
                  </p>
                </div>

                <button
                  onClick={handleConfirmPurchase}
                  disabled={isProcessing}
                  className={`w-full py-4 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 ${
                    isProcessing
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                  }`}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Gerando cobrança...</>
                  ) : (
                    <><CreditCard className="h-4 w-4" /> Confirmar e Pagar {formatCurrency(checkoutProduct.price_cents)}</>
                  )}
                </button>

                <button
                  onClick={handleCloseCheckout}
                  disabled={isProcessing}
                  className="w-full py-2.5 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium"
                >
                  Cancelar
                </button>
              </>
            )}

            {/* ─── STEP 2: AWAITING PAYMENT ─── */}
            {checkoutStep === "awaiting" && activeOrder && (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
                    <Timer className="h-8 w-8 text-amber-500 animate-pulse" />
                  </div>
                  <h2 className="text-lg font-black text-gray-800">Aguardando Pagamento</h2>
                  <p className="text-xs text-gray-400 mt-1">Complete o pagamento para liberar seus créditos</p>
                </div>

                {/* Order info summary */}
                <div className="bg-gray-50 rounded-xl p-3 mb-5 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{checkoutProduct.name}</span>
                    <span className="text-sm font-black text-[#FF6A00]">{formatCurrency(checkoutProduct.price_cents)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-gray-400">{checkoutProduct.credits_total} créditos</span>
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase">Aguardando</span>
                  </div>
                </div>

                {/* PIX Payment */}
                {paymentMethod === "pix" && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-2xl p-6 text-center">
                      <QrCode className="h-32 w-32 mx-auto text-white/90 mb-3" />
                      <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Escaneie o QR Code</p>
                    </div>

                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Código PIX (copia e cola)</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[10px] text-gray-600 font-mono truncate">
                          {activeOrder.pix_code || "Código PIX não disponível"}
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(activeOrder.pix_code || "");
                            toast.success("Código PIX copiado!", { duration: 2000 });
                          }}
                          className="shrink-0 w-10 h-10 rounded-xl bg-[#FF6A00] text-white flex items-center justify-center hover:bg-[#E05F00] transition-colors"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-100">
                      <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                      <p className="text-[10px] text-amber-700 font-medium">
                        Expira em 30 minutos. Após o pagamento, os créditos serão liberados automaticamente.
                      </p>
                    </div>
                  </div>
                )}

                {/* Boleto Payment */}
                {paymentMethod === "boleto" && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Linha Digitável</p>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm font-mono text-gray-700 break-all">{activeOrder.boleto_line || "Linha digitável não disponível"}</p>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(activeOrder.boleto_line || "");
                            toast.success("Linha digitável copiada!", { duration: 2000 });
                          }}
                          className="shrink-0 w-10 h-10 rounded-xl bg-[#FF6A00] text-white flex items-center justify-center hover:bg-[#E05F00] transition-colors"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-3">
                        Vencimento: {activeOrder.expires_at ? new Date(activeOrder.expires_at).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
                      <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                      <p className="text-[10px] text-blue-700 font-medium">
                        O boleto pode levar até 3 dias úteis para compensar. Créditos liberados após confirmação.
                      </p>
                    </div>
                  </div>
                )}

                {/* Cartão Payment */}
                {paymentMethod === "cartao" && (
                  <div className="space-y-4">
                    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 text-center">
                      <Loader2 className="h-10 w-10 mx-auto text-violet-500 animate-spin mb-3" />
                      <p className="text-sm font-bold text-violet-700">Processando pagamento no cartão...</p>
                      <p className="text-[10px] text-violet-500 mt-1">
                        Aguardando autorização da operadora
                      </p>
                    </div>

                    <div className="flex items-center gap-2 bg-violet-50 rounded-xl px-3 py-2 border border-violet-100">
                      <Shield className="h-4 w-4 text-violet-500 shrink-0" />
                      <p className="text-[10px] text-violet-700 font-medium">
                        Transação segura. Créditos liberados imediatamente após aprovação.
                      </p>
                    </div>
                  </div>
                )}

                {/* Polling indicator */}
                <div className="flex items-center justify-center gap-2 mt-5 py-2">
                  <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                  <p className="text-[10px] text-gray-400">Verificando status do pagamento...</p>
                </div>

                <button
                  onClick={handleCloseCheckout}
                  className="w-full py-2.5 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium"
                >
                  Cancelar pedido
                </button>
              </>
            )}

            {/* ─── STEP 3: CONFIRMED ─── */}
            {checkoutStep === "confirmed" && (
              <>
                <div className="text-center py-4">
                  <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-10 w-10 text-emerald-500" />
                  </div>
                  <h2 className="text-xl font-black text-gray-800 mb-1">Pagamento Confirmado!</h2>
                  <p className="text-sm text-gray-500">
                    {checkoutProduct.credits_total} créditos foram adicionados à sua conta.
                  </p>

                  <div className="bg-emerald-50 rounded-2xl p-4 mt-5 border border-emerald-200">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-gray-500">Produto</span>
                      <span className="text-sm font-bold text-gray-700">{checkoutProduct.name}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-gray-500">Créditos adicionados</span>
                      <span className="text-sm font-black text-emerald-600">+{checkoutProduct.credits_total}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-gray-500">Valor pago</span>
                      <span className="text-sm font-bold text-gray-700">{formatCurrency(checkoutProduct.price_cents)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-gray-500">Método</span>
                      <span className="text-sm font-bold text-gray-700">{paymentMethod === "pix" ? "PIX" : paymentMethod === "boleto" ? "Boleto" : "Cartão"}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setCheckoutProduct(null); setActiveOrder(null); setCheckoutStep("select"); }}
                  className="w-full py-4 rounded-xl text-sm font-black bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg hover:shadow-xl transition-all mt-4"
                >
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle className="h-4 w-4" /> Concluído
                  </span>
                </button>
              </>
            )}

            {/* ─── STEP 4: FAILED ─── */}
            {checkoutStep === "failed" && (
              <>
                <div className="text-center py-4">
                  <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                    <XCircle className="h-10 w-10 text-red-500" />
                  </div>
                  <h2 className="text-xl font-black text-gray-800 mb-1">
                    {activeOrder?.status === "expired" ? "Pagamento Expirado" : "Pagamento Não Aprovado"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {activeOrder?.status === "expired"
                      ? "O prazo para pagamento expirou. Tente novamente."
                      : "O pagamento não foi aprovado. Verifique os dados e tente novamente."}
                  </p>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleCloseCheckout}
                    className="flex-1 py-3 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => { setCheckoutStep("select"); setActiveOrder(null); }}
                    className="flex-1 py-3 rounded-xl text-sm font-black bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white shadow-lg hover:shadow-xl transition-all"
                  >
                    Tentar Novamente
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
