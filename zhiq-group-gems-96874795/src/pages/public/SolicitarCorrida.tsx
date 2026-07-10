// ── VIAGG-TX8™ — Solicitar Corrida — Mapa Inteligente com IA ─────────────────
// Layout: mapa em tela cheia + painel inferior flutuante (estilo Uber/99)

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, ChevronLeft, Locate, BrainCircuit, Car, Bike, Package, Truck,
  Check, Phone, MessageCircle, Share2, Shield, ArrowRight,
  Send, Loader2, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { ViaggMap, LocateButton } from "@/components/map/ViaggMap";
import { CustomerRideMapSection, type LiveProfessionalMarker } from "@/components/map/CustomerRideMapSection";
import { AcceptedRideCard } from "@/components/rides/AcceptedRideCard";
import { getCurrentPosition, reverseGeocode, autocomplete } from "@/lib/map/GeoLocationService";
import { getRouteOptions, estimatePrice } from "@/lib/map/RouteService";
import {
  getMockDriversNearby, interpretNaturalLanguageAddress,
  answerRideQuestion, generateMapInsights,
} from "@/lib/map/AIMapService";
import { EventService } from "@/lib/events/EventService";
import type { LatLng, MapAddress, RouteOption, PricePrediction, DriverMarker, AIMapInsight } from "@/lib/map/types";
import viaggLogo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseCoordinates } from "@/lib/coordinateParser";
import { useAuth } from "@/contexts/AuthContext";

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

// Despacho por service_type — cada serviço grava/lê na tabela que o painel
// profissional correspondente já escuta (ver migration
// 20260708_dispatch_by_service_type). `serviceType` é o domínio da RPC
// create_customer_delivery_order; `table` é onde o CLIENTE acompanha a corrida.
type RideTable = "service_orders" | "moto_taxi_corridas" | "motorista_corridas";
const SERVICE_DISPATCH: Record<string, { serviceType: string; table: RideTable; label: string }> = {
  motoboy:   { serviceType: "delivery", table: "service_orders",     label: "motoboy" },
  entrega:   { serviceType: "delivery", table: "service_orders",     label: "profissional" },
  frete:     { serviceType: "freight",  table: "service_orders",     label: "profissional" },
  mototaxi:  { serviceType: "mototaxi", table: "moto_taxi_corridas", label: "moto-táxi" },
  motorista: { serviceType: "ride",     table: "motorista_corridas", label: "motorista" },
  taxi:      { serviceType: "ride",     table: "motorista_corridas", label: "motorista" },
};
const dispatchFor = (svc: string) => SERVICE_DISPATCH[svc] ?? SERVICE_DISPATCH.mototaxi;

type Step = "map" | "searching" | "found" | "riding";

// ── Profissionais no mapa ao vivo — categoria/cor/label (só visualização) ──────
const PRO_CATEGORY: Record<DriverMarker["type"], "motoboy" | "mototaxi" | "driver"> = {
  motoboy: "motoboy",
  mototaxi: "mototaxi",
  motorista: "driver",
  taxi: "driver",
};
const PRO_COLOR: Record<"motoboy" | "mototaxi" | "driver", string> = {
  motoboy: "#22C55E",
  mototaxi: "#FF6A00",
  driver: "#3B82F6",
};
const PRO_LABEL: Record<"motoboy" | "mototaxi" | "driver", string> = {
  motoboy: "Motoboy",
  mototaxi: "Moto-Táxi",
  driver: "Motorista",
};

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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const serviceParam = searchParams.get("service");
  const [step, setStep]           = useState<Step>("map");
  const [panelOpen, setPanelOpen] = useState(true); // painel inferior expandido

  // ── Mini-conta (nome + e-mail → link mágico) + pedido real ──
  const [showMiniAccount, setShowMiniAccount] = useState(false);
  const [miniName,  setMiniName]  = useState("");
  const [miniEmail, setMiniEmail] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  // Tabela onde a corrida criada vive (depende do service_type) — usada pelo
  // tracking e pelo AcceptedRideCard. Capturada na criação p/ não seguir
  // mudanças posteriores do seletor de serviço.
  const [orderTable, setOrderTable] = useState<RideTable>("service_orders");
  // Cancelar chamada durante a busca (confirmação + envio)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // PRÉ-PAGO: diálogo de saldo insuficiente → recarga
  const [saldoDialogOpen, setSaldoDialogOpen] = useState(false);

  // Localização
  const [center,      setCenter]      = useState<LatLng>(DEFAULT_CENTER);
  const [origin,      setOrigin]      = useState<LatLng | undefined>();
  const [destination, setDestination] = useState<LatLng | undefined>();
  const [originText,  setOriginText]  = useState("");
  const [destText,    setDestText]    = useState("");
  const [locating,    setLocating]    = useState(false);
  const [currentCity, setCurrentCity] = useState("Brasília");
  const [coordColeta,  setCoordColeta]  = useState("");
  const [coordDestino, setCoordDestino] = useState("");

  // ── Sincronização MAPA → CAMPOS: mover/clicar o balão preenche os campos
  //    de coordenadas (formato DMS, o mesmo aceito ao colar). ───────────────
  const toDMS = (v: number, pos: string, neg: string) => {
    const hemi = v < 0 ? neg : pos;
    const abs = Math.abs(v);
    let d = Math.floor(abs);
    let m = Math.floor((abs - d) * 60);
    let s = Math.round(((abs - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; d += 1; }
    return `${d}º ${m}' ${String(s).padStart(2, "0")}" ${hemi}`;
  };
  const formatCoordsDMS = (ll: LatLng) =>
    `${toDMS(ll.lat, "N", "S")}  ${toDMS(ll.lng, "E", "W")}`;

  useEffect(() => {
    if (origin) setCoordColeta(formatCoordsDMS(origin));
  }, [origin?.lat, origin?.lng]);
  useEffect(() => {
    if (destination) setCoordDestino(formatCoordsDMS(destination));
  }, [destination?.lat, destination?.lng]);

  // Aplica coordenadas/link (Google Maps ou WhatsApp) colado num balão →
  // usa o MESMO parser homologado do lojista (parseCoordinates).
  const applyCoords = async (text: string, target: "origin" | "dest") => {
    const r = parseCoordinates(text);
    if (!r.success || !r.coordinates) {
      toast.error("Cole coordenadas ou um link do Google Maps/WhatsApp válido");
      return;
    }
    const ll = { lat: r.coordinates.latitude, lng: r.coordinates.longitude };
    setCenter(ll);
    if (target === "origin") {
      setOrigin(ll);
      setOriginText(`${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`);
      try { const a = await reverseGeocode(ll); if (a?.formattedAddress) setOriginText(a.formattedAddress.split(",").slice(0, 2).join(", ")); } catch { /* mantém coords */ }
      toast.success("📍 Coleta marcada no mapa!");
    } else {
      setDestination(ll);
      setDestText(`${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`);
      try { const a = await reverseGeocode(ll); if (a?.formattedAddress) setDestText(a.formattedAddress.split(",").slice(0, 2).join(", ")); } catch { /* mantém coords */ }
      toast.success("🏁 Destino marcado no mapa!");
    }
  };

  // Inicialização da localização do CLIENTE que chama o motoboy.
  // A COLETA é a posição do próprio cliente: vem SÓ de GPS ou do que ele colar/clicar.
  // Nunca herdamos a residência de um perfil (motoboy/driver/loja) nem de um motoboy
  // aleatório do sistema — era isso que fazia a coleta "cair" na cidade de outro
  // cadastro (ex.: um motoboy de Santa Catarina) em vez do endereço informado.
  useEffect(() => {
    const initializeLocation = async () => {
      setLocating(true);
      try {
        const pos = await getCurrentPosition();
        const addr = await reverseGeocode(pos);
        const isBrazil = addr.country === "Brasil" || addr.country === "Brazil" || addr.formattedAddress.includes("Brasil");
        if (isBrazil) {
          setCenter(pos);
          setOrigin(pos);
          setOriginText(addr.formattedAddress.split(",").slice(0, 2).join(", "));
          if (addr.city) setCurrentCity(addr.city);
        } else {
          setCenter(DEFAULT_CENTER);
        }
      } catch {
        // GPS negado/indisponível — mantém o mapa em Brasília e aguarda o cliente
        // informar a coleta (colar coordenadas do WhatsApp ou clicar no mapa).
        setCenter(DEFAULT_CENTER);
      }
      setLocating(false);
    };

    initializeLocation();
  }, []);

  // Serviço / rota / preço
  const [service,       setService]       = useState(serviceParam || "mototaxi");

  useEffect(() => {
    if (serviceParam && SERVICE_TYPES.some((s) => s.id === serviceParam)) {
      setService(serviceParam);
    }
  }, [serviceParam]);
  const [routes,        setRoutes]        = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | undefined>();
  const [price,         setPrice]         = useState<PricePrediction | undefined>();

  // Motoristas e IA
  const [drivers,        setDrivers]        = useState<DriverMarker[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverMarker | undefined>();
  // Profissional tocado no marcador do mapa ao vivo → abre o bottom sheet (só visualização)
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);
  const [insights,       setInsights]       = useState<AIMapInsight[]>([]);
  const [aiSearch,       setAiSearch]       = useState("");
  const [aiSearching,    setAiSearching]    = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);

  // ── Auto-localizar manual via botão GPS ─────────
  const locateUser = useCallback(async () => {
    setLocating(true);
    try {
      const pos  = await getCurrentPosition();
      const addr = await reverseGeocode(pos);
      const isBrazil = addr.country === "Brasil" || addr.country === "Brazil" || addr.formattedAddress.includes("Brasil");
      if (isBrazil) {
        setCenter(pos);
        setOrigin(pos);
        setOriginText(addr.formattedAddress.split(",").slice(0, 2).join(", "));
        if (addr.city) {
          setCurrentCity(addr.city);
        }
      } else {
        toast.info("Geolocalização fora do Brasil ignorada.");
      }
    } catch {
      // GPS negado ou indisponível
    }
    setLocating(false);
  }, []);

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
  // Busca só profissionais ONLINE (is_online=true) e, quando existir GPS ao
  // vivo (motoboy_presence / professional_presence), usa-o no lugar da
  // residência — isso é o que faz o "profissionais no mapa ao vivo" andar de
  // verdade em vez de ficar preso no endereço cadastrado. Mock só entra
  // quando não há NENHUM profissional real (não piora o ambiente de dev).
  const fetchRealDrivers = useCallback(async () => {
    try {
      let dbDrivers: any[] = [];
      if (service === 'motoboy') {
        const { data, error } = await supabase
          .from('motoboy_profiles')
          .select('user_id, nome, sobrenome, latitude_residencia, longitude_residencia, cidade, veiculo_modelo, veiculo_marca, veiculo_placa')
          .eq('is_online', true)
          .not('latitude_residencia', 'is', null)
          .not('longitude_residencia', 'is', null);
        if (!error && data) dbDrivers = data;
      } else {
        // 'mototaxi' ou 'motorista'
        const { data, error } = await supabase
          .from('driver_profiles')
          .select('user_id, nome, sobrenome, latitude_residencia, longitude_residencia, cidade, veiculo_modelo, veiculo_marca, veiculo_placa')
          .eq('is_online', true)
          .not('latitude_residencia', 'is', null)
          .not('longitude_residencia', 'is', null);
        if (!error && data) dbDrivers = data;
      }

      const userIds: string[] = dbDrivers.map((d) => d.user_id).filter(Boolean);

      // GPS ao vivo: motoboy_presence (motoboy_id, lat, lng) para motoboy,
      // professional_presence (user_id, status, last_location "POINT(lng lat)")
      // para mototaxi/motorista. Busca em lote, nunca por linha.
      const presenceMap: Record<string, { lat: number; lng: number; status?: string }> = {};
      if (userIds.length > 0) {
        if (service === 'motoboy') {
          const { data: presData } = await (supabase as any)
            .from('motoboy_presence')
            .select('motoboy_id, lat, lng')
            .in('motoboy_id', userIds);
          (presData || []).forEach((p: any) => {
            if (p.motoboy_id && typeof p.lat === 'number' && typeof p.lng === 'number') {
              presenceMap[p.motoboy_id] = { lat: p.lat, lng: p.lng, status: 'online' };
            }
          });
        } else {
          const { data: presData } = await (supabase as any)
            .from('professional_presence')
            .select('user_id, status, last_location, updated_at')
            .in('user_id', userIds);
          (presData || []).forEach((p: any) => {
            if (!p.user_id) return;
            let lat: number | undefined;
            let lng: number | undefined;
            if (typeof p.last_location === 'string' && p.last_location.startsWith('POINT(')) {
              const match = p.last_location.match(/POINT\(([^ ]+) ([^)]+)\)/);
              if (match) {
                lng = parseFloat(match[1]);
                lat = parseFloat(match[2]);
              }
            }
            if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
              presenceMap[p.user_id] = { lat, lng, status: p.status };
            }
          });
        }
      }

      // Foto: profiles.avatar_url é leitura pública (mesmo padrão do AcceptedRideCard)
      const avatarMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', userIds);
        (profilesData || []).forEach((p: any) => {
          if (p.id && p.avatar_url) avatarMap[p.id] = p.avatar_url;
        });
      }

      // Map and sort by distance to center
      const mapped = dbDrivers.map((d, index) => {
        const live = d.user_id ? presenceMap[d.user_id] : undefined;
        const latLng = live
          ? { lat: live.lat, lng: live.lng }
          : { lat: d.latitude_residencia, lng: d.longitude_residencia };
        const distance = haversineKm(center, latLng);
        return {
          id: d.user_id || `driver-${index}`,
          name: `${d.nome || 'Motoboy'} ${d.sobrenome || ''}`.trim(),
          type: service as any,
          latLng,
          heading: Math.random() * 360,
          rating: 4.5 + Math.random() * 0.5,
          trips: 10 + Math.floor(Math.random() * 100),
          distanceKm: parseFloat(distance.toFixed(2)),
          etaMin: Math.max(1, Math.round(distance * 2)),
          vehicle: `${d.veiculo_marca || ''} ${d.veiculo_modelo || ''}`.trim() || (service === 'motoboy' || service === 'mototaxi' ? 'Honda CG 160' : 'VW Gol'),
          plate: d.veiculo_placa || `ABC${1000 + index}`,
          avatarUrl: d.user_id ? avatarMap[d.user_id] : undefined,
          isOnline: true,
          status: live?.status === 'in_delivery' ? 'in_delivery' : 'online',
        } as DriverMarker;
      });

      // Ordena por distância (do centro para fora) e filtra num raio de 15km
      const sorted = mapped
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .filter(d => d.distanceKm <= 15);

      // Se não houver nenhum motoboy real cadastrado nessa região, adiciona mocks próximos (dentro de 2km)
      if (sorted.length === 0) {
        const mocks = getMockDriversNearby(center, 3).map(m => {
          const angle = Math.random() * 2 * Math.PI;
          const radius = Math.random() * 0.015; // dentro de ~1.8km do centro
          const lat = center.lat + radius * Math.cos(angle);
          const lng = center.lng + radius * Math.sin(angle);
          return {
            ...m,
            type: service as any,
            latLng: { lat, lng }
          };
        });

        const mocksWithDistance = mocks.map(m => {
          const dist = haversineKm(center, m.latLng);
          return {
            ...m,
            distanceKm: parseFloat(dist.toFixed(2)),
            etaMin: Math.max(1, Math.round(dist * 2)),
          };
        }).sort((a, b) => a.distanceKm - b.distanceKm);

        setDrivers(mocksWithDistance);
      } else {
        setDrivers(sorted);
      }

    } catch (err) {
      console.warn("Erro ao buscar motoboys reais:", err);
      setDrivers(getMockDriversNearby(center, 5));
    }
  }, [center, service]);

  useEffect(() => {
    fetchRealDrivers();
  }, [fetchRealDrivers]);

  // Realtime: qualquer mudança de presença/perfil (ficou online/offline, GPS
  // andou) re-executa a busca — sem recarregar a página. Debounce simples
  // para não disparar uma rajada de fetches quando vários pings chegam juntos.
  const fetchRealDriversRef = useRef(fetchRealDrivers);
  fetchRealDriversRef.current = fetchRealDrivers;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fetchRealDriversRef.current(); }, 500);
    };

    const channel = (supabase as any)
      .channel('solicitar-corrida-professionals-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professional_presence' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'motoboy_presence' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'motoboy_profiles' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles' }, scheduleRefetch)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    generateMapInsights(drivers.length, 6, currentCity).then(setInsights);
  }, [drivers.length, currentCity]);

  // ── Busca por linguagem natural ──────────────────────────────────────────────
  async function handleAISearch() {
    if (!aiSearch.trim()) return;
    setAiSearching(true);
    const addr = await interpretNaturalLanguageAddress(aiSearch, currentCity);
    if (addr) { setDestination(addr.latLng); setCenter(addr.latLng); setDestText(addr.formattedAddress.split(",")[0]); }
    setAiSearching(false);
    setAiSearch("");
  }

  // ── Solicitar ────────────────────────────────────────────────────────────────
  // Cria o pedido REAL no motor do lojista (service_orders → despacho → delivery_offers).
  // Aceita override (usado no "resume" após o login, quando o estado ainda não assentou).
  async function createRealOrder(override?: {
    origin?: LatLng; destination?: LatLng; originText?: string; destText?: string;
    priceAvg?: number | null; distanceKm?: number | null; name?: string;
  }) {
    const o = override?.origin ?? origin;
    const d = override?.destination ?? destination;
    if (!o || !d) return;
    const oText = override?.originText ?? originText;
    const dText = override?.destText ?? destText;
    const pAvg  = override?.priceAvg ?? price?.avg ?? null;
    const distKm = override?.distanceKm ?? selectedRoute?.distanceKm ?? null;
    const nome = (user?.user_metadata?.name as string) || override?.name || miniName || oText || "Cliente";
    setCreatingOrder(true);
    const disp = dispatchFor(service);
    try {
      const { data, error } = await (supabase.rpc as any)("create_customer_delivery_order", {
        pickup_lat: o.lat, pickup_lng: o.lng,
        drop_lat: d.lat, drop_lng: d.lng,
        p_customer_name: nome,
        p_customer_phone: (user?.user_metadata?.whatsapp as string) || null,
        p_estimated_value: pAvg ? Number(Number(pAvg).toFixed(2)) : 0,
        p_distance_km: distKm,
        p_pickup_address: oText || null,
        p_destination_address: dText || null,
        p_service_type: disp.serviceType, // roteia p/ a tabela do painel certo
      });
      if (error) throw error;
      const id = data as string;
      setOrderId(id);
      setOrderTable(disp.table);
      localStorage.setItem("viagg_customer_order", JSON.stringify({ orderId: id, table: disp.table }));
      localStorage.removeItem("viagg_ride_draft");
      setStep("searching");
      toast.success(`Solicitação enviada! Buscando um ${disp.label}…`);
    } catch (e: any) {
      // PRÉ-PAGO: sem saldo, o banco nega e nada é criado → orienta a recarga.
      if (/negativo|saldo/i.test(e.message || "")) {
        setSaldoDialogOpen(true);
      } else {
        toast.error(`Erro ao chamar ${disp.label}`, { description: e.message });
      }
    } finally {
      setCreatingOrder(false);
    }
  }

  // Envia o link mágico (cria a mini-conta) e guarda o rascunho da corrida
  async function sendMiniAccountLink() {
    if (!miniName.trim() || !miniEmail.trim()) {
      toast.error("Informe nome e e-mail");
      return;
    }
    setSendingLink(true);
    try {
      localStorage.setItem("viagg_ride_draft", JSON.stringify({
        origin, destination, originText, destText, service,
        priceAvg: price?.avg ?? null, distanceKm: selectedRoute?.distanceKm ?? null,
        name: miniName,
      }));
      localStorage.setItem("viagg_mini_return_to", `/solicitar-corrida?service=${service}&resume=1`);
      const { error } = await supabase.auth.signInWithOtp({
        email: miniEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { name: miniName.trim() },
        },
      });
      if (error) throw error;
      setShowMiniAccount(false);
      toast.success("Enviamos um link para seu e-mail", {
        description: "Abra o link para confirmar e chamar o motoboy.",
      });
    } catch (e: any) {
      toast.error("Não foi possível enviar o link", { description: e.message });
    } finally {
      setSendingLink(false);
    }
  }

  // Ao voltar do link mágico (?resume=1) autenticado, restaura o rascunho e cria o pedido
  useEffect(() => {
    if (searchParams.get("resume") !== "1" || !user) return;
    const raw = localStorage.getItem("viagg_ride_draft");
    if (!raw) return;
    let d: any;
    try { d = JSON.parse(raw); } catch { return; }
    if (d.origin) setOrigin(d.origin);
    if (d.destination) setDestination(d.destination);
    if (d.originText) setOriginText(d.originText);
    if (d.destText) setDestText(d.destText);
    // Cria com os valores do rascunho diretamente (evita closure de estado)
    createRealOrder({
      origin: d.origin, destination: d.destination,
      originText: d.originText, destText: d.destText,
      priceAvg: d.priceAvg, distanceKm: d.distanceKm, name: d.name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Enquanto o pedido está "searching", escuta em tempo real: quando um
  // profissional ACEITA (profissional atribuído / driver_status muda),
  // transiciona para "found" e mostra o card do aceite (AcceptedRideCard).
  useEffect(() => {
    if (!orderId || step !== "searching") return;
    let alive = true;
    // "Aguardando" varia por tabela: service_orders (awaiting_professional/
    // searching), moto_taxi_corridas ('pesquisando'), motorista_corridas
    // ('pendente'/'reserva'). Qualquer outra coisa = já foi aceita/andando.
    const WAITING = ["awaiting_professional", "searching", "pesquisando", "pendente", "reserva"];
    const check = (row: any) => {
      if (!row || !alive) return;
      const assigned =
        row.motoboy_id || row.courier_id || row.professional_uid ||
        row.moto_taxi_id || row.motorista_id;
      const startedByDriver = row.driver_status && row.driver_status !== "waiting_accept";
      const startedByStatus = row.status && !WAITING.includes(row.status);
      if (assigned || startedByDriver || startedByStatus) setStep("found");
    };
    (supabase as any)
      .from(orderTable)
      .select("*")
      .eq("id", orderId)
      .maybeSingle()
      .then(({ data }: any) => check(data));
    const ch = supabase
      .channel(`client-ride-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: orderTable, filter: `id=eq.${orderId}` },
        (p: any) => check(p.new),
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [orderId, orderTable, step]);

  // ── Cancelar chamada DURANTE a busca ──────────────────────────────────────
  // A RPC cancel_ride_search é o árbitro atômico cancelar×aceitar: só cancela
  // se nenhum profissional aceitou (UPDATE condicional no servidor). Ao sair
  // do step "searching", o cleanup do useEffect acima encerra a subscription
  // realtime — nada segue rodando em segundo plano.
  async function handleCancelSearch() {
    if (!orderId || cancelling) return;
    setCancelling(true);
    try {
      const { data, error } = await (supabase.rpc as any)("cancel_ride_search", {
        p_order_id: orderId,
        p_service: dispatchFor(service).serviceType,
      });
      if (error) throw new Error(error.message);
      if (data?.cancelled) {
        localStorage.removeItem("viagg_customer_order");
        setCancelDialogOpen(false);
        setOrderId(null);
        setSelectedDriver(undefined);
        setStep("map");
        toast.success("Chamada cancelada com sucesso.");
      } else if (data?.reason === "accepted") {
        // O aceite venceu a corrida — segue para o card do profissional.
        setCancelDialogOpen(false);
        setStep("found");
        toast.info("Um profissional acabou de aceitar sua chamada!");
      } else {
        setCancelDialogOpen(false);
        toast.info("Esta chamada não está mais em busca.");
      }
    } catch (e: any) {
      toast.error("Não foi possível cancelar", { description: e?.message });
    } finally {
      setCancelling(false);
    }
  }

  async function handleSearch() {
    if (!origin || !destination) return;
    // Precisa de mini-conta (link mágico) para entrar no motor real e pagar depois
    if (!user) { setShowMiniAccount(true); return; }
    await createRealOrder();
    return;
    // (fluxo antigo de simulação abaixo — mantido desativado)
    // eslint-disable-next-line no-unreachable
    setStep("searching");
    setSearchProgress(0);
    EventService.ride.requested(`ride-${Date.now()}`, currentCity, { service });
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 12 + 3;
      setSearchProgress(Math.min(p, 100));
      if (p >= 100) { clearInterval(iv); setTimeout(() => setStep("found"), 600); }
    }, 350);
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

  // Profissionais online → marcadores ao vivo no mapa (só visualização)
  const professionalsForMap: LiveProfessionalMarker[] = useMemo(() => drivers.map((d) => ({
    id: d.id,
    lat: d.latLng.lat,
    lng: d.latLng.lng,
    category: PRO_CATEGORY[d.type] ?? "driver",
    name: d.name,
    vehicle: d.vehicle,
    distanceKm: d.distanceKm,
    etaMin: d.etaMin,
    rating: d.rating,
    status: d.status,
  })), [drivers]);

  const selectedProfessionalData = useMemo(
    () => drivers.find((d) => d.id === selectedProfessional) ?? null,
    [drivers, selectedProfessional],
  );

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 bg-[#0D0F12] overflow-hidden">

      {/* ── MINI-CONTA (nome + e-mail → link mágico) ── */}
      {showMiniAccount && (
        <div className="absolute inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full sm:max-w-sm bg-[#151A21] border border-white/10 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-black text-lg">Quase lá! 🛵</h3>
              <button onClick={() => setShowMiniAccount(false)} className="text-[#A7B0BE] text-sm">✕</button>
            </div>
            <p className="text-[#A7B0BE] text-xs leading-relaxed">
              Para chamar o motoboy e acompanhar sua corrida, crie sua conta em segundos.
              Enviamos um <b className="text-white">link seguro no seu e-mail</b> — sem senha.
            </p>
            <div className="space-y-2">
              <input
                type="text" value={miniName} onChange={(e) => setMiniName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full text-sm bg-white border border-white/10 rounded-xl px-3 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/40"
              />
              <input
                type="email" value={miniEmail} onChange={(e) => setMiniEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMiniAccountLink()}
                placeholder="Seu melhor e-mail"
                className="w-full text-sm bg-white border border-white/10 rounded-xl px-3 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/40"
              />
            </div>
            <button
              onClick={sendMiniAccountLink}
              disabled={sendingLink || !miniName.trim() || !miniEmail.trim()}
              className="w-full py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
              style={{ background: "linear-gradient(90deg,#FF6A00,#FF4500)" }}
            >
              {sendingLink ? "Enviando…" : "Receber link e chamar motoboy"}
            </button>
            <p className="text-[10px] text-[#6B7280] text-center">
              Ao continuar você concorda em receber o link de acesso por e-mail.
            </p>
          </div>
        </div>
      )}

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
        <CustomerRideMapSection
          center={center}
          pickup={origin ?? center}
          destCoords={destination ?? null}
          routeInfo={selectedRoute ? {
            distanceKm: selectedRoute.distanceKm,
            durationMin: selectedRoute.durationMin,
            polyline: selectedRoute.waypoints.map((p) => [p.lat, p.lng] as [number, number]),
          } : null}
          customerName={miniName || (user?.user_metadata?.name as string) || undefined}
          onMarkerDragEnd={(id, lat, lng) => {
            if (id === "pickup") {
              setOrigin({ lat, lng });
            } else {
              setDestination({ lat, lng });
              setCenter({ lat, lng });
            }
          }}
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
                <AddressInput
                  placeholder={
                    service === "motoboy" || service === "entrega" || service === "frete"
                      ? "Local de coleta"
                      : "Local de embarque"
                  }
                  value={originText}
                  onChange={setOriginText}
                  onSelect={(a) => { setOrigin(a.latLng); setCenter(a.latLng); }}
                  dotColor="#FF6A00"
                />
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
                <AddressInput
                  placeholder={
                    service === "motoboy" || service === "entrega" || service === "frete"
                      ? "Local de entrega"
                      : "Destino"
                  }
                  value={destText}
                  onChange={setDestText}
                  onSelect={(a) => { setDestination(a.latLng); setCenter(a.latLng); }}
                  dotColor="#22C55E"
                />
                <p className="text-[11px] text-[#A7B0BE] px-1">
                  💡 Toque no mapa para definir {
                    service === "motoboy" || service === "entrega" || service === "frete"
                      ? (!origin ? "coleta" : "entrega")
                      : (!origin ? "embarque" : "destino")
                  }
                </p>

                {/* ── Balões: colar coordenadas / link (Google Maps / WhatsApp) ── */}
                <div className="grid grid-cols-1 gap-2 pt-1">
                  <div className="rounded-xl border border-[#FF6A00]/30 bg-[#FF6A00]/5 p-2.5">
                    <p className="text-[10px] font-bold text-[#FF6A00] mb-1.5">📍 Colar coordenadas da COLETA</p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={coordColeta}
                        onChange={(e) => setCoordColeta(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyCoords(coordColeta, "origin")}
                        placeholder="Cole coordenadas ou link aqui"
                        className="flex-1 min-w-0 text-xs bg-white border border-[#FF6A00]/60 rounded-lg px-3 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/40"
                      />
                      <button onClick={() => applyCoords(coordColeta, "origin")}
                        className="px-3 rounded-lg bg-[#FF6A00] text-white text-[11px] font-black shrink-0">Marcar</button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/5 p-2.5">
                    <p className="text-[10px] font-bold text-[#22C55E] mb-1.5">🏁 Colar coordenadas do DESTINO</p>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={coordDestino}
                        onChange={(e) => setCoordDestino(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyCoords(coordDestino, "dest")}
                        placeholder="Cole coordenadas ou link aqui"
                        className="flex-1 min-w-0 text-xs bg-white border border-[#22C55E]/60 rounded-lg px-3 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#22C55E]/40"
                      />
                      <button onClick={() => applyCoords(coordDestino, "dest")}
                        className="px-3 rounded-lg bg-[#22C55E] text-white text-[11px] font-black shrink-0">Marcar</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seletor de serviço removido: o serviço já foi escolhido na
                  entrada (?service=…) via "Chamar Motoboy/Moto Táxi/Carro". */}

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
                  {/* FONTE ÚNICA: um valor só — o oficial (é exatamente o que
                      vira total_price da corrida e base da comissão). A faixa
                      mín/máx (±15% cosmético do RouteService) foi removida por
                      gerar leituras erradas de comissão. */}
                  <div className="rounded-xl border border-[#FF6A00]/20 bg-[#FF6A00]/10 py-3 text-center">
                    <div className="text-2xl font-black text-white">R$ {price.avg.toFixed(2)}</div>
                    <div className="text-[10px] text-[#A7B0BE]">Valor da corrida</div>
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

              {/* (Card de insights de disponibilidade/estimativa removido a pedido) */}

              {/* Assistente IA (só aparece quando tem rota calculada) */}
              {price && (
                <AIAssistant context={{
                  distanceKm: price.estimatedKm, durationMin: price.estimatedMin,
                  priceMin: price.min, priceMax: price.max,
                  driversNearby: drivers.length, city: currentCity,
                }} />
              )}

              {/* CTA */}
              <button onClick={handleSearch} disabled={!origin || !destination}
                className="w-full py-4 rounded-2xl font-black text-white text-base shadow-xl disabled:opacity-40 active:scale-[0.98] transition-all"
                style={{ background: origin && destination ? "linear-gradient(90deg,#FF6A00,#FF4500)" : "#2A3038" }}>
                {/* PRÉ-PAGO: o valor sai da carteira NA CHAMADA */}
                {price
                  ? `💳 Pagar e Chamar ${serviceObj.label} — R$ ${price.avg.toFixed(2)}`
                  : `🔎 Procurar ${serviceObj.label}`}
              </button>
              <p className="text-[10px] text-[#A7B0BE] text-center mt-1.5">
                O valor é debitado da sua carteira ao chamar e fica em garantia
                até a entrega. Sem saldo? Recarregue em "Minha Carteira".
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── PRÉ-PAGO: saldo insuficiente → recarga ── */}
      {saldoDialogOpen && (
        <div className="absolute inset-0 z-[2001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#151A21] p-5 space-y-4 text-center">
            <div className="text-4xl">💳</div>
            <h3 className="text-lg font-black text-white">Saldo insuficiente</h3>
            <p className="text-sm text-[#A7B0BE]">
              A corrida é paga na hora da chamada{price ? ` (R$ ${price.avg.toFixed(2)})` : ""} e o
              valor fica em garantia até a entrega. Adicione saldo à sua carteira para continuar.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setSaldoDialogOpen(false)}
                className="flex-1 rounded-2xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/5"
              >
                Voltar
              </button>
              <button
                onClick={() => navigate("/minha-carteira")}
                className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-black text-white active:scale-95 transition-all"
                style={{ background: "linear-gradient(90deg,#FF6A00,#FF4500)" }}
              >
                Adicionar saldo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: SEARCHING                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "searching" && (
        <div
          className="absolute inset-0 z-[1003] flex flex-col items-center justify-center backdrop-blur-sm px-6"
          style={{ background: "linear-gradient(160deg, rgba(255,106,0,0.96), rgba(255,69,0,0.96))" }}
        >
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "#fff", opacity: 0.25, transform: "scale(1.6)" }} />
            <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "#fff", opacity: 0.12, transform: "scale(2.2)", animationDelay: "0.3s" }} />
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-2xl relative z-10">
              <img src={viaggLogo} alt="VIAGG" className="w-full h-full object-cover" />
            </div>
          </div>
          <h2 className="text-xl font-black text-white mb-1">Procurando {serviceObj.label}</h2>
          <p className="text-white/80 text-sm mb-6 text-center">IA VIAGG analisando {drivers.length} motoristas…</p>
          <div className="w-full max-w-xs mb-5">
            <div className="flex justify-between text-xs text-white/80 mb-1.5"><span>Buscando</span><span>{searchProgress.toFixed(0)}%</span></div>
            <div className="h-2 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${searchProgress}%` }} />
            </div>
          </div>
          {[
            { label: "Analisando rotas",            done: searchProgress > 20 },
            { label: "Verificando motoristas",      done: searchProgress > 45 },
            { label: "IA selecionando o melhor",    done: searchProgress > 70 },
            { label: "Confirmando disponibilidade", done: searchProgress > 90 },
          ].map((c, i) => (
            <div key={i} className="w-full max-w-xs flex items-center gap-3 py-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${c.done ? "bg-green-500" : "bg-white/25"}`}>
                {c.done ? <Check className="w-3 h-3 text-white" /> : <div className="w-1.5 h-1.5 rounded-full bg-white/60" />}
              </div>
              <span className={`text-sm ${c.done ? "text-white font-bold" : "text-white/80"}`}>{c.label}</span>
            </div>
          ))}

          {/* Cancelar chamada — só existe enquanto está em busca; ao aceitar,
              o step muda e o botão some junto com esta tela. */}
          <button
            onClick={() => setCancelDialogOpen(true)}
            disabled={cancelling}
            className="mt-6 flex items-center gap-2 rounded-2xl border border-white/50 bg-black/25 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-black/40 active:scale-95 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Cancelar Chamada
          </button>

          {/* Confirmação do cancelamento */}
          {cancelDialogOpen && (
            <div className="absolute inset-0 z-[1004] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
              <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#151A21] p-5 space-y-4">
                <h3 className="text-lg font-black text-white">Cancelar chamada?</h3>
                <p className="text-sm text-[#A7B0BE]">A busca será interrompida imediatamente.</p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setCancelDialogOpen(false)}
                    disabled={cancelling}
                    className="flex-1 rounded-2xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/5 disabled:opacity-50"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleCancelSearch}
                    disabled={cancelling}
                    className="flex-1 rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 active:scale-95 disabled:opacity-60"
                  >
                    {cancelling ? "Cancelando…" : "Cancelar Chamada"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP: FOUND — painel inferior sobre o mapa                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === "found" && orderId && (
        <div className="absolute bottom-0 left-0 right-0 z-[1002] max-h-[88vh] overflow-y-auto">
          <AcceptedRideCard
            orderId={orderId}
            table={orderTable}
            onCancel={async () => {
              try {
                if (orderTable === "service_orders") {
                  await (supabase.rpc as any)("cancel_ride", { p_order_id: orderId });
                } else {
                  // moto_taxi_corridas / motorista_corridas: passageiro cancela
                  // direto (RLS permite auth.uid() = passenger_id).
                  await (supabase as any).from(orderTable).update({ status: "cancelada" }).eq("id", orderId);
                }
              } catch { /* ignore */ }
              setOrderId(null);
              setSelectedDriver(undefined);
              setStep("map");
              toast.info("Corrida cancelada.");
            }}
            className="m-3"
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BOTTOM SHEET — profissional tocado no mapa ao vivo (só visualização) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {(step === "map" || step === "found") && selectedProfessionalData && (() => {
          const sp = selectedProfessionalData;
          const category = PRO_CATEGORY[sp.type] ?? "driver";
          const color = PRO_COLOR[category];
          const label = PRO_LABEL[category];
          const isBusy = sp.status === "in_delivery";
          const statusLabel = isBusy ? "Em atendimento" : "Online";
          return (
            <motion.div
              key="professional-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="absolute bottom-0 left-0 right-0 z-[1050] bg-[#0D0F12]/97 backdrop-blur-xl border-t border-white/10 rounded-t-3xl shadow-2xl px-4 pt-3 pb-6"
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
              <div className="flex items-start gap-3">
                <div
                  className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-black text-white text-lg border-2 border-white/20"
                  style={{ background: color }}
                >
                  {sp.avatarUrl
                    ? <img src={sp.avatarUrl} alt={sp.name} className="w-full h-full object-cover" />
                    : sp.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-black text-white truncate">{sp.name}</span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white shrink-0" style={{ background: color }}>
                      {label}
                    </span>
                  </div>
                  <div className="text-xs text-[#A7B0BE] mt-0.5 truncate">{sp.vehicle}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#A7B0BE] mt-1.5">
                    <span>⭐ {sp.rating.toFixed(1)}</span>
                    <span>🏁 {sp.trips} corridas</span>
                    <span>📍 {sp.distanceKm.toFixed(1)}km</span>
                    <span>⏱ {sp.etaMin}min</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: isBusy ? "#F59E0B" : "#22C55E" }} />
                    <span className="text-[11px] font-semibold text-[#A7B0BE]">{statusLabel}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProfessional(null)}
                  className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4 text-[#A7B0BE]" />
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

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
