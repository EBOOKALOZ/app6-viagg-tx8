import { supabase } from "@/integrations/supabase/client";
import { trackProductEvent } from "@/skills/growth/trackProductEvent";

const ANON_ID_KEY = "viagg_anon_id";

function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = (crypto as any)?.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export interface ConsumeProductClickArgs {
  productId: string;
  storeId: string;
  city?: string | null;
  neighborhood?: string | null;
  source?: string;
}

export interface ConsumeProductClickResult {
  charged: boolean;
  reason?: string;
  credits_charged?: number;
  balance_after?: number;
}

/**
 * Fire-and-forget: registra o CLIQUE do visitante (analytics de Visualizações).
 *
 * ⚠️ CARTEIRA DE CRÉDITOS (FASE 2): o clique NÃO cobra mais créditos.
 * A política oficial é única — só há consumo ao LIBERAR O CONTATO do comprador
 * (2% do valor anunciado, via wallet_unlock_contact). Receber/visualizar
 * interessados é GRÁTIS. Mantemos apenas o tracking do evento (não financeiro).
 */
export async function consumeMarketplaceProductClick(
  args: ConsumeProductClickArgs
): Promise<ConsumeProductClickResult | null> {
  if (!args.productId || !args.storeId) return null;

  // Analytics (não financeiro): alimenta o card de Visualizações do dashboard.
  trackProductEvent({
    product_id: args.productId,
    store_id: args.storeId,
    event_type: "click",
    source: args.source || "card",
    city: args.city,
    neighborhood: args.neighborhood,
  });

  // Sem cobrança de crédito no clique (visitor_click removido na FASE 2).
  return { charged: false, reason: "free_view" };
}
