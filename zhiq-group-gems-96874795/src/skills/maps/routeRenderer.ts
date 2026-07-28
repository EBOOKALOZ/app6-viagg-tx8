import mapboxgl from "mapbox-gl";

export interface RouteSegment {
  /** Coordenadas [lng, lat] no formato Mapbox */
  coordinates: [number, number][];
  /** Cor principal do tracejado (ex: '#ffb800') */
  color: string;
  /** ID único do segmento (para limpeza) */
  id: string;
  /** Quando true, renderiza como linha tracejada visível em vez de sólida */
  dashed?: boolean;
}

/**
 * Controla os IDs das animações rodando para cancelar se vier nova chamada
 */
let currentAnimationFrame: number | null = null;
const animationStep = 0;

/**
 * Desenha dois (ou mais) trechos tracejados independentes com cores distintas.
 * Reutiliza os sources se já existirem para evitar "flicker" e sumiço dos trajetos.
 */
export function drawSegmentedRoutes(
  map: mapboxgl.Map,
  segments: RouteSegment[],
  show: boolean,
  previousIds: string[] = [],
) {
  console.log('[routeRenderer DEBUG] drawSegmentedRoutes called. show:', show, 'segments count:', segments.length, 'Segments data:', segments);

  if (!show || !segments.length) {
    clearSegments(map, previousIds);
    clearSegments(map, segments.map(s => s.id));
    return;
  }

  // Apenas tentar limpar ids que nós sabemos que *não* estão mais na nova lista
  const currentIds = segments.map(s => s.id);
  const idsToRemove = previousIds.filter(id => !currentIds.includes(id));
  clearSegments(map, idsToRemove);

  segments.forEach(seg => {
    if (!seg.coordinates || seg.coordinates.length < 2) return;

    const sourceId = `seg-${seg.id}`;
    const geojsonData = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: seg.coordinates }
    };

    const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(geojsonData);
      // Se layers foram removidas (style reload), re-adiciona abaixo
      if (map.getLayer(`${sourceId}-core`)) return;
    } else {
      try {
        map.addSource(sourceId, { type: 'geojson', data: geojsonData });
      } catch {
        return; // source já existe em condição de race — tenta no próximo ciclo
      }
    }

    // slot: 'top' garante visibilidade no Mapbox Standard style v3
    const slot = { slot: 'top' } as Record<string, unknown>;

    try {
        // ── Glow ────────────────────────────────────────────────
        map.addLayer({
          ...slot,
          id: `${sourceId}-glow`,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': seg.color,
            'line-width': seg.dashed ? 14 : 10,
            'line-opacity': seg.dashed ? 0.22 : 0.18,
            'line-blur': 7,
          },
        } as Parameters<typeof map.addLayer>[0]);

        if (seg.dashed) {
          map.addLayer({
            ...slot,
            id: `${sourceId}-core`,
            type: 'line',
            source: sourceId,
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': seg.color,
              'line-width': 5,
              'line-opacity': 1,
              'line-dasharray': [8, 5],
            },
          } as Parameters<typeof map.addLayer>[0]);

          map.addLayer({
            ...slot,
            id: `${sourceId}-dash`,
            type: 'line',
            source: sourceId,
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 2.5,
              'line-opacity': 0.8,
              'line-dasharray': [2, 11],
            },
          } as Parameters<typeof map.addLayer>[0]);
        } else {
          map.addLayer({
            ...slot,
            id: `${sourceId}-core`,
            type: 'line',
            source: sourceId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': seg.color,
              'line-width': 4,
              'line-opacity': 0.95,
            },
          } as Parameters<typeof map.addLayer>[0]);

          map.addLayer({
            ...slot,
            id: `${sourceId}-dash`,
            type: 'line',
            source: sourceId,
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': '#FFFFFF',
              'line-width': 1.5,
              'line-opacity': 0.35,
              'line-dasharray': [1, 5],
            },
          } as Parameters<typeof map.addLayer>[0]);
        }

        // ── Setas de direção ────────────────────────────────────
        map.addLayer({
          ...slot,
          id: `${sourceId}-arrow`,
          type: 'symbol',
          source: sourceId,
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': seg.dashed ? 90 : 70,
            'text-field': '›',
            'text-size': seg.dashed ? 26 : 22,
            'text-keep-upright': false,
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'viewport',
          },
          paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': seg.color,
            'text-halo-width': 2,
            'text-opacity': 1,
          },
        } as Parameters<typeof map.addLayer>[0]);

    } catch (err) {
      console.error(`[routeRenderer] Erro ao adicionar layers para ${sourceId}:`, err);
    }
  });

  // Garante que só há 1 loop de animação rodando globalmente (se tivéssemos dash)
  // Como removemos o line-dash animado (para resolver problemas de render na linha sólida), 
  // limpamos o loop.
  if (currentAnimationFrame !== null) {
    cancelAnimationFrame(currentAnimationFrame);
    currentAnimationFrame = null;
  }
}

/**
 * Desenha uma geometria de rota Premium (com Neon Glow, Setas e Animações)
 */
export function drawRoutePremium(map: mapboxgl.Map, coordinates: [number, number][], showRoute: boolean, color: string = '#1F6F4A') {
    // Remove existing route layers
    ['premium-route-glow-outer', 'premium-route-glow', 'premium-route-casing', 'premium-route-line', 'premium-route-dash', 'premium-route-arrows'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('premium-route')) map.removeSource('premium-route');

    if (!showRoute || !coordinates || coordinates.length < 2) return;

    map.addSource('premium-route', {
        type: 'geojson',
        data: {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates,
            },
        },
    });

    // Wide outer glow — neon bloom
    map.addLayer({
        id: 'premium-route-glow-outer',
        type: 'line',
        source: 'premium-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': color,
            'line-width': 36,
            'line-opacity': 0.08,
            'line-blur': 18,
        },
    });

    // Inner glow
    map.addLayer({
        id: 'premium-route-glow',
        type: 'line',
        source: 'premium-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': color,
            'line-width': 18,
            'line-opacity': 0.15,
            'line-blur': 8,
        },
    });

    // Dark casing for contrast
    map.addLayer({
        id: 'premium-route-casing',
        type: 'line',
        source: 'premium-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#002855',
            'line-width': 12,
            'line-opacity': 0.5,
        },
    });

    // Main neon line
    map.addLayer({
        id: 'premium-route-line',
        type: 'line',
        source: 'premium-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': color, // cor principal da rota (parametrizável)
            'line-width': 6,
            'line-opacity': 1,
        },
    });

    // Animated dash overlay — progression effect
    map.addLayer({
        id: 'premium-route-dash',
        type: 'line',
        source: 'premium-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': '#FFFFFF',
            'line-width': 3,
            'line-opacity': 0.55,
            'line-dasharray': [0, 4, 3],
        },
    });

    // Route direction arrows
    map.addLayer({
        id: 'premium-route-arrows',
        type: 'symbol',
        source: 'premium-route',
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 50,
            'text-field': '➤',
            'text-size': 20,
            'text-keep-upright': false,
        },
        paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': color,
            'text-halo-width': 1.5,
            'text-opacity': 0.95,
        }
    });

    if (currentAnimationFrame !== null) {
        cancelAnimationFrame(currentAnimationFrame);
        currentAnimationFrame = null;
    }

    // Animate dash progression
    let dashStep = 0;
    const animateDash = () => {
        if (!map.getLayer('premium-route-dash')) return;
        dashStep = (dashStep + 1) % 100;
        const t = dashStep / 100;
        map.setPaintProperty('premium-route-dash', 'line-dasharray', [t * 4, 4, 3]);
        currentAnimationFrame = requestAnimationFrame(animateDash);
    };
    currentAnimationFrame = requestAnimationFrame(animateDash);
}

/**
 * Força a remoção de TODAS as linhas de rota desenhadas previamente (premium ou segments).
 * Fundamental para garantir que rotas antigas não "fiquem presas" no mapa (ghosting)
 * quando o React reutilizar a instância do mapboxgl.Map entre navegações.
 */
export function clearAllRoutes(map: mapboxgl.Map) {
    if (!map) return;

    try {
        // 1) Limpar camadas Premium (Caminho Loja -> Cliente)
        const premiumLayers = [
            'premium-route-glow-outer', 
            'premium-route-glow', 
            'premium-route-casing', 
            'premium-route-line', 
            'premium-route-dash', 
            'premium-route-arrows'
        ];
        premiumLayers.forEach(id => {
            if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource('premium-route')) {
            map.removeSource('premium-route');
        }

        // 2) Limpar camadas Segmentadas (Motoboy -> Loja -> Cliente)
        const style = map.getStyle();
        if (style && style.layers) {
            style.layers.forEach(layer => {
                // Remove qualquer camada de segmento (seg-*_core, seg-*_glow, etc)
                if (layer.id.startsWith('seg-')) {
                    map.removeLayer(layer.id);
                }
            });
        }
        
        // Depois que as layers forem removidas, limpe as sources
        if (style && style.sources) {
            Object.keys(style.sources).forEach(sourceId => {
                if (sourceId.startsWith('seg-')) {
                   if (map.getSource(sourceId)) {
                       map.removeSource(sourceId);
                   }
                }
            });
        }
    } catch (e) {
        console.warn('[routeRenderer] Error clearing all routes:', e);
    }
}
