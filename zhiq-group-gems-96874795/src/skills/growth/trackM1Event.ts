/**
 * 📊 trackM1Event — COMANDO M1 Monetization Tracking
 *
 * Fire-and-forget utility for recording M1 billing events.
 * Tracks store views, product clicks, buy clicks, and purchase completions
 * with full origin/source metadata for territorial intelligence.
 *
 * Key: merchant_store_id = merchant_stores.id (chave oficial do M1)
 * Source propagation: reads ?src=, ?sid=, ?cid= from URL search params.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────
export type M1EventType = "store_view" | "product_click" | "buy_click" | "purchase_completed";
export type M1SourceType = "group" | "postador" | "local_marketplace" | "direct" | "campaign" | "internal";

export interface TrackM1EventParams {
  merchant_store_id: string;
  product_id?: string | null;
  event_type: M1EventType;
  source_type?: M1SourceType;
  source_id?: string | null;
  campaign_id?: string | null;
  city?: string | null;
  region?: string | null;
  bairro?: string | null;
  sale_value_cents?: number;
  metadata?: Record<string, unknown>;
}

// ─── Session ID ─────────────────────────
function getM1SessionId(): string {
  const KEY = "vtx8_m1_session";
  let session = sessionStorage.getItem(KEY);
  if (!session) {
    session = crypto.randomUUID();
    sessionStorage.setItem(KEY, session);
  }
  return session;
}

// ─── Source Params from URL ─────────────
function getSourceFromURL(): {
  source_type: M1SourceType;
  source_id: string | null;
  campaign_id: string | null;
} {
  try {
    const params = new URLSearchParams(window.location.search);
    const src = params.get("src");
    const sid = params.get("sid");
    const cid = params.get("cid");

    const validSources: M1SourceType[] = [
      "group", "postador", "local_marketplace", "direct", "campaign", "internal",
    ];

    return {
      source_type: validSources.includes(src as M1SourceType) ? (src as M1SourceType) : "direct",
      source_id: sid || null,
      campaign_id: cid || null,
    };
  } catch {
    return { source_type: "direct", source_id: null, campaign_id: null };
  }
}

// ─── Store View Dedup ───────────────────
const viewedStores = new Set<string>();

// ─── Build source params string for URL propagation ─────────
export function buildM1SourceParams(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const src = params.get("src");
    const sid = params.get("sid");
    const cid = params.get("cid");
    const parts: string[] = [];
    if (src) parts.push(`src=${encodeURIComponent(src)}`);
    if (sid) parts.push(`sid=${encodeURIComponent(sid)}`);
    if (cid) parts.push(`cid=${encodeURIComponent(cid)}`);
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  } catch {
    return "";
  }
}

// ─── Core Tracking Function ─────────────
/**
 * Record an M1 billing event.
 * Fire-and-forget: never throws, never blocks.
 * merchant_store_id = merchant_stores.id (chave oficial do M1)
 */
export function trackM1Event(params: TrackM1EventParams): void {
  // Dedup store_view within same session (key includes bairro so re-fire with data passes)
  if (params.event_type === "store_view") {
    const key = `${params.merchant_store_id}:${params.bairro || ""}`;
    if (viewedStores.has(key)) return;
    viewedStores.add(key);
  }

  // Fire async, never await
  (async () => {
    try {
      const urlSource = getSourceFromURL();
      const visitorId = (await supabase.auth.getUser()).data?.user?.id || null;

      await (supabase.from("m1_billing_events") as any).insert({
        merchant_store_id: params.merchant_store_id,
        product_id: params.product_id || null,
        event_type: params.event_type,
        source_type: params.source_type || urlSource.source_type,
        source_id: params.source_id || urlSource.source_id,
        campaign_id: params.campaign_id || urlSource.campaign_id,
        city: params.city || null,
        region: params.region || null,
        bairro: params.bairro || null,
        session_id: getM1SessionId(),
        visitor_user_id: visitorId,
        sale_value_cents: params.sale_value_cents || 0,
        metadata: params.metadata || {},
      });
    } catch (err) {
      // Fail-safe: never interrupt user experience
      console.debug("[trackM1Event] Silent fail:", err);
    }
  })();
}
