/**
 * M59.4 · Predictive Narrative AI — o terceiro narrador oficial do Programa CIO.
 *
 * Responde "o que provavelmente acontecerá" interpretando EXCLUSIVAMENTE
 * séries históricas oficiais já presentes no NarrativeInput (seção `series`).
 * Toda previsão carrega: MÉTODO DECLARADO, evidências, confiança, período
 * analisado e origem. Sem histórico suficiente ⇒
 * "Dados históricos insuficientes para previsão oficial."
 * Nenhum modelo externo; nenhuma extrapolação sem método; nenhum número criado.
 */

import type { NarrativeInput, NarrativeEvidence } from '../types';
import type { NarrativeEngineOutput } from '../engine';
import {
  type NarrativeReport, type NarrativeReportSection, type NarrativeSentence,
} from './executiveDeterministic';
import { narrateHybrid, type NarrateOptions } from './executiveGenerative';

// ══ ENGINE DE TENDÊNCIAS (método único e declarado) ═══════════
export type TrendLabel = 'crescente' | 'estavel' | 'decrescente' | 'oscilando' | 'sem_historico_suficiente';
export type TrendConfidence = 'alta' | 'media' | 'baixa' | 'dados_insuficientes';

/**
 * Método oficial (declarado em toda frase que o usa):
 * comparação da média da 1ª metade vs 2ª metade da série; |Δ| < 1 unidade
 * (resolução das fontes: score 0–100 e contagens inteiras) ⇒ estável;
 * ≥50% de inversões de direção ⇒ oscilando; < 4 pontos ⇒ sem histórico.
 * Confiança SÓ pelo volume da série: ≥20 alta · ≥10 média · ≥4 baixa ·
 * <4 dados_insuficientes. Projeções exigem ≥10 pontos — o MESMO piso do
 * cio_health_predict oficial do banco (precedente, não regra nova).
 */
export const TREND_METHOD =
  'comparação de médias entre metades da série (Δ≥1 unidade = direção; <1 = estável; ≥50% inversões de passos com |Δ|≥1 = oscilando; variação sub-resolução não conta como inversão)';
export const PROJECTION_MIN_POINTS = 10; // piso oficial do cio_health_predict

export interface TrendReading {
  tendencia: TrendLabel;
  confianca: TrendConfidence;
  pontos: number;
  /** Δ entre médias das metades (unidade da própria série) */
  delta: number | null;
  metodo: string;
}

export function classifySeries(values: number[]): TrendReading {
  const n = values.length;
  if (n < 4) {
    return { tendencia: 'sem_historico_suficiente', confianca: 'dados_insuficientes', pontos: n, delta: null, metodo: TREND_METHOD };
  }
  const confianca: TrendConfidence = n >= 20 ? 'alta' : n >= 10 ? 'media' : 'baixa';
  // inversões de direção — só passos com magnitude ≥ resolução (1 unidade);
  // jitter sub-resolução não é mudança de direção (declarado no método)
  let inversions = 0;
  let lastSign = 0;
  for (let i = 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    const sign = d >= 1 ? 1 : d <= -1 ? -1 : 0;
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) inversions++;
    if (sign !== 0) lastSign = sign;
  }
  const half = Math.floor(n / 2);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = Math.round((avg(values.slice(half)) - avg(values.slice(0, half))) * 100) / 100;
  if (inversions / (n - 1) >= 0.5) {
    return { tendencia: 'oscilando', confianca, pontos: n, delta, metodo: TREND_METHOD };
  }
  const tendencia: TrendLabel = Math.abs(delta) < 1 ? 'estavel' : delta > 0 ? 'crescente' : 'decrescente';
  return { tendencia, confianca, pontos: n, delta, metodo: TREND_METHOD };
}

// ══ Leituras por fonte oficial ════════════════════════════════
export interface ComponentTrend extends TrendReading {
  component: string;
  /** série cronológica usada (mais antiga → mais nova) */
  primeiro: number;
  ultimo: number;
}

/** Agrupa a timeline oficial por componente e classifica cada série. */
export function componentTrends(input: NarrativeInput): ComponentTrend[] {
  const ev = input.series.healthTimeline;
  if (ev.availability !== 'ok' || !ev.value) return [];
  const byComp = new Map<string, number[]>();
  // timeline vem DESC do dataset ⇒ inverte p/ cronológica
  for (const p of [...ev.value].reverse()) {
    if (!byComp.has(p.component)) byComp.set(p.component, []);
    byComp.get(p.component)!.push(p.score);
  }
  return [...byComp.entries()]
    .map(([component, values]) => ({
      component,
      ...classifySeries(values),
      primeiro: values[0],
      ultimo: values[values.length - 1],
    }))
    .sort((a, b) => a.component.localeCompare(b.component));
}

export function alertsTrend(input: NarrativeInput): TrendReading | null {
  const ev = input.series.alertas14d;
  if (ev.availability !== 'ok' || !ev.value) return null;
  return classifySeries(ev.value.map((p) => p.alertas));
}

// ══ Riscos e oportunidades (mapeamento fixo rótulo→leitura) ═══
export interface PredictiveFinding {
  titulo: string;
  base: string;          // leitura que fundamenta
  confianca: TrendConfidence;
  evidencias: string[];
}

export function detectRisks(trends: ComponentTrend[], alerts: TrendReading | null): PredictiveFinding[] {
  const out: PredictiveFinding[] = [];
  for (const t of trends) {
    if (t.tendencia === 'decrescente') {
      out.push({
        titulo: `Degradação contínua em ${t.component} (${t.primeiro} → ${t.ultimo})`,
        base: `série de saúde decrescente em ${t.pontos} pontos (Δ médio ${t.delta})`,
        confianca: t.confianca,
        evidencias: ['series.healthTimeline'],
      });
    }
    if (t.tendencia === 'oscilando') {
      out.push({
        titulo: `Perda de estabilidade em ${t.component}`,
        base: `série oscilante (≥50% de inversões em ${t.pontos} pontos) — comportamento anômalo`,
        confianca: t.confianca,
        evidencias: ['series.healthTimeline'],
      });
    }
  }
  if (alerts && alerts.tendencia === 'crescente') {
    out.push({
      titulo: 'Crescimento contínuo do volume de alertas',
      base: `série de 14 dias crescente (Δ médio ${alerts.delta} alertas/dia entre metades)`,
      confianca: alerts.confianca,
      evidencias: ['series.alertas14d'],
    });
  }
  return out;
}

export function detectOpportunities(trends: ComponentTrend[], alerts: TrendReading | null): PredictiveFinding[] {
  const out: PredictiveFinding[] = [];
  for (const t of trends) {
    if (t.tendencia === 'crescente') {
      out.push({
        titulo: `Recuperação/melhoria contínua em ${t.component} (${t.primeiro} → ${t.ultimo})`,
        base: `série de saúde crescente em ${t.pontos} pontos (Δ médio ${t.delta})`,
        confianca: t.confianca,
        evidencias: ['series.healthTimeline'],
      });
    }
    if (t.tendencia === 'estavel' && t.ultimo >= 75) {
      out.push({
        titulo: `Estabilização saudável de ${t.component} (score ${t.ultimo})`,
        base: `série estável (Δ<1) em ${t.pontos} pontos, na faixa oficial Bom/Excelente (≥75)`,
        confianca: t.confianca,
        evidencias: ['series.healthTimeline'],
      });
    }
  }
  if (alerts && alerts.tendencia === 'decrescente') {
    out.push({
      titulo: 'Redução consistente do volume de alertas',
      base: `série de 14 dias decrescente (Δ médio ${alerts.delta} alertas/dia)`,
      confianca: alerts.confianca,
      evidencias: ['series.alertas14d'],
    });
  }
  return out;
}

// ══ Templates preditivos (tendência principal) ════════════════
export type PredictiveTemplateKey =
  | 'tendencia_positiva' | 'tendencia_estavel' | 'tendencia_negativa'
  | 'tendencias_mistas' | 'historico_insuficiente';

export const PREDICTIVE_TEMPLATES: Record<PredictiveTemplateKey, { abertura: string; conclusao: string }> = {
  tendencia_positiva: {
    abertura: 'Tendência principal POSITIVA: as séries oficiais apontam melhoria.',
    conclusao: 'Conclusão preditiva: trajetória favorável — manter as condições atuais e monitorar.',
  },
  tendencia_estavel: {
    abertura: 'Tendência principal ESTÁVEL: as séries oficiais não indicam mudança de patamar.',
    conclusao: 'Conclusão preditiva: continuidade do cenário atual é o desfecho mais suportado pelas séries.',
  },
  tendencia_negativa: {
    abertura: 'Tendência principal NEGATIVA: as séries oficiais apontam degradação.',
    conclusao: 'Conclusão preditiva: sem intervenção, a degradação tende a continuar — priorizar os riscos listados.',
  },
  tendencias_mistas: {
    abertura: 'Tendências MISTAS: as séries oficiais divergem entre componentes.',
    conclusao: 'Conclusão preditiva: cenário heterogêneo — tratar riscos e aproveitar oportunidades componente a componente.',
  },
  historico_insuficiente: {
    abertura: 'Dados históricos insuficientes para previsão oficial.',
    conclusao: 'Conclusão preditiva: acumular histórico (deploy + crons) antes de qualquer projeção — nada será extrapolado sem método.',
  },
};

export function pickPredictiveTemplate(
  trends: ComponentTrend[],
  alerts: TrendReading | null,
): PredictiveTemplateKey {
  const classified = trends.filter((t) => t.tendencia !== 'sem_historico_suficiente');
  if (classified.length === 0 && !alerts) return 'historico_insuficiente';
  const up = classified.filter((t) => t.tendencia === 'crescente').length;
  const down = classified.filter((t) => t.tendencia === 'decrescente').length
    + (alerts?.tendencia === 'crescente' ? 1 : 0); // alertas subindo = negativo
  if (up > 0 && down > 0) return 'tendencias_mistas';
  if (down > 0) return 'tendencia_negativa';
  if (up > 0) return 'tendencia_positiva';
  return 'tendencia_estavel';
}

// ══ As 20 seções ══════════════════════════════════════════════
const s = (texto: string, ...evidencias: string[]): NarrativeSentence => ({ texto, evidencias });
const INSUF = 'Dados históricos insuficientes para previsão oficial.';

const CONF_LABEL: Record<TrendConfidence, string> = {
  alta: 'confiança ALTA', media: 'confiança MÉDIA', baixa: 'confiança BAIXA',
  dados_insuficientes: 'dados insuficientes',
};
const TREND_LABEL: Record<TrendLabel, string> = {
  crescente: 'crescente', estavel: 'estável', decrescente: 'decrescente',
  oscilando: 'oscilando', sem_historico_suficiente: 'sem histórico suficiente',
};

function trendSentence(t: ComponentTrend): NarrativeSentence {
  if (t.tendencia === 'sem_historico_suficiente') {
    return s(`${t.component}: ${INSUF} (${t.pontos} ponto(s) na janela).`, 'series.healthTimeline');
  }
  return s(
    `${t.component}: tendência ${TREND_LABEL[t.tendencia]} (${t.primeiro} → ${t.ultimo}; ${t.pontos} pontos; ${CONF_LABEL[t.confianca]}; método: ${t.metodo}).`,
    'series.healthTimeline',
  );
}

function verticalPredictive(key: string, titulo: string): NarrativeReportSection {
  return {
    key, titulo,
    frases: [s(`${titulo}: sem série histórica oficial — ${INSUF} (vertical aguarda métricas certificadas; M58.3 suspenso).`,
      'governanca.metricasAtivas')],
  };
}

function findingsSection(key: string, titulo: string, list: PredictiveFinding[], vazio: string): NarrativeReportSection {
  return {
    key, titulo,
    frases: list.length === 0
      ? [s(vazio, 'series.healthTimeline')]
      : list.map((f) => s(`${f.titulo} — base: ${f.base} (${CONF_LABEL[f.confianca]}).`, ...f.evidencias)),
  };
}

export function buildPredictiveSections(
  input: NarrativeInput,
  template: PredictiveTemplateKey,
  trends: ComponentTrend[],
  alerts: TrendReading | null,
  risks: PredictiveFinding[],
  opportunities: PredictiveFinding[],
): NarrativeReportSection[] {
  const projectable = trends.filter((t) => t.pontos >= PROJECTION_MIN_POINTS && t.tendencia !== 'sem_historico_suficiente');
  const pick = (label: TrendLabel) => trends.filter((t) => t.tendencia === label);

  const infraTrends = trends.filter((t) => ['banco', 'jobs', 'rpcs'].includes(t.component));

  return [
    {
      key: 'panorama', titulo: 'Panorama Preditivo',
      frases: [
        s(PREDICTIVE_TEMPLATES[template].abertura, 'series.healthTimeline', 'series.alertas14d'),
        s(`Base analisada: ${trends.length} componente(s) com série de saúde na janela de 24h e ${input.series.alertas14d.availability === 'ok' ? (input.series.alertas14d.value?.length ?? 0) : 0} dia(s) de série de alertas.`,
          'series.healthTimeline', 'series.alertas14d'),
      ],
    },
    {
      key: 'tendenciasGerais', titulo: 'Tendências Gerais',
      frases: [
        ...(trends.length === 0 ? [s(INSUF, 'series.healthTimeline')] : trends.map(trendSentence)),
        alerts
          ? s(`Alertas (14d): tendência ${TREND_LABEL[alerts.tendencia]} (${alerts.pontos} pontos; ${CONF_LABEL[alerts.confianca]}).`, 'series.alertas14d')
          : s(`Alertas (14d): ${INSUF}`, 'series.alertas14d'),
      ],
    },
    {
      key: 'saude', titulo: 'Saúde da Plataforma',
      frases: trends.length === 0
        ? [s(INSUF, 'series.healthTimeline')]
        : [s(`Distribuição das tendências de saúde: ${pick('crescente').length} crescente(s), ${pick('estavel').length} estável(is), ${pick('decrescente').length} decrescente(s), ${pick('oscilando').length} oscilando.`,
            'series.healthTimeline')],
    },
    verticalPredictive('mobilidade', 'Mobilidade'),
    verticalPredictive('marketplace', 'Marketplace'),
    verticalPredictive('financeiro', 'Financeiro'),
    verticalPredictive('atendimento', 'Atendimento'),
    verticalPredictive('suporte', 'Suporte'),
    {
      key: 'infraestrutura', titulo: 'Infraestrutura',
      frases: infraTrends.length === 0
        ? [s(`Infraestrutura: ${INSUF} (sem série de banco/jobs/RPCs na janela).`, 'series.healthTimeline')]
        : infraTrends.map(trendSentence),
    },
    {
      key: 'seguranca', titulo: 'Segurança',
      frases: [s(`Segurança preditiva: sem série histórica dedicada — ${INSUF} (integridade atual é coberta pelo narrador de governança).`,
        'governanca.catalogoAprovado')],
    },
    findingsSection('crescimentos', 'Crescimentos Detectados',
      opportunities.filter((o) => o.titulo.includes('melhoria') || o.titulo.includes('Recuperação')),
      'Nenhum crescimento detectado nas séries oficiais.'),
    findingsSection('reducoes', 'Reduções Detectadas',
      risks.filter((r) => r.titulo.includes('Degradação')),
      'Nenhuma redução detectada nas séries oficiais.'),
    findingsSection('riscos', 'Riscos Emergentes', risks,
      'Nenhum risco emergente apontado pelas séries oficiais.'),
    findingsSection('oportunidades', 'Oportunidades Emergentes', opportunities,
      'Nenhuma oportunidade emergente apontada pelas séries oficiais.'),
    {
      key: 'estaveis', titulo: 'Indicadores Estáveis',
      frases: pick('estavel').length === 0
        ? [s('Nenhum indicador estável na janela (ou histórico insuficiente).', 'series.healthTimeline')]
        : pick('estavel').map(trendSentence),
    },
    {
      key: 'volateis', titulo: 'Indicadores Voláteis',
      frases: pick('oscilando').length === 0
        ? [s('Nenhum indicador volátil detectado.', 'series.healthTimeline')]
        : pick('oscilando').map(trendSentence),
    },
    {
      key: 'projCurto', titulo: 'Projeções de Curto Prazo (24h)',
      frases: projectable.length === 0
        ? [s(`${INSUF} Projeção exige ≥${PROJECTION_MIN_POINTS} pontos — o mesmo piso do cio_health_predict oficial.`, 'series.healthTimeline')]
        : projectable.map((t) =>
            s(`${t.component}: manutenção da tendência ${TREND_LABEL[t.tendencia]} é o cenário suportado pela série (${t.pontos} pontos; ${CONF_LABEL[t.confianca]}). Projeção NUMÉRICA oficial: cio_health_predict (service) — não exibida sem a fonte.`,
              'series.healthTimeline')),
    },
    {
      key: 'projMedio', titulo: 'Projeções de Médio Prazo (7–14d)',
      frases: !alerts || alerts.pontos < PROJECTION_MIN_POINTS
        ? [s(`${INSUF} (série de alertas com ${alerts?.pontos ?? 0} ponto(s); mínimo ${PROJECTION_MIN_POINTS}).`, 'series.alertas14d')]
        : [s(`Volume de alertas: continuidade da tendência ${TREND_LABEL[alerts.tendencia]} é o cenário suportado (${alerts.pontos} dias; ${CONF_LABEL[alerts.confianca]}; método: ${alerts.metodo}).`,
            'series.alertas14d')],
    },
    {
      key: 'confianca', titulo: 'Confiança das Projeções',
      frases: [
        s(`Escala de confiança POR VOLUME de série: ≥20 pontos alta · ≥10 média · ≥4 baixa · <4 dados insuficientes. Projeções exigem ≥${PROJECTION_MIN_POINTS} pontos (piso oficial do banco).`,
          'series.healthTimeline'),
        ...(trends.length
          ? [s(`Leituras atuais: ${trends.map((t) => `${t.component}=${CONF_LABEL[t.confianca]}`).join('; ')}.`, 'series.healthTimeline')]
          : []),
      ],
    },
    {
      key: 'conclusao', titulo: 'Conclusão Preditiva',
      frases: [s(PREDICTIVE_TEMPLATES[template].conclusao, 'series.healthTimeline', 'series.alertas14d')],
    },
  ];
}

// ══ O narrador ════════════════════════════════════════════════
export interface PredictiveNarrativeResult {
  report: NarrativeReport;
  trends: ComponentTrend[];
  alertsTrend: TrendReading | null;
  risks: PredictiveFinding[];
  opportunities: PredictiveFinding[];
}

export function narratePredictiveDeterministic(
  engineOutput: NarrativeEngineOutput,
): PredictiveNarrativeResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const input = engineOutput.input;
  const trends = componentTrends(input);
  const alerts = alertsTrend(input);
  const risks = detectRisks(trends, alerts);
  const opportunities = detectOpportunities(trends, alerts);
  const template = pickPredictiveTemplate(trends, alerts);
  const secoes = buildPredictiveSections(input, template, trends, alerts, risks, opportunities);
  const duracaoMs =
    typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 100) / 100 : null;
  return {
    report: {
      narrator: 'predictive', modo: 'deterministico', template,
      geradoEm: input.meta.geradoEm, duracaoMs, secoes,
      mudancas: [s('Comparação temporal preditiva: as próprias séries são a evolução (janelas de 24h e 14d).',
        'series.healthTimeline', 'series.alertas14d')],
    },
    trends,
    alertsTrend: alerts,
    risks,
    opportunities,
  };
}

/** Predictive híbrido — mesmo orquestrador/guard/fallback dos demais. */
export async function narratePredictive(
  engineOutput: NarrativeEngineOutput,
  opts: NarrateOptions = {},
): Promise<PredictiveNarrativeResult> {
  const det = narratePredictiveDeterministic(engineOutput);
  const report = await narrateHybrid(det.report, engineOutput.input, opts);
  return { ...det, report };
}

export const PREDICTIVE_SECTION_COUNT = 20;
