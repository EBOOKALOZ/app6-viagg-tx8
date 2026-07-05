/**
 * M58.5→M59.1 · Painel Narrativo — agora servido pelo Enterprise Narrative
 * Engine (M59.1). Nenhum texto em linguagem natural é gerado: a tela expõe
 * o CONTEXTO oficial (estados por seção, validação, evidências auditáveis,
 * benchmark de montagem) e os 5 narradores registrados aguardando o M59.2.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { typography, borders } from '../core/tokens';
import { StatusBadge } from '../components/indicators';
import { NarrativeProvider, useNarrative } from '../narrative/NarrativeProvider';
import { NARRATIVE_TEMPLATE_REGISTRY } from '../narrative/engine';
import {
  NARRATIVE_SECTION_ORDER, type NarrativeAvailability, type NarrativeInput as NarrativeInputV2,
} from '../narrative/types';
import { narrateExecutiveDeterministic, type NarrativeReport } from '../narrative/narrators/executiveDeterministic';
import {
  narrateOperationsDeterministic, type OperationalPriority, type OperationalRecommendation,
} from '../narrative/narrators/operationsNarrator';
import {
  narratePredictiveDeterministic, TREND_METHOD, PROJECTION_MIN_POINTS,
  type PredictiveFinding,
} from '../narrative/narrators/predictiveNarrator';
import {
  composeStrategic, type StrategicPriority, type StrategicDecision, type Divergence,
} from '../narrative/narrators/strategicComposer';
import { DecisionPanel } from '../narrative/decisions/DecisionPanel';
import { ActionPanel } from '../narrative/actions/ActionPanel';
import { ExecutionPanel } from '../narrative/execution/ExecutionPanel';
import { NARRATIVE_GENERATIVE_ENABLED } from '../narrative/config';

// Compat M58.5: contrato preliminar mantido p/ consumidores antigos.
export { buildNarrativeInput } from './narrativeCompat';
export type { NarrativeInput } from './narrativeCompat';

const AVAIL_STATE: Record<NarrativeAvailability, { state: 'bom' | 'atencao' | 'critico' | 'offline'; label: string }> = {
  ok: { state: 'bom', label: 'ok' },
  carregando: { state: 'offline', label: 'carregando' },
  sem_dados: { state: 'offline', label: 'sem dados' },
  incompleto: { state: 'atencao', label: 'incompleto' },
  aguardando_fonte: { state: 'offline', label: 'aguardando fonte' },
  offline: { state: 'offline', label: 'offline' },
  erro: { state: 'critico', label: 'erro' },
};

const SECTION_LABEL: Record<string, string> = {
  situacaoGeral: 'Situação Geral', health: 'Health', alertas: 'Alertas',
  governanca: 'Governança', incidentes: 'Incidentes', timeline: 'Timeline',
  quality: 'Quality', issues: 'Issues', executiveSummary: 'Executive Summary',
};

const LAST_RUN_KEY = 'viagg.narrative.lastRun.v1';

const TEMPLATE_BADGE: Record<string, { state: 'excelente' | 'bom' | 'atencao' | 'critico' | 'offline'; label: string }> = {
  excelente: { state: 'excelente', label: 'Situação Excelente' },
  boa: { state: 'bom', label: 'Situação Boa' },
  atencao: { state: 'atencao', label: 'Situação Atenção' },
  critica: { state: 'critico', label: 'Situação Crítica' },
  offline: { state: 'offline', label: 'Situação Offline' },
  // M59.3 — templates operacionais
  operacao_excelente: { state: 'excelente', label: 'Operação Excelente' },
  operacao_estavel: { state: 'bom', label: 'Operação Estável' },
  atencao_operacional: { state: 'atencao', label: 'Atenção Operacional' },
  operacao_critica: { state: 'critico', label: 'Operação Crítica' },
  operacao_parcial: { state: 'atencao', label: 'Operação Parcial' },
  sistema_offline: { state: 'offline', label: 'Sistema Offline' },
  // M59.4 — templates preditivos
  tendencia_positiva: { state: 'excelente', label: 'Tendência Positiva' },
  tendencia_estavel: { state: 'bom', label: 'Tendência Estável' },
  tendencia_negativa: { state: 'critico', label: 'Tendência Negativa' },
  tendencias_mistas: { state: 'atencao', label: 'Tendências Mistas' },
  historico_insuficiente: { state: 'offline', label: 'Histórico Insuficiente' },
  // M59.5 — templates estratégicos
  estrategia_consolidada_positiva: { state: 'excelente', label: 'Estratégia Positiva' },
  estrategia_estavel: { state: 'bom', label: 'Estratégia Estável' },
  estrategia_atencao: { state: 'atencao', label: 'Estratégia · Atenção' },
  estrategia_critica: { state: 'critico', label: 'Estratégia Crítica' },
  estrategia_parcial: { state: 'offline', label: 'Estratégia Parcial' },
};

const PRIORITY_STATE: Record<string, 'critico' | 'alto' | 'atencao' | 'aviso'> = {
  maxima: 'critico', alta: 'alto', media: 'atencao', baixa: 'aviso',
};

/** Narrativa Executiva (M59.2) — modo determinístico oficial; evidência por frase. */
function ExecutiveNarrative({ report, explain }: {
  report: NarrativeReport;
  explain: (caminho: string) => { dataset: string; component: string; timestamp: string | null; availability: string; confidence: string; version: string | number | null } | null;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const tb = TEMPLATE_BADGE[report.template];
  return (
    <section className={`${borders.radius} ${borders.edge} mt-3 bg-card p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={typography.sectionTitle}>Narrativa Executiva</h2>
        <div className="flex items-center gap-2">
          <StatusBadge state={tb.state} label={tb.label} />
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
            modo: {report.modo === 'deterministico' ? 'Determinístico' : 'Generativo'}
            {report.duracaoMs != null ? ` · ${report.duracaoMs}ms` : ''}
          </span>
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
          >
            {showEvidence ? 'Ocultar evidências' : 'Mostrar evidências'}
          </button>
        </div>
      </div>
      {report.fallbackMotivo && (
        <p className={`${typography.cardSubtitle} mt-1`}>
          fallback automático: {report.fallbackMotivo}
        </p>
      )}

      <div className="mt-3 space-y-4">
        {report.secoes.map((sec) => (
          <div key={sec.key}>
            <h3 className={typography.cardTitle}>{sec.titulo}</h3>
            <div className="mt-1 space-y-1">
              {sec.frases.map((f, i) => (
                <div key={i}>
                  <p className="text-sm leading-relaxed">{f.texto}</p>
                  {showEvidence && (
                    <div className="mb-1 mt-0.5 flex flex-wrap gap-1">
                      {f.evidencias.map((path) => {
                        const ev = explain(path);
                        return (
                          <span
                            key={path}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            title={ev
                              ? `dataset: ${ev.dataset} · origem: ${ev.component} · estado: ${ev.availability} · confiança: ${ev.confidence} · versão: ${ev.version ?? '—'} · fonte em: ${ev.timestamp ? new Date(ev.timestamp).toLocaleString('pt-BR') : '—'}`
                              : path}
                          >
                            {path}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div>
          <h3 className={typography.cardTitle}>O que mudou desde a última execução</h3>
          <div className="mt-1 space-y-1">
            {report.mudancas.map((m, i) => (
              <p key={i} className="text-sm text-muted-foreground">• {m.texto}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** M59.3 · Painel de prioridades + recomendações do Operations Narrator. */
function OperationsIntelligence({ priorities, recommendations, explain }: {
  priorities: OperationalPriority[];
  recommendations: OperationalRecommendation[];
  explain: (caminho: string) => { dataset: string; component: string } | null;
}) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <section className={`${borders.radius} ${borders.edge} bg-card p-4`}>
        <h3 className={typography.cardTitle}>Prioridades Operacionais ({priorities.length})</h3>
        <div className="mt-2 space-y-2">
          {priorities.length === 0 && (
            <p className={typography.cardSubtitle}>Sem prioridades apontadas pelas fontes oficiais.</p>
          )}
          {priorities.map((p, i) => (
            <div key={i} className={`${borders.radiusSm} border border-border p-2.5`}>
              <div className="flex items-center gap-2">
                <StatusBadge state={PRIORITY_STATE[p.nivel] ?? 'aviso'} label={p.nivel} />
                <p className="text-xs font-semibold">{p.titulo}</p>
              </div>
              <p className={`${typography.cardSubtitle} mt-1`}>
                impacto {p.impacto} · urgência {p.urgencia} — {p.justificativa}
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground"
                title={p.evidencias.map((e) => `${e} → ${explain(e)?.dataset ?? '?'}`).join(' · ')}>
                evidências: {p.evidencias.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className={`${borders.radius} ${borders.edge} bg-card p-4`}>
        <h3 className={typography.cardTitle}>Recomendações da IA (auditáveis)</h3>
        <div className="mt-2 space-y-2">
          {recommendations.map((r, i) => (
            <div key={i} className={`${borders.radiusSm} border border-border p-2.5`}>
              <p className="text-xs font-semibold">{r.acao}</p>
              <p className={`${typography.cardSubtitle} mt-0.5`}>{r.motivo}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                evidências: {r.evidencias.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** M59.4 · Cabeçalho preditivo: método, horizonte e achados. */
function PredictiveIntelligence({ risks, opportunities }: {
  risks: PredictiveFinding[];
  opportunities: PredictiveFinding[];
}) {
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <section className={`${borders.radius} ${borders.edge} bg-card p-4`}>
        <h3 className={typography.cardTitle}>Riscos Emergentes ({risks.length})</h3>
        <div className="mt-2 space-y-2">
          {risks.length === 0 && <p className={typography.cardSubtitle}>Nenhum apontado pelas séries oficiais.</p>}
          {risks.map((r, i) => (
            <div key={i} className={`${borders.radiusSm} border border-border p-2.5`}>
              <p className="text-xs font-semibold">{r.titulo}</p>
              <p className={`${typography.cardSubtitle} mt-0.5`}>{r.base} · confiança: {r.confianca}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">evidências: {r.evidencias.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>
      <section className={`${borders.radius} ${borders.edge} bg-card p-4`}>
        <h3 className={typography.cardTitle}>Oportunidades Emergentes ({opportunities.length})</h3>
        <div className="mt-2 space-y-2">
          {opportunities.length === 0 && <p className={typography.cardSubtitle}>Nenhuma apontada pelas séries oficiais.</p>}
          {opportunities.map((o, i) => (
            <div key={i} className={`${borders.radiusSm} border border-border p-2.5`}>
              <p className="text-xs font-semibold">{o.titulo}</p>
              <p className={`${typography.cardSubtitle} mt-0.5`}>{o.base} · confiança: {o.confianca}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">evidências: {o.evidencias.join(', ')}</p>
            </div>
          ))}
        </div>
      </section>
      <p className={`${typography.cardSubtitle} lg:col-span-2`}>
        Método declarado: {TREND_METHOD}. Horizontes: 24h (saúde) e 14d (alertas).
        Projeções exigem ≥{PROJECTION_MIN_POINTS} pontos — o mesmo piso do cio_health_predict oficial.
      </p>
    </div>
  );
}

/** M59.5 · Painel estratégico: prioridades consolidadas, decisões e divergências. */
function StrategicIntelligence({ priorities, decisions, divergencias, narradores, composicaoMs }: {
  priorities: StrategicPriority[];
  decisions: StrategicDecision[];
  divergencias: Divergence[];
  narradores: string[];
  composicaoMs: number | null;
}) {
  return (
    <div className="mt-3 space-y-3">
      <p className={typography.cardSubtitle}>
        narradores participantes: <b>{narradores.join(' + ') || 'nenhum'}</b> · composição em {composicaoMs ?? '—'}ms ·
        consenso reforça, divergência é declarada sem vencedor — evidências sempre preservadas.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className={`${borders.radius} ${borders.edge} bg-card p-4`}>
          <h3 className={typography.cardTitle}>Prioridades Estratégicas ({priorities.length})</h3>
          <div className="mt-2 space-y-2">
            {priorities.length === 0 && <p className={typography.cardSubtitle}>Sem prioridades nesta leitura.</p>}
            {priorities.map((p, i) => (
              <div key={i} className={`${borders.radiusSm} border border-border p-2.5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge state={PRIORITY_STATE[p.nivel] ?? 'aviso'} label={p.nivel} />
                  {p.reforcadaPorConsenso && <StatusBadge state="alto" label="CONSENSO" />}
                  <p className="text-xs font-semibold">{p.titulo}</p>
                </div>
                <p className={`${typography.cardSubtitle} mt-1`}>
                  origem: {p.origens.join('+')} · impacto {p.impacto} · urgência {p.urgencia} — {p.justificativa}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">evidências: {p.evidencias.join(', ')}</p>
              </div>
            ))}
          </div>
        </section>
        <section className={`${borders.radius} ${borders.edge} bg-card p-4`}>
          <h3 className={typography.cardTitle}>Decisões Recomendadas ({decisions.length})</h3>
          <div className="mt-2 space-y-2">
            {decisions.map((d, i) => (
              <div key={i} className={`${borders.radiusSm} border border-border p-2.5`}>
                <p className="text-xs font-semibold">{d.decisao}</p>
                <p className={`${typography.cardSubtitle} mt-0.5`}>
                  impacto esperado: {d.impactoEsperado} · base: {d.origens.join('+')}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">evidências: {d.evidencias.join(', ')}</p>
              </div>
            ))}
          </div>
          {divergencias.length > 0 && (
            <div className="mt-3">
              <h3 className={typography.cardTitle}>Divergências declaradas ({divergencias.length})</h3>
              {divergencias.map((d, i) => (
                <p key={i} className={`${typography.cardSubtitle} mt-1`}>
                  <b>{d.topico}:</b> {d.posicoes.map((p) => `${p.origem}=${p.direcao}`).join(' vs ')} — sem vencedor; evidências de todos mantidas.
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NarrativeInner() {
  const { input, validation, evidencias, refresh, explain } = useNarrative();
  const [narrator, setNarrator] = useState<'executive' | 'operations' | 'predictive' | 'strategic' | 'decisions' | 'actions' | 'execution'>('executive');

  // "última execução": snapshot persistido do NarrativeInput anterior
  const [prevInput, setPrevInput] = useState<NarrativeInputV2 | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_RUN_KEY);
      if (raw) setPrevInput(JSON.parse(raw) as NarrativeInputV2);
    } catch { /* snapshot corrompido: primeira execução */ }
  }, []);
  useEffect(() => {
    if (input.meta.estados.situacaoGeral !== 'carregando') {
      try { localStorage.setItem(LAST_RUN_KEY, JSON.stringify(input)); } catch { /* storage indisponível */ }
    }
  }, [input]);

  // Narradores oficiais (determinísticos; generativo OFF por padrão → fallback)
  const engineOut = useMemo(
    () => ({ input, validation, evidencias, explain }),
    [input, validation, evidencias, explain],
  );
  const execReport = useMemo(
    () => narrateExecutiveDeterministic(engineOut, prevInput),
    [engineOut, prevInput],
  );
  const opsResult = useMemo(
    () => narrateOperationsDeterministic(engineOut, prevInput),
    [engineOut, prevInput],
  );
  const predResult = useMemo(
    () => narratePredictiveDeterministic(engineOut),
    [engineOut],
  );
  // M59.5: composição estratégica REUSA os resultados em memória (zero recompute)
  const stratResult = useMemo(
    () => composeStrategic(execReport, opsResult, predResult),
    [execReport, opsResult, predResult],
  );
  const report =
    narrator === 'executive' ? execReport
    : narrator === 'operations' ? opsResult.report
    : narrator === 'predictive' ? predResult.report
    : stratResult.report; // decisions usa o strategic como base

  return (
    <div className="mx-auto max-w-5xl">
      <div className={`${borders.radius} ${borders.edge} bg-card p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className={typography.sectionTitle}>Enterprise Narrative Engine</h1>
          <div className="flex items-center gap-2">
            <StatusBadge
              state={validation.valido ? 'bom' : validation.utilizavelComRessalvas ? 'atencao' : 'critico'}
              label={
                validation.valido ? 'contexto completo'
                : validation.utilizavelComRessalvas ? 'contexto com ressalvas declaradas'
                : 'contexto indisponível'
              }
            />
            <button
              type="button"
              onClick={refresh}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
            >
              Atualizar
            </button>
          </div>
        </div>
        <p className={`${typography.cardSubtitle} mt-1`}>
          Engine {input.meta.engineVersion} · contexto montado em <b>{input.meta.montagemMs ?? '—'} ms</b> ·
          gerado {input.meta.geradoEm} · modo generativo:{' '}
          {NARRATIVE_GENERATIVE_ENABLED ? 'HABILITADO' : 'desligado [ligar-pós-deploy]'} —
          o narrador determinístico é o padrão oficial e está sempre disponível.
        </p>
      </div>

      {/* Seletor de narrador (M59.3) */}
      <div className="mt-3 flex gap-1 rounded-md border border-border p-1" role="tablist" aria-label="Narrador">
        {([['executive', 'Narrativa Executiva'], ['operations', 'Narrativa Operacional'], ['predictive', 'Preditiva'], ['strategic', 'Estratégica'], ['decisions', 'Decision Intelligence'], ['actions', 'Action Intelligence'], ['execution', 'Execution Intelligence']] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={narrator === k}
            type="button"
            onClick={() => setNarrator(k)}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium ${
              narrator === k ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!['decisions', 'actions', 'execution'].includes(narrator) && <ExecutiveNarrative report={report} explain={explain} />}
      {narrator === 'decisions' && <DecisionPanel strategic={stratResult} />}
      {narrator === 'actions' && <ActionPanel />}
      {narrator === 'execution' && <ExecutionPanel />}
      {narrator === 'operations' && (
        <OperationsIntelligence
          priorities={opsResult.priorities}
          recommendations={opsResult.recommendations}
          explain={explain}
        />
      )}
      {narrator === 'predictive' && (
        <PredictiveIntelligence risks={predResult.risks} opportunities={predResult.opportunities} />
      )}
      {narrator === 'strategic' && (
        <StrategicIntelligence
          priorities={stratResult.priorities}
          decisions={stratResult.decisions}
          divergencias={stratResult.divergencias}
          narradores={stratResult.narradores}
          composicaoMs={stratResult.report.duracaoMs}
        />
      )}

      {/* Estados oficiais por seção — ausência JAMAIS ocultada */}
      <section className="mt-3">
        <h2 className={`${typography.cardTitle} mb-2`}>Estados do contexto (9 seções, ordem oficial)</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {NARRATIVE_SECTION_ORDER.map((k) => {
            const a = AVAIL_STATE[input.meta.estados[k]];
            return (
              <div key={k} className={`${borders.radiusSm} ${borders.edge} bg-card p-2.5 text-center`}>
                <p className="text-xs font-semibold">{SECTION_LABEL[k]}</p>
                <div className="mt-1"><StatusBadge state={a.state} label={a.label} /></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Narradores registrados (estrutura; sem implementação) */}
      <section className="mt-4">
        <h2 className={`${typography.cardTitle} mb-2`}>Narradores registrados</h2>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {NARRATIVE_TEMPLATE_REGISTRY.map((t) => (
            <div key={t.narrator} className={`${borders.radiusSm} border border-dashed border-border p-3`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{t.label}</p>
                <StatusBadge
                  state={t.status === 'aguardando_m59_2' ? 'atencao' : 'offline'}
                  label={
                    t.status === 'aguardando_m59_2' ? 'M59.2'
                    : t.status === 'bloqueado_m58_3' ? 'aguarda M58.3' : 'futuro'
                  }
                />
              </div>
              <p className={`${typography.cardSubtitle} mt-1`}>
                seções: {t.sections.map((s) => SECTION_LABEL[s]).join(', ') || '—'}
              </p>
              {t.restricao && <p className={`${typography.cardSubtitle} mt-1 italic`}>{t.restricao}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Validação — problemas declarados */}
      {validation.problemas.length > 0 && (
        <section className="mt-4">
          <h2 className={`${typography.cardTitle} mb-2`}>
            Ressalvas declaradas ({validation.problemas.length})
          </h2>
          <div className={`${borders.radiusSm} ${borders.edge} max-h-44 overflow-auto bg-card p-2 text-[11px]`}>
            {validation.problemas.map((p, i) => (
              <p key={i} className="border-b border-border/40 py-1 last:border-0">
                <b>{SECTION_LABEL[p.secao]}</b>.{p.campo} — {p.tipo} <span className="text-muted-foreground">({p.detalhe})</span>
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Auditoria: evidência por campo (origem/timestamp/confiança/versão) */}
      <section className="mt-4">
        <h2 className={`${typography.cardTitle} mb-2`}>Trilha de evidências ({evidencias.length} campos)</h2>
        <div className={`${borders.radius} ${borders.edge} overflow-x-auto bg-card`}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-2">Campo</th><th className="p-2">Dataset</th><th className="p-2">Origem</th>
                <th className="p-2">Confiança</th><th className="p-2">Estado</th><th className="p-2">Fonte em</th>
              </tr>
            </thead>
            <tbody>
              {evidencias.map((e) => (
                <tr key={e.caminho} className="border-b border-border/40 last:border-0">
                  <td className="p-2 font-medium">{e.caminho}</td>
                  <td className="p-2">{e.evidencia.dataset}</td>
                  <td className="p-2 text-muted-foreground">{e.evidencia.component}</td>
                  <td className="p-2">{e.evidencia.confidence}</td>
                  <td className="p-2">{e.evidencia.availability}</td>
                  <td className="p-2 text-muted-foreground">
                    {e.evidencia.timestamp ? new Date(e.evidencia.timestamp).toLocaleTimeString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function NarrativePanel() {
  return (
    <NarrativeProvider>
      <NarrativeInner />
    </NarrativeProvider>
  );
}
