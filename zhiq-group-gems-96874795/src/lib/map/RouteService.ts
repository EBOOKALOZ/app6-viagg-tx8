// ── VIAGG-TX8™ — RouteService — cálculo de rotas ─────────────────────────────

import type { LatLng, RouteOption, RouteType, PricePrediction } from "./types";
import { haversineKm } from "./GeoLocationService";

// Usa OSRM público (OpenStreetMap Routing Machine) — gratuito
const OSRM_BASE = "https://router.project-osrm.org/route/v1";

interface OSRMRoute {
  distance: number; // metros
  duration: number; // segundos
  geometry: { coordinates: [number, number][] };
}

async function fetchOSRMRoute(
  origin: LatLng,
  dest: LatLng,
  profile: "car" | "bike"
): Promise<OSRMRoute | null> {
  try {
    const url = `${OSRM_BASE}/${profile}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.routes?.[0] ?? null;
  } catch {
    return null;
  }
}

// Converte coordenadas GeoJSON → LatLng[]
function geoJsonToLatLng(coords: [number, number][]): LatLng[] {
  return coords.map(([lng, lat]) => ({ lat, lng }));
}

// ── Gera todas as opções de rota ──────────────────────────────────────────────

export async function getRouteOptions(
  origin: LatLng,
  destination: LatLng
): Promise<RouteOption[]> {
  const [carRoute, bikeRoute] = await Promise.all([
    fetchOSRMRoute(origin, destination, "car"),
    fetchOSRMRoute(origin, destination, "bike"),
  ]);

  const distKm    = haversineKm(origin, destination);
  const estCarMin = carRoute  ? carRoute.duration  / 60 : distKm * 2.5;
  const estKm     = carRoute  ? carRoute.distance  / 1000 : distKm * 1.15;
  const estBikeMin= bikeRoute ? bikeRoute.duration / 60 : distKm * 3.5;
  const carWp     = carRoute  ? geoJsonToLatLng(carRoute.geometry.coordinates)  : [origin, destination];
  const bikeWp    = bikeRoute ? geoJsonToLatLng(bikeRoute.geometry.coordinates) : [origin, destination];

  const ROUTE_DEFS: Array<Omit<RouteOption, "waypoints">> = [
    { type: "fastest",      label: "⚡ Mais Rápida",       distanceKm: estKm,          durationMin: estCarMin,      tollCost: 4.5,  trafficLevel: "moderate", color: "#FF6A00" },
    { type: "cheapest",     label: "💰 Mais Econômica",    distanceKm: estKm * 0.95,   durationMin: estCarMin * 1.2, tollCost: 0,    trafficLevel: "free",     color: "#22C55E" },
    { type: "less_traffic", label: "🟢 Menos Trânsito",    distanceKm: estKm * 1.1,    durationMin: estCarMin * 0.9, tollCost: 2.0,  trafficLevel: "free",     color: "#3B82F6" },
    { type: "safest",       label: "🛡️ Mais Segura",       distanceKm: estKm * 1.05,   durationMin: estCarMin * 1.1, tollCost: 3.0,  trafficLevel: "moderate", color: "#8B5CF6" },
    { type: "no_toll",      label: "🚫 Sem Pedágio",       distanceKm: estKm * 1.08,   durationMin: estCarMin * 1.3, tollCost: 0,    trafficLevel: "moderate", color: "#F59E0B" },
    { type: "moto",         label: "🏍️ Rota Moto",         distanceKm: estKm * 0.9,    durationMin: estBikeMin,      tollCost: 0,    trafficLevel: "free",     color: "#EF4444" },
  ];

  return ROUTE_DEFS.map((def) => ({
    ...def,
    waypoints: def.type === "moto" ? bikeWp : carWp,
  }));
}

// ── Previsão de preço ─────────────────────────────────────────────────────────

export function estimatePrice(
  distKm: number,
  durationMin: number,
  serviceType: string
): PricePrediction {
  const BASE_RATES: Record<string, { base: number; perKm: number; perMin: number }> = {
    mototaxi:  { base: 5.0,  perKm: 1.8,  perMin: 0.3 },
    motorista: { base: 7.0,  perKm: 2.5,  perMin: 0.4 },
    taxi:      { base: 8.0,  perKm: 2.8,  perMin: 0.5 },
    motoboy:   { base: 6.0,  perKm: 2.0,  perMin: 0.3 },
    entrega:   { base: 8.0,  perKm: 2.2,  perMin: 0.35 },
    frete:     { base: 15.0, perKm: 3.5,  perMin: 0.5 },
  };

  const rate = BASE_RATES[serviceType] ?? BASE_RATES.motorista;
  const base = rate.base + distKm * rate.perKm + durationMin * rate.perMin;

  const hour = new Date().getHours();
  const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
  const surgeMultiplier = isPeak ? 1.35 : 1.0;
  const avg  = base * surgeMultiplier;

  return {
    min:             Math.max(5, avg * 0.85),
    avg,
    max:             avg * 1.25,
    isDynamic:       isPeak,
    surgeMultiplier,
    discount:        Math.random() < 0.2 ? 5 : undefined, // 20% chance de desconto
    cashback:        undefined,
    estimatedKm:     distKm,
    estimatedMin:    durationMin,
  };
}
