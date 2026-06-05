import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertCircle, MapPin } from "lucide-react";

interface StoreLocationMapProps {
    initialLat?: number;
    initialLng?: number;
    addressLabel?: string;
    onLocationSelect: (lat: number, lng: number) => void;
    /** Disparado quando o usuário clica no marker (modo readOnly). Útil para abrir captcha. */
    onMarkerClick?: () => void;
    /** Texto exibido no balão acima do pino. Padrão: "👆 Clique aqui para mudar o endereço" */
    markerLabel?: string;
    className?: string;
    readOnly?: boolean;
    /** Se false, o pino estático NÃO é mostrado (mesmo em readOnly).
     *  Útil pra abrir o mapa numa região como dica sem fingir que há residência salva. */
    hasConfirmedLocation?: boolean;
}

export function StoreLocationMap({
    initialLat,
    initialLng,
    onLocationSelect,
    onMarkerClick,
    markerLabel = "👆 Clique aqui para mudar o endereço",
    addressLabel,
    className = "",
    readOnly = false,
    hasConfirmedLocation = true,
}: StoreLocationMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const staticMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const isInitializing = useRef(false);

    // Armazena a versão mais recente da função de callback para evitar Stale Closures (variáveis presas no passado)
    const onLocationSelectRef = useRef(onLocationSelect);
    useEffect(() => {
        onLocationSelectRef.current = onLocationSelect;
    }, [onLocationSelect]);
    const onMarkerClickRef = useRef(onMarkerClick);
    useEffect(() => {
        onMarkerClickRef.current = onMarkerClick;
    }, [onMarkerClick]);

    const [mapboxError, setMapboxError] = useState<string | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // Lê o token do ambiente sem hardcodar
    const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

    // Inicialização do mapa: executado estritamente UMA vez
    useEffect(() => {
        // Validação do Token
        if (!MAPBOX_TOKEN) {
            setMapboxError("Token do Mapbox não encontrado. Configure VITE_MAPBOX_TOKEN no .env");
            return;
        }

        if (!mapContainer.current || mapRef.current || isInitializing.current) return;

        isInitializing.current = true;

        try {
            mapboxgl.accessToken = MAPBOX_TOKEN;

            // Centro geográfico estimado do Brasil (Mato Grosso)
            // LER DIRETAMENTE DO ESTADO INICIAL PARA EVITAR RE-CRIAR MAPA
            const defaultLng = initialLng || -53.2;
            const defaultLat = initialLat || -10.33;
            const initialZoom = initialLat && initialLng ? 15 : 4;

            const map = new mapboxgl.Map({
                container: mapContainer.current,
                style: "mapbox://styles/mapbox/streets-v12",
                center: [defaultLng, defaultLat],
                zoom: initialZoom,
                maxZoom: 22, // permite zoom de rua bem detalhado
                pitch: 45,
                bearing: -17.6,
                antialias: true,
                /* Qualidade visual: usa o DPR real do device (cap 4 cobre 4K/retina extremo),
                   preserveDrawingBuffer melhora composição, fadeDuration 0 = sem blur entre tiles. */
                pixelRatio: Math.min(window.devicePixelRatio || 1, 4),
                preserveDrawingBuffer: true,
                fadeDuration: 0,
                optimizeForTerrain: true,
                localFontFamily: 'DM Sans, ui-sans-serif, system-ui, sans-serif',
            });

            mapRef.current = map;

            if (!readOnly) {
                map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
            }

            // Fallback: se o mapa não disparar 'load' em 3 segundos, libera a tela
            const fallbackTimeout = setTimeout(() => {
                const currentMap = mapRef.current;
                const currentContainer = mapContainer.current;

                if (!isMapLoaded && currentMap && currentContainer) {
                    console.warn("Mapbox 'load' event timeout. Forcing map display.");
                    setIsMapLoaded(true);

                    // Safety check to avoid "Cannot set properties of undefined (setting 'width')" 
                    // if the component was unmounted or container size is 0
                    try {
                        currentMap.resize();
                    } catch (e) {
                        console.warn("Mapbox resize failed during fallback:", e);
                    }
                }
            }, 3000);

            map.on("load", () => {
                clearTimeout(fallbackTimeout);
                setIsMapLoaded(true); // Oculta estado loading
                map.resize(); // Garante o preenchimento do container

                // Adiciona a camada de prédios 3D
                if (!map.getLayer("3d-buildings")) {
                    const layers = map.getStyle().layers;
                    if (layers) {
                        const labelLayerId = layers.find(
                            (layer: any) => layer.type === "symbol" && layer.layout["text-field"]
                        )?.id;

                        map.addLayer(
                            {
                                id: "3d-buildings",
                                source: "composite",
                                "source-layer": "building",
                                filter: ["==", "extrude", "true"],
                                type: "fill-extrusion",
                                minzoom: 15,
                                paint: {
                                    "fill-extrusion-color": "#c8d0da",
                                    "fill-extrusion-height": [
                                        "interpolate", ["linear"], ["zoom"],
                                        15, 0, 15.05, ["get", "height"],
                                    ],
                                    "fill-extrusion-base": [
                                        "interpolate", ["linear"], ["zoom"],
                                        15, 0, 15.05, ["get", "min_height"],
                                    ],
                                    "fill-extrusion-opacity": 0.55,
                                    "fill-extrusion-vertical-gradient": true,
                                },
                            },
                            labelLayerId
                        );
                    }
                }

                // Terreno 3D
                if (!map.getSource("mapbox-dem")) {
                    map.addSource("mapbox-dem", {
                        type: "raster-dem",
                        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
                        tileSize: 512,
                        maxzoom: 14,
                    });
                    map.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });
                }

                // Efeito Fog atmosférico e iluminação noturna superior
                map.setFog({
                    color: "rgb(225, 232, 240)",
                    "high-color": "rgb(160, 185, 215)",
                    "horizon-blend": 0.08,
                    "space-color": "rgb(180, 200, 230)",
                    "star-intensity": 0.0,
                });

                // Destaque POIs (Hospital, Farmácia, Hotel)
                const highlightedPoiFilter = [
                    "in",
                    ["get", "class"],
                    ["literal", ["hospital", "pharmacy", "lodging"]],
                ] as any;

                // Halo colorido por trás do ícone
                if (!map.getLayer("poi-highlight-circle")) {
                    map.addLayer({
                        id: "poi-highlight-circle",
                        type: "circle",
                        source: "composite",
                        "source-layer": "poi_label",
                        minzoom: 12,
                        filter: highlightedPoiFilter,
                        paint: {
                            "circle-radius": [
                                "interpolate", ["linear"], ["zoom"],
                                12, 6,
                                16, 14,
                                20, 22,
                            ],
                            "circle-color": [
                                "match",
                                ["get", "class"],
                                "hospital", "#ef4444",
                                "pharmacy", "#10b981",
                                "lodging", "#3b82f6",
                                "#999999",
                            ],
                            "circle-stroke-color": "#ffffff",
                            "circle-stroke-width": 2,
                            "circle-opacity": 0.92,
                        },
                    });
                }

                // Ícone branco em cima do halo
                if (!map.getLayer("poi-highlight-icon")) {
                    map.addLayer({
                        id: "poi-highlight-icon",
                        type: "symbol",
                        source: "composite",
                        "source-layer": "poi_label",
                        minzoom: 12,
                        filter: highlightedPoiFilter,
                        layout: {
                            "icon-image": [
                                "match",
                                ["get", "class"],
                                "hospital", "hospital-15",
                                "pharmacy", "pharmacy-15",
                                "lodging", "lodging-15",
                                "marker-15",
                            ],
                            "icon-size": [
                                "interpolate", ["linear"], ["zoom"],
                                12, 0.9,
                                16, 1.4,
                                20, 1.8,
                            ],
                            "icon-allow-overlap": true,
                            "text-field": ["get", "name"],
                            "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
                            "text-size": [
                                "interpolate", ["linear"], ["zoom"],
                                13, 0,
                                14, 10,
                                18, 13,
                            ],
                            "text-anchor": "top",
                            "text-offset": [0, 1.1],
                            "text-optional": true,
                        },
                        paint: {
                            "icon-color": "#ffffff",
                            "text-color": "#1f2937",
                            "text-halo-color": "#ffffff",
                            "text-halo-width": 1.5,
                        },
                    });
                }
            });

            map.on("error", (e) => {
                console.error("Mapbox error event:", e);
                // Evita explodir a tela, mas loga no console real
            });

            // Configurar interação de mapa moderno (Pino central fixo estilo Uber ao invés de arrastar pino nativo)
            if (!readOnly) {
                // Ao terminar de arrastar o mapa, resolvemos a localização oficial baseada no centro da tela
                map.on("moveend", (e: any) => {
                    // Previne que o "flyTo" programático destrua os dados que vieram do backend
                    if (e.originalEvent) {
                        const center = map.getCenter();
                        onLocationSelectRef.current(center.lat, center.lng);
                    }
                });

                // Clicar em outro lugar faz a tela voar pro lugar clicado e o centro encaixa
                map.on("click", (e) => {
                    const { lng, lat } = e.lngLat;
                    map.flyTo({
                        center: [lng, lat],
                        zoom: Math.max(map.getZoom(), 15),
                        essential: true,
                        speed: 1.2
                    });
                    // Disparamos manualmente aqui, já que omitimos programáticos no moveend
                    onLocationSelectRef.current(lat, lng);
                });
            }
            /* Marker estático (readOnly) é gerenciado em um useEffect separado abaixo,
               reativo a initialLat/initialLng — não pode ficar preso por closure aqui. */

            return () => {
                map.remove();
                mapRef.current = null;
                staticMarkerRef.current = null; // Clean up static marker
                isInitializing.current = false;
                setIsMapLoaded(false); // força o useEffect do marker a re-disparar quando o novo mapa carregar
            };
        } catch (err) {
            console.error("Erro ao carregar Mapbox:", err);
            setMapboxError("Falha ao inicializar o mapa. Verifique a conexão.");
            isInitializing.current = false;
        }
    }, [MAPBOX_TOKEN, readOnly]); // Adicionado readOnly como dependência para recriar o mapa com o modo correto

    // Cria / atualiza / remove o marker estático conforme readOnly e initialLat/initialLng mudam
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !isMapLoaded) return;

        // Se saiu de readOnly, perdeu as coords, ou não há residência confirmada → remove o marker
        if (!readOnly || !hasConfirmedLocation || initialLat === undefined || initialLng === undefined) {
            if (staticMarkerRef.current) {
                staticMarkerRef.current.remove();
                staticMarkerRef.current = null;
            }
            return;
        }

        const numLng = Number(initialLng);
        const numLat = Number(initialLat);

        // Sempre garante que o mapa esteja olhando para o marker (acima da margem)
        const c = map.getCenter();
        const mapOffTarget = Math.abs(c.lat - numLat) + Math.abs(c.lng - numLng) > 0.0001;
        if (mapOffTarget) {
            map.flyTo({
                center: [numLng, numLat],
                zoom: Math.max(map.getZoom(), 15),
                essential: true,
            });
        }

        // Já existe → apenas atualiza a posição
        if (staticMarkerRef.current) {
            staticMarkerRef.current.setLngLat([numLng, numLat]);
            return;
        }

        // Cria do zero
        const el = document.createElement("div");
        el.innerHTML = `
          <button type="button" data-store-marker-label style="cursor:pointer;background:#FFD814;color:#111;border:none;padding:6px 12px;border-radius:14px;font-weight:800;font-size:11px;letter-spacing:0.05em;box-shadow:0 6px 18px rgba(0,0,0,0.25);white-space:nowrap;margin-bottom:6px;text-transform:uppercase;display:flex;align-items:center;gap:4px;">
            ${markerLabel.replace(/[<>]/g, '')}
          </button>
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);border:3px solid #fff;box-shadow:0 8px 32px rgba(16,185,129,0.4);display:flex;align-items:center;justify-content:center;position:relative;z-index:2;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </div>
          <div style="width:0;height:0;margin-top:-2px;margin-left:auto;margin-right:auto;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #fff;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.2)); z-index: 2;"></div>
        `;
        el.style.display = "flex";
        el.style.flexDirection = "column";
        el.style.alignItems = "center";

        const labelBtn = el.querySelector('[data-store-marker-label]') as HTMLButtonElement | null;
        if (labelBtn) {
            labelBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onMarkerClickRef.current?.();
            });
        }

        staticMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: false })
            .setLngLat([numLng, numLat])
            .addTo(map);
    }, [initialLat, initialLng, isMapLoaded, readOnly, markerLabel, hasConfirmedLocation]);

    // O useEffect para addressLabel não é mais necessário, pois o label é renderizado diretamente no JSX do marcador central.
    // useEffect(() => {
    //     if (!markerRef.current || !addressLabel) return;
    //     const labelEl = markerRef.current.getElement().querySelector('#dynamic-marker-label');
    //     if (labelEl) {
    //         labelEl.textContent = addressLabel;
    //     }
    // }, [addressLabel]);

    if (mapboxError) {
        return (
            <div className={`p-4 rounded-lg bg-red-950/30 border border-red-500/50 flex items-start gap-3 text-red-400 ${className}`}>
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-red-300">Erro no Mapa</h4>
                    <p className="text-sm mt-1">{mapboxError}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden rounded-xl border border-white/10 ${className}`} style={{ minHeight: '400px' }}>
            <div
                ref={mapContainer}
                style={{ width: '100%', height: '400px', position: 'relative' }}
                className="mapbox-wrapper"
            />

            {!isMapLoaded && (
                <div className="absolute inset-0 bg-[#121212] flex flex-col items-center justify-center text-[#09c277]" style={{ zIndex: 10 }}>
                    <MapPin className="w-8 h-8 animate-bounce mb-3 opacity-80" />
                    <span className="text-sm font-medium animate-pulse tracking-wide">Carregando mapa...</span>
                </div>
            )}

            {/* Marcador Central Fixo Estilo Uber/Ultra Moderno
                Ponta da seta alinhada EXATAMENTE ao centro geográfico do mapa
                (corpo 44px + triângulo 10px - margem -2px = 52px acima do centro) */}
            {!readOnly && isMapLoaded && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 pointer-events-none" style={{ zIndex: 20 }}>
                    {/* Conjunto pino: bottom=0 da âncora => ponta no centro do mapa */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-0 flex flex-col items-center">
                        {/* Ring ping em volta */}
                        <div className="absolute top-[8px] w-12 h-12 rounded-full border-2 border-emerald-500/50 animate-ping" style={{ zIndex: 1 }}></div>
                        {/* Corpo principal do marcador */}
                        <div className="w-[44px] h-[44px] rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 border-4 border-white shadow-[0_8px_32px_rgba(16,185,129,0.5)] flex items-center justify-center relative z-10 transition-transform duration-200">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                        </div>
                        {/* Ponta da setinha para baixo — bottom termina em 0 (centro geográfico) */}
                        <div className="w-0 h-0 -mt-[2px] border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-white drop-shadow-md z-10"></div>
                    </div>

                    {/* Tooltip ultra moderno exibindo o endereço dinâmico — posicionado ABAIXO da ponta */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-2 px-4 py-2 bg-slate-900/90 backdrop-blur-xl border border-white/15 text-white text-xs font-semibold rounded-full whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.25)] max-w-[300px] overflow-hidden text-ellipsis uppercase tracking-wider animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {addressLabel || "Carregando..."}
                    </div>
                </div>
            )}

            {!readOnly && isMapLoaded && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-xl px-5 py-3 rounded-full border border-white/15 text-white/95 text-[13px] font-semibold shadow-[0_10px_40px_rgba(0,0,0,0.3)] pointer-events-none flex items-center gap-2.5" style={{ zIndex: 20 }}>
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    Arraste o mapa para posicionar no centro exato
                </div>
            )}
        </div>
    );
}
