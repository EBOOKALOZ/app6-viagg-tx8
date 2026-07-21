/**
 * AdvertiserVisitsPage — CENTRO DE INTELIGÊNCIA COMERCIAL (Viagg-TX8)
 *
 * SOMENTE UI/leitura. Não toca banco/RPC/RLS/motor financeiro/comissão/ledger.
 * A plataforma NÃO cobra mais por visita/clique/crédito — a monetização é só o
 * desbloqueio de contato (2%). Esta tela deixou de ser "faturamento por visitas"
 * e passou a responder: como meus anúncios performam, quantos interessados,
 * quanto investi em desbloqueios e quanto converti.
 *
 * Fontes REAIS (todas legíveis pelo lojista): marketplace_product_click_events
 * (views), advertiser_contact_intentions (interessados, via useContactIntentions),
 * purchase_intentions (pedidos), discount_requests (ofertas), useWalletCenter
 * (financeiro + desbloqueios). Ranking/categoria/IA = heurística client-side.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useContactIntentions } from "@/hooks/useContactIntentions";
import { useWalletCenter } from "@/hooks/useWalletCenter";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  Eye, Heart, MessageSquare, Package, Handshake, CheckCircle2, DollarSign,
  TrendingUp, Clock, Star, RefreshCw, BrainCircuit, AlertTriangle, Wallet,
  Layers, Trophy, Flame, Snowflake, ArrowRight, Sparkles, Gauge,
} from "lucide-react";

// Paleta categórica pré-validada (dataviz, dark) — identidade também nos rótulos.
const CAT = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const centsBRL = (c: number) => ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => (n ?? 0).toLocaleString("pt-BR");

const MODULE_LABEL: Record<string, string> = {
  product: "Mercado", real_estate: "Imóveis", vehicles: "Veículos",
  services: "Serviços", freight: "Fretes", travel: "Viagens",
};
const PERIODS = [
  { key: "1", label: "Hoje", days: 1 }, { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 }, { key: "90", label: "90 dias", days: 90 },
  { key: "365", label: "12 meses", days: 365 },
];

function KpiCard({ title, value, sub, Icon, color, alert }: {
  title: string; value: string | number; sub?: string; Icon: any; color: string; alert?: boolean;
}) {
  return (
    <div className={`rounded-2xl bg-[#1B1F24] border p-4 ${alert ? "border-amber-500/40" : "border-[#2A3038]/60"}`}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}22` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE]">{title}</p>
      </div>
      <p className="text-2xl font-black text-[#F5F7FA] tabular-nums mt-2">{value}</p>
      {sub && <p className="text-[11px] text-[#A7B0BE]/70 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdvertiserVisitsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("30");
  const days = PERIODS.find((p) => p.key === period)!.days;
  const since = Date.now() - days * 864e5;

  const { intentions } = useContactIntentions();     // leads (advertiser_contact_intentions)
  const wc = useWalletCenter();                       // financeiro + desbloqueios (read-only)

  // ── Query real: views + pedidos + ofertas + títulos de produto ──
  const { data: bi, isLoading, refetch } = useQuery({
    queryKey: ["commercial-intel", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const storeIds: string[] = [];
      const [{ data: ms }, { data: aa }] = await Promise.all([
        (supabase.from("merchant_stores" as any).select("id").eq("user_id", user!.id)) as any,
        (supabase.from("advertiser_accounts" as any).select("id").eq("user_id", user!.id)) as any,
      ]);
      ((ms || []) as any[]).forEach((s) => s?.id && storeIds.push(s.id));
      ((aa || []) as any[]).forEach((a) => a?.id && storeIds.push(a.id));

      let views: any[] = [], offers: any[] = [];
      if (storeIds.length) {
        const [{ data: v }, { data: o }] = await Promise.all([
          (supabase.from("marketplace_product_click_events" as any)
            .select("id, product_id, city, created_at, status")
            .in("store_id", storeIds).not("status", "in", "(owner_skip,dry_run)")
            .order("created_at", { ascending: false }).limit(3000)) as any,
          (supabase.from("discount_requests" as any)
            .select("id, product_id, requested_price, product_price, status, created_at")
            .in("store_id", storeIds).neq("status", "deleted")
            .order("created_at", { ascending: false }).limit(1500)) as any,
        ]);
        views = v || []; offers = o || [];
      }
      // pedidos — RLS pi_select_store_owner filtra por dono
      const { data: ord } = await (supabase.from("purchase_intentions" as any)
        .select("id, subtotal, status, created_at")
        .order("created_at", { ascending: false }).limit(1500)) as any;
      const orders = ord || [];

      // Títulos de produto (fallback 3 tabelas) p/ ranking
      const pids = Array.from(new Set([...views, ...offers].map((x: any) => x.product_id).filter(Boolean))).slice(0, 300);
      const titleMap = new Map<string, string>();
      if (pids.length) {
        const [{ data: mmp }, { data: al }] = await Promise.all([
          (supabase.from("merchant_marketing_products" as any).select("id, title").in("id", pids)) as any,
          (supabase.from("advertiser_listings" as any).select("id, title").in("id", pids)) as any,
        ]);
        ((mmp || []) as any[]).forEach((p) => p.title && titleMap.set(p.id, p.title));
        ((al || []) as any[]).forEach((p) => !titleMap.has(p.id) && p.title && titleMap.set(p.id, p.title));
      }
      return { views, offers, orders, titles: Object.fromEntries(titleMap) };
    },
  });

  const titles = (bi?.titles ?? {}) as Record<string, string>;

  // ── Derivações no período ──
  const d = useMemo(() => {
    const inP = (iso: string) => new Date(iso).getTime() >= since;
    const views = (bi?.views ?? []).filter((v: any) => inP(v.created_at));
    const offers = (bi?.offers ?? []).filter((o: any) => inP(o.created_at));
    const orders = (bi?.orders ?? []).filter((o: any) => inP(o.created_at));
    const leads = intentions.filter((l: any) => inP(l.created_at));
    const unlocked = leads.filter((l: any) => l.status === "unlocked");
    const acceptedOffers = offers.filter((o: any) => o.status === "accepted");
    const convertedOrders = orders.filter((o: any) => o.status === "converted");

    const negotiated = orders.reduce((s: number, o: any) => s + Number(o.subtotal ?? 0), 0)
      + acceptedOffers.reduce((s: number, o: any) => s + Number(o.requested_price ?? 0), 0);
    const deals = acceptedOffers.length + convertedOrders.length;
    const conversion = views.length ? (deals / views.length) * 100 : 0;

    // Produto mais procurado (views)
    const viewsByProduct = new Map<string, number>();
    views.forEach((v: any) => v.product_id && viewsByProduct.set(v.product_id, (viewsByProduct.get(v.product_id) || 0) + 1));
    const topProductId = [...viewsByProduct.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    // Tempo médio até 1º interesse (heurística: 1ª view vs 1º lead por produto)
    const firstView = new Map<string, number>(), firstLead = new Map<string, number>();
    views.forEach((v: any) => { if (v.product_id) { const t = new Date(v.created_at).getTime(); if (!firstView.has(v.product_id) || t < firstView.get(v.product_id)!) firstView.set(v.product_id, t); } });
    leads.forEach((l: any) => { const k = l.listing_id; if (k) { const t = new Date(l.created_at).getTime(); if (!firstLead.has(k) || t < firstLead.get(k)!) firstLead.set(k, t); } });
    const gaps: number[] = [];
    firstLead.forEach((t, k) => { const fv = firstView.get(k); if (fv && t > fv) gaps.push(t - fv); });
    const avgGapH = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length / 36e5 : null;

    // Ranking por produto (une views/leads/ofertas/liberados)
    const rank = new Map<string, { views: number; leads: number; offers: number; unlocked: number; value: number }>();
    const bump = (id: string, f: keyof ReturnType<() => any>, n = 1) => {
      if (!id) return; const r = rank.get(id) || { views: 0, leads: 0, offers: 0, unlocked: 0, value: 0 }; (r as any)[f] += n; rank.set(id, r);
    };
    views.forEach((v: any) => bump(v.product_id, "views"));
    leads.forEach((l: any) => { bump(l.listing_id, "leads"); if (l.status === "unlocked") bump(l.listing_id, "unlocked"); });
    offers.forEach((o: any) => { bump(o.product_id, "offers"); if (o.status === "accepted") bump(o.product_id, "value", Number(o.requested_price ?? 0)); });
    const ranking = [...rank.entries()].map(([id, r]) => ({ id, title: titles[id] || "Produto", ...r, conv: r.views ? (r.unlocked / r.views) * 100 : 0 }))
      .sort((a, b) => b.views - a.views).slice(0, 8);

    // Por módulo (leads)
    const byModule = new Map<string, number>();
    leads.forEach((l: any) => byModule.set(l.listing_module, (byModule.get(l.listing_module) || 0) + 1));
    const moduleRows = [...byModule.entries()].map(([m, n]) => ({ modulo: MODULE_LABEL[m] || m, leads: n })).sort((a, b) => b.leads - a.leads);

    // Série temporal (buckets por dia)
    const bucket = new Map<string, { dia: string; Visualizações: number; Interessados: number; Pedidos: number }>();
    const dayKey = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const ensure = (iso: string) => { const k = dayKey(iso); if (!bucket.has(k)) bucket.set(k, { dia: k, Visualizações: 0, Interessados: 0, Pedidos: 0 }); return bucket.get(k)!; };
    views.forEach((v: any) => ensure(v.created_at).Visualizações++);
    leads.forEach((l: any) => ensure(l.created_at).Interessados++);
    orders.forEach((o: any) => ensure(o.created_at).Pedidos++);
    const series = [...bucket.values()].reverse().slice(-30);

    // Melhor horário/dia (views)
    const byHour = new Array(24).fill(0), byDow = new Array(7).fill(0);
    views.forEach((v: any) => { const dt = new Date(v.created_at); byHour[dt.getHours()]++; byDow[dt.getDay()]++; });
    const bestHour = byHour.indexOf(Math.max(...byHour));
    const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const bestDay = DOW[byDow.indexOf(Math.max(...byDow))];

    return {
      views: views.length, leads: leads.length, unlocked: unlocked.length,
      orders: orders.length, offers: offers.length, deals, negotiated, conversion,
      topProductId, topProductTitle: topProductId ? (titles[topProductId] || "Produto") : "—",
      avgGapH, ranking, moduleRows, series, bestHour, bestDay,
      pendingUnlock: leads.filter((l: any) => l.status === "pending_unlock").length,
    };
  }, [bi, intentions, since, titles]);

  // ── ORION IA Comercial + Alertas (heurística client-side) ──
  const insights = useMemo(() => {
    const out: { Icon: any; color: string; title: string; text: string }[] = [];
    const alerts: { Icon: any; tone: string; text: string }[] = [];
    if (d.views > 20 && d.leads / Math.max(d.views, 1) < 0.05)
      alerts.push({ Icon: AlertTriangle, tone: "amber", text: "Muitas visualizações mas poucos interessados — revise fotos, título e preço." });
    if (d.conversion > 8)
      alerts.push({ Icon: Flame, tone: "emerald", text: "Sua conversão está acima da média — considere ampliar o estoque dos campeões." });
    if (d.pendingUnlock > 0)
      alerts.push({ Icon: MessageSquare, tone: "blue", text: `Você tem ${d.pendingUnlock} interessado(s) aguardando liberação de contato.` });
    const hot = d.ranking.find((r) => r.views >= 5 && r.conv >= 10);
    if (hot) out.push({ Icon: Flame, color: "#d95926", title: "Produto em alta", text: `"${hot.title}" converte ${hot.conv.toFixed(0)}% das visitas.` });
    const cold = d.ranking.find((r) => r.views >= 8 && r.leads === 0);
    if (cold) { out.push({ Icon: Snowflake, color: "#3987e5", title: "Produto parado", text: `"${cold.title}" teve ${cold.views} visitas e 0 interessados — vale impulsionar.` }); alerts.push({ Icon: TrendingUp, tone: "violet", text: `Vale impulsionar "${cold.title}".` }); }
    out.push({ Icon: Clock, color: "#199e70", title: "Melhor horário", text: `Seus anúncios recebem mais visitas por volta das ${d.bestHour}h, ${d.bestDay}.` });
    const prob = Math.min(95, Math.round(d.conversion * 4 + (d.unlocked / Math.max(d.leads, 1)) * 30));
    out.push({ Icon: Gauge, color: "#c98500", title: "Probabilidade de venda", text: `Estimativa ${prob}% com base na sua conversão e desbloqueios.` });
    return { out, alerts };
  }, [d]);

  // ── Financeiro (useWalletCenter) ──
  const spentCents = wc.contact.totalSpentCents;
  const revenueEst = d.negotiated;                                   // receita estimada = valor negociado
  const roi = spentCents > 0 ? ((revenueEst - spentCents / 100) / (spentCents / 100)) * 100 : null;

  const KPIS = [
    { title: "Visualizações", value: num(d.views), Icon: Eye, color: "#3987e5" },
    { title: "Interessados", value: num(d.leads), Icon: Heart, color: "#d55181" },
    { title: "Contatos Liberados", value: num(d.unlocked), Icon: MessageSquare, color: "#199e70" },
    { title: "Pedidos", value: num(d.orders), Icon: Package, color: "#c98500" },
    { title: "Ofertas", value: num(d.offers), Icon: Handshake, color: "#9085e9" },
    { title: "Negócios Fechados", value: num(d.deals), Icon: CheckCircle2, color: "#22C55E" },
    { title: "Valor Negociado", value: brl(d.negotiated), Icon: DollarSign, color: "#FF6A00" },
    { title: "Taxa de Conversão", value: `${d.conversion.toFixed(1)}%`, Icon: TrendingUp, color: "#14b8a6" },
    { title: "Tempo até 1º interesse", value: d.avgGapH == null ? "—" : d.avgGapH < 24 ? `${d.avgGapH.toFixed(0)}h` : `${(d.avgGapH / 24).toFixed(1)}d`, Icon: Clock, color: "#6366F1" },
    { title: "Mais Procurado", value: d.topProductTitle, Icon: Star, color: "#F59E0B" },
  ];

  const funnel = [
    { etapa: "Visualizações", n: d.views, color: CAT[0] },
    { etapa: "Interessados", n: d.leads, color: CAT[4] },
    { etapa: "Liberados", n: d.unlocked, color: CAT[2] },
    { etapa: "Pedidos", n: d.orders, color: CAT[3] },
    { etapa: "Negócios", n: d.deals, color: "#22C55E" },
  ];

  return (
    <div className="space-y-6">
      {/* HEADER + PERÍODO */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#F5F7FA] tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#E55A00] flex items-center justify-center shadow-lg"><BrainCircuit className="h-5 w-5 text-white" /></div>
            Inteligência Comercial
          </h1>
          <p className="text-sm text-[#A7B0BE] mt-1">Como seus anúncios performam, quem tem interesse e quanto você converte</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1B1F24] border border-[#2A3038] rounded-xl p-1">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${period === p.key ? "bg-[#FF6A00] text-white" : "text-[#A7B0BE] hover:text-white"}`}>{p.label}</button>
            ))}
          </div>
          <button onClick={() => { refetch(); wc.refetch(); }} className="p-2.5 rounded-xl bg-[#1B1F24] border border-[#2A3038] text-[#A7B0BE] hover:text-white">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPIs COMERCIAIS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {KPIS.map((k) => <KpiCard key={k.title} {...k} />)}
      </div>

      {/* FINANCEIRO */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0D3D2E] via-[#0F4A35] to-[#124D38] border border-emerald-500/20 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-emerald-200 flex items-center gap-2"><Wallet className="h-4 w-4" /> Financeiro</h3>
          <button onClick={() => navigate("/anunciante/carteira")} className="text-xs font-bold text-emerald-200 hover:text-white flex items-center gap-1">Abrir Carteira <ArrowRight className="h-3.5 w-3.5" /></button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { l: "Saldo Disponível", v: centsBRL(wc.creditAvailableCents), c: "text-white" },
            { l: "Gasto em Desbloqueios", v: centsBRL(spentCents), c: "text-red-300" },
            { l: "Contatos Liberados", v: num(wc.contact.unlockCount), c: "text-white" },
            { l: "Valor Médio / Contato", v: centsBRL(wc.contact.avgCents), c: "text-white" },
            { l: "Receita Estimada", v: brl(revenueEst), c: "text-emerald-300" },
            { l: "ROI Estimado", v: roi == null ? "—" : `${roi.toFixed(0)}%`, c: roi != null && roi >= 0 ? "text-emerald-300" : "text-red-300" },
          ].map((x) => (
            <div key={x.l} className="bg-white/5 rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-white/50 uppercase tracking-wider font-bold">{x.l}</p>
              <p className={`text-lg font-black tabular-nums mt-1 ${x.c}`}>{x.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* GRÁFICOS: funil + evolução */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
          <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><Layers className="h-4 w-4 text-[#FF6A00]" /> Funil de Conversão</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="etapa" tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={false} tickLine={false} width={92} />
              <RTooltip contentStyle={{ background: "#0D0F12", border: "1px solid #2A3038", borderRadius: 12, color: "#fff" }} />
              <Bar dataKey="n" radius={[0, 4, 4, 0]}>{funnel.map((f, i) => <Cell key={i} fill={f.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
          <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /> Evolução ({PERIODS.find(p => p.key === period)!.label})</h3>
          {d.series.length === 0 ? <p className="text-xs text-[#A7B0BE] py-14 text-center">Sem dados no período.</p> : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={d.series}>
                <defs>
                  <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3987e5" stopOpacity={0.4} /><stop offset="100%" stopColor="#3987e5" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d55181" stopOpacity={0.4} /><stop offset="100%" stopColor="#d55181" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "#A7B0BE", fontSize: 10 }} axisLine={{ stroke: "#2A3038" }} tickLine={false} />
                <YAxis tick={{ fill: "#A7B0BE", fontSize: 10 }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <RTooltip contentStyle={{ background: "#0D0F12", border: "1px solid #2A3038", borderRadius: 12, color: "#fff" }} />
                <Area type="monotone" dataKey="Visualizações" stroke="#3987e5" fill="url(#gV)" strokeWidth={2} />
                <Area type="monotone" dataKey="Interessados" stroke="#d55181" fill="url(#gI)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ORION IA COMERCIAL + ALERTAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#1B1F24] border border-violet-500/20 p-5">
          <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-400" /> ORION IA Comercial</h3>
          <div className="space-y-2">
            {insights.out.map((i, k) => (
              <div key={k} className="flex items-start gap-3 p-3 rounded-xl bg-[#14171B] border border-[#2A3038]/60">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${i.color}22` }}><i.Icon className="w-4 h-4" style={{ color: i.color }} /></div>
                <div><p className="text-xs font-black text-[#F5F7FA]">{i.title}</p><p className="text-[11px] text-[#A7B0BE] mt-0.5">{i.text}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-[#1B1F24] border border-amber-500/20 p-5">
          <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" /> Alertas</h3>
          {insights.alerts.length === 0 ? <p className="text-xs text-[#A7B0BE] py-8 text-center">Tudo em ordem — nenhum alerta no período.</p> : (
            <div className="space-y-2">
              {insights.alerts.map((a, k) => (
                <div key={k} className={`flex items-start gap-3 p-3 rounded-xl bg-${a.tone}-500/10 border border-${a.tone}-500/20`}>
                  <a.Icon className={`w-4 h-4 text-${a.tone}-400 shrink-0 mt-0.5`} />
                  <p className="text-[11px] text-[#F5F7FA]">{a.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RANKING POR PRODUTO */}
      <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
        <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><Trophy className="h-4 w-4 text-[#c98500]" /> Ranking de Anúncios</h3>
        {d.ranking.length === 0 ? <p className="text-xs text-[#A7B0BE] py-8 text-center">Sem anúncios com atividade no período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-[#A7B0BE] border-b border-[#2A3038]/60">
                  <th className="text-left py-2 font-bold">Anúncio</th>
                  <th className="text-right py-2 font-bold">Views</th><th className="text-right py-2 font-bold">Interess.</th>
                  <th className="text-right py-2 font-bold">Ofertas</th><th className="text-right py-2 font-bold">Liberados</th>
                  <th className="text-right py-2 font-bold">Conv.</th><th className="text-right py-2 font-bold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A3038]/40">
                {d.ranking.map((r) => (
                  <tr key={r.id} className="hover:bg-[#2A3038]/20">
                    <td className="py-2.5 font-bold text-[#F5F7FA] truncate max-w-[220px]">{r.title}</td>
                    <td className="text-right tabular-nums text-[#A7B0BE]">{num(r.views)}</td>
                    <td className="text-right tabular-nums text-[#A7B0BE]">{num(r.leads)}</td>
                    <td className="text-right tabular-nums text-[#A7B0BE]">{num(r.offers)}</td>
                    <td className="text-right tabular-nums text-emerald-400">{num(r.unlocked)}</td>
                    <td className="text-right tabular-nums text-[#F5F7FA]">{r.conv.toFixed(0)}%</td>
                    <td className="text-right tabular-nums text-[#FF6A00] font-bold">{brl(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* POR MÓDULO/CATEGORIA */}
      <div className="rounded-2xl bg-[#1B1F24] border border-[#2A3038]/60 p-5">
        <h3 className="text-sm font-bold text-[#F5F7FA] mb-4 flex items-center gap-2"><Layers className="h-4 w-4 text-blue-400" /> Interessados por Categoria</h3>
        {d.moduleRows.length === 0 ? <p className="text-xs text-[#A7B0BE] py-6 text-center">Sem interessados no período.</p> : (
          <ResponsiveContainer width="100%" height={Math.max(120, d.moduleRows.length * 42)}>
            <BarChart data={d.moduleRows} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A3038" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="modulo" tick={{ fill: "#A7B0BE", fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
              <RTooltip contentStyle={{ background: "#0D0F12", border: "1px solid #2A3038", borderRadius: 12, color: "#fff" }} />
              <Bar dataKey="leads" radius={[0, 4, 4, 0]}>{d.moduleRows.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
