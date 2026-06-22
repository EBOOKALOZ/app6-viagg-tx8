/**
 * AdvertiserVisitsPage — histórico de visitas (cliques/entradas na loja) por produto.
 * Fonte: marketplace_product_click_events (cobrança por visita = visibilidade da loja).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, X, Loader2, MapPin, Coins, Package, TrendingUp, AlertTriangle } from "lucide-react";

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
interface ProductInfo { title: string; image: string | null; }

const STATUS_LABEL: Record<string, string> = {
  charged: "Cobrada",
  deduped: "Repetida",
  insufficient_balance: "Sem saldo",
};

export default function AdvertiserVisitsPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["advertiser-visits", user?.id],
    enabled: !!user?.id,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: ms } = await (supabase.from("merchant_stores" as any)
        .select("id").eq("user_id", user!.id).maybeSingle()) as any;
      const storeId = (ms as any)?.id;
      if (!storeId) return { events: [] as VisitEvent[], products: {} as Record<string, ProductInfo> };

      const { data: rows } = await (supabase.from("marketplace_product_click_events" as any)
        .select("id, product_id, city, neighborhood, source, status, credits_charged, created_at")
        .eq("store_id", storeId)
        .not("status", "in", "(owner_skip,dry_run)")
        .order("created_at", { ascending: false })
        .limit(500)) as any;
      const events = (rows as VisitEvent[]) || [];

      const ids = Array.from(new Set(events.map((e) => e.product_id).filter(Boolean))) as string[];
      const products: Record<string, ProductInfo> = {};
      const resolveImg = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) return raw;
        const { data: pub } = supabase.storage.from("marketing-materials").getPublicUrl(raw);
        return pub?.publicUrl ?? null;
      };
      if (ids.length) {
        // 1) produtos do lojista (merchant_marketing_products)
        const { data: mmp } = await (supabase.from("merchant_marketing_products" as any)
          .select("id, title, image_url").in("id", ids)) as any;
        (mmp || []).forEach((p: any) => { products[p.id] = { title: p.title || "Produto", image: resolveImg(p.image_url) }; });
        // 2) anúncios (advertiser_listings + mídia)
        let missing = ids.filter((id) => !products[id]);
        if (missing.length) {
          const { data: adv } = await (supabase.from("advertiser_listings" as any)
            .select("id, title, cover_image_url, advertiser_listing_media(media_url)").in("id", missing)) as any;
          (adv || []).forEach((a: any) => {
            const raw = a.cover_image_url || a.advertiser_listing_media?.[0]?.media_url || null;
            products[a.id] = { title: a.title || "Produto", image: resolveImg(raw) };
          });
        }
        // 3) fallback marketplace_products
        missing = ids.filter((id) => !products[id]);
        if (missing.length) {
          const { data: mp } = await (supabase.from("marketplace_products" as any)
            .select("id, title, cover_image_url").in("id", missing)) as any;
          (mp || []).forEach((p: any) => { products[p.id] = { title: p.title || "Produto", image: resolveImg(p.cover_image_url) }; });
        }
      }
      // Saldo PRINCIPAL do lojista (advertiser_credit_balances) — pool unificado que as visitas consomem
      const { data: adv } = await (supabase.from("advertiser_accounts" as any)
        .select("id").eq("user_id", user!.id).maybeSingle()) as any;
      let bal: any = null;
      let advPurchases: any[] = [];
      if ((adv as any)?.id) {
        const r = await (supabase.from("advertiser_credit_balances" as any)
          .select("available_credits, consumed_credits").eq("advertiser_account_id", (adv as any).id).maybeSingle()) as any;
        bal = r?.data;

        const { data: advPurchasesData } = await (supabase.from("advertiser_credit_purchases" as any)
          .select("id, advertiser_credit_packages(name), credits_total, amount_brl, created_at")
          .eq("advertiser_account_id", (adv as any).id)
          .eq("payment_status", "paid")
          .gt("credits_total", 0)
          .order("created_at", { ascending: true })) as any;

        advPurchases = (advPurchasesData || []).map((p: any) => ({
          id: p.id,
          product_name: p.advertiser_credit_packages?.name || "Pacote de Créditos",
          credits_granted: p.credits_total,
          amount_paid: p.amount_brl,
          created_at: p.created_at
        }));
      }

      // Pacotes legados (credit_purchases)
      let purchases: any[] = [];
      if (storeId) {
        const { data } = await (supabase.from("credit_purchases" as any)
          .select("id, product_name, credits_granted, amount_paid, created_at")
          .eq("store_id", storeId).eq("status", "paid").gt("credits_granted", 0)
          .order("created_at", { ascending: true })) as any;
        purchases = data || [];
      }

      const allPackages = [...purchases, ...advPurchases].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Uso REAL por evento desde a ÚLTIMA compra de pacote (zera ao comprar
      // pacote novo). Os 6 eventos do lojista gravam débito em
      // advertiser_credit_ledger (pool unificado) OU merchant_credit_ledger
      // (fallback legado) — conta nos dois.
      const lastPackageAt = allPackages.length
        ? allPackages[allPackages.length - 1].created_at
        : null;

      const usageSinceLastPackage: Record<string, number> = {};
      const countByReason = (rows: any[] | null) => {
        for (const r of rows || []) {
          if (lastPackageAt && r.created_at <= lastPackageAt) continue;
          const code = r.reason_code;
          if (!code) continue;
          usageSinceLastPackage[code] = (usageSinceLastPackage[code] || 0) + 1;
        }
      };

      if ((adv as any)?.id) {
        const { data: advLedger } = await (supabase.from("advertiser_credit_ledger" as any)
          .select("reason_code, created_at")
          .eq("advertiser_account_id", (adv as any).id)
          .eq("entry_type", "debit")
          .order("created_at", { ascending: true })
          .limit(2000)) as any;
        countByReason(advLedger);
      }
      if (storeId) {
        const { data: merchLedger } = await (supabase.from("merchant_credit_ledger" as any)
          .select("reason_code, created_at")
          .eq("store_id", storeId)
          .eq("entry_type", "debit")
          .order("created_at", { ascending: true })
          .limit(2000)) as any;
        countByReason(merchLedger);
      }

      return {
        events, products, packages: allPackages, usageSinceLastPackage,
        consumed: Number((bal as any)?.consumed_credits ?? 0),
        available: Number((bal as any)?.available_credits ?? 0),
      };
    },
  });

  // Ocultar visitas individuais (persistido em localStorage)
  const HIDDEN_KEY = "viagg_hidden_visit_events";
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"); } catch { return []; }
  });
  const [showHidden, setShowHidden] = useState(false);
  const hideVisit = (id: string) => {
    setHiddenIds((prev) => {
      const next = Array.from(new Set([...prev, id]));
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const unhideVisit = (id: string) => {
    setHiddenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const events = data?.events || [];
  const products = data?.products || {};
  const totalVisits = events.length;
  const totalCredits = events.reduce((s, e) => s + (Number(e.credits_charged) || 0), 0);
  const perVisitCost = events.find((e) => e.status === "charged" && Number(e.credits_charged) > 0)?.credits_charged || 3;

  // Histórico dia / mês
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const since = (from: number) => events.filter((e) => new Date(e.created_at).getTime() >= from);
  const sumCr = (arr: VisitEvent[]) => arr.reduce((s, e) => s + (Number(e.credits_charged) || 0), 0);
  const todayList = since(startToday);
  const monthList = since(startMonth);
  const visitsToday = todayList.length;
  const visitsMonth = monthList.length;
  const creditsToday = sumCr(todayList);
  const creditsMonth = sumCr(monthList);

  const byDay = new Map<string, { count: number; credits: number; ts: number }>();
  for (const e of events) {
    const d = new Date(e.created_at);
    const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const cur = byDay.get(key) || { count: 0, credits: 0, ts: 0 };
    cur.count += 1;
    cur.credits += Number(e.credits_charged) || 0;
    cur.ts = Math.max(cur.ts, d.getTime());
    byDay.set(key, cur);
  }
  const dayRows = Array.from(byDay.entries()).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.ts - a.ts).slice(0, 14);

  const hiddenCount = events.filter((e) => hiddenIds.includes(e.id)).length;
  const visibleRecent = events.filter((e) => showHidden || !hiddenIds.includes(e.id)).slice(0, 100);

  // Consumo por pacote (FIFO): distribui o total consumido do lote mais antigo p/ o mais novo
  const packages = (data?.packages || []) as Array<{ id: string; product_name: string | null; credits_granted: number; created_at: string }>;
  const usageSinceLastPackage = data?.usageSinceLastPackage || {};
  const availableCredits = data?.available || 0;
  const consumedCredits = data?.consumed || 0;
  const totalEverCredits = availableCredits + consumedCredits;
  let consRemaining = consumedCredits;
  const pkgRows = packages.map((p) => {
    const granted = Number(p.credits_granted) || 0;
    const used = Math.min(consRemaining, granted);
    consRemaining -= used;
    return { id: p.id, name: p.product_name, granted, used, left: granted - used, created_at: p.created_at };
  });

  const byProduct = new Map<string, { count: number; credits: number; last: string }>();
  for (const e of events) {
    const key = e.product_id || "—";
    const cur = byProduct.get(key) || { count: 0, credits: 0, last: e.created_at };
    cur.count += 1;
    cur.credits += Number(e.credits_charged) || 0;
    if (e.created_at > cur.last) cur.last = e.created_at;
    byProduct.set(key, cur);
  }
  const productRows = Array.from(byProduct.entries())
    .map(([pid, v]) => ({ pid, ...v, info: products[pid] as ProductInfo | undefined }))
    .sort((a, b) => b.count - a.count);

  const fmt = (s: string) =>
    new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-[#0A0C0F] text-[#F5F7FA] px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0D0F12] rounded-2xl shadow-xl shadow-black/30">
            <Eye className="w-6 h-6 text-[#FF6A00]" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase">Visitas</h1>
            <p className="text-sm text-[#A7B0BE]">Quem entrou na sua loja e em quais produtos</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-[#A7B0BE]">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando visitas...
          </div>
        ) : (
          <>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#0D0F12] rounded-2xl p-5 border border-white/5">
                <div className="flex items-center gap-2 text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">
                  <TrendingUp className="w-4 h-4 text-[#FF6A00]" /> Total de visitas
                </div>
                <p className="text-4xl font-black mt-2">{totalVisits}</p>
                <p className="text-xs text-[#A7B0BE] mt-1">
                  1 visita = <span className="text-[#FF6A00] font-bold">{perVisitCost} créditos</span>
                </p>
              </div>
              <div className="bg-[#0D0F12] rounded-2xl p-5 border border-white/5">
                <div className="flex items-center gap-2 text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">
                  <Coins className="w-4 h-4 text-[#FF6A00]" /> Créditos consumidos
                </div>
                <p className="text-4xl font-black mt-2">{totalCredits}</p>
              </div>
            </div>

            {/* Tabela de Consumo + Consumo por pacote */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Regras de Consumo */}
              <div className="bg-[#0D0F12] rounded-2xl p-5 border border-[#FF6A00]/20 shadow-lg shadow-[#FF6A00]/5 flex flex-col">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#FF6A00] mb-4 flex items-center gap-2 shrink-0">
                  <Coins className="w-4 h-4" /> Tabela de Consumo de Créditos
                </h2>
                <div className="grid grid-cols-2 gap-3 flex-1 content-start">
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-center">
                    <p className="text-xl font-black text-white">1 <span className="text-[10px] text-[#A7B0BE] font-bold uppercase">crédito</span></p>
                    <p className="text-xs text-[#A7B0BE] mt-1 font-medium leading-tight mb-2">Para o usuário clicar em cada produto</p>
                    <div className="mt-auto pt-2 border-t border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#22C55E]">Usado: {usageSinceLastPackage["visitor_product_click"] || 0} vezes</p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-center">
                    <p className="text-xl font-black text-white">5 <span className="text-[10px] text-[#A7B0BE] font-bold uppercase">créditos</span></p>
                    <p className="text-xs text-[#A7B0BE] mt-1 font-medium leading-tight mb-2">Para o usuário adicionar na cesta</p>
                    <div className="mt-auto pt-2 border-t border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#22C55E]">Usado: {usageSinceLastPackage["visitor_cart_add"] || 0} vezes</p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-center">
                    <p className="text-xl font-black text-white">5 <span className="text-[10px] text-[#A7B0BE] font-bold uppercase">créditos</span></p>
                    <p className="text-xs text-[#A7B0BE] mt-1 font-medium leading-tight mb-2">Para o usuário Finalizar o pedido</p>
                    <div className="mt-auto pt-2 border-t border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#22C55E]">Usado: {usageSinceLastPackage["purchase_intention_received"] || 0} vezes</p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-center">
                    <p className="text-xl font-black text-white">9 <span className="text-[10px] text-[#A7B0BE] font-bold uppercase">créditos</span></p>
                    <p className="text-xs text-[#A7B0BE] mt-1 font-medium leading-tight mb-2">Para você ver e aceitar Ofertas</p>
                    <div className="mt-auto pt-2 border-t border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#22C55E]">Usado: {usageSinceLastPackage["advertiser_accept_offer"] || 0} vezes</p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-center">
                    <p className="text-xl font-black text-white">13 <span className="text-[10px] text-[#A7B0BE] font-bold uppercase">créditos</span></p>
                    <p className="text-xs text-[#A7B0BE] mt-1 font-medium leading-tight mb-2">Para desbloquear WhatsApp do cliente no pedido</p>
                    <div className="mt-auto pt-2 border-t border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#22C55E]">Usado: {usageSinceLastPackage["advertiser_unlock_order_whatsapp"] || 0} vezes</p>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-center">
                    <p className="text-xl font-black text-white">13 <span className="text-[10px] text-[#A7B0BE] font-bold uppercase">créditos</span></p>
                    <p className="text-xs text-[#A7B0BE] mt-1 font-medium leading-tight mb-2">Para falar diretamente com o Vendedor</p>
                    <div className="mt-auto pt-2 border-t border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#22C55E]">Usado: {usageSinceLastPackage["advertiser_unlock_lead_whatsapp"] || 0} vezes</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Saldo de créditos disponível (verde, diminui com o consumo) movido para cá */}
              <div className="bg-[#0D0F12] rounded-2xl p-6 border border-[#22C55E]/40 shadow-lg shadow-emerald-500/10 flex flex-col justify-center items-center text-center">
                <div className="flex items-center justify-center gap-2 text-[#22C55E] text-sm font-bold uppercase tracking-widest mb-4">
                  <Coins className="w-5 h-5" /> Créditos disponíveis
                </div>
                <p className="text-7xl font-black text-[#22C55E] mb-2">{availableCredits}</p>
                <p className="text-sm text-[#A7B0BE]">
                  de <span className="font-bold text-[#F5F7FA]">{totalEverCredits}</span> créditos · {consumedCredits} já consumidos
                </p>
              </div>
            </div>

            {totalVisits === 0 ? (
              <div className="text-center py-20 text-[#A7B0BE]">
                <Eye className="w-12 h-12 mx-auto mb-4 opacity-40" />
                <p className="font-bold text-lg">Ainda não há visitas registradas</p>
                <p className="text-sm">Quando alguém entrar na sua loja ou clicar num produto, aparece aqui.</p>
              </div>
            ) : (
              <>
                {/* Histórico dia / mês */}
                <section className="space-y-3">
                  <h2 className="text-xl font-black uppercase tracking-tight">Histórico</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0D0F12] rounded-2xl p-4 border border-white/5">
                      <p className="text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">Hoje</p>
                      <p className="text-2xl font-black mt-1">{visitsToday} <span className="text-sm text-[#A7B0BE] font-normal">visitas</span></p>
                      <p className="text-xs text-[#FF6A00] font-bold">{creditsToday} créditos</p>
                    </div>
                    <div className="bg-[#0D0F12] rounded-2xl p-4 border border-white/5">
                      <p className="text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">Este mês</p>
                      <p className="text-2xl font-black mt-1">{visitsMonth} <span className="text-sm text-[#A7B0BE] font-normal">visitas</span></p>
                      <p className="text-xs text-[#FF6A00] font-bold">{creditsMonth} créditos</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {dayRows.map((d) => (
                      <div key={d.key} className="bg-[#0D0F12] rounded-lg px-4 py-2 border border-white/5 flex items-center justify-between text-sm">
                        <span className="text-[#A7B0BE]">{d.key}</span>
                        <span><span className="font-bold">{d.count}</span> <span className="text-[#A7B0BE] text-xs">visitas</span> · <span className="text-[#FF6A00] font-bold">{d.credits} cr</span></span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Consumo por pacote movido para cima */}

                {/* Por produto */}
                <section className="space-y-3">
                  <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <Package className="w-5 h-5 text-[#FF6A00]" /> Por produto
                  </h2>
                  <div className="space-y-2">
                    {productRows.map((row) => (
                      <div key={row.pid} className="bg-[#0D0F12] rounded-xl p-3 border border-white/5 flex items-center gap-3">
                        {row.info?.image ? (
                          <img src={row.info.image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                            <Package className="w-6 h-6 text-[#A7B0BE]" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold truncate">{row.info?.title || "Produto"}</p>
                          <p className="text-xs text-[#A7B0BE]">Última visita: {fmt(row.last)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-2xl font-black text-[#FF6A00]">{row.count}</p>
                          <p className="text-[10px] text-[#A7B0BE] uppercase tracking-widest">visitas</p>
                        </div>
                        <div className="text-right shrink-0 pl-3 border-l border-white/5">
                          <p className="text-lg font-black">{row.credits}</p>
                          <p className="text-[10px] text-[#A7B0BE] uppercase tracking-widest">créditos</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Visitas recentes */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl font-black uppercase tracking-tight">Visitas recentes</h2>
                    {hiddenCount > 0 && (
                      <button
                        onClick={() => setShowHidden((v) => !v)}
                        className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-white flex items-center gap-1 shrink-0"
                      >
                        <EyeOff className="w-3 h-3" /> {showHidden ? "esconder ocultas" : `mostrar ${hiddenCount} oculta${hiddenCount > 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {visibleRecent.map((e) => {
                      const isHidden = hiddenIds.includes(e.id);
                      return (
                        <div key={e.id} className={`bg-[#0D0F12] rounded-lg px-4 py-2.5 border border-white/5 flex items-center gap-3 text-sm ${isHidden ? "opacity-40" : ""}`}>
                          <span className="text-[#A7B0BE] shrink-0 w-24 tabular-nums">{fmt(e.created_at)}</span>
                          <span className="truncate flex-1">{products[e.product_id || ""]?.title || "Produto"}</span>
                          {e.city && (
                            <span className="text-[#A7B0BE] hidden sm:flex items-center gap-1 shrink-0">
                              <MapPin className="w-3 h-3" /> {e.city}
                            </span>
                          )}
                          {e.status === "insufficient_balance" ? (
                            <span className="text-amber-400 flex items-center gap-1 shrink-0 text-xs font-bold">
                              <AlertTriangle className="w-3 h-3" /> sem saldo
                            </span>
                          ) : (
                            <span className="text-[#FF6A00] font-bold shrink-0 text-xs">
                              -{Number(e.credits_charged) || 0} cr
                            </span>
                          )}
                          {isHidden ? (
                            <button onClick={() => unhideVisit(e.id)} title="Restaurar" className="text-[#FF6A00] hover:text-white shrink-0">
                              <Eye className="w-4 h-4" />
                            </button>
                          ) : (
                            <button onClick={() => hideVisit(e.id)} title="Ocultar esta visita" className="text-[#A7B0BE] hover:text-white shrink-0">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
