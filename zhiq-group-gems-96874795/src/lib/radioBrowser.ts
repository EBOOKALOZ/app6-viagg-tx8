/**
 * radioBrowser.ts — cliente do Community Radio Browser (radio-browser.info).
 * API pública, gratuita, sem chave. Milhares de emissoras reais com geo, idioma,
 * gênero (tags), país e URL de streaming. A API é CORS-friendly (funciona no
 * browser); os STREAMS em si são de terceiros (tocam via <audio> simples).
 * ORION-AUDIO X · Fase 1 (Rádio Mundial).
 */
export interface RadioStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  codec: string;
  bitrate: number;
  votes: number;
  clickcount: number;
  geo_lat: number | null;
  geo_long: number | null;
}

// mirrors HTTPS conhecidos (round-robin + específicos como fallback)
const SERVERS = [
  "https://all.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
];
const LS_SERVER = "viagg_radio_server";
let currentServer: string | null = null;

async function fetchJSON(base: string, path: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base + path, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function resolveServer(): Promise<string> {
  if (currentServer) return currentServer;
  let cached: string | null = null;
  try { cached = localStorage.getItem(LS_SERVER); } catch { /* ignore */ }
  const candidates = cached ? [cached, ...SERVERS.filter((s) => s !== cached)] : SERVERS;
  for (const s of candidates) {
    try {
      await fetchJSON(s, "/json/stats", 4500);
      currentServer = s;
      try { localStorage.setItem(LS_SERVER, s); } catch { /* ignore */ }
      return s;
    } catch { /* tenta o próximo */ }
  }
  currentServer = SERVERS[0];
  return currentServer;
}

async function api(path: string): Promise<unknown> {
  const server = await resolveServer();
  try {
    return await fetchJSON(server, path);
  } catch {
    currentServer = null; // servidor pode ter caído — tenta outro uma vez
    const server2 = await resolveServer();
    return await fetchJSON(server2, path);
  }
}

const qs = (o: Record<string, string | number | boolean | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export interface SearchParams {
  name?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  language?: string;
  tag?: string;
  limit?: number;
  order?: "clickcount" | "votes" | "name" | "bitrate";
  reverse?: boolean;
}

function cleanList(data: unknown): RadioStation[] {
  if (!Array.isArray(data)) return [];
  const arr = (data as RadioStation[]).filter((s) => s && (s.url_resolved || s.url));
  // MIXED CONTENT: em site HTTPS, streams http:// são bloqueados. Prioriza as
  // emissoras com stream HTTPS (que realmente tocam) — sobem ao topo, resto mantém ordem.
  const isHttps = (s: RadioStation) => (s.url_resolved || s.url || "").startsWith("https");
  return arr.sort((a, b) => Number(isHttps(b)) - Number(isHttps(a)));
}

export async function searchStations(p: SearchParams): Promise<RadioStation[]> {
  const query = qs({
    name: p.name,
    country: p.country,
    countrycode: p.countrycode,
    state: p.state,
    language: p.language,
    tag: p.tag,
    limit: p.limit ?? 60,
    order: p.order ?? "clickcount",
    reverse: p.reverse ?? true,
    hidebroken: true,
  });
  return cleanList(await api("/json/stations/search?" + query));
}

export async function topStations(limit = 60): Promise<RadioStation[]> {
  return cleanList(await api("/json/stations/topvote/" + limit));
}

// palavras-ruído que atrapalham o match de substring (nome exato da emissora)
const NOISE = /\b(r[aá]dios?|fm|am|web|online|ao\s*vivo|stereo|est[eé]reo|oficial)\b/gi;

/**
 * Busca tolerante por nome: tenta o texto completo, depois sem palavras-ruído
 * ("rádio", "fm", "am"…), depois o termo mais distintivo. Mescla e deduplica.
 * Faz "radio jovem pan fm" achar "Jovem Pan", "band fm 96" achar "Band FM" etc.
 */
export async function smartSearchStations(raw: string, limit = 60): Promise<RadioStation[]> {
  const clean = (raw || "").trim().replace(/\s+/g, " ");
  if (!clean) return [];
  const stripped = clean.replace(NOISE, " ").replace(/\s+/g, " ").trim();
  const tokens = stripped.split(" ").filter((t) => t.length >= 2);
  const longest = [...tokens].sort((a, b) => b.length - a.length)[0] || "";
  const tries = Array.from(new Set([clean, stripped, longest].filter((s) => s && s.length >= 2)));

  const seen = new Set<string>();
  const out: RadioStation[] = [];
  for (const name of tries) {
    if (out.length >= 8) break; // já achou o suficiente com a estratégia anterior
    let r: RadioStation[] = [];
    try { r = await searchStations({ name, limit, order: "clickcount", reverse: true }); } catch { r = []; }
    for (const s of r) {
      if (!seen.has(s.stationuuid)) { seen.add(s.stationuuid); out.push(s); }
    }
  }
  return out.slice(0, limit);
}

// distância em km (Haversine)
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type NearbyStation = RadioStation & { distance: number };

// busca por raio via GPS: pega estações com geo do país e filtra por Haversine
export async function stationsNearby(
  lat: number,
  lng: number,
  radiusKm: number,
  countrycode = "BR",
): Promise<NearbyStation[]> {
  const data = await searchStations({ countrycode, limit: 1500, order: "clickcount", reverse: true });
  return data
    .filter((s) => s.geo_lat != null && s.geo_long != null)
    .map((s) => ({ ...s, distance: distanceKm(lat, lng, Number(s.geo_lat), Number(s.geo_long)) }))
    .filter((s) => s.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

// registra clique/resolve no radio-browser (fire-and-forget)
export async function countClick(uuid: string): Promise<void> {
  try { await api("/json/url/" + uuid); } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ORION Community Radio Discovery Engine v1.0 — Fase 1 (categorias + CEP).
 * Camada ADITIVA sobre o Radio Mundial: nada acima é alterado. Só descoberta
 * pública (radio-browser tags + CEP por BrasilAPI/ViaCEP). Nenhum scraping.
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface RadioCategory {
  key: string;
  label: string;
  emoji: string;
  /** tags candidatas do radio-browser, tentadas em ordem e mescladas (PT + EN) */
  tags: string[];
  /** true = catálogo mundial (não restringe ao Brasil) */
  global?: boolean;
}

// Categorias do spec mapeadas para tags reais do radio-browser. Como a marcação
// de tags é irregular, cada categoria tenta várias candidatas (PT e EN) e mescla.
export const RADIO_CATEGORIES: RadioCategory[] = [
  { key: "fm",            label: "FM",            emoji: "📻", tags: ["fm"] },
  { key: "am",            label: "AM",            emoji: "📻", tags: ["am"] },
  { key: "web",           label: "Web Rádio",     emoji: "📡", tags: ["webradio", "web radio", "internet radio", "online"] },
  { key: "comunitaria",   label: "Comunitária",   emoji: "🏘️", tags: ["comunitaria", "comunitária", "community radio", "community"] },
  { key: "universitaria", label: "Universitária", emoji: "🎓", tags: ["universitaria", "universitária", "university radio", "college radio"] },
  { key: "publica",       label: "Pública",       emoji: "🏛️", tags: ["publica", "pública", "public radio", "estatal"] },
  { key: "educativa",     label: "Educativa",     emoji: "📚", tags: ["educativa", "educational", "education", "cultura"] },
  { key: "religiosa",     label: "Religiosa",     emoji: "✝️", tags: ["gospel", "religious", "católica", "catolica", "evangélica", "evangelica", "cristã"] },
  { key: "noticias",      label: "Notícias",      emoji: "📰", tags: ["news", "notícias", "noticias", "jornalismo", "talk"] },
  { key: "esportes",      label: "Esportes",      emoji: "⚽", tags: ["sports", "esportes", "futebol", "esporte"] },
  { key: "musica",        label: "Música",        emoji: "🎵", tags: ["music", "música", "musica", "pop", "mpb"] },
  { key: "internacional", label: "Internacional", emoji: "🌎", tags: [], global: true },
];

/**
 * Descobre emissoras de uma categoria. Restringe ao Brasil por padrão (exceto
 * "internacional", que traz o top mundial). Mescla as tags candidatas, deduplica
 * por stationuuid e mantém a priorização HTTPS/clickcount do cleanList.
 */
export async function discoverByCategory(cat: RadioCategory, limit = 60): Promise<RadioStation[]> {
  if (cat.global) return topStations(limit);
  const cc = "BR";
  const seen = new Set<string>();
  const out: RadioStation[] = [];
  for (const tag of cat.tags) {
    if (out.length >= limit) break;
    let r: RadioStation[] = [];
    try { r = await searchStations({ tag, countrycode: cc, limit, order: "clickcount", reverse: true }); } catch { r = []; }
    for (const s of r) if (!seen.has(s.stationuuid)) { seen.add(s.stationuuid); out.push(s); }
  }
  return out.slice(0, limit);
}

export interface CepLocation {
  lat: number | null;
  lng: number | null;
  city: string;
  uf: string;
  bairro: string;
}

/**
 * Resolve um CEP brasileiro em localização, só com fontes PÚBLICAS e gratuitas:
 * BrasilAPI v2 (traz coordenadas quando disponíveis) com fallback ViaCEP
 * (cidade/UF/bairro). Retorna null se o CEP for inválido ou nenhuma fonte
 * responder. Sem chave, CORS-friendly.
 */
export async function cepToLocation(rawCep: string): Promise<CepLocation | null> {
  const cep = (rawCep || "").replace(/\D/g, "");
  if (cep.length !== 8) return null;
  // 1) BrasilAPI v2 — pode conter location.coordinates
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { headers: { Accept: "application/json" } });
    if (r.ok) {
      const j = (await r.json()) as {
        city?: string; state?: string; neighborhood?: string;
        location?: { coordinates?: { latitude?: string | number; longitude?: string | number } };
      };
      const c = j.location?.coordinates ?? {};
      return {
        lat: c.latitude != null && c.latitude !== "" ? Number(c.latitude) : null,
        lng: c.longitude != null && c.longitude !== "" ? Number(c.longitude) : null,
        city: j.city ?? "",
        uf: j.state ?? "",
        bairro: j.neighborhood ?? "",
      };
    }
  } catch { /* tenta o ViaCEP */ }
  // 2) ViaCEP — só cidade/UF/bairro (sem coordenadas)
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { headers: { Accept: "application/json" } });
    if (r.ok) {
      const j = (await r.json()) as { erro?: boolean; localidade?: string; uf?: string; bairro?: string };
      if (!j.erro) return { lat: null, lng: null, city: j.localidade ?? "", uf: j.uf ?? "", bairro: j.bairro ?? "" };
    }
  } catch { /* ignore */ }
  return null;
}
