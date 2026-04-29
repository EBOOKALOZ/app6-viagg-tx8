/**
 * 🧬 Growth Agent Types — Viagg-TX8
 *
 * Shared type system for the Local Marketplace Growth Engine.
 * Used by all 4 agents: CityExpansion, DemandIntelligence,
 * ViralDistribution, TerritoryDominance.
 */

// ─── Growth Stages ──────────────────────
export type GrowthStage = "cold" | "warming" | "growing" | "hot" | "dominant";
export type DominanceLevel = "weak" | "emerging" | "growing" | "strong" | "dominant";

// ─── Agent Names ────────────────────────
export type AgentName =
  | "CityExpansionAgent"
  | "DemandIntelligenceAgent"
  | "ViralDistributionAgent"
  | "TerritoryDominanceAgent";

// ─── Signal Protocol ────────────────────
export type SignalAction =
  | "CITY_HEATING"
  | "EXPANSION_TRIGGERED"
  | "VIRAL_DETECTED"
  | "DEMAND_SHIFT"
  | "AMPLIFY_COMPLETE"
  | "POSTER_REALLOC"
  | "ZONE_DOMINANT"
  | "ZONE_EXPANSION";

export interface AgentSignal {
  id: string;
  source: AgentName;
  target: AgentName | "ALL";
  action: SignalAction;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ─── Thresholds Config ──────────────────
export const GROWTH_THRESHOLDS = {
  city: {
    warming: { minStores: 3, minDemandScore: 100 },
    growing: { minStores: 10, minDemandScore: 1000 },
    hot: { minStores: 25, minDemandScore: 5000 },
    dominant: { minStores: 50, minDemandScore: 10000 },
  },
  zone: {
    emerging: { minDemandScore: 100 },
    growing: { minDemandScore: 500, minGroups: 5 },
    strong: { minDemandScore: 2000, minGroups: 10 },
    dominant: { minDemandScore: 5000, minGroups: 20 },
  },
  viral: {
    velocityMultiplier: 2, // 2x average = viral
    minEventsForViral: 5,
  },
} as const;

// ─── Database Row Types ─────────────────
export interface ProductInterestEvent {
  id: string;
  product_id: string;
  neighborhood: string;
  city: string;
  event_type: "view" | "click" | "share" | "purchase" | "wishlist";
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NeighborhoodProductDemand {
  id: string;
  product_id: string;
  neighborhood: string;
  city: string;
  demand_score: number;
  total_views: number;
  total_clicks: number;
  total_shares: number;
  total_purchases: number;
  velocity_24h: number;
  is_viral: boolean;
  last_calculated_at: string;
  created_at: string;
}

export interface CityGrowthMetrics {
  id: string;
  city: string;
  state: string | null;
  total_stores: number;
  total_groups: number;
  total_active_posters: number;
  total_products: number;
  total_demand_events: number;
  demand_score: number;
  growth_stage: GrowthStage;
  previous_stage: string | null;
  stage_changed_at: string | null;
  total_zones: number;
  dominant_zones: number;
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

export interface CityZone {
  id: string;
  city: string;
  zone_name: string;
  zone_code: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZoneNeighborhood {
  id: string;
  zone_id: string;
  neighborhood: string;
  city: string;
  assigned_at: string;
}

export interface ZoneDominanceMetrics {
  id: string;
  zone_id: string;
  city: string;
  group_count: number;
  poster_count: number;
  store_count: number;
  demand_score: number;
  dominance_level: DominanceLevel;
  previous_level: string | null;
  level_changed_at: string | null;
  neighbor_zone_ids: string[];
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Admin Growth Overview (View) ───────
export interface GrowthOverviewRow extends CityGrowthMetrics {
  zones: Array<{
    zone_id: string;
    zone_name: string;
    dominance_level: DominanceLevel;
    demand_score: number;
    group_count: number;
    poster_count: number;
  }>;
}

// ─── Agent Run Result ───────────────────
export interface AgentRunResult {
  agent: AgentName;
  success: boolean;
  signals: AgentSignal[];
  metrics: Record<string, number>;
  logs: string[];
  duration_ms: number;
}
