export const TRAVEL_CATEGORIES = [
  { value: 'pacote_completo',    label: 'Pacote Completo',     emoji: '✈️' },
  { value: 'lua_de_mel',         label: 'Lua de Mel',          emoji: '💍' },
  { value: 'aventura',           label: 'Aventura',            emoji: '🏔️' },
  { value: 'praia',              label: 'Praia & Sol',         emoji: '🏖️' },
  { value: 'cruzeiro',           label: 'Cruzeiro',            emoji: '🚢' },
  { value: 'ecoturismo',         label: 'Ecoturismo',          emoji: '🌿' },
  { value: 'cultural',           label: 'Turismo Cultural',    emoji: '🏛️' },
  { value: 'religioso',          label: 'Turismo Religioso',   emoji: '⛪' },
  { value: 'rural',              label: 'Turismo Rural',       emoji: '🌾' },
  { value: 'negocios',           label: 'Negócios',            emoji: '💼' },
  { value: 'saude',              label: 'Saúde & Bem-estar',   emoji: '🧘' },
  { value: 'gastronomico',       label: 'Gastronômico',        emoji: '🍽️' },
  { value: 'outro',              label: 'Outro',               emoji: '🗺️' },
];

export const TRAVEL_INCLUDES = [
  { key: 'accommodation',      label: 'Hospedagem' },
  { key: 'breakfast',          label: 'Café da manhã' },
  { key: 'lunch',              label: 'Almoço' },
  { key: 'dinner',             label: 'Jantar' },
  { key: 'transport',          label: 'Transporte' },
  { key: 'guide',              label: 'Guia turístico' },
  { key: 'insurance',          label: 'Seguro viagem' },
  { key: 'tours',              label: 'Passeios' },
  { key: 'airport_transfer',   label: 'Transfer aeroporto' },
];

export function resolveTravelCategoryEmoji(category: string): string {
  const found = TRAVEL_CATEGORIES.find(c => c.value === category || c.label === category);
  return found?.emoji ?? '🗺️';
}
