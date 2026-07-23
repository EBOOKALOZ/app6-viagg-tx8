/**
 * Tipos do módulo VIAGENS — contratos das tabelas travel_* e das RPCs de
 * moderação administrativa.
 *
 * Por que este arquivo existe: o types.ts gerado é o snapshot de 03/06/2026,
 * ANTERIOR à criação do módulo viagens (24/06) — nenhuma tabela travel_* está
 * no `Database`. Até a regeneração completa (requer SUPABASE_ACCESS_TOKEN:
 *   npx supabase gen types typescript --project-id broifhfqmnzqoongtokm)
 * o código do módulo usa `.from("travel_..." as any)` + estes tipos de Row.
 *
 * Fonte de verdade: supabase/migrations/20260624_travel_listings_base.sql,
 * 20260723_travel_schema_sync_oficial.sql, 20260723_travel_admin_moderacao_oficial.sql.
 */

/** Enum public.real_estate_listing_status (reusado por viagens). */
export type TravelListingStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "paused"
  | "rejected"
  | "archived";

export interface TravelListingRow {
  id: string;
  owner_user_id: string;
  title: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  subcategoria: string | null;
  trip_type: string | null;
  destination: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  departure_date: string | null;
  return_date: string | null;
  duration_days: number | null;
  available_spots: number | null;
  price_per_person: number | null;
  total_price: number | null;
  entry_price: string | number | null;
  installments_available: boolean | null;
  not_included: string | null;
  visibility_status: TravelListingStatus;
  moderation_status: string | null;
  ai_status: string | null;
  moderation_reason: string | null;
  is_featured: boolean | null;
  featured_until: string | null;
  is_promoted: boolean | null;
  promoted_until: string | null;
  latitude: number | null;
  longitude: number | null;
  endereco_formatado: string | null;
  deleted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface TravelMediaRow {
  id: string;
  listing_id: string;
  owner_user_id: string;
  media_type: string;
  sort_order: number;
  original_storage_path: string | null;
  public_masked_storage_path: string | null;
  moderation_status: string;
  created_at: string;
  updated_at: string | null;
}

export interface TravelAuditLogRow {
  id: string;
  entity: "travel_listings" | "travel_media" | string;
  entity_id: string | null;
  action: string;
  actor_user_id: string | null;
  reason: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

/** Ações aceitas por admin_moderate_travel_listing. */
export type TravelListingModerationAction =
  | "approve"
  | "reject"
  | "request_changes"
  | "pause"
  | "archive"
  | "restore"
  | "soft_delete";

/** Ações aceitas por admin_moderate_travel_media. */
export type TravelMediaModerationAction = "approve" | "reject";

export interface TravelModerationResult {
  success: boolean;
  error?: string;
  listing_id?: string;
  media_id?: string;
  action?: string;
  old_status?: string;
  new_status?: string;
}
