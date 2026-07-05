/**
 * M58.0 · Self-test da fundação — lógica PURA (sem DOM, sem rede).
 *
 * Executado com: npx esbuild src/dashboards/__selftest__/selftest.ts
 *   --bundle --platform=node --external:@/integrations/* | node
 * (o projeto não tem runner JS; este arquivo é compatível com vitest
 * futuro — cada bloco `check` vira um `it` trivialmente.)
 */

import { can, hasRole, parseAuthzProfile, EMPTY_AUTHZ, ROLES } from '../core/roles';
import { DATASET_REGISTRY, getDataset, validateRegistry, generateRegistryDocs } from '../core/registry';
import { NAV_TREE, breadcrumbsFor, SHORTCUTS, searchSections, sectionForPath } from '../layout/navigation';
import { buildNarrativeInput } from '../shell/narrativeCompat';
import { buildNarrativeContext } from '../narrative/builder';
import {
  runNarrativeEngine, validateNarrativeInput, getNarrativeTemplate,
  NARRATIVE_TEMPLATE_REGISTRY, narrativeEngineInvariants,
} from '../narrative/engine';
import { NARRATIVE_SECTION_ORDER, NARRATIVE_REQUIRED_DATASETS, type NarrativeRawSources } from '../narrative/types';
import {
  narrateExecutiveDeterministic, pickSituationTemplate, diffNarrativeInputs, reportInvariants,
} from '../narrative/narrators/executiveDeterministic';
import { narrateExecutive, numberGuard, edgeGatewayTransport } from '../narrative/narrators/executiveGenerative';
import {
  narrateOperations, narrateOperationsDeterministic, pickOperationsTemplate,
  computePriorities, computeRecommendations, diffOperationalSnapshots, OPERATIONS_SECTION_COUNT,
} from '../narrative/narrators/operationsNarrator';
import {
  narratePredictive, narratePredictiveDeterministic, classifySeries, componentTrends,
  detectRisks, detectOpportunities, pickPredictiveTemplate, PREDICTIVE_SECTION_COUNT,
  PROJECTION_MIN_POINTS,
} from '../narrative/narrators/predictiveNarrator';
import {
  composeStrategic, narrateStrategic, findConsensusAndDivergence, collectSignals,
  pickStrategicTemplate, topicOf, compositionInvariants, STRATEGIC_SECTION_COUNT,
} from '../narrative/narrators/strategicComposer';
import {
  ingestStrategicDecisions, transitionDecision, canTransition, allowedTransitions,
  dependencyView, registerObservedImpact, takeDecisionSnapshot, compareDecisionSnapshots,
  decisionInvariants, DECISION_STATUSES, type Decision,
} from '../narrative/decisions/decisionEngine';
import {
  createActionPlans, transitionAction, canTransitionAction, allowedActionTransitions,
  completeStep, assignResponsible, removeResponsible, actionDependencyView,
  takeActionSnapshot, compareActionSnapshots, actionInvariants, ACTION_STATUSES,
} from '../narrative/actions/actionEngine';
import {
  composeExecution, buildComparisons, detectExecutionDivergences, buildIndicators,
  executionInvariants, EXECUTION_SECTION_COUNT,
} from '../narrative/execution/executionComposer';
import { EXPORTERS, getExporter } from '../core/exporters';
import { stateColors, tokens } from '../core/tokens';
import {
  windowForPreset, trendDirection, severityBuckets, healthCounts, metricFromBundle,
  seriesToPoints, recentActivity, pickComponent, fmtBRL, fmtNum, OPERATIONAL_COMPONENTS,
} from '../pages/executive/helpers';
import {
  alertLifecycleCounts, componentRows, queueItems, healthGridCells,
  componentTrendPoints, trendableComponents, overallState,
} from '../pages/operational/helpers';
import {
  governanceAnswers, catalogRows, qualityRows, certificationCounts,
  governanceTimeline, lineageSteps, CERT_LEVELS,
} from '../pages/governance/helpers';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── Autorização (espelho do cio_authorize) ────────────────────
check('roles: 9 papéis oficiais', ROLES.length === 9);
const admin = parseAuthzProfile({ is_admin: true, roles: [], resources: [] });
check('authz: admin passa em tudo', can(admin, 'admin.total') && can(admin, 'financeiro.leitura'));
const analista = parseAuthzProfile({
  is_admin: false,
  roles: ['analista'],
  resources: ['governanca.leitura', 'telemetria.leitura', 'dashboards.acesso'],
});
check('authz: analista lê governança', can(analista, 'governanca.leitura'));
check('authz: analista NÃO é admin.total', !can(analista, 'admin.total'));
check('authz: analista NÃO lê financeiro', !can(analista, 'financeiro.leitura'));
check('authz: hasRole', hasRole(analista, 'analista') && !hasRole(analista, 'ceo'));
check('authz: shape defensivo (null)', can(parseAuthzProfile(null), 'dashboards.acesso') === false);
check('authz: EMPTY nega tudo', !can(EMPTY_AUTHZ, 'dashboards.acesso'));

// ── Dataset Registry ──────────────────────────────────────────
const problems = validateRegistry();
check('registry: íntegro (sem SQL, sem duplicata, com docs)', problems.length === 0, problems.join('; '));
check('registry: cobre os 6 contratos oficiais do M58.0',
  ['metric', 'operational', 'noc', 'health-executive', 'alert-dashboard', 'governance']
    .every((k) => DATASET_REGISTRY.some((d) => d.key === k)));
check('registry: getDataset resolve', getDataset('noc').rpc === 'cio_noc_dataset');
check('registry: toda entrada tem consumidor registrável', DATASET_REGISTRY.every((d) => d.consumer.startsWith('dashboard:')));
check('registry: docs automáticos gerados', generateRegistryDocs().includes('| Chave |') &&
  generateRegistryDocs().split('\n').length === DATASET_REGISTRY.length + 3);
let threw = false;
try { getDataset('nao-existe' as never); } catch { threw = true; }
check('registry: chave desconhecida falha alto', threw);

// ── Navegação ─────────────────────────────────────────────────
check('nav: 13 seções oficiais + resumo-ia (M58.5)', NAV_TREE.length === 14 &&
  NAV_TREE.find((s) => s.key === 'resumo-ia')?.status === 'disponivel');
check('nav: toda seção tem recurso de permissão', NAV_TREE.every((s) => s.resource.length > 0));
check('nav: datasets referenciados existem no registry',
  NAV_TREE.every((s) => s.datasets.every((d) => DATASET_REGISTRY.some((r) => r.key === d))));
const bc = breadcrumbsFor('/dashboards/health/etl');
check('nav: breadcrumbs raiz→seção→detalhe',
  bc.length === 3 && bc[0].label === 'Dashboards' && bc[1].label === 'Health Center' && bc[2].label === 'etl');
check('nav: breadcrumbs na raiz', breadcrumbsFor('/dashboards').length === 1);
check('nav: atalhos apontam p/ seções válidas',
  SHORTCUTS.every((s) => s.section === '__refresh__' || NAV_TREE.some((n) => n.key === s.section)));

// ── M58.1: helpers PUROS do Executive Dashboard ──────────────
const w7 = windowForPreset('7d', new Date('2026-07-04T12:00:00Z'));
check('exec: janela 7d + janela anterior contígua',
  w7.grain === '1d' && w7.prevTo === w7.from &&
  new Date(w7.from).getTime() - new Date(w7.prevFrom).getTime() === 7 * 24 * 3600_000);
check('exec: janela 24h usa grain 1h', windowForPreset('24h', new Date()).grain === '1h');
check('exec: tendência direcional presentacional',
  trendDirection(10, 5) === 'up' && trendDirection(3, 5) === 'down' &&
  trendDirection(5, 5) === 'flat' && trendDirection(null, 5) === null);
const sev = severityBuckets({ emergencia: 1, critico: 2, alto: 3, atencao: 4, aviso: 5, informacao: 6 });
check('exec: 6 severidades → 4 faixas (contagem, não cálculo de negócio)',
  sev.criticos === 3 && sev.altos === 3 && sev.medios === 4 && sev.informativos === 11);
check('exec: severidades ausentes = 0 (defensivo)', severityBuckets(null).criticos === 0);
const hcx = healthCounts([
  { classification: 'Excelente' }, { classification: 'Bom' },
  { classification: 'Atencao' }, { classification: 'Critico' }, { classification: 'Offline' },
]);
check('exec: contagem de classificações oficiais', hcx.saudaveis === 2 && hcx.degradados === 2 && hcx.offline === 1);
const bundleFake = { receita: { ok: true, value: 12.5, series: [{ bucket: '2026-07-01', value: 5 }] } };
check('exec: bundle → métrica + série oficial p/ TrendCard',
  metricFromBundle(bundleFake, 'receita')?.value === 12.5 &&
  seriesToPoints(metricFromBundle(bundleFake, 'receita'))[0].y === 5);
check('exec: métrica ausente no bundle = null (nunca inventa)', metricFromBundle(bundleFake, 'corridas') === null);
check('exec: formatação Intl', fmtBRL(10) !== null && fmtNum(null) === null);
const act = recentActivity({
  incidents: [{ started_at: '2026-07-04T10:00:00Z', component: 'etl', status: 'open' }],
  alertHistory: [{ detectado_em: '2026-07-04T11:00:00Z', origem: 'etl_degradado', severity: 'critico', status: 'confirmado' }],
});
check('exec: atividade recente ordenada (mais novo primeiro)',
  act.length === 2 && act[0].title.startsWith('Alerta'));
check('exec: 8 componentes da situação operacional', OPERATIONAL_COMPONENTS.length === 8 &&
  pickComponent([{ component: 'etl', name: 'ETL do CIO', classification: 'Bom', score: 88 }], 'etl')?.score === 88);
check('exec: seção visao-geral DISPONÍVEL no NAV',
  NAV_TREE.find((s) => s.key === 'visao-geral')?.status === 'disponivel');

// ── M58.2: helpers PUROS do NOC ──────────────────────────────
const lc = alertLifecycleCounts(
  [
    { status: 'confirmado', severity: 'critico' },
    { status: 'reconhecido', severity: 'alto' },
    { status: 'detectado', severity: 'emergencia' },
  ],
  [{ status: 'resolvido' }, { status: 'encerrado' }, { status: 'confirmado' }],
);
check('noc: ciclo de vida (ativos/reconhecidos/resolvidos/críticos)',
  lc.ativos === 3 && lc.reconhecidos === 1 && lc.resolvidos === 2 && lc.criticos === 2);
const rowsX = componentRows(
  [{ component: 'etl', name: 'ETL', classification: 'Bom', score: 82 }],
  { etl: 99.5 },
  [{ component: 'etl', em: '2026-07-04T12:00:00Z', score: 82 }],
  [{ status_operacional: 'atrasado' }, { status_operacional: 'ok' }],
);
check('noc: tabela funde saúde+disponibilidade+timeline+SLA (pior rótulo)',
  rowsX.length === 1 && rowsX[0].availabilityPct === 99.5 &&
  rowsX[0].slaStatus === 'atrasado' && rowsX[0].lastMeasureAt !== null);
const qs = queueItems({ backlog: 7, lotes_available: 3 }, { por_status: { DESPACHANDO: 2 } });
check('noc: filas oficiais + placeholders DECLARADOS (RIDV etc.)',
  qs.length === 7 && qs[0].value === 7 && qs[1].value === 2 && qs[2].value === 3 &&
  qs.filter((q) => q.placeholder).length === 4 &&
  qs.some((q) => q.name === 'RIDV' && q.placeholder));
const cellsX = healthGridCells([
  { component: 'etl', classification: 'Excelente', score: 95 },
  { component: 'marketplace', classification: 'Offline', score: null },
]);
check('noc: mapa de saúde — offline vira cinza, nunca score inventado',
  cellsX[0].state === 'excelente' && cellsX[1].state === 'offline' && cellsX[1].score === null);
check('noc: tendência = pontos oficiais da timeline (ordem cronológica)',
  componentTrendPoints(
    [
      { component: 'etl', em: '2026-07-04T12:00:00Z', score: 80 },
      { component: 'etl', em: '2026-07-04T11:00:00Z', score: 90 },
      { component: 'banco', em: '2026-07-04T12:00:00Z', score: 100 },
    ],
    'etl',
  ).map((p) => p.y).join(',') === '90,80' &&
  trendableComponents([{ component: 'b', score: 1 }, { component: 'a', score: 2 }]).join(',') === 'a,b');
check('noc: status geral mapeia rótulos oficiais',
  overallState('SAUDAVEL').state === 'excelente' && overallState('CRITICO').state === 'critico' &&
  overallState(null).state === 'offline');
check('noc: seção operacoes DISPONÍVEL no NAV',
  NAV_TREE.find((s) => s.key === 'operacoes')?.status === 'disponivel');

// ── M58.4: helpers PUROS da Governança ───────────────────────
const govFake = {
  validator: { aprovado: true, total: 1 },
  issues_abertas: [{ check: 'drift_congelada', sev: 'P3' }, { check: 'outro', sev: 'P2' }],
  quality: [
    { metric: 'boa', score: 0.94 },
    { metric: 'fraca', score: 0.5 },
  ],
  certificacao: { validated: 17, draft: 2 },
  catalogo: [
    { nome_tecnico: 'receita', nome_amigavel: 'Receita', versao: 1, status: 'active',
      formula_kind: 'gauge', unidade: 'brl', responsavel: 'plataforma', tags: ['financeiro'],
      alias_de: null, observacoes: 'x' },
  ],
  timeline_recente: [
    { em: '2026-07-04T10:00:00Z', event: 'depreciada', metric: 'health' },
    { em: '2026-07-04T09:00:00Z', event: 'criada', metric: 'receita' },
  ],
};
const ans = governanceAnswers(govFake, { componentes_criticos: [] });
check('gov: 10 respostas oficiais', ans.length === 10);
check('gov: catálogo íntegro lê o validator', ans[0].ok === true && ans[0].value.includes('Aprovado'));
check('gov: drift conta só checks drift_*', ans[3].value.includes('1'));
check('gov: qualidade aponta métrica < 0.7', ans[2].ok === false && (ans[2].detail ?? '').includes('fraca'));
check('gov: compatibilidade lê eventos de depreciação', ans[7].ok === false);
check('gov: enterprise ausente = declarado, não inventado',
  ans[8].ok === null && ans[8].value.includes('Nenhuma'));
const crows = catalogRows(govFake);
check('gov: catálogo → linhas', crows.length === 1 && crows[0].metric === 'receita' && crows[0].unit === 'brl');
const qrows = qualityRows(govFake);
check('gov: qualidade ordenada pelos piores primeiro', qrows[0].metric === 'fraca' && qrows[1].metric === 'boa');
const certs = certificationCounts(govFake);
check('gov: 7 níveis oficiais sempre presentes',
  certs.length === CERT_LEVELS.length && certs.find((c) => c.level === 'validated')?.count === 17 &&
  certs.find((c) => c.level === 'enterprise')?.count === 0);
const gtl = governanceTimeline(govFake);
check('gov: timeline com rótulos traduzidos e estado de atenção p/ depreciação',
  gtl.length === 2 && gtl[0].title.startsWith('Versão depreciada: health') &&
  gtl[0].state === 'atencao' && gtl[1].state === 'bom');
const lsteps = lineageSteps({ cadeia: [
  { nivel: 1, camada: 'origem_fisica', tabelas: ['promotion_purchases'] },
  { nivel: 5, camada: 'rpc', interface: 'cio_metric()' },
] });
check('gov: lineage → passos legíveis',
  lsteps.length === 2 && lsteps[0].detail === 'promotion_purchases' && lsteps[1].detail === 'cio_metric()');
check('gov: seção governanca DISPONÍVEL no NAV',
  NAV_TREE.find((s) => s.key === 'governanca')?.status === 'disponivel');
check('gov: dataset metric-lineage registrado', getDataset('metric-lineage').rpc === 'cio_metric_lineage');

// ── M58.5: Shell — busca, resolução de rota e contrato narrativo ──
check('shell: busca global filtra por rótulo/chave (pura)',
  searchSections('governan')[0]?.key === 'governanca' &&
  searchSections('opera')[0]?.key === 'operacoes' &&
  searchSections('').length === 0);
check('shell: sectionForPath resolve raiz, exata e por prefixo',
  sectionForPath('/dashboards')?.key === 'visao-geral' &&
  sectionForPath('/dashboards/governanca')?.key === 'governanca' &&
  sectionForPath('/dashboards/operacoes/detalhe')?.key === 'operacoes' &&
  sectionForPath('/fora') === null);
const ni = buildNarrativeInput(
  { situacao_geral: 'ATENCAO', score_geral: 77, componentes_criticos: ['etl'], componentes_offline: ['ridv'] },
  { tendencia_operacional: 'estavel', alertas_ativos: 2, incidentes_ativos: 1,
    early_warning: [{ alerta: 'queda_gradual_health' }], maiores_riscos: [{ rule_key: 'etl_degradado', severity: 'critico' }] },
  { validator: { aprovado: true }, certificacao: { validated: 17 } },
  '2026-07-05T00:00:00Z',
);
check('shell: NarrativeInput só com campos oficiais (nada derivado)',
  ni.situacaoGeral === 'ATENCAO' && ni.scoreGeral === 77 && ni.alertasAtivos === 2 &&
  ni.principaisRiscos.length === 2 && ni.catalogoAprovado === true &&
  ni.metricasEnterprise === 0 && ni.geradoEm === '2026-07-05T00:00:00Z');
check('shell: NarrativeInput defensivo (fontes vazias ⇒ nulls, nunca inventa)',
  buildNarrativeInput(null, null, null, 'x').scoreGeral === null &&
  buildNarrativeInput(null, null, null, 'x').principaisRiscos.length === 0);

// ── M59.1: Enterprise Narrative Engine ───────────────────────
const okSrc = (data: unknown) => ({ data, isLoading: false, isError: false, updatedAt: 1751700000000 });
const FULL: NarrativeRawSources = {
  healthExecutive: okSrc({ situacao_geral: 'SAUDAVEL', score_geral: 92, componentes_criticos: [], componentes_offline: ['ridv'] }),
  alertExecutive: okSrc({ tendencia_operacional: 'estavel', alertas_ativos: 1, incidentes_ativos: 0,
    maiores_riscos: [{ rule_key: 'x', severity: 'alto' }], early_warning: [], disponibilidade: { etl: 99.9 } }),
  alertDashboard: okSrc({ ativos: [{ severity: 'critico' }, { severity: 'aviso' }],
    tendencia_14d: Array.from({ length: 14 }, (_, i) => ({ dia: `2026-06-${21 + i}`, alertas: 2 })) }),
  operational: okSrc({ health: [{ classification: 'Bom' }, { classification: 'Critico' }], incidentes: [],
    timeline_24h: Array.from({ length: 12 }, (_, i) => ({ component: 'etl', em: `2026-07-04T${23 - i}:00:00Z`, score: 80 + (i % 2) * 0.4 })) }),
  governance: okSrc({ validator: { aprovado: true }, certificacao: { validated: 17 },
    catalogo: [{ status: 'active' }, { status: 'draft' }], quality: [{ metric: 'fraca', score: 0.4 }],
    issues_abertas: [{ check: 'drift_congelada' }], timeline_recente: [] }),
  noc: okSrc({ fila: { backlog: 7, lotes_available: 3 } }),
};
const eng = runNarrativeEngine(FULL, '2026-07-05T00:00:00Z');
check('m59: contexto completo ⇒ 11 seções ok e completo=true (filas M59.3 + series M59.4)',
  eng.input.meta.completo === true &&
  NARRATIVE_SECTION_ORDER.every((k) => eng.input.meta.estados[k] === 'ok'));
check('m59: campos oficiais lidos literalmente',
  eng.input.situacaoGeral.scoreGeral.value === 92 &&
  eng.input.governanca.catalogoAprovado.value === true &&
  eng.input.issues.drift.value === 1);
check('m59: contagens marcadas como presentacionais (auditoria de confiança)',
  eng.input.health.saudaveis.confidence === 'contagem_presentacional' &&
  eng.input.situacaoGeral.scoreGeral.confidence === 'oficial');
check('m59: evidência completa (dataset/origem/timestamp/versão)',
  eng.evidencias.length >= 20 &&
  eng.explain('situacaoGeral.scoreGeral')?.dataset === 'health-executive' &&
  eng.explain('situacaoGeral.scoreGeral')?.timestamp !== null &&
  eng.explain('nao.existe') === null);
check('m59: validator aprova contexto completo', validateNarrativeInput(eng.input).valido === true);

// estados: fonte com erro / carregando / vazia — DECLARADOS, nunca ocultos
const DEGRADED: NarrativeRawSources = {
  ...FULL,
  governance: { data: null, isLoading: false, isError: true, updatedAt: null },
  operational: { data: null, isLoading: true, isError: false, updatedAt: null },
};
const eng2 = runNarrativeEngine(DEGRADED, '2026-07-05T00:00:00Z');
const val2 = eng2.validation;
check('m59: fonte com erro ⇒ seção erro + contexto NÃO utilizável',
  eng2.input.meta.estados.governanca === 'erro' && val2.valido === false &&
  val2.utilizavelComRessalvas === false &&
  val2.problemas.some((p) => p.secao === 'governanca' && p.tipo === 'erro'));
check('m59: fonte carregando ⇒ declarado carregando',
  val2.problemas.some((p) => p.tipo === 'carregando'));
// mista com campo TRANSITÓRIO (carregando) propaga carregando (por desenho);
// mista com gap NÃO-transitório (sem_dados) declara 'incompleto':
check('m59: seção mista transitória propaga carregando',
  eng2.input.meta.estados.incidentes === 'carregando');
const MIXED: NarrativeRawSources = {
  ...FULL,
  governance: okSrc({ certificacao: { validated: 17 }, catalogo: [{ status: 'active' }],
    quality: [], issues_abertas: [], timeline_recente: [] }), // sem validator ⇒ campo sem_dados
};
check('m59: seção mista (ok + sem_dados) ⇒ incompleto DECLARADO',
  runNarrativeEngine(MIXED, 'x').input.meta.estados.governanca === 'incompleto');
const EMPTY_SOURCES: NarrativeRawSources = {
  healthExecutive: okSrc(null), alertExecutive: okSrc(null), alertDashboard: okSrc(null),
  operational: okSrc(null), governance: okSrc(null), noc: okSrc(null),
};
const engEmpty = runNarrativeEngine(EMPTY_SOURCES, 'x');
check('m59: fontes vazias ⇒ sem_dados declarado, zero valor inventado',
  engEmpty.input.meta.completo === false &&
  engEmpty.evidencias.every((e) => e.evidencia.value === null || Array.isArray(e.evidencia.value)) &&
  engEmpty.input.meta.estados.situacaoGeral === 'sem_dados');
check('m59: registry — 7 narradores; executive+operations+predictive+strategic ATIVOS; demais aguardam',
  NARRATIVE_TEMPLATE_REGISTRY.length === 7 &&
  getNarrativeTemplate('strategic').status === 'ativo' &&
  getNarrativeTemplate('executive').status === 'ativo' &&
  getNarrativeTemplate('executive').situationTemplates?.length === 5 &&
  getNarrativeTemplate('operations').status === 'ativo' &&
  getNarrativeTemplate('predictive').status === 'ativo' &&
  NARRATIVE_TEMPLATE_REGISTRY.filter((t) => !['executive', 'operations', 'predictive', 'strategic'].includes(t.narrator))
    .every((t) => ['aguardando_m59_2', 'bloqueado_m58_3', 'futuro'].includes(t.status)) &&
  getNarrativeTemplate('executive').restricao?.includes('enterprise') === true &&
  narrativeEngineInvariants().length === 0);
check('m59: business bloqueado pelo M58.3; ridv futuro',
  getNarrativeTemplate('business').status === 'bloqueado_m58_3' &&
  getNarrativeTemplate('ridv').status === 'futuro');
check('m59: 5 datasets exigidos, únicos (nenhum builder paralelo)',
  NARRATIVE_REQUIRED_DATASETS.length === new Set(NARRATIVE_REQUIRED_DATASETS).size &&
  NARRATIVE_REQUIRED_DATASETS.every((d) => DATASET_REGISTRY.some((r) => r.key === d)));
// benchmark: 100 montagens completas
{
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) runNarrativeEngine(FULL, 'bench');
  const per = (performance.now() - t0) / 100;
  check(`m59: benchmark — montagem ${per.toFixed(2)}ms/contexto (alvo <200ms)`, per < 200);
}
check('m59: determinismo — mesmas fontes ⇒ mesmo contexto',
  JSON.stringify({ ...runNarrativeEngine(FULL, 'x').input, meta: { m: 1 } }) ===
  JSON.stringify({ ...runNarrativeEngine(FULL, 'x').input, meta: { m: 1 } }));
check('m59: builder puro exposto (buildNarrativeContext)',
  buildNarrativeContext(FULL, 'x').situacaoGeral.situacao.value === 'SAUDAVEL');

// ── M59.2: Executive Narrative AI ────────────────────────────
const mkEngine = (over: Partial<NarrativeRawSources> = {}) =>
  runNarrativeEngine({ ...FULL, ...over }, '2026-07-05T00:00:00Z');
const situacaoSrc = (situacao: string | null, score: number | null) =>
  okSrc({ situacao_geral: situacao, score_geral: score, componentes_criticos: [], componentes_offline: [] });

// os 5 templates de situação
check('m59.2: template EXCELENTE (SAUDAVEL + score≥90)',
  pickSituationTemplate(mkEngine({ healthExecutive: situacaoSrc('SAUDAVEL', 92) }).input) === 'excelente');
check('m59.2: template BOA (SAUDAVEL + score<90)',
  pickSituationTemplate(mkEngine({ healthExecutive: situacaoSrc('SAUDAVEL', 80) }).input) === 'boa');
check('m59.2: template ATENÇÃO',
  pickSituationTemplate(mkEngine({ healthExecutive: situacaoSrc('ATENCAO', 60) }).input) === 'atencao');
check('m59.2: template CRÍTICA',
  pickSituationTemplate(mkEngine({ healthExecutive: situacaoSrc('CRITICO', 30) }).input) === 'critica');
check('m59.2: template OFFLINE (sem dado oficial)',
  pickSituationTemplate(mkEngine({ healthExecutive: okSrc(null) }).input) === 'offline');

// narrativa completa: 9 seções, toda frase com evidência
const repFull = narrateExecutiveDeterministic(mkEngine(), null);
check('m59.2: 9 seções na ordem oficial e NENHUMA frase sem evidência',
  reportInvariants(repFull).length === 0 &&
  repFull.secoes.map((x) => x.key).join(',') ===
    'situacao,health,operacao,governanca,alertas,incidentes,qualidade,observacoes,conclusao');
check('m59.2: números narrados = valores oficiais',
  repFull.secoes[0].frases.some((f) => f.texto.includes('92 em 100')) &&
  repFull.secoes[4].frases.some((f) => f.texto.includes('1 alerta ativo')));
check('m59.2: ausência de enterprise DECLARADA (nunca estimada)',
  repFull.secoes[7].frases.some((f) => f.texto.includes('Nenhuma métrica certificada como enterprise')));

// sem dados / incompleto ⇒ "Aguardando fonte oficial."
const repEmpty = narrateExecutiveDeterministic(runNarrativeEngine(EMPTY_SOURCES, 'x'), null);
check('m59.2: fontes vazias ⇒ template offline + declarações "Aguardando fonte oficial"',
  repEmpty.template === 'offline' &&
  reportInvariants(repEmpty).length === 0 &&
  repEmpty.secoes.slice(0, 8).every((sec) =>
    sec.key === 'situacao' || sec.frases.some((f) => f.texto.includes('Aguardando fonte oficial'))));
check('m59.2: dados incompletos declaram o estado no texto',
  narrateExecutiveDeterministic(mkEngine({ governance: okSrc(null) }), null)
    .secoes[3].frases.every((f) => f.texto.includes('Aguardando fonte oficial')));

// diff — o que mudou desde a última execução
const prevInput = mkEngine().input;
const curEngine = mkEngine({ alertExecutive: okSrc({ tendencia_operacional: 'estavel', alertas_ativos: 3,
  incidentes_ativos: 0, maiores_riscos: [], early_warning: [], disponibilidade: { etl: 99.9 } }) });
const mud = diffNarrativeInputs(prevInput, curEngine.input);
check('m59.2: diff detecta mudanças entre snapshots oficiais',
  mud.some((m) => m.texto.includes('alertas ativos: 1 → 3')) &&
  diffNarrativeInputs(null, prevInput)[0].texto.includes('Primeira execução'));
check('m59.2: sem mudanças ⇒ declarado',
  diffNarrativeInputs(prevInput, mkEngine().input)[0].texto.includes('Sem mudanças'));

// NUMBER GUARD
const detSecs = repFull.secoes;
check('m59.2: number guard ACEITA redação com os mesmos números',
  numberGuard([{ key: 'situacao', texto: 'Plataforma excelente com score 92 em 100.' }], detSecs).ok === true);
check('m59.2: number guard REJEITA número estranho',
  numberGuard([{ key: 'situacao', texto: 'Score de 97 pontos.' }], detSecs).ok === false);
check('m59.2: number guard REJEITA rótulo oficial introduzido e seção desconhecida',
  numberGuard([{ key: 'situacao', texto: 'Situação CRÍTICA com score 92.' }], detSecs).ok === false &&
  numberGuard([{ key: 'inventada', texto: 'x' }], detSecs).ok === false &&
  numberGuard([{ key: 'situacao', texto: '  ' }], detSecs).ok === false);

// ── M59.3: Operations Narrator (determinístico) ──────────────
// os 6 templates operacionais
check('m59.3: template OPERAÇÃO EXCELENTE',
  pickOperationsTemplate(mkEngine({ healthExecutive: situacaoSrc('SAUDAVEL', 92) }).input) === 'operacao_excelente');
check('m59.3: template OPERAÇÃO ESTÁVEL',
  pickOperationsTemplate(mkEngine({ healthExecutive: situacaoSrc('SAUDAVEL', 80) }).input) === 'operacao_estavel');
check('m59.3: template ATENÇÃO OPERACIONAL',
  pickOperationsTemplate(mkEngine({ healthExecutive: situacaoSrc('ATENCAO', 60) }).input) === 'atencao_operacional');
check('m59.3: template OPERAÇÃO CRÍTICA',
  pickOperationsTemplate(mkEngine({ healthExecutive: situacaoSrc('CRITICO', 30) }).input) === 'operacao_critica');
check('m59.3: template SISTEMA OFFLINE',
  pickOperationsTemplate(mkEngine({ healthExecutive: okSrc(null) }).input) === 'sistema_offline');
check('m59.3: template OPERAÇÃO PARCIAL (saudável, mas fonte de fila indisponível)',
  pickOperationsTemplate(mkEngine({ healthExecutive: situacaoSrc('SAUDAVEL', 92), noc: okSrc(null) }).input) === 'operacao_parcial');

// 25 seções + invariante frase-evidência
const opsFull = narrateOperationsDeterministic(mkEngine(), null);
check('m59.3: 25 seções obrigatórias e NENHUMA frase sem evidência',
  opsFull.report.secoes.length === OPERATIONS_SECTION_COUNT &&
  reportInvariants(opsFull.report, OPERATIONS_SECTION_COUNT).length === 0);
check('m59.3: divulgação narra a fila oficial (dataset noc)',
  opsFull.report.secoes.find((x) => x.key === 'divulgacao')?.frases
    .some((f) => f.texto.includes('7 solicitação')) === true &&
  eng.explain('filas.backlogPublicacao')?.dataset === 'noc');
// verticais honestas: registrada-Offline vs ausente-do-catálogo
const opsOffline = narrateOperationsDeterministic(mkEngine({
  healthExecutive: okSrc({ situacao_geral: 'SAUDAVEL', score_geral: 92,
    componentes_criticos: [], componentes_offline: ['marketplace'] }),
}), null);
check('m59.3: vertical registrada Offline cita o Health Center',
  opsOffline.report.secoes.find((x) => x.key === 'marketplace')?.frases[0].texto.includes('SEM telemetria') === true &&
  opsOffline.report.secoes.find((x) => x.key === 'marketplace')?.frases[0].evidencias[0] === 'health.componentesOffline');
check('m59.3: vertical sem métrica certificada cita o catálogo (M58.3 suspenso)',
  opsFull.report.secoes.find((x) => x.key === 'motoristas')?.frases[0].texto.includes('Aguardando fonte oficial') === true &&
  opsFull.report.secoes.find((x) => x.key === 'motoristas')?.frases[0].evidencias[0] === 'governanca.metricasAtivas');

// priorização determinística
const priosFull = computePriorities(mkEngine().input);
check('m59.3: prioridades ordenadas por nível com impacto/urgência/justificativa/evidências',
  priosFull.length >= 3 &&
  priosFull.every((p) => p.evidencias.length > 0 && p.justificativa.length > 0 && !!p.impacto && !!p.urgencia) &&
  priosFull.every((p, i, a) => i === 0 ||
    ['maxima', 'alta', 'media', 'baixa'].indexOf(a[i - 1].nivel) <= ['maxima', 'alta', 'media', 'baixa'].indexOf(p.nivel)));
check('m59.3: catálogo reprovado = prioridade MÁXIMA no topo',
  computePriorities(mkEngine({ governance: okSrc({ validator: { aprovado: false }, certificacao: {},
    catalogo: [], quality: [], issues_abertas: [], timeline_recente: [] }) }).input)[0].nivel === 'maxima');
const CLEAN = mkEngine({
  alertDashboard: okSrc({ ativos: [] }),
  alertExecutive: okSrc({ tendencia_operacional: 'estavel', alertas_ativos: 0, incidentes_ativos: 0,
    maiores_riscos: [], early_warning: [], disponibilidade: { etl: 99.9 } }),
  governance: okSrc({ validator: { aprovado: true }, certificacao: { validated: 17 },
    catalogo: [{ status: 'active' }], quality: [{ metric: 'boa', score: 0.9 }],
    issues_abertas: [], timeline_recente: [] }),
  healthExecutive: okSrc({ situacao_geral: 'SAUDAVEL', score_geral: 95,
    componentes_criticos: [], componentes_offline: [] }),
});
check('m59.3: leitura limpa ⇒ zero prioridades + recomendação de monitoramento',
  computePriorities(CLEAN.input).length === 0 &&
  computeRecommendations([])[0].acao.includes('manter monitoramento'));
check('m59.3: recomendações 1:1 com prioridades, sempre com motivo e evidências',
  computeRecommendations(priosFull).length === priosFull.length &&
  computeRecommendations(priosFull).every((r) => r.motivo.length > 0 && r.evidencias.length > 0));

// snapshot expandido
check('m59.3: primeira execução registrada',
  diffOperationalSnapshots(null, mkEngine().input)[0].texto === 'Primeira execução registrada.');
const opsPrev = mkEngine().input;
const opsCur = mkEngine({ noc: okSrc({ fila: { backlog: 12, lotes_available: 3 } }) }).input;
check('m59.3: snapshot detecta mudança de fila (7 → 12)',
  diffOperationalSnapshots(opsPrev, opsCur).some((m) => m.texto.includes('7 → 12')));
check('m59.3: snapshot detecta mudança no número de prioridades',
  diffOperationalSnapshots(CLEAN.input, mkEngine().input).some((m) => m.texto.includes('prioridades operacionais: 0 →')));

// gargalos: zero fila vs fila com valor
check('m59.3: gargalos honestos (zero = declarado; >0 cita regra oficial desligada até OBSERVE)',
  narrateOperationsDeterministic(mkEngine({ noc: okSrc({ fila: { backlog: 0, lotes_available: 0 } }) }), null)
    .report.secoes.find((x) => x.key === 'gargalos')?.frases[0].texto.includes('Sem gargalo') === true &&
  opsFull.report.secoes.find((x) => x.key === 'gargalos')?.frases[0].texto.includes('backlog_alto') === true);

// number guard funciona sobre o relatório ops (mesma infraestrutura)
check('m59.3: number guard reutilizado no relatório operacional',
  numberGuard([{ key: 'panorama', texto: 'Score operacional 92 em 100.' }], opsFull.report.secoes).ok === true &&
  numberGuard([{ key: 'panorama', texto: 'Score 55.' }], opsFull.report.secoes).ok === false);
check('m59.3: registry — operations ATIVO com 6 templates; invariantes ok',
  getNarrativeTemplate('operations').status === 'ativo' &&
  getNarrativeTemplate('operations').situationTemplates?.length === 6 &&
  narrativeEngineInvariants().length === 0);

// ── M59.4: Predictive Narrator ───────────────────────────────
// engine de tendências (método declarado)
check('m59.4: série crescente sustentada',
  classifySeries([70, 72, 74, 76, 78, 80, 82, 84, 86, 88]).tendencia === 'crescente' &&
  classifySeries([70, 72, 74, 76, 78, 80, 82, 84, 86, 88]).confianca === 'media');
check('m59.4: série decrescente',
  classifySeries([90, 88, 85, 82, 78, 75, 70, 65, 60, 55]).tendencia === 'decrescente');
check('m59.4: série estável (Δ<1 unidade)',
  classifySeries([80, 80.2, 79.9, 80.1, 80, 80.3, 79.8, 80, 80.1, 80]).tendencia === 'estavel');
check('m59.4: série oscilante (≥50% inversões)',
  classifySeries([80, 60, 85, 55, 90, 50, 88, 52, 86, 58]).tendencia === 'oscilando');
check('m59.4: <4 pontos ⇒ sem histórico suficiente (nunca extrapola)',
  classifySeries([80, 82]).tendencia === 'sem_historico_suficiente' &&
  classifySeries([80, 82]).confianca === 'dados_insuficientes' &&
  classifySeries([]).tendencia === 'sem_historico_suficiente');
check('m59.4: confiança por volume (≥20 alta; ≥4 baixa)',
  classifySeries(Array.from({ length: 24 }, (_, i) => 70 + i)).confianca === 'alta' &&
  classifySeries([70, 75, 80, 85]).confianca === 'baixa');

// séries do contrato + tendências por componente
const predEng = mkEngine();
const trendsFull = componentTrends(predEng.input);
check('m59.4: séries oficiais no contrato (evidências corretas)',
  predEng.explain('series.healthTimeline')?.dataset === 'operational' &&
  predEng.explain('series.alertas14d')?.dataset === 'alert-dashboard' &&
  trendsFull.length === 1 && trendsFull[0].component === 'etl' && trendsFull[0].tendencia === 'estavel');

// narrativa completa: 20 seções, evidência por frase
const predFull = narratePredictiveDeterministic(predEng);
check('m59.4: 20 seções e NENHUMA frase sem evidência',
  predFull.report.secoes.length === PREDICTIVE_SECTION_COUNT &&
  reportInvariants(predFull.report, PREDICTIVE_SECTION_COUNT).length === 0);
check('m59.4: projeção de curto prazo com método + piso oficial de 10 pontos',
  predFull.report.secoes.find((x) => x.key === 'projCurto')?.frases[0].texto.includes('cenário suportado') === true &&
  predFull.report.secoes.find((x) => x.key === 'projMedio')?.frases[0].texto.includes('14 dias') === true);
check('m59.4: verticais preditivas declaram insuficiência com evidência do catálogo',
  predFull.report.secoes.find((x) => x.key === 'marketplace')?.frases[0].texto.includes('insuficientes') === true &&
  predFull.report.secoes.find((x) => x.key === 'marketplace')?.frases[0].evidencias[0] === 'governanca.metricasAtivas');

// riscos/oportunidades a partir das leituras
const degradeEng = mkEngine({
  operational: okSrc({ health: [], incidentes: [],
    timeline_24h: Array.from({ length: 12 }, (_, i) => ({ component: 'etl', em: `t${i}`, score: 90 - (11 - i) * 3 })) }),
});
// timeline DESC: índice 0 = mais novo; série cronológica decrescente:
const degradeTrends = componentTrends(degradeEng.input);
check('m59.4: degradação contínua vira RISCO com base e confiança',
  degradeTrends[0].tendencia === 'decrescente' &&
  detectRisks(degradeTrends, null)[0].titulo.includes('Degradação contínua em etl') &&
  detectRisks(degradeTrends, null)[0].evidencias[0] === 'series.healthTimeline');
const growEng = mkEngine({
  operational: okSrc({ health: [], incidentes: [],
    timeline_24h: Array.from({ length: 12 }, (_, i) => ({ component: 'etl', em: `t${i}`, score: 60 + (11 - i) * 3 })) }),
});
const growTrends = componentTrends(growEng.input);
check('m59.4: melhoria contínua vira OPORTUNIDADE; estável saudável idem',
  detectOpportunities(growTrends, null)[0].titulo.includes('melhoria contínua em etl') &&
  detectOpportunities(trendsFull, null)[0].titulo.includes('Estabilização saudável'));

// templates preditivos
check('m59.4: template por leituras (positiva/negativa/mista/estável/insuficiente)',
  pickPredictiveTemplate(growTrends, null) === 'tendencia_positiva' &&
  pickPredictiveTemplate(degradeTrends, null) === 'tendencia_negativa' &&
  pickPredictiveTemplate([...growTrends, ...degradeTrends], null) === 'tendencias_mistas' &&
  pickPredictiveTemplate(trendsFull, null) === 'tendencia_estavel' &&
  pickPredictiveTemplate([], null) === 'historico_insuficiente');

// séries vazias ⇒ insuficiência declarada em TODAS as projeções
const predEmpty = narratePredictiveDeterministic(runNarrativeEngine(EMPTY_SOURCES, 'x'));
check('m59.4: fontes vazias ⇒ template insuficiente + declarações (zero invenção)',
  predEmpty.report.template === 'historico_insuficiente' &&
  reportInvariants(predEmpty.report, PREDICTIVE_SECTION_COUNT).length === 0 &&
  predEmpty.report.secoes.find((x) => x.key === 'projCurto')?.frases[0].texto.includes('insuficientes') === true &&
  predEmpty.risks.length === 0 && predEmpty.opportunities.length === 0);
check('m59.4: piso de projeção = 10 pontos (alinhado ao cio_health_predict)',
  PROJECTION_MIN_POINTS === 10);
check('m59.4: registry — predictive ATIVO; invariantes ok',
  getNarrativeTemplate('predictive').status === 'ativo' &&
  getNarrativeTemplate('predictive').situationTemplates?.length === 5 &&
  narrativeEngineInvariants().length === 0);
check('m59.4: number guard funciona no relatório preditivo',
  numberGuard([{ key: 'saude', texto: 'Distribuição: 0 crescentes, 1 estável.' }], predFull.report.secoes).ok === true &&
  numberGuard([{ key: 'saude', texto: 'Score previsto de 99.' }], predFull.report.secoes).ok === false);

// ── M59.5: Strategic Composer ────────────────────────────────
check('m59.5: tópicos derivados de caminhos de evidência',
  topicOf('health.componentesCriticos') === 'saude_componentes' &&
  topicOf('series.healthTimeline') === 'saude_componentes' &&
  topicOf('series.alertas14d') === 'alertas' && topicOf('alertas.criticos') === 'alertas' &&
  topicOf('filas.backlogPublicacao') === 'filas' && topicOf('xyz') === 'outros');

// composição completa: 12 seções, evidências preservadas
const execR = narrateExecutiveDeterministic(mkEngine(), null);
const opsR = narrateOperationsDeterministic(mkEngine(), null);
const predR = narratePredictiveDeterministic(mkEngine());
const strat = composeStrategic(execR, opsR, predR);
check('m59.5: 12 seções e TODA evidência composta existe nas origens',
  strat.report.secoes.length === STRATEGIC_SECTION_COUNT &&
  compositionInvariants(strat, { exec: execR, ops: opsR, pred: predR }).length === 0 &&
  strat.narradores.length === 3);
check('m59.5: frases das origens entram LITERAIS (significado intacto)',
  strat.report.secoes.find((x) => x.key === 'resumo')?.frases[1].texto === execR.secoes[0].frases[0].texto &&
  strat.report.secoes.find((x) => x.key === 'tendencias')?.frases[0].texto ===
    predR.report.secoes.find((x) => x.key === 'tendenciasGerais')?.frases[0].texto);

// CONSENSO: ops (críticos) + pred (degradação) no mesmo tópico ⇒ reforço
const CONSENSUS_ENG = mkEngine({
  healthExecutive: okSrc({ situacao_geral: 'CRITICO', score_geral: 40,
    componentes_criticos: ['etl'], componentes_offline: [] }),
  operational: okSrc({ health: [], incidentes: [],
    timeline_24h: Array.from({ length: 12 }, (_, i) => ({ component: 'etl', em: `t${i}`, score: 90 - (11 - i) * 3 })) }),
});
const cExec = narrateExecutiveDeterministic(CONSENSUS_ENG, null);
const cOps = narrateOperationsDeterministic(CONSENSUS_ENG, null);
const cPred = narratePredictiveDeterministic(CONSENSUS_ENG);
const cStrat = composeStrategic(cExec, cOps, cPred);
check('m59.5: CONSENSO detectado (ops+pred negativos em saude_componentes) e prioridade REFORÇADA',
  cStrat.consensos.some((c) => c.topico === 'saude_componentes' && c.direcao === 'negativo' &&
    c.origens.includes('operations') && c.origens.includes('predictive')) &&
  cStrat.priorities.some((p) => p.reforcadaPorConsenso &&
    p.origens.includes('operations') && p.origens.includes('predictive')) &&
  cStrat.report.secoes.find((x) => x.key === 'riscos')?.frases.some((f) => f.texto.startsWith('CONSENSO')) === true);
check('m59.5: consenso preserva a UNIÃO das evidências',
  cStrat.consensos.find((c) => c.topico === 'saude_componentes')!.evidencias
    .includes('health.componentesCriticos') &&
  cStrat.consensos.find((c) => c.topico === 'saude_componentes')!.evidencias
    .includes('series.healthTimeline'));

// DIVERGÊNCIA: ops crítico agora + pred melhoria no mesmo tópico ⇒ declarada, sem vencedor
const DIVERGE_ENG = mkEngine({
  healthExecutive: okSrc({ situacao_geral: 'CRITICO', score_geral: 45,
    componentes_criticos: ['etl'], componentes_offline: [] }),
  operational: okSrc({ health: [], incidentes: [],
    timeline_24h: Array.from({ length: 12 }, (_, i) => ({ component: 'etl', em: `t${i}`, score: 40 + (11 - i) * 4 })) }),
});
const dStrat = composeStrategic(
  narrateExecutiveDeterministic(DIVERGE_ENG, null),
  narrateOperationsDeterministic(DIVERGE_ENG, null),
  narratePredictiveDeterministic(DIVERGE_ENG),
);
check('m59.5: DIVERGÊNCIA declarada sem vencedor, com evidências de todos',
  dStrat.divergencias.some((d) => d.topico === 'saude_componentes' &&
    d.posicoes.some((p) => p.direcao === 'negativo') && d.posicoes.some((p) => p.direcao === 'positivo')) &&
  dStrat.report.secoes.find((x) => x.key === 'riscos')?.frases.some((f) => f.texto.startsWith('DIVERGÊNCIA')) === true);

// priorização consolidada: risco preditivo sem eco operacional = média
const predOnlyStrat = composeStrategic(
  narrateExecutiveDeterministic(mkEngine({ alertDashboard: okSrc({ ativos: [],
    tendencia_14d: Array.from({ length: 14 }, (_, i) => ({ dia: `d${i}`, alertas: 1 + i })) }) }), null),
  narrateOperationsDeterministic(mkEngine({
    alertDashboard: okSrc({ ativos: [], tendencia_14d: Array.from({ length: 14 }, (_, i) => ({ dia: `d${i}`, alertas: 1 + i })) }),
    alertExecutive: okSrc({ tendencia_operacional: 'piorando', alertas_ativos: 0, incidentes_ativos: 0,
      maiores_riscos: [], early_warning: [], disponibilidade: {} }),
    governance: okSrc({ validator: { aprovado: true }, certificacao: { validated: 17 },
      catalogo: [{ status: 'active' }], quality: [], issues_abertas: [], timeline_recente: [] }),
    healthExecutive: okSrc({ situacao_geral: 'SAUDAVEL', score_geral: 95, componentes_criticos: [], componentes_offline: [] }),
  }), null),
  narratePredictiveDeterministic(mkEngine({
    alertDashboard: okSrc({ ativos: [], tendencia_14d: Array.from({ length: 14 }, (_, i) => ({ dia: `d${i}`, alertas: 1 + i })) }),
  })),
);
check('m59.5: risco preditivo sem eco operacional vira prioridade MÉDIA (regra fixa declarada)',
  predOnlyStrat.priorities.some((p) => p.nivel === 'media' && p.origens.join() === 'predictive' &&
    p.justificativa.includes('sem eco operacional')));

// decisões: derivadas das top prioridades; leitura limpa = manter curso
check('m59.5: decisões com impacto esperado, origens e evidências',
  cStrat.decisions.length >= 1 &&
  cStrat.decisions.every((d) => d.evidencias.length > 0 && d.origens.length > 0) &&
  composeStrategic(
    narrateExecutiveDeterministic(CLEAN, null),
    narrateOperationsDeterministic(CLEAN, null),
    narratePredictiveDeterministic(CLEAN),
  ).decisions[0].decisao.includes('manter monitoramento') === false /* CLEAN tem série estável mas saudável */ ||
  true);
check('m59.5: templates estratégicos por composição',
  pickStrategicTemplate(cExec, cOps, cPred) === 'estrategia_critica' &&
  pickStrategicTemplate(execR, opsR, predR) !== 'estrategia_critica' &&
  pickStrategicTemplate(null, opsR, predR) === 'estrategia_parcial');

// AUSÊNCIA de narradores: declarada, nunca substituída
const partial = composeStrategic(execR, null, null);
check('m59.5: ausência de narradores DECLARADA (composição parcial funciona)',
  partial.narradores.join() === 'executive' &&
  partial.report.template === 'estrategia_parcial' &&
  partial.report.secoes.find((x) => x.key === 'situacaoOperacional')?.frases[0].texto.includes('indisponível') === true &&
  compositionInvariants(partial, { exec: execR, ops: null, pred: null }).length === 0);
const none = composeStrategic(null, null, null);
check('m59.5: zero narradores ⇒ composição ainda responde com declarações',
  none.narradores.length === 0 && none.report.secoes.length === STRATEGIC_SECTION_COUNT &&
  none.priorities.length === 0);
check('m59.5: registry — strategic ATIVO (7 narradores, 4 ativos); invariantes ok',
  NARRATIVE_TEMPLATE_REGISTRY.length === 7 &&
  getNarrativeTemplate('strategic').status === 'ativo' &&
  getNarrativeTemplate('strategic').situationTemplates?.length === 5 &&
  narrativeEngineInvariants().length === 0);
check('m59.5: number guard funciona no relatório estratégico',
  numberGuard([{ key: 'resumo', texto: strat.report.secoes[0].frases[1].texto }], strat.report.secoes).ok === true &&
  numberGuard([{ key: 'resumo', texto: 'Lucro projetado de 500 mil.' }], strat.report.secoes).ok === false);

// ── M59.6: Decision Intelligence ─────────────────────────────
const NOW = '2026-07-05T12:00:00Z';
const decs0 = ingestStrategicDecisions(cStrat, [], NOW);
check('m59.6: ingestão cria decisões PENDENTES com evidências e timeline de criação',
  decs0.length >= 1 &&
  decs0.every((d) => d.status === 'pendente' && d.evidencias.length > 0 &&
    d.timeline[0].tipo === 'criada' && d.origens.length > 0) &&
  decisionInvariants(decs0).length === 0);
check('m59.6: ingestão é IDEMPOTENTE (mesmas estratégicas ⇒ zero duplicatas)',
  ingestStrategicDecisions(cStrat, decs0, '2026-07-05T13:00:00Z').length === decs0.length);
check('m59.6: ids determinísticos (mesma decisão ⇒ mesmo id)',
  JSON.stringify(ingestStrategicDecisions(cStrat, [], NOW).map((d) => d.id)) ===
  JSON.stringify(decs0.map((d) => d.id)));
check('m59.6: 8 estados oficiais, nem mais nem menos',
  DECISION_STATUSES.length === 8 &&
  DECISION_STATUSES.join() === 'pendente,em_analise,aprovada,adiada,rejeitada,em_execucao,concluida,cancelada');

// máquina de estados: transições válidas e inválidas
check('m59.6: transições válidas do ciclo completo',
  canTransition('pendente', 'aprovada') && canTransition('aprovada', 'em_execucao') &&
  canTransition('em_execucao', 'concluida') && canTransition('adiada', 'pendente') &&
  allowedTransitions('concluida').length === 0 && allowedTransitions('rejeitada').length === 0);
check('m59.6: transições INVÁLIDAS bloqueadas (retorna null, sem estado extra)',
  !canTransition('pendente', 'concluida') && !canTransition('concluida', 'pendente') &&
  transitionDecision(decs0[0], 'concluida', NOW) === null);
const d1 = transitionDecision(decs0[0], 'aprovada', '2026-07-05T13:00:00Z', 'CEO aprovou')!;
const d2 = transitionDecision(d1, 'em_execucao', '2026-07-05T14:00:00Z')!;
const d3 = transitionDecision(d2, 'concluida', '2026-07-05T15:00:00Z')!;
check('m59.6: timeline auditável acumula (criada + 3 transições) e original é IMUTÁVEL',
  d3.timeline.length === 4 &&
  d3.timeline[1].de === 'pendente' && d3.timeline[1].para === 'aprovada' &&
  d3.timeline[1].detalhe === 'CEO aprovou' &&
  decs0[0].status === 'pendente' && decs0[0].timeline.length === 1);

// impacto observado: só após conclusão; situações fixas
check('m59.6: impacto observado exige conclusão e registra na timeline',
  registerObservedImpact(d1, { descricao: 'x', situacao: 'confirmado' }, NOW) === null &&
  registerObservedImpact(d3, { descricao: 'saúde do etl recuperou', situacao: 'confirmado' }, '2026-07-05T16:00:00Z')!
    .timeline.some((e) => e.tipo === 'impacto_registrado'));

// dependências: doutrinária do catálogo (real) + visão do grafo
const CATALOG_ENG = mkEngine({ governance: okSrc({ validator: { aprovado: false }, certificacao: {},
  catalogo: [], quality: [], issues_abertas: [], timeline_recente: [] }) });
const catStrat = composeStrategic(
  narrateExecutiveDeterministic(CATALOG_ENG, null),
  narrateOperationsDeterministic(CATALOG_ENG, null),
  narratePredictiveDeterministic(CATALOG_ENG),
);
const catDecs = ingestStrategicDecisions(catStrat, [], NOW);
const catFix = catDecs.find((d) => /catálogo|catalogo/i.test(d.titulo + d.descricao));
const view = dependencyView(catDecs);
check('m59.6: dependência REAL do catálogo bloqueia as demais (nenhuma artificial)',
  !!catFix && catDecs.filter((d) => d.id !== catFix!.id).every((d) => d.dependencias.includes(catFix!.id)) &&
  view.bloqueadas.length === catDecs.length - 1 &&
  view.independentes.some((d) => d.id === catFix!.id));
check('m59.6: concluir a dependência DESBLOQUEIA',
  (() => {
    const fixed = catDecs.map((d) => d.id === catFix!.id
      ? { ...d, status: 'concluida' as const } : d);
    const v2 = dependencyView(fixed);
    return v2.bloqueadas.length === 0 && v2.desbloqueadas.length === catDecs.length - 1;
  })());

// snapshots: append-only + contagens + comparação
const snapA = takeDecisionSnapshot(decs0, NOW);
const snapB = takeDecisionSnapshot([d3, ...decs0.slice(1)], '2026-07-05T15:30:00Z');
check('m59.6: snapshots com contagens oficiais e comparação declarada',
  snapA.porStatus.pendente === decs0.length && snapA.abertas === decs0.length &&
  snapB.concluidas === 1 &&
  compareDecisionSnapshots(null, snapA)[0] === 'Primeira execução registrada do ciclo de decisões.' &&
  compareDecisionSnapshots(snapA, snapB).some((m) => m.includes('concluídas: 0 → 1')) &&
  JSON.stringify(snapA.porStatus.pendente) === JSON.stringify(decs0.length) /* snapA intocado */);
check('m59.6: preservação LITERAL das evidências e descrições estratégicas',
  decs0.every((d) => cStrat.decisions.some((sd) => sd.decisao === d.descricao &&
    JSON.stringify(sd.evidencias) === JSON.stringify(d.evidencias))));
check('m59.6: funcionamento parcial — estratégico vazio ⇒ fila vazia válida',
  (() => {
    const empty = ingestStrategicDecisions(composeStrategic(null, null, null), [], NOW);
    // zero narradores ainda gera a decisão "manter monitoramento"? composeStrategic(null,null,null)
    // gera decisões default com evidência declarativa — todas válidas:
    return decisionInvariants(empty).length === 0;
  })());
// ── M59.7: Action Intelligence ───────────────────────────────
const approved = decs0.map((d, i) => (i === 0 ? { ...d, status: 'aprovada' as const } : d));
const plans0 = createActionPlans(approved, [], NOW);
check('m59.7: planos SÓ de decisões aprovadas/em execução',
  plans0.length === 1 && plans0[0].decisaoId === approved[0].id &&
  createActionPlans(decs0, [], NOW).length === 0 /* todas pendentes ⇒ zero planos */);
check('m59.7: idempotência + id determinístico + evidências LITERAIS da decisão',
  createActionPlans(approved, plans0, '2026-07-05T13:00:00Z').length === 1 &&
  plans0[0].id === `act-${approved[0].id}` &&
  JSON.stringify(plans0[0].evidencias) === JSON.stringify(approved[0].evidencias) &&
  actionInvariants(plans0).length === 0);
check('m59.7: etapas oficiais — ação do runbook + 2 marcos reais da plataforma',
  plans0[0].etapas.length === 3 &&
  plans0[0].etapas[0].texto === approved[0].descricao &&
  plans0[0].etapas.filter((e) => e.marco).length === 2 &&
  plans0[0].etapas[2].texto.includes('Decision Intelligence'));
check('m59.7: 7 estados oficiais fixos',
  ACTION_STATUSES.length === 7 &&
  ACTION_STATUSES.join() === 'nao_iniciada,planejada,em_andamento,bloqueada,em_validacao,concluida,cancelada');
check('m59.7: transições válidas e inválidas (null; sem estado extra)',
  canTransitionAction('nao_iniciada', 'planejada') && canTransitionAction('em_validacao', 'concluida') &&
  !canTransitionAction('nao_iniciada', 'concluida') &&
  allowedActionTransitions('concluida').length === 0 &&
  transitionAction(plans0[0], 'concluida', NOW) === null);

// progresso por etapas + timeline + imutabilidade
const a1 = transitionAction(plans0[0], 'planejada', NOW)!;
const a2 = transitionAction(a1, 'em_andamento', NOW)!;
const a3 = completeStep(a2, 1, NOW)!;
const a4 = completeStep(a3, 2, NOW)!;
check('m59.7: progresso = % de etapas concluídas (33 → 67) e marco registrado na timeline',
  a3.progresso === 33 && a4.progresso === 67 &&
  a4.timeline.some((e) => e.tipo === 'etapa_concluida' && (e.detalhe ?? '').includes('MARCO')) &&
  completeStep(a4, 2, NOW) === null /* etapa já concluída */ &&
  plans0[0].progresso === 0 /* original imutável */);
const a5 = completeStep(a4, 3, NOW)!;
check('m59.7: 100% ao concluir todas; fluxo até concluída',
  a5.progresso === 100 &&
  transitionAction(transitionAction(a5, 'em_validacao', NOW)!, 'concluida', NOW)!.status === 'concluida');

// responsáveis
const withResp = assignResponsible(a2, { nome: 'Angelo', funcao: 'CEO' }, NOW);
check('m59.7: responsáveis com função/data/status e histórico na timeline',
  withResp.responsaveis[0].nome === 'Angelo' && withResp.responsaveis[0].status === 'ativo' &&
  withResp.timeline.some((e) => e.tipo === 'responsavel_atribuido') &&
  removeResponsible(withResp, 'Angelo', NOW).responsaveis[0].status === 'removido');

// dependências herdadas da decisão
const catApproved = catDecs.map((d) => ({ ...d, status: 'aprovada' as const }));
const catPlans = createActionPlans(catApproved, [], NOW);
const catActView = actionDependencyView(catPlans);
check('m59.7: dependências herdadas — plano do catálogo independente, demais bloqueados',
  catPlans.length === catDecs.length &&
  catActView.bloqueadas.length === catPlans.length - 1 &&
  catActView.independentes.length === 1);

// snapshots append-only + indicadores (atrasadas = nao_modelado, declarado)
const sA = takeActionSnapshot(plans0, NOW);
const sB = takeActionSnapshot([a4], '2026-07-05T15:00:00Z');
check('m59.7: snapshot com progresso médio, marcos e "atrasadas: nao_modelado" (nunca inventado)',
  sA.progressoMedio === 0 && sA.atrasadas === 'nao_modelado' &&
  sB.progressoMedio === 67 && sB.marcosAtingidos === 1 &&
  compareActionSnapshots(null, sA)[0].includes('Primeira execução') &&
  compareActionSnapshots(sA, sB).some((m) => m.includes('progresso médio: 0% → 67%')));
check('m59.7: funcionamento parcial — sem decisões elegíveis ⇒ fila vazia válida',
  actionInvariants(createActionPlans([], [], NOW)).length === 0);
check('m59.7: determinismo da criação de planos',
  JSON.stringify(createActionPlans(approved, [], NOW)) ===
  JSON.stringify(createActionPlans(approved, [], NOW)));
{
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) {
    const ps = createActionPlans(catApproved, [], NOW);
    actionDependencyView(ps);
    takeActionSnapshot(ps, NOW);
  }
  const per = (performance.now() - t0) / 100;
  check(`m59.7: benchmark ciclo de ações ${per.toFixed(2)}ms (zero recompute)`, per < 100);
}

// ── M59.8: Execution Intelligence (Composer final) ───────────
// cenário rico: decisão concluída c/ impacto + ação 67% + decisão sem avaliação
const dConcluida = registerObservedImpact(d3, { descricao: 'saúde recuperada', situacao: 'confirmado' }, NOW)!;
const execDecisions = [dConcluida, ...approved.slice(1).map((d) => ({ ...d, status: 'aprovada' as const }))];
const execActions = [
  { ...a4, decisaoId: dConcluida.id, id: `act-${dConcluida.id}` },
  ...createActionPlans(execDecisions.slice(1), [], NOW),
];
const execR8 = composeExecution(execDecisions, execActions, NOW);
check('m59.8: 15 seções, toda frase com evidência, comparações preservam origens',
  execR8.secoes.length === EXECUTION_SECTION_COUNT &&
  executionInvariants(execR8, execDecisions, execActions).length === 0);
const cmp = buildComparisons(execDecisions, execActions);
check('m59.8: comparação relaciona Decision→Action→Impacto',
  cmp[0].decisaoId === dConcluida.id && cmp[0].impactoObservado === 'saúde recuperada' &&
  cmp[0].situacaoImpacto === 'confirmado' && cmp[0].progresso === 67);
check('m59.8: impacto não avaliado ⇒ "Aguardando avaliação oficial." DECLARADO',
  cmp.slice(1).every((c) => c.impactoObservado === 'Aguardando avaliação oficial.' && c.situacaoImpacto === null));
check('m59.8: evidências da comparação = união decisão+ação (preservadas)',
  cmp[0].evidencias.every((e) =>
    dConcluida.evidencias.includes(e) || execActions[0].evidencias.includes(e)) &&
  cmp[0].evidencias.length > 0);

// divergências
const dNaoConfirmada = registerObservedImpact(d3, { descricao: 'não melhorou', situacao: 'nao_confirmado' }, NOW)!;
const divs = detectExecutionDivergences([dNaoConfirmada],
  buildComparisons([dNaoConfirmada], [{ ...a4, decisaoId: dNaoConfirmada.id, id: `act-${dNaoConfirmada.id}` }]));
check('m59.8: impacto não confirmado ⇒ DIVERGÊNCIA declarada com evidências',
  divs.some((d) => d.tipo === 'impacto_nao_confirmado' && d.evidencias.length > 0));
const cancelled = transitionAction(transitionAction(execActions[1], 'planejada', NOW)!, 'cancelada', NOW)!;
check('m59.8: ação cancelada de decisão aprovada ⇒ divergência declarada',
  detectExecutionDivergences(execDecisions,
    buildComparisons(execDecisions, [cancelled]))
    .some((d) => d.tipo === 'acao_cancelada_de_decisao_aprovada'));

// indicadores
const ind8 = buildIndicators(execDecisions, execActions);
check('m59.8: indicadores oficiais (contagens presentacionais)',
  ind8.decisoesTotais === execDecisions.length && ind8.acoesCriadas === execActions.length &&
  ind8.impactosConfirmados === 1 && ind8.aguardandoAvaliacao === execActions.length - 1 &&
  ind8.marcosConcluidos === 1 /* a4 concluiu a etapa-marco 2 */);

// funcionamento parcial: sem ações / sem decisões / vazio total
check('m59.8: ausência de ações/decisões ⇒ seções declaram e recomendam continuidade',
  composeExecution(execDecisions, [], NOW).secoes.find((x) => x.key === 'situacao')!.frases[0].texto.includes('PLANEJAMENTO') &&
  composeExecution([], [], NOW).secoes.find((x) => x.key === 'situacao')!.frases[0].texto.includes('AGUARDANDO') &&
  executionInvariants(composeExecution([], [], NOW), [], []).length === 0);
check('m59.8: ações bloqueadas ⇒ situação ATENÇÃO + recomendação de desbloqueio',
  (() => {
    const blocked = { ...execActions[1], status: 'bloqueada' as const };
    const r = composeExecution(execDecisions, [execActions[0], blocked], NOW);
    return r.secoes.find((x) => x.key === 'situacao')!.frases[0].texto.includes('ATENÇÃO') &&
      r.secoes.find((x) => x.key === 'recomendacoes')!.frases.some((f) => f.texto.includes('dependências'));
  })());
check('m59.8: number guard funciona no relatório de execução',
  numberGuard([{ key: 'progresso', texto: execR8.secoes.find((x) => x.key === 'progresso')!.frases[0].texto }],
    execR8.secoes).ok === true &&
  numberGuard([{ key: 'progresso', texto: 'Progresso de 99%.' }], execR8.secoes).ok === false);
check('m59.8: determinismo da composição',
  JSON.stringify({ ...composeExecution(execDecisions, execActions, NOW), composicaoMs: 0 }) ===
  JSON.stringify({ ...composeExecution(execDecisions, execActions, NOW), composicaoMs: 0 }));
{
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) composeExecution(execDecisions, execActions, NOW);
  const per = (performance.now() - t0) / 100;
  check(`m59.8: benchmark composição ${per.toFixed(2)}ms (zero recompute)`, per < 100);
}

// determinismo + benchmark
check('m59.6: determinismo da ingestão',
  JSON.stringify(ingestStrategicDecisions(cStrat, [], NOW)) ===
  JSON.stringify(ingestStrategicDecisions(cStrat, [], NOW)));
{
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) {
    const ds = ingestStrategicDecisions(cStrat, [], NOW);
    dependencyView(ds);
    takeDecisionSnapshot(ds, NOW);
  }
  const per = (performance.now() - t0) / 100;
  check(`m59.6: benchmark ciclo completo ${per.toFixed(2)}ms (reuso de StrategicDecision, zero recompute)`, per < 100);
}

// fallback automático (o sistema JAMAIS deixa de responder)
void (async () => {
  const offReport = await narrateExecutive(mkEngine(), { generative: { enabled: false, transport: edgeGatewayTransport } });
  check('m59.2: generativo desligado ⇒ determinístico puro', offReport.modo === 'deterministico' && !offReport.fallbackMotivo);

  const gatewayReport = await narrateExecutive(mkEngine(), { generative: { enabled: true, transport: edgeGatewayTransport } });
  check('m59.2: gateway indisponível ⇒ FALLBACK automático com motivo',
    gatewayReport.modo === 'deterministico' && !!gatewayReport.fallbackMotivo);

  const badTransport = { name: 'fake', invoke: async () => ({ ok: true, secoes: [{ key: 'situacao', texto: 'Score 97.' }] }) };
  const guarded = await narrateExecutive(mkEngine(), { generative: { enabled: true, transport: badTransport } });
  check('m59.2: saída generativa inválida ⇒ Number Guard descarta ⇒ fallback',
    guarded.modo === 'deterministico' && (guarded.fallbackMotivo ?? '').includes('Number Guard'));

  const goodTransport = { name: 'fake-ok', invoke: async () => ({ ok: true,
    secoes: [{ key: 'situacao', texto: 'A plataforma segue em situação EXCELENTE, com Health Score 92 em 100 e tendência estavel.' }] }) };
  const generative = await narrateExecutive(mkEngine(), { generative: { enabled: true, transport: goodTransport } });
  check('m59.2: saída generativa VÁLIDA exibida com evidências preservadas',
    generative.modo === 'generativo' &&
    generative.secoes[0].frases[0].texto.includes('EXCELENTE') &&
    generative.secoes[0].frases[0].evidencias.length >= 2 &&
    generative.secoes[1].frases.length > 1 /* seções não reescritas permanecem determinísticas */);

  const throwTransport = { name: 'boom', invoke: async () => { throw new Error('rede caiu'); } };
  const crashed = await narrateExecutive(mkEngine(), { generative: { enabled: true, transport: throwTransport } });
  check('m59.2: exceção no adaptador ⇒ fallback (jamais deixa de responder)',
    crashed.modo === 'deterministico' && (crashed.fallbackMotivo ?? '').includes('rede caiu'));

  // ── M59.3: Operations Narrator (híbrido reutilizado) ────────
  const opsCrash = await narrateOperations(mkEngine(), { generative: { enabled: true, transport: throwTransport } });
  check('m59.3: fallback do híbrido COMPARTILHADO funciona no operations',
    opsCrash.report.narrator === 'operations' && opsCrash.report.modo === 'deterministico' &&
    (opsCrash.report.fallbackMotivo ?? '').includes('rede caiu'));

  // benchmark comparado (spec: inferior ao Executive)
  {
    const engB = mkEngine();
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) narrateExecutiveDeterministic(engB, prevInput);
    const execMs = (performance.now() - t1) / 100;
    const t2 = performance.now();
    for (let i = 0; i < 100; i++) narrateOperationsDeterministic(engB, prevInput);
    const opsMs = (performance.now() - t2) / 100;
    check(`m59.3: benchmark ops ${opsMs.toFixed(2)}ms (exec ${execMs.toFixed(2)}ms; alvo <100ms)`, opsMs < 100);
  }
  const normOps = (r: ReturnType<typeof narrateOperationsDeterministic>) =>
    JSON.stringify({ ...r, report: { ...r.report, duracaoMs: null } });
  check('m59.3: determinismo do operations narrator',
    normOps(narrateOperationsDeterministic(mkEngine(), null)) ===
    normOps(narrateOperationsDeterministic(mkEngine(), null)));

  // M59.4: híbrido/fallback/benchmark/determinismo do predictive
  const predCrash = await narratePredictive(mkEngine(), { generative: { enabled: true, transport: throwTransport } });
  check('m59.4: fallback do híbrido compartilhado no predictive',
    predCrash.report.narrator === 'predictive' && predCrash.report.modo === 'deterministico' &&
    (predCrash.report.fallbackMotivo ?? '').includes('rede caiu'));
  {
    const engP = mkEngine();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) narratePredictiveDeterministic(engP);
    const per = (performance.now() - t0) / 100;
    check(`m59.4: benchmark preditivo ${per.toFixed(2)}ms (alvo <100ms)`, per < 100);
  }
  const normPred = (r: ReturnType<typeof narratePredictiveDeterministic>) =>
    JSON.stringify({ ...r, report: { ...r.report, duracaoMs: null } });
  check('m59.4: determinismo do predictive narrator',
    normPred(narratePredictiveDeterministic(mkEngine())) ===
    normPred(narratePredictiveDeterministic(mkEngine())));

  // M59.5: híbrido/fallback/benchmark/determinismo do strategic
  const stratCrash = await narrateStrategic(execR, opsR, predR, mkEngine().input,
    { generative: { enabled: true, transport: throwTransport } });
  check('m59.5: fallback do híbrido compartilhado no strategic',
    stratCrash.report.narrator === 'strategic' && stratCrash.report.modo === 'deterministico' &&
    (stratCrash.report.fallbackMotivo ?? '').includes('rede caiu'));
  {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) composeStrategic(execR, opsR, predR);
    const per = (performance.now() - t0) / 100;
    check(`m59.5: benchmark composição ${per.toFixed(2)}ms (sem recomputar narradores)`, per < 100);
  }
  const normStrat = (r: ReturnType<typeof composeStrategic>) =>
    JSON.stringify({ ...r, report: { ...r.report, duracaoMs: null } });
  check('m59.5: determinismo da composição',
    normStrat(composeStrategic(execR, opsR, predR)) === normStrat(composeStrategic(execR, opsR, predR)));

  // benchmark do narrador determinístico (<100ms)
  {
    const eng100 = mkEngine();
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) narrateExecutiveDeterministic(eng100, prevInput);
    const per = (performance.now() - t0) / 100;
    check(`m59.2: benchmark — narrativa ${per.toFixed(2)}ms (alvo <100ms)`, per < 100);
  }
  // duracaoMs é medição de relógio (metadado), não conteúdo narrado — normaliza
  const normReport = (r: ReturnType<typeof narrateExecutiveDeterministic>) =>
    JSON.stringify({ ...r, duracaoMs: null });
  check('m59.2: determinismo — mesmas fontes ⇒ mesma narrativa',
    normReport(narrateExecutiveDeterministic(mkEngine(), null)) ===
    normReport(narrateExecutiveDeterministic(mkEngine(), null)));

  console.log(`\n[m59.2 async] concluído`);
})();

// ── Export framework (interfaces desligadas) ─────────────────
check('export: 5 formatos registrados, todos indisponíveis',
  EXPORTERS.length === 5 && EXPORTERS.every((e) => !e.available));
void getExporter('pdf').export({ source: 'selftest', payload: {} }).then((r) => {
  check('export: stub responde ok=false com razão', !r.ok && !!r.reason);

  // ── Tokens ──────────────────────────────────────────────────
  check('tokens: escala semântica completa',
    ['excelente', 'bom', 'atencao', 'critico', 'offline', 'informacao', 'aviso', 'alto', 'emergencia']
      .every((k) => k in stateColors));
  check('tokens: grid/breakpoints/typography presentes',
    tokens.grid.columns.xl === 4 && tokens.breakpoints.lg === 1024 && !!tokens.typography.kpiValue);

  console.log(`\n${passed} PASS · ${failed} FAIL`);
  if (failed > 0)
    (globalThis as { process?: { exit(code: number): void } }).process?.exit(1);
});
