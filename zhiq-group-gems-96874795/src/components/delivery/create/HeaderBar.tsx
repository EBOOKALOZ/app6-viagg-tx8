import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { WeatherBadge } from "@/components/weather/WeatherBadge";

interface HeaderBarProps {
  onBack: () => void;
  lat?: number;
  lng?: number;
}

export function HeaderBar({ onBack, lat, lng }: HeaderBarProps) {
  return (
    <header className="px-4 py-3 border-b border-border flex items-center justify-between bg-card">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1 className="text-base font-semibold text-foreground">Nova Entrega</h1>
      <WeatherBadge lat={lat} lng={lng} />
    </header>
  );
}
