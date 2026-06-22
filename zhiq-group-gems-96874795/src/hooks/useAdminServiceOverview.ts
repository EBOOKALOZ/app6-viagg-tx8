/**
 * useAdminServiceOverview
 *
 * Hiper-hook administrativo para a página "Serviços" do admin.
 * Espelha useAdminVehicleOverview. Agrega dados reais de:
 *   - service_listings
 *   - service_listing_contacts
 *   - service_media
 *   - real_estate_credit_packages / purchases (category='services')
 *   - advertiser_credit_ledger (filtrando módulo service)
 *   - advertiser_contact_intentions (módulo services)
 *   - profiles / merchant_stores (p/ distinguir lojista vs pessoa)
 *
 * Sem dados falsos: se alguma tabela falhar ou não existir, o campo volta
 * zerado / vazio, nunca inventado.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdvertiserKind = "lojista" | "pessoa";

export interface AdminServiceListingRow {
  id: string;
  title: string;
  service_type: string | null;
  visibility_status: string | null;
  price_label: string | null;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  owner_user_id: string | null;
  // Enriquecidos
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

export interface AdminServiceAdvertiser {
  user_id: string;
  name: string;
  kind: AdvertiserKind;
  city: string | null;
  state: string | null;
  phone: string | null;
  total_listings: number;
  active_listings: number;
  pending_listings: number;
  blocked_listings: number;
  packages_count: number;
  credits_consumed: number;
  last_listing_at: string | null;
}

export interface AdminServicePackageStats {
  id: string;
  name: string;
  slug: string;
  price_brl: number;
  credits_amount: number;
  is_active: boolean;
  purchases_count: number;
  total_revenue_brl: number;
  unique_buyers: number;
  listings_linked: number;
}

export interface AdminServiceLedgerEntry {
  id: string;
  advertiser_account_id: string | null;
  advertiser_user_id: string | null;
  advertiser_name: string;
  amount: number;
  entry_type: string;
  reason_code: string | null;
  description: string | null;
  listing_id: string | null;
  listing_title: string | null;
  created_at: string;
}

export interface AdminServiceGrowthPoint {
  day: string;
  listings: number;
  advertisers: number;
}

export interface AdminServiceKpis {
  total_listings: number;
  active_listings: number;
  pending_listings: number;
  rejected_listings: number;
  total_advertisers: number;
  total_lojistas: number;
  total_pessoas: number;
  total_packages_sold: number;
  total_credits_consumed: number;
  new_listings_period: number;
  new_advertisers_period: number;
  listings_growth_pct: number;
  advertisers_growth_pct: number;
  avg_listings_per_advertiser: number;
  avg_credits_per_listing: number;
  approval_rate_pct: number;
}

export interface UseAdminServiceOverviewOptions {
  periodDays?: number;
}

const STATUS_ACTIVE = new Set(["published", "approved", "active"]);
const STATUS_PENDING = new Set(["pending_review", "draft", "pending"]);
const STATUS_REJECTED = new Set(["rejected", "blocked", "suspended"]);

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export function useAdminServiceOverview(opts: UseAdminServiceOverviewOptions = {}) {
  const periodDays = opts.periodDays ?? 30;

  const query = useQuery({
    queryKey: ["admin-service-overview", periodDays],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // ── 1. Listings ─────────────────────────────────────────────────────
      const { data: listingsRaw } = await (supabase.from("service_listings") as any)
        .select(
          "id, title, service_type, visibility_status, price_label, created_at, updated_at, published_at, city, state, neighborhood, owner_user_id"
        )
        .order("created_at", { ascending: false })
        .limit(2000);

      const listings: any[] = listingsRaw || [];

      const ownerIds = Array.from(
        new Set(listings.map((l) => l.owner_user_id).filter(Boolean))
      ) as string[];

      // ── 2. Profiles + merchant_stores (p/ identificar lojista/pessoa) ───
      const profileMap = new Map<string, any>();
      const storeMap = new Map<string, any>();

      if (ownerIds.length > 0) {
        const [{ data: profs }, { data: stores }] = await Promise.all([
          (supabase.from("profiles") as any)
            .select("id, nome, nome_loja, telefone, cidade, estado, email")
            .in("id", ownerIds),
          (supabase.from("merchant_stores") as any)
            .select("user_id, nome_loja, store_name, cidade, city, estado, region, telefone, phone")
            .in("user_id", ownerIds),
        ]);
        (profs || []).forEach((p: any) => profileMap.set(p.id, p));
        (stores || []).forEach((s: any) => storeMap.set(s.user_id, s));
      }

      // ── 3. Pacotes + compras (real_estate_credit_packages category='services') ──
      const { data: servicePkgs } = await (supabase.from("real_estate_credit_packages") as any)
        .select("*")
        .eq("category", "services")
        .order("sort_order", { ascending: true });

      const servicePackagesDb: any[] = servicePkgs || [];

      const servicePackageIds = servicePackagesDb.map((p) => p.id);
      const { data: purchasesRaw } = await (supabase.from("real_estate_credit_purchases") as any)
        .select("id, owner_user_id, package_id, amount_brl, credits_total, payment_status, created_at, paid_at")
        .order("created_at", { ascending: false })
        .limit(2000);

      const allPurchases: any[] = purchasesRaw || [];
      const purchases = allPurchases.filter((p) => servicePackageIds.includes(p.package_id));

      const userPackageMap = new Map<string, { name: string | null; slug: string | null; count: number }>();
      for (const p of purchases) {
        const pkg = servicePackagesDb.find((k: any) => k.id === p.package_id);
        const uid = p.owner_user_id;
        if (!uid) continue;
        const entry = userPackageMap.get(uid) || { name: null, slug: null, count: 0 };
        if (!entry.name && pkg) {
          entry.name = pkg.name;
          entry.slug = pkg.slug;
        }
        entry.count += 1;
        userPackageMap.set(uid, entry);
      }

      // ── 4. Ledger de créditos (filtrar módulo service) ──────────────────
      const { data: ledgerRaw } = await (supabase.from("advertiser_credit_ledger") as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000);

      const ledgerAll: any[] = ledgerRaw || [];
      const ledgerService = ledgerAll.filter((e) => {
        const hay = `${e.module || ""} ${e.reason_code || ""} ${e.description || ""}`.toLowerCase();
        return (
          hay.includes("service") ||
          hay.includes("serviço") ||
          hay.includes("servico") ||
          !e.module
        );
      });

      const creditsByListing = new Map<string, number>();
      const creditsByAdvertiserAccount = new Map<string, number>();
      for (const e of ledgerService) {
        const amount = Math.abs(Number(e.amount) || 0);
        const isDebit = (e.amount ?? 0) < 0 || e.entry_type === "debit";
        if (!isDebit) continue;
        const meta = e.metadata || {};
        const lid = meta.listing_id || e.listing_id || null;
        if (lid) creditsByListing.set(lid, (creditsByListing.get(lid) || 0) + amount);
        const accId = e.advertiser_account_id;
        if (accId) creditsByAdvertiserAccount.set(accId, (creditsByAdvertiserAccount.get(accId) || 0) + amount);
      }

      const { data: accountsRaw } = await (supabase.from("advertiser_accounts") as any)
        .select("id, user_id")
        .limit(5000);
      const acctToUser = new Map<string, string>();
      (accountsRaw || []).forEach((a: any) => {
        if (a?.id && a?.user_id) acctToUser.set(a.id, a.user_id);
      });

      const creditsByUser = new Map<string, number>();
      for (const [acctId, amount] of creditsByAdvertiserAccount.entries()) {
        const uid = acctToUser.get(acctId);
        if (uid) creditsByUser.set(uid, (creditsByUser.get(uid) || 0) + amount);
      }

      // ── 5. Leads (advertiser_contact_intentions) p/ services ────────────
      const { data: intentionsRaw } = await (supabase.from("advertiser_contact_intentions") as any)
        .select("listing_id, listing_module, status")
        .eq("listing_module", "services")
        .limit(5000);

      const leadsByListing = new Map<string, number>();
      (intentionsRaw || []).forEach((i: any) => {
        if (i.status === "cancelled") return;
        leadsByListing.set(i.listing_id, (leadsByListing.get(i.listing_id) || 0) + 1);
      });

      // ── 6. Mapa user_id → kind + nome + meta ────────────────────────────
      function resolveAdvertiser(uid: string | null) {
        if (!uid) {
          return {
            name: "—",
            kind: "pessoa" as AdvertiserKind,
            city: null,
            state: null,
            phone: null,
          };
        }
        const store = storeMap.get(uid);
        const profile = profileMap.get(uid);
        const isLojista = !!store || !!profile?.nome_loja;
        const name =
          store?.nome_loja ||
          store?.store_name ||
          profile?.nome_loja ||
          profile?.nome ||
          profile?.email ||
          "Anunciante";
        return {
          name,
          kind: (isLojista ? "lojista" : "pessoa") as AdvertiserKind,
          city: store?.cidade || store?.city || profile?.cidade || null,
          state: store?.estado || store?.region || profile?.estado || null,
          phone: store?.telefone || store?.phone || profile?.telefone || null,
        };
      }

      const listingsCountByUser = new Map<string, number>();
      const activeByUser = new Map<string, number>();
      const pendingByUser = new Map<string, number>();
      const blockedByUser = new Map<string, number>();
      const lastListingByUser = new Map<string, string>();
      for (const l of listings) {
        const uid = l.owner_user_id as string | null;
        if (!uid) continue;
        listingsCountByUser.set(uid, (listingsCountByUser.get(uid) || 0) + 1);
        const st = l.visibility_status || "";
        if (STATUS_ACTIVE.has(st)) activeByUser.set(uid, (activeByUser.get(uid) || 0) + 1);
        else if (STATUS_PENDING.has(st)) pendingByUser.set(uid, (pendingByUser.get(uid) || 0) + 1);
        else if (STATUS_REJECTED.has(st)) blockedByUser.set(uid, (blockedByUser.get(uid) || 0) + 1);
        const prev = lastListingByUser.get(uid);
        if (!prev || new Date(l.created_at) > new Date(prev)) {
          lastListingByUser.set(uid, l.created_at);
        }
      }

      // ── 7. Enriquecer listings ──────────────────────────────────────────
      const rows: AdminServiceListingRow[] = listings.map((l) => {
        const adv = resolveAdvertiser(l.owner_user_id);
        const pkg = l.owner_user_id ? userPackageMap.get(l.owner_user_id) : null;
        const credits_consumed = (l.id && creditsByListing.get(l.id)) || 0;
        return {
          id: l.id,
          title: l.title,
          service_type: l.service_type,
          visibility_status: l.visibility_status,
          price_label: l.price_label,
          created_at: l.created_at,
          updated_at: l.updated_at,
          published_at: l.published_at,
          city: l.city,
          state: l.state,
          neighborhood: l.neighborhood,
          owner_user_id: l.owner_user_id,
          advertiser_name: adv.name,
          advertiser_kind: adv.kind,
          advertiser_listings_total: l.owner_user_id
            ? listingsCountByUser.get(l.owner_user_id) || 0
            : 0,
          advertiser_city: adv.city,
          advertiser_phone: adv.phone,
          package_name: pkg?.name ?? null,
          package_slug: pkg?.slug ?? null,
          credits_consumed,
          lead_count: leadsByListing.get(l.id) || 0,
        };
      });

      // ── 8. Lista de anunciantes (única) ─────────────────────────────────
      const advertisers: AdminServiceAdvertiser[] = Array.from(listingsCountByUser.keys()).map((uid) => {
        const adv = resolveAdvertiser(uid);
        return {
          user_id: uid,
          name: adv.name,
          kind: adv.kind,
          city: adv.city,
          state: adv.state,
          phone: adv.phone,
          total_listings: listingsCountByUser.get(uid) || 0,
          active_listings: activeByUser.get(uid) || 0,
          pending_listings: pendingByUser.get(uid) || 0,
          blocked_listings: blockedByUser.get(uid) || 0,
          packages_count: userPackageMap.get(uid)?.count || 0,
          credits_consumed: creditsByUser.get(uid) || 0,
          last_listing_at: lastListingByUser.get(uid) || null,
        };
      });

      // ── 9. Estatística de pacotes ───────────────────────────────────────
      const packageStats: AdminServicePackageStats[] = servicePackagesDb.map((p: any) => {
        const buys = purchases.filter((x: any) => x.package_id === p.id);
        const uniqueBuyers = new Set(buys.map((b: any) => b.owner_user_id)).size;
        const revenue = buys.reduce((sum, b: any) => sum + (Number(b.amount_brl) || 0), 0);
        const linkedListings = buys.reduce((sum, b: any) => {
          const uid = b.owner_user_id;
          return sum + (uid ? (listingsCountByUser.get(uid) || 0) : 0);
        }, 0);
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          price_brl: Number(p.price_brl) || 0,
          credits_amount: (Number(p.credits_amount) || 0) + (Number(p.credits_bonus) || 0),
          is_active: p.is_active !== false,
          purchases_count: buys.length,
          total_revenue_brl: revenue,
          unique_buyers: uniqueBuyers,
          listings_linked: linkedListings,
        };
      }).sort((a, b) => b.purchases_count - a.purchases_count);

      // ── 10. Ledger enriquecido ───────────────────────────────────────────
      const listingTitleById = new Map<string, string>();
      listings.forEach((l) => listingTitleById.set(l.id, l.title));

      const ledger: AdminServiceLedgerEntry[] = ledgerService.slice(0, 300).map((e) => {
        const uid = e.advertiser_account_id ? acctToUser.get(e.advertiser_account_id) || null : null;
        const adv = resolveAdvertiser(uid);
        const meta = e.metadata || {};
        const lid = meta.listing_id || e.listing_id || null;
        return {
          id: e.id,
          advertiser_account_id: e.advertiser_account_id ?? null,
          advertiser_user_id: uid,
          advertiser_name: adv.name,
          amount: Number(e.amount) || 0,
          entry_type: e.entry_type || (Number(e.amount) < 0 ? "debit" : "credit"),
          reason_code: e.reason_code ?? null,
          description: e.description ?? null,
          listing_id: lid,
          listing_title: lid ? listingTitleById.get(lid) || null : null,
          created_at: e.created_at,
        };
      });

      // ── 11. Growth (séries) ──────────────────────────────────────────────
      const now = new Date();
      const start = new Date();
      start.setDate(now.getDate() - (periodDays - 1));
      const daysWindow: string[] = [];
      for (let i = 0; i < periodDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        daysWindow.push(toISODate(d));
      }

      const firstListingByUser = new Map<string, string>();
      listings.forEach((l) => {
        const uid = l.owner_user_id as string | null;
        if (!uid) return;
        const prev = firstListingByUser.get(uid);
        if (!prev || new Date(l.created_at) < new Date(prev)) {
          firstListingByUser.set(uid, l.created_at);
        }
      });

      const growth: AdminServiceGrowthPoint[] = daysWindow.map((day) => {
        const inDay = (iso: string | undefined | null) => iso?.slice(0, 10) === day;
        const listingsCount = listings.filter((l) => inDay(l.created_at)).length;
        const advertisersCount = Array.from(firstListingByUser.values()).filter((iso) =>
          inDay(iso)
        ).length;
        return { day, listings: listingsCount, advertisers: advertisersCount };
      });

      // ── 12. KPIs ────────────────────────────────────────────────────────
      const periodStart = new Date();
      periodStart.setDate(now.getDate() - periodDays);
      const prevStart = new Date();
      prevStart.setDate(now.getDate() - periodDays * 2);

      const listingsInPeriod = listings.filter(
        (l) => new Date(l.created_at) >= periodStart
      ).length;
      const listingsInPrev = listings.filter((l) => {
        const d = new Date(l.created_at);
        return d >= prevStart && d < periodStart;
      }).length;

      const advertisersInPeriod = Array.from(firstListingByUser.values()).filter(
        (iso) => new Date(iso) >= periodStart
      ).length;
      const advertisersInPrev = Array.from(firstListingByUser.values()).filter((iso) => {
        const d = new Date(iso);
        return d >= prevStart && d < periodStart;
      }).length;

      const totalActive = rows.filter((r) => STATUS_ACTIVE.has(r.visibility_status || "")).length;
      const totalPending = rows.filter((r) => STATUS_PENDING.has(r.visibility_status || "")).length;
      const totalRejected = rows.filter((r) =>
        STATUS_REJECTED.has(r.visibility_status || "")
      ).length;

      const totalLojistas = advertisers.filter((a) => a.kind === "lojista").length;
      const totalPessoas = advertisers.filter((a) => a.kind === "pessoa").length;

      const totalPackagesSold = purchases.length;
      const totalCreditsConsumed = Array.from(creditsByUser.values()).reduce(
        (s, v) => s + v,
        0
      );

      const avgListingsPerAdvertiser =
        advertisers.length > 0 ? rows.length / advertisers.length : 0;
      const avgCreditsPerListing = rows.length > 0 ? totalCreditsConsumed / rows.length : 0;

      const decided = totalActive + totalRejected;
      const approvalRate = decided > 0 ? (totalActive / decided) * 100 : 0;

      const kpis: AdminServiceKpis = {
        total_listings: rows.length,
        active_listings: totalActive,
        pending_listings: totalPending,
        rejected_listings: totalRejected,
        total_advertisers: advertisers.length,
        total_lojistas: totalLojistas,
        total_pessoas: totalPessoas,
        total_packages_sold: totalPackagesSold,
        total_credits_consumed: totalCreditsConsumed,
        new_listings_period: listingsInPeriod,
        new_advertisers_period: advertisersInPeriod,
        listings_growth_pct: pct(listingsInPeriod, listingsInPrev),
        advertisers_growth_pct: pct(advertisersInPeriod, advertisersInPrev),
        avg_listings_per_advertiser: avgListingsPerAdvertiser,
        avg_credits_per_listing: avgCreditsPerListing,
        approval_rate_pct: approvalRate,
      };

      return {
        rows,
        advertisers,
        packages: packageStats,
        ledger,
        growth,
        kpis,
      };
    },
  });

  const cities = useMemo(() => {
    const set = new Set<string>();
    (query.data?.rows || []).forEach((r) => {
      if (r.city) set.add(r.city);
    });
    return Array.from(set).sort();
  }, [query.data]);

  return {
    ...query,
    cities,
  };
}
