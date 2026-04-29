import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MapPin, Navigation, Clock, Ruler, Banknote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface OfferWithOrder {
  id: string;
  offer_status: string;
  service_order_id: string;
  created_at: string;
  commission_percent: number | null;
  gross_value: number | null;
  net_value: number | null;
  service_orders: {
    id: string;
    pickup_location: string | null;
    destination: string | null;
    distance_km: number | null;
    estimated_duration_sec: number | null;
    estimated_value: number | null;
  } | null;
}

export default function MotoboyCorridasEmEspera() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<OfferWithOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const loadOpenOffers = useCallback(async () => {
    if (!user?.id) return;
    
    console.log("[MotoboyCorridas] Carregando ofertas para:", user.id);
    
    const { data, error } = await supabase
      .from("delivery_offers")
      .select(`
        id,
        offer_status,
        service_order_id,
        created_at,
        commission_percent,
        gross_value,
        net_value,
        service_orders (
          id,
          pickup_location,
          destination,
          distance_km,
          estimated_duration_sec,
          estimated_value
        )
      `)
      .eq("offer_status", "pending")
      .eq("professional_uid", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[MotoboyCorridas] Erro ao carregar ofertas:", error);
    } else if (data) {
      setOffers(data as unknown as OfferWithOrder[]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadOpenOffers(); }, [loadOpenOffers]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`motoboy-offers-${user.id}`)
      .on(
        "postgres_changes", 
        { 
          event: "*", 
          schema: "public", 
          table: "delivery_offers",
          filter: `professional_uid=eq.${user.id}`
        }, 
        () => {
          loadOpenOffers();
        }
      )
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [loadOpenOffers, user?.id]);

  async function aceitarCorrida(offer: OfferWithOrder) {
    if (!user || accepting) return;
    setAccepting(offer.id);
    
    try {
      console.log("[MotoboyCorridas] Aceitando pedido:", offer.service_order_id);
      
      const { error } = await supabase.rpc("accept_service_order", {
        p_order_id: offer.service_order_id,
      });

      if (error) {
        console.error("[MotoboyCorridas] Erro RPC:", error);
        toast.error(error.message || "Erro ao aceitar corrida");
        return;
      }

      toast.success("Corrida aceita com sucesso!");
      setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    } catch (err) {
      console.error("[MotoboyCorridas] Erro inesperado:", err);
      toast.error("Erro interno ao processar aceite");
    } finally {
      setAccepting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Corridas em Espera</h1>

      {offers.length === 0 && (
        <div className="text-muted-foreground text-center py-16">
          Nenhuma corrida disponível no momento.
        </div>
      )}

      {offers.map((offer) => {
        const order = offer.service_orders;
        const tempoEstimado = order?.estimated_duration_sec 
          ? Math.ceil(order.estimated_duration_sec / 60)
          : (order?.distance_km ? Math.ceil(order.distance_km * 3) : null);
          
        const ganhoReal = offer.net_value != null
          ? (offer.net_value / 100).toFixed(2)
          : order?.estimated_value != null
            ? (order.estimated_value * (1 - (offer.commission_percent ?? 25) / 100)).toFixed(2)
            : null;

        return (
          <Card key={offer.id} className="p-4 shadow-md border-border/60 overflow-hidden bg-card hover:border-primary/30 transition-colors">
            {/* Topo — Coleta + Badge comissão */}
            <div className="flex justify-between items-start mb-2 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Coleta
                </p>
                <p className="font-semibold text-sm truncate">
                  {order?.pickup_location ?? "—"}
                </p>
              </div>
              {offer.commission_percent != null && (
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 shrink-0">
                  {offer.commission_percent}%
                </Badge>
              )}
            </div>

            {/* Destino */}
            <div className="mb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Navigation className="h-3 w-3" /> Destino
              </p>
              <p className="font-semibold text-sm truncate">
                {order?.destination ?? "—"}
              </p>
            </div>

            {/* Métricas */}
            <div className="flex justify-between text-xs text-muted-foreground mb-3">
              {order?.distance_km != null && (
                <span className="flex items-center gap-1">
                  <Ruler className="h-3.5 w-3.5" /> {Number(order.distance_km).toFixed(1)} km
                </span>
              )}
              {tempoEstimado != null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {tempoEstimado} min
                </span>
              )}
              {order?.estimated_value != null && (
                <span className="flex items-center gap-1">
                  <Banknote className="h-3.5 w-3.5" /> R$ {Number(order.estimated_value).toFixed(2)}
                </span>
              )}
            </div>

            {/* Ganho Real */}
            {ganhoReal && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-3 text-center">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-0.5">Você recebe</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  R$ {ganhoReal}
                </p>
              </div>
            )}

            {/* CTA */}
            <Button
              className="w-full h-12 text-base font-bold bg-orange-500 hover:bg-orange-600 text-white"
              disabled={accepting === offer.id}
              onClick={() => aceitarCorrida(offer)}
            >
              {accepting === offer.id ? "ACEITANDO…" : "ACEITAR CORRIDA"}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
