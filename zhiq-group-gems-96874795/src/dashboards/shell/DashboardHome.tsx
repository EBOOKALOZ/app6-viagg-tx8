/**
 * M58.5 · Home Executiva — visão consolidada de 30 segundos.
 * Uma tela, os mesmos datasets oficiais das páginas (dedupe do react-query:
 * navegar da Home p/ os painéis NÃO refaz consultas frescas).
 */

import React from 'react';
import { useDataset } from '../hooks/useDataset';
import { typography, borders } from '../core/tokens';
import { KpiCard } from '../components/cards';
import { Gauge, StatusBadge, Timeline, stateKeyFrom } from '../components/indicators';
import { DatasetBoundary, EmptyState } from '../components/feedback';
import { recentActivity, fmtDateTime } from '../pages/executive/helpers';
import { healthCounts, severityBuckets } from '../pages/executive/helpers';
import { NAV_TREE, type NavSection } from '../layout/navigation';

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${borders.radius} ${borders.edge} bg-card p-4`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className={typography.cardTitle}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function GoButton({ section, onGo, label }: { section: string; onGo: (s: NavSection) => void; label?: string }) {
  const s = NAV_TREE.find((x) => x.key === section);
  if (!s || s.status === 'planejada') return null;
  return (
    <button
      type="button"
      onClick={() => onGo(s)}
      className="text-[11px] text-muted-foreground underline hover:text-foreground"
    >
      {label ?? 'abrir'} →
    </button>
  );
}

export function DashboardHome({ onGo }: { onGo: (s: NavSection) => void }) {
  const healthExec = useDataset('health-executive');
  const operational = useDataset('operational');
  const alertDash = useDataset('alert-dashboard');
  const alertExec = useDataset('alert-executive');
  const governance = useDataset('governance');

  const he = (healthExec.data ?? {}) as Record<string, unknown>;
  const op = (operational.data ?? {}) as Record<string, unknown>;
  const ad = (alertDash.data ?? {}) as Record<string, unknown>;
  const ae = (alertExec.data ?? {}) as Record<string, unknown>;
  const gov = (governance.data ?? {}) as Record<string, unknown>;
  const validator = (gov.validator ?? {}) as Record<string, unknown>;

  const hc = healthCounts(op.health);
  const sev = severityBuckets(ad.por_severidade);
  const activity = recentActivity({
    incidents: op.incidentes,
    alertHistory: ad.historico_7d,
    healthTimeline: op.timeline_24h,
  });
  const scoreGeral = typeof he.score_geral === 'number' ? (he.score_geral as number) : null;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {/* Saúde geral */}
      <Block title="Saúde Geral da Plataforma" action={<GoButton section="operacoes" onGo={onGo} />}>
        <DatasetBoundary {...healthExec} skeletonLines={3}>
          <div className="flex items-center justify-around">
            <Gauge value={scoreGeral} size={120} />
            <div className="space-y-1 text-xs">
              <p><StatusBadge state={
                he.situacao_geral === 'SAUDAVEL' ? 'excelente'
                : he.situacao_geral === 'ATENCAO' ? 'atencao'
                : he.situacao_geral === 'CRITICO' ? 'critico' : 'offline'
              } label={String(he.situacao_geral ?? 'aguardando')} /></p>
              <p>saudáveis: <b>{hc.saudaveis}</b> · degradados: <b>{hc.degradados}</b></p>
              <p className="text-muted-foreground">offline (sem telemetria): {hc.offline}</p>
            </div>
          </div>
        </DatasetBoundary>
      </Block>

      {/* Resumo executivo */}
      <Block title="Executive Summary" action={<GoButton section="visao-geral" onGo={onGo} label="cockpit" />}>
        <DatasetBoundary {...alertExec} skeletonLines={3}>
          <div className="space-y-1.5 text-xs">
            <p>tendência operacional: <b>{String(ae.tendencia_operacional ?? '—')}</b></p>
            <p>alertas ativos: <b>{String(ae.alertas_ativos ?? '—')}</b> · incidentes ativos: <b>{String(ae.incidentes_ativos ?? '—')}</b></p>
            <p className="text-muted-foreground">
              críticos: {(Array.isArray(he.componentes_criticos) ? (he.componentes_criticos as string[]) : []).join(', ') || 'nenhum'}
            </p>
          </div>
        </DatasetBoundary>
      </Block>

      {/* Governança */}
      <Block title="Governança" action={<GoButton section="governanca" onGo={onGo} />}>
        <DatasetBoundary {...governance} skeletonLines={3}>
          <div className="space-y-1.5 text-xs">
            <p>
              catálogo:{' '}
              <StatusBadge
                state={validator.aprovado === true ? 'bom' : 'critico'}
                label={validator.aprovado === true ? 'aprovado' : 'reprovado'}
              />
            </p>
            <p>issues abertas: <b>{Array.isArray(gov.issues_abertas) ? (gov.issues_abertas as unknown[]).length : '—'}</b></p>
            <p className="text-muted-foreground">
              enterprise: {((gov.certificacao ?? {}) as Record<string, number>).enterprise ?? 0} métrica(s) — ausência declarada
            </p>
          </div>
        </DatasetBoundary>
      </Block>

      {/* Estado operacional (semáforo compacto) */}
      <Block title="Estado Operacional" action={<GoButton section="operacoes" onGo={onGo} label="NOC" />}>
        <DatasetBoundary {...operational} skeletonLines={2}>
          <div className="flex flex-wrap gap-1.5">
            {(Array.isArray(op.health) ? (op.health as Record<string, unknown>[]) : [])
              .filter((h) => h.classification !== 'Offline')
              .map((h) => (
                <StatusBadge
                  key={String(h.component)}
                  state={stateKeyFrom(String(h.classification))}
                  label={`${String(h.component)} ${h.score ?? ''}`}
                />
              ))}
          </div>
        </DatasetBoundary>
      </Block>

      {/* Alertas + incidentes */}
      <Block title="Alertas & Incidentes" action={<GoButton section="operacoes" onGo={onGo} />}>
        <DatasetBoundary {...alertDash} skeletonLines={2}>
          <div className="grid grid-cols-4 gap-2 text-center">
            <KpiCard label="Críticos" value={sev.criticos} />
            <KpiCard label="Altos" value={sev.altos} />
            <KpiCard label="Médios" value={sev.medios} />
            <KpiCard label="Info" value={sev.informativos} />
          </div>
        </DatasetBoundary>
      </Block>

      {/* Últimas atualizações */}
      <Block title="Últimas Atualizações">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>health/executivo: {healthExec.updatedAt ? fmtDateTime(healthExec.updatedAt) : '—'}</p>
          <p>operacional: {operational.updatedAt ? fmtDateTime(operational.updatedAt) : '—'}</p>
          <p>alertas: {alertDash.updatedAt ? fmtDateTime(alertDash.updatedAt) : '—'}</p>
          <p>governança: {governance.updatedAt ? fmtDateTime(governance.updatedAt) : '—'}</p>
        </div>
      </Block>

      {/* Timeline consolidada */}
      <section className={`${borders.radius} ${borders.edge} bg-card p-4 lg:col-span-3`}>
        <h2 className={`${typography.cardTitle} mb-2`}>Últimos Eventos</h2>
        <DatasetBoundary {...operational} skeletonLines={4}>
          {activity.length ? <Timeline entries={activity.slice(0, 8)} /> : <EmptyState title="Sem eventos" />}
        </DatasetBoundary>
      </section>
    </div>
  );
}
