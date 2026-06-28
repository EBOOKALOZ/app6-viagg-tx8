import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, MapPin, Package, Clock, CheckCircle, Loader2, ArrowRight, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PublicRideItem {
  id: string;
  tracking_code: string;
  visitor_name: string;
  origin_address: string;
  destination_address: string;
  package_description: string | null;
  estimated_price: number;
  distance_km: number | null;
  estimated_duration_min: number | null;
  created_at: string;
  expires_at: string;
  status: string;
}

export function MotoboyPublicCalls() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rides, setRides] = useState<PublicRideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const fetchRides = async () => {
    const { data } = await supabase
      .from("public_rides")
      .select("id, tracking_code, visitor_name, origin_address, destination_address, package_description, estimated_price, distance_km, estimated_duration_min, created_at, expires_at, status")
      .eq("status", "aguardando_motoboy")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(20);

    setRides((data as PublicRideItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRides();

    // Realtime: novas chamadas públicas
    const channel = supabase
      .channel("public_calls_motoboy")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "public_rides" },
        () => { fetchRides(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAccept = async (rideId: string) => {
    if (!user?.id) {
      toast.error("Você precisa estar logado.");
      return;
    }
    setAccepting(rideId);
    try {
      const { data, error } = await supabase.rpc("accept_public_ride", {
        p_ride_id: rideId,
        p_motoboy_id: user.id,
      });

      if (error) throw error;

      if (data === true) {
        toast.success("🛵 Corrida aceita! Aguardando pagamento do cliente.");
        // Navegar para a página de detalhes da corrida aceita
        navigate(`/motoboy/corrida-publica/${rideId}`);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg text-foreground">Chamadas Públicas</h2>
          <p className="text-xs text-muted-foreground">Visitantes solicitando motoboy agora</p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-xl">
          <Bot className="w-3 h-3 text-[#FF6A00]" />
          <span className="text-[10px] font-bold text-[#FF6A00]">IA Viagg-TX8</span>
        </div>
      </div>

      {rides.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-zinc-100 flex items-center justify-center mx-auto">
            <Bike className="w-9 h-9 text-zinc-300" />
          </div>
          <p className="font-bold text-zinc-500">Nenhuma chamada pública no momento</p>
          <p className="text-xs text-zinc-400">Novas solicitações aparecerão aqui automaticamente</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rides.map((ride) => (
            <PublicCallCard
              key={ride.id}
              ride={ride}
              accepting={accepting === ride.id}
              onAccept={() => handleAccept(ride.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PublicCallCard({
  ride, accepting, onAccept,
}: {
  ride: PublicRideItem;
  accepting: boolean;
  onAccept: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState("");

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

      {/* Rota */}
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-2.5 h-2.5 text-green-600" />
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed">{ride.origin_address}</p>
        </div>
        <div className="ml-2.5 w-0.5 h-2 bg-zinc-200" />
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-2.5 h-2.5 text-red-600" />
          </div>
          <p className="text-xs text-zinc-600 leading-relaxed">{ride.destination_address}</p>
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

      {/* Botão aceitar */}
      <Button
        onClick={onAccept}
        disabled={accepting}
        className="w-full bg-[#FF6A00] hover:bg-[#e55a00] text-white font-black rounded-2xl h-11"
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
  );
}
