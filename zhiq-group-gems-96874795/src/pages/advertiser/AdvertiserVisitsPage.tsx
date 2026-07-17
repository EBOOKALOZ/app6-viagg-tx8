/**
 * AdvertiserVisitsPage — Centro de Inteligência Comercial VIAGG-TX8™
 * BI completo: visitas, créditos, gráficos, IA analítica, simulador, upgrade.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Eye, TrendingUp, Coins, AlertTriangle, Zap, ShoppingCart,
  MessageCircle, Phone, Star, Package, ArrowRight, RefreshCw,
  BrainCircuit, Calculator, BarChart3, Clock, MapPin,
  CheckCircle, XCircle, Loader2, ChevronRight, Gift, Crown,
} from "lucide-react";
import { viaggAI } from "@/lib/viaggAI";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface VisitEvent {
  id: string;
  product_id: string | null;
  city: string | null;
  neighborhood: string | null;
  source: string | null;
  status: string;
  credits_charged: number | null;
  created_at: string;
}
interface ProductInfo { title: string; image: string | null }

// ── Custos por ação (centralizados) ───────────────────────────────────────────

const CREDIT_COSTS: Record<string, { cost: number; label: string; icon: React.ElementType; color: string; desc: string }> = {
  product_click:     { cost: 1,  label: "Clique em produto",   icon: Eye,           color: "#3B82F6", desc: "Usuário clicou em um produto da sua loja" },
  store_entry:       { cost: 3,  label: "Entrada na loja",     icon: TrendingUp,    color: "#FF6A00", desc: "Visitante entrou na sua loja via anúncio" },
  cart_addition:     { cost: 5,  label: "Carrinho",            icon: ShoppingCart,  color: "#8B5CF6", desc: "Produto adicionado ao carrinho" },
  order_completed:   { cost: 5,  label: "Pedido concluído",    icon: Package,       color: "#22C55E", desc: "Comprador finalizou um pedido" },
  offer_accepted:    { cost: 9,  label: "Oferta aceita",       icon: Star,          color: "#F59E0B", desc: "Você visualizou e aceitou uma oferta" },
  whatsapp_unlocked: { cost: 13, label: "WhatsApp desbloqueado", icon: Phone,       color: "#25D366", desc: "Contato direto desbloqueado com comprador" },
  direct_message:    { cost: 13, label: "Conversa direta",     icon: MessageCircle, color: "#6366F1", desc: "Conversa iniciada com vendedor" },
};

// ── Pacotes de upgrade ─────────────────────────────────────────────────────────

const PLANS = [
  { name: "Gratuito",    credits: 30,   price: 0,    priceLabel: "Grátis",    color: "#6B7280", features: ["30 créditos de boas-vindas", "Básico"] },
  { name: "Básico",      credits: 100,  price: 19.9, priceLabel: "R$ 19,90",  color: "#3B82F6", features: ["100 créditos", "Validade 30 dias", "Relatórios básicos"] },
  { name: "Profissional",credits: 300,  price: 49.9, priceLabel: "R$ 49,90",  color: "#FF6A00", features: ["300 créditos", "Validade 60 dias", "Análise Viagg-TX8™", "Relatórios completos"], recommended: true },
  { name: "Premium",     credits: 600,  price: 89.9, priceLabel: "R$ 89,90",  color: "#8B5CF6", features: ["600 créditos", "Validade 90 dias", "Análise Viagg-TX8™ avançada", "Suporte prioritário"] },
  { name: "Empresarial", credits: 1500, price: 199,  priceLabel: "R$ 199,00", color: "#F59E0B", features: ["1500 créditos", "Validade 180 dias", "Análise Viagg-TX8™ ilimitada", "Gerente dedicado"] },
];

// ── Formatadores ──────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
function fmtHour(iso: string) {
  return new Date(iso).getHours() + "h";
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon: Icon, color, negative, pulse,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; negative?: boolean; pulse?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 border flex items-start gap-3 ${
      negative ? "bg-red-950/30 border-red-500/30" : "bg-white border-gray-100 shadow-sm"
    }`}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon className={`w-5 h-5 ${pulse ? "animate-pulse" : ""}`} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium truncate">{title}</p>
        <p className={`text-xl font-black leading-tight mt-0.5 ${negative ? "text-red-500" : "text-gray-900"}`}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

export default function AdvertiserVisitsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]                 = useState<"overview" | "credits" | "history" | "ai">("overview");
  const [chartPeriod, setChartPeriod] = useState<"hour" | "day" | "month">("day");
  const [simVisits, setSimVisits]     = useState(100);
  const [aiInsights, setAiInsights]   = useState<string[]>([]);
  const [aiLoading, setAiLoading]     = useState(false);

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["advertiser-visits-bi", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: ms } = await (supabase.from("merchant_stores" as any)
        .select("id").eq("user_id", user!.id).maybeSingle()) as any;
      const storeId = (ms as any)?.id;
      if (!storeId) return null;

      const { data: rows } = await (supabase.from("marketplace_product_click_events" as any)
        .select("id, product_id, city, neighborhood, source, status, credits_charged, created_at")
        .eq("store_id", storeId)
        .not("status", "in", "(owner_skip,dry_run)")
        .order("created_at", { ascending: false })
        .limit(1000)) as any;
      const events: VisitEvent[] = rows || [];

      // Produtos
      const ids = Array.from(new Set(events.map((e) => e.product_id).filter(Boolean))) as string[];
      const products: Record<string, ProductInfo> = {};
      const resolveImg = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) return raw;
        const { data: pub } = supabase.storage.from("marketing-materials").getPublicUrl(raw);
        return pub?.publicUrl ?? null;
      };
      if (ids.length) {
        const { data: mmp } = await (supabase.from("merchant_marketing_products" as any)
          .select("id, title, image_url").in("id", ids)) as any;
        (mmp || []).forEach((p: any) => { products[p.id] = { title: p.title || "Produto", image: resolveImg(p.image_url) }; });
        const missing = ids.filter((id) => !products[id]);
        if (missing.length) {
          const { data: adv } = await (supabase.from("advertiser_listings" as any)
            .select("id, title, cover_image_url").in("id", missing)) as any;
          (adv || []).forEach((a: any) => { products[a.id] = { title: a.title || "Produto", image: resolveImg(a.cover_image_url) }; });
        }
        const missing2 = ids.filter((id) => !products[id]);
        if (missing2.length) {
          const { data: mp } = await (supabase.from("marketplace_products" as any)
            .select("id, title, cover_image_url").in("id", missing2)) as any;
          (mp || []).forEach((p: any) => { products[p.id] = { title: p.title || "Produto", image: resolveImg(p.cover_image_url) }; });
        }
      }

      // Saldo
      const { data: advAcc } = await (supabase.from("advertiser_accounts" as any)
        .select("id").eq("user_id", user!.id).maybeSingle()) as any;
      let available = 0, consumed = 0;
      const usageByReason: Record<string, number> = {};
      if ((advAcc as any)?.id) {
        const { data: bal } = await (supabase.from("advertiser_credit_balances" as any)
          .select("available_credits, consumed_credits")
          .eq("advertiser_account_id", (advAcc as any).id).maybeSingle()) as any;
        available = Number((bal as any)?.available_credits ?? 0);
        consumed  = Number((bal as any)?.consumed_credits ?? 0);

        const { data: ledger } = await (supabase.from("advertiser_credit_ledger" as any)
          .select("reason_code, amount, created_at")
          .eq("advertiser_account_id", (advAcc as any).id)
          .eq("entry_type", "debit")
          .order("created_at", { ascending: false })
          .limit(2000)) as any;
        (ledger || []).forEach((r: any) => {
          if (r.reason_code) usageByReason[r.reason_code] = (usageByReason[r.reason_code] || 0) + 1;
        });
      }

      return { events, products, available, consumed, usageByReason, storeId };
    },
  });

  // ── Derivações ─────────────────────────────────────────────────────────────

  const events      = data?.events      || [];
  const products    = data?.products    || {};
  const available   = data?.available   ?? 0;
  const consumed    = data?.consumed    ?? 0;
  const usageByReason = data?.usageByReason || {};
  const isNegative  = available < 0;
  const totalVisits = events.length;
  const totalCredits = events.reduce((s, e) => s + (Number(e.credits_charged) || 0), 0);

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start7d    = startToday - 6 * 864e5;
  const start30d   = startToday - 29 * 864e5;
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const since = (from: number) => events.filter((e) => new Date(e.created_at).getTime() >= from);
  const sumCr = (arr: VisitEvent[]) => arr.reduce((s, e) => s + (Number(e.credits_charged) || 0), 0);

  const todayList  = since(startToday);
  const week7List  = since(start7d);
  const month30List= since(start30d);
  const monthList  = since(startMonth);

  const charged    = events.filter((e) => e.status === "charged");
  const convRate   = totalVisits > 0 ? ((charged.length / totalVisits) * 100).toFixed(1) : "0";

  // Unique cities
  const cities = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => { if (e.city) m.set(e.city, (m.get(e.city) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [events]);

  // Top products
  const topProducts = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => { if (e.product_id) m.set(e.product_id, (m.get(e.product_id) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  // Chart data
  const chartData = useMemo(() => {
    if (chartPeriod === "hour") {
      const m = new Map<number, number>();
      for (let h = 0; h < 24; h++) m.set(h, 0);
      todayList.forEach((e) => {
        const h = new Date(e.created_at).getHours();
        m.set(h, (m.get(h) || 0) + 1);
      });
      return Array.from(m.entries()).map(([h, count]) => ({ label: `${h}h`, count }));
    }
    if (chartPeriod === "day") {
      const m = new Map<string, { count: number; ts: number }>();
      week7List.forEach((e) => {
        const d = new Date(e.created_at);
        const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const cur = m.get(key) || { count: 0, ts: 0 };
        m.set(key, { count: cur.count + 1, ts: Math.max(cur.ts, d.getTime()) });
      });
      return Array.from(m.entries()).map(([label, v]) => ({ label, count: v.count, ts: v.ts }))
        .sort((a, b) => a.ts - b.ts);
    }
    // month
    const m = new Map<string, number>();
    events.forEach((e) => {
      const d = new Date(e.created_at);
      const key = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries()).map(([label, count]) => ({ label, count })).slice(-12);
  }, [events, chartPeriod, todayList, week7List]);

  // Simulador
  const simResults = useMemo(() => {
    const entries  = simVisits;
    const clicks   = Math.round(simVisits * 0.4);
    const carts    = Math.round(simVisits * 0.1);
    const orders   = Math.round(simVisits * 0.05);
    const wpp      = Math.round(simVisits * 0.02);
    const total    = entries * 3 + clicks * 1 + carts * 5 + orders * 5 + wpp * 13;
    const daysLeft = total > 0 && available > 0 ? Math.floor(available / (total / 30)) : 0;
    const bestPlan = PLANS.find((p) => p.credits >= total) ?? PLANS[PLANS.length - 1];
    return { entries, clicks, carts, orders, wpp, total, daysLeft, bestPlan };
  }, [simVisits, available]);

  // ── IA Analítica ──────────────────────────────────────────────────────────

  async function generateAIInsights() {
    setAiLoading(true);
    const prompt = `Você é o analista de negócios da VIAGG-TX8™. Analise estes dados do anunciante e gere 5 insights comerciais práticos em português, cada um em uma linha separada (use • no início de cada insight):

- Total de visitas: ${totalVisits}
- Visitas hoje: ${todayList.length}
- Visitas últimos 7 dias: ${week7List.length}
- Créditos disponíveis: ${available}
- Créditos consumidos: ${consumed}
- Taxa de conversão: ${convRate}%
- Cidades com mais visitas: ${cities.slice(0, 3).map(([c, n]) => `${c}(${n})`).join(", ")}
- Produto mais visitado: ${topProducts[0] ? (products[topProducts[0][0]]?.title ?? "N/D") : "N/D"}

Foque em: horários de pico, produtos com maior potencial, quando o saldo pode acabar, como aumentar conversões e qual pacote de créditos faz mais sentido.`;

    try {
      const answer = await viaggAI.ask(prompt);
      const lines  = answer.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("•"));
      setAiInsights(lines.length ? lines : [answer]);
    } catch {
      setAiInsights(["• Não foi possível gerar insights agora. Tente novamente em alguns instantes."]);
    }
    setAiLoading(false);
  }

  // ── Alert bar ─────────────────────────────────────────────────────────────

  const AlertBar = () => {
    if (isNegative) return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-700">Saldo negativo: {available} créditos</p>
          <p className="text-xs text-red-500 mt-0.5">Sua loja permanece ativa. Adquira créditos para continuar usando recursos premium.</p>
        </div>
        <button onClick={() => navigate("/anunciante/creditos")}
          className="shrink-0 text-xs font-bold text-white bg-red-500 px-3 py-1.5 rounded-xl hover:bg-red-600 transition-colors">
          Comprar agora
        </button>
      </div>
    );
    if (available <= 5) return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 animate-pulse" />
        <p className="text-sm font-bold text-red-700 flex-1">⚠ Restam apenas {available} créditos — recarregue agora para não perder clientes.</p>
        <button onClick={() => navigate("/anunciante/creditos")}
          className="shrink-0 text-xs font-bold text-white bg-red-500 px-3 py-1.5 rounded-xl">Recarregar</button>
      </div>
    );
    if (available <= 20) return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
        <p className="text-sm font-bold text-amber-700 flex-1">⚠ Atenção: restam apenas {available} créditos.</p>
        <button onClick={() => navigate("/anunciante/creditos")}
          className="shrink-0 text-xs font-bold text-amber-700 border border-amber-300 bg-amber-50 px-3 py-1.5 rounded-xl">Recarregar</button>
      </div>
    );
    return null;
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#FF6A00] mx-auto" />
        <p className="text-sm text-gray-500">Carregando dados da inteligência comercial…</p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#FF6A00]" />
              Centro de Inteligência Comercial
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Análise completa de visitas, créditos e conversões — VIAGG-TX8™</p>
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 bg-white rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>

        {/* Alert */}
        <AlertBar />

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard title="Total de Visitas"    value={totalVisits}          sub={`${todayList.length} hoje`}        icon={Eye}          color="#FF6A00" />
          <KpiCard title="Créditos Disponíveis" value={available}           sub={`${consumed} consumidos`}           icon={Coins}        color="#22C55E" negative={isNegative} pulse={isNegative} />
          <KpiCard title="Esta Semana"          value={week7List.length}    sub={`${month30List.length} em 30 dias`} icon={TrendingUp}   color="#3B82F6" />
          <KpiCard title="Taxa de Conversão"    value={`${convRate}%`}      sub={`${charged.length} cobradas`}       icon={CheckCircle}  color="#8B5CF6" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard title="Cliques WhatsApp"   value={usageByReason["whatsapp_unlocked"] || 0}  sub="13cr cada"  icon={Phone}        color="#25D366" />
          <KpiCard title="Pedidos"            value={usageByReason["order_completed"]   || 0}  sub="5cr cada"   icon={Package}      color="#F59E0B" />
          <KpiCard title="Ofertas Aceitas"    value={usageByReason["offer_accepted"]    || 0}  sub="9cr cada"   icon={Star}         color="#EF4444" />
          <KpiCard title="Créditos Gastos"    value={totalCredits}                             sub="total geral" icon={Zap}         color="#6366F1" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
          {([
            { key: "overview", label: "Visão Geral",  icon: BarChart3    },
            { key: "credits",  label: "Créditos",     icon: Coins        },
            { key: "history",  label: "Histórico",    icon: Clock        },
            { key: "ai",       label: "Análise Viagg-TX8™", icon: BrainCircuit },
          ] as const).map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  tab === t.key
                    ? "bg-[#FF6A00] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}>
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB: VISÃO GERAL ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            {/* Gráfico de visitas */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-sm font-bold text-gray-900">Visitas ao Longo do Tempo</h2>
                <div className="flex gap-1">
                  {(["hour","day","month"] as const).map((p) => (
                    <button key={p} onClick={() => setChartPeriod(p)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                        chartPeriod === p ? "bg-[#FF6A00] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}>
                      {p === "hour" ? "Hora" : p === "day" ? "Dia" : "Mês"}
                    </button>
                  ))}
                </div>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#FF6A00" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#FF6A00" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 12 }} />
                    <Area type="monotone" dataKey="count" stroke="#FF6A00" fill="url(#vg)" strokeWidth={2.5} name="Visitas" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
                  Nenhuma visita no período selecionado.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Produtos mais visitados */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">Produtos Mais Visitados</h2>
                {topProducts.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Nenhum dado disponível.</p>
                ) : (
                  <div className="space-y-3">
                    {topProducts.map(([pid, count], i) => {
                      const pct = Math.round((count / (topProducts[0]?.[1] || 1)) * 100);
                      return (
                        <div key={pid}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-black text-gray-400 w-4 shrink-0">#{i + 1}</span>
                              <span className="text-xs font-semibold text-gray-700 truncate">
                                {products[pid]?.title ?? "Produto"}
                              </span>
                            </div>
                            <span className="text-xs font-bold text-[#FF6A00] shrink-0 ml-2">{count}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#FF6A00]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cidades de origem */}
              <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#FF6A00]" />
                  Visitantes por Cidade
                </h2>
                {cities.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Sem dados de localização ainda.</p>
                ) : (
                  <div className="space-y-2.5">
                    {cities.map(([city, count], i) => {
                      const pct = Math.round((count / (cities[0]?.[1] || 1)) * 100);
                      return (
                        <div key={city}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-700 truncate">{city}</span>
                            <span className="text-xs font-bold text-gray-500 ml-2">{count} visitas</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${pct}%`,
                              background: `hsl(${240 - i * 25}, 70%, 55%)`,
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Resumo período */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Hoje",          visits: todayList.length,    credits: sumCr(todayList) },
                { label: "Últimos 7 dias",visits: week7List.length,    credits: sumCr(week7List) },
                { label: "Este mês",      visits: monthList.length,    credits: sumCr(monthList) },
                { label: "Últimos 30 dias",visits:month30List.length,  credits: sumCr(month30List) },
              ].map((p) => (
                <div key={p.label} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 text-center">
                  <p className="text-[11px] text-gray-400 font-medium">{p.label}</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{p.visits}</p>
                  <p className="text-xs text-[#FF6A00] font-semibold">{p.credits} créditos</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: CRÉDITOS ── */}
        {tab === "credits" && (
          <div className="space-y-5">
            {/* Saldo visual */}
            <div className={`rounded-2xl p-5 border ${isNegative ? "bg-red-50 border-red-200" : "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-100"}`}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-600">Saldo disponível</p>
                  <p className={`text-4xl font-black mt-1 ${isNegative ? "text-red-600" : "text-gray-900"}`}>
                    {available.toLocaleString()} <span className="text-lg font-semibold text-gray-400">créditos</span>
                  </p>
                  {isNegative && (
                    <p className="text-sm text-red-500 mt-1">
                      Você continua recebendo visitas. Sua loja está ativa, mas o saldo está negativo. Recarregue para usar recursos premium.
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total consumido</p>
                  <p className="text-2xl font-black text-gray-700">{consumed.toLocaleString()}</p>
                  <button onClick={() => navigate("/anunciante/creditos")}
                    className="mt-2 flex items-center gap-1.5 text-sm font-bold text-white bg-[#FF6A00] px-4 py-2 rounded-xl hover:bg-orange-600 transition-colors">
                    Comprar Créditos
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Consumo por ação */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4">Consumo por Tipo de Ação</h2>
              <div className="space-y-3">
                {Object.entries(CREDIT_COSTS).map(([key, cfg]) => {
                  const count = usageByReason[key] || 0;
                  const total = count * cfg.cost;
                  const Icon  = cfg.icon;
                  return (
                    <div key={key} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cfg.color}18` }}>
                        <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{cfg.label}</span>
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${cfg.color}18`, color: cfg.color }}>
                            {cfg.cost} cr
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate">{cfg.desc}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-gray-900">{count}×</p>
                        <p className="text-[11px] font-bold" style={{ color: cfg.color }}>{total} cr</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simulador de consumo */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#FF6A00]" />
                Simulador de Consumo
              </h2>
              <p className="text-xs text-gray-400 mb-4">Estime quantos créditos você vai precisar por mês</p>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">
                  Visitas esperadas por mês: <strong className="text-[#FF6A00]">{simVisits}</strong>
                </label>
                <input type="range" min={10} max={2000} step={10} value={simVisits}
                  onChange={(e) => setSimVisits(Number(e.target.value))}
                  className="w-full accent-[#FF6A00]" />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>10</span><span>2.000</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: "Entradas na loja", count: simResults.entries, cr: simResults.entries * 3, color: "#FF6A00" },
                  { label: "Cliques produto",  count: simResults.clicks,  cr: simResults.clicks * 1,  color: "#3B82F6" },
                  { label: "Carrinhos",        count: simResults.carts,   cr: simResults.carts * 5,   color: "#8B5CF6" },
                  { label: "Pedidos",          count: simResults.orders,  cr: simResults.orders * 5,  color: "#22C55E" },
                  { label: "WhatsApp",         count: simResults.wpp,     cr: simResults.wpp * 13,    color: "#25D366" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 text-xs">
                    <div>
                      <div className="font-semibold text-gray-700">{r.label}</div>
                      <div className="text-gray-400">{r.count} vezes</div>
                    </div>
                    <div className="font-black" style={{ color: r.color }}>{r.cr} cr</div>
                  </div>
                ))}
              </div>

              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">Total estimado/mês</p>
                  <p className="text-2xl font-black text-[#FF6A00]">{simResults.total} créditos</p>
                  {simResults.daysLeft > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">Saldo atual dura ~{simResults.daysLeft} dias</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-gray-400">Melhor plano</p>
                  <p className="text-sm font-black" style={{ color: simResults.bestPlan.color }}>{simResults.bestPlan.name}</p>
                  <p className="text-xs font-bold text-gray-600">{simResults.bestPlan.credits} cr</p>
                </div>
              </div>
            </div>

            {/* Pacotes */}
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Crown className="w-4 h-4 text-[#FF6A00]" />
                Planos Disponíveis
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PLANS.map((plan) => (
                  <div key={plan.name}
                    className={`relative bg-white border rounded-2xl p-4 flex flex-col shadow-sm transition-all hover:shadow-md ${
                      plan.recommended ? "border-[#FF6A00] ring-2 ring-[#FF6A00]/20" : "border-gray-100"
                    }`}>
                    {plan.recommended && (
                      <span className="absolute -top-2.5 left-4 text-[10px] font-black text-white bg-[#FF6A00] px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                        Recomendado
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${plan.color}18` }}>
                        <Gift className="w-4 h-4" style={{ color: plan.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-gray-900">{plan.name}</p>
                        <p className="text-xs font-bold" style={{ color: plan.color }}>{plan.credits.toLocaleString()} créditos</p>
                      </div>
                    </div>
                    <p className="text-2xl font-black text-gray-900 mb-3">{plan.priceLabel}</p>
                    <ul className="space-y-1.5 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {plan.price > 0 && (
                      <button onClick={() => navigate("/anunciante/creditos")}
                        className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
                        style={{ background: plan.color }}>
                        Assinar {plan.name}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Card upgrade premium */}
              <div className="mt-4 bg-gradient-to-r from-[#FF6A00] to-[#FF4500] rounded-2xl p-5 text-white">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-black">🚀 Aumente suas oportunidades de venda</h3>
                    <p className="text-sm text-orange-100 mt-1 mb-3">
                      Quanto maior seu saldo, maior sua capacidade de interagir com clientes, converter visitas em vendas e escalar seu negócio.
                    </p>
                    <ul className="space-y-1 mb-4">
                      {[
                        "Nunca perder um cliente por falta de créditos",
                        "Continuar respondendo ofertas em tempo real",
                        "Desbloquear WhatsApp de compradores interessados",
                        "Aproveitar 100% das visitas recebidas",
                      ].map((b) => (
                        <li key={b} className="flex items-center gap-1.5 text-xs text-orange-100">
                          <CheckCircle className="w-3.5 h-3.5 text-white shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => navigate("/anunciante/creditos")}
                        className="px-4 py-2 bg-white text-[#FF6A00] rounded-xl text-sm font-black hover:bg-orange-50 transition-colors">
                        Comprar Créditos
                      </button>
                      <button onClick={() => navigate("/anunciante/creditos")}
                        className="px-4 py-2 bg-white/20 border border-white/30 text-white rounded-xl text-sm font-bold hover:bg-white/30 transition-colors">
                        Fazer Upgrade de Plano
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: HISTÓRICO ── */}
        {tab === "history" && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Histórico de Visitas ({events.length})</h2>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Atualização automática
              </div>
            </div>
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Eye className="w-10 h-10 text-gray-200" />
                <p className="text-sm text-gray-400">Nenhuma visita registrada ainda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold text-gray-500">Data</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500">Produto</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500">Cidade</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-500">Origem</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-500">Status</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-500">Créditos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {events.slice(0, 200).map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-gray-700 font-medium truncate max-w-[140px] block">
                            {e.product_id ? (products[e.product_id]?.title ?? "Produto") : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{e.city ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-400">{e.source ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                            e.status === "charged"              ? "bg-green-50 text-green-600" :
                            e.status === "insufficient_balance" ? "bg-red-50 text-red-500"    :
                            "bg-gray-100 text-gray-400"
                          }`}>
                            {e.status === "charged" ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                            {e.status === "charged" ? "Cobrada" : e.status === "insufficient_balance" ? "Sem saldo" : "Ignorada"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-[#FF6A00]">
                          {e.credits_charged ? `-${e.credits_charged}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {events.length > 200 && (
                  <p className="text-center text-xs text-gray-400 py-4">
                    Exibindo 200 de {events.length} registros.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: IA ANALÍTICA ── */}
        {tab === "ai" && (
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <BrainCircuit className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-black text-gray-900">Análise Viagg-TX8™</h2>
                  <p className="text-sm text-gray-500 mt-0.5 mb-4">
                    Análise inteligente do comportamento da sua loja, projeção de créditos e recomendações personalizadas.
                  </p>
                  {aiInsights.length === 0 ? (
                    <button
                      onClick={generateAIInsights}
                      disabled={aiLoading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60"
                    >
                      {aiLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando dados…</>
                        : <><Zap className="w-4 h-4" /> Gerar Insights com Viagg-TX8™</>
                      }
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {aiInsights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-3 bg-white border border-indigo-100 rounded-xl p-3.5">
                          <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                            <BrainCircuit className="w-3.5 h-3.5 text-indigo-600" />
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed">{insight.replace(/^•\s*/, "")}</p>
                        </div>
                      ))}
                      <button onClick={generateAIInsights} disabled={aiLoading}
                        className="flex items-center gap-2 text-xs text-indigo-600 font-semibold hover:text-indigo-800 disabled:opacity-50">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Gerar novos insights
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Alertas inteligentes automáticos */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Alertas Inteligentes</h2>
              {[
                { condition: isNegative, color: "red", msg: `🔴 Saldo negativo: ${available} créditos. Recarregue para não perder oportunidades.` },
                { condition: !isNegative && available <= 5,  color: "red",    msg: `🔴 Crítico: apenas ${available} créditos restantes.` },
                { condition: !isNegative && available <= 20 && available > 5, color: "amber", msg: `⚠️ Atenção: apenas ${available} créditos disponíveis.` },
                { condition: todayList.length > week7List.length / 7 * 1.5, color: "green", msg: `📈 Pico de visitas hoje! ${todayList.length} visitas já registradas — aproveite o momento.` },
                { condition: cities.length > 0, color: "blue", msg: `📍 Seu principal mercado é ${cities[0]?.[0] ?? "sua cidade"} com ${cities[0]?.[1] ?? 0} visitas.` },
                { condition: totalVisits > 0 && Number(convRate) < 50, color: "amber", msg: `📊 Taxa de conversão em ${convRate}% — otimize seus anúncios para converter mais visitas.` },
              ].filter((a) => a.condition).map((alert, i) => (
                <div key={i} className={`flex items-start gap-2.5 p-3 rounded-xl text-sm ${
                  alert.color === "red"   ? "bg-red-50 border border-red-100 text-red-700" :
                  alert.color === "amber" ? "bg-amber-50 border border-amber-100 text-amber-700" :
                  alert.color === "green" ? "bg-green-50 border border-green-100 text-green-700" :
                  "bg-blue-50 border border-blue-100 text-blue-700"
                }`}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{alert.msg}</span>
                </div>
              ))}
              {!isNegative && available > 20 && todayList.length === 0 && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl text-sm bg-gray-50 border border-gray-100 text-gray-500">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  Tudo funcionando normalmente. Nenhum alerta ativo.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
