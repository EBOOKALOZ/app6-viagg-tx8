import { useWeatherRich } from '@/hooks/useWeatherRich';
import { Droplets, Wind, Thermometer, Clock } from 'lucide-react';

export function WeatherCard() {
  const { weather, loading, error, minutesAgo } = useWeatherRich();

  if (loading && !weather) {
    return (
      <div className="rounded-2xl p-6 min-h-[220px] animate-pulse" style={{ background: 'linear-gradient(135deg, #145A3E 0%, #1A7A52 100%)' }}>
        <div className="h-4 w-24 rounded bg-white/20 mb-4" />
        <div className="h-10 w-20 rounded bg-white/20" />
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div className="rounded-2xl p-6 min-h-[220px] flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #145A3E 0%, #1A7A52 100%)' }}>
        <p className="text-sm text-white/60">Clima indisponível</p>
      </div>
    );
  }

  if (!weather) return null;

  return (
    <div
      className="relative rounded-2xl p-6 overflow-hidden animate-fade-in"
      style={{ background: 'linear-gradient(135deg, #145A3E 0%, #1A7A52 100%)' }}
    >
      <span className="absolute -right-4 -top-2 text-[120px] leading-none opacity-10 pointer-events-none select-none">
        {weather.icon}
      </span>

      <div className="relative z-10 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Clima agora</p>

        <div className="flex items-start gap-3">
          <span className="text-5xl leading-none">{weather.icon}</span>
          <div>
            <p className="text-4xl font-bold text-white leading-none">{weather.temperature}°C</p>
            <p className="text-sm text-white/80 mt-1">{weather.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-white/70">
            <Thermometer className="h-3.5 w-3.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wide">Sensação</p>
              <p className="text-sm font-semibold text-white">{weather.feelsLike}°C</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-white/70">
            <Droplets className="h-3.5 w-3.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wide">Umidade</p>
              <p className="text-sm font-semibold text-white">{weather.humidity}%</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-white/70">
            <Wind className="h-3.5 w-3.5" />
            <div>
              <p className="text-[10px] uppercase tracking-wide">Vento</p>
              <p className="text-sm font-semibold text-white">{weather.windSpeed} km/h</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-white/50">{weather.cityName}</p>
          <p className="text-[11px] text-white/50 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {minutesAgo === 0 ? 'Agora' : `Atualizado há ${minutesAgo} min`}
          </p>
        </div>
      </div>
    </div>
  );
}
