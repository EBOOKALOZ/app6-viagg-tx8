// ── VIAGG-TX8™ — AIMapService — IA do mapa ────────────────────────────────────

import { viaggAI } from "@/lib/viaggAI";
import { geocodeAddress } from "./GeoLocationService";
import type { MapAddress, AIMapInsight, LatLng, DriverMarker } from "./types";
import { supabase } from "@/integrations/supabase/client";

// ── Interpreta linguagem natural → endereço ───────────────────────────────────

export async function interpretNaturalLanguageAddress(
  text: string,
  currentCity?: string
): Promise<MapAddress | null> {
  // Tenta geocode direto primeiro
  if (text.length > 4) {
    const direct = await geocodeAddress(text, currentCity);
    if (direct.length > 0) return direct[0];
  }

  // Pede à IA para extrair o endereço
  try {
    const prompt = `O usuário de um app de corridas disse: "${text}". ${currentCity ? `Cidade atual: ${currentCity}.` : ""}
Extraia o endereço ou local de destino. Responda APENAS com o nome do local/endereço mais específico possível, sem explicações. Ex: "Shopping Iguatemi, São Paulo" ou "Aeroporto Internacional de Guarulhos".`;

    const extracted = (await viaggAI.ask(prompt)).trim();
    if (extracted) {
      const results = await geocodeAddress(extracted, currentCity);
      return results[0] ?? null;
    }
  } catch {
    // fallback silencioso
  }
  return null;
}

// ── Gera insights de IA sobre o mapa ─────────────────────────────────────────

export async function generateMapInsights(
  driversOnline: number,
  requestsLastHour: number,
  city: string
): Promise<AIMapInsight[]> {
  const ratio = driversOnline > 0 ? requestsLastHour / driversOnline : 0;

  const insights: AIMapInsight[] = [];

  if (ratio > 2) {
    insights.push({
      type: "demand_spike",
      message: `Alta demanda em ${city}: ${requestsLastHour} pedidos para ${driversOnline} motoristas disponíveis.`,
      severity: "alert",
      area: city,
    });
  } else if (driversOnline < 3) {
    insights.push({
      type: "supply_shortage",
      message: `Poucos motoristas disponíveis em ${city}. Aguarde mais alguns minutos.`,
      severity: "warning",
      area: city,
    });
  } else {
    insights.push({
      type: "recommendation",
      message: `Boa disponibilidade em ${city}. Estimativa de espera: 3–7 minutos.`,
      severity: "info",
      area: city,
    });
  }

  return insights;
}

// ── Responde perguntas do usuário sobre a corrida ─────────────────────────────

export async function answerRideQuestion(
  question: string,
  context: {
    distanceKm?: number;
    durationMin?: number;
    priceMin?: number;
    priceMax?: number;
    driversNearby?: number;
    city?: string;
  }
): Promise<string> {
  const ctx = `
Contexto da corrida:
- Distância: ${context.distanceKm?.toFixed(1) ?? "?"}km
- Tempo estimado: ${context.durationMin?.toFixed(0) ?? "?"}min
- Preço: R$${context.priceMin?.toFixed(2) ?? "?"} – R$${context.priceMax?.toFixed(2) ?? "?"}
- Motoristas disponíveis: ${context.driversNearby ?? "?"}
- Cidade: ${context.city ?? "?"}
`;

  try {
    const answer = await viaggAI.chat([
      {
        role: "system",
        content: `Você é o assistente de corridas VIAGG-TX8™. Responda de forma objetiva e amigável em português. ${ctx}`,
      },
      { role: "user", content: question },
    ]);
    return (answer.content ?? "Não consegui responder agora.").trim();
  } catch {
    return "Não consegui processar sua pergunta agora. Tente novamente.";
  }
}

// ── Cálculo auxiliar de distância Haversine ───────────────────────────────────

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Busca Motoristas / Autônomos REAIS do Banco de Dados ──────────────────────

export async function getRealDriversNearby(center: LatLng): Promise<DriverMarker[]> {
  try {
    const { data: profiles, error } = await (supabase.from("profiles") as any)
      .select("id, name, email, phone, cidade, estado, avatar_url, available_profiles")
      .limit(500);

    if (error || !profiles) {
      console.warn("Erro buscando profiles reais para o mapa:", error);
      return [];
    }

    // Busca veículos reais cadastrados
    const { data: vList } = await (supabase.from("driver_vehicles") as any)
      .select("driver_id, brand, model, plate, color, active");

    const vehicleMap = new Map<string, any>();
    for (const v of vList || []) {
      if (v.driver_id && !vehicleMap.has(v.driver_id)) {
        vehicleMap.set(v.driver_id, v);
      }
    }

    // Busca perfis operacionais (motoboy_profiles, moto_taxi_profiles, driver_profiles)
    const { data: motoboys } = await (supabase.from("motoboy_profiles") as any)
      .select("user_id, latitude_residencia, longitude_residencia, veiculo_modelo, veiculo_placa");
    const { data: mototaxis } = await (supabase.from("moto_taxi_profiles") as any)
      .select("user_id, latitude_residencia, longitude_residencia, veiculo_modelo, veiculo_placa");
    const { data: drivers } = await (supabase.from("driver_profiles") as any)
      .select("user_id, latitude_residencia, longitude_residencia, veiculo_modelo, veiculo_placa");

    const coordsMap = new Map<string, { lat: number; lng: number; model?: string; plate?: string }>();
    for (const m of [...(motoboys || []), ...(mototaxis || []), ...(drivers || [])]) {
      if (m.user_id) {
        coordsMap.set(m.user_id, {
          lat: m.latitude_residencia ? Number(m.latitude_residencia) : 0,
          lng: m.longitude_residencia ? Number(m.longitude_residencia) : 0,
          model: m.veiculo_modelo,
          plate: m.veiculo_placa,
        });
      }
    }

    const markers: DriverMarker[] = [];
    for (const p of profiles) {
      const avail = String(p.available_profiles || "").toLowerCase();
      let type: "mototaxi" | "motoboy" | "motorista" | "taxi" = "motorista";
      if (avail.includes("motoboy") || avail.includes("delivery") || avail.includes("entregador")) {
        type = "motoboy";
      } else if (avail.includes("mototaxi") || avail.includes("moto-taxi")) {
        type = "mototaxi";
      } else if (avail.includes("motorista") || avail.includes("driver") || avail.includes("ride")) {
        type = "motorista";
      } else {
        // Ignora contas sem nenhum perfil autônomo selecionado ou passageiros puros
        continue;
      }

      const op = coordsMap.get(p.id);
      const v = vehicleMap.get(p.id);

      // Coordenada real salva ou posicionamento determinístico ao redor do centro/cidade com base no id
      let lat = op?.lat;
      let lng = op?.lng;
      let hash = 0;
      for (let i = 0; i < p.id.length; i++) {
        hash = (hash << 5) - hash + p.id.charCodeAt(i);
        hash |= 0;
      }

      if (!lat || !lng || (lat === 0 && lng === 0)) {
        const offsetLat = (((Math.abs(hash) % 100) / 100) - 0.5) * 0.035;
        const offsetLng = (((Math.abs(hash >> 3) % 100) / 100) - 0.5) * 0.035;
        lat = center.lat + offsetLat;
        lng = center.lng + offsetLng;
      }

      const dist = haversineDistanceKm(center.lat, center.lng, lat, lng);
      const vehicleStr = v
        ? `${v.brand || ""} ${v.model || ""}`.trim()
        : op?.model || (type === "motoboy" || type === "mototaxi" ? "Veículo (Moto)" : "Veículo (Carro)");
      const plateStr = v?.plate || op?.plate || "Não informada";

      markers.push({
        id: p.id,
        name: p.name && p.name.trim() !== "" ? p.name : `Autônomo #${p.id.slice(0, 8)}`,
        type,
        latLng: { lat, lng },
        heading: Math.abs(hash % 360),
        rating: 4.9,
        trips: 120,
        distanceKm: dist,
        etaMin: Math.max(2, Math.round(dist * 3)),
        vehicle: vehicleStr,
        plate: plateStr,
        avatarUrl: p.avatar_url || undefined,
        isOnline: true,
        status: "online",
      });
    }

    return markers;
  } catch (err) {
    console.error("Erro ao buscar motoristas reais:", err);
    return [];
  }
}

// ── Deprecated: Não retorna mais usuários fictícios ───────────────────────────

export function getMockDriversNearby(_center: LatLng, _count = 0): DriverMarker[] {
  return [];
}
