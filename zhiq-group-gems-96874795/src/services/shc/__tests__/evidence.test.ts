import { describe, it, expect } from 'vitest';
import { MODULE_EVIDENCE, getModuleEvidence } from '../evidence';

/** Catálogo oficial congelado (12 verticais) — deve casar com shc_modules. */
const OFFICIAL_SLUGS = [
  'veiculos', 'imoveis', 'servicos', 'fretes', 'viagens', 'turismo',
  'financeiro', 'leiloes', 'admin', 'marketplace', 'carteira', 'orion-ai',
];

describe('MODULE_EVIDENCE (registro oficial de evidência do painel)', () => {
  it('cobre exatamente os 12 módulos do catálogo oficial', () => {
    expect(Object.keys(MODULE_EVIDENCE).sort()).toEqual([...OFFICIAL_SLUGS].sort());
  });

  it('toda entrada tem tabelas não vazias, sem duplicatas e em snake_case', () => {
    for (const [slug, entry] of Object.entries(MODULE_EVIDENCE)) {
      expect(entry.tables.length, `módulo ${slug} sem tabelas`).toBeGreaterThan(0);
      expect(new Set(entry.tables).size, `módulo ${slug} com tabela duplicada`).toBe(entry.tables.length);
      for (const t of entry.tables) {
        expect(t, `tabela inválida em ${slug}: ${t}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
      for (const r of entry.rpcs ?? []) {
        expect(r, `rpc inválida em ${slug}: ${r}`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it('getModuleEvidence anexa o agente do painel e preserva o registro', () => {
    const ev = getModuleEvidence('leiloes');
    expect(ev?.agents).toEqual(['SHC Painel v2.1']);
    expect(ev?.tables).toEqual(MODULE_EVIDENCE.leiloes.tables);
    expect(ev?.rpcs).toEqual(MODULE_EVIDENCE.leiloes.rpcs);
  });

  it('slug desconhecido retorna undefined (motor reprova por FAIL CLOSED)', () => {
    expect(getModuleEvidence('modulo-fantasma')).toBeUndefined();
  });
});
