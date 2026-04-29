import { calculateRoute } from "../maps/routeService";

export interface LatLng {
    lat: number;
    lng: number;
}

/**
 * Calcula a rota rodoviária (distância e tempo) entre um motoboy e a loja utilizando o Maps Skill.
 * Retorna as propriedades extraídas da rota gerada (distância em metros, duração em segundos).
 */
export async function calculateRouteDetails(motoboy: LatLng, store: LatLng) {
    try {
        const route = await calculateRoute(motoboy, store);

        if (!route || !route.distance) {
            return null;
        }

        return {
            distance: route.distance, // Em metros
            duration: route.duration, // Em segundos
            geometry: route.geometry,
        };
    } catch (error) {
        console.error("Erro ao calcular rota do dispatch:", error);
        return null;
    }
}
