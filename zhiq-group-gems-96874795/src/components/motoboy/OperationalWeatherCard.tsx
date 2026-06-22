import { useEffect, useState } from 'react';
import { useWeatherRich } from '@/hooks/useWeatherRich';
import { MapPin, Wind, Droplets, Clock, CloudOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function OperationalWeatherCard() {
  const { user } = useAuth();
  const [fallbackCity, setFallbackCity] = useState<string | undefined>();

  useEffect(() => {
    if (!user?.id) return;
    const fetchCity = async () => {
      const { data, error } = await supabase.rpc('get_motoboy_operational_profile' as any);
      if (error) console.error('[OperationalWeatherCard] erro RPC:', error);
      if ((data as any)?.cidade) {
        setFallbackCity((data as any).cidade);
      }
    };
    fetchCity();
  }, [user?.id]);

  const { weather, loading, error, minutesAgo } = useWeatherRich(
    undefined,
    undefined,
    fallbackCity
  );

  // ALWAYS render — never return null
  return (
    <div className="rounded-2xl bg-[#FFFBF5] border border-orange-100/50 shadow-sm p-4 w-full text-left">
      {loading ? (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="flex gap-4 items-center">
            <div className="w-14 h-14 rounded-full bg-orange-100/60" />
            <div className="space-y-2">
              <div className="h-6 w-20 bg-orange-100/60 rounded" />
              <div className="h-4 w-24 bg-orange-50/60 rounded" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-32 bg-orange-50/50 rounded" />
            <div className="h-3 w-40 bg-orange-50/50 rounded" />
          </div>
        </div>
      ) : !weather || error ? (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <CloudOff className="h-8 w-8 text-orange-300 mb-1" />
          <p className="text-sm font-medium text-orange-800">Não foi possível carregar o clima</p>
          <p className="text-xs text-orange-600/70">Tente novamente mais tarde</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">

          {/* Main Line: Icon + Temp + Condition */}
          <div className="flex items-center gap-3">
            <div className="bg-white/60 p-2 rounded-xl border border-orange-100 shadow-sm flex items-center justify-center min-w-[3.5rem] min-h-[3.5rem]">
              <span className="text-4xl leading-none" role="img" aria-label={weather.description}>{weather.icon}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-extrabold text-orange-950 tracking-tight">
                {weather.temperature}°C
              </span>
              <span className="text-sm font-medium text-orange-800/80 capitalize">
                {weather.description}
              </span>
            </div>
          </div>

          {/* Location and Feels Like */}
          <div className="flex flex-col mt-1 gap-1">
            <div className="flex items-center gap-1.5 text-orange-900/90 text-sm font-medium">
              <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
              <span className="truncate">{weather.cityName}</span>
            </div>
            <div className="text-xs text-orange-700/80 pl-5">
              Sensação térmica: <span className="font-semibold">{weather.feelsLike}°C</span>
            </div>
          </div>

          {/* Details Row: Wind & Rain */}
          <div className="flex items-center gap-4 mt-2 text-xs font-medium text-orange-800/80 bg-orange-50/50 rounded-lg p-2.5 border border-orange-100/50">
            <div className="flex items-center gap-1.5">
              <Droplets className="h-3.5 w-3.5 text-blue-500" />
              <span>Chuva: <span className="font-semibold">{weather.pop}%</span></span>
            </div>
            <div className="w-px h-3 bg-orange-200/50" />
            <div className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-slate-400" />
              <span>Vento: <span className="font-semibold">{weather.windSpeed} km/h</span></span>
            </div>
          </div>

          {/* Rain Warning Alert */}
          {weather.pop > 40 && (
            <div className="mt-1 bg-yellow-50 text-yellow-800 text-xs font-medium px-3 py-2 rounded-lg border border-yellow-200/60 shadow-sm flex items-start gap-2">
              <span className="text-sm">⚠️</span>
              <span>Possibilidade de chuva nas próximas horas. Dirija com cuidado!</span>
            </div>
          )}

          <div className="flex justify-end mt-1">
            <p className="text-[10px] text-orange-400 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {minutesAgo === 0 ? 'Atualizado agora' : `Atualizado há ${minutesAgo} min`}
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
