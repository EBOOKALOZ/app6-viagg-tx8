/**
 * resolveProduct — CAMADA ÚNICA de resolução de anúncio por id (multimódulo).
 *
 * A StorePublicPage (e qualquer consumidor) NÃO conhece tabelas. Pede apenas
 * "encontre este produto" e recebe um objeto padronizado. A resolução procura
 * em TODOS os módulos em paralelo (ids são UUID globais → só 1 casa).
 *
 * ➕ NOVO MÓDULO = adicionar UMA entrada no REGISTRY abaixo. Nada mais muda.
 * SÓ LEITURA. Não altera banco/regra.
 */
import { supabase } from "@/integrations/supabase/client";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";

export type ProductModule =
  | "product" | "real_estate" | "vehicles" | "services" | "freight" | "travel" | "auction" | string;
export type ProductModality = "venda" | "leilao" | "arremate";

export interface ResolvedProduct {
  id: string;
  module: ProductModule;
  modality: ProductModality;     // Venda | Leilão | Arremate
  title: string;
  description: string | null;
  image_url: string | null;      // imagem PRINCIPAL já resolvida (listing OU *_media)
  gallery: string[];             // galeria resolvida (quando existir)
  price: number;
  price_label: string | null;
  condition: string | null;
  store_id: string | null;       // merchant_store id (para /loja/:id), quando existir
  owner_user_id: string | null;  // fallback p/ resolver a loja pelo dono
  category: string | null;
}

// ─── Tabelas de MÍDIA por módulo (padrão *_media mascarado, ordenado por sort_order).
//     ➕ novo módulo com mídia separada = 1 entrada aqui. ─────────────────────────
const MEDIA_TABLE: Record<string, string> = {
  real_estate: "real_estate_media",
  vehicles: "vehicle_media",
  services: "service_media",
  freight: "freight_media",
  travel: "travel_media",
};

/** Resolve a imagem PRINCIPAL + galeria de uma tabela *_media (padrão mascarado). */
async function resolveMediaImages(table: string, listingId: string): Promise<{ main: string | null; gallery: string[] }> {
  try {
    const { data } = await (supabase.from(table as any)
      .select("original_storage_path, public_masked_storage_path, sort_order")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true })
      .limit(12)) as any;
    const urls = ((data || []) as any[]).map((m) => {
      const hasMasked = !!m.public_masked_storage_path && m.public_masked_storage_path !== m.original_storage_path;
      const path = hasMasked ? m.public_masked_storage_path : m.original_storage_path;
      return path ? getListingImageUrl(path, hasMasked ? "public" : "original") : null;
    }).filter(Boolean) as string[];
    return { main: urls[0] ?? null, gallery: urls };
  } catch { return { main: null, gallery: [] }; }
}

// Cache em memória (sessão) — evita reconsultar o mesmo produto/mídia.
const cache = new Map<string, ResolvedProduct>();

/** Converte número OU string "R$ 1.234,56" → number. */
function num(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

interface ModuleResolver {
  module: ProductModule;
  table: string;
  select: string;
  map: (r: any, id: string) => ResolvedProduct;
}

// ─── REGISTRO DE MÓDULOS (única fonte de verdade das tabelas de anúncio) ───────
const REGISTRY: ModuleResolver[] = [
  {
    module: "product", table: "merchant_marketing_products",
    select: "id, title, short_description, image_url, price_label, category, condition, merchant_store_id, created_by_user_id",
    map: (r, id) => ({ id, module: "product", title: r.title ?? "Produto", description: r.short_description ?? null, image_url: r.image_url ?? null, price: num(r.price_label), price_label: r.price_label ?? null, condition: r.condition ?? null, store_id: r.merchant_store_id ?? null, owner_user_id: r.created_by_user_id ?? null, category: r.category ?? null }),
  },
  {
    module: "product", table: "product_listings",
    select: "id, title, short_description, cover_image_url, price, promotional_price, category_name, condition, store_id, owner_user_id",
    map: (r, id) => ({ id, module: "product", title: r.title ?? "Produto", description: r.short_description ?? null, image_url: r.cover_image_url ?? null, price: num(r.promotional_price ?? r.price), price_label: null, condition: r.condition ?? null, store_id: r.store_id ?? null, owner_user_id: r.owner_user_id ?? null, category: r.category_name ?? null }),
  },
  {
    module: "product", table: "advertiser_listings",
    select: "id, title, description, cover_image_url, price, condition, category",
    map: (r, id) => ({ id, module: "product", title: r.title ?? "Produto", description: r.description ?? null, image_url: r.cover_image_url ?? null, price: num(r.price), price_label: null, condition: r.condition ?? null, store_id: null, owner_user_id: null, category: r.category ?? null }),
  },
  {
    module: "real_estate", table: "real_estate_listings",
    select: "id, title, description, price_brl, owner_user_id",
    map: (r, id) => ({ id, module: "real_estate", title: r.title ?? "Imóvel", description: r.description ?? null, image_url: null, price: num(r.price_brl), price_label: null, condition: null, store_id: null, owner_user_id: r.owner_user_id ?? null, category: "Imóveis" }),
  },
  {
    module: "vehicles", table: "vehicle_listings",
    select: "id, title, brand, model, description, price_brl, condition, owner_user_id",
    map: (r, id) => ({ id, module: "vehicles", title: r.title ?? ([r.brand, r.model].filter(Boolean).join(" ") || "Veículo"), description: r.description ?? null, image_url: null, price: num(r.price_brl), price_label: null, condition: r.condition ?? null, store_id: null, owner_user_id: r.owner_user_id ?? null, category: "Veículos" }),
  },
  {
    module: "services", table: "service_listings",
    select: "id, title, description, price_label, total_price, owner_user_id",
    map: (r, id) => ({ id, module: "services", title: r.title ?? "Serviço", description: r.description ?? null, image_url: null, price: num(r.total_price ?? r.price_label), price_label: r.price_label ?? null, condition: null, store_id: null, owner_user_id: r.owner_user_id ?? null, category: "Serviços" }),
  },
  {
    module: "freight", table: "freight_listings",
    select: "id, title, description, price_label, total_price, price_per_km, owner_user_id",
    map: (r, id) => ({ id, module: "freight", title: r.title ?? "Frete", description: r.description ?? null, image_url: null, price: num(r.total_price ?? r.price_label), price_label: r.price_label ?? null, condition: null, store_id: null, owner_user_id: r.owner_user_id ?? null, category: "Fretes" }),
  },
  {
    module: "travel", table: "travel_listings",
    select: "id, title, description, price_per_person, total_price, entry_price, category, owner_user_id",
    map: (r, id) => ({ id, module: "travel", title: r.title ?? "Viagem", description: r.description ?? null, image_url: null, price: num(r.total_price ?? r.price_per_person ?? r.entry_price), price_label: null, condition: null, store_id: null, owner_user_id: r.owner_user_id ?? null, category: r.category ?? "Turismo" }),
  },
  {
    module: "auction", table: "auction_listings",
    select: "id, title, description, product_image_url, current_bid, starting_bid, buy_now_price, reserve_price, store_id, owner_user_id, listing_type",
    map: (r, id) => ({ id, module: "auction", modality: r.listing_type === "arremate" ? "arremate" : "leilao", title: r.title ?? "Leilão", description: r.description ?? null, image_url: r.product_image_url ?? null, gallery: [], price: num(r.current_bid ?? r.starting_bid ?? r.buy_now_price ?? r.reserve_price), price_label: null, condition: null, store_id: r.store_id ?? null, owner_user_id: r.owner_user_id ?? null, category: "Leilões" }),
  },
];

/**
 * Encontra qualquer anúncio da plataforma pelo id, independente do módulo.
 * Retorna o objeto padronizado ou null se não existir em nenhum módulo.
 */
export async function resolveProductById(productId: string): Promise<ResolvedProduct | null> {
  if (!productId) return null;
  if (cache.has(productId)) return cache.get(productId)!;

  const results = await Promise.all(
    REGISTRY.map(async (m) => {
      try {
        const { data } = await (supabase.from(m.table as any).select(m.select).eq("id", productId).maybeSingle()) as any;
        return data ? m.map(data, productId) : null;
      } catch { return null; }
    })
  );
  const resolved = (results.find(Boolean) as ResolvedProduct | undefined) ?? null;
  if (!resolved) return null;

  // Defaults padronizados (maps de venda não precisam repetir).
  if (!resolved.modality) resolved.modality = "venda";
  if (!Array.isArray(resolved.gallery)) resolved.gallery = [];

  // Imagem PRINCIPAL: se não veio na tabela do anúncio E o módulo tem *_media,
  // resolve automaticamente aqui (a UI nunca sabe onde a imagem está).
  if (!resolved.image_url && MEDIA_TABLE[resolved.module]) {
    const { main, gallery } = await resolveMediaImages(MEDIA_TABLE[resolved.module], resolved.id);
    resolved.image_url = main;
    if (gallery.length) resolved.gallery = gallery;
  }

  cache.set(productId, resolved);
  return resolved;
}

/** Limpa o cache do resolver (ex.: após editar um anúncio). */
export function clearResolvedProductCache(productId?: string) {
  if (productId) cache.delete(productId);
  else cache.clear();
}
