/**
 * ORION LOCAL TEST LAB v2.0 — tipos e formatadores compartilhados.
 * Todo campo aqui descreve dados REAIS produzidos pela execução da fila
 * (medições, respostas de API, contagens): nenhum valor é simulado.
 */

export const OLT_VERSION = "2.0";

export type EtapaStatus = "pendente" | "executando" | "pass" | "fail" | "cli";

export type TipoEvidencia =
  | "consulta"
  | "rls"
  | "rpc"
  | "http"
  | "auth"
  | "realtime"
  | "browser"
  | "latencia"
  | "cli"
  | "consolidacao";

/** Registro literal do que a etapa executou e do que o ambiente respondeu. */
export interface EvidenciaTecnica {
  tipo: TipoEvidencia;
  /** O que foi executado de fato (consulta, RPC, requisição, inspeção). */
  operacao: string;
  /** Alvo real: tabela, view, RPC, canal ou URL. */
  alvo?: string;
  /** Resposta real obtida (contagem, código, status de canal, corpo resumido). */
  resultado?: string;
  /** Status HTTP real, quando a operação foi uma requisição direta. */
  httpStatus?: number;
  /** Latência real medida em milissegundos. */
  ms?: number;
  /** Mensagem de erro real, quando houve. */
  erro?: string;
  /** Momento real do registro (ISO). */
  ts: string;
}

export interface ResultadoEtapa {
  status: EtapaStatus;
  detalhe?: string;
  ms?: number;
  /** Tempo esperado declarado na definição da etapa — base do detector de gargalos. */
  esperadoMs?: number;
  evidencias?: EvidenciaTecnica[];
}

/** Definição serializável da fila (usada por relatório/export sem depender da UI). */
export interface DefEtapa {
  id: string;
  nome: string;
  cli?: string;
  esperadoMs?: number;
  /** Sonda RLS com client anônimo — considerada no relatório executivo. */
  rlsProbe?: boolean;
}

export interface DefCategoria {
  id: string;
  nome: string;
  etapas: DefEtapa[];
}

export interface ExecucaoOLT {
  id: string;
  inicioTs: string;
  fimTs: string;
  /** null somente para snapshots v1 migrados (a duração não era medida na época). */
  duracaoMs: number | null;
  estadoFinal: "concluida" | "cancelada";
  /** true quando a execução cobriu apenas parte da fila (ex.: somente falhas). */
  parcial: boolean;
  total: number;
  pass: number;
  fail: number;
  cli: number;
  naoExec: number;
  /** Percentual de PASS sobre o total de etapas da fila. */
  percentualPass: number;
  versao: string;
  resultados: Record<string, ResultadoEtapa>;
}

export interface Gargalo {
  esperadoMs: number;
  encontradoMs: number;
  diferencaMs: number;
}

/** Gargalo real: latência medida acima do tempo esperado declarado. */
export function calcularGargalo(r: ResultadoEtapa | undefined): Gargalo | null {
  if (!r || typeof r.ms !== "number" || typeof r.esperadoMs !== "number") return null;
  if (r.ms <= r.esperadoMs) return null;
  return { esperadoMs: r.esperadoMs, encontradoMs: r.ms, diferencaMs: r.ms - r.esperadoMs };
}

export function contarStatus(resultados: Record<string, ResultadoEtapa>, ids: string[]) {
  let pass = 0;
  let fail = 0;
  let cli = 0;
  for (const id of ids) {
    const st = resultados[id]?.status;
    if (st === "pass") pass += 1;
    else if (st === "fail") fail += 1;
    else if (st === "cli") cli += 1;
  }
  return { pass, fail, cli, executadas: pass + fail + cli };
}

/** 102000 → "01m 42s"; 3742000 → "1h 02m 22s". */
export function formatarDuracao(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${mm}m ${ss}s`;
}

/** 12400 → "12,4 s" (padrão pt-BR). */
export function formatarSegundos(ms: number): string {
  return `${(ms / 1000).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} s`;
}
