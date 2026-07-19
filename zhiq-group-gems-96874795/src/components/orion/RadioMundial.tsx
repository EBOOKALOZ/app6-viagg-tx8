/**
 * RadioMundial — Rádio Mundial embutida no ORION Audio Center (ORION-AUDIO X).
 *
 * Vive DENTRO do painel do Audio Center (aba "Rádio"), como parte da Central
 * Multimídia — o usuário busca, favorita e ouve SEM sair da plataforma (o painel
 * é um overlay; a navegação continua por baixo). Estações reais via
 * radio-browser.info; toca pelo radioPlayer (singleton, sobrevive à navegação).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Radio, Search, MapPin, Heart, Play, Pause, Loader2, Square, Volume2,
  Sparkles, Music2, History as HistoryIcon, Flame, Navigation,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  searchStations, smartSearchStations, topStations, stationsNearby, countClick,
  type RadioStation, type NearbyStation,
} from "@/lib/radioBrowser";
import {
  playStation, togglePlay, stopRadio, setRadioVolume, subscribeRadio, getRadioState,
  getFavorites, toggleFavorite, isFavorite, getHistory, type RadioState,
} from "@/lib/radioPlayer";

type Tab = "buscar" | "perto" | "favoritas" | "historico" | "populares";
const RADIUS = [5, 10, 25, 50, 100, 250];
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

function useRadio(): RadioState {
  const [st, setSt] = useState<RadioState>(getRadioState());
  useEffect(() => subscribeRadio(setSt), []);
  return st;
}

function Icon({ src }: { src?: string }) {
  const [ok, setOk] = useState(!!src);
  if (!src || !ok) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-orange-300/70">
        <Radio className="h-4 w-4" />
      </div>
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

  const runSearch = useCallback<Runner>(async (params, label) => {
    setLoading(true); setError(null);
    try {
      // busca por nome → tolerante (tira "rádio/fm/am", tenta o termo distintivo)
      const r = params.name
        ? await smartSearchStations(params.name, 60)
        : await searchStations({ limit: 60, ...params });
      setResults(r);
      if (r.length === 0) {
        setError(label
          ? `"${label}" não encontrada na base aberta de rádios. Tente um nome mais curto, ou busque por cidade/gênero.`
          : "Nenhuma rádio encontrada.");
      }
    } catch {
      setError("Falha ao buscar. Verifique a conexão e tente de novo.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { runSearch({ countrycode: "BR", order: "clickcount", reverse: true }); }, [runSearch]);

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

  const onTab = (t: Tab) => {
    setTab(t); setError(null);
    if (t === "favoritas") setFavs(getFavorites());
    if (t === "historico") setHist(getHistory());
    if (t === "populares" && populares.length === 0) loadPopulares();
  };

  const listen = useCallback(async (st: RadioStation) => {
    await playStation(st); // radioPlayer dispara a pausa da música de fundo
    setHist(getHistory());
    try { supabase.rpc("audio_radio_log", { p_station: st as unknown as Record<string, unknown> }); } catch { /* fire-and-forget */ }
    countClick(st.stationuuid);
  }, []);

  const fav = useCallback((st: RadioStation) => { toggleFavorite(st); setTick((n) => n + 1); setFavs(getFavorites()); }, []);
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTab("buscar"); runSearch({ name: query.trim() }, query.trim()); };

  const list: (RadioStation | NearbyStation)[] = useMemo(() => (
    tab === "perto" ? nearby : tab === "favoritas" ? favs : tab === "historico" ? hist : tab === "populares" ? populares : results
  ), [tab, nearby, favs, hist, populares, results]);

  const TABS: [Tab, any][] = [["buscar", Search], ["perto", Navigation], ["favoritas", Heart], ["historico", HistoryIcon], ["populares", Flame]];
  const TAB_LABEL: Record<Tab, string> = { buscar: "Buscar", perto: "Perto", favoritas: "Favoritas", historico: "Histórico", populares: "Populares" };

  return (
    <div className="space-y-2.5">
      {/* NOW PLAYING (compacto) */}
      {radio.station && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 p-2">
          <Icon src={radio.station.favicon} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-white">{radio.station.name?.trim() || "Rádio"}</p>
            <p className="truncate text-[9px] text-white/50">{radio.loading ? "Conectando…" : radio.error ? "Stream indisponível" : radio.playing ? "▶ Ao vivo" : "Pausado"}</p>
          </div>
          <button onClick={togglePlay} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] text-white">
            {radio.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : radio.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button onClick={stopRadio} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/60"><Square className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {radio.station && (
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
            placeholder="Pesquise sua rádio…"
            aria-label="Pesquisar rádio"
            className="w-full rounded-xl border border-emerald-500/30 bg-white/[0.07] py-2.5 pl-9 pr-2 text-[13px] font-medium text-white outline-none transition-all placeholder:text-white/40 focus:border-emerald-400/70 focus:bg-white/[0.1] focus:shadow-[0_0_16px_-6px_rgba(16,185,129,0.7)]"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-1 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 px-3.5 text-[12px] font-black text-white shadow-[0_0_14px_-4px_rgba(16,185,129,0.75)] active:scale-95"
        >
          <Search className="h-3.5 w-3.5" /> Buscar
        </button>
      </form>

      {/* CHIPS */}
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((c) => (
          <button key={c.label} onClick={() => { setTab("buscar"); c.run(runSearch); }}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-white/60 hover:border-orange-400/40 hover:text-white">
            <c.icon className="h-2.5 w-2.5" /> {c.label}
          </button>
        ))}
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

      {/* RAIO */}
      {tab === "perto" && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-bold text-white/40">Raio:</span>
          {RADIUS.map((km) => (
            <button key={km} onClick={() => near(km)}
              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", radius === km ? "bg-[#FF6A00] border-orange-300/40 text-white" : "bg-white/[0.04] border-white/10 text-white/50")}>
              {km}km
            </button>
          ))}
        </div>
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
          {list.length === 0 && !error && (
            <p className="py-6 text-center text-[11px] text-white/35">
              {tab === "favoritas" ? "Toque no ♥ para salvar favoritas." : tab === "historico" ? "Seu histórico aparecerá aqui." : tab === "perto" ? "Escolha um raio." : "Nada por aqui."}
            </p>
          )}
        </div>
      )}
      <p className="pt-1 text-center text-[8px] text-white/25">Estações por radio-browser.info · o EQ atua no áudio do app (streams externos sem CORS não passam pelo EQ).</p>
    </div>
  );
}
