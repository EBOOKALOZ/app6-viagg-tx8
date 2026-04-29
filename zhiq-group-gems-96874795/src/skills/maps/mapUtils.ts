import mapboxgl from "mapbox-gl";

interface Coordinate {
    lat: number;
    lng: number;
}

/**
 * Ajusta o zoom do mapa para englobar os pontos de origem e destino solicitados
 */
export function fitRouteBounds(map: mapboxgl.Map, pickup: Coordinate, drop: Coordinate, padding: number = 80) {
    if (!pickup || !drop || !pickup.lat || !pickup.lng || !drop.lat || !drop.lng) return;

    const bounds = new mapboxgl.LngLatBounds()
        .extend([pickup.lng, pickup.lat])
        .extend([drop.lng, drop.lat]);

    map.fitBounds(bounds, {
        padding: padding,
        maxZoom: 15,
        speed: 1.2
    });
}

/**
 * Foca o mapa em torno de um único ponto inicial
 */
export function flyToSinglePoint(map: mapboxgl.Map, point: Coordinate, zoom: number = 14) {
    if (!point || !point.lat || !point.lng) return;

    map.flyTo({
        center: [point.lng, point.lat],
        zoom: zoom,
        speed: 1.2,
        curve: 1.4,
        easing: (t) => t
    });
}
