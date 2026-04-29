/**
 * 📊 trackProductEvent — LOCAL1 Origin Tracking
 *
 * Fire-and-forget utility for recording product interest events
 * to power the Local Demand Engine.
 *
 * Features:
 * - Async, non-blocking (never impacts UX)
 * - Fail-safe (silently catches errors)
 * - Location detection: user profile → geolocation → product city fallback
 * - Session-based dedup via sessionStorage
 * - Batched view tracking via IntersectionObserver
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────
export type InterestEventType = "view" | "click" | "share" | "cart" | "order" | "wishlist";

export interface TrackEventParams {
  product_id: string;
  store_id?: string | null;
  event_type: InterestEventType;
  source?: string;
  city?: string | null;
  neighborhood?: string | null;
  metadata?: Record<string, unknown>;
}

// ─── Session ID ─────────────────────────
function getSessionId(): string {
  const KEY = "vtx8_session_id";
  let session = sessionStorage.getItem(KEY);
  if (!session) {
    session = crypto.randomUUID();
    sessionStorage.setItem(KEY, session);
  }
  return session;
}

// ─── Location Detection ─────────────────
interface DetectedLocation {
  city: string | null;
  neighborhood: string | null;
}

let cachedLocation: DetectedLocation | null = null;

async function detectLocation(fallbackCity?: string | null): Promise<DetectedLocation> {
  // Return cached result if available
  if (cachedLocation) return cachedLocation;

  // 1. Try user profile (if logged in)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("cidade, bairro")
        .eq("id", user.id)
        .single();
      if (profile?.cidade) {
        cachedLocation = {
          city: profile.cidade,
          neighborhood: profile.bairro || null,
        };
        return cachedLocation;
      }
    }
  } catch { /* ignore */ }

  // 2. Use fallback city from product data
  if (fallbackCity) {
    cachedLocation = { city: fallbackCity, neighborhood: null };
    return cachedLocation;
  }

  // 3. Default
  cachedLocation = { city: null, neighborhood: null };
  return cachedLocation;
}

// ─── View Dedup ─────────────────────────
const viewedProducts = new Set<string>();

// ─── Core Tracking Function ─────────────
/**
 * Record a product interest event.
 * Fire-and-forget: never throws, never blocks.
 */
export function trackProductEvent(params: TrackEventParams): void {
  // Dedup views within same session
  if (params.event_type === "view") {
    if (viewedProducts.has(params.product_id)) return;
    viewedProducts.add(params.product_id);
  }

  // Fire async, never await
  (async () => {
    try {
      const location = await detectLocation(params.city);
      const userId = (await supabase.auth.getUser()).data?.user?.id || null;

      await (supabase.from("product_interest_events") as any).insert({
        product_id: params.product_id,
        store_id: params.store_id || null,
        city: params.city || location.city,
        neighborhood: params.neighborhood || location.neighborhood,
        event_type: params.event_type,
        source: params.source || "landing",
        user_id: userId,
        session_id: getSessionId(),
        metadata: params.metadata || {},
      });
    } catch (err) {
      // Fail-safe: never interrupt user experience
      console.debug("[trackProductEvent] Silent fail:", err);
    }
  })();
}

// ─── Intersection Observer for Views ────
/**
 * Create an IntersectionObserver that auto-tracks "view" events
 * when product cards become visible on screen.
 *
 * Usage:
 *   const observer = createViewObserver();
 *   observer.observe(cardElement);
 *   // cleanup: observer.disconnect();
 */
export function createViewObserver(
  getProductData: (el: Element) => TrackEventParams | null
): IntersectionObserver {
  return new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const data = getProductData(entry.target);
          if (data) {
            trackProductEvent({ ...data, event_type: "view" });
          }
        }
      }
    },
    {
      threshold: 0.5, // 50% visible = impression
      rootMargin: "0px",
    }
  );
}
