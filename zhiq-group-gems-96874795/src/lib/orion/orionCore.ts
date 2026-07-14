/**
 * ORION CORE — Nível 1 do Organismo de Inteligência Territorial VIAGG-TX8.
 *
 * O CORE interpreta a pergunta do administrador, decide quais MOTORES
 * ESPECIALIZADOS (Nível 2) consultar, reúne as evidências reais de cada um,
 * calcula o nível de confiança e produz UMA resposta consolidada via IA
 * generativa — sempre justificada pelas evidências coletadas.
 *
 * Os motores não têm interface própria: respondem apenas ao CORE.
 * Todos leem dados REAIS via RPCs admin-gated (mp_is_admin no banco).
 *
 * Extensível (Plataforma Evolutiva): novo motor = nova entrada em MOTORES.
 */
import { supabase } from '@/integrations/supabase/client';
import { viaggAI } from '@/lib/viaggAI';

export interface MotorOrion {
  id: string;
  nome: string;
  /** quando a pergunta casa, o motor é consultado (EXECUTIVE é sempre consultado) */
  keywords: RegExp;
  coletar: () => Promise<string | null>;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

export const MOTORES: MotorOrion[] = [
  {
    id: 'EXECUTIVE', nome: 'ORION EXECUTIVE',
    keywords: /./,
    coletar: async () => {
      const k = await rpc('orion_kpis');
      return `KPIs gerais: ${JSON.stringify(k)}`;
    },
  },
  {
    id: 'GEO', nome: 'ORION GEO',
    keywords: /(cidade|municipio|regiao|uf\b|estado|expans|territor|onde|mapa|brasil|implantac)/,
    coletar: async () => {
      const rows = (await rpc('orion_ranking', { p_uf: null, p_limite: 12 })) as any[];
      if (!rows?.length) return null;
      return 'Top cidades por score geral:\n' + rows.map(r =>
        `- ${r.nome}/${r.uf}: pop ${r.populacao}, score ${r.score_geral}, classe ${r.classificacao} (lojas ${r.lojas}, motoboys ${r.motoboys}, anúncios ${r.anuncios})`).join('\n');
    },
  },
  {
    id: 'FLOW', nome: 'ORION FLOW',
    keywords: /(pedido|corrida|entrega|cancel|tempo|operac|gargalo|despacho)/,
    coletar: async () => {
      const alertas = (await rpc('orion_alertas')) as any[];
      if (!alertas?.length) return 'Nenhum gargalo operacional detectado agora.';
      return 'Alertas operacionais ativos:\n' + alertas.map(a =>
        `- [${a.severidade}/${a.tipo}] ${a.cidade || 'geral'}: ${a.mensagem}`).join('\n');
    },
  },
  {
    id: 'PEOPLE_MARKET', nome: 'ORION PEOPLE + MARKET',
    keywords: /(motoboy|profissional|loja|lojista|anuncio|mercado|marketplace|recrut|capta)/,
    coletar: async () => {
      const rows = (await rpc('orion_ranking', { p_uf: null, p_limite: 400 })) as any[];
      const comPresenca = (rows || []).filter(r => r.lojas > 0 || r.motoboys > 0 || r.usuarios > 0);
      if (!comPresenca.length) return 'Nenhuma cidade com presença cadastrada ainda.';
      return 'Presença real por cidade:\n' + comPresenca.map(r =>
        `- ${r.nome}/${r.uf}: ${r.lojas} loja(s), ${r.motoboys} motoboy(s), ${r.anuncios} anúncio(s), ${r.usuarios} usuário(s) — classe ${r.classificacao}`).join('\n');
    },
  },
  {
    id: 'PREDICT', nome: 'ORION PREDICT',
    keywords: /(prev|demanda|amanha|futuro|tendencia|crescim|proxim|sazonal)/,
    coletar: async () => {
      const p = await rpc('orion_prever_demanda');
      return `Previsão de demanda (baseline sobre pedidos reais): ${JSON.stringify(p)}`;
    },
  },
  {
    id: 'LEARN', nome: 'ORION LEARN',
    keywords: /(aprend|historico|recomendac|decis|resultado|eficien)/,
    coletar: async () => {
      const { data } = await (supabase.from('orion_recomendacoes') as any)
        .select('motor, cidade, titulo, status, confianca, criado_em')
        .order('criado_em', { ascending: false }).limit(15);
      if (!data?.length) return 'Nenhuma recomendação registrada ainda.';
      return 'Histórico de recomendações:\n' + (data as any[]).map(r =>
        `- [${r.status}] ${r.titulo} (motor ${r.motor}, confiança ${Math.round(r.confianca * 100)}%)`).join('\n');
    },
  },
];

export interface OrionResposta {
  resposta: string;
  confianca: number;
  motores: string[];
}

/** ORION CORE: reúne evidências dos motores relevantes e consolida em UMA resposta. */
export async function orionPerguntar(pergunta: string): Promise<OrionResposta> {
  const p = norm(pergunta);
  const selecionados = [
    MOTORES[0],
    ...MOTORES.slice(1).filter(m => m.keywords.test(p)),
  ].slice(0, 4);
  // sem casamento específico → visão executiva + territorial
  if (selecionados.length === 1) selecionados.push(MOTORES[1]);

  const coletas = await Promise.allSettled(selecionados.map(m => m.coletar()));
  const evidencias: string[] = [];
  const usados: string[] = [];
  coletas.forEach((c, i) => {
    if (c.status === 'fulfilled' && c.value) {
      evidencias.push(`[${selecionados[i].nome}]\n${c.value}`);
      usados.push(selecionados[i].nome);
    }
  });

  const confianca = Math.min(0.9, 0.35 + evidencias.length * 0.13);

  const contexto =
    `Você é a ORION — Organismo de Inteligência Territorial da VIAGG-TX8, o cérebro estratégico da plataforma. ` +
    `Você fala com um ADMINISTRADOR. Responda como analista estratégico sênior: leitura direta da situação, ` +
    `números exatos das evidências, recomendação concreta, riscos e uma alternativa. ` +
    `GOVERNANÇA (obrigatório): nunca invente dados além das evidências; distinga sempre FATO ` +
    `(número medido nas evidências) de ESTIMATIVA (projeção/heurística) ao citar valores; ` +
    `se a confiança for inferior a 50%, abra a resposta avisando que a base de dados ainda é limitada; ` +
    `a decisão final é sempre do administrador — apresente a recomendação, não a execute. ` +
    `Estruture em parágrafos curtos. ` +
    `Feche indicando o nível de confiança desta análise: ${Math.round(confianca * 100)}% ` +
    `(baseado em ${evidencias.length} motor(es) com dados reais).\n\n` +
    `[EVIDÊNCIAS DOS MOTORES ESPECIALIZADOS — DADOS REAIS DA PLATAFORMA]\n\n` +
    evidencias.join('\n\n');

  const { content } = await viaggAI.chat(
    [{ role: 'user', content: pergunta }],
    { context: contexto, maxTokens: 1100 },
  );

  return { resposta: content, confianca, motores: usados };
}
