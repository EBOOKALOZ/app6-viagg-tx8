// ORION-480 — Distribuidor de cenários.
//
// Pesos default modelam uso típico de marketplace: maioria leitura/navegação,
// fração menor em fluxos de maior valor (leilões, wallet), fração pequena em
// escrita. Cada peso é sobrescrevível via env var WEIGHT_<NOME> (ver
// lib/config.js scenarioWeight) para poder isolar um domínio por vez —
// útil ao investigar um gargalo específico sem recriar o load do resto.
//
// Documentar a distribuição usada em cada execução é obrigatório (ver
// docs/ARQUITETURA.md "Registro de execução") — os pesos abaixo são o
// default, não um valor implícito.

import { navegacaoScenario } from './navegacao.js';
import { autenticacaoScenario } from './autenticacao.js';
import { pesquisaScenario } from './pesquisa.js';
import { anunciosScenario } from './anuncios.js';
import { veiculosScenario } from './veiculos.js';
import { leiloesScenario } from './leiloes.js';
import { conveniosScenario } from './convenios.js';
import { doacoesScenario } from './doacoes.js';
import { walletScenario } from './wallet.js';
import { apiScenario } from './api.js';
import { perfisScenario } from './perfis.js';
import { scenarioWeight } from '../lib/config.js';

// { nome: [peso_default, precisaAuth] }
const WEIGHTED_SCENARIOS = [
  ['navegacao', navegacaoScenario, 0.30, false],
  ['pesquisa', pesquisaScenario, 0.15, false],
  ['anuncios', anunciosScenario, 0.15, false],
  ['veiculos', veiculosScenario, 0.10, true],
  ['leiloes', leiloesScenario, 0.10, true],
  ['perfis', perfisScenario, 0.08, false],
  ['convenios', conveniosScenario, 0.05, true],
  ['wallet', walletScenario, 0.04, true],
  ['doacoes', doacoesScenario, 0.02, true],
  ['api', apiScenario, 0.01, true],
];

export function buildWeightedTable() {
  const table = WEIGHTED_SCENARIOS.map(([name, fn, defaultWeight, needsAuth]) => ({
    name,
    fn,
    needsAuth,
    weight: scenarioWeight(name, defaultWeight),
  }));
  const total = table.reduce((sum, s) => sum + s.weight, 0);
  let cumulative = 0;
  for (const entry of table) {
    cumulative += entry.weight / total;
    entry.cumulative = cumulative;
  }
  return table;
}

export function pickScenario(table) {
  const r = Math.random();
  for (const entry of table) {
    if (r <= entry.cumulative) return entry;
  }
  return table[table.length - 1];
}

export { autenticacaoScenario };
