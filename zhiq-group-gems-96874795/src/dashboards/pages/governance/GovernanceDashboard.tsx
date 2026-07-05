/**
 * M58.4 · Enterprise Governance Dashboard — /admin/governanca
 *
 * Governança da Semantic Layer: catálogo, validator, qualidade, drift,
 * certificação, timeline, lineage, profiler. Composição PURA sobre
 * 050→064 — zero SQL, zero RPC nova, zero métrica. Blocos sem RPC
 * acessível via JWT (executive report service-only, coverage vivo,
 * security audit dedicado) aparecem como placeholders DECLARADOS.
 */

import React, { useEffect, useRef, useState } from 'react';
import { DashboardProvider, useDashboard } from '../../state/DashboardProvider';
import { useDataset } from '../../hooks/useDataset';
import { telemetry } from '../../core/telemetry';
import { typography, borders } from '../../core/tokens';
import { KpiCard } from '../../components/cards';
import { StatusBadge, ProgressIndicator, Timeline, stateKeyFrom } from '../../components/indicators';
import { DatasetBoundary, EmptyState } from '../../components/feedback';
import { OperationalTopBar } from '../operational/components';
import {
  governanceAnswers, catalogRows, qualityRows, certificationCounts,
  governanceTimeline, lineageSteps, profilerRows, heatmapSummary, CERT_LEVELS,
} from './helpers';
import { AnswerBoard, CatalogTable, QualityPanel, LineagePanel, CertificationPanel } from './components';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className={`${typography.sectionTitle} mb-2 mt-6 first:mt-0`}>{children}</h2>;
}

/** Painel interno — usado pela Shell (M58.5) sob o provider ÚNICO dela. */
export function GovernancePanel() {
  return <GovernanceInner />;
}

function GovernanceInner() {
  const { state, dispatch } = useDashboard();
  const renderT0 = useRef(performance.now());
  useEffect(() => {
    telemetry.recordRender({ component: 'GovernanceDashboard', ms: performance.now() - renderT0.current });
  }, []);

  const governance = useDataset('governance');        // 11 blocos
  const healthExec = useDataset('health-executive');  // contexto de saúde
  const alertDash = useDataset('alert-dashboard');    // alertas de governança/drift

  const gov = governance.data as Record<string, unknown> | undefined;
  const validator = ((gov?.validator ?? {}) as Record<string, unknown>);
  const aprovado = validator.aprovado === true;

  const answers = governanceAnswers(gov, healthExec.data);
  const rows = catalogRows(gov);
  const quality = qualityRows(gov);
  const certs = certificationCounts(gov);
  const timeline = governanceTimeline(gov);
  const prof = profilerRows(gov);
  const heat = heatmapSummary(gov);

  // Lineage explorer — métrica selecionada do catálogo
  const [lineageKey, setLineageKey] = useState<string | null>(null);
  const selectedKey = lineageKey ?? rows[0]?.metric ?? null;
  const lineage = useDataset('metric-lineage', { p_key: selectedKey ?? '' }, { enabled: !!selectedKey });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OperationalTopBar
        overall={
          aprovado
            ? { state: 'excelente', label: 'Catálogo aprovado' }
            : governance.isLoading
              ? { state: 'offline', label: 'carregando…' }
              : { state: 'critico', label: 'Catálogo REPROVADO' }
        }
        updatedAt={governance.updatedAt}
        onRefresh={() => { governance.refetch(); healthExec.refetch(); alertDash.refetch(); }}
        autoLabel={state.autoRefreshSec === 0 ? 'auto: pausado' : `auto: ${state.autoRefreshSec}s`}
        onToggleAuto={() =>
          dispatch({ type: 'set-auto-refresh', sec: state.autoRefreshSec === 0 ? 60 : 0 })
        }
      />
      <main className="mx-auto max-w-[1500px] p-4">

        <SectionTitle>As 10 respostas de governança</SectionTitle>
        <DatasetBoundary {...governance} skeletonLines={4}>
          <AnswerBoard answers={answers} />
        </DatasetBoundary>

        <SectionTitle>Catálogo de Métricas</SectionTitle>
        <DatasetBoundary {...governance} skeletonLines={5}>
          <CatalogTable rows={rows} onSelectMetric={setLineageKey} selected={selectedKey} />
          <p className={`${typography.cardSubtitle} mt-1`}>
            clique numa métrica para ver a linhagem oficial abaixo · evoluir = nova versão (catálogo imutável)
          </p>
        </DatasetBoundary>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <div>
            <SectionTitle>Linhagem · {selectedKey ?? '—'}</SectionTitle>
            <DatasetBoundary {...lineage} skeletonLines={5}>
              <LineagePanel steps={lineageSteps(lineage.data)} />
            </DatasetBoundary>
          </div>
          <div>
            <SectionTitle>Qualidade por métrica</SectionTitle>
            <DatasetBoundary {...governance} skeletonLines={5}>
              <QualityPanel rows={quality} />
            </DatasetBoundary>
          </div>
        </div>

        <SectionTitle>Certificação</SectionTitle>
        <DatasetBoundary {...governance} skeletonLines={2}>
          <CertificationPanel counts={certs} />
          <p className={`${typography.cardSubtitle} mt-1`}>
            regra imposta no banco: a IA Executiva (M59) só consome métricas <b>enterprise</b> — sem certificadas, ela declara a ausência (nunca inventa)
          </p>
        </DatasetBoundary>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div>
            <SectionTitle>Timeline de Governança</SectionTitle>
            <DatasetBoundary {...governance} skeletonLines={4}>
              {timeline.length ? <Timeline entries={timeline} /> : <EmptyState title="Sem eventos recentes" />}
            </DatasetBoundary>
          </div>
          <div>
            <SectionTitle>Profiler (uso real)</SectionTitle>
            <DatasetBoundary {...governance} skeletonLines={4}>
              {prof.length ? (
                <div className="space-y-1.5">
                  {prof.map((p) => (
                    <div key={p.metric} className={`${borders.radiusSm} ${borders.edge} bg-card px-3 py-1.5 text-xs`}>
                      <div className="flex justify-between">
                        <span className="font-medium">{p.metric}</span>
                        <span className={typography.mono}>{p.chamadas}× {p.tempoMedioMs != null ? `· ${p.tempoMedioMs}ms` : ''}</span>
                      </div>
                      {p.consumidores.length > 0 && (
                        <p className="mt-0.5 text-muted-foreground">{p.consumidores.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="Sem consultas na janela" />}
            </DatasetBoundary>
          </div>
          <div>
            <SectionTitle>Heatmap & Issues</SectionTitle>
            <DatasetBoundary {...governance} skeletonLines={4}>
              <div className="space-y-2 text-xs">
                <div className={`${borders.radiusSm} ${borders.edge} bg-card p-3`}>
                  <p className="font-semibold">Mais utilizadas</p>
                  <p className="text-muted-foreground">{heat.maisUsadas.join(', ') || '—'}</p>
                </div>
                <div className={`${borders.radiusSm} ${borders.edge} bg-card p-3`}>
                  <p className="font-semibold">Candidatas a cache</p>
                  <p className="text-muted-foreground">
                    {heat.cacheCandidatas.join(', ') || 'nenhuma (cache segue DESLIGADO até OBSERVE)'}
                  </p>
                </div>
                <div className={`${borders.radiusSm} ${borders.edge} bg-card p-3`}>
                  <p className="font-semibold">Issues abertas (7d)</p>
                  {Array.isArray(gov?.issues_abertas) && (gov?.issues_abertas as unknown[]).length ? (
                    <ul className="mt-1 space-y-1">
                      {(gov?.issues_abertas as Record<string, unknown>[]).slice(0, 5).map((i, k) => (
                        <li key={k} className="flex items-center gap-1.5">
                          <StatusBadge
                            state={String(i.sev) === 'P2' ? 'alto' : 'aviso'}
                            label={String(i.sev ?? '')}
                          />
                          <span>{String(i.check ?? '')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">nenhuma</p>
                  )}
                </div>
              </div>
            </DatasetBoundary>
          </div>
        </div>

        {/* Placeholders DECLARADOS — sem RPC acessível via JWT nesta fase */}
        <SectionTitle>Relatório Executivo · Security Audit · Cobertura viva</SectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard label="Relatório executivo" value={null}
            hint="cio_executive_report() é service-only — exposição via canal service/Edge em etapa futura (sem nova RPC agora)" />
          <KpiCard label="Security audit" value={null}
            hint="access log auditado no banco (quem/quando/consumidor/linhas); dataset dedicado quando necessário" />
          <KpiCard label="Cobertura (viva)" value={null}
            hint="coverage guard REJEITA redução por construção; números vivos exigem dataset dedicado — nunca exibimos estático como se fosse vivo" />
        </div>

        <SectionTitle>Resumo de Governança (IA)</SectionTitle>
        <div className={`${borders.radius} border border-dashed border-border p-5 text-center`}>
          <p className={typography.cardTitle}>A narrativa de governança será fornecida pelo M59 — IA Narrativa.</p>
          <p className={`${typography.cardSubtitle} mt-1`}>Espaço reservado; a IA só interpretará os dados oficiais desta tela.</p>
        </div>
        <div className="h-8" />
      </main>
    </div>
  );
}

export default function GovernanceDashboard() {
  return (
    <DashboardProvider>
      <GovernanceInner />
    </DashboardProvider>
  );
}
