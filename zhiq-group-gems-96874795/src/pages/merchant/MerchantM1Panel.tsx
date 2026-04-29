import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useM1Metrics } from "@/hooks/useM1Metrics";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Eye, MousePointerClick, ShoppingCart, CheckCircle,
  Receipt, DollarSign, TrendingUp, Target, RefreshCw,
  Loader2, ArrowLeft, ChevronRight, MapPin,
  BarChart3, Zap, Sparkles, Filter, Calendar,
  FileText, Megaphone, Package,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip as RechartsTooltip, CartesianGrid,
  BarChart, Bar, Cell, PieChart, Pie,
} from "recharts";
import { MerchantRecentEvents } from "@/components/merchant/MerchantRecentEvents";

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

const fmtBRL = (cents: number) => {
  const val = (cents / 100).toFixed(2).replace(".", ",");
  return `R$ ${val}`;
};

const fmtPercent = (val: number) => `${val.toFixed(1)}%`;

const fmtNumber = (val: number) => {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return val.toString();
};

const SOURCE_LABELS: Record<string, string> = {
  group: "Grupos WhatsApp",
  postador: "Postador TX8",
  local_marketplace: "Mercado Local",
  direct: "Acesso Direto",
  campaign: "Campanhas",
  internal: "Interno",
};

const SOURCE_COLORS: Record<string, string> = {
  group: "#10B981",
  postador: "#8B5CF6",
  local_marketplace: "#F59E0B",
  direct: "#6B7280",
  campaign: "#3B82F6",
  internal: "#EC4899",
};

const PERIOD_LABELS: Record<string, string> = {
  "7d": "7 dias",
  "14d": "14 dias",
  "30d": "30 dias",
  "90d": "90 dias",
};

// ═══════════════════════════════════════
// PREMIUM CARD STYLE
// ═══════════════════════════════════════

const CARD_BG = {
  background: "linear-gradient(135deg, #1A1F2B 0%, #1E2233 50%, rgba(255,228,225,0.06) 100%)",
  borderColor: "rgba(255,228,225,0.12)",
  boxShadow: "0 4px 20px rgba(255,228,225,0.04), inset 0 1px 0 rgba(255,228,225,0.06)",
};

const SECTION_BG = {
  background: "linear-gradient(145deg, #1A1F2B 0%, #1C2132 60%, rgba(255,228,225,0.04) 100%)",
  borderColor: "rgba(255,228,225,0.10)",
  boxShadow: "0 6px 24px rgba(255,228,225,0.03), inset 0 1px 0 rgba(255,228,225,0.05)",
};

// ═══════════════════════════════════════
// KPI CARD COMPONENT
// ═══════════════════════════════════════

function KpiCard({ label, value, icon, color, borderColor, isCurrency, isPercent }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  isCurrency?: boolean;
  isPercent?: boolean;
}) {
  const display = isCurrency ? fmtBRL(value) : isPercent ? fmtPercent(value) : fmtNumber(value);
  return (
    <Card className={cn("border shadow-lg overflow-hidden relative", borderColor)} style={CARD_BG}>
      <div className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,228,225,0.25), transparent)" }} />
      <CardContent className="p-4 lg:p-5 flex flex-col items-center justify-center text-center min-h-[110px] relative z-10">
        <span className={cn("mb-2", color)}>{icon}</span>
        <p className={cn("font-black text-white/90", isCurrency || isPercent ? "text-lg lg:text-xl" : "text-2xl lg:text-3xl")}>
          {display}
        </p>
        <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════
// CONVERSION FUNNEL
// ═══════════════════════════════════════

function ConversionFunnel({ storeViews, productClicks, buyClicks, purchases }: {
  storeViews: number; productClicks: number; buyClicks: number; purchases: number;
}) {
  const steps = [
    { label: "Entradas", value: storeViews, color: "#38BDF8", icon: <Eye className="h-4 w-4" /> },
    { label: "Cliques Produto", value: productClicks, color: "#A78BFA", icon: <MousePointerClick className="h-4 w-4" /> },
    { label: "Cliques Comprar", value: buyClicks, color: "#FBBF24", icon: <ShoppingCart className="h-4 w-4" /> },
    { label: "Compras", value: purchases, color: "#34D399", icon: <CheckCircle className="h-4 w-4" /> },
  ];

  const max = Math.max(storeViews, 1);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const pct = max > 0 ? (step.value / max) * 100 : 0;
        const convRate = i > 0 && steps[i - 1].value > 0
          ? ((step.value / steps[i - 1].value) * 100).toFixed(1)
          : null;

        return (
          <div key={step.label}>
            {convRate && (
              <div className="flex items-center justify-center gap-1 mb-1.5">
                <ChevronRight className="h-3 w-3 text-white/20" />
                <span className="text-[10px] font-bold text-white/30">{convRate}% converteram</span>
                <ChevronRight className="h-3 w-3 text-white/20" />
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-28 shrink-0 flex items-center gap-2">
                <span style={{ color: step.color }}>{step.icon}</span>
                <span className="text-[11px] font-bold text-white/60">{step.label}</span>
              </div>
              <div className="flex-1 h-8 bg-[#151922] rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-3"
                  style={{
                    width: `${Math.max(pct, 3)}%`,
                    background: `linear-gradient(90deg, ${step.color}20, ${step.color}60)`,
                  }}
                >
                  <span className="text-xs font-black text-white/90">{fmtNumber(step.value)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════
// EVENT TYPE CONFIG
// ═══════════════════════════════════════

const EVENT_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  store_view: { label: "Entrada na Loja", color: "text-sky-400", badge: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  product_click: { label: "Clique em Produto", color: "text-violet-400", badge: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  buy_click: { label: "Clique em Comprar", color: "text-amber-400", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  purchase_completed: { label: "Compra Concluída", color: "text-emerald-400", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  charged: { label: "Cobrado", badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  pending: { label: "Pendente", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  failed: { label: "Falhou", badge: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  waived: { label: "Isento", badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

// ═══════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════

export default function MerchantM1Panel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    metrics, extract, period, setPeriod,
    extractPage, setExtractPage,
    isLoading, loadingExtract, refetchAll,
  } = useM1Metrics();

  const [activeTab, setActiveTab] = useState<"overview" | "products" | "regions" | "extract">("overview");

  const tabs = [
    { key: "overview" as const, label: "Visão Geral", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { key: "products" as const, label: "Produtos", icon: <Package className="h-3.5 w-3.5" /> },
    { key: "regions" as const, label: "Regiões", icon: <MapPin className="h-3.5 w-3.5" /> },
    { key: "extract" as const, label: "Extrato M1", icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  // ── Pie chart data ──
  const pieData = (metrics.by_source || []).map(s => ({
    name: SOURCE_LABELS[s.source_type] || s.source_type,
    value: s.store_views + s.product_clicks + s.buy_clicks + s.purchases,
    fill: SOURCE_COLORS[s.source_type] || "#6B7280",
  })).filter(d => d.value > 0);

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0F1117 0%, #151922 100%)" }}>
      {/* ═══ HEADER ═══ */}
      <div className="sticky top-0 z-40 px-4 py-3 lg:px-8" style={{
        background: "linear-gradient(180deg, rgba(15,17,23,0.98) 0%, rgba(15,17,23,0.85) 100%)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,228,225,0.06)",
      }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate("/merchant")} size="sm" variant="ghost"
              className="text-white/40 hover:text-white/70 hover:bg-white/5 h-8 px-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                <h1 className="text-base lg:text-lg font-black text-white/90 tracking-tight">
                  Inteligência Comercial M1
                </h1>
              </div>
              <p className="text-[10px] text-white/30 font-medium mt-0.5">
                Monetização inteligente • Rastreabilidade territorial
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="hidden sm:flex gap-1 rounded-lg p-0.5" style={{
              background: "rgba(26,31,43,0.8)", border: "1px solid rgba(255,228,225,0.06)"
            }}>
              {(["7d", "14d", "30d", "90d"] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={cn("text-[10px] font-bold px-2.5 py-1 rounded-md transition-all",
                    period === p
                      ? "bg-white/10 text-white/90 shadow-sm"
                      : "text-white/30 hover:text-white/50"
                  )}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            <Button onClick={refetchAll} size="sm" variant="ghost"
              className="text-white/30 hover:text-white/60 hover:bg-white/5 h-8 px-2">
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-5 space-y-5 pb-20">

        <MerchantRecentEvents module="m1" />

        {/* ═══ STRATEGIC BANNER ═══ */}
        <div className="rounded-xl p-3 lg:p-4 flex items-center gap-3" style={{
          background: "linear-gradient(135deg, #1A1F2B, rgba(245,158,11,0.08))",
          border: "1px solid rgba(255,228,225,0.10)"
        }}>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-[12px] text-amber-300 font-bold leading-relaxed">
              Sua loja não apenas anuncia produtos — ela compra <strong>inteligência comercial local</strong>,
              rastreabilidade territorial e conversão mensurada.
            </p>
            <p className="text-[10px] text-white/25 mt-0.5">
              Logística + Ativação Territorial + Mensuração Comercial = Viagg-TX8
            </p>
          </div>
        </div>

        {/* ═══ KPI CARDS — 8 cards ═══ */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="border shadow-lg" style={CARD_BG}>
                <CardContent className="p-5 flex items-center justify-center min-h-[110px]">
                  <Loader2 className="h-5 w-5 animate-spin text-white/20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Entradas na Loja" value={metrics.store_views}
              icon={<Eye className="h-5 w-5" />} color="text-sky-400" borderColor="border-sky-500/20" />
            <KpiCard label="Cliques em Produtos" value={metrics.product_clicks}
              icon={<MousePointerClick className="h-5 w-5" />} color="text-violet-400" borderColor="border-violet-500/20" />
            <KpiCard label="Cliques em Comprar" value={metrics.buy_clicks}
              icon={<ShoppingCart className="h-5 w-5" />} color="text-amber-400" borderColor="border-amber-500/20" />
            <KpiCard label="Compras Concluídas" value={metrics.purchases}
              icon={<CheckCircle className="h-5 w-5" />} color="text-emerald-400" borderColor="border-emerald-500/20" />
            <KpiCard label="Total Cobrado (M1)" value={metrics.total_charged_cents}
              icon={<Receipt className="h-5 w-5" />} color="text-rose-400" borderColor="border-rose-500/20" isCurrency />
            <KpiCard label="Faturamento em Vendas" value={metrics.total_sale_cents}
              icon={<DollarSign className="h-5 w-5" />} color="text-emerald-400" borderColor="border-emerald-500/20" isCurrency />
            <KpiCard label="Ticket Médio" value={metrics.avg_ticket_cents}
              icon={<TrendingUp className="h-5 w-5" />} color="text-cyan-400" borderColor="border-cyan-500/20" isCurrency />
            <KpiCard label="Taxa de Conversão" value={metrics.conversion_rate}
              icon={<Target className="h-5 w-5" />} color="text-orange-400" borderColor="border-orange-500/20" isPercent />
          </div>
        )}

        {/* ═══ TABS ═══ */}
        <div className="flex gap-1 rounded-lg p-1" style={{
          background: "rgba(26,31,43,0.8)", border: "1px solid rgba(255,228,225,0.06)"
        }}>
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 text-xs font-bold py-2.5 px-2 rounded-md transition-all flex items-center justify-center gap-1.5",
                activeTab === tab.key
                  ? "bg-white/[0.08] shadow-sm text-white/90"
                  : "text-white/30 hover:text-white/50"
              )}>
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ═══ TAB: OVERVIEW ═══ */}
        {activeTab === "overview" && (
          <div className="space-y-5">
            {/* ── Conversion Funnel ── */}
            <div className="rounded-2xl border overflow-hidden p-5 lg:p-6" style={SECTION_BG}>
              <div className="flex items-center gap-2 mb-4">
                <Filter className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-black text-white/80 tracking-wide">Funil de Conversão</h3>
              </div>
              <ConversionFunnel
                storeViews={metrics.store_views}
                productClicks={metrics.product_clicks}
                buyClicks={metrics.buy_clicks}
                purchases={metrics.purchases}
              />
            </div>

            {/* ── Daily Evolution ── */}
            <div className="rounded-2xl border overflow-hidden p-5 lg:p-6" style={SECTION_BG}>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-sky-400" />
                <h3 className="text-sm font-black text-white/80 tracking-wide">Evolução Diária</h3>
              </div>
              {metrics.daily.length > 0 ? (
                <div className="h-56 lg:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics.daily} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="date" tickFormatter={(d: string) => {
                        const dt = new Date(d);
                        return `${dt.getDate()}/${dt.getMonth() + 1}`;
                      }} tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 10 }} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.20)", fontSize: 10 }} />
                      <RechartsTooltip
                        contentStyle={{
                          background: "#1A1F2B", border: "1px solid rgba(255,228,225,0.15)",
                          borderRadius: 12, fontSize: 11, color: "#fff",
                        }}
                        labelFormatter={(d: string) => {
                          const dt = new Date(d);
                          return dt.toLocaleDateString("pt-BR");
                        }}
                      />
                      <Area type="monotone" dataKey="store_views" name="Entradas"
                        stroke="#38BDF8" fill="#38BDF810" strokeWidth={2} />
                      <Area type="monotone" dataKey="product_clicks" name="Cliques"
                        stroke="#A78BFA" fill="#A78BFA10" strokeWidth={2} />
                      <Area type="monotone" dataKey="buy_clicks" name="Comprar"
                        stroke="#FBBF24" fill="#FBBF2410" strokeWidth={2} />
                      <Area type="monotone" dataKey="purchases" name="Compras"
                        stroke="#34D399" fill="#34D39910" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center">
                  <p className="text-xs text-white/20 font-medium">Dados aparecerão assim que houver eventos</p>
                </div>
              )}
            </div>

            {/* ── Traffic Source ── */}
            <div className="rounded-2xl border overflow-hidden p-5 lg:p-6" style={SECTION_BG}>
              <div className="flex items-center gap-2 mb-4">
                <Megaphone className="h-5 w-5 text-violet-400" />
                <h3 className="text-sm font-black text-white/80 tracking-wide">Origem do Tráfego</h3>
              </div>
              {pieData.length > 0 ? (
                <div className="flex flex-col lg:flex-row items-center gap-6">
                  <div className="h-48 w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                          strokeWidth={2} stroke="#1A1F2B">
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{
                          background: "#1A1F2B", border: "1px solid rgba(255,228,225,0.15)",
                          borderRadius: 12, fontSize: 11, color: "#fff",
                        }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2 w-full">
                    {(metrics.by_source || []).map((s) => {
                      const total = s.store_views + s.product_clicks + s.buy_clicks + s.purchases;
                      return (
                        <div key={s.source_type} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#151922]/60 border border-white/[0.04]">
                          <div className="w-3 h-3 rounded-full shrink-0"
                            style={{ background: SOURCE_COLORS[s.source_type] || "#6B7280" }} />
                          <span className="text-[11px] font-bold text-white/60 flex-1">
                            {SOURCE_LABELS[s.source_type] || s.source_type}
                          </span>
                          <span className="text-[11px] font-black text-white/80">{total} eventos</span>
                          <div className="flex gap-1.5">
                            <span className="text-[9px] text-sky-400/60" title="Entradas">{s.store_views}👁</span>
                            <span className="text-[9px] text-violet-400/60" title="Cliques">{s.product_clicks}👆</span>
                            <span className="text-[9px] text-emerald-400/60" title="Compras">{s.purchases}✓</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center">
                  <p className="text-xs text-white/20 font-medium">Nenhuma origem rastreada ainda</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: PRODUCTS ═══ */}
        {activeTab === "products" && (
          <div className="space-y-5">
            <div className="rounded-2xl border overflow-hidden p-5 lg:p-6" style={SECTION_BG}>
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-5 w-5 text-violet-400" />
                <h3 className="text-sm font-black text-white/80 tracking-wide">Top 10 Produtos por Interesse</h3>
              </div>
              {(metrics.by_product || []).length > 0 ? (
                <div className="space-y-2">
                  {metrics.by_product.map((p, i) => {
                    const total = p.product_clicks + p.buy_clicks + p.purchases;
                    const max = Math.max(...metrics.by_product.map(x => x.product_clicks + x.buy_clicks + x.purchases), 1);
                    const pct = (total / max) * 100;
                    return (
                      <div key={p.product_id} className="relative rounded-xl overflow-hidden p-3 border border-white/[0.04]"
                        style={{ background: "rgba(21,25,34,0.6)" }}>
                        {/* Background bar */}
                        <div className="absolute inset-y-0 left-0 rounded-xl transition-all duration-700"
                          style={{ width: `${pct}%`, background: "linear-gradient(90deg, rgba(167,139,250,0.08), rgba(167,139,250,0.15))" }} />
                        <div className="relative z-10 flex items-center gap-3">
                          <span className="text-[11px] font-black text-white/25 w-5">#{i + 1}</span>
                          <span className="text-[12px] font-bold text-white/70 flex-1 truncate">
                            {(p as any).product_title || `Produto ${(p.product_id || "").slice(0, 8)}`}
                          </span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-sky-400/70">{p.store_views} 👁</span>
                            <span className="text-[10px] text-violet-400/70">{p.product_clicks} 👆</span>
                            <span className="text-[10px] text-amber-400/70">{p.buy_clicks} 🛒</span>
                            <span className="text-[10px] text-emerald-400">{p.purchases} ✓</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-40 flex flex-col items-center justify-center">
                  <Package className="h-8 w-8 text-white/10 mb-2" />
                  <p className="text-xs text-white/20 font-medium">Nenhum produto rastreado ainda</p>
                </div>
              )}
            </div>

            {/* ── Campaign Ranking ── */}
            {(metrics.by_campaign || []).length > 0 && (
              <div className="rounded-2xl border overflow-hidden p-5 lg:p-6" style={SECTION_BG}>
                <div className="flex items-center gap-2 mb-4">
                  <Megaphone className="h-5 w-5 text-amber-400" />
                  <h3 className="text-sm font-black text-white/80 tracking-wide">Ranking de Campanhas</h3>
                </div>
                <div className="space-y-2">
                  {metrics.by_campaign.map((c, i) => {
                    const total = c.store_views + c.product_clicks + c.buy_clicks + c.purchases;
                    return (
                      <div key={c.campaign_id} className="flex items-center gap-3 p-3 rounded-xl bg-[#151922]/60 border border-white/[0.04]">
                        <span className="text-[11px] font-black text-white/25 w-5">#{i + 1}</span>
                        <span className="text-[12px] font-bold text-white/60 flex-1 truncate font-mono">
                          {c.campaign_id.slice(0, 12)}…
                        </span>
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[9px] font-black">
                          {total} eventos
                        </Badge>
                        <span className="text-[10px] text-emerald-400 font-bold">{c.purchases} compras</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: REGIONS ═══ */}
        {activeTab === "regions" && (
          <div className="space-y-5">
            {/* ── Region KPIs ── */}
            {(metrics.by_bairro || []).length > 0 && (() => {
              const totalBairros = metrics.by_bairro.length;
              const topBairro = metrics.by_bairro[0];
              const bestConv = metrics.by_bairro.reduce((best, b) => {
                const rate = b.store_views > 0 ? (b.purchases / b.store_views) * 100 : 0;
                return rate > best ? rate : best;
              }, 0);
              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border p-3 text-center" style={CARD_BG}>
                    <p className="text-2xl font-black text-white/90">{totalBairros}</p>
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-1">Bairros Ativos</p>
                  </div>
                  <div className="rounded-xl border p-3 text-center" style={CARD_BG}>
                    <p className="text-lg font-black text-emerald-400">{bestConv.toFixed(1)}%</p>
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-1">Melhor Conversão</p>
                  </div>
                  <div className="rounded-xl border p-3 text-center" style={CARD_BG}>
                    <p className="text-sm font-black text-white/90 truncate">{topBairro?.bairro || "—"}</p>
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-1">Top Bairro</p>
                  </div>
                </div>
              );
            })()}

            {/* ── Bar Chart: Top Bairros ── */}
            {(metrics.by_bairro || []).length > 0 && (
              <div className="rounded-2xl border overflow-hidden p-5 lg:p-6" style={SECTION_BG}>
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-sm font-black text-white/80 tracking-wide">Volume por Bairro</h3>
                </div>
                <div className="h-56 lg:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metrics.by_bairro.slice(0, 10).map(b => ({
                        name: b.bairro.length > 15 ? b.bairro.slice(0, 14) + "…" : b.bairro,
                        entradas: b.store_views,
                        cliques: b.product_clicks,
                        compras: b.purchases,
                      }))}
                      layout="vertical"
                      margin={{ top: 5, right: 10, bottom: 5, left: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.20)", fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" width={100}
                        tick={{ fill: "rgba(255,255,255,0.40)", fontSize: 10 }} />
                      <RechartsTooltip contentStyle={{
                        background: "#1A1F2B", border: "1px solid rgba(255,228,225,0.15)",
                        borderRadius: 12, fontSize: 11, color: "#fff",
                      }} />
                      <Bar dataKey="entradas" name="Entradas" fill="#38BDF8" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="cliques" name="Cliques" fill="#A78BFA" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="compras" name="Compras" fill="#34D399" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── Ranking List ── */}
            <div className="rounded-2xl border overflow-hidden p-5 lg:p-6" style={SECTION_BG}>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-black text-white/80 tracking-wide">Performance por Bairro / Região</h3>
              </div>
              {(metrics.by_bairro || []).length > 0 ? (
                <div className="space-y-2">
                  {metrics.by_bairro.map((b, i) => {
                    const total = b.store_views + b.product_clicks + b.buy_clicks + b.purchases;
                    const max = Math.max(...metrics.by_bairro.map(x => x.store_views + x.product_clicks + x.buy_clicks + x.purchases), 1);
                    const pct = (total / max) * 100;
                    const convRate = b.store_views > 0 ? ((b.purchases / b.store_views) * 100).toFixed(1) : "0.0";

                    return (
                      <div key={`${b.bairro}-${b.city}`}
                        className="relative rounded-xl overflow-hidden p-3 border border-white/[0.04]"
                        style={{ background: "rgba(21,25,34,0.6)" }}>
                        <div className="absolute inset-y-0 left-0 rounded-xl transition-all duration-700"
                          style={{ width: `${pct}%`, background: "linear-gradient(90deg, rgba(16,185,129,0.06), rgba(16,185,129,0.15))" }} />
                        <div className="relative z-10 flex items-center gap-3">
                          <span className="text-[11px] font-black text-white/25 w-5">#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-white/70 truncate">{b.bairro}</p>
                            {b.city && <p className="text-[10px] text-white/25">{b.city}</p>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-sky-400/70">{b.store_views} 👁</span>
                            <span className="text-[10px] text-violet-400/70">{b.product_clicks} 👆</span>
                            <span className="text-[10px] text-emerald-400">{b.purchases} ✓</span>
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black">
                              {convRate}%
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-40 flex flex-col items-center justify-center">
                  <MapPin className="h-8 w-8 text-white/10 mb-2" />
                  <p className="text-xs text-white/20 font-medium">Nenhum bairro rastreado ainda</p>
                  <p className="text-[10px] text-white/10 mt-1">Dados aparecerão quando visitantes acessarem sua loja</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: EXTRACT ═══ */}
        {activeTab === "extract" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 px-1">
              <div>
                <p className="text-[10px] text-white/25 font-bold uppercase tracking-wider">Total no período</p>
                <p className="text-lg font-black text-white/80">{fmtBRL(extract.totalChargedCents)}</p>
              </div>
              <Badge className="bg-white/5 text-white/40 border-white/10 text-[10px] font-bold ml-auto">
                {extract.totalCount} lançamentos
              </Badge>
            </div>

            {/* Entries */}
            {loadingExtract ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-white/20" />
              </div>
            ) : extract.entries.length === 0 ? (
              <div className="rounded-2xl border overflow-hidden p-8 text-center" style={SECTION_BG}>
                <Receipt className="h-10 w-10 text-white/10 mx-auto mb-3" />
                <p className="text-sm font-bold text-white/30">Nenhum lançamento no período</p>
                <p className="text-[10px] text-white/15 mt-1">Cobranças serão geradas automaticamente a cada interação rastreada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {extract.entries.map((entry) => {
                  const evtCfg = EVENT_CONFIG[entry.event_type] || { label: entry.event_type, color: "text-zinc-400", badge: "bg-zinc-500/10 text-zinc-400" };
                  const stsCfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending;
                  const date = new Date(entry.created_at);

                  return (
                    <div key={entry.id} className="rounded-xl border p-3 lg:p-4" style={{
                      background: "linear-gradient(145deg, #1A1F2B, rgba(255,228,225,0.03))",
                      borderColor: "rgba(255,228,225,0.08)"
                    }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cn("text-[9px] font-black border px-2 py-0.5", evtCfg.badge)}>
                              {evtCfg.label}
                            </Badge>
                            <Badge className={cn("text-[9px] font-black border px-2 py-0.5", stsCfg.badge)}>
                              {stsCfg.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-white/30 flex-wrap">
                            <span>{date.toLocaleDateString("pt-BR")} às {date.toLocaleTimeString("pt-BR", {
                              hour: "2-digit", minute: "2-digit"
                            })}</span>
                            {entry.source_type && (
                              <span className="flex items-center gap-0.5">
                                <div className="w-1.5 h-1.5 rounded-full" style={{
                                  background: SOURCE_COLORS[entry.source_type] || "#6B7280"
                                }} />
                                {SOURCE_LABELS[entry.source_type] || entry.source_type}
                              </span>
                            )}
                            {entry.bairro && <span>📍 {entry.bairro}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-white/80">
                            {fmtBRL(entry.charge_amount_cents)}
                          </p>
                          {entry.sale_value_cents > 0 && (
                            <p className="text-[9px] text-emerald-400/70 font-bold">
                              Venda: {fmtBRL(entry.sale_value_cents)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination */}
                {extract.totalCount > 20 && (
                  <div className="flex items-center justify-center gap-3 pt-3">
                    <Button disabled={extractPage === 0} onClick={() => setExtractPage(p => p - 1)}
                      variant="ghost" size="sm" className="text-white/30 hover:text-white/60 text-xs">
                      ← Anterior
                    </Button>
                    <span className="text-[10px] text-white/25 font-mono">
                      Pág. {extractPage + 1} / {Math.ceil(extract.totalCount / 20)}
                    </span>
                    <Button disabled={(extractPage + 1) * 20 >= extract.totalCount}
                      onClick={() => setExtractPage(p => p + 1)}
                      variant="ghost" size="sm" className="text-white/30 hover:text-white/60 text-xs">
                      Próxima →
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ M1 RULES INFO ═══ */}
        <div className="rounded-xl p-4" style={{
          background: "linear-gradient(135deg, #1A1F2B, rgba(139,92,246,0.06))",
          border: "1px solid rgba(255,228,225,0.08)"
        }}>
          <p className="text-[10px] font-black text-white/25 uppercase tracking-wider mb-2">Tabela de Custos M1</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { label: "Entrada na Loja", value: "R$ 0,30", color: "text-sky-400" },
              { label: "Clique em Produto", value: "R$ 0,60", color: "text-violet-400" },
              { label: "Clique em Comprar", value: "R$ 0,90", color: "text-amber-400" },
              { label: "Compra Concluída", value: "1,5%", color: "text-emerald-400" },
            ].map((rule) => (
              <div key={rule.label} className="p-2.5 rounded-lg bg-[#151922]/60 border border-white/[0.04]">
                <p className="text-[9px] text-white/25 font-bold">{rule.label}</p>
                <p className={cn("text-sm font-black", rule.color)}>{rule.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
