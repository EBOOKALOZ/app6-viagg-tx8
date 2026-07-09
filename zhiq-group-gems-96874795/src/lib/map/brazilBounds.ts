/**
 * brazilBounds — sanidade geográfica para coordenadas da plataforma.
 *
 * Cadastros com sinal trocado (ex.: lat +10.58 em vez de -10.58) ou
 * geocodificações erradas jogavam pinos na Venezuela/Colômbia e geravam
 * rotas de milhares de km. Toda coordenada de origem duvidosa (residência
 * cadastrada, cidade geocodificada) passa por este filtro antes de ir pro
 * mapa — fora da caixa do Brasil, é descartada e o fluxo cai pro próximo
 * fallback.
 */
export function isWithinBrazil(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null) return false;
  return lat <= 5.5 && lat >= -34.0 && lng >= -74.5 && lng <= -32.0;
}

/** Devolve o par {lat,lng} apenas se estiver dentro do Brasil; senão null. */
export function brazilCoordsOrNull(
  lat?: number | null,
  lng?: number | null,
): { lat: number; lng: number } | null {
  return isWithinBrazil(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}
