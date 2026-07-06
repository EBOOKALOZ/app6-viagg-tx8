import { useState, useEffect, useRef } from "react";
import { Bike, MapPin, Package, Clock, CheckCircle, Loader2, ArrowRight, Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalCall } from "@/contexts/GlobalCallContext";
import { haversineKm, geocodeAddress } from "@/lib/map/GeoLocationService";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BIP_URL = 'https://broifhfqmnzqoongtokm.supabase.co/storage/v1/object/public/audio%20de%20chamada%20motoboy/bip_motoboy_call.mp3';

// ─── Ícones callout ───────────────────────────────────────────────────────────
// iconSize [90,28]: container fixo de 90px de largura, centralizado pelo iconAnchor [45,28]
// A ponta da seta cai exatamente no ponto geográfico.
function calloutIcon(bg: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:90px;display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <div style="background:${bg};color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:5px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);line-height:1.4">${label}</div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid ${bg}"></div>
    </div>`,
    iconSize: [90, 28],
    iconAnchor: [45, 28], // centro-X, fundo = ponta da seta = ponto geográfico
  });
}

const greenIcon   = calloutIcon('#16a34a', 'Coleta');
const redIcon     = calloutIcon('#dc2626', 'Entrega');
const motoboyIcon = calloutIcon('#2563eb', 'Você');

interface LatLng { lat: number; lng: number }

// Extrai lat/lng: tenta coluna do banco primeiro, depois parseia do texto
function extractCoords(address: string, lat: number | null, lng: number | null): LatLng | null {
  if (lat != null && lng != null) return { lat, lng };
  const m = address.match(/[Ll]at\s+([-\d.]+)[,\s]+[Ll]ng\s+([-\d.]+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

function formatAddress(address: string, coords: LatLng | null): string {
  if (address.match(/^[Ll]at\s/)) {
    return coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : address;
  }
  return address;
}

// ─── Busca rota pelas ruas via OSRM (gratuito) ───────────────────────────────
function RouteLayer({ from, to, color, dashArray, weight = 3 }: {
  from: LatLng;
  to: LatLng;
  color: string;
  dashArray?: string;
  weight?: number;
}) {
  const [coords, setCoords] = useState<[number, number][]>([]);

  useEffect(() => {
    let cancelled = false;
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const raw: [number, number][] = data.routes?.[0]?.geometry?.coordinates;
        if (raw?.length) {
          // OSRM retorna [lng, lat] → Leaflet quer [lat, lng]
          const middle = raw.map(([lng, lat]) => [lat, lng] as [number, number]);
          // Força início e fim exatos nos marcadores (OSRM snapa para a via mais próxima)
          setCoords([[from.lat, from.lng], ...middle, [to.lat, to.lng]]);
        } else {
          setCoords([[from.lat, from.lng], [to.lat, to.lng]]);
        }
      })
      .catch(() => {
        if (!cancelled) setCoords([[from.lat, from.lng], [to.lat, to.lng]]);
      });
    return () => { cancelled = true; };
  }, [from.lat, from.lng, to.lat, to.lng]);

  if (!coords.length) return null;
  return <Polyline positions={coords} color={color} weight={weight} opacity={0.9} dashArray={dashArray} />;
}

// ─── Mapa auxiliar para fitBounds ────────────────────────────────────────────
function AutoBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(points as any, { padding: [22, 22] });
  }, [map]);
  return null;
}

// ─── Mini mapa com 3 pontos e rotas reais pelas ruas ─────────────────────────
function MiniRouteMap({ origin, destination, motoboy }: {
  origin: LatLng;
  destination: LatLng;
  motoboy: LatLng | null;
}) {
  const allPoints: [number, number][] = [
    [origin.lat, origin.lng],
    [destination.lat, destination.lng],
    ...(motoboy ? [[motoboy.lat, motoboy.lng] as [number, number]] : []),
  ];

  const center: [number, number] = [
    allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length,
    allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length,
  ];

  return (
    <div className="rounded-2xl overflow-hidden border border-border" style={{ height: 221 }}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* Rota motoboy → coleta (azul tracejado, pelas ruas) */}
        {motoboy && (
          <RouteLayer from={motoboy} to={origin} color="#3b82f6" weight={2.5} dashArray="6 5" />
        )}

        {/* Rota coleta → entrega (laranja, pelas ruas) */}
        <RouteLayer from={origin} to={destination} color="#FF6A00" weight={3.5} />

        {motoboy && <Marker position={[motoboy.lat, motoboy.lng]} icon={motoboyIcon} />}
        <Marker position={[origin.lat, origin.lng]} icon={greenIcon} />
        <Marker position={[destination.lat, destination.lng]} icon={redIcon} />

        <AutoBounds points={allPoints} />
      </MapContainer>
    </div>
  );
}

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface PublicRideItem {
  id: string;
  tracking_code: string;
  visitor_name: string;
  origin_address: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  package_description: string | null;
  estimated_price: number;
  distance_km: number | null;
  estimated_duration_min: number | null;
  created_at: string;
  expires_at: string;
  status: string;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function MotoboyPublicCalls() {
  const { user } = useAuth();
  const { stopPublicRideBip, enableSound } = useGlobalCall();
  const [rides, setRides] = useState<PublicRideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [motoboyPos, setMotoboyPos] = useState<LatLng | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  // Filtra as chamadas para exibir apenas as da mesma região/cidade (raio de 25km)
  const filteredRides = rides.filter((ride) => {
    if (!motoboyPos) return true; // Se a posição do motoboy não carregou, exibe tudo por enquanto
    const originCoords = extractCoords(ride.origin_address, ride.origin_lat, ride.origin_lng);
    if (!originCoords) return true;
    const distance = haversineKm(motoboyPos, originCoords);
    return distance <= 25;
  });

  const handleEnableSound = () => {
    enableSound().then(() => setSoundEnabled(true)).catch(() => setSoundEnabled(true));
  };

  // Posição do motoboy: banco imediatamente + GPS substitui quando disponível
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const gpsOk = { v: false };

    // 1) Usa ponto de cadastro ou cidade/estado geocodificados como baseline imediata
    supabase.from('motoboy_profiles').select('latitude_residencia, longitude_residencia, cidade, estado').eq('user_id', user.id).maybeSingle()
      .then(async ({ data }) => {
        if (cancelled || gpsOk.v) return;
        if (data?.latitude_residencia && data?.longitude_residencia) {
          setMotoboyPos({ lat: data.latitude_residencia, lng: data.longitude_residencia });
        } else if (data?.cidade || data?.estado) {
          try {
            const searchQuery = [data.cidade, data.estado].filter(Boolean).join(", ");
            const results = await geocodeAddress(searchQuery);
            if (results && results.length > 0 && !gpsOk.v && !cancelled) {
              setMotoboyPos(results[0].latLng);
            }
          } catch (_) {}
        }
      });

    // 2) GPS do browser substitui assim que disponível
    let wid: number | undefined;
    if (navigator.geolocation) {
      wid = navigator.geolocation.watchPosition(
        (pos) => { if (cancelled) return; gpsOk.v = true; setMotoboyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000 }
      );
    }
    return () => { cancelled = true; if (wid !== undefined) navigator.geolocation.clearWatch(wid); };
  }, [user?.id]);

  const fetchRides = async (triggerAudio = false) => {
    const { data } = await supabase
      .from("public_rides")
      .select("id, tracking_code, visitor_name, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, package_description, estimated_price, distance_km, estimated_duration_min, created_at, expires_at, status")
      .eq("status", "aguardando_motoboy")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(20);

    const fresh = (data as PublicRideItem[]) ?? [];

    if (triggerAudio && !isFirstLoadRef.current) {
      const newOnes = fresh.filter(r => !knownIdsRef.current.has(r.id));
      if (newOnes.length > 0) {
        try {
          const bip = new Audio(BIP_URL);
          bip.volume = 0.8;
          bip.play().catch(() => {});
        } catch (_) {}
      }
    }

    fresh.forEach(r => knownIdsRef.current.add(r.id));
    isFirstLoadRef.current = false;
    setRides(fresh);
    setLoading(false);
  };

  useEffect(() => {
    fetchRides(false);
    const channel = supabase
      .channel("public_calls_motoboy")
      .on("postgres_changes", { event: "*", schema: "public", table: "public_rides" }, () => fetchRides(true))
      .subscribe();
    // Fallback: re-busca a cada 10s caso o realtime não dispare; triggerAudio=true para BIP se aparecer ride novo
    const pollId = setInterval(() => fetchRides(true), 10000);
    return () => { supabase.removeChannel(channel); clearInterval(pollId); };
  }, []);

  const handleAccept = async (rideId: string) => {
    if (!user?.id) { toast.error("Você precisa estar logado."); return; }
    setAccepting(rideId);
    try {
      const { data, error } = await supabase.rpc("accept_public_ride", {
        p_ride_id: rideId,
        p_motoboy_id: user.id,
      });
      if (error) throw error;
      if (data === true) {
        stopPublicRideBip();
        toast.success("🛵 Corrida aceita! Aguardando pagamento do cliente.");
        window.location.href = `/motoboy/corrida-publica/${rideId}`;
      } else {
        toast.error("Esta corrida já foi aceita por outro motoboy.");
        fetchRides();
      }
    } catch (err) {
      toast.error("Erro ao aceitar corrida.");
      console.error(err);
    } finally {
      setAccepting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg text-foreground">Chamadas Públicas</h2>
          <p className="text-xs text-muted-foreground">Visitantes solicitando motoboy agora</p>
        </div>
        <div className="flex items-center gap-2">
          {!soundEnabled ? (
            <button
              onClick={handleEnableSound}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border border-amber-300 text-amber-700 rounded-xl text-[11px] font-black hover:bg-amber-200 transition-colors animate-pulse"
            >
              🔔 Ativar Som
            </button>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-xl text-[10px] font-bold text-green-600">
              🔊 Som ativo
            </span>
          )}
          <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-xl">
            <Bot className="w-3 h-3 text-[#FF6A00]" />
            <span className="text-[10px] font-bold text-[#FF6A00]">IA Viagg-TX8</span>
          </div>
        </div>
      </div>

      {filteredRides.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-zinc-100 flex items-center justify-center mx-auto">
            <Bike className="w-9 h-9 text-zinc-300" />
          </div>
          <p className="font-bold text-zinc-500">Nenhuma chamada pública na sua região</p>
          <p className="text-xs text-zinc-400">Novas solicitações locais aparecerão aqui automaticamente</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRides.map((ride) => (
            <PublicCallCard
              key={ride.id}
              ride={ride}
              motoboyPos={motoboyPos}
              accepting={accepting === ride.id}
              onAccept={() => handleAccept(ride.id)}
              onDismiss={() => setRides(prev => prev.filter(r => r.id !== ride.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card individual ──────────────────────────────────────────────────────────
function PublicCallCard({ ride, motoboyPos, accepting, onAccept, onDismiss }: {
  ride: PublicRideItem;
  motoboyPos: LatLng | null;
  accepting: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState("");

  const originCoords = extractCoords(ride.origin_address, ride.origin_lat, ride.origin_lng);
  const destCoords   = extractCoords(ride.destination_address, ride.destination_lat, ride.destination_lng);
  const hasMap = originCoords != null && destCoords != null;

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, new Date(ride.expires_at).getTime() - Date.now());
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setTimeLeft(diff === 0 ? "Expirado" : `${min}m ${sec}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [ride.expires_at]);

  return (
    <div className="bg-card border border-border rounded-3xl p-4 shadow-sm space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Nova chamada pública</span>
          </div>
          <p className="font-black text-foreground text-sm">{ride.visitor_name}</p>
          <p className="text-xs text-muted-foreground">#{ride.tracking_code}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black text-[#FF6A00]">
            R$ {(ride.estimated_price ?? 0).toFixed(2).replace(".", ",")}
          </p>
          <div className="flex items-center gap-1 justify-end">
            <Clock className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-bold text-amber-500">{timeLeft}</span>
          </div>
        </div>
      </div>

      {/* Mini mapa com posição do motoboy + rota */}
      {hasMap && (
        <>
          <MiniRouteMap
            origin={originCoords!}
            destination={destCoords!}
            motoboy={motoboyPos}
          />
          {/* Legenda */}
          <div className="flex items-center gap-4 px-1">
            {motoboyPos && (
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                Você
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              Coleta
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              Entrega
            </span>
          </div>
        </>
      )}

      {/* Rota em texto */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-2.5 h-2.5 text-green-600" />
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed">
            {formatAddress(ride.origin_address, originCoords)}
          </p>
        </div>
        <div className="ml-2.5 w-0.5 h-2 bg-zinc-200" />
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-2.5 h-2.5 text-red-600" />
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed">
            {formatAddress(ride.destination_address, destCoords)}
          </p>
        </div>
      </div>

      {/* Métricas */}
      <div className="flex items-center gap-3">
        {ride.distance_km && ride.distance_km > 0 && (
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Bike className="w-3 h-3" /> {ride.distance_km} km
          </span>
        )}
        {ride.estimated_duration_min && ride.estimated_duration_min > 0 && (
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {ride.estimated_duration_min} min
          </span>
        )}
        {ride.package_description && (
          <span className="text-xs text-zinc-500 flex items-center gap-1 truncate">
            <Package className="w-3 h-3 shrink-0" />
            <span className="truncate">{ride.package_description}</span>
          </span>
        )}
      </div>

      {/* Botões */}
      <div className="flex gap-2">
        <Button
          onClick={onDismiss}
          disabled={accepting}
          variant="outline"
          className="flex-none w-12 h-11 rounded-2xl border-zinc-200 text-zinc-500 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </Button>
        <Button
          onClick={onAccept}
          disabled={accepting}
          className="flex-1 bg-[#FF6A00] hover:bg-[#e55a00] text-white font-black rounded-2xl h-11"
        >
          {accepting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Aceitar Corrida
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
