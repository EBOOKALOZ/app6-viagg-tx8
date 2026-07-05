/**
 * M59.2 · Executive Deterministic Narrator — o narrador OFICIAL do Programa CIO.
 *
 * Sempre disponível; nunca depende de LLM, Edge ou APIs externas.
 * Consome exclusivamente o NarrativeInput (contrato único do M59.1).
 * TODA frase carrega os caminhos das NarrativeEvidence que a sustentam —
 * nenhuma frase existe sem evidência rastreável. Campo indisponível vira,
 * SEMPRE, a declaração "Aguardando fonte oficial." — jamais um palpite.
 * Puro e determinístico: mesmas fontes ⇒ mesma narrativa, byte a byte.
 */

import type { NarrativeInput, NarrativeEvidence } from '../types';
import type { NarrativeEngineOutput } from '../engine';

// ── Contratos do relatório narrado ────────────────────────────
export type SituationTemplateKey = 'excelente' | 'boa' | 'atencao' | 'critica' | 'offline';

export interface NarrativeSentence {
  texto: string;
  /** caminhos de evidência (explain(caminho) resolve cada um) */
  evidencias: string[];
}

export interface NarrativeReportSection {
  key: string;
  titulo: string;
  frases: NarrativeSentence[];
}

export interface NarrativeReport {
  narrator: 'executive' | 'operations' | 'predictive' | 'strategic';
  modo: 'deterministico' | 'generativo';
  /** chave do template de situação do narrador (executive: 5; operations: 6) */
  template: string;
  geradoEm: string;
  duracaoMs: number | null;
  secoes: NarrativeReportSection[];
  /** "o que mudou desde a última execução" (comparação de dois snapshots oficiais) */
  mudancas: NarrativeSentence[];
  /** presente quando o modo generativo falhou e o determinístico assumiu */
  fallbackMotivo?: string;
}

// ── Os 5 templates oficiais de situação (Template Registry) ───
export const SITUATION_TEMPLATES: Record<SituationTemplateKey, { abertura: string; conclusao: string }> = {
  excelente: {
    abertura: 'A plataforma está em situação EXCELENTE.',
    conclusao: 'Conclusão: operação em excelência; manter a rotina de monitoramento.',
  },
  boa: {
    abertura: 'A plataforma está em situação BOA.',
    conclusao: 'Conclusão: operação saudável; acompanhar os pontos de atenção listados.',
  },
  atencao: {
    abertura: 'A plataforma requer ATENÇÃO.',
    conclusao: 'Conclusão: há degradação declarada; tratar os itens de atenção antes que escalem.',
  },
  critica: {
    abertura: 'A plataforma está em situação CRÍTICA.',
    conclusao: 'Conclusão: priorize imediatamente os componentes críticos usando os runbooks determinísticos do Alert Center.',
  },
  offline: {
    abertura: 'Situação geral indisponível — aguardando fonte oficial.',
    conclusao: 'Conclusão: sem dados suficientes para avaliar; verifique implantação, crons e fontes (nada será estimado).',
  },
};

/** Escolha do template — SÓ campos oficiais; zero cálculo paralelo. */
export function pickSituationTemplate(input: NarrativeInput): SituationTemplateKey {
  const situacao = input.situacaoGeral.situacao;
  const score = input.situacaoGeral.scoreGeral;
  if (situacao.availability !== 'ok' || situacao.value === null) return 'offline';
  if (situacao.value === 'CRITICO') return 'critica';
  if (situacao.value === 'ATENCAO') return 'atencao';
  // SAUDAVEL: excelente segue o corte OFICIAL do Health Center (≥90)
  if (score.availability === 'ok' && score.value !== null && score.value >= 90) return 'excelente';
  return 'boa';
}

// ── Construção de frases (evidência obrigatória) ──────────────
const AGUARDANDO = 'Aguardando fonte oficial';

function s(texto: string, ...evidencias: string[]): NarrativeSentence {
  return { texto, evidencias };
}

/** Frase a partir de UMA evidência: valor ok narra; indisponível DECLARA. */
function fromEv(
  label: string,
  path: string,
  ev: NarrativeEvidence,
  render: (v: NonNullable<unknown>) => string,
): NarrativeSentence {
  if (ev.availability !== 'ok' || ev.value === null) {
    return s(`${label}: ${AGUARDANDO} (${ev.availability}).`, path);
  }
  return s(render(ev.value), path);
}

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

// ── As 9 seções, na ordem obrigatória da spec ─────────────────
function buildSections(input: NarrativeInput, template: SituationTemplateKey): NarrativeReportSection[] {
  const sg = input.situacaoGeral;
  const h = input.health;
  const al = input.alertas;
  const gv = input.governanca;
  const inc = input.incidentes;
  const q = input.quality;
  const is = input.issues;
  const es = input.executiveSummary;

  // 1 · Situação Geral
  const situacao: NarrativeSentence[] = [
    s(SITUATION_TEMPLATES[template].abertura, 'situacaoGeral.situacao'),
    fromEv('Health Score geral', 'situacaoGeral.scoreGeral', sg.scoreGeral,
      (v) => `O Health Score geral é ${v} em 100.`),
    fromEv('Tendência operacional', 'situacaoGeral.tendenciaOperacional', sg.tendenciaOperacional,
      (v) => `A tendência operacional está "${v}" segundo o Alert Center.`),
  ];

  // 2 · Health
  const health: NarrativeSentence[] = [
    fromEv('Componentes críticos', 'health.componentesCriticos', h.componentesCriticos,
      (v) => {
        const list = v as string[];
        return list.length === 0
          ? 'Nenhum componente em estado crítico.'
          : `${list.length} ${plural(list.length, 'componente crítico', 'componentes críticos')}: ${list.join(', ')}.`;
      }),
    fromEv('Componentes saudáveis', 'health.saudaveis', h.saudaveis,
      (v) => `${v} ${plural(v as number, 'componente saudável', 'componentes saudáveis')} nas medições atuais.`),
    fromEv('Componentes degradados', 'health.degradados', h.degradados,
      (v) => `${v} em degradação (Atenção ou Crítico).`),
  ];

  // 3 · Operação
  const operacao: NarrativeSentence[] = [
    fromEv('Incidentes ativos', 'incidentes.ativos', inc.ativos,
      (v) => (v === 0 ? 'Operação sem incidentes ativos.' : `Operação com ${v} ${plural(v as number, 'incidente ativo', 'incidentes ativos')}.`)),
    fromEv('Disponibilidade', 'executiveSummary.disponibilidadeComponentesChave', es.disponibilidadeComponentesChave,
      (v) => {
        const entries = Object.entries(v as Record<string, number | null>).filter(([, pct]) => pct != null);
        return entries.length === 0
          ? `Disponibilidade dos componentes-chave: ${AGUARDANDO} (sem janelas medidas).`
          : `Disponibilidade 30d dos componentes-chave: ${entries.map(([c, pct]) => `${c} ${pct}%`).join(', ')}.`;
      }),
  ];

  // 4 · Governança
  const governanca: NarrativeSentence[] = [
    fromEv('Catálogo semântico', 'governanca.catalogoAprovado', gv.catalogoAprovado,
      (v) => (v === true
        ? 'O catálogo semântico está APROVADO pelo validator (self-audit de 7 checks).'
        : 'O catálogo semântico está REPROVADO pelo validator — tratar antes de confiar nos números.')),
    fromEv('Métricas ativas', 'governanca.metricasAtivas', gv.metricasAtivas,
      (v) => `${v} métricas ativas no catálogo oficial.`),
  ];

  // 5 · Alertas (inclui riscos oficiais)
  const alertas: NarrativeSentence[] = [
    fromEv('Alertas ativos', 'alertas.ativos', al.ativos,
      (v) => (v === 0 ? 'Nenhum alerta ativo no momento.' : `${v} ${plural(v as number, 'alerta ativo', 'alertas ativos')}.`)),
    fromEv('Alertas críticos', 'alertas.criticos', al.criticos,
      (v) => (v === 0 ? 'Nenhum em severidade crítica ou emergência.' : `${v} em severidade crítica/emergência.`)),
    fromEv('Maiores riscos', 'alertas.maioresRiscos', al.maioresRiscos,
      (v) => {
        const list = v as { regra: string; severidade: string }[];
        return list.length === 0
          ? 'Sem riscos apontados pelas regras oficiais.'
          : `Riscos apontados: ${list.map((r) => `${r.regra} (${r.severidade})`).join(', ')}.`;
      }),
    fromEv('Avisos antecipados', 'alertas.avisosAntecipados', al.avisosAntecipados,
      (v) => {
        const list = v as string[];
        return list.length === 0
          ? 'Early warning sem avisos de tendência.'
          : `Early warning detectou: ${list.join(', ')}.`;
      }),
  ];

  // 6 · Incidentes
  const incidentes: NarrativeSentence[] = [
    fromEv('Últimos incidentes', 'incidentes.ultimos', inc.ultimos,
      (v) => {
        const list = v as { componente: string; status: string }[];
        return list.length === 0
          ? 'Sem incidentes registrados na janela.'
          : `Incidentes recentes: ${list.map((i) => `${i.componente} (${i.status === 'open' ? 'aberto' : 'resolvido'})`).join(', ')}.`;
      }),
  ];

  // 7 · Qualidade (resumo do validator + qualidade das métricas)
  const qualidade: NarrativeSentence[] = [
    fromEv('Métricas com qualidade baixa', 'quality.metricasAbaixoDe07', q.metricasAbaixoDe07,
      (v) => {
        const list = v as string[];
        return list.length === 0
          ? 'Nenhuma métrica ativa com score de qualidade abaixo de 0.7.'
          : `Métricas com qualidade abaixo de 0.7: ${list.join(', ')}.`;
      }),
    fromEv('Issues abertas', 'issues.abertas', is.abertas,
      (v) => (v === 0 ? 'Sem issues de qualidade abertas.' : `${v} ${plural(v as number, 'issue de qualidade aberta', 'issues de qualidade abertas')} na janela.`)),
    fromEv('Drift', 'issues.drift', is.drift,
      (v) => (v === 0 ? 'Sem drift detectado.' : `${v} ${plural(v as number, 'apontamento de drift', 'apontamentos de drift')}.`)),
  ];

  // 8 · Observações (ausências SEMPRE declaradas)
  const observacoes: NarrativeSentence[] = [
    fromEv('Componentes sem telemetria', 'health.componentesOffline', h.componentesOffline,
      (v) => {
        const list = v as string[];
        return list.length === 0
          ? 'Todos os componentes registrados possuem telemetria.'
          : `Sem telemetria (nunca estimados): ${list.join(', ')}.`;
      }),
    fromEv('Certificação enterprise', 'governanca.metricasEnterprise', gv.metricasEnterprise,
      (v) => (v === 0
        ? 'Nenhuma métrica certificada como enterprise ainda — as verticais aguardam certificação; este narrador declara a ausência em vez de estimar.'
        : `${v} ${plural(v as number, 'métrica certificada', 'métricas certificadas')} como enterprise.`)),
    s('Ações corretivas: usar os runbooks determinísticos do Alert Center (recomendações oficiais por alerta).',
      'alertas.maioresRiscos'),
  ];

  // 9 · Conclusão
  const conclusao: NarrativeSentence[] = [
    s(SITUATION_TEMPLATES[template].conclusao, 'situacaoGeral.situacao', 'situacaoGeral.scoreGeral'),
  ];

  return [
    { key: 'situacao', titulo: 'Situação Geral', frases: situacao },
    { key: 'health', titulo: 'Health', frases: health },
    { key: 'operacao', titulo: 'Operação', frases: operacao },
    { key: 'governanca', titulo: 'Governança', frases: governanca },
    { key: 'alertas', titulo: 'Alertas', frases: alertas },
    { key: 'incidentes', titulo: 'Incidentes', frases: incidentes },
    { key: 'qualidade', titulo: 'Qualidade', frases: qualidade },
    { key: 'observacoes', titulo: 'Observações', frases: observacoes },
    { key: 'conclusao', titulo: 'Conclusão', frases: conclusao },
  ];
}

// ── "O que mudou desde a última execução" — comparação de snapshots oficiais ──
const DIFF_FIELDS: { path: string; label: string; get: (i: NarrativeInput) => unknown }[] = [
  { path: 'situacaoGeral.situacao', label: 'situação geral', get: (i) => i.situacaoGeral.situacao.value },
  { path: 'situacaoGeral.scoreGeral', label: 'health score', get: (i) => i.situacaoGeral.scoreGeral.value },
  { path: 'situacaoGeral.tendenciaOperacional', label: 'tendência', get: (i) => i.situacaoGeral.tendenciaOperacional.value },
  { path: 'alertas.ativos', label: 'alertas ativos', get: (i) => i.alertas.ativos.value },
  { path: 'incidentes.ativos', label: 'incidentes ativos', get: (i) => i.incidentes.ativos.value },
  { path: 'governanca.catalogoAprovado', label: 'catálogo aprovado', get: (i) => i.governanca.catalogoAprovado.value },
  { path: 'issues.abertas', label: 'issues abertas', get: (i) => i.issues.abertas.value },
  { path: 'governanca.metricasEnterprise', label: 'métricas enterprise', get: (i) => i.governanca.metricasEnterprise.value },
];

export function diffNarrativeInputs(
  prev: NarrativeInput | null,
  cur: NarrativeInput,
): NarrativeSentence[] {
  if (!prev) {
    return [s('Primeira execução da sessão — sem base de comparação.', 'situacaoGeral.situacao')];
  }
  const out: NarrativeSentence[] = [];
  for (const f of DIFF_FIELDS) {
    const a = f.get(prev);
    const b = f.get(cur);
    if (a !== b && (a !== null || b !== null)) {
      const show = (v: unknown) => (v === null || v === undefined ? 'sem dado' : String(v));
      out.push(s(`${f.label}: ${show(a)} → ${show(b)}.`, f.path));
    }
  }
  return out.length
    ? out
    : [s('Sem mudanças nos indicadores-chave desde a última execução.', 'situacaoGeral.situacao')];
}

// ── O narrador ────────────────────────────────────────────────
export function narrateExecutiveDeterministic(
  engineOutput: NarrativeEngineOutput,
  prev: NarrativeInput | null = null,
): NarrativeReport {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const input = engineOutput.input;
  const template = pickSituationTemplate(input);
  const secoes = buildSections(input, template);
  const mudancas = diffNarrativeInputs(prev, input);
  const duracaoMs =
    typeof performance !== 'undefined' ? Math.round((performance.now() - t0) * 100) / 100 : null;

  return {
    narrator: 'executive',
    modo: 'deterministico',
    template,
    geradoEm: input.meta.geradoEm,
    duracaoMs,
    secoes,
    mudancas,
  };
}

/** Invariante dos narradores: NENHUMA frase sem evidência (usada no self-test).
 *  `expectedSections` = 9 (executive) por padrão; narradores maiores informam o seu. */
export function reportInvariants(report: NarrativeReport, expectedSections = 9): string[] {
  const problems: string[] = [];
  for (const sec of report.secoes) {
    if (sec.frases.length === 0) problems.push(`seção vazia: ${sec.key}`);
    for (const f of sec.frases) {
      if (f.evidencias.length === 0) problems.push(`frase sem evidência em ${sec.key}: "${f.texto}"`);
    }
  }
  for (const m of report.mudancas) {
    if (m.evidencias.length === 0) problems.push(`mudança sem evidência: "${m.texto}"`);
  }
  if (report.secoes.length !== expectedSections)
    problems.push(`esperadas ${expectedSections} seções, vieram ${report.secoes.length}`);
  return problems;
}
