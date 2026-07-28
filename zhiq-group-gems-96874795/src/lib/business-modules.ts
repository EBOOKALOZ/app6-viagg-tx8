/**
 * business-modules — registry dos módulos de negócio que replicam o modelo
 * "Minha Loja" + "Aparência da Loja" do lojista (que permanece intacto).
 *
 * Cada módulo declara APENAS nomenclatura, rotas e a fonte dos seus anúncios;
 * toda a lógica (perfil, aparência, preview, página pública) é genérica:
 *  - dados:      advertiser_module_profiles (1 linha por user × módulo)
 *  - escrita:    RPCs upsert_business_profile / set_business_appearance
 *  - tema:       mesmo schema StoreAppearance de src/lib/store-theme.ts
 */
import type { LucideIcon } from "lucide-react";
import { Building2, Car, Gavel, Trophy, Truck, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";

export type BusinessModuleKey =
  | "imobiliaria"
  | "revenda"
  | "leiloes"
  | "arremates"
  | "empresa_fretes"
  | "agencia_turismo";

/** Anúncio do módulo normalizado p/ listagem e preview (tolerante a schema). */
export interface BusinessListingItem {
  id: string;
  title: string;
  imageUrl: string | null;
  priceLabel: string | null;
  isActive: boolean;
  createdAt: string | null;
  editHref: string | null;
}

export interface BusinessModuleDef {
  key: BusinessModuleKey;
  /** "Imobiliária", "Revenda"… (títulos e textos) */
  noun: string;
  /** artigo do substantivo: "a" imobiliária, "os" leilões */
  article: "a" | "o" | "os";
  /** rótulo do menu p/ o perfil — "Minha Imobiliária", "Meus Leilões"… */
  profileMenuLabel: string;
  /** rótulo do menu p/ aparência — "Aparência da Imobiliária"… */
  appearanceMenuLabel: string;
  /** plural dos anúncios do módulo — "imóveis", "veículos"… */
  listingsNoun: string;
  icon: LucideIcon;
  /** dashboard do módulo no painel do anunciante */
  panelHome: string;
  /** rota da tela "Minha X" */
  profilePath: string;
  /** rota da tela "Aparência da X" */
  appearancePath: string;
  /** rota "Meus Anúncios" já existente do módulo */
  manageListingsPath: string;
  /** página pública do perfil deste módulo (recebe o user_id do dono) */
  publicPathFor: (userId: string) => string;
  /** profileType usado por StoreHeader/AdvertiserSummaryCard */
  profileType: string;
  /** anúncios publicados do dono (para "Minha X" e preview da aparência) */
  fetchListings: (userId: string) => Promise<BusinessListingItem[]>;
}

const brl = (v: unknown): string | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const firstStr = (...vals: unknown[]): string | null => {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

/** SELECT * tolerante: nunca quebra por coluna inexistente. */
async function fetchOwnListings(
  table: string,
  userId: string,
  opts?: { listingType?: "auction" | "arremate" | "not_arremate" },
): Promise<any[]> {
  // @ts-expect-error - dynamic table query
  let q = supabase.from(table).select("*").order("created_at", { ascending: false }).limit(24);
  if (opts?.listingType === "arremate") q = q.eq("listing_type", "arremate");
  if (opts?.listingType === "not_arremate") q = q.neq("listing_type", "arremate");

  // Leilões/arremates podem estar ligados via store_id (RPC antiga só grava
  // store_id) — inclui as lojas do dono no filtro, como useAdvertiserAuctions.
  if (opts?.listingType) {
    // @ts-expect-error - dynamic table query
    const { data: stores } = await supabase.from("merchant_stores")
      .select("id")
      .eq("user_id", userId);
    // @ts-expect-error - dynamic query result
    const ids = ((stores || [])).map((s) => s.id).filter(Boolean);
    q = ids.length
      ? q.or(`owner_user_id.eq.${userId},store_id.in.(${ids.join(",")})`)
      : q.eq("owner_user_id", userId);
  } else {
    q = q.eq("owner_user_id", userId);
  }
  const { data, error } = await q;
  if (error) return [];
  // @ts-expect-error - dynamic query result
  return data || [];
}

/**
 * Preenche imageUrl com a 1ª foto das tabelas *_media (padrão mascarado:
 * usa o path público mascarado quando existe, senão o original) — imóveis,
 * veículos, fretes e viagens não têm coluna de imagem no próprio listing.
 * Uma única query em lote para todos os anúncios sem imagem.
 */
async function attachMediaThumbs(
  mediaTable: string,
  items: BusinessListingItem[],
): Promise<BusinessListingItem[]> {
  const missing = items.filter((i) => !i.imageUrl).map((i) => i.id);
  if (!missing.length) return items;
  try {
    // @ts-expect-error - dynamic table query
    const { data } = await supabase.from(mediaTable)
      .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
      .in("listing_id", missing)
      .order("sort_order", { ascending: true });
    const thumbs = new Map<string, string>();
    // @ts-expect-error - dynamic query result
    for (const m of (data || [])) {
      const key = String(m.listing_id);
      if (thumbs.has(key)) continue;
      const masked = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
      const path = masked ? m.public_masked_storage_path : m.original_storage_path;
      const url = path ? getListingImageUrl(path, masked ? "public" : "original") : null;
      if (url) thumbs.set(key, url);
    }
    return items.map((i) => (i.imageUrl ? i : { ...i, imageUrl: thumbs.get(i.id) ?? null }));
  } catch {
    return items;
  }
}

function mapListing(r: Record<string, unknown>, editHref: string | null, priceLabel: string | null): BusinessListingItem {
  return {
    id: String(r.id),
    title: firstStr(r.title, r.nome, r.name) || "Anúncio",
    imageUrl: firstStr(r.cover_image_url, r.image_url, r.product_image_url, r.cover_url, r.main_image_url),
    priceLabel,
    isActive: r.is_active !== false && r.status !== "inactive" && r.visibility_status !== "hidden",
    createdAt: r.created_at ?? null,
    editHref,
  };
}

export const BUSINESS_MODULES: Record<BusinessModuleKey, BusinessModuleDef> = {
  imobiliaria: {
    key: "imobiliaria",
    noun: "Imobiliária",
    article: "a",
    profileMenuLabel: "Minha Imobiliária",
    appearanceMenuLabel: "Aparência da Imobiliária",
    listingsNoun: "imóveis",
    icon: Building2,
    panelHome: "/anunciante/imoveis",
    profilePath: "/anunciante/imoveis/minha-imobiliaria",
    appearancePath: "/anunciante/imoveis/aparencia",
    manageListingsPath: "/anunciante/imoveis/meus-anuncios",
    publicPathFor: (uid) => `/imobiliaria/${uid}?tab=imoveis`,
    profileType: "imoveis",
    fetchListings: async (uid) =>
      attachMediaThumbs("real_estate_media",
        (await fetchOwnListings("real_estate_listings", uid)).map((r) =>
          mapListing(r, `/anunciante/imoveis/anuncios/editar/imovel/${r.id}`, brl(r.price_brl ?? r.price)))),
  },
  revenda: {
    key: "revenda",
    noun: "Revenda",
    article: "a",
    profileMenuLabel: "Minha Revenda",
    appearanceMenuLabel: "Aparência da Revenda",
    listingsNoun: "veículos",
    icon: Car,
    panelHome: "/anunciante/veiculos",
    profilePath: "/anunciante/veiculos/minha-revenda",
    appearancePath: "/anunciante/veiculos/aparencia",
    manageListingsPath: "/anunciante/veiculos/meus-anuncios",
    publicPathFor: (uid) => `/revenda/${uid}?tab=veiculos`,
    profileType: "veiculos",
    fetchListings: async (uid) =>
      attachMediaThumbs("vehicle_media",
        (await fetchOwnListings("vehicle_listings", uid)).map((r) =>
          mapListing(r, `/anunciante/veiculos/anuncios/editar/veiculo/${r.id}`, brl(r.price_brl ?? r.price)))),
  },
  leiloes: {
    key: "leiloes",
    noun: "Leilões",
    article: "os",
    profileMenuLabel: "Meus Leilões",
    appearanceMenuLabel: "Aparência dos Leilões",
    listingsNoun: "leilões",
    icon: Gavel,
    panelHome: "/anunciante/leiloes",
    profilePath: "/anunciante/leiloes/perfil",
    appearancePath: "/anunciante/leiloes/aparencia",
    manageListingsPath: "/anunciante/leiloes",
    publicPathFor: (uid) => `/anunciante/${uid}?tab=leiloes`,
    profileType: "leiloes",
    fetchListings: async (uid) =>
      (await fetchOwnListings("auction_listings", uid, { listingType: "not_arremate" })).map((r) =>
        mapListing(r, null, brl(r.current_bid ?? r.starting_bid))),
  },
  arremates: {
    key: "arremates",
    noun: "Arremates",
    article: "os",
    profileMenuLabel: "Meus Arremates",
    appearanceMenuLabel: "Aparência dos Arremates",
    listingsNoun: "arremates",
    icon: Trophy,
    panelHome: "/anunciante/arremates/gestao",
    profilePath: "/anunciante/arremates/perfil",
    appearancePath: "/anunciante/arremates/aparencia",
    manageListingsPath: "/anunciante/arremates/gestao",
    publicPathFor: (uid) => `/anunciante/${uid}?tab=arremates`,
    profileType: "leiloes",
    fetchListings: async (uid) =>
      (await fetchOwnListings("auction_listings", uid, { listingType: "arremate" })).map((r) =>
        mapListing(r, null, brl(r.current_bid ?? r.starting_bid))),
  },
  empresa_fretes: {
    key: "empresa_fretes",
    noun: "Empresa",
    article: "a",
    profileMenuLabel: "Minha Empresa",
    appearanceMenuLabel: "Aparência da Empresa",
    listingsNoun: "fretes",
    icon: Truck,
    panelHome: "/anunciante/fretes",
    profilePath: "/anunciante/fretes/minha-empresa",
    appearancePath: "/anunciante/fretes/aparencia",
    manageListingsPath: "/anunciante/fretes/meus-anuncios",
    publicPathFor: (uid) => `/freteiro/${uid}?tab=fretes`,
    profileType: "freteiro",
    fetchListings: async (uid) =>
      attachMediaThumbs("freight_media",
        (await fetchOwnListings("freight_listings", uid)).map((r) =>
          mapListing(r, `/anunciante/fretes/anuncios/editar/frete/${r.id}`, brl(r.total_price ?? r.price_per_km)))),
  },
  agencia_turismo: {
    key: "agencia_turismo",
    noun: "Agência",
    article: "a",
    profileMenuLabel: "Minha Agência",
    appearanceMenuLabel: "Aparência da Agência",
    listingsNoun: "pacotes",
    icon: Plane,
    panelHome: "/anunciante/viagens",
    profilePath: "/anunciante/viagens/minha-agencia",
    appearancePath: "/anunciante/viagens/aparencia",
    manageListingsPath: "/anunciante/viagens/meus-anuncios",
    publicPathFor: (uid) => `/agencia/${uid}?tab=viagens`,
    profileType: "viagem",
    fetchListings: async (uid) =>
      attachMediaThumbs("travel_media",
        (await fetchOwnListings("travel_listings", uid)).map((r) =>
          mapListing(r, `/anunciante/viagens/anuncios/editar/viagem/${r.id}`, brl(r.total_price ?? r.price_per_person)))),
  },
};

export const ALL_BUSINESS_MODULES = Object.values(BUSINESS_MODULES);

/** Resolve o módulo a partir do pathname atual (usado pelas páginas genéricas). */
export function resolveModuleByPath(pathname: string): BusinessModuleDef | null {
  return (
    ALL_BUSINESS_MODULES.find(
      (m) => m.profilePath === pathname || m.appearancePath === pathname,
    ) ?? null
  );
}

/**
 * Mapeia a URL pública / profileType para o módulo correspondente
 * (páginas públicas usam para carregar identidade + tema do módulo).
 */
export function moduleKeyFromPublicContext(
  pathname: string,
  tab?: string | null,
): BusinessModuleKey | null {
  if (pathname.startsWith("/imobiliaria/")) return "imobiliaria";
  if (pathname.startsWith("/revenda/")) return "revenda";
  if (pathname.startsWith("/freteiro/")) return "empresa_fretes";
  if (pathname.startsWith("/agencia/")) return "agencia_turismo";
  // Leilões/arremates não têm alias próprio — valem via ?tab=, mas SÓ no alias
  // /anunciante/:id. Em /loja/:id?tab=leiloes a identidade continua sendo a da
  // loja do lojista (fluxo existente dos cards de leilão → loja).
  if (pathname.startsWith("/anunciante/")) {
    if (tab === "leiloes" || tab === "leilao" || tab === "leilões") return "leiloes";
    if (tab === "arremates" || tab === "arremate") return "arremates";
  }
  return null;
}

/**
 * NOVO FLUXO DE NAVEGAÇÃO (padrão global): clique em um anúncio abre a página
 * pública do anunciante com o anúncio em destaque (?product=), em vez da
 * página de detalhe isolada. Este helper monta a URL pública correta por
 * tipo de perfil. Aceita store_id OU user_id (a StorePublicPage resolve ambos).
 */
export function publicAdvertiserPath(
  profileType: string | null | undefined,
  ownerId: string,
  listingId?: string | null,
): string {
  const base =
    profileType === "imoveis" || profileType === "imobiliaria" ? `/imobiliaria/${ownerId}?tab=imoveis`
    : profileType === "veiculos" || profileType === "revenda" ? `/revenda/${ownerId}?tab=veiculos`
    : profileType === "servicos" || profileType === "prestador" ? `/prestador/${ownerId}?tab=servicos`
    : profileType === "freteiro" || profileType === "fretes" ? `/freteiro/${ownerId}?tab=fretes`
    : profileType === "viagem" || profileType === "viagens" || profileType === "agencia" ? `/agencia/${ownerId}?tab=viagens`
    : profileType === "leiloes" ? `/anunciante/${ownerId}?tab=leiloes`
    : profileType === "arremates" ? `/anunciante/${ownerId}?tab=arremates`
    : `/loja/${ownerId}`;
  if (!listingId) return base;
  return `${base}${base.includes("?") ? "&" : "?"}product=${listingId}`;
}

export function moduleKeyFromProfileType(profileType?: string | null): BusinessModuleKey | null {
  switch (profileType) {
    case "imoveis": return "imobiliaria";
    case "veiculos": return "revenda";
    case "leiloes": return "leiloes";
    case "freteiro": return "empresa_fretes";
    case "viagem": return "agencia_turismo";
    default: return null;
  }
}
