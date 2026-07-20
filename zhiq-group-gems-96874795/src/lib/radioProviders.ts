/**
 * radioProviders.ts — Arquitetura de CONECTORES (providers) do ORION Sound System.
 *
 * Camada ADITIVA: permite integrar novas fontes públicas de rádio SEM alterar o
 * núcleo (radioBrowser.ts / radioPlayer.ts / RadioMundial.tsx). Cada provider
 * expõe um contrato uniforme; a UI e a descoberta consomem a lista de providers.
 *
 * Providers atuais:
 *  - `radio-browser` (radio-browser.info, diretório público mundial)
 *  - `catalogo-curado` (banco próprio orion_audio_radio_curated, via RPC v2)
 * Novos providers (ex.: diretórios regionais) entram só adicionando um objeto
 * ao array PROVIDERS — nada mais muda.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  searchStations, discoverByCategory, topStations,
  type RadioStation, type RadioCategory,
} from "@/lib/radioBrowser";

/** Filtros combinados que um provider pode receber (ETAPA 4). */
export interface RadioQuery {
  term?: string;
  category?: string;
  uf?: string;
  region?: string;
  language?: string;
  countrycode?: string;
  limit?: number;
}

/** Contrato uniforme de um conector de rádios. */
export interface RadioProvider {
  key: string;
  label: string;
  /** true = fonte externa (rede); false = base própria */
  external: boolean;
  search(q: RadioQuery): Promise<RadioStation[]>;
  byCategory?(cat: RadioCategory, limit: number): Promise<RadioStation[]>;
}

/* ── Provider 1: Catálogo curado (banco próprio, busca v2 combinada) ────────── */
export const catalogProvider: RadioProvider = {
  key: "catalogo-curado",
  label: "Catálogo Viagg",
  external: false,
  async search(q) {
    try {
      const { data } = await supabase.rpc("audio_radio_search_v2", {
        p_term: q.term || "",
        p_category: q.category ?? null,
        p_uf: q.uf ?? null,
        p_region: q.region ?? null,
        p_language: q.language ?? null,
        p_countrycode: q.countrycode ?? null,
        p_limit: q.limit ?? 60,
      });
      return Array.isArray(data) ? (data as unknown as RadioStation[]) : [];
    } catch {
      // fallback para a busca v1 (compatibilidade total se a v2 ainda não existir)
      try {
        const { data } = await supabase.rpc("audio_radio_curated_search", { p_term: q.term || "", p_limit: q.limit ?? 40 });
        return Array.isArray(data) ? (data as unknown as RadioStation[]) : [];
      } catch { return []; }
    }
  },
};

/* ── Provider 2: Radio Browser (diretório público mundial) ──────────────────── */
export const radioBrowserProvider: RadioProvider = {
  key: "radio-browser",
  label: "Radio Browser",
  external: true,
  async search(q) {
    try {
      return await searchStations({
        name: q.term,
        state: q.uf,
        language: q.language,
        countrycode: q.countrycode || "BR",
        limit: q.limit ?? 60,
        order: "clickcount",
        reverse: true,
      });
    } catch { return []; }
  },
  byCategory: (cat, limit) => discoverByCategory(cat, limit),
};

/** Registro oficial de providers. Adicionar um novo = só empurrar aqui. */
export const PROVIDERS: RadioProvider[] = [catalogProvider, radioBrowserProvider];

/** Dedup por stream/uuid (colapsa a mesma emissora vinda de fontes diferentes). */
function keyOf(s: RadioStation): string {
  const url = (s.url_resolved || s.url || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  return url || (s.stationuuid || "") || (s.name || "").toLowerCase();
}

/**
 * Busca federada: consulta TODOS os providers em paralelo e mescla deduplicando.
 * O catálogo curado vem primeiro (prioridade), depois as fontes externas.
 */
export async function federatedSearch(q: RadioQuery): Promise<RadioStation[]> {
  const results = await Promise.all(PROVIDERS.map((p) => p.search(q).catch(() => [] as RadioStation[])));
  const seen = new Set<string>();
  const out: RadioStation[] = [];
  for (const list of results) {
    for (const s of list) {
      const k = keyOf(s);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out.slice(0, q.limit ?? 80);
}

/** Descoberta federada por categoria (curado + externos), mesclada. */
export async function federatedByCategory(cat: RadioCategory, limit = 60): Promise<RadioStation[]> {
  const [cur, ext] = await Promise.all([
    catalogProvider.search({ category: cat.key, limit }).catch(() => [] as RadioStation[]),
    (radioBrowserProvider.byCategory
      ? radioBrowserProvider.byCategory(cat, limit).catch(() => [] as RadioStation[])
      : Promise.resolve([] as RadioStation[])),
  ]);
  const seen = new Set<string>();
  const out: RadioStation[] = [];
  for (const list of [cur, ext]) for (const s of list) {
    const k = keyOf(s);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(s);
  }
  return out.slice(0, limit);
}

export { topStations };
