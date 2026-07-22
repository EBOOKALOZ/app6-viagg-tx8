/**
 * Presets de INCREMENTO MÍNIMO do lance — FONTE ÚNICA.
 *
 * Usado tanto no cadastro do leilão (lojista escolhe) quanto na página pública
 * (participante vê a mesma régua, com o valor do vendedor destacado). Manter aqui
 * garante que vendedor e participante enxergam EXATAMENTE os mesmos valores.
 */
export const INCREMENT_PRESETS = [1, 3, 6, 9, 12, 15, 18, 21, 25, 50, 100] as const;

/** true se o valor é um dos presets (senão é "Personalizado"). */
export function isIncrementPreset(value: number): boolean {
  return (INCREMENT_PRESETS as readonly number[]).includes(value);
}

/** "R$ 1.234,56" a partir de um número em reais. */
export function formatIncrementBRL(value: number): string {
  return `R$ ${(value || 0).toFixed(2).replace(".", ",")}`;
}
