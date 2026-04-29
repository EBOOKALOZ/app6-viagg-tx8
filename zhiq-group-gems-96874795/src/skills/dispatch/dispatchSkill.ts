import { DispatchRequest } from "./dispatchTypes";
import { findAvailableProfessionals, rankByDistance, createDispatchOffers } from "./dispatchEngine";

/**
 * Main Centralized Dispatch Function
 * Handles the logic required to distribute a new delivery/ride to the best candidates.
 */
export async function dispatchRequest(request: DispatchRequest) {
    console.log(`[DispatchSkill] Recebendo nova chamada ${request.id} do tipo ${request.service_type}`);

    // 1️⃣ Buscar profissionais online de acordo com o serviço
    const professionals = await findAvailableProfessionals(request.service_type);

    if (professionals.length === 0) {
        console.warn(`[DispatchSkill] Nenhum profissional online para o serviço ${request.service_type}`);
        return;
    }

    console.log(`[DispatchSkill] Encontrados ${professionals.length} profissionais online. Calculando rotas...`);

    // 2️⃣ Calcular distância até o ponto de coleta e ordenar
    const ranked = await rankByDistance(
        professionals,
        request.pickup_lat,
        request.pickup_lng
    );

    if (ranked.length === 0) {
        console.warn(`[DispatchSkill] Falha ao rotear até os profissionais. Nenhuma oferta criada.`);
        return;
    }

    // 3️⃣ Selecionar os 5 melhores
    const selected = ranked.slice(0, 5);

    console.log(`[DispatchSkill] Selecionando ${selected.length} profissionais mais próximos.`);

    // 4️⃣ Criar ofertas no banco
    await createDispatchOffers(request.id, selected);
}
