/**
 * /radio — ORION-AUDIO X · Rádio Mundial (Fase 1).
 *
 * Milhares de emissoras reais (radio-browser.info): busca por nome/cidade/país/
 * gênero/idioma, busca por raio via GPS, favoritas + histórico (localStorage),
 * populares (na Viagg via RPC, fallback global). Toca por um <audio> dedicado
 * (streams de terceiros raramente têm CORS, então o EQ do app não se aplica a
 * eles — declarado). Registra reproduções p/ o painel admin (mais ouvidas).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Radio, Search, MapPin, Heart, Play, Pause, Loader2, Square, Volume2,
  Sparkles, Music2, History as HistoryIcon, Flame, Navigation, X, ArrowLeft, Globe,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { forceStopGlobalAudio } from "@/components/GlobalAudioPlayer";
import {
  searchStations, topStations, stationsNearby, countClick,
  type RadioStation, type NearbyStation,
} from "@/lib/radioBrowser";
import {
  playStation, togglePlay, stopRadio, setRadioVolume, subscribeRadio, getRadioState,
  getFavorites, toggleFavorite, isFavorite, getHistory, type RadioState,
} from "@/lib/radioPlayer";

type Tab = "buscar" | "perto" | "favoritas" | "historico" | "populares";
const RADIUS = [5, 10, 25, 50, 100, 250];
const GENRES = ["Gospel", "Rock", "Jazz", "Pop", "Sertanejo", "News", "Lo-fi", "Eletrônica"];
const CITIES = ["São Paulo", "Curitiba", "Rio de Janeiro", "Belo Horizonte"];
const STATIONS = ["CBN", "Jovem Pan", "Band FM", "89.1", "Mix", "Antena 1"];

function useRadio(): RadioState {
  const [st, setSt] = useState<RadioState>(getRadioState());
  useEffect(() => subscribeRadio(setSt), []);
  return st;
}

function StationIcon({ src, className }: { src?: string; className?: string }) {
  const [ok, setOk] = useState(!!src);
  if (!src || !ok) {
    return (
      <div className={cn("flex items-center justify-center bg-white/5 text-orange-300/70", className)}>
        <Radio className="h-1/2 w-1/2" />
      </div>
    );
  }
  return <img src={src} alt="" onError={() => setOk(false)} className={cn("object-cover bg-white/5", className)} />;
}

export default function RadioMundialPage() {
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
  const [favTick, setFavTick] = useState(0);

  const runSearch = useCallback(async (params: Parameters<typeof searchStations>[0], label?: string) => {
    setLoading(true); setError(null);
    try {
      const r = await searchStations({ limit: 80, ...params });
      setResults(r);
      if (r.length === 0) setError(label ? `Nenhuma rádio para "${label}".` : "Nenhuma rádio encontrada.");
    } catch {
      setError("Falha ao buscar rádios. Verifique a conexão e tente de novo.");
    } finally { setLoading(false); }
  }, []);

  // carga inicial: populares do Brasil
  useEffect(() => { runSearch({ countrycode: "BR", order: "clickcount", reverse: true }); }, [runSearch]);

  const loadPopulares = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await supabase.rpc("audio_radio_popular", { p_limit: 40 });
      const viagg = Array.isArray(data) ? (data as RadioStation[]) : [];
      setPopulares(viagg.length >= 6 ? viagg : await topStations(50));
    } catch {
      try { setPopulares(await topStations(50)); } catch { setError("Falha ao carregar populares."); }
    } finally { setLoading(false); }
  }, []);

  const near = useCallback((km: number) => {
    if (!("geolocation" in navigator)) { setError("Geolocalização indisponível neste dispositivo."); return; }
    setLoading(true); setError(null); setRadius(km);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await stationsNearby(pos.coords.latitude, pos.coords.longitude, km, "BR");
          setNearby(r);
          if (r.length === 0) setError(`Nenhuma rádio com geolocalização em ${km} km.`);
        } catch { setError("Falha ao buscar rádios próximas."); }
        finally { setLoading(false); }
      },
      () => { setError("Permita o acesso à localização para usar a busca por raio."); setLoading(false); },
      { timeout: 10000, enableHighAccuracy: false },
    );
  }, []);

  const onTab = (t: Tab) => {
    setTab(t); setError(null);
    if (t === "favoritas") setFavs(getFavorites());
    if (t === "historico") setHist(getHistory());
    if (t === "populares" && populares.length === 0) loadPopulares();
  };

  const listen = useCallback(async (st: RadioStation) => {
    forceStopGlobalAudio();               // pausa a música de fundo do app
    await playStation(st);
    setHist(getHistory());
    try { supabase.rpc("audio_radio_log", { p_station: st as unknown as Record<string, unknown> }); } catch { /* fire-and-forget */ }
    countClick(st.stationuuid);
  }, []);

  const fav = useCallback((st: RadioStation) => {
    toggleFavorite(st); setFavTick((n) => n + 1);
    setFavs(getFavorites());
  }, []);

  const submit = (e: React.FormEvent) => { e.preventDefault(); setTab("buscar"); runSearch({ name: query.trim() }, query.trim()); };

  const list: (RadioStation | NearbyStation)[] = useMemo(() => {
    if (tab === "perto") return nearby;
    if (tab === "favoritas") return favs;
    if (tab === "historico") return hist;
    if (tab === "populares") return populares;
    return results;
  }, [tab, nearby, favs, hist, populares, results]);

  const TABS: [Tab, any, string][] = [
    ["buscar", Search, "Buscar"], ["perto", Navigation, "Perto de mim"],
    ["favoritas", Heart, "Favoritas"], ["historico", HistoryIcon, "Histórico"], ["populares", Flame, "Populares"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a12] via-[#100c1c] to-[#0a0a12] text-white pb-28">
      {/* glow */}
      <div className="pointer-events-none fixed -top-24 left-1/3 h-72 w-72 rounded-full bg-[#FF6A00]/20 blur-3xl" />
      <div className="pointer-events-none fixed bottom-10 right-1/4 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative mx-auto max-w-3xl px-4 py-5">
        {/* HEADER */}
        <div className="flex items-center gap-3">
          <Link to="/mercado" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] shadow-[0_0_22px_-4px_rgba(255,106,0,0.8)]">
            <Radio className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight">Rádio Mundial</h1>
            <p className="text-[11px] text-white/50">Milhares de emissoras ao vivo · ORION-AUDIO X</p>
          </div>
        </div>

        {/* SEARCH */}
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Rádio, cidade, gênero, 89.1…"
              className="w-full rounded-2xl border border-white/10 bg-white/[0.06] py-2.5 pl-9 pr-3 text-sm outline-none backdrop-blur placeholder:text-white/35 focus:border-orange-400/60" />
          </div>
          <button type="submit" className="rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] px-4 text-sm font-bold shadow-[0_0_18px_-4px_rgba(255,106,0,0.7)]">Ir</button>
        </form>

        {/* CHIPS */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {GENRES.map((g) => <Chip key={g} icon={Music2} onClick={() => { setTab("buscar"); runSearch({ tag: g }, g); }}>{g}</Chip>)}
          {STATIONS.map((s) => <Chip key={s} icon={Sparkles} onClick={() => { setTab("buscar"); runSearch({ name: s }, s); }}>{s}</Chip>)}
          {CITIES.map((c) => <Chip key={c} icon={MapPin} onClick={() => { setTab("buscar"); runSearch({ state: c }, c); }}>{c}</Chip>)}
        </div>

        {/* TABS */}
        <div className="mt-4 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => onTab(k)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold backdrop-blur transition-all",
                tab === k ? "bg-gradient-to-r from-[#FF6A00] to-[#FF9A00] border-orange-300/40 text-white shadow-[0_0_16px_-3px_rgba(255,106,0,0.7)]"
                  : "bg-white/[0.04] border-white/10 text-white/55 hover:bg-white/10 hover:text-white/90")}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* RADIUS (aba perto) */}
        {tab === "perto" && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-white/50 flex items-center gap-1"><Navigation className="h-3 w-3" /> Raio:</span>
              {RADIUS.map((km) => (
                <button key={km} onClick={() => near(km)}
                  className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all",
                    radius === km ? "bg-[#FF6A00] border-orange-300/40 text-white" : "bg-white/[0.04] border-white/10 text-white/55 hover:bg-white/10")}>
                  {km} km
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-white/35">Usa o GPS do aparelho e filtra emissoras com geolocalização por distância real.</p>
          </div>
        )}

        {/* STATE */}
        {loading && <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#FF6A00]" /></div>}
        {!loading && error && <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/60">{error}</p>}

        {/* LISTA */}
        {!loading && (
          <div className="mt-4 space-y-2">
            {list.map((st) => {
              const active = radio.station?.stationuuid === st.stationuuid;
              const distance = "distance" in st ? (st as NearbyStation).distance : undefined;
              const faved = isFavorite(st.stationuuid);
              return (
                <div key={st.stationuuid + favTick}
                  className={cn("flex items-center gap-3 rounded-2xl border p-2.5 backdrop-blur transition-all",
                    active ? "border-orange-400/40 bg-orange-500/10 shadow-[0_0_18px_-6px_rgba(255,106,0,0.6)]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]")}>
                  <StationIcon src={st.favicon} className="h-11 w-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{st.name?.trim() || "Sem nome"}</p>
                    <p className="truncate text-[11px] text-white/45">
                      {[st.state, st.country].filter(Boolean).join(" · ")}
                      {st.tags ? ` · ${st.tags.split(",").slice(0, 2).join(", ")}` : ""}
                      {st.bitrate ? ` · ${st.bitrate}kbps` : ""}
                    </p>
                    {distance !== undefined && <p className="text-[10px] font-bold text-orange-300/80">{distance.toFixed(1)} km</p>}
                  </div>
                  <button onClick={() => fav(st)} className={cn("flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                    faved ? "bg-pink-500/20 text-pink-400" : "bg-white/5 text-white/40 hover:text-white/80")}>
                    <Heart className={cn("h-4 w-4", faved && "fill-current")} />
                  </button>
                  <button onClick={() => (active && radio.playing ? togglePlay() : listen(st))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] shadow-[0_0_16px_-4px_rgba(255,106,0,0.7)]">
                    {active && radio.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : active && radio.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
            {list.length === 0 && !error && (
              <p className="py-12 text-center text-sm text-white/35">
                {tab === "favoritas" ? "Nenhuma favorita ainda — toque no ♥ para salvar." :
                 tab === "historico" ? "Seu histórico aparecerá aqui." :
                 tab === "perto" ? "Escolha um raio para buscar rádios perto de você." : "Nada por aqui."}
              </p>
            )}
          </div>
        )}

        {/* nota honesta sobre EQ */}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[10px] text-white/25">
          <Globe className="h-3 w-3" /> Estações e streams fornecidos por radio-browser.info (comunidade aberta).
        </p>
      </div>

      {/* NOW PLAYING (sticky) */}
      {radio.station && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a12]/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
            <StationIcon src={radio.station.favicon} className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{radio.station.name?.trim() || "Rádio"}</p>
              <p className="truncate text-[11px] text-white/45">
                {radio.loading ? "Conectando…" : radio.error ? radio.error : radio.playing ? "▶ Ao vivo" : "Pausado"}
              </p>
            </div>
            <div className="hidden w-28 items-center gap-1.5 sm:flex">
              <Volume2 className="h-4 w-4 text-white/50" />
              <Slider value={[Math.round(radio.volume * 100)]} min={0} max={100} step={1}
                onValueChange={(v) => setRadioVolume((v[0] ?? 90) / 100)} />
            </div>
            <button onClick={togglePlay} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF9A00]">
              {radio.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : radio.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button onClick={stopRadio} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/60 hover:bg-white/10">
              <Square className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, icon: Icon, onClick }: { children: React.ReactNode; icon: any; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-white/60 backdrop-blur transition-all hover:border-orange-400/40 hover:bg-orange-500/10 hover:text-white">
      <Icon className="h-3 w-3" /> {children}
    </button>
  );
}
