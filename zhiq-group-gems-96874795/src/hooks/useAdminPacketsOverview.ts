/**
 * useAdminPacketsOverview
 *
 * Hook principal para a página "MERCADO" do admin.
 * Agrega dados reais de:
 *   - vehicle_listings (veículos como produtos)
 *   - advertiser_listings (produtos marketplace)
 *   - merchant_stores (lojas)
 *   - profiles (anunciantes)
 *   - real_estate_credit_packages (pacotes de créditos)
 *   - real_estate_credit_purchases (compras de pacotes)
 *   - advertiser_credit_ledger (consumo de créditos)
 *   - m1_billing_events (eventos de venda/click)
 *   - product_categories (categorias de produtos)
 *
 * Tudo backend-driven, sem dados fake.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PacketAdvertiserKind = "lojista" | "pessoa";

export interface AdminStoreRow {
  id: string;
  store_name: string;
  user_id: string;
  owner_name: string;
  owner_kind: PacketAdvertiserKind;
  cpf_cnpj: string | null;
  city: string | null;
  state: string | null;
  products_count: number;
  credits_consumed: number;
  package_name: string | null;
  status: string;
  total_revenue_brl: number;
  last_activity_at: string | null;
}

export interface AdminCategoryStats {
  category_id: string;
  category_name: string;
  products_count: number;
  percentage: number;
  growth_pct: number;
}

export interface AdminCreditConsumption {
  hour: string;
  credits_consumed: number;
  stores_count: number;
}

export interface AdminDailyConsumption {
  day: string;
  credits_consumed: number;
  stores_count: number;
}

export interface AdminRevenueStats {
  hour: string;
  revenue_brl: number;
  orders_count: number;
}

export interface AdminDailyRevenue {
  day: string;
  revenue_brl: number;
  orders_count: number;
}

export interface AdminPacketKpis {
  total_stores: number;
  total_advertisers: number;
  total_products: number;
  total_categories: number;
  total_active_packages: number;
  credits_per_hour: number;
  credits_per_day: number;
  revenue_per_hour: number;
  revenue_per_day: number;
  growth_pct: number;
  active_stores_pct: number;
  avg_ticket_brl: number;
}

export interface AdminTopConsumer {
  store_name: string;
  advertiser_name: string;
  credits_consumed: number;
}

export interface AdminPacketOverviewData {
  kpis: AdminPacketKpis;
  stores: AdminStoreRow[];
  categories: AdminCategoryStats[];
  creditHourly: AdminCreditConsumption[];
  creditDaily: AdminDailyConsumption[];
  revenueHourly: AdminRevenueStats[];
  revenueDaily: AdminDailyRevenue[];
  topConsumers: AdminTopConsumer[];
  topAdvertisers: AdminTopConsumer[];
  packages: unknown[];
  periodGrowth: { day: string; stores: number; products: number; revenue: number }[];
  salesByStoreAndCategory?: {
    store_name: string;
    category: string;
    sales_count: number;
    revenue_brl: number;
  }[];
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export function useAdminPacketsOverview(opts: { periodDays?: number } = {}) {
  const periodDays = opts.periodDays ?? 30;

  const query = useQuery({
    queryKey: ["admin-packets-overview", periodDays],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const now = new Date();
      const periodStart = new Date();
      periodStart.setDate(now.getDate() - periodDays);
      const prevStart = new Date();
      prevStart.setDate(now.getDate() - periodDays * 2);

      // ── 1. Lojas (merchant_stores) ─────────────────────────────────────
      const { data: storesRaw } = await (supabase.from("merchant_stores") as unknown)
        .select("id, user_id, store_name, nome_loja, city, cidade, estado, region, telefone, phone, created_at")
        .limit(1000);
      const storesAll: unknown[] = storesRaw || [];

      // ── 2. Perfis (profiles) ───────────────────────────────────────────
      const storeUserIds = storesAll.map((s) => s.user_id).filter(Boolean);
      const profileMap = new Map<string, unknown>();
      if (storeUserIds.length > 0) {
        const { data: profiles } = await (supabase.from("profiles") as unknown)
          .select("id, nome, cpf_cnpj, email, telefone, cidade, estado")
          .in("id", storeUserIds);
        (profiles || []).forEach((p: unknown) => profileMap.set(p.id, p));
      }

      // ── 3. advertiser_accounts (bridge) ─────────────────────────────────
      const { data: accountsRaw } = await (supabase.from("advertiser_accounts") as unknown)
        .select("id, user_id")
        .limit(5000);
      const acctToUser = new Map<string, string>();
      (accountsRaw || []).forEach((a: unknown) => {
        if (a?.id && a?.user_id) acctToUser.set(a.id, a.user_id);
      });

      // ── 4. Listings (veículos) ──────────────────────────────────────────
      const { data: vehicleListingsRaw } = await (supabase.from("vehicle_listings") as unknown)
        .select("id, title, owner_user_id, created_at, price_brl, category")
        .limit(5000);
      const vehicleListings: unknown[] = vehicleListingsRaw || [];

      // ── 5. Advertiser Listings (produtos marketplace) ────────────────────
      const { data: advListingsRaw } = await (supabase.from("advertiser_listings") as unknown)
        .select("id, title, advertiser_account_id, created_at, price, category, listing_status")
        .limit(5000);
      const advListings: unknown[] = advListingsRaw || [];

      const listingsAll: unknown[] = [
        ...vehicleListings.map((l) => ({ ...l, owner_user_id: l.owner_user_id, source: 'vehicle' as const })),
        ...advListings.map((l) => ({
          ...l,
          owner_user_id: acctToUser.get(l.advertiser_account_id) || l.advertiser_account_id,
          source: 'advertiser' as const,
        })),
      ].filter((l) => l.owner_user_id);

      // ── 6. Categorias ────────────────────────────────────────────────────
      const { data: categoriesRaw } = await (supabase.from("product_categories") as unknown)
        .select("*")
        .limit(100);
      const categoriesDb: unknown[] = categoriesRaw || [];

      // ── 7. Pacotes ───────────────────────────────────────────────────────
      const { data: packagesRaw } = await (supabase.from("real_estate_credit_packages") as unknown)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      const packagesAll: unknown[] = packagesRaw || [];

      // ── 8. Compras de pacotes ────────────────────────────────────────────
      const { data: purchasesRaw } = await (supabase.from("real_estate_credit_purchases") as unknown)
        .select("id, owner_user_id, package_id, amount_brl, credits_total, created_at, paid_at")
        .limit(5000);
      const purchasesAll: unknown[] = purchasesRaw || [];

      // ── 9. Ledger de créditos ────────────────────────────────────────────
      const { data: ledgerRaw } = await (supabase.from("advertiser_credit_ledger") as unknown)
        .select("*")
        .limit(10000);
      const ledgerAll: unknown[] = ledgerRaw || [];

      // ── 10. Billing Events (vendas) ──────────────────────────────────────
      const { data: billingEventsRaw } = await (supabase.from("m1_billing_events") as unknown)
        .select("merchant_store_id, product_id, event_type, sale_value_cents, created_at")
        .gte("created_at", periodStart.toISOString())
        .limit(10000);
      const billingEventsAll: unknown[] = billingEventsRaw || [];

      // ── PROCESSAMENTO ────────────────────────────────────────────────────

      // Mapas
      const storeByUserId = new Map<string, unknown>();
      storesAll.forEach((s) => {
        if (s.user_id) storeByUserId.set(s.user_id, s);
      });

      const storeById = new Map<string, unknown>();
      storesAll.forEach((s) => storeById.set(s.id, s));

      const productsCountByUser = new Map<string, number>();
      listingsAll.forEach((l) => {
        const uid = l.owner_user_id;
        if (uid) productsCountByUser.set(uid, (productsCountByUser.get(uid) || 0) + 1);
      });

      const creditsByUser = new Map<string, number>();
      ledgerAll.forEach((e: unknown) => {
        const amount = Math.abs(Number(e.amount) || 0);
        const isDebit = (e.amount ?? 0) < 0 || e.entry_type === "debit";
        if (!isDebit) return;
        const uid = acctToUser.get(e.advertiser_account_id || "") || e.advertiser_user_id;
        if (uid) creditsByUser.set(uid, (creditsByUser.get(uid) || 0) + amount);
      });

      const revenueByUser = new Map<string, number>();
      purchasesAll.forEach((p: unknown) => {
        const uid = p.owner_user_id;
        if (uid) revenueByUser.set(uid, (revenueByUser.get(uid) || 0) + Number(p.amount_brl || 0));
      });

      const lastActivityByUser = new Map<string, string>();
      [...ledgerAll, ...listingsAll, ...purchasesAll].forEach((e: unknown) => {
        const uid = e.advertiser_account_id ? acctToUser.get(e.advertiser_account_id) || e.advertiser_user_id : e.owner_user_id;
        if (!uid) return;
        const date = e.created_at || e.published_at;
        if (!date) return;
        const prev = lastActivityByUser.get(uid);
        if (!prev || new Date(date) > new Date(prev)) {
          lastActivityByUser.set(uid, date);
        }
      });

      // ── KPIs ─────────────────────────────────────────────────────────────
      const totalStores = storesAll.length;
      const totalAdvertisers = storeUserIds.length;
      const totalProducts = listingsAll.length;
      const totalCategories = categoriesDb.length;
      const totalActivePackages = packagesAll.filter((p) => p.is_active !== false).length;

      const periodCredits = ledgerAll
        .filter((e: unknown) => {
          const d = new Date(e.created_at);
          return d >= periodStart;
        })
        .reduce((sum: number, e: unknown) => {
          const amount = Math.abs(Number(e.amount) || 0);
          const isDebit = (e.amount ?? 0) < 0 || e.entry_type === "debit";
          return sum + (isDebit ? amount : 0);
        }, 0);
      const creditsPerDay = periodCredits / periodDays;
      const creditsPerHour = creditsPerDay / 24;

      const periodRevenue = purchasesAll
        .filter((p: unknown) => {
          const d = new Date(p.created_at || p.paid_at);
          return d >= periodStart;
        })
        .reduce((sum: number, p: unknown) => sum + Number(p.amount_brl || 0), 0);
      const revenuePerDay = periodRevenue / periodDays;
      const revenuePerHour = revenuePerDay / 24;

      const storesPeriod = storesAll.filter((s: unknown) => {
        const d = new Date(s.created_at);
        return d >= periodStart;
      }).length;
      const storesPrev = storesAll.filter((s: unknown) => {
        const d = new Date(s.created_at);
        return d >= prevStart && d < periodStart;
      }).length;
      const growthPct = pct(storesPeriod, storesPrev);

      const activeStores = storesAll.filter((s: unknown) => {
        const uid = s.user_id;
        return creditsByUser.get(uid || "") || 0 > 0;
      }).length;
      const activeStoresPct = totalStores > 0 ? (activeStores / totalStores) * 100 : 0;

      const totalPurchases = purchasesAll.length;
      const avgTicket = totalPurchases > 0 ? periodRevenue / totalPurchases : 0;

      const kpis: AdminPacketKpis = {
        total_stores: totalStores,
        total_advertisers: totalAdvertisers,
        total_products: totalProducts,
        total_categories: totalCategories,
        total_active_packages: totalActivePackages,
        credits_per_hour: creditsPerHour,
        credits_per_day: creditsPerDay,
        revenue_per_hour: revenuePerHour,
        revenue_per_day: revenuePerDay,
        growth_pct: growthPct,
        active_stores_pct: activeStoresPct,
        avg_ticket_brl: avgTicket,
      };

      // ── Lista de lojas ──────────────────────────────────────────────────
      const storesList: AdminStoreRow[] = storesAll.map((s) => {
        const profile = profileMap.get(s.user_id) || {};
        const ownerName =
          profile.nome ||
          profile.nome_loja ||
          s.store_name ||
          s.nome_loja ||
          "Sem nome";
        const isLojista = !!profile.nome_loja || !!s.store_name;
        const status = creditsByUser.get(s.user_id || "") || 0 > 0 ? "Ativa" : "Inativa";
        return {
          id: s.id,
          store_name: s.store_name || s.nome_loja || "Loja sem nome",
          user_id: s.user_id,
          owner_name: ownerName,
          owner_kind: isLojista ? "lojista" : "pessoa",
          cpf_cnpj: profile.cpf_cnpj || null,
          city: s.city || s.cidade || profile.cidade || null,
          state: s.estado || profile.estado || null,
          products_count: productsCountByUser.get(s.user_id || "") || 0,
          credits_consumed: creditsByUser.get(s.user_id || "") || 0,
          package_name: null,
          status,
          total_revenue_brl: revenueByUser.get(s.user_id || "") || 0,
          last_activity_at: lastActivityByUser.get(s.user_id || "") || null,
        };
      });

      // ── Categorias ──────────────────────────────────────────────────────
      const catStats: AdminCategoryStats[] = categoriesDb.map((c: unknown) => {
        const count = listingsAll.filter((l) => {
          const cat = l.category;
          return cat === c.id || cat === c.name || cat === c.slug;
        }).length;
        return {
          category_id: c.id,
          category_name: c.name || c.category_name || "Sem categoria",
          products_count: count,
          percentage: totalProducts > 0 ? (count / totalProducts) * 100 : 0,
          growth_pct: 0,
        };
      });

      // ── Consumo por hora ────────────────────────────────────────────────
      const hourlyMap = new Map<string, number>();
      const hourlyStores = new Map<string, Set<string>>();
      ledgerAll.forEach((e: unknown) => {
        const d = new Date(e.created_at);
        const hourKey = d.toISOString().slice(0, 13);
        const amount = Math.abs(Number(e.amount) || 0);
        const isDebit = (e.amount ?? 0) < 0 || e.entry_type === "debit";
        if (!isDebit) return;
        hourlyMap.set(hourKey, (hourlyMap.get(hourKey) || 0) + amount);
        const uid = acctToUser.get(e.advertiser_account_id || "") || e.advertiser_user_id;
        if (uid) {
          let set = hourlyStores.get(hourKey);
          if (!set) {
            set = new Set();
            hourlyStores.set(hourKey, set);
          }
          set.add(uid);
        }
      });
      const creditHourly: AdminCreditConsumption[] = Array.from(hourlyMap.entries())
        .map(([hour, credits]) => ({
          hour,
          credits_consumed: credits,
          stores_count: hourlyStores.get(hour)?.size || 0,
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour))
        .slice(-24);

      // ── Consumo diário ──────────────────────────────────────────────────
      const dailyMap = new Map<string, number>();
      ledgerAll.forEach((e: unknown) => {
        const d = new Date(e.created_at);
        const dayKey = toISODate(d);
        const amount = Math.abs(Number(e.amount) || 0);
        const isDebit = (e.amount ?? 0) < 0 || e.entry_type === "debit";
        if (!isDebit) return;
        dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + amount);
      });
      const creditDaily: AdminDailyConsumption[] = Array.from(dailyMap.entries())
        .map(([day, credits]) => ({ day, credits_consumed: credits, stores_count: 0 }))
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-periodDays);

      // ── Receita por hora ────────────────────────────────────────────────
      const revenueHourlyMap = new Map<string, number>();
      const revenueHourlyCount = new Map<string, number>();
      purchasesAll.forEach((p: unknown) => {
        const d = new Date(p.created_at || p.paid_at);
        const hourKey = d.toISOString().slice(0, 13);
        revenueHourlyMap.set(hourKey, (revenueHourlyMap.get(hourKey) || 0) + Number(p.amount_brl || 0));
        revenueHourlyCount.set(hourKey, (revenueHourlyCount.get(hourKey) || 0) + 1);
      });
      const revenueHourly: AdminRevenueStats[] = Array.from(revenueHourlyMap.entries())
        .map(([hour, revenue]) => ({
          hour,
          revenue_brl: revenue,
          orders_count: revenueHourlyCount.get(hour) || 0,
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour))
        .slice(-24);

      // ── Receita diária ──────────────────────────────────────────────────
      const revenueDailyMap = new Map<string, number>();
      purchasesAll.forEach((p: unknown) => {
        const d = new Date(p.created_at || p.paid_at);
        const dayKey = toISODate(d);
        revenueDailyMap.set(dayKey, (revenueDailyMap.get(dayKey) || 0) + Number(p.amount_brl || 0));
      });
      const revenueDaily: AdminDailyRevenue[] = Array.from(revenueDailyMap.entries())
        .map(([day, revenue]) => ({ day, revenue_brl: revenue, orders_count: 0 }))
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-periodDays);

      // ── Top consumidores ────────────────────────────────────────────────
      const topConsumers: AdminTopConsumer[] = Array.from(creditsByUser.entries())
        .map(([uid, credits]) => {
          const store = storeByUserId.get(uid);
          const profile = profileMap.get(uid);
          return {
            store_name: store?.store_name || store?.nome_loja || "Loja desconhecida",
            advertiser_name: profile?.nome || "Anunciante",
            credits_consumed: credits,
          };
        })
        .sort((a, b) => b.credits_consumed - a.credits_consumed)
        .slice(0, 10);

      // ── Top anunciantes (por receita) ───────────────────────────────────
      const topAdvertisers: AdminTopConsumer[] = Array.from(revenueByUser.entries())
        .map(([uid, revenue]) => {
          const store = storeByUserId.get(uid);
          const profile = profileMap.get(uid);
          return {
            store_name: store?.store_name || store?.nome_loja || "Loja desconhecida",
            advertiser_name: profile?.nome || "Anunciante",
            credits_consumed: revenue,
          };
        })
        .sort((a, b) => b.credits_consumed - a.credits_consumed)
        .slice(0, 10);

      // ── Crescimento temporal ────────────────────────────────────────────
      const dayKeys: string[] = [];
      for (let i = 0; i < periodDays; i++) {
        const d = new Date(periodStart);
        d.setDate(periodStart.getDate() + i);
        dayKeys.push(toISODate(d));
      }
      const periodGrowth = dayKeys.map((day) => ({
        day,
        stores: storesAll.filter((s) => toISODate(new Date(s.created_at)) === day).length,
        products: listingsAll.filter((l) => toISODate(new Date(l.created_at)) === day).length,
        revenue: purchasesAll
          .filter((p) => toISODate(new Date(p.created_at || p.paid_at)) === day)
          .reduce((sum: number, p: unknown) => sum + Number(p.amount_brl || 0), 0),
      }));

      // ── VENDAS POR LOJA E CATEGORIA ──────────────────────────────────────
      // Usa m1_billing_events (eventos de venda/click) ligados a product_id
      // Agrega por loja (merchant_store_id) + categoria do produto
      const salesMap = new Map<string, { store_name: string; category: string; sales_count: number; revenue_brl: number }>();

      // Mapa product_id -> categoria (baseado nos listings que temos)
      const productCategoryMap = new Map<string, string>();
      listingsAll.forEach((l: unknown) => {
        productCategoryMap.set(l.id, l.category || "Sem categoria");
      });

      billingEventsAll.forEach((ev: unknown) => {
        const storeId = ev.merchant_store_id;
        const productId = ev.product_id;
        const saleValue = Number(ev.sale_value_cents || 0) / 100;
        const category = productCategoryMap.get(productId) || "Sem categoria";

        // Buscar nome da loja
        const store = storeById.get(storeId);
        const storeName = store?.store_name || store?.nome_loja || "Loja desconhecida";

        const key = `${storeId}::${category}`;
        const existing = salesMap.get(key) || { store_name: storeName, category, sales_count: 0, revenue_brl: 0 };
        existing.sales_count += 1;
        existing.revenue_brl += saleValue;
        salesMap.set(key, existing);
      });

      const salesByStoreAndCategory = Array.from(salesMap.values())
        .sort((a, b) => b.revenue_brl - a.revenue_brl);

      return {
        kpis,
        stores: storesList,
        categories: catStats,
        creditHourly,
        creditDaily,
        revenueHourly,
        revenueDaily,
        topConsumers,
        topAdvertisers,
        packages: packagesAll,
        periodGrowth,
        salesByStoreAndCategory,
      };
    },
  });

  return query;
}