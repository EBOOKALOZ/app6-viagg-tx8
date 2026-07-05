/**
 * M58.0 · Dataset Registry — ÚNICA lista de fontes de dados dos dashboards.
 *
 * Regra congelada: nenhum componente conhece nome de RPC; tudo passa por
 * uma chave deste registro. Nenhum SQL, nenhuma agregação, nenhum acesso
 * a rollup/tabela — só as RPCs e datasets oficiais do Programa CIO.
 * `generateRegistryDocs()` produz a documentação automática (markdown).
 *
 * Nota M58.1 (migration 064): operational/noc/health-executive/governance
 * ganharam EXECUTE p/ authenticated — a guarda is_admin() interna decide
 * (permission 'admin.total' abaixo reflete essa guarda, não a ACL).
 */

import type { Resource } from './roles';

export interface DatasetDef {
  /** chave usada pelos hooks/componentes */
  key: string;
  /** nome humano */
  name: string;
  description: string;
  /** RPC oficial chamada — NUNCA tabela/rollup */
  rpc: string;
  /** parâmetros default (assinaturas oficiais; nunca inventar params) */
  defaultParams?: Record<string, unknown>;
  /** origem institucional do dado */
  origin: 'semantic-layer' | 'health-center' | 'alert-center' | 'motor' | 'governanca';
  /** frequência de atualização sugerida no runbook (segundos) */
  refreshSec: number;
  /** recurso exigido (espelho do cio_authorize; o banco é a fronteira real) */
  permission: Resource;
  /** consumidor registrado em cio_metric_consumers / access log */
  consumer: string;
  /** RPCs/fontes das quais este dataset depende (documentação) */
  dependsOn: string[];
  /** referência de documentação */
  docs: string;
}

export const DATASET_REGISTRY: readonly DatasetDef[] = [
  {
    key: 'operational',
    name: 'Dataset Operacional',
    description: '10 blocos: health, SLA, drift 7d, quality, timeline 24h, incidentes, disponibilidade, performance, alertas, validator.',
    rpc: 'cio_operational_dataset',
    origin: 'health-center',
    refreshSec: 60,
    permission: 'admin.total',
    consumer: 'dashboard:operacional',
    dependsOn: ['cio_health_compute', 'cio_metric_sla_status', 'cio_metric_quality', 'cio_early_warning', 'cio_semantic_validate'],
    docs: 'DOCS/m55-4-health-center.md',
  },
  {
    key: 'noc',
    name: 'NOC',
    description: 'Semáforo por componente, incidentes ativos, avisos e fila. Refresh 30s declarado no payload.',
    rpc: 'cio_noc_dataset',
    origin: 'health-center',
    refreshSec: 30,
    permission: 'admin.total',
    consumer: 'dashboard:noc',
    dependsOn: ['cio_health_compute', 'cio_early_warning'],
    docs: 'DOCS/m55-4-health-center.md',
  },
  {
    key: 'health-executive',
    name: 'Saúde — Executivo',
    description: 'Situação geral, score médio, críticos/offline, riscos, prioridades.',
    rpc: 'cio_health_executive',
    origin: 'health-center',
    refreshSec: 300,
    permission: 'admin.total',
    consumer: 'dashboard:health-executivo',
    dependsOn: ['cio_health_compute', 'cio_root_cause', 'cio_early_warning'],
    docs: 'DOCS/m55-4-health-center.md',
  },
  {
    key: 'alert-dashboard',
    name: 'Central de Alertas',
    description: '10 blocos: ativos, histórico 7d, incidentes, severidade, componente, SLA, semáforo, tendência 14d, recomendações, ruído.',
    rpc: 'cio_alert_dashboard',
    origin: 'alert-center',
    refreshSec: 60,
    permission: 'admin.total',
    consumer: 'dashboard:alertas',
    dependsOn: ['cio_alerts_list', 'cio_alert_history', 'cio_alert_stats', 'cio_health_compute'],
    docs: 'DOCS/m55-5-alert-center.md',
  },
  {
    key: 'alert-executive',
    name: 'Alertas — Executivo',
    description: 'Contagens, maiores riscos, tendência operacional 7d vs 7d, disponibilidade.',
    rpc: 'cio_alert_executive',
    origin: 'alert-center',
    refreshSec: 300,
    permission: 'admin.total',
    consumer: 'dashboard:alertas-executivo',
    dependsOn: ['cio_health_compute', 'cio_availability', 'cio_early_warning'],
    docs: 'DOCS/m55-5-alert-center.md',
  },
  {
    key: 'governance',
    name: 'Governança Semântica',
    description: '11 blocos: catálogo, quality, heatmap, profiler, SLA, validator, issues, timeline, certificação, owners, tags.',
    rpc: 'cio_governance_dataset',
    origin: 'governanca',
    refreshSec: 300,
    permission: 'admin.total',
    consumer: 'dashboard:governanca',
    dependsOn: ['cio_data_dictionary', 'cio_metric_quality', 'cio_metric_sla_status', 'cio_semantic_validate'],
    docs: 'DOCS/m55-3b-enterprise-governance.md',
  },
  {
    key: 'motor',
    name: 'Motor Central',
    description: 'Funil de publicação: throughput, modos, status, latência, fila, legado observado.',
    rpc: 'motor_dashboard',
    origin: 'motor',
    refreshSec: 30,
    permission: 'admin.total',
    consumer: 'dashboard:admin-motor-central',
    dependsOn: ['motor_metrics'],
    docs: 'DOCS/m53-2a-fortalecimento.md',
  },
  {
    key: 'motor-metrics',
    name: 'Telemetria do Motor',
    description: 'Métricas do funil por janela de horas (endurecida: telemetria.leitura).',
    rpc: 'motor_metrics',
    defaultParams: { p_hours: 24 },
    origin: 'motor',
    refreshSec: 60,
    permission: 'telemetria.leitura',
    consumer: 'dashboard:motor-telemetria',
    dependsOn: [],
    docs: 'DOCS/m53-2a-fortalecimento.md',
  },
  {
    key: 'metric',
    name: 'Métrica Semântica',
    description: 'UMA métrica oficial via Semantic Layer (audiência + self-scope aplicados no banco).',
    rpc: 'cio_metric',
    origin: 'semantic-layer',
    refreshSec: 300,
    permission: 'dashboards.acesso',
    consumer: 'dashboard:widget-metric',
    dependsOn: ['cio_metric_definitions'],
    docs: 'DOCS/m55-3-semantic-layer.md',
  },
  {
    key: 'metric-bundle',
    name: 'Bundle de Métricas',
    description: 'Várias métricas oficiais numa chamada (2ms p/ 6 métricas no benchmark).',
    rpc: 'cio_metric_bundle',
    origin: 'semantic-layer',
    refreshSec: 300,
    permission: 'dashboards.acesso',
    consumer: 'dashboard:widget-bundle',
    dependsOn: ['cio_metric'],
    docs: 'DOCS/m55-3-semantic-layer.md',
  },
  {
    key: 'my-roles',
    name: 'Meus Papéis',
    description: 'Perfil de autorização do usuário logado (self-scoped por construção).',
    rpc: 'cio_my_roles',
    origin: 'governanca',
    refreshSec: 600,
    permission: 'dashboards.acesso',
    consumer: 'dashboard:authz',
    dependsOn: ['cio_user_roles', 'cio_role_permissions'],
    docs: 'DOCS/m58-0-fundacao.md',
  },
  {
    key: 'metric-lineage',
    name: 'Linhagem de Métrica',
    description: 'Cadeia oficial de 5 níveis (origem física → ETL → rollup → semantic → RPC) de uma métrica.',
    rpc: 'cio_metric_lineage',
    origin: 'governanca',
    refreshSec: 600,
    permission: 'governanca.leitura',
    consumer: 'dashboard:lineage',
    dependsOn: ['cio_metric_definitions', 'cio_watermarks'],
    docs: 'DOCS/m55-3b-enterprise-governance.md',
  },
  {
    key: 'data-dictionary',
    name: 'Dicionário de Dados',
    description: 'Catálogo de métricas p/ telas de governança (endurecida: governanca.leitura).',
    rpc: 'cio_data_dictionary',
    defaultParams: { p_tag: null },
    origin: 'governanca',
    refreshSec: 600,
    permission: 'governanca.leitura',
    consumer: 'dashboard:dicionario',
    dependsOn: ['cio_metric_definitions'],
    docs: 'DOCS/m55-3a-semantic-audit.md',
  },
] as const;

export type DatasetKey = (typeof DATASET_REGISTRY)[number]['key'];

const byKey = new Map(DATASET_REGISTRY.map((d) => [d.key, d]));

export function getDataset(key: DatasetKey): DatasetDef {
  const def = byKey.get(key);
  if (!def) throw new Error(`Dataset desconhecido no registry: ${key}`);
  return def;
}

/** Validação estrutural do registry (usada no self-test). */
export function validateRegistry(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const d of DATASET_REGISTRY) {
    if (seen.has(d.key)) problems.push(`chave duplicada: ${d.key}`);
    seen.add(d.key);
    if (!d.rpc || d.rpc.includes(' ') || d.rpc.toLowerCase().includes('select'))
      problems.push(`${d.key}: rpc inválida (SQL na interface é proibido)`);
    if (d.refreshSec < 15) problems.push(`${d.key}: refresh agressivo demais`);
    if (!d.docs) problems.push(`${d.key}: sem documentação`);
  }
  return problems;
}

/** Documentação automática do registry (§4 do M58.0). */
export function generateRegistryDocs(): string {
  const rows = DATASET_REGISTRY.map(
    (d) =>
      `| \`${d.key}\` | ${d.name} | \`${d.rpc}\` | ${d.origin} | ${d.refreshSec}s | ${d.permission} | ${d.consumer} | ${d.dependsOn.map((x) => `\`${x}\``).join(', ') || '—'} | ${d.docs} |`,
  );
  return [
    '<!-- GERADO por generateRegistryDocs() — não editar à mão -->',
    '| Chave | Nome | RPC | Origem | Refresh | Permissão | Consumidor | Depende de | Docs |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}
