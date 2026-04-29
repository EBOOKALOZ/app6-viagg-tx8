import { useWeather } from '@/hooks/useWeather';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { DollarSign } from 'lucide-react';

// Default coords: São Paulo
const DEFAULT_LAT = -23.55;
const DEFAULT_LNG = -46.63;

export function InfoStrip() {
  const { weather } = useWeather(DEFAULT_LAT, DEFAULT_LNG);
  const { rate } = useExchangeRate();

  if (!weather && !rate) return null;

  return (
    <div className="flex items-center justify-center gap-4 flex-wrap py-2 px-4 bg-white/5 backdrop-blur-sm">
      {weather && (
        <span className="flex items-center gap-1.5 text-xs text-white/80">
          <span className="text-sm">{weather.icon}</span>
          <span className="font-medium text-white">{weather.temperature}°C</span>
          <span className="hidden sm:inline">· {weather.description}</span>
        </span>
      )}
      {rate && (
        <span className="flex items-center gap-1.5 text-xs text-white/80">
          <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-medium text-white">USD/BRL {rate.usdBrl.toFixed(2)}</span>
        </span>
      )}
    </div>
  );
}
