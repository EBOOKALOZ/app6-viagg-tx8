/**
 * ORION-QA Fase 2 — Motor de Prioridade IA (Score 0–100).
 *
 * Cálculo por regras internas, ISOLADO neste módulo: a assinatura
 * `computePriorityScore(input) → QaPriorityScore` é o contrato estável para a
 * futura troca do motor por um provedor de IA (OpenAI) sem tocar na UI.
 */

export interface QaPriorityInput {
  severity: string;
  environment: string;
  status: string;
  module: string;
  created_at: string;
  comments_count: number;
  history_count: number;
  attachments_count: number;
  reopen_count: number;
}

export type QaPriorityLevel = "baixa" | "moderada" | "alta" | "critica";

export interface QaPriorityScore {
  score: number; // 0–100
  level: QaPriorityLevel;
  label: string;
  /** Composição do score — transparência do motor (exibida em tooltip). */
  breakdown: { factor: string; points: number }[];
}

const SEVERITY_POINTS: Record<string, number> = {
  critico: 35, alto: 26, medio: 16, baixo: 8, melhoria: 2,
};

const ENVIRONMENT_POINTS: Record<string, number> = {
  producao: 20, homologacao: 12, vm_testes: 6, local: 3,
};

const STATUS_POINTS: Record<string, number> = {
  reaberto: 8, novo: 4, em_analise: 3, em_desenvolvimento: 2,
  aguardando_teste: 2, em_homologacao: 1, homologado: 0, fechado: 0,
};

/** Status finalizados amortecem o score (urgência residual, não zero). */
const STATUS_DAMPING: Record<string, number> = { homologado: 0.25, fechado: 0.15 };

/** Módulos de risco intrínseco elevado (dinheiro/identidade/segurança). */
const CRITICAL_MODULES = new Set([
  "pagamentos", "financeiro", "pay", "carteira", "seguranca", "auth",
  "leiloes", "creditos", "banco",
]);

function agePoints(createdAt: string, now: Date): number {
  const days = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  if (days < 1) return 2;
  if (days < 3) return 5;
  if (days < 7) return 8;
  if (days < 14) return 11;
  if (days < 30) return 13;
  return 15;
}

export const QA_PRIORITY_LEVEL_LABELS: Record<QaPriorityLevel, string> = {
  baixa: "Baixa",
  moderada: "Moderada",
  alta: "Alta",
  critica: "Crítica",
};

/** Cores dinâmicas (verde → amarelo → laranja → vermelho). */
export const QA_PRIORITY_LEVEL_COLORS: Record<QaPriorityLevel, string> = {
  baixa: "bg-green-100 text-green-800 border-green-300",
  moderada: "bg-yellow-100 text-yellow-800 border-yellow-300",
  alta: "bg-orange-100 text-orange-800 border-orange-300",
  critica: "bg-red-100 text-red-800 border-red-300 font-bold",
};

export function levelForScore(score: number): QaPriorityLevel {
  if (score >= 85) return "critica";
  if (score >= 65) return "alta";
  if (score >= 40) return "moderada";
  return "baixa";
}

export function computePriorityScore(input: QaPriorityInput, now: Date = new Date()): QaPriorityScore {
  const breakdown: { factor: string; points: number }[] = [];
  const add = (factor: string, points: number) => {
    if (points > 0) breakdown.push({ factor, points });
    return points;
  };

  let score = 0;
  score += add("Severidade", SEVERITY_POINTS[input.severity] ?? 10);
  score += add("Ambiente", ENVIRONMENT_POINTS[input.environment] ?? 5);
  score += add("Tempo aberto", agePoints(input.created_at, now));
  score += add("Comentários", Math.min(input.comments_count * 2, 8));
  score += add("Alterações", Math.min(input.history_count, 6));
  score += add("Anexos", Math.min(input.attachments_count * 2, 4));
  score += add("Reaberturas", Math.min(input.reopen_count * 6, 12));
  score += add("Situação atual", STATUS_POINTS[input.status] ?? 0);
  if (CRITICAL_MODULES.has(input.module.toLowerCase())) {
    score += add("Módulo sensível", 5);
  }

  const damping = STATUS_DAMPING[input.status];
  if (damping !== undefined) {
    score = score * damping;
    breakdown.push({ factor: "Problema finalizado (amortecido)", points: 0 });
  }

  const final = Math.max(0, Math.min(100, Math.round(score)));
  const level = levelForScore(final);
  return { score: final, level, label: QA_PRIORITY_LEVEL_LABELS[level], breakdown };
}
