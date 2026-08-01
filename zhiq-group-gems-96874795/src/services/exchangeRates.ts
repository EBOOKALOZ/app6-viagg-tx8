/**
 * Serviço isolado de cotações em tempo real (Mini Card "Tempo Real").
 *
 * Fonte oficial: ExchangeRate.fun — https://api.exchangerate.fun/latest?base=USD
 * A cotação do dólar em reais vem do campo `rates.BRL`.
 *
 * Cache local de 60 minutos: a API atualiza aproximadamente de hora em hora,
 * então nunca consultamos mais de uma vez por hora — sempre servimos do
 * cache local enquanto ele for válido.
 *
 * Arquitetura preparada para novos ativos (Euro, Libra, Peso Argentino, Ouro,
 * Bitcoin, Ethereum, Solana, Ibovespa, CDI, Selic, IPCA) sem refatoração:
 * basta adicionar uma entrada em `ASSET_REGISTRY` com sua própria função de
 * busca — o componente e o cache já operam por `AssetCode` genérico.
 */

export type AssetCode = "USD" | "EUR" | "GBP" | "ARS" | "XAU" | "BTC" | "ETH" | "SOL" | "IBOV" | "CDI" | "SELIC" | "IPCA";

export interface AssetQuote {
  code: AssetCode;
  name: string;
  /** Valor do ativo em BRL (ou, para índices/taxas, o valor do próprio indicador). */
  value: number;
  /** ISO da data/hora que a fonte informou como referência da cotação. */
  quotedAt: string;
  source: string;
}

export interface ExchangeRatesSnapshot {
  quotes: Partial<Record<AssetCode, AssetQuote>>;
  fetchedAt: string;
}

const EXCHANGE_RATE_FUN_BASE_URL = "https://api.exchangerate.fun";
const CACHE_KEY = "viagg:realtime-exchange:v2";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutos — a API atualiza ~de hora em hora

interface CacheEnvelope {
  snapshot: ExchangeRatesSnapshot;
  cachedAt: number;
}

function readCache(): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed?.snapshot || typeof parsed.cachedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(snapshot: ExchangeRatesSnapshot) {
  try {
    const envelope: CacheEnvelope = { snapshot, cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // localStorage indisponível (modo privado etc.) — segue sem cache persistente
  }
}

export function isCacheValid(envelope: CacheEnvelope | null): boolean {
  if (!envelope) return false;
  return Date.now() - envelope.cachedAt < CACHE_TTL_MS;
}

export function getCachedSnapshot(): ExchangeRatesSnapshot | null {
  const envelope = readCache();
  return envelope?.snapshot ?? null;
}

/**
 * Registro de ativos suportados. Cada entrada sabe buscar seu próprio valor.
 * Adicionar um novo ativo = adicionar uma entrada aqui, sem tocar no restante
 * do serviço, no hook ou no componente.
 */
type AssetFetcher = () => Promise<AssetQuote>;

async function fetchUsdBrl(): Promise<AssetQuote> {
  const res = await fetch(`${EXCHANGE_RATE_FUN_BASE_URL}/latest?base=USD`);
  if (!res.ok) throw new Error(`ExchangeRate.fun respondeu ${res.status}`);

  const data = await res.json();
  const brl = data?.rates?.BRL;
  if (typeof brl !== "number") throw new Error("Campo rates.BRL ausente na resposta");

  // A API retorna `timestamp` (epoch em segundos) e, em alguns casos, `date`
  // (YYYY-MM-DD). Preferimos o timestamp por ser preciso até o segundo.
  const quotedAt = typeof data?.timestamp === "number"
    ? new Date(data.timestamp * 1000).toISOString()
    : data?.date
      ? new Date(data.date).toISOString()
      : new Date().toISOString();

  return {
    code: "USD",
    name: "Dólar Americano",
    value: brl,
    quotedAt,
    source: "ExchangeRate.fun",
  };
}

export const ASSET_REGISTRY: Partial<Record<AssetCode, AssetFetcher>> = {
  USD: fetchUsdBrl,
  // Próximos ativos entram aqui, cada um com seu fetcher próprio:
  // EUR: fetchEurBrl, GBP: fetchGbpBrl, ARS: fetchArsBrl, XAU: fetchGoldBrl,
  // BTC: fetchBtcBrl, ETH: fetchEthBrl, SOL: fetchSolBrl,
  // IBOV: fetchIbovespa, CDI: fetchCdi, SELIC: fetchSelic, IPCA: fetchIpca,
};

/**
 * Busca o snapshot de cotações respeitando o cache de 60 minutos.
 * Retorna o cache imediatamente se ainda for válido; caso contrário, busca
 * na fonte oficial e atualiza o cache. Nunca lança se houver cache disponível
 * — nesse caso retorna o cache marcado como `stale` via `fromCache`.
 */
export async function fetchExchangeRatesSnapshot(
  assets: AssetCode[] = ["USD"],
  options: { forceRefresh?: boolean } = {}
): Promise<{ snapshot: ExchangeRatesSnapshot; fromCache: boolean }> {
  const cached = readCache();

  if (!options.forceRefresh && isCacheValid(cached)) {
    return { snapshot: cached!.snapshot, fromCache: true };
  }

  try {
    const results = await Promise.all(
      assets
        .map((code) => ASSET_REGISTRY[code])
        .filter((fetcher): fetcher is AssetFetcher => !!fetcher)
        .map((fetcher) => fetcher())
    );

    const quotes: ExchangeRatesSnapshot["quotes"] = {};
    for (const quote of results) quotes[quote.code] = quote;

    const snapshot: ExchangeRatesSnapshot = { quotes, fetchedAt: new Date().toISOString() };
    writeCache(snapshot);
    return { snapshot, fromCache: false };
  } catch (err) {
    if (cached) {
      // API indisponível, mas existe cache (mesmo expirado) — nunca deixa o card vazio.
      return { snapshot: cached.snapshot, fromCache: true };
    }
    throw err;
  }
}
