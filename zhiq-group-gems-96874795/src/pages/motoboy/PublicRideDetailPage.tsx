import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Package, Clock, Bike, Phone, Loader2, Navigation, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Ícones callout ───────────────────────────────────────────────────────────
function calloutIcon(bg: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:100px;display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <div style="background:${bg};color:#fff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);line-height:1.4">${label}</div>
      <div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid ${bg}"></div>
    </div>`,
    iconSize: [100, 32],
    iconAnchor: [50, 32], // centro-X, fundo = ponta da seta = ponto geográfico
  });
}

const greenIcon   = calloutIcon('#16a34a', 'Coleta');
const redIcon     = calloutIcon('#dc2626', 'Entrega');
const motoboyIcon = calloutIcon('#2563eb', 'Motoboy');

interface LatLng { lat: number; lng: number }

// ─── Rota pelas ruas (OSRM) ───────────────────────────────────────────────────
function RouteLayer({ from, to, color, dashArray, weight = 4 }: {
  from: LatLng; to: LatLng; color: string; dashArray?: string; weight?: number;
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
          const middle = raw.map(([lng, lat]) => [lat, lng] as [number, number]);
          setCoords([[from.lat, from.lng], ...middle, [to.lat, to.lng]]);
        } else setCoords([[from.lat, from.lng], [to.lat, to.lng]]);
      })
      .catch(() => { if (!cancelled) setCoords([[from.lat, from.lng], [to.lat, to.lng]]); });
    return () => { cancelled = true; };
  }, [from.lat, from.lng, to.lat, to.lng]);

  if (!coords.length) return null;
  return <Polyline positions={coords} color={color} weight={weight} opacity={0.9} dashArray={dashArray} />;
}

function AutoBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(points as any, { padding: [30, 30] });
  }, [map]);
  return null;
}

// ─── Mapa principal ───────────────────────────────────────────────────────────
function RideMap({ origin, destination, motoboy }: {
  origin: LatLng; destination: LatLng; motoboy: LatLng | null;
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
    <MapContainer
      center={center}
      zoom={14}
      style={{ width: '100%', height: '100%' }}
      zoomControl
      scrollWheelZoom
      dragging
      doubleClickZoom
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {motoboy && (
        <RouteLayer from={motoboy} to={origin} color="#3b82f6" weight={3.5} dashArray="7 5" />
      )}
      <RouteLayer from={origin} to={destination} color="#FF6A00" weight={4.5} />

      {motoboy && <Marker position={[motoboy.lat, motoboy.lng]} icon={motoboyIcon} />}
      <Marker position={[origin.lat, origin.lng]} icon={greenIcon} />
      <Marker position={[destination.lat, destination.lng]} icon={redIcon} />

      <AutoBounds points={allPoints} />
    </MapContainer>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractCoords(address: string, lat: number | null, lng: number | null): LatLng | null {
  if (lat != null && lng != null) return { lat, lng };
  const m = address.match(/[Ll]at\s+([-\d.]+)[,\s]+[Ll]ng\s+([-\d.]+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

function formatAddr(address: string, coords: LatLng | null): string {
  if (address.match(/^[Ll]at\s/) && coords) return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
  return address;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    aguardando_motoboy:    'Aguardando motoboy',
    motoboy_aceitou:       'Corrida aceita',
    aguardando_pagamento:  'Aguardando pagamento',
    pagamento_confirmado:  'Pagamento confirmado',
    indo_coletar:          'Indo coletar',
    coletado:              'Pacote coletado',
    em_entrega:            'Em entrega',
    entregue:              'Entregue',
    cancelado:             'Cancelado',
  };
  return map[status] ?? status;
}

function statusColor(status: string) {
  if (status === 'entregue') return 'bg-green-100 text-green-700';
  if (status === 'cancelado') return 'bg-red-100 text-red-700';
  if (['pagamento_confirmado', 'coletado', 'em_entrega'].includes(status)) return 'bg-orange-100 text-[#FF6A00]';
  return 'bg-zinc-100 text-zinc-600';
}

// ─── Página ───────────────────────────────────────────────────────────────────
interface Ride {
  id: string;
  tracking_code: string;
  status: string;
  visitor_name: string;
  visitor_phone: string;
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
  expires_at: string;
}

export default function PublicRideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [motoboy, setMotoboy] = useState<LatLng | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  // Toast quando pagamento for confirmado via Realtime
  useEffect(() => {
    if (!ride) return;
    if (prevStatusRef.current && prevStatusRef.current !== ride.status) {
      if (ride.status === 'pagamento_confirmado') {
        toast.success('✅ Pagamento confirmado! Siga para o ponto de coleta.');
      }
    }
    prevStatusRef.current = ride.status;
  }, [ride?.status]);

  // Busca dados da corrida
  useEffect(() => {
    if (!id) return;
    supabase
      .from('public_rides')
      .select('id, tracking_code, status, visitor_name, visitor_phone, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, package_description, estimated_price, distance_km, estimated_duration_min, expires_at')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { toast.error('Corrida não encontrada.'); navigate(-1); return; }
        setRide(data as Ride);
        setLoading(false);
      });

    // Realtime para atualizações de status
    const ch = supabase
      .channel(`public_ride_detail_${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'public_rides', filter: `id=eq.${id}` },
        (payload) => setRide(prev => prev ? { ...prev, ...(payload.new as Partial<Ride>) } : prev))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Posição do motoboy: cadastro como baseline imediata, GPS substitui quando disponível
  const gpsOkRef = useRef(false);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    gpsOkRef.current = false;

    // 1) Cadastro carrega imediatamente (sem esperar GPS)
    supabase
      .from('motoboy_profiles')
      .select('latitude_residencia, longitude_residencia')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || gpsOkRef.current) return; // GPS já chegou, não sobrescreve
        if (data?.latitude_residencia && data?.longitude_residencia) {
          setMotoboy({ lat: data.latitude_residencia, lng: data.longitude_residencia });
        }
      });

    // 2) GPS substitui assim que chega (mais preciso)
    let watchId: number | undefined;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled) return;
          gpsOkRef.current = true;
          setMotoboy({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => { /* sem GPS — mantém cadastro */ },
        { enableHighAccuracy: true, maximumAge: 15000 }
      );
    }

    return () => {
      cancelled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin" />
      </div>
    );
  }

  if (!ride) return null;

  const originCoords = extractCoords(ride.origin_address, ride.origin_lat, ride.origin_lng);
  const destCoords   = extractCoords(ride.destination_address, ride.destination_lat, ride.destination_lng);
  const hasMap = originCoords != null && destCoords != null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-accent transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm text-foreground truncate">#{ride.tracking_code}</p>
          <p className="text-xs text-muted-foreground">{ride.visitor_name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-bold ${statusColor(ride.status)}`}>
            {statusLabel(ride.status)}
          </span>
          <span className="font-black text-[#FF6A00] text-base">
            R$ {(ride.estimated_price ?? 0).toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>

      {/* ── Banner: Aguardando Pagamento ── */}
      {['motoboy_aceitou', 'aguardando_pagamento'].includes(ride.status) && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
            </div>
            <div>
              <p className="font-black text-amber-800 text-sm">⏳ Aguardando confirmação do pagamento</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Corrida aceita por você. Assim que o cliente confirmar o pagamento, você será notificado aqui para seguir ao ponto de coleta.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Banner: Pagamento Confirmado ── */}
      {ride.status === 'pagamento_confirmado' && (
        <div className="shrink-0 bg-green-50 border-b border-green-200 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-black text-green-800 text-sm">✅ Pagamento confirmado!</p>
              <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
                Siga agora para o ponto de coleta. O cliente está aguardando a retirada do pacote.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mapa — ocupa a maior parte */}
      {hasMap ? (
        <div className="flex-1 relative min-h-0">
          <RideMap origin={originCoords!} destination={destCoords!} motoboy={motoboy} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-400">
          <Navigation className="w-10 h-10" />
        </div>
      )}

      {/* Painel inferior com info */}
      <div className="shrink-0 bg-card border-t border-border px-4 pt-3 pb-5 space-y-3">
        {/* Rota */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-3 h-3 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Coleta</p>
              <p className="text-xs text-zinc-700 leading-relaxed">{formatAddr(ride.origin_address, originCoords)}</p>
            </div>
          </div>
          <div className="ml-3 w-0.5 h-3 bg-zinc-200" />
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-3 h-3 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Entrega</p>
              <p className="text-xs text-zinc-700 leading-relaxed">{formatAddr(ride.destination_address, destCoords)}</p>
            </div>
          </div>
        </div>

        {/* Métricas + visitante */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {ride.distance_km && ride.distance_km > 0 && (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Bike className="w-3.5 h-3.5" /> {ride.distance_km} km
              </span>
            )}
            {ride.estimated_duration_min && ride.estimated_duration_min > 0 && (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {ride.estimated_duration_min} min
              </span>
            )}
            {ride.package_description && (
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> {ride.package_description}
              </span>
            )}
          </div>

          {/* Ligar para o visitante */}
          {ride.visitor_phone && (
            <a
              href={`tel:${ride.visitor_phone}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              {ride.visitor_phone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
