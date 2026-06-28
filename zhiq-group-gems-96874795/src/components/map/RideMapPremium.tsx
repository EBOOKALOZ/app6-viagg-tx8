import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2 } from "lucide-react";

interface RideMapPremiumProps {
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  onOriginChange?: (lat: number, lng: number) => void;
  onDestChange?: (lat: number, lng: number) => void;
  className?: string;
  height?: number;
}

type PlaceMode = "origin" | "destination" | "done";

function makePinEl(label: string, color: string, emoji: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:grab;user-select:none;";
  el.innerHTML = `
    <div style="
      background:${color};color:#fff;
      padding:3px 10px;border-radius:99px;
      font-size:11px;font-weight:800;white-space:nowrap;
      box-shadow:0 2px 10px rgba(0,0,0,0.28);margin-bottom:5px;letter-spacing:0.03em;
    ">${emoji} ${label}</div>
    <div style="
      width:26px;height:26px;border-radius:50%;
      background:${color};border:3px solid #fff;
      box-shadow:0 4px 14px rgba(0,0,0,0.32);
    "></div>
    <div style="
      width:0;height:0;
      border-left:7px solid transparent;border-right:7px solid transparent;
      border-top:9px solid ${color};margin-top:-1px;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,0.22));
    "></div>
  `;
  return el;
}

export function RideMapPremium({
  originLat, originLng, destLat, destLng,
  onOriginChange, onDestChange,
  className = "",
  height = 300,
}: RideMapPremiumProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const isInitializing = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Determines which pin the next map click will place
  const placeModeRef = useRef<PlaceMode>("origin");
  const [placeMode, setPlaceMode] = useState<PlaceMode>("origin");

  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

  // Keep placeMode ref in sync with state (used inside map click closure)
  useEffect(() => { placeModeRef.current = placeMode; }, [placeMode]);

  // Derive mode from current pins whenever they change externally
  useEffect(() => {
    if (originLat && originLng && destLat && destLng) {
      setPlaceMode("done");
    } else if (originLat && originLng) {
      setPlaceMode("destination");
    } else {
      setPlaceMode("origin");
    }
  }, [originLat, originLng, destLat, destLng]);

  // ── Init map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current || isInitializing.current || !MAPBOX_TOKEN) return;
    isInitializing.current = true;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/navigation-day-v1",
      center: [originLng ?? -53.2, originLat ?? -10.33],
      zoom: originLat ? 14 : 4,
      pitch: 50,
      bearing: -12,
      antialias: true,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 3),
      fadeDuration: 0,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      setIsLoaded(true);
      map.resize();

      // 3D buildings
      const layers = map.getStyle().layers;
      const labelLayerId = layers?.find(
        (l: any) => l.type === "symbol" && l.layout?.["text-field"]
      )?.id;
      if (!map.getLayer("3d-buildings")) {
        map.addLayer({
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": "#c8d4df",
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "height"]],
            "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.05, ["get", "min_height"]],
            "fill-extrusion-opacity": 0.6,
            "fill-extrusion-vertical-gradient": true,
          },
        }, labelLayerId);
      }

      map.setFog({
        color: "rgb(218, 228, 240)",
        "high-color": "rgb(155, 180, 215)",
        "horizon-blend": 0.07,
        "space-color": "rgb(170, 195, 230)",
        "star-intensity": 0.0,
      });

      // Route source + layers
      map.addSource("ride-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "ride-route-glow",
        type: "line", source: "ride-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FF6A00", "line-width": 14, "line-opacity": 0.18, "line-blur": 8 },
      });
      map.addLayer({
        id: "ride-route-shadow",
        type: "line", source: "ride-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#cc5500", "line-width": 8, "line-opacity": 0.35 },
      });
      map.addLayer({
        id: "ride-route-main",
        type: "line", source: "ride-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FF6A00", "line-width": 5, "line-opacity": 1 },
      });

      // Click to place pins
      map.on("click", (e) => {
        const { lat, lng } = e.lngLat;
        const mode = placeModeRef.current;
        if (mode === "origin") {
          onOriginChange?.(lat, lng);
          setPlaceMode("destination");
        } else if (mode === "destination") {
          onDestChange?.(lat, lng);
          setPlaceMode("done");
        }
        // mode === "done" → clicks ignored (user must drag pins to adjust)
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
      destMarkerRef.current = null;
      isInitializing.current = false;
      setIsLoaded(false);
    };
  }, [MAPBOX_TOKEN]);

  // ── Origin marker ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    if (!originLat || !originLng) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }
    if (originMarkerRef.current) {
      originMarkerRef.current.setLngLat([originLng, originLat]);
    } else {
      const el = makePinEl("Coleta", "#10b981", "📦");
      const m = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: true })
        .setLngLat([originLng, originLat])
        .addTo(map);
      m.on("dragend", () => { const { lat, lng } = m.getLngLat(); onOriginChange?.(lat, lng); });
      originMarkerRef.current = m;
    }
    if (!destLat || !destLng) {
      map.flyTo({ center: [originLng, originLat], zoom: 15, duration: 800, pitch: 50 });
    }
  }, [originLat, originLng, isLoaded]);

  // ── Dest marker ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    if (!destLat || !destLng) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }
    if (destMarkerRef.current) {
      destMarkerRef.current.setLngLat([destLng, destLat]);
    } else {
      const el = makePinEl("Entrega", "#ef4444", "🏁");
      const m = new mapboxgl.Marker({ element: el, anchor: "bottom", draggable: true })
        .setLngLat([destLng, destLat])
        .addTo(map);
      m.on("dragend", () => { const { lat, lng } = m.getLngLat(); onDestChange?.(lat, lng); });
      destMarkerRef.current = m;
    }
  }, [destLat, destLng, isLoaded]);

  // ── Route & fit-bounds ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    const src = map.getSource("ride-route") as mapboxgl.GeoJSONSource | undefined;
    if (!originLat || !originLng || !destLat || !destLng) {
      src?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds()
      .extend([originLng, originLat])
      .extend([destLng, destLat]);
    map.fitBounds(bounds, { padding: { top: 90, bottom: 70, left: 60, right: 60 }, duration: 900, maxZoom: 15 });

    const token = MAPBOX_TOKEN;
    fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&overview=full&steps=false&access_token=${token}`
    )
      .then(r => r.json())
      .then(data => {
        let coords: [number, number][] = data.routes?.[0]?.geometry?.coordinates;
        if (coords && coords.length > 1) {
          // Adiciona os pinos como pontos extras sem remover nenhum ponto da rota
          coords = [[originLng, originLat], ...coords, [destLng, destLat]];
          src?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
        } else {
          throw new Error("no route");
        }
      })
      .catch(() => {
        // fallback OSRM
        fetch(`https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`)
          .then(r => r.json())
          .then(data => {
            let coords: [number, number][] = data.routes?.[0]?.geometry?.coordinates
              ?? [[originLng, originLat], [destLng, destLat]];
            coords = [[originLng, originLat], ...coords, [destLng, destLat]];
            src?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
          })
          .catch(() => {
            src?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[originLng, originLat], [destLng, destLat]] } });
          });
      });
  }, [originLat, originLng, destLat, destLng, isLoaded]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-zinc-100 rounded-2xl ${className}`} style={{ height }}>
        <p className="text-xs text-zinc-400">Token Mapbox não configurado</p>
      </div>
    );
  }

  // Hint bar colors & text
  const hint =
    placeMode === "origin"
      ? { bg: "#10b981", text: "📦 Toque no mapa para marcar a COLETA" }
      : placeMode === "destination"
      ? { bg: "#ef4444", text: "🏁 Agora toque para marcar a ENTREGA" }
      : { bg: "#374151", text: "✅ Arraste os pinos para ajustar a posição" };

  return (
    <div className={`relative rounded-2xl overflow-hidden border-2 border-green-200 shadow-md ${className}`} style={{ height }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Hint bar at top */}
      {isLoaded && (
        <div
          style={{ background: hint.bg, zIndex: 10 }}
          className="absolute top-0 left-0 right-0 py-1.5 px-3 text-white text-[11px] font-black text-center tracking-wide pointer-events-none transition-colors duration-300"
        >
          {hint.text}
        </div>
      )}

      {/* Reset button when both pins placed */}
      {isLoaded && placeMode === "done" && (
        <button
          onClick={() => {
            onOriginChange?.(0, 0);
            onDestChange?.(0, 0);
            setPlaceMode("origin");
          }}
          style={{ zIndex: 10 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm text-zinc-700 text-[10px] font-bold px-3 py-1.5 rounded-full shadow-md border border-zinc-200 hover:bg-white transition-all"
        >
          🔄 Remarcar pontos
        </button>
      )}

      {!isLoaded && (
        <div className="absolute inset-0 bg-zinc-100 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          <p className="text-xs text-zinc-500 font-semibold">Carregando mapa premium…</p>
        </div>
      )}
    </div>
  );
}
