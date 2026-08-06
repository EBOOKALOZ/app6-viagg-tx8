/**
 * ORION LOCAL TEST LAB v2.0 — exportação de relatórios (JSON / Markdown / PDF).
 * Os três formatos são montados a partir do MESMO modelo, derivado apenas da
 * execução real (resultados, latências medidas e evidências capturadas).
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  OLT_VERSION,
  formatarDuracao,
  formatarSegundos,
  type DefCategoria,
  type EtapaStatus,
  type ExecucaoOLT,
} from "./oltTypes";
import { agruparFalhas, gerarRelatorioExecutivo, type GruposDeFalhas } from "./oltReport";

const STATUS_LABEL: Record<EtapaStatus, string> = {
  pendente: "Pendente",
  executando: "Executando",
  pass: "PASS",
  fail: "FAIL",
  cli: "CLI",
};

interface LinhaEtapa {
  categoria: string;
  etapa: string;
  status: string;
  ms: number | null;
  esperadoMs: number | null;
  detalhe: string;
}

interface LinhaCategoria {
  nome: string;
  etapas: number;
  executadas: number;
  pass: number;
  fail: number;
  cli: number;
  tempoMs: number | null;
  mediaMs: number | null;
}

interface ModeloRelatorio {
  geradoEm: string;
  resultadoFinal: string;
  resumo: Array<[string, string]>;
  relatorioExecutivo: string[];
  categorias: LinhaCategoria[];
  etapas: LinhaEtapa[];
  latencias: LinhaEtapa[];
  grupos: GruposDeFalhas;
}

function montarModelo(def: DefCategoria[], exec: ExecucaoOLT): ModeloRelatorio {
  const relatorio = gerarRelatorioExecutivo(def, exec);
  const etapas: LinhaEtapa[] = [];
  const categorias: LinhaCategoria[] = [];

  for (const cat of def) {
    let tempo = 0;
    let medidas = 0;
    let pass = 0;
    let fail = 0;
    let cli = 0;
    for (const e of cat.etapas) {
      const r = exec.resultados[e.id];
      const st = r?.status ?? "pendente";
      if (st === "pass") pass += 1;
      if (st === "fail") fail += 1;
      if (st === "cli") cli += 1;
      if (typeof r?.ms === "number") {
        tempo += r.ms;
        medidas += 1;
      }
      etapas.push({
        categoria: cat.nome,
        etapa: e.nome,
        status: STATUS_LABEL[st],
        ms: typeof r?.ms === "number" ? r.ms : null,
        esperadoMs: r?.esperadoMs ?? e.esperadoMs ?? null,
        detalhe: r?.detalhe ?? "",
      });
    }
    categorias.push({
      nome: cat.nome,
      etapas: cat.etapas.length,
      executadas: pass + fail + cli,
      pass,
      fail,
      cli,
      tempoMs: medidas ? tempo : null,
      mediaMs: medidas ? Math.round(tempo / medidas) : null,
    });
  }

  const latencias = etapas
    .filter((e) => e.ms != null)
    .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))
    .slice(0, 10);

  return {
    geradoEm: new Date().toISOString(),
    resultadoFinal: relatorio[0] ?? "Sem resultado consolidado.",
    resumo: [
      ["Data da execução", new Date(exec.fimTs).toLocaleString("pt-BR")],
      ["Duração total", exec.duracaoMs != null ? formatarDuracao(exec.duracaoMs) : "não registrada"],
      ["Etapas", `${exec.total}`],
      ["PASS", `${exec.pass}`],
      ["FAIL", `${exec.fail}`],
      ["CLI", `${exec.cli}`],
      ["Não executadas", `${exec.naoExec}`],
      ["Percentual de PASS", `${exec.percentualPass}%`],
      ["Execução parcial", exec.parcial ? "sim (apenas parte da fila)" : "não"],
      ["Estado final", exec.estadoFinal === "concluida" ? "concluída" : "cancelada"],
      ["Versão do sistema", exec.versao],
      ["Painel", `ORION LOCAL TEST LAB v${OLT_VERSION}`],
    ],
    relatorioExecutivo: relatorio,
    categorias,
    etapas,
    latencias,
    grupos: agruparFalhas(def, exec.resultados),
  };
}

function nomeArquivo(exec: ExecucaoOLT) {
  const d = new Date(exec.fimTs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `olt-homologacao-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours()
  )}${p(d.getMinutes())}`;
}

function baixarTexto(conteudo: string, nome: string, mime: string) {
  const blob = new Blob([conteudo], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = nome;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportarOltJson(def: DefCategoria[], exec: ExecucaoOLT) {
  const modelo = montarModelo(def, exec);
  const payload = {
    ferramenta: "ORION LOCAL TEST LAB",
    oltVersao: OLT_VERSION,
    geradoEm: modelo.geradoEm,
    resultadoFinal: modelo.resultadoFinal,
    resumo: Object.fromEntries(modelo.resumo),
    relatorioExecutivo: modelo.relatorioExecutivo,
    categorias: modelo.categorias,
    latenciasTop10: modelo.latencias,
    grupos: modelo.grupos,
    /** Execução completa, incluindo evidências técnicas capturadas etapa a etapa. */
    execucao: exec,
  };
  baixarTexto(JSON.stringify(payload, null, 2), `${nomeArquivo(exec)}.json`, "application/json");
}

const mdCell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function exportarOltMarkdown(def: DefCategoria[], exec: ExecucaoOLT) {
  const m = montarModelo(def, exec);
  const linhas: string[] = [];
  linhas.push(`# ORION LOCAL TEST LAB — Relatório de Homologação`);
  linhas.push("");
  linhas.push(`**Resultado Final:** ${m.resultadoFinal}`);
  linhas.push("");
  linhas.push(`## Resumo Geral`);
  linhas.push(`| Indicador | Valor |`);
  linhas.push(`| --- | --- |`);
  for (const [k, v] of m.resumo) linhas.push(`| ${mdCell(k)} | ${mdCell(v)} |`);
  linhas.push("");
  linhas.push(`## Relatório Executivo`);
  for (const l of m.relatorioExecutivo) linhas.push(`- ${l}`);
  linhas.push("");
  linhas.push(`## Categorias`);
  linhas.push(`| Categoria | Etapas | Executadas | PASS | FAIL | CLI | Tempo | Média/etapa |`);
  linhas.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const c of m.categorias) {
    linhas.push(
      `| ${mdCell(c.nome)} | ${c.etapas} | ${c.executadas} | ${c.pass} | ${c.fail} | ${c.cli} | ${
        c.tempoMs != null ? formatarSegundos(c.tempoMs) : "—"
      } | ${c.mediaMs != null ? `${c.mediaMs} ms` : "—"} |`
    );
  }
  linhas.push("");
  linhas.push(`## Etapas`);
  linhas.push(`| Categoria | Etapa | Status | Latência | Esperado | Detalhe |`);
  linhas.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const e of m.etapas) {
    linhas.push(
      `| ${mdCell(e.categoria)} | ${mdCell(e.etapa)} | ${e.status} | ${
        e.ms != null ? `${e.ms} ms` : "—"
      } | ${e.esperadoMs != null ? `${e.esperadoMs} ms` : "—"} | ${mdCell(e.detalhe)} |`
    );
  }
  linhas.push("");
  linhas.push(`## Latências — 10 etapas mais lentas`);
  linhas.push(`| Etapa | Latência |`);
  linhas.push(`| --- | --- |`);
  for (const e of m.latencias) linhas.push(`| ${mdCell(e.etapa)} | ${e.ms} ms |`);
  linhas.push("");
  const secao = (titulo: string, itens: typeof m.grupos.criticas, vazio: string) => {
    linhas.push(`## ${titulo}`);
    if (itens.length === 0) linhas.push(vazio);
    else
      for (const i of itens)
        linhas.push(`- **${mdCell(i.categoriaNome)} · ${mdCell(i.etapaNome)}** — ${mdCell(i.detalhe ?? "")}`);
    linhas.push("");
  };
  secao("Falhas Críticas", m.grupos.criticas, "Nenhuma falha crítica.");
  secao("Falhas Médias", m.grupos.medias, "Nenhuma falha média.");
  secao("Avisos (Gargalos)", m.grupos.avisos, "Nenhum gargalo detectado.");
  secao("Etapas CLI", m.grupos.cli, "Nenhuma etapa CLI.");
  linhas.push(`---`);
  linhas.push(`Gerado em ${new Date(m.geradoEm).toLocaleString("pt-BR")} · OLT v${OLT_VERSION}`);
  baixarTexto(linhas.join("\n"), `${nomeArquivo(exec)}.md`, "text/markdown");
}

/* Paleta do PDF — mesmo violeta do painel (violet-600 #7c3aed). */
const ROXO: [number, number, number] = [124, 58, 237];
const CINZA: [number, number, number] = [100, 100, 110];

export function exportarOltPdf(def: DefCategoria[], exec: ExecucaoOLT) {
  const m = montarModelo(def, exec);
  const doc = new jsPDF();
  const largura = doc.internal.pageSize.getWidth();

  doc.setFillColor(...ROXO);
  doc.rect(0, 0, largura, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text("ORION LOCAL TEST LAB — Relatório de Homologação", 14, 11);
  doc.setFontSize(9);
  doc.text(
    `OLT v${OLT_VERSION} · ${new Date(exec.fimTs).toLocaleString("pt-BR")} · ${exec.versao}`,
    14,
    18
  );

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(12);
  doc.text(doc.splitTextToSize(`Resultado Final: ${m.resultadoFinal}`, largura - 28), 14, 36);

  autoTable(doc, {
    startY: 46,
    head: [["Resumo Geral", "Valor"]],
    body: m.resumo,
    styles: { fontSize: 8 },
    headStyles: { fillColor: ROXO },
  });

  autoTable(doc, {
    head: [["Relatório Executivo"]],
    body: m.relatorioExecutivo.map((l) => [l]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: ROXO },
  });

  autoTable(doc, {
    head: [["Categoria", "Etapas", "Exec.", "PASS", "FAIL", "CLI", "Tempo", "Média/etapa"]],
    body: m.categorias.map((c) => [
      c.nome,
      c.etapas,
      c.executadas,
      c.pass,
      c.fail,
      c.cli,
      c.tempoMs != null ? formatarSegundos(c.tempoMs) : "—",
      c.mediaMs != null ? `${c.mediaMs} ms` : "—",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: ROXO },
  });

  autoTable(doc, {
    head: [["Categoria", "Etapa", "Status", "Latência", "Esperado", "Detalhe"]],
    body: m.etapas.map((e) => [
      e.categoria,
      e.etapa,
      e.status,
      e.ms != null ? `${e.ms} ms` : "—",
      e.esperadoMs != null ? `${e.esperadoMs} ms` : "—",
      e.detalhe,
    ]),
    styles: { fontSize: 7, cellWidth: "wrap" },
    columnStyles: { 5: { cellWidth: 70 } },
    headStyles: { fillColor: ROXO },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const v = String(data.cell.raw);
        if (v === "FAIL") data.cell.styles.textColor = [190, 20, 20];
        else if (v === "PASS") data.cell.styles.textColor = [10, 130, 70];
        else if (v === "CLI") data.cell.styles.textColor = [180, 120, 0];
      }
    },
  });

  autoTable(doc, {
    head: [["Latências — 10 etapas mais lentas", "ms"]],
    body: m.latencias.map((e) => [`${e.categoria} · ${e.etapa}`, `${e.ms} ms`]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: ROXO },
  });

  const tabelaGrupo = (titulo: string, itens: typeof m.grupos.criticas, vazio: string) => {
    autoTable(doc, {
      head: [[titulo, "Detalhe real"]],
      body: itens.length
        ? itens.map((i) => [`${i.categoriaNome} · ${i.etapaNome}`, i.detalhe ?? ""])
        : [[vazio, ""]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: ROXO },
    });
  };
  tabelaGrupo("Falhas Críticas", m.grupos.criticas, "Nenhuma falha crítica.");
  tabelaGrupo("Falhas Médias", m.grupos.medias, "Nenhuma falha média.");
  tabelaGrupo("Avisos (Gargalos)", m.grupos.avisos, "Nenhum gargalo detectado.");
  tabelaGrupo("Etapas CLI", m.grupos.cli, "Nenhuma etapa CLI.");

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...CINZA);
    doc.text(
      `Gerado em ${new Date(m.geradoEm).toLocaleString("pt-BR")} · ORION LOCAL TEST LAB v${OLT_VERSION} · página ${p}/${paginas}`,
      14,
      doc.internal.pageSize.getHeight() - 6
    );
  }

  doc.save(`${nomeArquivo(exec)}.pdf`);
}
