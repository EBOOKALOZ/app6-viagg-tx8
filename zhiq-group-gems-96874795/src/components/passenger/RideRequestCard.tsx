import { useState } from "react";
import { MapPin, Navigation, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RideRequestCardProps {
  onRequestRide: (pickup: string, destination: string) => void;
  isLoading?: boolean;
  balance: number;
}

const RideRequestCard = ({ onRequestRide, isLoading, balance }: RideRequestCardProps) => {
  const [pickup, setPickup] = useState("Localização atual");
  const [destination, setDestination] = useState("");

  const handleSubmit = () => {
    if (destination.trim()) {
      onRequestRide(pickup, destination);
    }
  };

  const hasBalance = balance > 0;

  return (
    <div className="bg-card rounded-2xl p-5 shadow-2xl border border-border/50 backdrop-blur-sm">
      {/* Balance display */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-foreground">Para onde você quer ir?</h3>
        <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${hasBalance ? 'bg-zhiq-teal/20 text-zhiq-teal border border-zhiq-teal/30' : 'bg-destructive/20 text-destructive border border-destructive/30'}`}>
          {balance} {balance === 1 ? 'corrida' : 'corridas'}
        </div>
      </div>
      
      <div className="space-y-3">
        {/* Pickup location */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-zhiq-teal ring-4 ring-zhiq-teal/20" />
          <Input
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="Onde você está?"
            className="pl-10 bg-muted/50 border-0 h-12 text-foreground placeholder:text-muted-foreground/60"
          />
        </div>

        {/* Connector line */}
        <div className="flex items-center pl-4">
          <div className="w-0.5 h-5 bg-gradient-to-b from-zhiq-teal to-zhiq-gold rounded-full" />
        </div>

        {/* Destination */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Navigation className="w-3.5 h-3.5 text-zhiq-gold" />
          </div>
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Digite seu destino"
            className="pl-10 bg-muted/50 border-0 h-12 text-foreground placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Quick destinations */}
      <div className="flex gap-2 mt-5 overflow-x-auto pb-2 scrollbar-hide">
        {["Casa", "Trabalho", "Shopping", "Aeroporto"].map((place) => (
          <Button
            key={place}
            variant="outline"
            size="sm"
            onClick={() => setDestination(place)}
            className="whitespace-nowrap rounded-full text-xs border-border/50 hover:bg-muted hover:border-zhiq-teal/50 transition-colors"
          >
            {place}
          </Button>
        ))}
      </div>

      {/* Request button */}
      <Button
        onClick={handleSubmit}
        disabled={!destination.trim() || isLoading || !hasBalance}
        className="w-full h-14 mt-5 bg-gradient-to-r from-zhiq-teal via-zhiq-green to-zhiq-teal bg-[length:200%_100%] hover:bg-[position:100%_0] text-white font-bold text-lg rounded-xl shadow-lg shadow-zhiq-teal/40 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {isLoading ? (
          <span className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Processando...
          </span>
        ) : !hasBalance ? (
          <span className="flex items-center gap-2 text-white/80">
            Sem créditos disponíveis
          </span>
        ) : (
          <span className="flex items-center gap-2">
            Pedir Corrida Agora
            <ChevronRight className="h-5 w-5" />
          </span>
        )}
      </Button>

      {/* Neutral status */}
      {!isLoading && hasBalance && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          Nenhuma corrida em andamento
        </p>
      )}
    </div>
  );
};

export default RideRequestCard;
