/**
 * ORION-QA Fase 2 — Problemas Relacionados (similaridade por regras).
 * Combina sobreposição de tokens (título/descrição/erro/stack/mensagem) com
 * sinais exatos (módulo, commit, status). Resultado 0–100%.
 */

export interface QaSimilarityInput {
  id: string;
  title: string;
  description: string | null;
  module: string;
  error_message: string | null;
  commit_hash: string | null;
  stack_trace: string | null;
  status: string;
}

export interface QaRelatedResult {
  id: string;
  similarity: number; // 0–100
}

const STOPWORDS = new Set([
  "a", "o", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "um", "uma", "para", "por", "com", "sem", "que", "se", "ao", "aos", "as", "os",
  "the", "of", "in", "on", "at", "to", "is", "not", "and", "or", "an",
  "erro", "error", "problema", "bug", "falha",
]);

export function tokenize(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.min(a.size, b.size);
}

/** Pesos por campo — título e erro pesam mais que descrição/stack. */
const FIELD_WEIGHTS = {
  title: 0.34,
  error: 0.26,
  description: 0.14,
  stack: 0.11,
} as const;

export function computeSimilarity(base: QaSimilarityInput, other: QaSimilarityInput): number {
  let score = 0;
  score += FIELD_WEIGHTS.title * overlapRatio(tokenize(base.title), tokenize(other.title));
  score += FIELD_WEIGHTS.error * overlapRatio(tokenize(base.error_message), tokenize(other.error_message));
  score += FIELD_WEIGHTS.description * overlapRatio(tokenize(base.description), tokenize(other.description));
  score += FIELD_WEIGHTS.stack * overlapRatio(tokenize(base.stack_trace), tokenize(other.stack_trace));

  // Sinais exatos
  if (base.module === other.module) score += 0.08;
  if (base.commit_hash && other.commit_hash && base.commit_hash === other.commit_hash) score += 0.05;
  if (base.status === other.status) score += 0.02;

  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

/** Top-N problemas mais parecidos (exclui o próprio; corte mínimo de 20%). */
export function findRelated(
  base: QaSimilarityInput,
  candidates: QaSimilarityInput[],
  limit = 5,
  minSimilarity = 20,
): QaRelatedResult[] {
  return candidates
    .filter((c) => c.id !== base.id)
    .map((c) => ({ id: c.id, similarity: computeSimilarity(base, c) }))
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
