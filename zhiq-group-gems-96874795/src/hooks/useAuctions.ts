/**
 * useAuctions — TIPOS do domínio de leilões (fonte única).
 *
 * O hook `useAuctions()` foi REMOVIDO na certificação ORION (2026-07-23):
 * era código morto (nunca invocado) e usava `supabaseAdmin` no cliente para
 * UPDATE/DELETE direto — fora do padrão de segurança (escrita só via RPC).
 * O caminho oficial do anunciante é `useAdvertiserAuctions` (RPCs + RLS por
 * owner_user_id). Estas interfaces continuam sendo a fonte de tipos importada
 * por páginas/componentes (`import type { AuctionListing, AuctionBid }`).
 *
 * Tabelas: auction_listings, auction_bids, auction_watchers, auction_events.
 * RPCs de escrita: place_auction_bid, auction_buy_now, auction_set_status,
 *                  set_auction_proxy_bid, end_auction_listing.
 */

// ─── Types (aligned with REAL DB schema) ──

export interface AuctionListing {
  id: string;
  store_id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  product_image_url: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  listing_type: "auction" | "arremate";
  starting_bid: number;
  current_bid: number;
  minimum_increment: number;
  buy_now_price: number | null;
  reserve_price: number | null;
  status: "draft" | "active" | "paused" | "ended" | "cancelled" | "sold";
  fulfillment_type?: "pickup" | "delivery" | "both" | null;
  starts_at: string;
  ends_at: string;
  winner_user_id: string | null;
  total_bids: number;
  watchers_count: number;
  created_at: string;
  updated_at: string;
  // Image metadata
  image_storage_path: string | null;
  image_original_name: string | null;
  image_mime_type: string | null;
  image_size_bytes: number | null;
  image_uploaded_at: string | null;
  // Virtual / aliased
  views_count?: number;
  offer_count?: number;
  bid_count?: number;
  // Categoria / classificação (enterprise)
  category_id?: string | null;
  category_slug?: string | null;
  brand?: string | null;
  model?: string | null;
  item_condition?: string | null;
  moderation_status?: string | null;
  // Price aliases from auction_module schema
  current_price_cents?: number;
  original_price_cents?: number;
  buy_now_price_cents?: number;
}

export interface AuctionBid {
  id: string;
  listing_id: string;
  /** coluna real da tabela é `user_id`; mantido alias `bidder_id` p/ compat */
  bidder_id?: string;
  user_id?: string;
  amount_cents: number;
  is_winning: boolean;
  is_auto?: boolean;
  is_valid?: boolean;
  created_at: string;
  bidder_name?: string;
}

export interface CreateListingInput {
  title: string;
  description?: string;
  product_image_url?: string;
  starting_bid: number;       // R$ (numeric, not cents)
  buy_now_price?: number;     // R$ (numeric)
  reserve_price?: number;     // R$ (numeric)
  minimum_increment?: number; // R$ (numeric, default 1)
  duration_hours: number;
  starts_at?: string;         // ISO timestamp
  ends_at?: string;           // ISO timestamp
  listing_type?: "auction" | "arremate";
  fulfillment_type?: string;
  product_id?: string | null;
}
