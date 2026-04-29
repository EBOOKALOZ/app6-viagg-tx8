import mapboxgl from "mapbox-gl";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";
mapboxgl.accessToken = MAPBOX_TOKEN;

/**
 * Initializes and returns a new Mapbox GL JS map instance
 */
export function createMap(container: HTMLElement | string, initialCenter: [number, number] = [-49.2733, -26.9194], zoom: number = 13): mapboxgl.Map {
    return new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/streets-v12",
        center: initialCenter,
        zoom,
    });
}

export { mapboxgl };
