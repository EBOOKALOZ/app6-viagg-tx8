import { useWeather } from '@/hooks/useWeather';

interface WeatherBadgeProps {
  lat: number | undefined;
  lng: number | undefined;
  cityLabel?: string;
}

export function WeatherBadge({ lat, lng, cityLabel }: WeatherBadgeProps) {
  const { weather, loading } = useWeather(lat, lng);

  if (loading || !weather) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 text-xs text-muted-foreground w-fit">
      <span className="text-base leading-none">{weather.icon}</span>
      <span className="font-medium text-foreground">{weather.temperature}°C</span>
      <span className="hidden sm:inline">·</span>
      <span className="hidden sm:inline">{weather.description}</span>
      {cityLabel && (
        <>
          <span>·</span>
          <span className="truncate max-w-[140px]">{cityLabel}</span>
        </>
      )}
    </div>
  );
}
