/**
 * Cálculo de valor de entrega para motoboy baseado em distância
 * 
 * Regras:
 * - Valor mínimo garantido: R$ 8,00 líquidos
 * - Valor base até 2 km: R$ 8,00
 * - Km adicional: R$ 1,50 por km
 * - Comissão da plataforma é interna, não afeta o ganho do motoboy
 */

export const DELIVERY_PRICING = {
  STANDARD_BASE: 9.00,    // R$ 9,00 taxa base fixa
  EXPRESS_BASE: 12.00,    // R$ 12,00 taxa base fixa
  PER_KM_RATE: 1.60,      // R$ 1,60 por km (distância real via Directions API)
  MIN_VALUE: 9.00,        // Mínimo garantido (taxa base)
  ESTIMATED_SPEED_KPH: 25, // Velocidade média para cálculo de tempo (km/h)
};

/**
 * Calcula a distância em km entre dois pontos usando fórmula de Haversine
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Arredonda para 1 casa decimal
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calcula o valor total da entrega baseado na distância real
 * Fórmula oficial: valor_total = 9 + (distancia_km × 1.60)
 */
export function calculateDeliveryValue(distanceKm: number, serviceLevel: 'standard' | 'express' = 'standard'): number {
  const { STANDARD_BASE, EXPRESS_BASE, PER_KM_RATE, MIN_VALUE } = DELIVERY_PRICING;

  const BASE_VALUE = serviceLevel === 'express' ? EXPRESS_BASE : STANDARD_BASE;

  // Se distância for 0 ou não disponível, retorna valor base
  if (!distanceKm || distanceKm <= 0) {
    return BASE_VALUE;
  }

  // Fórmula oficial: BASE + (distância × taxa por km)
  const calculatedValue = BASE_VALUE + (distanceKm * PER_KM_RATE);

  // Garantir valor mínimo
  const finalValue = Math.max(calculatedValue, MIN_VALUE);

  // Arredondar para 2 casas decimais
  return Math.round(finalValue * 100) / 100;
}

/**
 * @deprecated Use calculateDeliveryValue para cálculo oficial
 * Mantido para compatibilidade - redireciona para nova função
 */
export function calculateMotoboyValue(distanceKm: number): number {
  return calculateDeliveryValue(distanceKm);
}

/**
 * Calcula tempo estimado em minutos baseado na distância
 */
export function calculateEstimatedTimeMinutes(distanceKm: number): number {
  const { ESTIMATED_SPEED_KPH } = DELIVERY_PRICING;

  if (!distanceKm || distanceKm <= 0) {
    return 10; // Tempo mínimo padrão
  }

  const hours = distanceKm / ESTIMATED_SPEED_KPH;
  const minutes = Math.ceil(hours * 60);

  // Mínimo 5 minutos, máximo 120 minutos
  return Math.min(Math.max(minutes, 5), 120);
}

/**
 * Formata distância para exibição
 */
export function formatDistance(distanceKm: number | null | undefined): string {
  if (distanceKm == null || distanceKm <= 0) {
    return 'Calculando...';
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Formata tempo estimado para exibição
 */
export function formatEstimatedTime(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return '—';
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}min`
    : `${hours}h`;
}
