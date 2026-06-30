// ── VIAGG-TX8™ — AIMapService — IA do mapa ────────────────────────────────────

import { viaggAI } from "@/lib/viaggAI";
import { geocodeAddress } from "./GeoLocationService";
import type { MapAddress, AIMapInsight, LatLng } from "./types";

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

// ── Mock de motoristas próximos ───────────────────────────────────────────────

export function getMockDriversNearby(center: LatLng, count = 8) {
  const types = ["mototaxi", "motoboy", "motorista", "taxi"] as const;
  const names = ["Carlos S.", "Maria R.", "João P.", "Ana K.", "Pedro L.", "Lucas M.", "Fernanda O.", "Bruno T.", "Camila V.", "Diego A."];
  const vehicles = ["Honda CG 160", "Yamaha Factor", "VW Gol", "Fiat Argo", "HB20", "Uno", "Fox"];

  return Array.from({ length: count }, (_, i) => ({
    id:         `driver-${i}`,
    name:       names[i % names.length],
    type:       types[i % types.length],
    latLng:     {
      lat: center.lat + (Math.random() - 0.5) * 0.02,
      lng: center.lng + (Math.random() - 0.5) * 0.02,
    },
    heading:    Math.random() * 360,
    rating:     3.5 + Math.random() * 1.5,
    trips:      50  + Math.floor(Math.random() * 500),
    distanceKm: 0.3 + Math.random() * 3,
    etaMin:     2   + Math.floor(Math.random() * 10),
    vehicle:    vehicles[i % vehicles.length],
    plate:      `ABC${1000 + i}`,
    isOnline:   true,
  }));
}
