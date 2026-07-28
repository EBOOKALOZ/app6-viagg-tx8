import { supabase } from "@/integrations/supabase/client";
import { ServiceType, ProfessionalLocation, RankedProfessional } from "./dispatchTypes";
import { calculateRouteDetails } from "./distanceService";

export async function findAvailableProfessionals(serviceType: ServiceType): Promise<ProfessionalLocation[]> {
    let tableName = '';
    let idColumn = '';

    // Mapeamento correto com base nos tipos de profissionais e banco de dados viagg
    switch (serviceType) {
        case 'delivery':
            tableName = 'motoboy_locations';
            idColumn = 'motoboy_id';
            break;
        case 'ride':
            tableName = 'motorista_locations'; // Exemplo provisório, ajuste conforme esquema real
            idColumn = 'motorista_id';
            break;
        case 'mototaxi':
            tableName = 'mototaxi_locations'; // Exemplo provisório
            idColumn = 'mototaxi_id';
            break;
        case 'freight':
            tableName = 'frete_locations'; // Exemplo provisório
            idColumn = 'freteiro_id';
            break;
        default:
            console.error(`Serviço não reconhecido: ${serviceType}`);
            return [];
    }

    try {
        const { data, error } = await supabase
            .from(tableName as never)
            .select(`id, ${idColumn}, lat, lng, status`)
            .eq("status", "online");

        if (error) {
            console.error(`Erro ao buscar profissionais online na tabela ${tableName}:`, error);
            return [];
        }

        // Normalização para o formato ProfessionalLocation
        return (data || []).map((row: Record<string, unknown>) => ({
            id: row.id,
            professional_id: row[idColumn],
            lat: row.lat,
            lng: row.lng,
            status: row.status
        }));
    } catch (e) {
        console.error(`Erro inesperado ao buscar profissionais de ${serviceType}:`, e);
        return [];
    }
}

export async function rankByDistance(professionals: ProfessionalLocation[], pickupLat: number, pickupLng: number): Promise<RankedProfessional[]> {
    const ranked: RankedProfessional[] = [];

    for (const prof of professionals) {
        const routeDetails = await calculateRouteDetails(
            { lat: prof.lat, lng: prof.lng },
            { lat: pickupLat, lng: pickupLng }
        );

        if (routeDetails) {
            ranked.push({
                ...prof,
                distance: routeDetails.distance,
                duration: routeDetails.duration
            });
        }
    }

    // Ordenar primeiramente por proximidade de tempo (ETA), depois por distância.
    ranked.sort((a, b) => {
        if (a.duration === b.duration) {
            return a.distance - b.distance;
        }
        return a.duration - b.duration;
    });

    return ranked;
}

export async function createDispatchOffers(requestId: string, selectedProfessionals: RankedProfessional[]) {
    if (selectedProfessionals.length === 0) return;

    const offers = selectedProfessionals.map((prof) => ({
        request_id: requestId,
        professional_id: prof.professional_id,
        status: 'pending',
        // Outros campos úteis se a tabela permitir
        // distance: prof.distance,
        // duration: prof.duration
    }));

    try {
        const { error } = await supabase
            .from('service_offers' as never)
            .insert(offers);

        if (error) {
            console.error("Erro ao criar ofertas de corrida (service_offers):", error);
        } else {
            console.log(`Foram criadas ${offers.length} ofertas para a chamada ${requestId}.`);
        }
    } catch (e) {
        console.error("Erro inesperado ao inserir em service_offers:", e);
    }
}
