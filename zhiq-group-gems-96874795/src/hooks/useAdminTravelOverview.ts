import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdvertiserKind = "lojista" | "pessoa";

export interface AdminTravelListingRow {
  id: string;
  title: string;
  category: string | null;
  destination: string | null;
  visibility_status: string | null;
  price_per_person: number | null;
  total_price: number | null;
  entry_price: string | null;
  is_featured: boolean | null;
  departure_date: string | null;
  duration_days: number | null;
  available_spots: number | null;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
  city: string | null;
  state: string | null;
  owner_user_id: string | null;
  // enriched
  advertiser_name: string;
  advertiser_kind: AdvertiserKind;
  advertiser_listings_total: number;
  advertiser_city: string | null;
  advertiser_phone: string | null;
  package_name: string | null;
  package_slug: string | null;
  credits_consumed: number;
  lead_count: number;
}

export interface AdminTravelKpis {
  total_listings: number;
  active_listings: number;
  pending_listings: number;
  rejected_listings: number;
  total_advertisers: number;
  total_packages_sold: number;
  total_credits_consumed: number;
  new_listings_period: number;
  new_advertisers_period: number;
  listings_growth_pct: number;
  advertisers_growth_pct: number;
  approval_rate_pct: number;
}

const STATUS_ACTIVE = new Set(["published", "approved", "active"]);
const STATUS_PENDING = new Set(["pending_review", "draft", "pending"]);
const STATUS_REJECTED = new Set(["rejected", "blocked", "suspended"]);

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export function useAdminTravelOverview(opts: { periodDays?: number } = {}) {
  const periodDays = opts.periodDays ?? 30;

  const query = useQuery({
    queryKey: ["admin-travel-overview", periodDays],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // 1. Listings
      const { data: listingsRaw } = await (supabase.from("travel_listings") as unknown)
        .select("id, title, category, destination, visibility_status, price_per_person, total_price, entry_price, is_featured, departure_date, duration_days, available_spots, created_at, updated_at, published_at, city, state, owner_user_id")
        .order("created_at", { ascending: false })
        .limit(2000);

      const listings: unknown[] = listingsRaw || [];

      const ownerIds = Array.from(
        new Set(listings.map((l) => l.owner_user_id).filter(Boolean))
      ) as string[];

      // 2. Profiles + stores
      const profileMap = new Map<string, unknown>();
      const storeMap = new Map<string, unknown>();

      if (ownerIds.length > 0) {
        const [{ data: profs }, { data: stores }] = await Promise.all([
          (supabase.from("profiles") as unknown)
            .select("id, nome, nome_loja, telefone, cidade, estado, email")
            .in("id", ownerIds),
          (supabase.from("merchant_stores") as unknown)
            .select("user_id, nome_loja, store_name, cidade, city, estado, region, telefone, phone")
            .in("user_id", ownerIds),
        ]);
        (profs || []).forEach((p: unknown) => profileMap.set(p.id, p));
        (stores || []).forEach((s: unknown) => storeMap.set(s.user_id, s));
      }

      // 3. Packages + purchases
      const { data: travelPkgs } = await (supabase.from("real_estate_credit_packages") as unknown)
        .select("*")
        .eq("category", "travel")
        .order("sort_order", { ascending: true });

      const travelPackagesDb: unknown[] = travelPkgs || [];
      const travelPackageIds = travelPackagesDb.map((p) => p.id);

      const { data: purchasesRaw } = await (supabase.from("real_estate_credit_purchases") as unknown)
        .select("id, owner_user_id, package_id, amount_brl, credits_total, payment_status, created_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(2000);

      const allPurchases: unknown[] = purchasesRaw || [];
      const purchases = allPurchases.filter((p) => travelPackageIds.includes(p.package_id));

      const userPackageMap = new Map<string, { name: string | null; slug: string | null; count: number }>();
      for (const p of purchases) {
        const pkg = travelPackagesDb.find((k: unknown) => k.id === p.package_id);
        const uid = p.owner_user_id;
        if (!uid) continue;
        const entry = userPackageMap.get(uid) || { name: null, slug: null, count: 0 };
        if (!entry.name && pkg) { entry.name = pkg.name; entry.slug = pkg.slug; }
        entry.count += 1;
        userPackageMap.set(uid, entry);
      }

      // 4. Ledger (travel module)
      const { data: ledgerRaw } = await (supabase.from("advertiser_credit_ledger") as unknown)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000);

      const ledgerAll: unknown[] = ledgerRaw || [];
      const ledgerTravel = ledgerAll.filter((e) => {
        const hay = `${e.module || ""} ${e.reason_code || ""} ${e.description || ""}`.toLowerCase();
        return hay.includes("travel") || hay.includes("viagem") || !e.module;
      });

      const creditsByListing = new Map<string, number>();
      const creditsByAdvertiserAccount = new Map<string, number>();
      for (const e of ledgerTravel) {
        const amount = Math.abs(Number(e.amount) || 0);
        const isDebit = (e.amount ?? 0) < 0 || e.entry_type === "debit";
        if (!isDebit) continue;
        const meta = e.metadata || {};
        const lid = meta.listing_id || e.listing_id || null;
        if (lid) creditsByListing.set(lid, (creditsByListing.get(lid) || 0) + amount);
        const accId = e.advertiser_account_id;
        if (accId) creditsByAdvertiserAccount.set(accId, (creditsByAdvertiserAccount.get(accId) || 0) + amount);
      }

      const { data: accountsRaw } = await (supabase.from("advertiser_accounts") as unknown)
        .select("id, user_id")
        .limit(5000);
      const acctToUser = new Map<string, string>();
      (accountsRaw || []).forEach((a: unknown) => {
        if (a?.id && a?.user_id) acctToUser.set(a.id, a.user_id);
      });

      const creditsByUser = new Map<string, number>();
      for (const [acctId, amount] of creditsByAdvertiserAccount.entries()) {
        const uid = acctToUser.get(acctId);
        if (uid) creditsByUser.set(uid, (creditsByUser.get(uid) || 0) + amount);
      }

      // 5. Leads
      const { data: intentionsRaw } = await (supabase.from("advertiser_contact_intentions") as unknown)
        .select("listing_id, listing_module, status")
        .in("listing_module", ["travel", "freight"])
        .limit(5000);

      const leadsByListing = new Map<string, number>();
      (intentionsRaw || []).forEach((i: unknown) => {
        if (i.status === "cancelled") return;
        const isTravel = listings.some((l) => l.id === i.listing_id);
        if (!isTravel) return;
        leadsByListing.set(i.listing_id, (leadsByListing.get(i.listing_id) || 0) + 1);
      });

      // 6. Resolve advertiser
      function resolveAdvertiser(uid: string | null) {
        if (!uid) return { name: "—", kind: "pessoa" as AdvertiserKind, city: null, state: null, phone: null };
        const store = storeMap.get(uid);
        const profile = profileMap.get(uid);
        const isLojista = !!store || !!profile?.nome_loja;
        const name = store?.nome_loja || store?.store_name || profile?.nome_loja || profile?.nome || profile?.email || "Anunciante";
        return {
          name,
          kind: (isLojista ? "lojista" : "pessoa") as AdvertiserKind,
          city: store?.cidade || store?.city || profile?.cidade || null,
          state: store?.estado || store?.region || profile?.estado || null,
          phone: store?.telefone || store?.phone || profile?.telefone || null,
        };
      }

      const listingsCountByUser = new Map<string, number>();
      const firstListingByUser = new Map<string, string>();
      for (const l of listings) {
        const uid = l.owner_user_id as string | null;
        if (!uid) continue;
        listingsCountByUser.set(uid, (listingsCountByUser.get(uid) || 0) + 1);
        const prev = firstListingByUser.get(uid);
        if (!prev || new Date(l.created_at) < new Date(prev)) {
          firstListingByUser.set(uid, l.created_at);
        }
      }

      // 7. Enrich rows
      const rows: AdminTravelListingRow[] = listings.map((l) => {
        const adv = resolveAdvertiser(l.owner_user_id);
        const pkg = l.owner_user_id ? userPackageMap.get(l.owner_user_id) : null;
        return {
          id: l.id,
          title: l.title,
          category: l.category,
          destination: l.destination,
          visibility_status: l.visibility_status,
          price_per_person: l.price_per_person,
          total_price: l.total_price,
          entry_price: l.entry_price,
          is_featured: l.is_featured,
          departure_date: l.departure_date,
          duration_days: l.duration_days,
          available_spots: l.available_spots,
          created_at: l.created_at,
          updated_at: l.updated_at,
          published_at: l.published_at,
          city: l.city,
          state: l.state,
          owner_user_id: l.owner_user_id,
          advertiser_name: adv.name,
          advertiser_kind: adv.kind,
          advertiser_listings_total: l.owner_user_id ? listingsCountByUser.get(l.owner_user_id) || 0 : 0,
          advertiser_city: adv.city,
          advertiser_phone: adv.phone,
          package_name: pkg?.name ?? null,
          package_slug: pkg?.slug ?? null,
          credits_consumed: (l.id && creditsByListing.get(l.id)) || 0,
          lead_count: leadsByListing.get(l.id) || 0,
        };
      });

      // 8. KPIs
      const now = new Date();
      const periodStart = new Date();
      periodStart.setDate(now.getDate() - periodDays);
      const prevStart = new Date();
      prevStart.setDate(now.getDate() - periodDays * 2);

      const totalActive = rows.filter((r) => STATUS_ACTIVE.has(r.visibility_status || "")).length;
      const totalPending = rows.filter((r) => STATUS_PENDING.has(r.visibility_status || "")).length;
      const totalRejected = rows.filter((r) => STATUS_REJECTED.has(r.visibility_status || "")).length;

      const listingsInPeriod = listings.filter((l) => new Date(l.created_at) >= periodStart).length;
      const listingsInPrev = listings.filter((l) => {
        const d = new Date(l.created_at);
        return d >= prevStart && d < periodStart;
      }).length;

      const advertisersInPeriod = Array.from(firstListingByUser.values()).filter((iso) => new Date(iso) >= periodStart).length;
      const advertisersInPrev = Array.from(firstListingByUser.values()).filter((iso) => {
        const d = new Date(iso);
        return d >= prevStart && d < periodStart;
      }).length;

      const totalCreditsConsumed = Array.from(creditsByUser.values()).reduce((s, v) => s + v, 0);
      const decided = totalActive + totalRejected;

      const kpis: AdminTravelKpis = {
        total_listings: rows.length,
        active_listings: totalActive,
        pending_listings: totalPending,
        rejected_listings: totalRejected,
        total_advertisers: listingsCountByUser.size,
        total_packages_sold: purchases.length,
        total_credits_consumed: totalCreditsConsumed,
        new_listings_period: listingsInPeriod,
        new_advertisers_period: advertisersInPeriod,
        listings_growth_pct: pct(listingsInPeriod, listingsInPrev),
        advertisers_growth_pct: pct(advertisersInPeriod, advertisersInPrev),
        approval_rate_pct: decided > 0 ? (totalActive / decided) * 100 : 0,
      };

      return { rows, packages: travelPackagesDb, purchases, kpis };
    },
  });

  const cities = useMemo(() => {
    const set = new Set<string>();
    (query.data?.rows || []).forEach((r) => { if (r.city) set.add(r.city); });
    return Array.from(set).sort();
  }, [query.data]);

  return { ...query, cities };
}
