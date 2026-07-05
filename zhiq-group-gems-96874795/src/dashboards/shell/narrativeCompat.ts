/**
 * M58.5 · Contrato PRELIMINAR da narrativa — mantido por compatibilidade.
 * DEPRECIADO no M59.1: o contrato definitivo é o NarrativeInput de
 * `../narrative/types` (com NarrativeEvidence por campo). Novos consumidores
 * usam useNarrative()/runNarrativeEngine; este arquivo não evolui mais.
 */

export interface NarrativeInput {
  situacaoGeral: string | null;
  scoreGeral: number | null;
  tendenciaOperacional: string | null;
  alertasAtivos: number | null;
  incidentesAtivos: number | null;
  componentesCriticos: string[];
  componentesOffline: string[];
  principaisRiscos: { origem: string; detalhe: string }[];
  catalogoAprovado: boolean | null;
  metricasEnterprise: number;
  geradoEm: string;
}

/** Pura: monta o input SÓ de campos oficiais — nada é derivado/estimado. */
export function buildNarrativeInput(
  healthExec: unknown,
  alertExec: unknown,
  governance: unknown,
  nowIso: string,
): NarrativeInput {
  const he = (healthExec ?? {}) as Record<string, unknown>;
  const ae = (alertExec ?? {}) as Record<string, unknown>;
  const gov = (governance ?? {}) as Record<string, unknown>;
  const validator = (gov.validator ?? {}) as Record<string, unknown>;
  const riscos: { origem: string; detalhe: string }[] = [];
  for (const w of Array.isArray(ae.early_warning) ? (ae.early_warning as Record<string, unknown>[]) : []) {
    riscos.push({ origem: 'early_warning', detalhe: String(w.alerta ?? '') });
  }
  for (const r of Array.isArray(ae.maiores_riscos) ? (ae.maiores_riscos as Record<string, unknown>[]) : []) {
    riscos.push({ origem: 'alerta', detalhe: `${String(r.rule_key ?? '')} (${String(r.severity ?? '')})` });
  }
  return {
    situacaoGeral: he.situacao_geral != null ? String(he.situacao_geral) : null,
    scoreGeral: typeof he.score_geral === 'number' ? (he.score_geral as number) : null,
    tendenciaOperacional: ae.tendencia_operacional != null ? String(ae.tendencia_operacional) : null,
    alertasAtivos: typeof ae.alertas_ativos === 'number' ? (ae.alertas_ativos as number) : null,
    incidentesAtivos: typeof ae.incidentes_ativos === 'number' ? (ae.incidentes_ativos as number) : null,
    componentesCriticos: Array.isArray(he.componentes_criticos) ? (he.componentes_criticos as string[]) : [],
    componentesOffline: Array.isArray(he.componentes_offline) ? (he.componentes_offline as string[]) : [],
    principaisRiscos: riscos.slice(0, 8),
    catalogoAprovado: validator.aprovado === true ? true : validator.aprovado === false ? false : null,
    metricasEnterprise: ((gov.certificacao ?? {}) as Record<string, number>).enterprise ?? 0,
    geradoEm: nowIso,
  };
}
