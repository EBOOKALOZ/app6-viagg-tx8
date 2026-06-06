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
 * Fire-and-forget: dispara o débito de créditos do lojista quando o visitante
 * clica num card do /mercado e entra na loja. Toda a lógica (saldo, dedup,
 * skip-do-dono) é resolvida no backend pela RPC `consume_marketplace_product_click`.
 *
 * Não bloqueia a navegação — erros e saldo insuficiente apenas são logados;
 * o visitante segue para a loja normalmente.
 */
export async function consumeMarketplaceProductClick(
  args: ConsumeProductClickArgs
): Promise<ConsumeProductClickResult | null> {
  if (!args.productId || !args.storeId) return null;

  // Registra evento de "click" pra alimentar o card de Visualizações do dashboard
  trackProductEvent({
    product_id: args.productId,
    store_id: args.storeId,
    event_type: "click",
    source: args.source || "card",
    city: args.city,
    neighborhood: args.neighborhood,
  });

  try {
    const { data, error } = await (supabase.rpc as any)("consume_marketplace_product_click", {
      p_product_id: args.productId,
      p_store_id: args.storeId,
      p_anon_id: getAnonId(),
      p_city: args.city ?? null,
      p_neighborhood: args.neighborhood ?? null,
      p_source: args.source ?? "card",
    });

    if (error) {
      console.warn("[credits] consume_marketplace_product_click error", error);
      return null;
    }
    return data as ConsumeProductClickResult;
  } catch (err) {
    console.warn("[credits] consume_marketplace_product_click threw", err);
    return null;
  }
}
