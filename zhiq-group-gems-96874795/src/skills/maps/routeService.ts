const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "";

interface Coordinate {
    lat: number;
    lng: number;
}

export interface RouteData {
    geometry: any;
    distance: number;
    duration: number;
    weight_name: string;
    weight: number;
    legs: any[];
}

/**
 * Calculates a driving route between two geographical points using Mapbox Directions API
 */
export async function calculateRoute(pickup: Coordinate, drop: Coordinate): Promise<RouteData | null> {
    if (!pickup || !drop || !pickup.lat || !pickup.lng || !drop.lat || !drop.lng) {
        console.error("Coordenadas invÃ¡lidas para cÃ¡lculo de rota", { pickup, drop });
        return null;
    }

    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Directions API erro: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.routes || data.routes.length === 0) {
            return null;
        }

        return data.routes[0];
    } catch (error) {
        console.error("Erro ao calcular a rota:", error);
        return null;
    }
}


