/**
 * RadioMundial — Rádio Mundial embutida no ORION Audio Center (ORION-AUDIO X).
 *
 * Vive DENTRO do painel do Audio Center (aba "Rádio"), como parte da Central
 * Multimídia — o usuário busca, favorita e ouve SEM sair da plataforma (o painel
 * é um overlay; a navegação continua por baixo). Estações reais via
 * radio-browser.info; toca pelo radioPlayer (singleton, sobrevive à navegação).
 */
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { RealtimeVisualizer } from "./RealtimeVisualizer";
import {
  Search, MapPin, Heart, Play, Pause, Loader2, Square, Volume2,
  Sparkles, Music2, History as HistoryIcon, Flame, Navigation,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  searchStations, smartSearchStations, topStations, stationsNearby, countClick,
  discoverByCategory, cepToLocation, RADIO_CATEGORIES, makeCustomStation,
  type RadioStation, type NearbyStation,
} from "@/lib/radioBrowser";
import {
  playStation, togglePlay, stopRadio, setRadioVolume, subscribeRadio, getRadioState,
  getFavorites, toggleFavorite, isFavorite, getHistory, pushHistory, getLastStation, type RadioState,
} from "@/lib/radioPlayer";
import { subscribeNowPlaying, getNowPlaying, type NowPlayingTrack } from "@/lib/multimedia/nowPlaying";
import { RadioTvPlayer } from "./RadioTvPlayer";

type Tab = "buscar" | "perto" | "favoritas" | "historico" | "populares";
const RADIUS = [5, 10, 25, 50, 100, 200, 250];
const CHIPS: { label: string; icon: any; run: (r: Runner) => void }[] = [
  { label: "Gospel", icon: Music2, run: (r) => r({ tag: "Gospel" }, "Gospel") },
  { label: "Rock", icon: Music2, run: (r) => r({ tag: "Rock" }, "Rock") },
  { label: "Sertanejo", icon: Music2, run: (r) => r({ tag: "Sertanejo" }, "Sertanejo") },
  { label: "News", icon: Music2, run: (r) => r({ tag: "News" }, "News") },
  { label: "CBN", icon: Sparkles, run: (r) => r({ name: "CBN" }, "CBN") },
  { label: "Jovem Pan", icon: Sparkles, run: (r) => r({ name: "Jovem Pan" }, "Jovem Pan") },
  { label: "Band FM", icon: Sparkles, run: (r) => r({ name: "Band FM" }, "Band FM") },
  { label: "89.1", icon: Sparkles, run: (r) => r({ name: "89.1" }, "89.1") },
  { label: "São Paulo", icon: MapPin, run: (r) => r({ state: "São Paulo" }, "São Paulo") },
  { label: "Curitiba", icon: MapPin, run: (r) => r({ state: "Curitiba" }, "Curitiba") },
];
type Runner = (p: Parameters<typeof searchStations>[0], label?: string) => void;

// Catálogo curado (compartilhado) — emissoras que a plataforma tem no banco.
// Mesclado com o radio-browser para o usuário só buscar e achar.
// supabase.rpc tipado por Database (types.ts vazio) não conhece as RPCs novas;
// usar `as any` garante que a chamada seja montada em runtime sem interferência do TS.
const sbrpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args);

async function curatedSearch(term: string): Promise<RadioStation[]> {
  // 1) busca v2 (frequência/nome/cidade/categoria). Captura o error explicitamente.
  try {
    const { data, error } = await sbrpc("audio_radio_search_v2", { p_term: term || "", p_limit: 60 });
    if (error) console.warn("[radio] v2 falhou, usando v1:", error.message);
    else if (Array.isArray(data)) return data as unknown as RadioStation[];
  } catch (e) { console.warn("[radio] v2 exception:", e); }
  // 2) fallback v1 (sempre existiu) — garante que a busca do catálogo NUNCA fique vazia por erro de RPC
  try {
    const { data } = await sbrpc("audio_radio_curated_search", { p_term: term || "", p_limit: 40 });
    return Array.isArray(data) ? (data as unknown as RadioStation[]) : [];
  } catch (e) { console.warn("[radio] v1 exception:", e); return []; }
}
// busca só no catálogo por categoria+UF (usada pelos chips de categoria)
async function curatedByCategory(catKey: string): Promise<RadioStation[]> {
  try {
    const { data, error } = await sbrpc("audio_radio_search_v2", { p_category: catKey, p_limit: 60 });
    if (error) { console.warn("[radio] categoria falhou:", error.message); return []; }
    return Array.isArray(data) ? (data as unknown as RadioStation[]) : [];
  } catch (e) { console.warn("[radio] categoria exception:", e); return []; }
}
// mescla listas deduplicando por id (curado + radio-browser da mesma emissora colapsam)
function dedupMerge(...lists: RadioStation[][]): RadioStation[] {
  const seen = new Set<string>();
  const out: RadioStation[] = [];
  for (const list of lists) for (const s of list) {
    const key = s.stationuuid || (s.name + "|" + (s.url_resolved || s.url));
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(s);
  }
  return out;
}

// ── Busca UNIFICADA: a mesma barra aceita nome/cidade/frequência OU link ─────
const isUrl = (s: string) => {
  const t = s.trim();
  return /^https?:\/\/\S+/i.test(t) || /^www\.\S+/i.test(t) || /\.(com|br|net|org|fm|am|tv)(\/|$)/i.test(t);
};
// link parece ser o STREAM (áudio) e não o site da emissora?
const looksLikeStream = (url: string) =>
  /\.(mp3|aac|aacp|m3u8?|pls|ogg|opus)([?;#]|$)/i.test(url)
  || /:\d{2,5}\/\S*/.test(url.replace(/^https?:\/\/[^/]*:443\//i, ""))
  || /\/(stream|live|listen|radio|;)/i.test(url);
// "https://www.navegantesfm.com.br/" → "navegantes fm" (termo de busca pelo domínio)
function hostToTerm(url: string): string {
  try {
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = "http://" + u;
    const base = new URL(u).hostname.replace(/^www\./i, "").split(".")[0] || "";
    return base.replace(/[-_]+/g, " ").replace(/(fm|am)$/i, " $1").replace(/\s+/g, " ").trim();
  } catch { return ""; }
}

function useRadio(): RadioState {
  const [st, setSt] = useState<RadioState>(getRadioState());
  useEffect(() => subscribeRadio(setSt), []);
  return st;
}

function Icon({ src }: { src?: string }) {
  const [ok, setOk] = useState(!!src);
  // Sem logo da rádio (ou logo quebrado) → usa o logo do app (Viagg-TX8).
  if (!src || !ok) {
    return (
      <img
        src="/images/viagg-tx8-logo.png"
        alt="Viagg-TX8"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        className="h-9 w-9 shrink-0 rounded-lg bg-white/5 object-contain p-0.5"
      />
    );
  }
  return <img src={src} alt="" onError={() => setOk(false)} className="h-9 w-9 shrink-0 rounded-lg bg-white/5 object-cover" />;
}

export function RadioMundial() {
  const radio = useRadio();
  const [tab, setTab] = useState<Tab>("buscar");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RadioStation[]>([]);
  const [nearby, setNearby] = useState<NearbyStation[]>([]);
  const [populares, setPopulares] = useState<RadioStation[]>([]);
  const [favs, setFavs] = useState<RadioStation[]>([]);
  const [hist, setHist] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState(25);
  const [tick, setTick] = useState(0);
  const [cat, setCat] = useState<string | null>(null);     // categoria ativa (chip)
  const [cep, setCep] = useState("");                         // busca por CEP
  const [cepInfo, setCepInfo] = useState<string | null>(null);
  const [addMsg, setAddMsg] = useState<string | null>(null);  // feedback do fluxo "tocar por link"
  // "Continuar ouvindo": última estação salva em localStorage (sobrevive a fechar o app por dias).
  const [lastStation, setLastStation] = useState<RadioStation | null>(() => getLastStation());
  // ORION-MEDIA-02: música no ar detectada (ICY/Icecast) → player Rádio+TV
  const [npTrack, setNpTrack] = useState<NowPlayingTrack | null>(() => getNowPlaying());
  useEffect(() => subscribeNowPlaying(setNpTrack), []);

  const runSearch = useCallback<Runner>(async (params, label) => {
    setLoading(true); setError(null);
    const term = (params.name || params.tag || params.state || "").trim();
    const tl = term.toLowerCase();
    // o termo é uma CATEGORIA? (ex.: "comunitaria", "gospel", "esportes") → traz a categoria também
    const catMatch = term ? RADIO_CATEGORIES.find((c) =>
      c.key === tl || c.label.toLowerCase() === tl || c.tags.some((t) => t.toLowerCase() === tl)) : undefined;
    // helper: fonte externa (rede) NUNCA pode derrubar a busca — falha vira lista vazia
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    try {
      // 1) CATÁLOGO PRÓPRIO primeiro (rápido; tem as comunitárias) → mostra JÁ.
      const [cur, catCur] = await Promise.all([
        safe(curatedSearch(term)),
        catMatch ? safe(curatedByCategory(catMatch.key)) : Promise.resolve([] as RadioStation[]),
      ]);
      const own = dedupMerge(catCur, cur);
      if (own.length > 0) { setResults(own); setLoading(false); } // mostra o catálogo JÁ
      // 2) radio-browser (rede) ENRIQUECE — resiliente, nunca bloqueia/derruba.
      const [rb, catRb] = await Promise.all([
        safe(params.name ? smartSearchStations(params.name, 60) : searchStations({ limit: 60, ...params })),
        catMatch ? safe(discoverByCategory(catMatch, 40)) : Promise.resolve([] as RadioStation[]),
      ]);
      const merged = dedupMerge(catCur, cur, catRb, rb); // categoria/curado SEMPRE primeiro
      // nunca sobrescreve um resultado bom por vazio (protege contra rede vazia/lenta)
      if (merged.length > 0) setResults(merged);
      else if (own.length === 0) {
        setResults([]);
        setError(label
          ? `"${label}" não encontrada. Tente um nome mais curto, ou busque por cidade/gênero.`
          : "Nenhuma rádio encontrada.");
      }
    } catch {
      setError("Falha ao buscar. Verifique a conexão e tente de novo.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { runSearch({ countrycode: "BR", order: "clickcount", reverse: true }); }, [runSearch]);

  // BUSCA AO DIGITAR (debounce curto): a partir de 2 letras dispara a busca única.
  // O runSearch já mostra o catálogo próprio primeiro (rápido) e enriquece com a rede.
  useEffect(() => {
    const term = query.trim();
    // link (stream/site) NÃO dispara busca por nome ao digitar — o submit/goSearch trata
    if (term.length < 2 || isUrl(term)) return;
    const id = setTimeout(() => {
      setTab("buscar"); setCat(null);
      runSearch({ name: term }, term);
    }, 250);
    return () => clearTimeout(id);
  }, [query, runSearch]);

  const loadPopulares = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await supabase.rpc("audio_radio_popular", { p_limit: 40 });
      const v = Array.isArray(data) ? (data as RadioStation[]) : [];
      setPopulares(v.length >= 6 ? v : await topStations(40));
    } catch {
      try { setPopulares(await topStations(40)); } catch { setError("Falha ao carregar populares."); }
    } finally { setLoading(false); }
  }, []);

  const near = useCallback((km: number) => {
    if (!("geolocation" in navigator)) { setError("Geolocalização indisponível."); return; }
    setLoading(true); setError(null); setRadius(km);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await stationsNearby(pos.coords.latitude, pos.coords.longitude, km, "BR");
          setNearby(r);
          if (r.length === 0) setError(`Nenhuma rádio com geo em ${km} km.`);
        } catch { setError("Falha ao buscar próximas."); }
        finally { setLoading(false); }
      },
      () => { setError("Permita a localização para o raio."); setLoading(false); },
      { timeout: 10000 },
    );
  }, []);

  // Descoberta por categoria (comunitária, universitária, gospel, esportes…)
  const runCategory = useCallback(async (key: string) => {
    const c = RADIO_CATEGORIES.find((x) => x.key === key);
    if (!c) return;
    setTab("buscar"); setCat(key); setLoading(true); setError(null);
    try {
      const [rb, cur] = await Promise.all([discoverByCategory(c, 60), curatedByCategory(c.key)]);
      const r = dedupMerge(cur, rb);
      setResults(r);
      if (r.length === 0) setError(`Nenhuma rádio de "${c.label}" encontrada agora. Tente outra categoria.`);
    } catch {
      setError("Falha ao descobrir emissoras dessa categoria.");
    } finally { setLoading(false); }
  }, []);

  // Descoberta por CEP: BrasilAPI/ViaCEP → raio (se houver coordenadas) ou UF
  const searchByCep = useCallback(async (km: number) => {
    const raw = cep.trim();
    if (raw.replace(/\D/g, "").length !== 8) { setError("Digite um CEP válido (8 dígitos)."); return; }
    setTab("perto"); setLoading(true); setError(null); setCepInfo(null); setRadius(km);
    try {
      const loc = await cepToLocation(raw);
      if (!loc) { setError("CEP não encontrado nas bases públicas."); return; }
      const onde = [loc.bairro, loc.city, loc.uf].filter(Boolean).join(" · ");
      if (loc.lat != null && loc.lng != null) {
        const r = await stationsNearby(loc.lat, loc.lng, km, "BR");
        setNearby(r);
        setCepInfo(`📍 ${onde} — ${r.length} em ${km}km`);
        if (r.length === 0) setError(`Nenhuma rádio com geo em ${km} km de ${loc.city || "seu CEP"}.`);
      } else {
        // sem coordenadas no CEP → cai para busca por estado (UF)
        const r = await searchStations({ state: loc.uf, countrycode: "BR", limit: 60 });
        setNearby(r as NearbyStation[]);
        setCepInfo(`📍 ${onde} — por estado (CEP sem coordenadas)`);
        if (r.length === 0) setError(`Nenhuma rádio encontrada para ${loc.uf}.`);
      }
    } catch {
      setError("Falha ao buscar por CEP.");
    } finally { setLoading(false); }
  }, [cep]);

  const onTab = (t: Tab) => {
    setTab(t); setError(null);
    if (t === "favoritas") setFavs(getFavorites());
    if (t === "historico") setHist(getHistory());
    if (t === "populares" && populares.length === 0) loadPopulares();
  };

  const listen = useCallback(async (st: RadioStation) => {
    setLastStation(st);   // vira a "última estação" (o radioPlayer também salva no localStorage)
    await playStation(st); // radioPlayer dispara a pausa da música de fundo
    setHist(getHistory());
    try { supabase.rpc("audio_radio_log", { p_station: st as unknown as Record<string, unknown> }); } catch { /* fire-and-forget */ }
    countClick(st.stationuuid);
  }, []);

  const fav = useCallback((st: RadioStation) => { toggleFavorite(st); setTick((n) => n + 1); setFavs(getFavorites()); }, []);

  // ADICIONAR/TOCAR por link: toca na hora e salva no catálogo (todos passam a achar).
  const addMyRadio = useCallback(async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!/^https?:\/\/.+/i.test(url)) { setAddMsg("Cole um link válido (http:// ou https://)."); return; }
    const derivado = hostToTerm(url);
    const nome = derivado ? derivado.replace(/\b\w/g, (c) => c.toUpperCase()) : "Minha rádio";
    setAddMsg("Testando o link…");
    const st = makeCustomStation(nome, url);
    try {
      await playStation(st);                 // toca JÁ (o ouvinte não espera aprovação p/ ouvir)
      // playStation NÃO lança em falha (só seta error no estado) — sem este guard,
      // link de SITE era dado como "tocando" e ia p/ o catálogo sem som (caso Navegantes)
      const now = getRadioState();
      if (now.error || !now.playing) throw new Error(now.error || "stream não tocou");
      pushHistory(st);
      // SUGERE para o catálogo público → vai para a FILA DE APROVAÇÃO (nunca publica direto).
      // Só admin publica. A rádio fica no histórico local do usuário (ele ouve quando quiser).
      try {
        const { data, error: rpcErr } = await sbrpc("audio_radio_sugerir", { p: {
          name: nome, stream_url: url, city: "", state: "",
          tags: "sugerida pelo ouvinte",
        } });
        if (rpcErr) throw rpcErr;
        const r = data as { ja_existe?: boolean; duplicada?: boolean; msg?: string } | null;
        setAddMsg("✓ Tocando! " + (r?.msg || "Sugestão enviada para aprovação."));
      } catch (err) {
        const m = String((err as Error)?.message || "");
        setAddMsg(m.includes("autenticação") || m.includes("requer login")
          ? "✓ Tocando! Entre na sua conta para sugerir a rádio ao catálogo."
          : m.includes("limite") || m.includes("aguardando")
            ? "✓ Tocando! " + m
            : "✓ Tocando! (salva no seu histórico; não consegui enviar a sugestão agora.)");
      }
      setResults((prev) => [st, ...prev]); setError(null);
    } catch {
      setAddMsg(looksLikeStream(url)
        ? "Não consegui tocar esse link. Confira o endereço do stream."
        : "Esse link parece o SITE da emissora, não o stream (áudio). Procure na página dela o link \"ouça ao vivo\" e cole aqui.");
    }
  }, []);

  // BUSCA UNIFICADA (barra única): nome/cidade/frequência OU link (stream/site)
  const goSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setTab("buscar"); setCat(null); setAddMsg(null);
    if (!isUrl(q)) { runSearch({ name: q }, q); return; }
    if (looksLikeStream(q)) { await addMyRadio(q); return; }   // link de stream → toca e cadastra
    // link de SITE → busca pelo nome derivado do domínio; o card ainda oferece tocar direto
    const term = hostToTerm(q);
    if (term) {
      setAddMsg(`🔎 Esse link parece o site da emissora — busquei por "${term}". Não apareceu? Toque no botão abaixo para tentar o link direto.`);
      runSearch({ name: term }, term);
    } else {
      await addMyRadio(q);
    }
  }, [runSearch, addMyRadio]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); goSearch(query); };

  const list: (RadioStation | NearbyStation)[] = useMemo(() => (
    tab === "perto" ? nearby : tab === "favoritas" ? favs : tab === "historico" ? hist : tab === "populares" ? populares : results
  ), [tab, nearby, favs, hist, populares, results]);

  // Aba "Buscar" removida: a barra + botão "Buscar" já fazem a busca (resultados = view padrão).
  const TABS: [Tab, any][] = [["perto", Navigation], ["favoritas", Heart], ["historico", HistoryIcon], ["populares", Flame]];
  const TAB_LABEL: Record<Tab, string> = { buscar: "Buscar", perto: "Perto", favoritas: "Favoritas", historico: "Histórico", populares: "Populares" };

  return (
    <div className="space-y-2.5">
      {/* ═══ PLAYER RÁDIO+TV — assume quando a música no ar é detectada ═══ */}
      {radio.station && npTrack && <RadioTvPlayer stations={list as RadioStation[]} />}

      {/* NOW PLAYING (compacto) — sem música detectada, mantém a tela atual */}
      {radio.station && !npTrack && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 p-2">
          <Icon src={radio.station.favicon} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-white">{radio.station.name?.trim() || "Rádio"}</p>
            <p className="truncate text-[9px] text-white/50">{radio.loading ? "Conectando…" : radio.error ? "Stream indisponível" : radio.playing ? (radio.eqActive ? "▶ Ao vivo · 🎚 EQ ativo" : "▶ Ao vivo") : "Pausado"}</p>
          </div>
          
          {/* Visualizador Matrix Compacto (Web Audio API / Analyser) */}
          {radio.playing && (
            <RealtimeVisualizer />
          )}

          {(() => {
            const faved = isFavorite(radio.station.stationuuid);
            return (
              <button
                onClick={() => fav(radio.station!)}
                className={cn(
                  "flex shrink-0 h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-95",
                  faved ? "bg-rose-500/20 text-rose-400" : "bg-white/5 text-white/60 hover:text-rose-300"
                )}
                title={faved ? "Remover das favoritas" : "Salvar nas favoritas"}
                aria-label={faved ? "Remover das favoritas" : "Salvar nas favoritas"}
                aria-pressed={faved}
              >
                <Heart className={cn("h-3.5 w-3.5", faved && "fill-current")} />
              </button>
            );
          })()}
          <button
            onClick={togglePlay}
            title={radio.playing ? "Pausar" : "Tocar"}
            aria-label={radio.playing ? "Pausar" : "Tocar"}
            className="flex shrink-0 h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] text-white transition-transform active:scale-95"
          >
            {radio.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : radio.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={stopRadio}
            title="Parar e desligar a rádio"
            aria-label="Parar rádio"
            className="flex shrink-0 h-8 items-center gap-1 rounded-lg bg-red-500/15 px-2 text-red-300 transition-colors hover:bg-red-500/25 active:scale-95"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span className="text-[10px] font-bold">Parar</span>
          </button>
        </div>
      )}
      {radio.station && !npTrack && (
        <div className="flex items-center gap-2 px-1">
          <Volume2 className="h-3.5 w-3.5 text-white/40" />
          <Slider value={[Math.round(radio.volume * 100)]} min={0} max={100} step={1} onValueChange={(v) => setRadioVolume((v[0] ?? 90) / 100)} />
        </div>
      )}

      {/* ═══ BARRA DE PESQUISA — encontre sua rádio de preferência ═══ */}
      <form onSubmit={submit} className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400/80" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, cidade ou link do site da rádio…"
            aria-label="Pesquisar rádio"
            className="w-full rounded-xl border border-emerald-500/30 bg-white/[0.07] py-2.5 pl-9 pr-2 text-[13px] font-medium text-white outline-none transition-all placeholder:text-white/40 focus:border-emerald-400/70 focus:bg-white/[0.1] focus:shadow-[0_0_16px_-6px_rgba(16,185,129,0.7)]"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-1 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 px-3.5 text-[12px] font-black text-white shadow-[0_0_14px_-4px_rgba(16,185,129,0.75)] active:scale-95"
        >
          {isUrl(query)
            ? <><Play className="h-3.5 w-3.5" /> Tocar</>
            : <><Search className="h-3.5 w-3.5" /> Buscar</>}
        </button>
      </form>

      {/* CHIPS (atalhos de gênero/emissora/cidade) */}
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((c) => (
          <button key={c.label} onClick={() => { setTab("buscar"); setCat(null); c.run(runSearch); }}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-white/60 hover:border-orange-400/40 hover:text-white">
            <c.icon className="h-2.5 w-2.5" /> {c.label}
          </button>
        ))}
      </div>

      {/* CATEGORIAS — Discovery Engine (comunitária, universitária, pública…) */}
      <div>
        <p className="mb-1 flex items-center gap-1 px-0.5 text-[9px] font-bold uppercase tracking-wider text-white/35">
          <Sparkles className="h-2.5 w-2.5 text-orange-300/70" /> Categorias
        </p>
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-0.5">
          {RADIO_CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => runCategory(c.key)}
              className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all",
                cat === c.key ? "bg-gradient-to-r from-[#FF6A00] to-[#FF9A00] border-orange-300/40 text-white" : "border-white/10 bg-white/[0.04] text-white/60 hover:border-orange-400/40 hover:text-white")}>
              <span className="text-[11px] leading-none">{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {TABS.map(([k, I]) => (
          <button key={k} onClick={() => onTab(k)}
            className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-all",
              tab === k ? "bg-gradient-to-r from-[#FF6A00] to-[#FF9A00] border-orange-300/40 text-white" : "bg-white/[0.04] border-white/10 text-white/50 hover:text-white")}>
            <I className="h-3 w-3" /> {TAB_LABEL[k]}
          </button>
        ))}
      </div>

      {/* PERTO — por CEP (fonte pública) ou GPS */}
      {tab === "perto" && (
        <div className="space-y-1.5">
          <form onSubmit={(e) => { e.preventDefault(); searchByCep(radius); }} className="flex gap-1.5">
            <div className="relative flex-1">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-300/80" />
              <input
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                inputMode="numeric"
                maxLength={9}
                placeholder="Buscar por CEP (ex.: 89010-000)"
                aria-label="Buscar rádios por CEP"
                className="w-full rounded-xl border border-orange-500/30 bg-white/[0.07] py-2 pl-9 pr-2 text-[13px] font-medium text-white outline-none transition-all placeholder:text-white/40 focus:border-orange-400/70 focus:bg-white/[0.1]"
              />
            </div>
            <button type="submit" className="flex items-center gap-1 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] px-3.5 text-[12px] font-black text-white active:scale-95">
              <Search className="h-3.5 w-3.5" /> Buscar
            </button>
          </form>
          {cepInfo && <p className="rounded-lg border border-orange-400/20 bg-orange-500/5 px-2 py-1 text-[10px] font-bold text-orange-200/80">{cepInfo}</p>}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-bold text-white/40">Raio:</span>
            {RADIUS.map((km) => (
              <button key={km} onClick={() => (cep.replace(/\D/g, "").length === 8 ? searchByCep(km) : near(km))}
                className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", radius === km ? "bg-[#FF6A00] border-orange-300/40 text-white" : "bg-white/[0.04] border-white/10 text-white/50")}>
                {km}km
              </button>
            ))}
          </div>
          <p className="px-0.5 text-[9px] text-white/30">Toque num raio para usar seu GPS — ou digite um CEP acima e o raio busca a partir dele.</p>
        </div>
      )}

      {/* CONTINUAR OUVINDO — última estação salva (volta mesmo após dias fechado) */}
      {tab === "buscar" && !radio.station && lastStation && (
        <button
          onClick={() => { listen(lastStation); }}
          className="flex w-full items-center gap-2 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.12] to-transparent px-2.5 py-2 text-left transition-all hover:from-emerald-500/[0.18] active:scale-[0.99]"
        >
          <Icon src={lastStation.favicon} />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300/80">Continuar ouvindo</p>
            <p className="truncate text-[12px] font-bold text-white">{lastStation.name?.trim() || "Sua rádio"}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 text-white shadow">
            <Play className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {/* ESTADO */}
      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#FF6A00]" /></div>}
      {!loading && error && <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-[11px] text-white/55">{error}</p>}

      {/* LISTA */}
      {!loading && (
        <div className="space-y-1.5">
          {list.map((st) => {
            const active = radio.station?.stationuuid === st.stationuuid;
            const distance = "distance" in st ? (st as NearbyStation).distance : undefined;
            const faved = isFavorite(st.stationuuid);
            return (
              <div key={st.stationuuid + tick}
                className={cn("flex items-center gap-2 rounded-xl border p-1.5", active ? "border-orange-400/40 bg-orange-500/10" : "border-white/10 bg-white/[0.03]")}>
                <Icon src={st.favicon} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-white">{st.name?.trim() || "Sem nome"}</p>
                  <p className="truncate text-[9px] text-white/45">
                    {[st.state, st.country].filter(Boolean).join(" · ")}{st.bitrate ? ` · ${st.bitrate}kbps` : ""}
                    {distance !== undefined ? ` · ${distance.toFixed(0)}km` : ""}
                  </p>
                </div>
                <button onClick={() => fav(st)} className={cn("flex h-7 w-7 items-center justify-center rounded-lg", faved ? "bg-pink-500/20 text-pink-400" : "bg-white/5 text-white/40")}>
                  <Heart className={cn("h-3.5 w-3.5", faved && "fill-current")} />
                </button>
                <button onClick={() => (active && radio.playing ? togglePlay() : listen(st))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] text-white">
                  {active && radio.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active && radio.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
          {list.length === 0 && (
            tab === "buscar" ? (
              // Não achou nos catálogos → oferece ADICIONAR a rádio por link (resolve emissoras locais)
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-center">
                <p className="text-[11px] font-bold text-white/70">
                  {query.trim() ? `Não achamos "${query.trim()}" nas rádios cadastradas.` : "Nenhuma rádio encontrada."}
                </p>
                <div className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-2">
                  <p className="text-[12px] font-black leading-snug text-emerald-200">
                    📻 Sua emissora favorita não apareceu na lista?
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold text-emerald-100/85">
                    Cole o link do stream dela na busca acima 👆 — ela toca na hora e fica cadastrada.
                  </p>
                </div>
                {isUrl(query) && (
                  <button onClick={() => addMyRadio(query)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 px-3 py-2 text-[12px] font-black text-white active:scale-95">
                    <Play className="h-3.5 w-3.5" /> Tocar este link agora
                  </button>
                )}
                {addMsg && <p className="mt-1.5 text-[10px] font-bold text-emerald-300">{addMsg}</p>}
              </div>
            ) : (
              <p className="py-6 text-center text-[11px] text-white/35">
                {tab === "favoritas" ? "Toque no ♥ para salvar favoritas." : tab === "historico" ? "Seu histórico aparecerá aqui." : "Escolha um raio."}
              </p>
            )
          )}
        </div>
      )}
      <p className="pt-1 text-center text-[8px] text-white/25">Estações por radio-browser.info · o EQ atua no áudio do app (streams externos sem CORS não passam pelo EQ).</p>
    </div>
  );
}
