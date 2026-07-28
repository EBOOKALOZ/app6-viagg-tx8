import mapboxgl from "mapbox-gl";

/**
 * Desenha uma geometria de rota em um mapa fornecido usando uma camada colorida
 */
export function drawRoute(map: mapboxgl.Map, geometry: Record<string, unknown> | mapboxgl.GeoJSONGeometry, sourceId = "route", layerId = "route-line") {
    // If the source already exists, just update the data
    if (map.getSource(sourceId)) {
        const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
        src.setData({
            type: "Feature",
            properties: {},
            geometry: geometry as mapboxgl.GeoJSONGeometry
        });
        return;
    }

    // Otherwise, create the source and layer
    map.addSource(sourceId, {
        type: "geojson",
        data: {
            type: "Feature",
            properties: {},
            geometry: geometry as mapboxgl.GeoJSONGeometry
        }
    });

    map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: {
            "line-join": "round",
            "line-cap": "round"
        },
        paint: {
            "line-color": "#ff6a00", // Cor da rota solicitada pelo usuário
            "line-width": 4,
            "line-opacity": 0.9
        }
    });
}
