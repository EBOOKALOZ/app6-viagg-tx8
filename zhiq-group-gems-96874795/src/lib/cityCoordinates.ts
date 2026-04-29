/**
 * Coordenadas aproximadas das principais cidades brasileiras.
 * Usado como fallback quando GPS não está disponível para
 * posicionar o motoboy no mapa com base na cidade cadastrada.
 */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // Santa Catarina
  'blumenau': { lat: -26.9194, lng: -49.0661 },
  'florianópolis': { lat: -27.5954, lng: -48.5480 },
  'florianopolis': { lat: -27.5954, lng: -48.5480 },
  'joinville': { lat: -26.3045, lng: -48.8487 },
  'chapecó': { lat: -27.0964, lng: -52.6158 },
  'chapeco': { lat: -27.0964, lng: -52.6158 },
  'criciúma': { lat: -28.6775, lng: -49.3697 },
  'criciuma': { lat: -28.6775, lng: -49.3697 },
  'itajaí': { lat: -26.9078, lng: -48.6616 },
  'itajai': { lat: -26.9078, lng: -48.6616 },
  'balneário camboriú': { lat: -26.9906, lng: -48.6352 },
  'balneario camboriu': { lat: -26.9906, lng: -48.6352 },
  'lages': { lat: -27.8161, lng: -50.3261 },
  'jaraguá do sul': { lat: -26.4853, lng: -49.0713 },
  'jaragua do sul': { lat: -26.4853, lng: -49.0713 },
  'são josé': { lat: -27.6136, lng: -48.6366 },
  'sao jose': { lat: -27.6136, lng: -48.6366 },
  'palhoça': { lat: -27.6453, lng: -48.6680 },
  'palhoca': { lat: -27.6453, lng: -48.6680 },
  'brusque': { lat: -27.0979, lng: -48.9177 },
  'tubarão': { lat: -28.4669, lng: -49.0068 },
  'tubarao': { lat: -28.4669, lng: -49.0068 },
  'gaspar': { lat: -26.9314, lng: -49.1156 },
  'indaial': { lat: -26.8978, lng: -49.2316 },
  'timbó': { lat: -26.8244, lng: -49.2733 },
  'timbo': { lat: -26.8244, lng: -49.2733 },
  'pomerode': { lat: -26.7407, lng: -49.1767 },

  // Paraná
  'curitiba': { lat: -25.4284, lng: -49.2733 },
  'londrina': { lat: -23.3045, lng: -51.1696 },
  'maringá': { lat: -23.4205, lng: -51.9333 },
  'maringa': { lat: -23.4205, lng: -51.9333 },
  'ponta grossa': { lat: -25.0994, lng: -50.1583 },
  'cascavel': { lat: -24.9578, lng: -53.4596 },
  'foz do iguaçu': { lat: -25.5163, lng: -54.5854 },
  'foz do iguacu': { lat: -25.5163, lng: -54.5854 },

  // Rio Grande do Sul
  'porto alegre': { lat: -30.0346, lng: -51.2177 },
  'caxias do sul': { lat: -29.1681, lng: -51.1794 },
  'pelotas': { lat: -31.7649, lng: -52.3371 },
  'canoas': { lat: -29.9178, lng: -51.1837 },
  'santa maria': { lat: -29.6842, lng: -53.8069 },
  'novo hamburgo': { lat: -29.6879, lng: -51.1306 },
  'gravataí': { lat: -29.9445, lng: -50.9919 },
  'gravatai': { lat: -29.9445, lng: -50.9919 },

  // São Paulo
  'são paulo': { lat: -23.5505, lng: -46.6333 },
  'sao paulo': { lat: -23.5505, lng: -46.6333 },
  'campinas': { lat: -22.9099, lng: -47.0626 },
  'guarulhos': { lat: -23.4538, lng: -46.5333 },
  'santos': { lat: -23.9608, lng: -46.3336 },
  'ribeirão preto': { lat: -21.1767, lng: -47.8208 },
  'ribeirao preto': { lat: -21.1767, lng: -47.8208 },
  'sorocaba': { lat: -23.5015, lng: -47.4526 },

  // Rio de Janeiro
  'rio de janeiro': { lat: -22.9068, lng: -43.1729 },
  'niterói': { lat: -22.8833, lng: -43.1036 },
  'niteroi': { lat: -22.8833, lng: -43.1036 },

  // Minas Gerais
  'belo horizonte': { lat: -19.9167, lng: -43.9345 },
  'uberlândia': { lat: -18.9186, lng: -48.2772 },
  'uberlandia': { lat: -18.9186, lng: -48.2772 },

  // Outros
  'brasília': { lat: -15.7975, lng: -47.8919 },
  'brasilia': { lat: -15.7975, lng: -47.8919 },
  'salvador': { lat: -12.9714, lng: -38.5124 },
  'recife': { lat: -8.0476, lng: -34.8770 },
  'fortaleza': { lat: -3.7172, lng: -38.5433 },
  'manaus': { lat: -3.1190, lng: -60.0217 },
  'belém': { lat: -1.4558, lng: -48.5024 },
  'belem': { lat: -1.4558, lng: -48.5024 },
  'goiânia': { lat: -16.6869, lng: -49.2648 },
  'goiania': { lat: -16.6869, lng: -49.2648 },
};

/**
 * Retorna coordenadas aproximadas para uma cidade brasileira.
 * Faz busca case-insensitive e sem acentos.
 */
export function getCityCoordinates(cidade: string): { lat: number; lng: number } | null {
  if (!cidade) return null;
  const normalized = cidade.toLowerCase().trim();
  return CITY_COORDS[normalized] ?? null;
}
