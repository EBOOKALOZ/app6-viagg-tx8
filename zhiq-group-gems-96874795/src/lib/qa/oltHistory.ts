/**
 * ORION LOCAL TEST LAB v2.0 — histórico local de execuções.
 * Guarda as últimas 20 homologações no localStorage do navegador (mesmo
 * escopo do snapshot v1, que é migrado automaticamente). A persistência é
 * plugável via `oltExtensions.historico` para o futuro histórico ilimitado.
 */
import { contarStatus, type ExecucaoOLT, type ResultadoEtapa } from "./oltTypes";
import { oltExtensions, type OltHistoricoAdapter } from "./oltExtensions";

const HISTORY_KEY = "orion-olt-historico-v2";
const LEGACY_KEY = "orion-olt-ultima-execucao";
const LIMITE_PADRAO = 20;

function lerHistoricoLocal(): ExecucaoOLT[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const lista = JSON.parse(raw) as ExecucaoOLT[];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

const adaptadorLocal: OltHistoricoAdapter = {
  limite: LIMITE_PADRAO,
  listar: () => lerHistoricoLocal(),
  salvar(execucao: ExecucaoOLT) {
    const limite = this.limite;
    let lista = [execucao, ...lerHistoricoLocal()];
    if (limite != null) lista = lista.slice(0, limite);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(lista));
    } catch {
      /* quota/privacidade — o histórico local é opcional */
    }
    return lista;
  },
};

function adapter(): OltHistoricoAdapter {
  return oltExtensions.historico ?? adaptadorLocal;
}

/**
 * Migra o snapshot v1 (execução única, sem duração medida) para o histórico.
 * A duração fica null — nunca inventamos um tempo que não foi medido.
 */
function migrarSnapshotLegado(totalEtapas: number) {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw || lerHistoricoLocal().length > 0) return;
    const salvo = JSON.parse(raw) as { ts: string; resultados: Record<string, ResultadoEtapa> };
    if (!salvo?.resultados || !salvo.ts) return;
    const ids = Object.keys(salvo.resultados);
    const { pass, fail, cli, executadas } = contarStatus(salvo.resultados, ids);
    const entrada: ExecucaoOLT = {
      id: crypto.randomUUID(),
      inicioTs: salvo.ts,
      fimTs: salvo.ts,
      duracaoMs: null,
      estadoFinal: "concluida",
      parcial: false,
      total: totalEtapas,
      pass,
      fail,
      cli,
      naoExec: Math.max(0, totalEtapas - executadas),
      percentualPass: totalEtapas ? Math.round((pass / totalEtapas) * 100) : 0,
      versao: "desconhecida (snapshot OLT v1)",
      resultados: salvo.resultados,
    };
    adaptadorLocal.salvar(entrada);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* snapshot legado ilegível — ignora */
  }
}

export function carregarHistorico(totalEtapas: number): ExecucaoOLT[] {
  migrarSnapshotLegado(totalEtapas);
  return adapter().listar();
}

export function salvarExecucao(execucao: ExecucaoOLT): ExecucaoOLT[] {
  return adapter().salvar(execucao);
}

export interface EstatisticasOLT {
  quantidade: number;
  ultimaTs: string | null;
  tempoMedioMs: number | null;
  maiorMs: number | null;
  menorMs: number | null;
  mediaPass: number | null;
  mediaFail: number | null;
}

/** Estatísticas agregadas do histórico real. Tempos só consideram execuções medidas. */
export function calcularEstatisticas(historico: ExecucaoOLT[]): EstatisticasOLT {
  if (historico.length === 0) {
    return {
      quantidade: 0,
      ultimaTs: null,
      tempoMedioMs: null,
      maiorMs: null,
      menorMs: null,
      mediaPass: null,
      mediaFail: null,
    };
  }
  const medidas = historico.filter((h) => h.duracaoMs != null).map((h) => h.duracaoMs as number);
  const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);
  return {
    quantidade: historico.length,
    ultimaTs: historico[0]?.fimTs ?? null,
    tempoMedioMs: medidas.length ? Math.round(soma(medidas) / medidas.length) : null,
    maiorMs: medidas.length ? Math.max(...medidas) : null,
    menorMs: medidas.length ? Math.min(...medidas) : null,
    mediaPass: soma(historico.map((h) => h.pass)) / historico.length,
    mediaFail: soma(historico.map((h) => h.fail)) / historico.length,
  };
}

export interface ComparacaoOLT {
  antiga: ExecucaoOLT;
  recente: ExecucaoOLT;
  deltaPass: number;
  deltaFail: number;
  deltaCli: number;
  /** null quando alguma das execuções não tem duração medida. */
  deltaTempoMs: number | null;
  /** Etapas FAIL na recente que não falhavam na antiga. */
  novasFalhas: string[];
  /** Etapas FAIL na antiga que deixaram de falhar na recente. */
  falhasCorrigidas: string[];
}

export function compararExecucoes(a: ExecucaoOLT, b: ExecucaoOLT): ComparacaoOLT {
  const [antiga, recente] =
    new Date(a.inicioTs).getTime() <= new Date(b.inicioTs).getTime() ? [a, b] : [b, a];
  const falhasDe = (e: ExecucaoOLT) =>
    new Set(
      Object.entries(e.resultados)
        .filter(([, r]) => r.status === "fail")
        .map(([id]) => id)
    );
  const falhasAntiga = falhasDe(antiga);
  const falhasRecente = falhasDe(recente);
  return {
    antiga,
    recente,
    deltaPass: recente.pass - antiga.pass,
    deltaFail: recente.fail - antiga.fail,
    deltaCli: recente.cli - antiga.cli,
    deltaTempoMs:
      antiga.duracaoMs != null && recente.duracaoMs != null
        ? recente.duracaoMs - antiga.duracaoMs
        : null,
    novasFalhas: [...falhasRecente].filter((id) => !falhasAntiga.has(id)),
    falhasCorrigidas: [...falhasAntiga].filter((id) => !falhasRecente.has(id)),
  };
}
