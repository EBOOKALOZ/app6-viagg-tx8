// ── VIAGG-TX8™ — Solicitar Corrida — Mapa Inteligente com IA ─────────────────
// Layout: mapa em tela cheia + painel inferior flutuante (estilo Uber/99)

import { useState, useEffect, useCallback, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, ChevronLeft, Locate, BrainCircuit, Car, Bike, Package, Truck,
  Check, Phone, MessageCircle, Share2, Shield, ArrowRight,
  Send, Loader2, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { ViaggMap, LocateButton } from "@/components/map/ViaggMap";
import { getCurrentPosition, reverseGeocode, autocomplete } from "@/lib/map/GeoLocationService";
import { getRouteOptions, estimatePrice } from "@/lib/map/RouteService";
import {
  getMockDriversNearby, interpretNaturalLanguageAddress,
  answerRideQuestion, generateMapInsights,
} from "@/lib/map/AIMapService";
import { EventService } from "@/lib/events/EventService";
import type { LatLng, MapAddress, RouteOption, PricePrediction, DriverMarker, AIMapInsight } from "@/lib/map/types";
import viaggLogo from "@/assets/logo.png";

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_CENTER: LatLng = { lat: -15.7942, lng: -47.8825 };

const SERVICE_TYPES = [
  { id: "mototaxi",  label: "Moto Táxi",  icon: Bike,    color: "#FF6A00" },
  { id: "motorista", label: "Motorista",  icon: Car,     color: "#F59E0B" },
  { id: "taxi",      label: "Táxi",       icon: Car,     color: "#22C55E" },
  { id: "motoboy",   label: "Motoboy",    icon: Bike,    color: "#EF4444" },
  { id: "entrega",   label: "Entrega",    icon: Package, color: "#8B5CF6" },
  { id: "frete",     label: "Frete",      icon: Truck,   color: "#06B6D4" },
] as const;

type Step = "map" | "searching" | "found" | "riding";

// ── Debounce ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}

// ── Autocomplete input ────────────────────────────────────────────────────────

function AddressInput({
  placeholder, value, onChange, onSelect, dotColor,
}: {
  placeholder: string; value: string;
  onChange: (v: string) => void;
  onSelect: (addr: MapAddress) => void;
  dotColor: string;
}) {
  const [suggestions, setSuggestions] = useState<MapAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(value, 420);

  useEffect(() => {
    if (debounced.length < 3) { setSuggestions([]); return; }
    setLoading(true);
    autocomplete(debounced).then((res) => { setSuggestions(res.slice(0, 5)); setLoading(false); });
  }, [debounced]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 bg-[#1a1f28] border border-white/10 rounded-2xl px-3 py-2.5">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: dotColor }} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm bg-transparent text-white placeholder:text-[#A7B0BE] focus:outline-none"
        />
        {loading && <Loader2 className="w-4 h-4 text-[#A7B0BE] animate-spin shrink-0" />}
        {!loading && value && (
          <button onClick={() => { onChange(""); setSuggestions([]); }}>
            <X className="w-3.5 h-3.5 text-[#A7B0BE]" />
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-[#1B1F24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button key={i}
              onClick={() => { onSelect(s); setSuggestions([]); onChange(s.formattedAddress.split(",")[0]); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0">
              <MapPin className="w-3.5 h-3.5 text-[#A7B0BE] shrink-0" />
              <span className="truncate text-white text-xs">{s.formattedAddress}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Assistente IA ─────────────────────────────────────────────────────────────

function AIAssistant({ context }: { context: Parameters<typeof answerRideQuestion>[1] }) {
  const [q, setQ]           = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!q.trim()) return;
    setLoading(true);
    setAnswer(await answerRideQuestion(q, context));
    setLoading(false);
  }

  return (
    <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-2xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
          <img src={viaggLogo} alt="IA" className="w-full h-full object-cover" />
        </div>
        <span className="text-xs font-bold text-indigo-300">Assistente IA VIAGG</span>
      </div>
      {answer && (
        <div className="text-xs text-indigo-100 mb-2 bg-indigo-800/30 rounded-xl p-2.5 leading-relaxed">{answer}</div>
      )}
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder='"Tem trânsito?" "Quanto vou pagar?" "Vale esperar?"'
          className="flex-1 text-xs bg-[#2A3038] border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-[#A7B0BE] focus:outline-none focus:border-indigo-500/50"
        />
        <button onClick={ask} disabled={loading || !q.trim()}
          className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Send className="w-3.5 h-3.5 text-white" />}
        </button>
      </div>
    </div>
  );
}

// ── Card de motorista ─────────────────────────────────────────────────────────

function DriverCard({ driver, selected, onSelect }: {
  driver: DriverMarker; selected: boolean; onSelect: () => void;
}) {
  const color = { mototaxi: "#FF6A00", motoboy: "#EF4444", motorista: "#F59E0B", taxi: "#22C55E" }[driver.type] ?? "#6B7280";
  return (
    <button onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
        selected ? "bg-[#FF6A00]/15 border-[#FF6A00]/50" : "bg-[#1a1f28] border-white/10 hover:border-white/20"
      }`}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-sm shrink-0"
        style={{ background: color }}>
        {driver.name.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-white truncate">{driver.name}</span>
          {selected && <Check className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />}
        </div>
        <div className="flex gap-2 text-[11px] text-[#A7B0BE] mt-0.5">
          <span>⭐ {driver.rating.toFixed(1)}</span>
          <span>🏁 {driver.trips}</span>
          <span className="truncate">{driver.vehicle}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-black" style={{ color }}>{driver.distanceKm.toFixed(1)}km</div>
        <div className="text-[11px] text-[#A7B0BE]">{driver.etaMin}min</div>
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export default function SolicitarCorrida() {
  const navigate = useNavigate();
  const [step, setStep]           = useState<Step>("map");
  const [panelOpen, setPanelOpen] = useState(true); // painel inferior expandido

  // Localização
  const [center,      setCenter]      = useState<LatLng>(DEFAULT_CENTER);
  const [origin,      setOrigin]      = useState<LatLng | undefined>();
  const [destination, setDestination] = useState<LatLng | undefined>();
  const [originText,  setOriginText]  = useState("");
  const [destText,    setDestText]    = useState("");
  const [locating,    setLocating]    = useState(false);

  // Serviço / rota / preço
  const [service,       setService]       = useState("mototaxi");
  const [routes,        setRoutes]        = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | undefined>();
  const [price,         setPrice]         = useState<PricePrediction | undefined>();

  // Motoristas e IA
  const [drivers,        setDrivers]        = useState<DriverMarker[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverMarker | undefined>();
  const [insights,       setInsights]       = useState<AIMapInsight[]>([]);
  const [aiSearch,       setAiSearch]       = useState("");
  const [aiSearching,    setAiSearching]    = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);

  // ── Auto-localizar via GPS do dispositivo (nunca via IP de internet) ─────────
  const locateUser = useCallback(async () => {
    setLocating(true);
    try {
      const pos  = await getCurrentPosition();           // GPS real do dispositivo
      const addr = await reverseGeocode(pos);            // endereço via coordenadas GPS
      setCenter(pos);
      setOrigin(pos);
      setOriginText(addr.formattedAddress.split(",").slice(0, 2).join(", "));
    } catch {
      // GPS negado/indisponível — usuário digita manualmente
      // NÃO usa IP de internet como fallback (IP ≠ localização física)
    }
    setLocating(false);
  }, []);

  useEffect(() => { locateUser(); }, []);

  // ── Calcular rotas ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!origin || !destination) return;
    getRouteOptions(origin, destination).then((opts) => {
      setRoutes(opts);
      setSelectedRoute(opts[0]);
      setPrice(estimatePrice(opts[0]?.distanceKm ?? 5, opts[0]?.durationMin ?? 15, service));
    });
  }, [origin, destination, service]);

  // ── Motoristas e insights ────────────────────────────────────────────────────
  useEffect(() => { setDrivers(getMockDriversNearby(center, 8)); }, [center]);
  useEffect(() => {
    generateMapInsights(drivers.length, 6, "Brasília").then(setInsights);
  }, [drivers.length]);

  // ── Busca por linguagem natural ──────────────────────────────────────────────
  async function handleAISearch() {
    if (!aiSearch.trim()) return;
    setAiSearching(true);
    const addr = await interpretNaturalLanguageAddress(aiSearch, "Brasília");
    if (addr) { setDestination(addr.latLng); setCenter(addr.latLng); setDestText(addr.formattedAddress.split(",")[0]); }
    setAiSearching(false);
    setAiSearch("");
  }

  // ── Solicitar ────────────────────────────────────────────────────────────────
  async function handleSearch() {
    if (!origin || !destination) return;
    setStep("searching");
    setSearchProgress(0);
    EventService.ride.requested(`ride-${Date.now()}`, "Brasília", { service });
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12 + 3;
      setSearchProgress(Math.min(p, 100));
      if (p >= 100) { clearInterval(iv); setTimeout(() => setStep("found"), 600); }
    }, 350);
  }

  function handleAcceptRide() {
    const driver = selectedDriver ?? drivers[0];
    setSelectedDriver(driver);
    setStep("riding");
    EventService.ride.driverAssigned(`ride-${Date.now()}`, driver?.id ?? "");
  }

  async function handleMapClick(ll: LatLng) {
    if (!origin) {
      setOrigin(ll); const a = await reverseGeocode(ll);
      setOriginText(a.formattedAddress.split(",").slice(0, 2).join(", "));
    } else {
      setDestination(ll); setCenter(ll); const a = await reverseGeocode(ll);
      setDestText(a.formattedAddress.split(",")[0]);
    }
  }

  const serviceObj = SERVICE_TYPES.find((s) => s.id === service) ?? SERVICE_TYPES[0];

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 bg-[#0D0F12] overflow-hidden">

      {/* ── MAPA EM TELA CHEIA (sempre visível) ── */}
      <Suspense fallback={
        <div className="absolute inset-0 bg-[#1a1a2e] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#FF6A00]">
              <img src={viaggLogo} alt="VIAGG" className="w-full h-full object-cover" />
            </div>
            <Loader2 className="w-6 h-6 text-[#FF6A00] animate-spin" />
            <span className="text-[#A7B0BE] text-sm">Carregando mapa…</span>
          </div>
        </div>
      }>
        <ViaggMap
          center={step === "riding" ? (selectedDriver?.latLng ?? center) : center}
          origin={origin}
          destination={destination}
          drivers={step === "riding" && selectedDriver ? [selectedDriver] : step === "map" ? drivers : drivers}
          route={selectedRoute}
          onMapClick={step === "map" ? handleMapClick : undefined}
          showDrivers={step === "map" || step === "found" || step === "riding"}
          className="absolute inset-0 w-full h-full"
        />
      </Suspense>

      {/* ── Botão "minha localização" ── */}
      {(step === "map" || step === "riding") && (
        <LocateButton onClick={locateUser} />
      )}

      {/* ── Header flutuante (topo) ── */}
      <div className="absolute top-0 left-0 right-0 z-[1002] flex items-center gap-2 px-3 pt-safe pt-3 pb-3 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={() => step === "map" ? navigate("/corridas") : setStep("map")}
          className="w-9 h-9 flex items-center justify-center rounded-2xl bg-[#0D0F12]/90 backdrop-blur border border-white/10 shadow-lg"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>

        {/* Título central */}
        <div className="flex-1 flex items-center gap-2 bg-[#0D0F12]/80 backdrop-blur border border-white/10 rounded-2xl px-3 py-2 shadow-lg">
          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
            <img src={viaggLogo} alt="" className="w-full h-full object-cover" />
          </div>
          <span className="text-xs font-black text-white flex-1">
            {step === "map"       && "Mapa Inteligente VIAGG AI"}
            {step === "searching" && "Procurando motorista…"}
            {step === "found"     && "Motorista encontrado!"}
            {step === "riding"    && "Corrida em andamento"}
          </span>
          <div className="flex items-center gap-1 bg-indigo-500/20 rounded-full px-2 py-0.5">
            <BrainCircuit className="w-3 h-3 text-indigo-400" />
            <span className="text-[9px] text-indigo-400 font-bold">IA</span>
          </div>
        </div>
      </div>

      {/* ── Motoristas online badge ── */}
      {step === "map" && (
        <div className="absolute top-16 left-3 z-[1002] bg-[#0D0F12]/85 backdrop-blur border border-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white font-semibold">{drivers.length} motoristas online</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* PAINEL INFERIOR — STEP: MAP                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "map" && (
        <div className={`absolute bottom-0 left-0 right-0 z-[1002] transition-all duration-300 ${panelOpen ? "translate-y-0" : "translate-y-[calc(100%-68px)]"}`}>
          <div className="bg-[#0D0F12]/95 backdrop-blur-xl border-t border-white/10 rounded-t-3xl shadow-2xl max-h-[40vh] flex flex-col">
            {/* Drag handle + toggle */}
            <button onClick={() => setPanelOpen(!panelOpen)}
              className="flex flex-col items-center py-3 shrink-0">
              <div className="w-10 h-1 bg-white/20 rounded-full mb-1" />
              <div className="flex items-center gap-1.5">
                {panelOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-[#A7B0BE]" />
                  : <ChevronUp className="w-3.5 h-3.5 text-[#A7B0BE]" />
                }
                <span className="text-[11px] text-[#A7B0BE]">{panelOpen ? "Ocultar formulário" : "Onde você quer ir?"}</span>
              </div>
            </button>

            <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-3">

              {/* Busca IA */}
              <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/20 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-bold text-indigo-300">Fale com a IA — para onde?</span>
                </div>
                <div className="flex gap-2">
                  <input value={aiSearch} onChange={(e) => setAiSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAISearch()}
                    placeholder='"Aeroporto", "Shopping", "Hospital mais próximo"…'
                    className="flex-1 text-xs bg-[#1a1f28] border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-[#A7B0BE] focus:outline-none focus:border-indigo-500/50" />
                  <button onClick={handleAISearch} disabled={aiSearching || !aiSearch.trim()}
                    className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 disabled:opacity-50">
                    {aiSearching ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Send className="w-3.5 h-3.5 text-white" />}
                  </button>
                </div>
              </div>

              {/* Origem e Destino */}
              <div className="space-y-2">
                <AddressInput placeholder="Local de embarque" value={originText} onChange={setOriginText}
                  onSelect={(a) => { setOrigin(a.latLng); setCenter(a.latLng); }} dotColor="#FF6A00" />
                {/* Linha de conexão */}
                <div className="flex items-center gap-2 px-3">
                  <div className="w-3 shrink-0 flex flex-col items-center gap-0.5">
                    <div className="w-0.5 h-2 bg-white/20" />
                    <div className="w-0.5 h-2 bg-white/20" />
                  </div>
                  <button onClick={locateUser} disabled={locating}
                    className="flex items-center gap-1.5 text-[11px] text-[#FF6A00] font-semibold disabled:opacity-50">
                    {locating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Locate className="w-3 h-3" />}
                    {locating ? "Localizando…" : "Usar minha localização"}
                  </button>
                </div>
                <AddressInput placeholder="Destino" value={destText} onChange={setDestText}
                  onSelect={(a) => { setDestination(a.latLng); setCenter(a.latLng); }} dotColor="#22C55E" />
                <p className="text-[11px] text-[#A7B0BE] px-1">
                  💡 Toque no mapa para definir {!origin ? "origem" : "destino"}
                </p>
              </div>

              {/* Tipo de serviço */}
              <div className="grid grid-cols-3 gap-2">
                {SERVICE_TYPES.map((s) => {
                  const Icon = s.icon;
                  const active = service === s.id;
                  return (
                    <button key={s.id} onClick={() => setService(s.id)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-2xl border transition-all ${
                        active ? "border-[#FF6A00]/50 bg-[#FF6A00]/10" : "border-white/10 bg-[#1a1f28] hover:border-white/20"
                      }`}>
                      <Icon className="w-4 h-4" style={{ color: active ? s.color : "#A7B0BE" }} />
                      <span className="text-[10px] font-bold" style={{ color: active ? s.color : "#A7B0BE" }}>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Estimativa de preço */}
              {price && (
                <div className="bg-[#1a1f28] border border-white/10 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-[#A7B0BE] uppercase tracking-wider">Estimativa</span>
                    {price.isDynamic && (
                      <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5 font-bold">
                        ⚡ Tarifa Dinâmica ×{price.surgeMultiplier.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 text-center">
                    <div className="flex-1 bg-[#FF6A00]/10 border border-[#FF6A00]/20 rounded-xl py-2">
                      <div className="text-base font-black text-white">R$ {price.avg.toFixed(2)}</div>
                      <div className="text-[10px] text-[#A7B0BE]">Estimado</div>
                    </div>
                    <div className="flex-1 bg-[#1B1F24] rounded-xl py-2">
                      <div className="text-sm font-bold text-green-400">R$ {price.min.toFixed(2)}</div>
                      <div className="text-[10px] text-[#A7B0BE]">Mínimo</div>
                    </div>
                    <div className="flex-1 bg-[#1B1F24] rounded-xl py-2">
                      <div className="text-sm font-bold text-red-400">R$ {price.max.toFixed(2)}</div>
                      <div className="text-[10px] text-[#A7B0BE]">Máximo</div>
                    </div>
                  </div>
                  <div className="flex gap-3 text-[11px] text-[#A7B0BE] mt-2 pt-2 border-t border-white/5">
                    <span>📍 {price.estimatedKm.toFixed(1)}km</span>
                    <span>⏱ {price.estimatedMin.toFixed(0)}min</span>
                    {price.discount && <span className="text-green-400">🏷️ -R${price.discount.toFixed(0)}</span>}
                  </div>
                </div>
              )}

              {/* Rotas */}
              {routes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-[#A7B0BE] uppercase tracking-wider">Rotas disponíveis</p>
                  {routes.map((r) => (
                    <button key={r.type} onClick={() => setSelectedRoute(r)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-all ${
                        selectedRoute?.type === r.type
                          ? "border-[#FF6A00]/50 bg-[#FF6A00]/10"
                          : "border-white/10 bg-[#1a1f28] hover:border-white/20"
                      }`}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                        <span className="text-xs font-semibold text-white">{r.label}</span>
                      </div>
                      <div className="text-[11px] text-[#A7B0BE] flex gap-2">
                        <span>{r.distanceKm.toFixed(1)}km</span>
                        <span>{r.durationMin.toFixed(0)}min</span>
                        {r.tollCost > 0 && <span className="text-amber-400">+R${r.tollCost.toFixed(0)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Insights IA */}
              {insights.map((ins, i) => (
                <div key={i} className={`flex items-start gap-2 p-2.5 rounded-xl border text-xs ${
                  ins.severity === "alert"   ? "bg-red-500/10 border-red-500/20 text-red-300" :
                  ins.severity === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-300" :
                  "bg-blue-500/10 border-blue-500/20 text-blue-300"
                }`}>
                  <BrainCircuit className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{ins.message}</span>
                </div>
              ))}

              {/* Assistente IA (só aparece quando tem rota calculada) */}
              {price && (
                <AIAssistant context={{
                  distanceKm: price.estimatedKm, durationMin: price.estimatedMin,
                  priceMin: price.min, priceMax: price.max,
                  driversNearby: drivers.length, city: "Brasília",
                }} />
              )}

              {/* CTA */}
              <button onClick={handleSearch} disabled={!origin || !destination}
                className="w-full py-4 rounded-2xl font-black text-white text-base shadow-xl disabled:opacity-40 active:scale-[0.98] transition-all"
                style={{ background: origin && destination ? "linear-gradient(90deg,#FF6A00,#FF4500)" : "#2A3038" }}>
                🔎 Procurar {serviceObj.label}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: SEARCHING                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "searching" && (
        <div className="absolute inset-0 z-[1003] flex flex-col items-center justify-center bg-[#0D0F12]/80 backdrop-blur-sm px-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "#FF6A00", opacity: 0.2, transform: "scale(1.6)" }} />
            <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "#FF6A00", opacity: 0.1, transform: "scale(2.2)", animationDelay: "0.3s" }} />
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-[#FF6A00] shadow-2xl relative z-10">
              <img src={viaggLogo} alt="VIAGG" className="w-full h-full object-cover" />
            </div>
          </div>
          <h2 className="text-xl font-black text-white mb-1">Procurando {serviceObj.label}</h2>
          <p className="text-[#A7B0BE] text-sm mb-6 text-center">IA VIAGG analisando {drivers.length} motoristas…</p>
          <div className="w-full max-w-xs mb-5">
            <div className="flex justify-between text-xs text-[#A7B0BE] mb-1.5"><span>Buscando</span><span>{searchProgress.toFixed(0)}%</span></div>
            <div className="h-2 bg-[#2A3038] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${searchProgress}%`, background: "linear-gradient(90deg,#FF6A00,#FF4500)" }} />
            </div>
          </div>
          {[
            { label: "Analisando rotas",            done: searchProgress > 20 },
            { label: "Verificando motoristas",      done: searchProgress > 45 },
            { label: "IA selecionando o melhor",    done: searchProgress > 70 },
            { label: "Confirmando disponibilidade", done: searchProgress > 90 },
          ].map((c, i) => (
            <div key={i} className="w-full max-w-xs flex items-center gap-3 py-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${c.done ? "bg-green-500" : "bg-[#2A3038]"}`}>
                {c.done ? <Check className="w-3 h-3 text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-[#A7B0BE]/30" />}
              </div>
              <span className={`text-sm ${c.done ? "text-white" : "text-[#A7B0BE]"}`}>{c.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: FOUND — painel inferior sobre o mapa                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "found" && (
        <div className="absolute bottom-0 left-0 right-0 z-[1002] bg-[#0D0F12]/96 backdrop-blur-xl border-t border-white/10 rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <h2 className="text-base font-black text-white">Motoristas disponíveis!</h2>
            <span className="ml-auto text-xs text-[#A7B0BE]">{drivers.slice(0, 5).length} opções</span>
          </div>
          <div className="overflow-y-auto flex-1 px-4 pb-2 space-y-2">
            {drivers.slice(0, 5).map((d) => (
              <DriverCard key={d.id} driver={d} selected={selectedDriver?.id === d.id} onSelect={() => setSelectedDriver(d)} />
            ))}
          </div>
          {price && (
            <div className="px-4 pb-6 pt-2 shrink-0 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#A7B0BE]">Valor estimado</div>
                  <div className="text-2xl font-black text-white">R$ {price.avg.toFixed(2)}</div>
                </div>
                <button onClick={handleAcceptRide}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-black text-white text-sm active:scale-95 transition-all"
                  style={{ background: "linear-gradient(90deg,#FF6A00,#FF4500)" }}>
                  Aceitar Corrida
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: RIDING — painel inferior sobre o mapa                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "riding" && (
        <div className="absolute bottom-0 left-0 right-0 z-[1002] bg-[#0D0F12]/96 backdrop-blur-xl border-t border-white/10 rounded-t-3xl shadow-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-bold text-white">Motorista a caminho</span>
            <span className="ml-auto text-xs text-[#A7B0BE]">ETA: {(selectedDriver ?? drivers[0])?.etaMin ?? 5} min</span>
          </div>
          {(selectedDriver ?? drivers[0]) && (
            <div className="flex items-center gap-3 bg-[#1a1f28] border border-white/10 rounded-2xl p-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-lg shrink-0" style={{ background: "#FF6A00" }}>
                {(selectedDriver ?? drivers[0]).name.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">{(selectedDriver ?? drivers[0]).name}</div>
                <div className="text-xs text-[#A7B0BE]">{(selectedDriver ?? drivers[0]).vehicle} · {(selectedDriver ?? drivers[0]).plate}</div>
                <div className="flex gap-2 text-xs text-[#A7B0BE] mt-0.5">
                  <span>⭐ {(selectedDriver ?? drivers[0]).rating.toFixed(1)}</span>
                  <span>🏁 {(selectedDriver ?? drivers[0]).trips} corridas</span>
                </div>
              </div>
              {price && <div className="text-lg font-black text-white shrink-0">R$ {price.avg.toFixed(2)}</div>}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {([
              { icon: Phone,         label: "Ligar",        color: "#22C55E" },
              { icon: MessageCircle, label: "WhatsApp",     color: "#22C55E" },
              { icon: Share2,        label: "Compartilhar", color: "#3B82F6" },
              { icon: Shield,        label: "SOS",          color: "#EF4444" },
            ] as const).map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.label}
                  onClick={a.label === "SOS" ? () => EventService.ride.sos(`ride-${Date.now()}`, "user", center.lat, center.lng) : undefined}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-white/10 bg-[#1a1f28] hover:border-white/20 transition-colors">
                  <Icon className="w-5 h-5" style={{ color: a.color }} />
                  <span className="text-[10px] text-[#A7B0BE]">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
