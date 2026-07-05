/**
 * M58.1 · Executive Dashboard (CEO Cockpit) — primeira página visual do M58.
 *
 * Consome EXCLUSIVAMENTE datasets oficiais via useDataset/registry.
 * Zero SQL, zero agregação, zero regra de negócio: todo número exibido
 * nasce pronto no banco; helpers só formatam/mapeiam (ver helpers.ts).
 * KPIs de verticais sem métrica oficial aparecem como "aguardando fonte"
 * — doutrina do Programa CIO: nunca inventar.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { DashboardProvider, useDashboard } from '../../state/DashboardProvider';
import { useDataset } from '../../hooks/useDataset';
import { WidgetGrid, WidgetShell } from '../../layout/DashboardLayout';
import { NAV_TREE } from '../../layout/navigation';
import { telemetry } from '../../core/telemetry';
import { typography } from '../../core/tokens';
import { KpiCard, MetricCard, HealthCard, AlertCard, IncidentCard, TrendCard } from '../../components/cards';
import { StatusBadge, Gauge, Timeline, stateKeyFrom } from '../../components/indicators';
import { DatasetBoundary, EmptyState } from '../../components/feedback';
import { ExecutiveTopBar } from './ExecutiveTopBar';
import {
  windowForPreset, metricFromBundle, seriesToPoints, severityBuckets, healthCounts,
  OPERATIONAL_COMPONENTS, pickComponent, recentActivity, trendDirection, TREND_GLYPH,
  fmtBRL, fmtNum, fmtDateTime,
} from './helpers';

const KPI_KEYS = ['receita', 'publicacoes', 'conversao', 'backlog'];
const CONSUMER = 'dashboard:executivo';

/** Verticais SEM métrica oficial hoje — exibidas honestamente. */
const PENDING_KPIS = [
  { name: 'Corridas', dep: 'telemetria vertical (roadmap)' },
  { name: 'Marketplace', dep: 'telemetria vertical (roadmap)' },
  { name: 'Usuários ativos', dep: 'tracking real (M60)' },
  { name: 'Motoristas online', dep: 'telemetria vertical (roadmap)' },
  { name: 'Entregas', dep: 'telemetria vertical (roadmap)' },
] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className={`${typography.sectionTitle} mb-2 mt-6 first:mt-0`}>{children}</h2>;
}

function TrendGlyph({ cur, prev }: { cur: number | null | undefined; prev: number | null | undefined }) {
  const dir = trendDirection(cur ?? null, prev ?? null);
  if (!dir) return null;
  return (
    <span className={dir === 'up' ? 'text-green-600' : dir === 'down' ? 'text-red-600' : 'text-muted-foreground'}>
      {TREND_GLYPH[dir]}
    </span>
  );
}

/** Painel interno — usado pela Shell (M58.5) sob o provider ÚNICO dela. */
export function ExecutivePanel() {
  return <ExecutiveInner />;
}

function ExecutiveInner() {
  const { state } = useDashboard();
  const renderT0 = useRef(performance.now());
  useEffect(() => {
    telemetry.recordRender({ component: 'ExecutiveDashboard', ms: performance.now() - renderT0.current });
  }, []);

  // Janelas oficiais de consulta (atual + anterior, p/ comparação lado a lado)
  const win = useMemo(
    () => windowForPreset(state.dates.preset, new Date(), state.dates),
    [state.dates],
  );

  // ── Datasets oficiais (react-query deduplica por chave) ──────
  const bundle = useDataset('metric-bundle', {
    p_keys: KPI_KEYS, p_grain: win.grain, p_from: win.from, p_to: win.to, p_consumer: CONSUMER,
  });
  const bundlePrev = useDataset('metric-bundle', {
    p_keys: KPI_KEYS, p_grain: win.grain, p_from: win.prevFrom, p_to: win.prevTo, p_consumer: CONSUMER,
  });
  const healthExec = useDataset('health-executive');
  const operational = useDataset('operational');
  const alertDash = useDataset('alert-dashboard');
  const alertExec = useDataset('alert-executive');
  const motorMetrics = useDataset('motor-metrics', { p_hours: 24 });

  const he = (healthExec.data ?? {}) as Record<string, unknown>;
  const op = (operational.data ?? {}) as Record<string, unknown>;
  const ad = (alertDash.data ?? {}) as Record<string, unknown>;
  const ae = (alertExec.data ?? {}) as Record<string, unknown>;

  const receita = metricFromBundle(bundle.data, 'receita');
  const receitaPrev = metricFromBundle(bundlePrev.data, 'receita');
  const publicacoes = metricFromBundle(bundle.data, 'publicacoes');
  const publicacoesPrev = metricFromBundle(bundlePrev.data, 'publicacoes');
  const conversao = metricFromBundle(bundle.data, 'conversao');
  const conversaoPrev = metricFromBundle(bundlePrev.data, 'conversao');
  const backlog = metricFromBundle(bundle.data, 'backlog');

  const sev = severityBuckets(ad.por_severidade);
  const hc = healthCounts(op.health);
  const activity = recentActivity({
    incidents: op.incidentes,
    alertHistory: ad.historico_7d,
    healthTimeline: op.timeline_24h,
  });

  const lastFetchOk = !bundle.isError && !healthExec.isError && !alertDash.isError;
  const refreshAll = () => {
    bundle.refetch(); bundlePrev.refetch(); healthExec.refetch(); operational.refetch();
    alertDash.refetch(); alertExec.refetch(); motorMetrics.refetch();
  };

  const scoreGeral = typeof he.score_geral === 'number' ? (he.score_geral as number) : null;
  const alertasAtivos = typeof ae.alertas_ativos === 'number' ? (ae.alertas_ativos as number) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ExecutiveTopBar updatedAt={bundle.updatedAt} onRefresh={refreshAll} lastFetchOk={lastFetchOk} />
      <main className="mx-auto max-w-[1400px] p-4">

        {/* ── Linha 1 · KPIs principais ─────────────────────── */}
        <SectionTitle>Visão Executiva · {win.label}</SectionTitle>
        <DatasetBoundary {...bundle} skeletonLines={4}>
          <WidgetGrid>
            <KpiCard
              label="Receita"
              value={fmtBRL(receita?.value)}
              hint={`${win.prevLabel}: ${fmtBRL(receitaPrev?.value) ?? '—'}`}
            />
            <KpiCard
              label="Publicações"
              value={fmtNum(publicacoes?.value)}
              hint={`${win.prevLabel}: ${fmtNum(publicacoesPrev?.value) ?? '—'}`}
            />
            <KpiCard
              label="Conversões"
              value={fmtNum(conversao?.value)}
              hint={`${win.prevLabel}: ${fmtNum(conversaoPrev?.value) ?? '—'}`}
            />
            <KpiCard label="Backlog da fila" value={fmtNum(backlog?.value)} hint="solicitações agendadas agora" />
            <KpiCard
              label="Health Score"
              value={scoreGeral}
              unit="/100"
              hint={String(he.situacao_geral ?? '')}
            />
            <KpiCard
              label="Alertas ativos"
              value={alertasAtivos}
              hint={`tendência: ${String(ae.tendencia_operacional ?? '—')}`}
            />
            {PENDING_KPIS.slice(0, 2).map((k) => (
              <MetricCard key={k.name} name={k.name} value={null} aguardandoFonte />
            ))}
          </WidgetGrid>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              Receita <TrendGlyph cur={receita?.value} prev={receitaPrev?.value} /> ·
              Publicações <TrendGlyph cur={publicacoes?.value} prev={publicacoesPrev?.value} /> ·
              Conversões <TrendGlyph cur={conversao?.value} prev={conversaoPrev?.value} />
            </span>
            <span>
              {PENDING_KPIS.slice(2).map((k) => k.name).join(' · ')}: aguardando fonte oficial — nunca estimamos.
            </span>
          </div>
        </DatasetBoundary>

        {/* ── Linha 2 · Saúde da plataforma ─────────────────── */}
        <SectionTitle>Saúde da Plataforma</SectionTitle>
        <DatasetBoundary {...healthExec} skeletonLines={3}>
          <WidgetGrid>
            <WidgetShell>
              <p className={typography.kpiLabel}>Health geral</p>
              <div className="mt-1 flex justify-center"><Gauge value={scoreGeral} size={130} /></div>
            </WidgetShell>
            <KpiCard label="Componentes saudáveis" value={hc.saudaveis} />
            <KpiCard label="Degradados" value={hc.degradados} hint={`offline (sem telemetria): ${hc.offline}`} />
            <KpiCard
              label="Incidentes ativos"
              value={typeof he.incidentes_ativos === 'number' ? (he.incidentes_ativos as number) : null}
            />
            <WidgetShell colSpan={2}>
              <p className={typography.kpiLabel}>Disponibilidade (30d)</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries((op.disponibilidade ?? {}) as Record<string, unknown>)
                  .slice(0, 8)
                  .map(([comp, pct]) => (
                    <div key={comp} className="text-center">
                      <p className={`${typography.mono} text-sm font-semibold`}>
                        {pct == null ? '—' : `${pct}%`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{comp}</p>
                    </div>
                  ))}
              </div>
            </WidgetShell>
            <WidgetShell colSpan={2}>
              <p className={typography.kpiLabel}>SLA das métricas</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Array.isArray(op.sla) ? (op.sla as Record<string, unknown>[]) : []).map((s) => (
                  <span key={String(s.metric)} title={`atraso: ${s.atraso_atual_min ?? '—'} min`}>
                    <StatusBadge
                      state={
                        s.status_operacional === 'ok' ? 'bom'
                        : s.status_operacional === 'draft' || s.status_operacional === 'sem_dados' ? 'offline'
                        : s.status_operacional === 'atrasado' ? 'atencao' : 'critico'
                      }
                      label={String(s.metric)}
                    />
                  </span>
                ))}
              </div>
            </WidgetShell>
          </WidgetGrid>
        </DatasetBoundary>

        {/* ── Linha 3 · Alertas ─────────────────────────────── */}
        <SectionTitle>Alertas</SectionTitle>
        <DatasetBoundary {...alertDash} skeletonLines={3}>
          <WidgetGrid>
            <KpiCard label="Críticos" value={sev.criticos} hint="emergência + crítico" />
            <KpiCard label="Altos" value={sev.altos} />
            <KpiCard label="Médios" value={sev.medios} hint="atenção" />
            <KpiCard label="Informativos" value={sev.informativos} hint="aviso + informação" />
          </WidgetGrid>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <p className={typography.cardTitle}>Ativos</p>
              <div className="mt-2 space-y-2">
                {(Array.isArray(ad.ativos) ? (ad.ativos as Record<string, unknown>[]) : [])
                  .slice(0, 5)
                  .map((a) => (
                    <AlertCard
                      key={String(a.id)}
                      ruleKey={String(a.rule_key)}
                      severity={String(a.severity)}
                      status={String(a.status)}
                      component={a.component ? String(a.component) : null}
                      ageMin={typeof a.idade_min === 'number' ? (a.idade_min as number) : undefined}
                      occurrences={typeof a.occurrences === 'number' ? (a.occurrences as number) : undefined}
                    />
                  ))}
                {(!Array.isArray(ad.ativos) || (ad.ativos as unknown[]).length === 0) && (
                  <EmptyState title="Nenhum alerta ativo" description="Silêncio operacional — as regras seguem avaliando." />
                )}
              </div>
            </div>
            <div>
              <p className={typography.cardTitle}>Incidentes & recomendações</p>
              <div className="mt-2 space-y-2">
                {(Array.isArray(ad.incidentes) ? (ad.incidentes as Record<string, unknown>[]) : [])
                  .filter((g) => g.aberto === true)
                  .slice(0, 3)
                  .map((g) => (
                    <IncidentCard
                      key={String(g.group_id)}
                      component={String(g.root_component ?? '')}
                      severity="P1"
                      startedAt={fmtDateTime(String(g.created_at))}
                      status="open"
                      cause="raiz da correlação — ver Alert Center"
                    />
                  ))}
                {(Array.isArray(ad.recomendacoes) ? (ad.recomendacoes as Record<string, unknown>[]) : [])
                  .slice(0, 2)
                  .map((r, i) => (
                    <div key={i} className="rounded-md border border-border p-3">
                      <p className="text-xs font-semibold">Runbook {String(r.runbook ?? '')} · {String(r.rule_key ?? '')}</p>
                      <ol className="mt-1 list-decimal pl-4 text-xs text-muted-foreground">
                        {(Array.isArray(r.passos) ? (r.passos as string[]) : []).slice(0, 4).map((p, j) => (
                          <li key={j}>{p}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </DatasetBoundary>

        {/* ── Linha 4 · Tendências (séries OFICIAIS) ────────── */}
        <SectionTitle>Tendências · {win.label}</SectionTitle>
        <DatasetBoundary {...bundle} skeletonLines={3}>
          <WidgetGrid>
            <TrendCard label="Receita" points={seriesToPoints(receita)} currentLabel={fmtBRL(receita?.value) ?? undefined} />
            <TrendCard label="Publicações" points={seriesToPoints(publicacoes)} currentLabel={fmtNum(publicacoes?.value) ?? undefined} />
            <TrendCard label="Conversões" points={seriesToPoints(conversao)} currentLabel={fmtNum(conversao?.value) ?? undefined} />
            <TrendCard
              label="Alertas (14d)"
              points={(Array.isArray(ad.tendencia_14d) ? (ad.tendencia_14d as Record<string, unknown>[]) : [])
                .map((t) => ({ x: String(t.dia), y: Number(t.alertas ?? 0) }))}
              currentLabel={`tendência operacional: ${String(ae.tendencia_operacional ?? '—')}`}
            />
          </WidgetGrid>
        </DatasetBoundary>

        {/* ── Linha 5 · Resumo executivo (literal, sem interpretação) ── */}
        <SectionTitle>Resumo Executivo</SectionTitle>
        <DatasetBoundary {...alertExec} skeletonLines={3}>
          <div className="grid gap-3 lg:grid-cols-3">
            <WidgetShell>
              <p className={typography.kpiLabel}>Situação geral</p>
              <div className="mt-2">
                <StatusBadge
                  state={
                    he.situacao_geral === 'SAUDAVEL' ? 'excelente'
                    : he.situacao_geral === 'ATENCAO' ? 'atencao' : 'critico'
                  }
                  label={String(he.situacao_geral ?? '—')}
                />
              </div>
              <p className={`${typography.cardSubtitle} mt-2`}>
                componentes críticos: {(Array.isArray(he.componentes_criticos) ? (he.componentes_criticos as string[]) : []).join(', ') || 'nenhum'}
              </p>
              <p className={typography.cardSubtitle}>
                offline (sem telemetria): {(Array.isArray(he.componentes_offline) ? (he.componentes_offline as string[]) : []).join(', ') || 'nenhum'}
              </p>
            </WidgetShell>
            <WidgetShell>
              <p className={typography.kpiLabel}>Principais riscos (early warning)</p>
              <ul className="mt-2 space-y-1 text-xs">
                {(Array.isArray(ae.early_warning) ? (ae.early_warning as Record<string, unknown>[]) : [])
                  .slice(0, 4)
                  .map((w, i) => <li key={i}>• {String(w.alerta ?? '')} {w.component ? `(${String(w.component)})` : ''}</li>)}
                {(Array.isArray(ae.maiores_riscos) ? (ae.maiores_riscos as Record<string, unknown>[]) : [])
                  .slice(0, 3)
                  .map((r, i) => <li key={`r${i}`}>• {String(r.rule_key ?? '')} · {String(r.severity ?? '')}</li>)}
                {!(Array.isArray(ae.early_warning) && (ae.early_warning as unknown[]).length) &&
                  !(Array.isArray(ae.maiores_riscos) && (ae.maiores_riscos as unknown[]).length) && (
                    <li className="text-muted-foreground">nenhum risco apontado pelas fontes oficiais</li>
                  )}
              </ul>
            </WidgetShell>
            <WidgetShell>
              <p className={typography.kpiLabel}>Financeiro & comercial ({win.label})</p>
              <p className="mt-2 text-sm">Receita: <b>{fmtBRL(receita?.value) ?? '—'}</b> <TrendGlyph cur={receita?.value} prev={receitaPrev?.value} /></p>
              <p className="text-sm">Conversões: <b>{fmtNum(conversao?.value) ?? '—'}</b> <TrendGlyph cur={conversao?.value} prev={conversaoPrev?.value} /></p>
              <p className={`${typography.cardSubtitle} mt-2`}>
                destaques operacionais: {fmtNum(publicacoes?.value) ?? '—'} publicações confirmadas
              </p>
            </WidgetShell>
          </div>
        </DatasetBoundary>

        {/* ── Linha 6 · Situação operacional ────────────────── */}
        <SectionTitle>Situação Operacional</SectionTitle>
        <DatasetBoundary {...operational} skeletonLines={2}>
          <div className="flex flex-wrap gap-3">
            {OPERATIONAL_COMPONENTS.map((c) => {
              const h = pickComponent(op.health, c);
              return (
                <div key={c} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <StatusBadge state={stateKeyFrom(h?.classification)} label={h?.classification ?? 'Offline'} />
                  <span className="text-xs">{h?.name ?? c}</span>
                  {h?.score != null && (
                    <span className={`${typography.mono} text-xs text-muted-foreground`}>{h.score}</span>
                  )}
                </div>
              );
            })}
          </div>
        </DatasetBoundary>

        {/* ── Linha 7 · Atividade recente ───────────────────── */}
        <SectionTitle>Atividade Recente</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-3">
          <WidgetShell colSpan={2}>
            <DatasetBoundary {...operational} skeletonLines={4}>
              {activity.length ? <Timeline entries={activity} /> : <EmptyState title="Sem atividade registrada" />}
            </DatasetBoundary>
          </WidgetShell>
          <WidgetShell>
            <p className={typography.kpiLabel}>Execuções do motor (24h)</p>
            <DatasetBoundary {...motorMetrics} skeletonLines={3}>
              {(() => {
                const mm = (motorMetrics.data ?? {}) as Record<string, unknown>;
                return (
                  <div className="mt-2 space-y-1 text-sm">
                    <p>Solicitações: <b>{fmtNum(mm.throughput_total as number) ?? '—'}</b></p>
                    <p>Sucesso: <b>{fmtNum(mm.sucesso as number) ?? '—'}</b> · Erros: <b>{fmtNum(mm.erros as number) ?? '—'}</b></p>
                    <p>Fila de lotes: <b>{fmtNum(mm.fila_lotes_available as number) ?? '—'}</b></p>
                    <p className={typography.cardSubtitle}>legado observado: {fmtNum(mm.legado_observado as number) ?? '—'} eventos</p>
                  </div>
                );
              })()}
            </DatasetBoundary>
          </WidgetShell>
        </div>

        {/* ── Linha 8 · Quick actions ───────────────────────── */}
        <SectionTitle>Acesso Rápido</SectionTitle>
        <div className="mb-8 flex flex-wrap gap-2">
          {NAV_TREE.filter((s) => s.key !== 'visao-geral').map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={s.status === 'planejada'}
              title={s.status === 'planejada' ? `${s.label} — módulo em construção (M58.x)` : s.label}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-40"
            >
              {s.label}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function ExecutiveDashboard() {
  return (
    <DashboardProvider>
      <ExecutiveInner />
    </DashboardProvider>
  );
}
