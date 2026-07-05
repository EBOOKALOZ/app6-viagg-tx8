/**
 * M58.2 · Enterprise Operations Dashboard (NOC) — /admin/operacional
 *
 * Painel operacional em tempo quase-real: responde "como está a operação
 * AGORA" consumindo exclusivamente datasets oficiais (noc 30s, operational
 * 60s, alertas, executivos, motor). Zero SQL, zero cálculo, zero regra de
 * negócio; placeholders declarados onde ainda não existe dataset oficial.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardProvider, useDashboard } from '../../state/DashboardProvider';
import { useDataset } from '../../hooks/useDataset';
import { telemetry } from '../../core/telemetry';
import { typography, borders } from '../../core/tokens';
import { AlertCard, TrendCard, KpiCard } from '../../components/cards';
import { Timeline } from '../../components/indicators';
import { DatasetBoundary, EmptyState } from '../../components/feedback';
import { recentActivity } from '../executive/helpers';
import {
  alertLifecycleCounts, componentRows, queueItems, healthGridCells,
  componentTrendPoints, trendableComponents, overallState,
} from './helpers';
import {
  OperationalTopBar, HealthOverview, ComponentGrid, ComponentTable,
  QueuePanel, IncidentPanel, type OverviewCard,
} from './components';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className={`${typography.sectionTitle} mb-2 mt-6 first:mt-0`}>{children}</h2>;
}

function scoreOf(health: unknown, component: string): { score: number | null; cls: string | null } {
  const arr = Array.isArray(health)
    ? (health as { component?: string; classification?: string; score?: number | null }[])
    : [];
  const h = arr.find((x) => x.component === component);
  return { score: h?.score ?? null, cls: h?.classification ?? null };
}

/** Painel interno — usado pela Shell (M58.5) sob o provider ÚNICO dela. */
export function OperationsPanel() {
  return <NocInner />;
}

function NocInner() {
  const { state, dispatch } = useDashboard();
  const renderT0 = useRef(performance.now());
  useEffect(() => {
    telemetry.recordRender({ component: 'OperationsDashboard', ms: performance.now() - renderT0.current });
  }, []);

  // ── Datasets oficiais (dedupe nativo por chave) ──────────────
  const noc = useDataset('noc');                       // 30s — semáforo + fila
  const operational = useDataset('operational');       // 60s — saúde/sla/incidentes/timeline
  const healthExec = useDataset('health-executive');   // situação geral
  const alertDash = useDataset('alert-dashboard');     // alertas/incidentes correlacionados
  const alertExec = useDataset('alert-executive');     // contagens executivas
  const motorMetrics = useDataset('motor-metrics', { p_hours: 24 });

  const op = (operational.data ?? {}) as Record<string, unknown>;
  const nc = (noc.data ?? {}) as Record<string, unknown>;
  const he = (healthExec.data ?? {}) as Record<string, unknown>;
  const ad = (alertDash.data ?? {}) as Record<string, unknown>;
  const ae = (alertExec.data ?? {}) as Record<string, unknown>;
  const mm = (motorMetrics.data ?? {}) as Record<string, unknown>;

  const overall = overallState(he.situacao_geral);
  const lifecycle = alertLifecycleCounts(ad.ativos, ad.historico_7d);
  const rows = componentRows(op.health, op.disponibilidade, op.timeline_24h, op.sla);
  const cells = healthGridCells(op.health);
  const queues = queueItems(nc.fila, mm);
  const activity = recentActivity({
    incidents: op.incidentes,
    alertHistory: ad.historico_7d,
    healthTimeline: op.timeline_24h,
  });

  // seletor de tendência (componentes com telemetria real)
  const trendable = useMemo(() => trendableComponents(op.timeline_24h), [op.timeline_24h]);
  const [trendComp, setTrendComp] = useState<string | null>(null);
  const selected = trendComp ?? trendable[0] ?? null;

  const cards: OverviewCard[] = [
    { emoji: '🟢', title: 'Saúde Geral', value: typeof he.score_geral === 'number' ? (he.score_geral as number) : null, classification: String(he.situacao_geral ?? '') || null },
    { emoji: '🟡', title: 'ETL', value: scoreOf(op.health, 'etl').score, classification: scoreOf(op.health, 'etl').cls },
    { emoji: '🔵', title: 'Dispatcher', value: scoreOf(op.health, 'dispatcher').score, classification: scoreOf(op.health, 'dispatcher').cls },
    { emoji: '🟣', title: 'Matching', value: scoreOf(op.health, 'matching').score, classification: scoreOf(op.health, 'matching').cls },
    { emoji: '🟠', title: 'Semantic Layer', value: scoreOf(op.health, 'semantic_layer').score, classification: scoreOf(op.health, 'semantic_layer').cls },
    { emoji: '🔴', title: 'Alert Center', value: typeof ae.alertas_ativos === 'number' ? (ae.alertas_ativos as number) : null, hint: 'alertas ativos' },
    { emoji: '⚪', title: 'Health Center', value: typeof he.incidentes_ativos === 'number' ? (he.incidentes_ativos as number) : null, hint: 'incidentes ativos' },
  ];

  const refreshAll = () => {
    noc.refetch(); operational.refetch(); healthExec.refetch();
    alertDash.refetch(); alertExec.refetch(); motorMetrics.refetch();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OperationalTopBar
        overall={overall}
        updatedAt={noc.updatedAt ?? operational.updatedAt}
        onRefresh={refreshAll}
        autoLabel={state.autoRefreshSec === 0 ? 'auto: pausado' : `auto: ${state.autoRefreshSec}s`}
        onToggleAuto={() =>
          dispatch({ type: 'set-auto-refresh', sec: state.autoRefreshSec === 0 ? 30 : 0 })
        }
      />
      <main className="mx-auto max-w-[1500px] p-4">

        {/* Cards principais */}
        <SectionTitle>Centro de Operações</SectionTitle>
        <DatasetBoundary {...operational} skeletonLines={3}>
          <HealthOverview cards={cards} />
        </DatasetBoundary>

        {/* Mapa de saúde */}
        <SectionTitle>Mapa de Saúde (16 componentes)</SectionTitle>
        <DatasetBoundary {...operational} skeletonLines={2}>
          <ComponentGrid cells={cells} />
          <p className={`${typography.cardSubtitle} mt-1`}>
            cinza = sem telemetria (componente ainda não emite dados — nunca inventamos score)
          </p>
        </DatasetBoundary>

        {/* Filas */}
        <SectionTitle>Filas & Motores</SectionTitle>
        <DatasetBoundary {...noc} skeletonLines={2}>
          <QueuePanel items={queues} />
        </DatasetBoundary>

        {/* Alertas */}
        <SectionTitle>Alertas</SectionTitle>
        <DatasetBoundary {...alertDash} skeletonLines={3}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Ativos" value={lifecycle.ativos} />
            <KpiCard label="Críticos" value={lifecycle.criticos} hint="crítico + emergência" />
            <KpiCard label="Reconhecidos" value={lifecycle.reconhecidos} hint="em tratamento" />
            <KpiCard label="Resolvidos (7d)" value={lifecycle.resolvidos} />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(Array.isArray(ad.ativos) ? (ad.ativos as Record<string, unknown>[]) : [])
              .slice(0, 6)
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
          </div>
          {(!Array.isArray(ad.ativos) || (ad.ativos as unknown[]).length === 0) && (
            <div className="mt-2">
              <EmptyState title="Nenhum alerta ativo" description="As regras seguem avaliando a cada tick." />
            </div>
          )}
        </DatasetBoundary>

        {/* Componentes (tabela) */}
        <SectionTitle>Componentes</SectionTitle>
        <DatasetBoundary {...operational} skeletonLines={4}>
          <ComponentTable rows={rows} />
        </DatasetBoundary>

        {/* Incidentes */}
        <SectionTitle>Incidentes</SectionTitle>
        <DatasetBoundary {...operational} skeletonLines={3}>
          <IncidentPanel
            incidents={Array.isArray(op.incidentes) ? (op.incidentes as Record<string, unknown>[]) : []}
          />
        </DatasetBoundary>

        {/* Tendências + Timeline */}
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className={typography.sectionTitle}>Tendência de Saúde</h2>
              {trendable.length > 0 && (
                <select
                  aria-label="Componente da tendência"
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  value={selected ?? ''}
                  onChange={(e) => setTrendComp(e.target.value)}
                >
                  {trendable.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
            <DatasetBoundary {...operational} skeletonLines={3}>
              {selected ? (
                <TrendCard
                  label={`Health · ${selected} (24h)`}
                  points={componentTrendPoints(op.timeline_24h, selected)}
                  currentLabel="série oficial da timeline de saúde — degradações e recuperações visíveis na curva"
                />
              ) : (
                <EmptyState title="Sem série de saúde" description="Snapshots aparecem quando o cron cio-health-snapshot rodar." />
              )}
            </DatasetBoundary>
          </div>
          <div>
            <SectionTitle>Timeline Operacional</SectionTitle>
            <DatasetBoundary {...operational} skeletonLines={4}>
              {activity.length ? <Timeline entries={activity} /> : <EmptyState title="Sem eventos recentes" />}
            </DatasetBoundary>
          </div>
        </div>

        {/* IA Narrativa — placeholder oficial */}
        <SectionTitle>Resumo Operacional (IA)</SectionTitle>
        <div className={`${borders.radius} border border-dashed border-border p-5 text-center`}>
          <p className={typography.cardTitle}>O resumo operacional narrado será fornecido pelo M59 — IA Narrativa.</p>
          <p className={`${typography.cardSubtitle} mt-1`}>
            Espaço reservado. A IA apenas interpretará os dados oficiais desta tela — nunca recalculará métricas.
          </p>
        </div>
        <div className="h-8" />
      </main>
    </div>
  );
}

export default function OperationsDashboard() {
  return (
    <DashboardProvider>
      <NocInner />
    </DashboardProvider>
  );
}
