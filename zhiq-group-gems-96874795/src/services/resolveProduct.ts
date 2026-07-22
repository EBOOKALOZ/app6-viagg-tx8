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

export type ProductModule =
  | "product" | "real_estate" | "vehicles" | "services" | "freight" | "travel" | "auction" | string;

export interface ResolvedProduct {
  id: string;
  module: ProductModule;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number;
  price_label: string | null;
  condition: string | null;
  store_id: string | null;       // merchant_store id (para /loja/:id), quando existir
  owner_user_id: string | null;  // fallback p/ resolver a loja pelo dono
  category: string | null;
}

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
    map: (r, id) => ({ id, module: "vehicles", title: r.title ?? [r.brand, r.model].filter(Boolean).join(" ") || "Veículo", description: r.description ?? null, image_url: null, price: num(r.price_brl), price_label: null, condition: r.condition ?? null, store_id: null, owner_user_id: r.owner_user_id ?? null, category: "Veículos" }),
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
    select: "id, title, description, product_image_url, buy_now_price, reserve_price, store_id, owner_user_id",
    map: (r, id) => ({ id, module: "auction", title: r.title ?? "Leilão", description: r.description ?? null, image_url: r.product_image_url ?? null, price: num(r.buy_now_price ?? r.reserve_price), price_label: null, condition: null, store_id: r.store_id ?? null, owner_user_id: r.owner_user_id ?? null, category: "Leilões" }),
  },
];

/**
 * Encontra qualquer anúncio da plataforma pelo id, independente do módulo.
 * Retorna o objeto padronizado ou null se não existir em nenhum módulo.
 */
export async function resolveProductById(productId: string): Promise<ResolvedProduct | null> {
  if (!productId) return null;
  const results = await Promise.all(
    REGISTRY.map(async (m) => {
      try {
        const { data } = await (supabase.from(m.table as any).select(m.select).eq("id", productId).maybeSingle()) as any;
        return data ? m.map(data, productId) : null;
      } catch { return null; }
    })
  );
  return (results.find(Boolean) as ResolvedProduct | undefined) ?? null;
}
