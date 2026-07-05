/**
 * M59.2 · Executive Generative Adapter — camada OPCIONAL, desacoplada.
 *
 * O LLM apenas melhora a redação: recebe SOMENTE o NarrativeInput + o
 * relatório determinístico (e, no servidor, o cio_ai_knowledge_package —
 * buscado pelo gateway Edge, pois a RPC é service-only). O adaptador NUNCA
 * acessa banco/datasets/RPCs; toda informação já vem do NarrativeInput.
 *
 * NUMBER GUARD obrigatório: qualquer número, situação ou classificação que
 * não exista no relatório determinístico DESCARTA a saída inteira e o
 * fallback assume. O sistema jamais deixa de responder.
 */

import type { NarrativeInput } from '../types';
import type { NarrativeEngineOutput } from '../engine';
import {
  narrateExecutiveDeterministic, type NarrativeReport, type NarrativeReportSection,
} from './executiveDeterministic';
import { NARRATIVE_GENERATIVE_ENABLED, NARRATIVE_GENERATIVE_TIMEOUT_MS } from '../config';

// ── Transporte plugável (o LLM fica ATRÁS desta interface) ────
export interface GenerativePayload {
  narrator: 'executive' | 'operations' | 'predictive' | 'strategic';
  input: NarrativeInput;
  relatorioDeterministico: { secoes: { key: string; titulo: string; texto: string }[] };
  instrucao: string;
}

export interface GenerativeResult {
  ok: boolean;
  /** texto melhorado por seção (mesmas keys do determinístico) */
  secoes?: { key: string; texto: string }[];
  motivo?: string;
}

export interface GenerativeTransport {
  name: string;
  invoke(payload: GenerativePayload): Promise<GenerativeResult>;
}

/**
 * Transporte oficial (gateway Edge M48). LIGAÇÃO REAL pós-deploy:
 * o gateway busca o cio_ai_knowledge_package server-side e chama o LLM
 * com as 5 proibições. Enquanto não configurado, responde indisponível —
 * o fallback determinístico assume (comportamento desejado).
 */
export const edgeGatewayTransport: GenerativeTransport = {
  name: 'edge:ai-engine-gateway',
  async invoke(_payload: GenerativePayload): Promise<GenerativeResult> {
    // Wiring real (pós-deploy + flag): supabase.functions.invoke('ai-engine-gateway',
    //   { body: { kind: 'narrative-rewrite', payload } }) → validado pelo Number Guard.
    return { ok: false, motivo: 'gateway generativo não configurado nesta fase [ligar-pós-deploy]' };
  },
};

// ── NUMBER GUARD ──────────────────────────────────────────────
const NUM_RE = /\d+(?:[.,]\d+)?/g;

function numbersOf(text: string): Set<string> {
  return new Set((text.match(NUM_RE) ?? []).map((n) => n.replace(',', '.')));
}

/** Rótulos oficiais que a redação não pode contradizer. */
const OFFICIAL_LABELS = ['EXCELENTE', 'BOA', 'ATENÇÃO', 'CRÍTICA', 'CRITICO', 'SAUDAVEL', 'APROVADO', 'REPROVADO'];

export interface GuardVerdict {
  ok: boolean;
  violacoes: string[];
}

/**
 * Valida a saída generativa contra o relatório determinístico:
 * 1) todo número do texto gerado deve existir no texto determinístico da
 *    MESMA seção (nada de números novos — nem "aproximadamente");
 * 2) rótulos oficiais presentes no gerado devem existir no determinístico
 *    (a redação não muda situação/classificação/conclusão).
 */
export function numberGuard(
  generated: { key: string; texto: string }[],
  deterministic: NarrativeReportSection[],
): GuardVerdict {
  const violacoes: string[] = [];
  const detByKey = new Map(
    deterministic.map((s) => [s.key, s.frases.map((f) => f.texto).join(' ')]),
  );
  for (const g of generated) {
    const base = detByKey.get(g.key);
    if (base === undefined) {
      violacoes.push(`seção desconhecida na saída generativa: ${g.key}`);
      continue;
    }
    if (!g.texto || g.texto.trim().length === 0) {
      violacoes.push(`seção ${g.key}: texto vazio`);
      continue;
    }
    const allowed = numbersOf(base);
    for (const n of numbersOf(g.texto)) {
      if (!allowed.has(n)) violacoes.push(`seção ${g.key}: número "${n}" não existe na fonte oficial`);
    }
    const upperBase = base.toUpperCase();
    const upperGen = g.texto.toUpperCase();
    for (const label of OFFICIAL_LABELS) {
      if (upperGen.includes(label) && !upperBase.includes(label)) {
        violacoes.push(`seção ${g.key}: rótulo oficial "${label}" introduzido pela redação`);
      }
    }
  }
  return { ok: violacoes.length === 0, violacoes };
}

// ── Orquestrador com FALLBACK AUTOMÁTICO ──────────────────────
export interface NarrateOptions {
  prev?: NarrativeInput | null;
  generative?: { enabled: boolean; transport: GenerativeTransport };
}

/**
 * Orquestrador híbrido COMPARTILHADO (M59.3): qualquer narrador oficial usa
 * este mesmo fluxo — determinístico já pronto entra; generativo re-redige;
 * Number Guard valida; falha ⇒ fallback. Zero duplicação entre narradores.
 */
export async function narrateHybrid(
  deterministic: NarrativeReport,
  input: NarrativeInput,
  opts: NarrateOptions = {},
): Promise<NarrativeReport> {
  const gen = opts.generative ?? {
    enabled: NARRATIVE_GENERATIVE_ENABLED,
    transport: edgeGatewayTransport,
  };
  if (!gen.enabled) return deterministic;

  try {
    const payload: GenerativePayload = {
      narrator: deterministic.narrator,
      input,
      relatorioDeterministico: {
        secoes: deterministic.secoes.map((s) => ({
          key: s.key,
          titulo: s.titulo,
          texto: s.frases.map((f) => f.texto).join(' '),
        })),
      },
      instrucao:
        'Melhore APENAS a redação por seção. É PROIBIDO alterar números, métricas, ' +
        'estados, classificações ou conclusões; proibido acrescentar fatos.',
    };

    const result = await Promise.race<GenerativeResult>([
      gen.transport.invoke(payload),
      new Promise<GenerativeResult>((resolve) =>
        setTimeout(() => resolve({ ok: false, motivo: 'timeout do transporte generativo' }),
          NARRATIVE_GENERATIVE_TIMEOUT_MS),
      ),
    ]);

    if (!result.ok || !result.secoes?.length) {
      return { ...deterministic, fallbackMotivo: result.motivo ?? 'transporte generativo sem resposta' };
    }

    const verdict = numberGuard(result.secoes, deterministic.secoes);
    if (!verdict.ok) {
      return {
        ...deterministic,
        fallbackMotivo: `Number Guard descartou a saída generativa: ${verdict.violacoes[0]}`,
      };
    }

    // Saída aprovada: substitui a prosa, PRESERVANDO as evidências da seção
    const genByKey = new Map(result.secoes.map((s) => [s.key, s.texto]));
    return {
      ...deterministic,
      modo: 'generativo',
      secoes: deterministic.secoes.map((sec) => {
        const texto = genByKey.get(sec.key);
        if (!texto) return sec; // seção não reescrita permanece determinística
        const evidencias = [...new Set(sec.frases.flatMap((f) => f.evidencias))];
        return { ...sec, frases: [{ texto, evidencias }] };
      }),
    };
  } catch (err) {
    return {
      ...deterministic,
      fallbackMotivo: `erro no adaptador generativo: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Executive Narrator híbrido (API do M59.2, agora sobre o orquestrador comum). */
export async function narrateExecutive(
  engineOutput: NarrativeEngineOutput,
  opts: NarrateOptions = {},
): Promise<NarrativeReport> {
  const deterministic = narrateExecutiveDeterministic(engineOutput, opts.prev ?? null);
  return narrateHybrid(deterministic, engineOutput.input, opts);
}
