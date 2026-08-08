// ORION-480 — Pool de IDs sintéticos de staging usados pelos cenários.
//
// Estes IDs NÃO existem por padrão — devem ser gerados pelo script de seed
// (ver docs/CHECKLIST_STAGING.md item 4) rodado contra o projeto Supabase
// de STAGING antes do teste de carga, e então informados via variáveis de
// ambiente (uma lista separada por vírgula) ou arquivo JSON local via
// SEED_DATA_FILE.
//
// Nunca aponta para IDs de produção: se as listas vierem vazias, os
// cenários que dependem delas devem pular a chamada (ver uso abaixo) em
// vez de inventar um ID.

import { SharedArray } from 'k6/data';

function fromEnvList(name) {
  const raw = __ENV[name] || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function loadSeedFile() {
  const path = __ENV.SEED_DATA_FILE;
  if (!path) return null;
  try {
    // eslint-disable-next-line global-require
    return JSON.parse(open(path));
  } catch (_e) {
    return null;
  }
}

const seedFile = loadSeedFile();

const pools = {
  products: seedFile && seedFile.products ? seedFile.products : fromEnvList('SEED_PRODUCT_IDS'),
  vehicles: seedFile && seedFile.vehicles ? seedFile.vehicles : fromEnvList('SEED_VEHICLE_IDS'),
  auctions: seedFile && seedFile.auctions ? seedFile.auctions : fromEnvList('SEED_AUCTION_IDS'),
  profiles: seedFile && seedFile.profiles ? seedFile.profiles : fromEnvList('SEED_PROFILE_IDS'),
};

// SharedArray evita duplicar a lista na memória de cada VU (importante em
// 900k VUs — sem isso, cada VU teria sua própria cópia do array).
const sharedPools = {};
for (const key of Object.keys(pools)) {
  const values = pools[key];
  sharedPools[key] = new SharedArray(`seed_${key}`, () => (values.length ? values : ['__NO_SEED__']));
}

/**
 * Retorna um ID sintético aleatório do pool indicado. Se o pool não foi
 * provisionado (SEED_*_IDS vazio), retorna '__NO_SEED__' — os cenários
 * devem tratar isso pulando a requisição em vez de bater num ID inválido
 * repetidamente (o que só mediria taxa de 404, não capacidade real).
 */
export function pickSeedId(kind) {
  const arr = sharedPools[kind];
  if (!arr || arr.length === 0) return '__NO_SEED__';
  return arr[Math.floor(Math.random() * arr.length)];
}

export function hasSeed(kind) {
  return pickSeedId(kind) !== '__NO_SEED__';
}
