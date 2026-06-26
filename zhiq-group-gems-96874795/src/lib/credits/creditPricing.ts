/**
 * 💳 Tabela central de preços em créditos para cada evento da plataforma.
 *
 * O lojista (advertiser) é debitado em cada ação:
 *   - Ações do visitante: cobra-se o dono do produto/loja
 *   - Ações do próprio lojista: cobra-se o lojista logado
 */

export const CREDIT_COSTS = {
  /** Visitante clica num anúncio do marketplace e entra na loja */
  visitor_store_entry: 3,
  /** Visitante clica em um produto específico (dentro ou fora da loja) */
  visitor_product_click: 1,
  /** Visitante adiciona produto à cesta */
  visitor_cart_add: 5,
  /** Visitante finaliza pedido */
  visitor_checkout: 5,
  /** Lojista aceita uma oferta recebida (Minha Oferta é...) */
  advertiser_accept_offer: 9,
  /** Lojista desbloqueia WhatsApp do cliente no pedido (PEDIDO VINDO DE MARKETPLACE) */
  advertiser_unlock_order_whatsapp: 12,
  /** Lojista desbloqueia contato direto do visitante (lead de imóvel/veículo/produto) */
  advertiser_unlock_lead_whatsapp: 12,
} as const;

export type CreditEvent = keyof typeof CREDIT_COSTS;

/** Descrição amigável de cada evento (para o ledger e UI) */
export const CREDIT_EVENT_LABELS: Record<CreditEvent, string> = {
  visitor_store_entry: "Visitante entrou na loja",
  visitor_product_click: "Clique em produto",
  visitor_cart_add: "Produto adicionado à cesta",
  visitor_checkout: "Pedido finalizado",
  advertiser_accept_offer: "Oferta de comprador aceita",
  advertiser_unlock_order_whatsapp: "WhatsApp do cliente desbloqueado (pedido)",
  advertiser_unlock_lead_whatsapp: "Contato de lead desbloqueado",
};
