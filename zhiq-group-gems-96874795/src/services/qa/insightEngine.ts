/**
 * ORION-QA Fase 2 — Análise Inteligente (causa raiz por regras internas).
 *
 * Toda a heurística fica ISOLADA aqui: `analyzeIssue(input) → QaInsight` é o
 * contrato estável para a futura integração com OpenAI — a UI não conhece as
 * regras, apenas o resultado.
 */

export interface QaInsightInput {
  title: string;
  description: string | null;
  module: string;
  origin: string;
  environment: string;
  severity: string;
  error_message: string | null;
  stack_trace: string | null;
  reopen_count: number;
  history_count: number;
}

export interface QaInsight {
  probableCause: string;
  estimatedImpact: string;
  affectedArea: string;
  complexity: "Baixa" | "Média" | "Alta";
  estimatedFixTime: string;
  risk: "Baixo" | "Médio" | "Alto" | "Crítico";
}

interface CausePattern {
  pattern: RegExp;
  cause: string;
}

/** Padrões de erro conhecidos (avaliados sobre erro + stack + título + descrição). */
const CAUSE_PATTERNS: CausePattern[] = [
  { pattern: /permission denied|row-level security|rls|42501/i, cause: "Bloqueio de RLS/permissão no banco — policy, GRANT ou papel do usuário insuficiente." },
  { pattern: /timeout|timed?[ -]?out|etimedout|57014/i, cause: "Tempo de resposta excedido — consulta lenta, índice ausente ou serviço externo indisponível." },
  { pattern: /null|undefined is not|cannot read propert|typeerror/i, cause: "Referência nula/indefinida no frontend — dado ausente ou contrato de API divergente." },
  { pattern: /404|not found|no rows|PGRST116/i, cause: "Recurso inexistente — registro removido, rota incorreta ou identificador inválido." },
  { pattern: /409|conflict|duplicate key|23505/i, cause: "Conflito de unicidade — inserção duplicada ou condição de corrida entre requisições." },
  { pattern: /foreign key|23503/i, cause: "Violação de integridade referencial — registro pai ausente ou ordem de escrita incorreta." },
  { pattern: /network|fetch failed|failed to fetch|econnrefused|cors/i, cause: "Falha de rede/CORS — conectividade, DNS ou configuração de origem." },
  { pattern: /migration|schema|column .* does not exist|42703|42P01/i, cause: "Divergência de schema — migration não aplicada ou types desatualizados." },
  { pattern: /auth|jwt|token|sess(ão|ao|ion)/i, cause: "Sessão/autenticação — token expirado, refresh falho ou papel sem privilégio." },
  { pattern: /storage|bucket|upload/i, cause: "Storage — policy do bucket, tipo de arquivo ou tamanho acima do limite." },
  { pattern: /memory|heap|leak/i, cause: "Consumo de memória — vazamento ou processamento de volume acima do esperado." },
];

const ORIGIN_FALLBACK_CAUSE: Record<string, string> = {
  frontend: "Comportamento inesperado de UI — estado, renderização ou contrato de dados.",
  backend: "Falha de lógica server-side — validação, transação ou integração.",
  supabase: "Configuração Supabase — RLS, trigger, function ou realtime.",
  banco: "Dados/schema — integridade, índice ou migration.",
  api: "Contrato de API — payload, status code ou versionamento.",
  ia: "Pipeline de IA — prompt, limite de tokens ou resposta fora do contrato.",
  deploy: "Processo de deploy — build, variável de ambiente ou cache de release.",
  performance: "Gargalo de performance — consulta N+1, payload excessivo ou falta de cache.",
  seguranca: "Superfície de segurança — permissão, exposição de dado ou validação ausente.",
  shc: "Detectado pelo SHC — verificar evidência do cenário reprovado.",
  maquina_virtual: "Detectado na VM de testes — verificar log da execução.",
  manual: "Relato manual — validar passos de reprodução com o relator.",
};

function detectProbableCause(input: QaInsightInput): string {
  const corpus = [input.error_message, input.stack_trace, input.title, input.description]
    .filter(Boolean)
    .join("\n");
  for (const { pattern, cause } of CAUSE_PATTERNS) {
    if (pattern.test(corpus)) return cause;
  }
  return ORIGIN_FALLBACK_CAUSE[input.origin] ?? "Causa não classificada pelas regras — investigar manualmente.";
}

function estimateImpact(input: QaInsightInput): string {
  const prod = input.environment === "producao";
  switch (input.severity) {
    case "critico":
      return prod
        ? "Alto — usuários reais afetados em produção; tratar como incidente."
        : "Alto potencial — crítico fora de produção; corrigir antes do próximo deploy.";
    case "alto":
      return prod
        ? "Relevante — funcionalidade degradada em produção para parte dos usuários."
        : "Relevante — bloqueia homologação/testes do módulo.";
    case "medio":
      return "Moderado — afeta fluxos secundários ou tem contorno conhecido.";
    case "baixo":
      return "Baixo — inconveniência pontual, sem bloqueio de fluxo.";
    default:
      return "Evolução — sem impacto negativo atual; ganho ao implementar.";
  }
}

function detectAffectedArea(input: QaInsightInput): string {
  const layer =
    input.origin === "frontend" ? "Interface (frontend)"
    : ["backend", "api"].includes(input.origin) ? "Serviços (backend/API)"
    : ["supabase", "banco"].includes(input.origin) ? "Dados (Supabase/banco)"
    : input.origin === "deploy" ? "Infraestrutura (deploy)"
    : input.origin === "seguranca" ? "Segurança"
    : input.origin === "performance" ? "Performance"
    : "Plataforma";
  return `${layer} · módulo ${input.module}`;
}

function estimateComplexity(input: QaInsightInput): QaInsight["complexity"] {
  let points = 0;
  if (input.reopen_count > 0) points += 2;               // já voltou: mais difícil do que parecia
  if (input.history_count > 10) points += 1;             // muito vaivém
  if (input.stack_trace) points += 1;                    // falha técnica profunda
  if (["banco", "supabase", "seguranca"].includes(input.origin)) points += 1;
  if (input.severity === "critico") points += 1;
  if (points >= 4) return "Alta";
  if (points >= 2) return "Média";
  return "Baixa";
}

const FIX_TIME_BY_COMPLEXITY: Record<QaInsight["complexity"], string> = {
  Baixa: "2–4 horas",
  Média: "4–8 horas (até 1 dia)",
  Alta: "1–3 dias (com homologação)",
};

function estimateRisk(input: QaInsightInput, complexity: QaInsight["complexity"]): QaInsight["risk"] {
  if (input.severity === "critico" && input.environment === "producao") return "Crítico";
  if (input.severity === "critico" || (input.environment === "producao" && complexity === "Alta")) return "Alto";
  if (input.severity === "alto" || complexity === "Alta" || input.reopen_count > 0) return "Médio";
  return "Baixo";
}

export function analyzeIssue(input: QaInsightInput): QaInsight {
  const complexity = estimateComplexity(input);
  return {
    probableCause: detectProbableCause(input),
    estimatedImpact: estimateImpact(input),
    affectedArea: detectAffectedArea(input),
    complexity,
    estimatedFixTime: FIX_TIME_BY_COMPLEXITY[complexity],
    risk: estimateRisk(input, complexity),
  };
}
