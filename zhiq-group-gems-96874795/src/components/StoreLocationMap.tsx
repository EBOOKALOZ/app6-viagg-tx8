import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertCircle, MapPin } from "lucide-react";

interface StoreLocationMapProps {
    initialLat?: number;
    initialLng?: number;
    addressLabel?: string;
    onLocationSelect: (lat: number, lng: number) => void;
    className?: string;
    readOnly?: boolean;
}

export function StoreLocationMap({
    initialLat,
    initialLng,
    onLocationSelect,
    addressLabel,
    className = "",
    readOnly = false,
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
                pitch: 45,
                bearing: -17.6,
                antialias: true,
                pixelRatio: Math.min(window.devicePixelRatio, 2), // HiDPI crispness
                optimizeForTerrain: true,
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
                    map.setTerrain({ source: "mapbox-dem", exaggeration: 1.1 });
                }

                // Efeito Fog atmosférico e iluminação noturna superior
                map.setFog({
                    color: "rgb(225, 232, 240)",
                    "high-color": "rgb(160, 185, 215)",
                    "horizon-blend": 0.08,
                    "space-color": "rgb(180, 200, 230)",
                    "star-intensity": 0.0,
                });
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
            } else if (initialLat !== undefined && initialLng !== undefined) {
                // Modo Apenas-Leitura ou Estático: Crio e colo um marcador nativo e trava lá
                const el = document.createElement("div");
                el.innerHTML = `
                  <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);border:3px solid #fff;box-shadow:0 8px 32px rgba(16,185,129,0.4);display:flex;align-items:center;justify-content:center;position:relative;z-index:2;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                  </div>
                  <div style="width:0;height:0;margin-top:-2px;margin-left:auto;margin-right:auto;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid #fff;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.2)); z-index: 2;"></div>
                `;
                el.style.display = "flex";
                el.style.flexDirection = "column";
                el.style.alignItems = "center";

                staticMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: false })
                    .setLngLat([initialLng, initialLat])
                    .addTo(map);
            }

            return () => {
                map.remove();
                mapRef.current = null;
                staticMarkerRef.current = null; // Clean up static marker
                isInitializing.current = false;
            };
        } catch (err) {
            console.error("Erro ao carregar Mapbox:", err);
            setMapboxError("Falha ao inicializar o mapa. Verifique a conexão.");
            isInitializing.current = false;
        }
    }, [MAPBOX_TOKEN, readOnly]); // Adicionado readOnly como dependência para recriar o mapa com o modo correto

    // Mover tela se a coordenada for atualizada via Buscar ou Colar Coordenada externalmente
    useEffect(() => {
        if (!mapRef.current || !isMapLoaded || initialLat === undefined || initialLng === undefined) return;

        const currentCenter = mapRef.current.getCenter();
        const distApprox = Math.abs(currentCenter.lat - initialLat) + Math.abs(currentCenter.lng - initialLng);

        if (distApprox > 0.0001) {
            const numLng = Number(initialLng);
            const numLat = Number(initialLat);
            mapRef.current.flyTo({
                center: [numLng, numLat],
                zoom: Math.max(mapRef.current.getZoom(), 15),
                essential: true
            });
            // If in readOnly mode, update the static marker's position
            if (readOnly && staticMarkerRef.current) {
                staticMarkerRef.current.setLngLat([numLng, numLat]);
            }
        }
    }, [initialLat, initialLng, isMapLoaded, readOnly]);

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

            {/* Marcador Central Fixo Estilo Uber/Ultra Moderno */}
            {!readOnly && isMapLoaded && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45px] pointer-events-none flex flex-col items-center justify-center" style={{ zIndex: 20 }}>
                    {/* Ring ping em volta */}
                    <div className="absolute top-[8px] w-12 h-12 rounded-full border-2 border-emerald-500/50 animate-ping" style={{ zIndex: 1 }}></div>

                    {/* Corpo principal do marcador */}
                    <div className="w-[44px] h-[44px] rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 border-4 border-white shadow-[0_8px_32px_rgba(16,185,129,0.5)] flex items-center justify-center relative z-10 transition-transform duration-200">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    </div>
                    {/* Ponta da setinha para baixo */}
                    <div className="w-0 h-0 -mt-[2px] border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-white drop-shadow-md z-10"></div>

                    {/* Tooltip ultra moderno exibindo o endereço dinâmico */}
                    <div className="mt-2 px-4 py-2 bg-slate-900/90 backdrop-blur-xl border border-white/15 text-white text-xs font-semibold rounded-full whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.25)] max-w-[300px] overflow-hidden text-ellipsis uppercase tracking-wider animate-in fade-in slide-in-from-bottom-2 duration-300">
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
