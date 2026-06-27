import { useEffect, useState } from 'react';
import { useWeatherRich } from '@/hooks/useWeatherRich';
import { MapPin, Wind, Droplets, Clock, CloudOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface MotoboyLocation {
  lat?: number;
  lng?: number;
  city?: string;
}

export function OperationalWeatherCard() {
  const { user } = useAuth();
  const [loc, setLoc] = useState<MotoboyLocation>({});

  useEffect(() => {
    if (!user?.id) return;
    const fetchLocation = async () => {
      const { data } = await supabase.rpc('get_motoboy_operational_profile' as any);
      if (!data) return;
      const d = data as any;
      // Coordenadas de residência são mais precisas que GPS em área de atuação
      if (d.latitude_residencia && d.longitude_residencia) {
        setLoc({ lat: d.latitude_residencia, lng: d.longitude_residencia, city: d.cidade });
      } else if (d.cidade) {
        setLoc({ city: d.cidade });
      }
    };
    fetchLocation();
  }, [user?.id]);

  const { weather, loading, error, minutesAgo } = useWeatherRich(loc.lat, loc.lng, loc.city);

  if (loading) {
    return (
      <div className="rounded-2xl bg-[#FFFBF5] border border-orange-100 shadow-sm p-4 animate-pulse space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-orange-100/60" />
          <div className="space-y-2 flex-1">
            <div className="h-7 w-20 bg-orange-100/60 rounded" />
            <div className="h-4 w-28 bg-orange-50/60 rounded" />
          </div>
        </div>
        <div className="h-3 w-40 bg-orange-50/50 rounded" />
        <div className="h-8 w-full bg-orange-50/40 rounded-lg" />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="rounded-2xl bg-[#FFFBF5] border border-orange-100 shadow-sm p-4 flex flex-col items-center gap-2 py-6">
        <CloudOff className="h-8 w-8 text-orange-300" />
        <p className="text-sm font-medium text-orange-800">Clima indisponível</p>
        <p className="text-xs text-orange-500">Tente novamente mais tarde</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#FFFBF5] border border-orange-100 shadow-sm p-4 space-y-3 animate-in fade-in duration-500">

      {/* Linha principal: ícone + temperatura + condição */}
      <div className="flex items-center gap-3">
        <div className="bg-white rounded-xl border border-orange-100 shadow-sm flex items-center justify-center w-14 h-14 shrink-0">
          <span className="text-4xl leading-none" role="img" aria-label={weather.description}>
            {weather.icon}
          </span>
        </div>
        <div>
          <p className="text-3xl font-extrabold text-orange-950 tracking-tight leading-none">
            {weather.temperature}°C
          </p>
          <p className="text-sm font-medium text-orange-800/80 capitalize mt-0.5">
            {weather.description}
          </p>
        </div>
      </div>

      {/* Localização */}
      <div className="flex items-center gap-1.5 text-orange-900/90">
        <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
        <span className="text-sm font-semibold truncate">{weather.cityName || loc.city}</span>
        <span className="text-xs text-orange-600/70 ml-1">
          · Sensação: <span className="font-medium">{weather.feelsLike}°C</span>
        </span>
      </div>

      {/* Chuva e vento */}
      <div className="flex items-center gap-4 bg-orange-50/60 rounded-xl px-3 py-2 border border-orange-100/60 text-xs font-medium text-orange-800/80">
        <div className="flex items-center gap-1.5">
          <Droplets className="h-3.5 w-3.5 text-blue-400" />
          Chuva: <span className="font-semibold ml-0.5">{weather.pop}%</span>
        </div>
        <div className="w-px h-3 bg-orange-200" />
        <div className="flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5 text-slate-400" />
          Vento: <span className="font-semibold ml-0.5">{weather.windSpeed} km/h</span>
        </div>
      </div>

      {/* Alerta de chuva */}
      {weather.pop > 40 && (
        <div className="bg-yellow-50 border border-yellow-200/60 rounded-xl px-3 py-2 text-xs font-medium text-yellow-800 flex items-start gap-2">
          <span>⚠️</span>
          <span>Possibilidade de chuva. Dirija com cuidado!</span>
        </div>
      )}

      {/* Atualizado */}
      <div className="flex justify-end">
        <p className="text-[10px] text-orange-400 flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {minutesAgo === 0 ? 'Atualizado agora' : `Atualizado há ${minutesAgo} min`}
        </p>
      </div>

    </div>
  );
}
