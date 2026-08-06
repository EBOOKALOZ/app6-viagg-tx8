/**
 * ORION LOCAL TEST LAB v2.0 — agrupamento de falhas e relatório executivo.
 * Todas as frases são derivadas exclusivamente dos resultados reais da
 * execução: nenhuma afirmação é emitida sem a verificação correspondente
 * ter sido de fato executada.
 */
import {
  calcularGargalo,
  formatarDuracao,
  type DefCategoria,
  type ExecucaoOLT,
  type ResultadoEtapa,
} from "./oltTypes";

/** Categorias cujas falhas são tratadas como críticas (dados/segurança/dinheiro). */
export const CATEGORIAS_CRITICAS = ["banco", "rls", "seguranca", "financeiro"];

export interface ItemGrupo {
  etapaId: string;
  etapaNome: string;
  categoriaId: string;
  categoriaNome: string;
  detalhe?: string;
  ms?: number;
  esperadoMs?: number;
  diferencaMs?: number;
}

export interface GruposDeFalhas {
  criticas: ItemGrupo[];
  medias: ItemGrupo[];
  /** Avisos = etapas aprovadas porém acima do tempo esperado (gargalos). */
  avisos: ItemGrupo[];
  cli: ItemGrupo[];
}

export function agruparFalhas(
  def: DefCategoria[],
  resultados: Record<string, ResultadoEtapa>
): GruposDeFalhas {
  const grupos: GruposDeFalhas = { criticas: [], medias: [], avisos: [], cli: [] };
  for (const cat of def) {
    for (const etapa of cat.etapas) {
      const r = resultados[etapa.id];
      if (!r) continue;
      const item: ItemGrupo = {
        etapaId: etapa.id,
        etapaNome: etapa.nome,
        categoriaId: cat.id,
        categoriaNome: cat.nome,
        detalhe: r.detalhe,
        ms: r.ms,
        esperadoMs: r.esperadoMs,
      };
      if (r.status === "fail") {
        const critica =
          CATEGORIAS_CRITICAS.includes(cat.id) || (r.detalhe ?? "").startsWith("VAZAMENTO");
        (critica ? grupos.criticas : grupos.medias).push(item);
      } else if (r.status === "cli") {
        grupos.cli.push(item);
      } else if (r.status === "pass") {
        const g = calcularGargalo(r);
        if (g) grupos.avisos.push({ ...item, diferencaMs: g.diferencaMs });
      }
    }
  }
  return grupos;
}

function statusCategoria(cat: DefCategoria, resultados: Record<string, ResultadoEtapa>) {
  let pass = 0;
  let fail = 0;
  let executadas = 0;
  for (const e of cat.etapas) {
    const st = resultados[e.id]?.status;
    if (st === "pass") pass += 1;
    if (st === "fail") fail += 1;
    if (st === "pass" || st === "fail" || st === "cli") executadas += 1;
  }
  return { pass, fail, executadas, total: cat.etapas.length };
}

function fraseDominio(
  def: DefCategoria[],
  resultados: Record<string, ResultadoEtapa>,
  catId: string,
  rotulo: string,
  fraseSaudavel: string
): string {
  const cat = def.find((c) => c.id === catId);
  if (!cat) return `${rotulo}: categoria ausente da fila.`;
  const st = statusCategoria(cat, resultados);
  if (st.executadas === 0) return `${rotulo} não verificado nesta execução.`;
  if (st.fail > 0) return `${rotulo} com ${st.fail} falha(s) em ${st.executadas} verificação(ões).`;
  if (st.executadas < st.total)
    return `${rotulo} parcialmente verificado (${st.executadas}/${st.total} etapas, sem falhas).`;
  return `${fraseSaudavel} (${st.executadas}/${st.total} verificações aprovadas).`;
}

/** Resumo executivo — cada linha só é emitida com base no que foi executado. */
export function gerarRelatorioExecutivo(def: DefCategoria[], exec: ExecucaoOLT): string[] {
  const r = exec.resultados;
  const linhas: string[] = [];
  const executadas = exec.pass + exec.fail + exec.cli;

  if (exec.estadoFinal === "cancelada") {
    linhas.push(
      `Homologação cancelada antes do fim — ${executadas} de ${exec.total} etapas executadas.`
    );
  } else if (exec.fail > 0) {
    linhas.push(`Sistema reprovado na homologação — ${exec.fail} falha(s) encontrada(s).`);
  } else if (exec.naoExec > 0) {
    linhas.push(`Homologação incompleta — ${exec.naoExec} etapa(s) não executada(s).`);
  } else {
    linhas.push("Sistema homologado com sucesso.");
  }

  linhas.push(
    `${executadas} de ${exec.total} etapas executadas — ${exec.pass} PASS · ${exec.cli} CLI · ${exec.fail} FAIL.`
  );
  linhas.push(
    `Tempo total: ${exec.duracaoMs != null ? formatarDuracao(exec.duracaoMs) : "não registrado nesta execução"}.`
  );

  linhas.push(fraseDominio(def, r, "banco", "Banco", "Banco saudável"));
  linhas.push(fraseDominio(def, r, "apis", "APIs", "APIs saudáveis"));

  const sondas = def.flatMap((c) => c.etapas).filter((e) => e.rlsProbe);
  const sondasExecutadas = sondas.filter(
    (s) => r[s.id]?.status === "pass" || r[s.id]?.status === "fail"
  );
  const sondasFail = sondasExecutadas.filter((s) => r[s.id]?.status === "fail");
  const vazamentos = sondasFail.filter((s) => (r[s.id]?.detalhe ?? "").startsWith("VAZAMENTO"));
  if (sondasExecutadas.length === 0) {
    linhas.push("Sondas RLS não executadas nesta homologação.");
  } else if (vazamentos.length > 0) {
    linhas.push(
      `⚠ VAZAMENTO de dados detectado em ${vazamentos.length} sonda(s) RLS: ${vazamentos
        .map((s) => s.nome)
        .join("; ")}.`
    );
  } else if (sondasFail.length > 0) {
    linhas.push(`⚠ ${sondasFail.length} sonda(s) RLS reprovada(s) — revisar as etapas listadas.`);
  } else {
    linhas.push(
      `Nenhuma vulnerabilidade RLS encontrada (${sondasExecutadas.length} sondas anônimas executadas).`
    );
    linhas.push("Sem vazamentos detectados.");
  }

  const grupos = agruparFalhas(def, r);
  if (grupos.avisos.length > 0) {
    linhas.push(`${grupos.avisos.length} gargalo(s) de latência identificado(s).`);
  } else if (executadas > 0) {
    linhas.push("Nenhum gargalo de latência nas etapas medidas.");
  }

  linhas.push(`Versão do sistema: ${exec.versao}.`);
  return linhas;
}
