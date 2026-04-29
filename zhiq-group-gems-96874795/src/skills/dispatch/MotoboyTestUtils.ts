import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Utilitário de teste para renovar ofertas expiradas durante a homologação.
 * Isso permite testar o botão de aceite sem precisar criar uma nova corrida toda vez.
 */
export async function renewExpiredOffer(offerId: string) {
    console.log(`[TestUtils] Renovando oferta ${offerId}...`);
    
    // 1. Atualiza a oferta para pending e renova o expires_at
    const { error: offerError } = await supabase
        .from('delivery_offers')
        .update({
            status: 'pending',
            expires_at: new Date(Date.now() + 120000).toISOString(), // + 120s
            responded_at: null,
            accepted_at: null,
            rejected_at: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', offerId);

    if (offerError) {
        console.error('[TestUtils] Erro ao renovar oferta:', offerError);
        toast.error("Erro ao renovar oferta: " + offerError.message);
        return false;
    }

    // 2. Garante que a service_order também volte para status de busca se estiver 'awaiting_professional'
    // Buscamos o delivery_order_id primeiro
    const { data: offerData } = await supabase
        .from('delivery_offers')
        .select('delivery_order_id')
        .eq('id', offerId)
        .single();

    if (offerData?.delivery_order_id) {
        const { error: orderError } = await supabase
            .from('service_orders')
            .update({ status: 'awaiting_professional' })
            .eq('id', offerData.delivery_order_id);
            
        if (orderError) console.warn('[TestUtils] Erro ao resetar status da ordem:', orderError);
    }

    toast.success("🚀 Oferta renovada por +120s para teste!");
    return true;
}
