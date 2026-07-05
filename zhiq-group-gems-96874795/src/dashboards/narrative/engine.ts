/**
 * M59.1 · NarrativeValidator + NarrativeTemplateRegistry + NarrativeEngine.
 * Puros e determinísticos. Nenhuma linguagem natural nasce aqui.
 */

import {
  type NarrativeInput, type NarrativeValidation, type NarrativeProblem,
  type NarrativeEvidence, type NarrativeRawSources, type NarrativeSectionKey,
  NARRATIVE_SECTION_ORDER, NARRATIVE_REQUIRED_DATASETS,
} from './types';
import { buildNarrativeContext } from './builder';

// ── NarrativeValidator — contexto inconsistente JAMAIS passa ──
export function validateNarrativeInput(input: NarrativeInput): NarrativeValidation {
  const problemas: NarrativeProblem[] = [];
  for (const secao of NARRATIVE_SECTION_ORDER) {
    const fields = input[secao] as unknown as Record<string, NarrativeEvidence>;
    for (const [campo, ev] of Object.entries(fields)) {
      if (ev.availability !== 'ok') {
        problemas.push({
          secao,
          campo,
          tipo: ev.availability,
          detalhe: `${ev.dataset}.${ev.component} → ${ev.availability}` +
            (ev.timestamp ? '' : ' (sem timestamp de fonte)'),
        });
      }
    }
  }
  const temErroOuCarregando = problemas.some((p) => p.tipo === 'erro' || p.tipo === 'carregando');
  return {
    valido: problemas.length === 0,
    utilizavelComRessalvas: !temErroOuCarregando,
    problemas,
  };
}

// ── NarrativeTemplateRegistry ─────────────────────────────────
export interface NarrativeTemplate {
  narrator: string;
  label: string;
  /** seções do NarrativeInput que este narrador consome */
  sections: NarrativeSectionKey[];
  /** 'ativo' = narrador determinístico implementado (M59.2+) */
  status: 'ativo' | 'aguardando_m59_2' | 'bloqueado_m58_3' | 'futuro';
  /** templates de situação registrados (narradores ativos) */
  situationTemplates?: readonly string[];
  /** regra imposta no banco (M55.3B): perfil executivo só métricas enterprise */
  restricao?: string;
}

export const NARRATIVE_TEMPLATE_REGISTRY: readonly NarrativeTemplate[] = [
  {
    narrator: 'executive',
    label: 'Executive Narrative AI',
    sections: ['situacaoGeral', 'health', 'alertas', 'governanca', 'incidentes', 'quality', 'issues', 'executiveSummary'],
    status: 'ativo', // M59.2: determinístico oficial + adaptador generativo (OFF)
    situationTemplates: ['excelente', 'boa', 'atencao', 'critica', 'offline'],
    restricao: 'perfil executivo consome só métricas enterprise (cio_ai_knowledge_package); sem certificadas, declara a ausência',
  },
  {
    narrator: 'operations',
    label: 'Operations Narrative AI',
    sections: ['situacaoGeral', 'health', 'alertas', 'incidentes', 'timeline', 'quality', 'issues', 'executiveSummary', 'filas'],
    status: 'ativo', // M59.3: determinístico + híbrido (mesmo guard/fallback)
    situationTemplates: ['operacao_excelente', 'operacao_estavel', 'atencao_operacional', 'operacao_critica', 'operacao_parcial', 'sistema_offline'],
  },
  {
    narrator: 'predictive',
    label: 'Predictive Narrative AI',
    sections: ['series', 'situacaoGeral', 'health', 'alertas', 'governanca'],
    status: 'ativo', // M59.4: tendências/riscos/projeções sobre séries oficiais
    situationTemplates: ['tendencia_positiva', 'tendencia_estavel', 'tendencia_negativa', 'tendencias_mistas', 'historico_insuficiente'],
    restricao: 'previsões só com método declarado e ≥10 pontos (piso do cio_health_predict); sem histórico ⇒ declara insuficiência',
  },
  {
    narrator: 'strategic',
    label: 'Strategic Narrative AI',
    sections: NARRATIVE_SECTION_ORDER as unknown as NarrativeSectionKey[],
    status: 'ativo', // M59.5: COMPOSER — deriva só dos narradores executive+operations+predictive
    situationTemplates: ['estrategia_consolidada_positiva', 'estrategia_estavel', 'estrategia_atencao', 'estrategia_critica', 'estrategia_parcial'],
    restricao: 'composição pura: não interpreta datasets; consenso reforça, divergência é declarada sem vencedor; evidências preservadas',
  },
  {
    narrator: 'governance',
    label: 'Governance Narrative AI',
    sections: ['governanca', 'quality', 'issues', 'timeline'],
    status: 'aguardando_m59_2',
  },
  {
    narrator: 'business',
    label: 'Business Narrative AI',
    sections: ['situacaoGeral', 'executiveSummary'],
    status: 'bloqueado_m58_3',
    restricao: 'aguarda métricas oficiais certificadas das verticais (M58.3 suspenso)',
  },
  {
    narrator: 'ridv',
    label: 'RIDV Narrative AI',
    sections: [],
    status: 'futuro',
  },
] as const;

export function getNarrativeTemplate(narrator: string): NarrativeTemplate {
  const t = NARRATIVE_TEMPLATE_REGISTRY.find((x) => x.narrator === narrator);
  if (!t) throw new Error(`Narrador desconhecido no registry: ${narrator}`);
  return t;
}

// ── NarrativeEngine — orquestra builder + validator + auditoria ──
export interface NarrativeEngineOutput {
  input: NarrativeInput;
  validation: NarrativeValidation;
  /** trilha plana de auditoria: caminho → evidência */
  evidencias: { caminho: string; evidencia: NarrativeEvidence }[];
  /** explicabilidade: de onde veio um campo específico */
  explain: (caminho: string) => NarrativeEvidence | null;
}

export function runNarrativeEngine(
  sources: NarrativeRawSources,
  nowIso: string,
): NarrativeEngineOutput {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const draft = buildNarrativeContext(sources, nowIso, null);
  const montagemMs =
    typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 100) / 100 : null;
  const input: NarrativeInput = { ...draft, meta: { ...draft.meta, montagemMs } };
  const validation = validateNarrativeInput(input);

  const evidencias: { caminho: string; evidencia: NarrativeEvidence }[] = [];
  for (const secao of NARRATIVE_SECTION_ORDER) {
    const fields = input[secao] as unknown as Record<string, NarrativeEvidence>;
    for (const [campo, ev] of Object.entries(fields)) {
      evidencias.push({ caminho: `${secao}.${campo}`, evidencia: ev });
    }
  }
  const byPath = new Map(evidencias.map((e) => [e.caminho, e.evidencia]));

  return {
    input,
    validation,
    evidencias,
    explain: (caminho: string) => byPath.get(caminho) ?? null,
  };
}

/** Sanidade estrutural do engine (usada no self-test). */
export function narrativeEngineInvariants(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>(NARRATIVE_REQUIRED_DATASETS);
  if (seen.size !== NARRATIVE_REQUIRED_DATASETS.length)
    problems.push('datasets exigidos duplicados (builder paralelo?)');
  for (const t of NARRATIVE_TEMPLATE_REGISTRY) {
    for (const s of t.sections) {
      if (!NARRATIVE_SECTION_ORDER.includes(s)) problems.push(`${t.narrator}: seção inexistente ${s}`);
    }
    if (t.status === 'aguardando_m59_2' && (t as unknown as Record<string, unknown>).texto)
      problems.push(`${t.narrator}: texto definido antes do M59.2`);
    if (t.status === 'ativo' && (!t.situationTemplates || t.situationTemplates.length < 5))
      problems.push(`${t.narrator}: narrador ativo sem templates de situação registrados`);
  }
  return problems;
}
