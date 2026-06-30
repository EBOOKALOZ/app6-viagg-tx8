// ── VIAGG-TX8™ — GeoLocationService — localização inteligente ────────────────

import type { LatLng, MapAddress } from "./types";

// Usa Nominatim (OpenStreetMap) — gratuito, sem API key
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

function nominatimHeaders(): HeadersInit {
  return { "Accept-Language": "pt-BR,pt;q=0.9", "User-Agent": "VIAGG-TX8/1.0" };
}

// ── Geocode reverso: coordenadas → endereço ───────────────────────────────────

export async function reverseGeocode(latLng: LatLng): Promise<MapAddress> {
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${latLng.lat}&lon=${latLng.lng}&addressdetails=1`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) throw new Error("Geocodificação reversa falhou");
  const data = await res.json();
  const a = data.address ?? {};

  return {
    street:       a.road ?? a.pedestrian ?? a.path,
    number:       a.house_number,
    neighborhood: a.suburb ?? a.neighbourhood ?? a.quarter,
    city:         a.city ?? a.town ?? a.village ?? a.municipality,
    state:        a.state,
    zipCode:      a.postcode,
    country:      a.country,
    formattedAddress: data.display_name ?? "",
    latLng,
  };
}

// ── Geocode direto: texto → coordenadas + endereço ────────────────────────────

export async function geocodeAddress(text: string, city?: string): Promise<MapAddress[]> {
  const q = city ? `${text}, ${city}` : text;
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&countrycodes=BR`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) throw new Error("Geocodificação falhou");
  const results = await res.json();

  return results.map((r: any) => {
    const a = r.address ?? {};
    return {
      street:       a.road ?? a.pedestrian,
      number:       a.house_number,
      neighborhood: a.suburb ?? a.neighbourhood,
      city:         a.city ?? a.town ?? a.village,
      state:        a.state,
      zipCode:      a.postcode,
      country:      a.country,
      formattedAddress: r.display_name ?? "",
      latLng: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
    } as MapAddress;
  });
}

// ── Autocomplete de busca ─────────────────────────────────────────────────────

export async function autocomplete(query: string): Promise<MapAddress[]> {
  if (query.length < 3) return [];
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=6&countrycodes=BR`;
  const res = await fetch(url, { headers: nominatimHeaders() });
  if (!res.ok) return [];
  const results = await res.json();
  return results.map((r: any) => ({
    formattedAddress: r.display_name,
    latLng: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
  } as MapAddress));
}

// ── Obter localização atual do dispositivo ────────────────────────────────────

export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

// ── Calcular distância entre dois pontos (km) ─────────────────────────────────

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sin = Math.sin;
  const cos = Math.cos;
  const x =
    sin(dLat / 2) * sin(dLat / 2) +
    cos((a.lat * Math.PI) / 180) *
      cos((b.lat * Math.PI) / 180) *
      sin(dLng / 2) *
      sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
