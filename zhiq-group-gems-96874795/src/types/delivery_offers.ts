// ═══════════════════════════════════════
// DELIVERY OFFERS — Tipos do Sistema de Chamadas
// ═══════════════════════════════════════

export type DeliveryOfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled';

export interface DeliveryOffer {
    id: string;
    delivery_order_id: string;
    motoboy_id: string;
    store_id: string;
    status: DeliveryOfferStatus;
    
    sent_at: string;
    viewed_at: string | null;
    accepted_at: string | null;
    rejected_at: string | null;
    expires_at: string | null;

    // Snapshots operacionais
    distance_km_snapshot: number | null;
    estimated_price_snapshot: number | null;
    pickup_address_snapshot: string | null;
    dropoff_address_snapshot: string | null;
    store_name_snapshot: string | null;
    customer_name_snapshot: string | null;
    notes_snapshot: string | null;

    created_at: string;
    updated_at: string;
}

export interface AcceptOfferResponse {
    ok: boolean;
    reason?: string;
    delivery_order_id?: string;
}
