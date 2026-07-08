// ── VIAGG-TX8™ — ViaggMap — componente de mapa inteligente ───────────────────
// Usa react-leaflet + OpenStreetMap (gratuito, sem API key)
// A camada de abstração permite trocar para Google Maps / Mapbox

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline,
  useMap, CircleMarker, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, Locate } from "lucide-react";
import type { LatLng, DriverMarker, RouteOption } from "@/lib/map/types";

// Fix default icon bug do leaflet + Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Ícone de motorista colorido ───────────────────────────────────────────────

const DRIVER_TYPE_COLOR: Record<string, string> = {
  mototaxi:  "#FF6A00",
  motoboy:   "#EF4444",
  motorista: "#F59E0B",
  taxi:      "#22C55E",
};

const DRIVER_TYPE_EMOJI: Record<string, string> = {
  mototaxi:  "🛵",
  motoboy:   "🏍️",
  motorista: "🚗",
  taxi:      "🚖",
};

function makeDriverIcon(type: string) {
  const color = DRIVER_TYPE_COLOR[type] ?? "#6B7280";
  const emoji = DRIVER_TYPE_EMOJI[type] ?? "🚗";
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};
      width:28px;height:28px;
      border-radius:50%;
      border:2px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    ">${emoji}</div>`,
    iconSize:   [28, 28],
    iconAnchor: [14, 14],
  });
}

function makeOriginIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:16px;height:16px;
      border-radius:50%;
      background:#22C55E;
      border:3px solid white;
      box-shadow:0 0 0 3px #22C55E40;
    "></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

function makeDestIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:16px;height:16px;
      border-radius:50%;
      background:#FF6A00;
      border:3px solid white;
      box-shadow:0 0 0 3px #FF6A0040;
    "></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

// ── Fly to helper ─────────────────────────────────────────────────────────────

function FlyToCenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], 15, { duration: 1.2 });
  }, [center, map]);
  return null;
}

// Enquadra origem + destino (+ rota) para que a linha SEMPRE conecte na tela.
function FitToRoute({ origin, destination, route }: {
  origin?: LatLng; destination?: LatLng; route?: RouteOption;
}) {
  const map = useMap();
  useEffect(() => {
    if (!origin || !destination) return;
    const pts: [number, number][] = [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
      ...((route?.waypoints ?? []).map((p) => [p.lat, p.lng] as [number, number])),
    ];
    try {
      map.fitBounds(pts as any, { padding: [70, 70], maxZoom: 16, animate: true, duration: 0.9 });
    } catch { /* ignore */ }
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng, route, map]);
  return null;
}

// ── Click captura destino ─────────────────────────────────────────────────────

function MapClickHandler({ onMapClick }: { onMapClick?: (ll: LatLng) => void }) {
  useMapEvents({
    click: (e) => onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ViaggMapProps {
  center:        LatLng;
  origin?:       LatLng;
  destination?:  LatLng;
  drivers?:      DriverMarker[];
  route?:        RouteOption;
  onMapClick?:   (ll: LatLng) => void;
  className?:    string;
  showDrivers?:  boolean;
  interactive?:  boolean;
  zoom?:         number;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ViaggMap({
  center,
  origin,
  destination,
  drivers = [],
  route,
  onMapClick,
  className = "",
  showDrivers = true,
  interactive = true,
  zoom = 14,
}: ViaggMapProps) {
  const mapRef = useRef<L.Map | null>(null);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        ref={mapRef}
        className="w-full h-full"
        style={{ background: "#e8e0d8" }}
      >
        {/* Tile claro (CartoDB Voyager — similar ao Google Maps) */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
          maxZoom={19}
        />

        {origin && destination
          ? <FitToRoute origin={origin} destination={destination} route={route} />
          : <FlyToCenter center={center} />}
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {/* Rota selecionada */}
        {route && route.waypoints.length > 1 && (
          <Polyline
            positions={route.waypoints.map((p) => [p.lat, p.lng])}
            color={route.color}
            weight={4}
            opacity={0.85}
            dashArray={route.type === "moto" ? "8 4" : undefined}
          />
        )}

        {/* Marcador de origem */}
        {origin && (
          <Marker position={[origin.lat, origin.lng]} icon={makeOriginIcon()}>
            <Popup className="text-xs">📍 Origem</Popup>
          </Marker>
        )}

        {/* Marcador de destino */}
        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={makeDestIcon()}>
            <Popup className="text-xs">🎯 Destino</Popup>
          </Marker>
        )}

        {/* Motoristas */}
        {showDrivers && drivers.map((driver) => (
          <Marker
            key={driver.id}
            position={[driver.latLng.lat, driver.latLng.lng]}
            icon={makeDriverIcon(driver.type)}
          >
            <Popup>
              <div className="text-xs min-w-[140px]">
                <div className="font-bold">{driver.name}</div>
                <div className="text-gray-500 mt-0.5">{driver.vehicle} · {driver.plate}</div>
                <div className="flex gap-3 mt-1">
                  <span>⭐ {driver.rating.toFixed(1)}</span>
                  <span>🏁 {driver.trips} corridas</span>
                </div>
                <div className="flex gap-3 mt-0.5">
                  <span>📍 {driver.distanceKm.toFixed(1)}km</span>
                  <span>⏱ {driver.etaMin}min</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Logo overlay */}
      <div className="absolute top-3 left-3 z-[1000] bg-black/60 backdrop-blur rounded-xl px-2.5 py-1.5 border border-white/10">
        <span className="text-[11px] font-black text-[#FF6A00] tracking-tight">VIAGG</span>
        <span className="text-[11px] font-black text-white tracking-tight ml-0.5">MAP</span>
      </div>

      {/* Atributos */}
      <style>{`
        .leaflet-control-attribution { display: none; }
        .leaflet-popup-content-wrapper { background: #ffffff; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; color: #111827; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
        .leaflet-popup-tip { background: #ffffff; }
        .leaflet-popup-content { margin: 10px 14px; }
      `}</style>
    </div>
  );
}

// ── Botão "Minha localização" flutuante ───────────────────────────────────────

export function LocateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-20 right-3 z-[1001] w-10 h-10 bg-[#1B1F24] border border-white/20 rounded-full shadow-lg flex items-center justify-center hover:bg-[#2A3038] active:scale-95 transition-all"
      title="Minha localização"
    >
      <Locate className="w-5 h-5 text-[#FF6A00]" />
    </button>
  );
}
