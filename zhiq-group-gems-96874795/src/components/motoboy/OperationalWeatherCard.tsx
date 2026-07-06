import { useEffect, useState } from 'react';
import { useWeatherRich } from '@/hooks/useWeatherRich';
import { MapPin, Wind, Droplets, Clock, CloudOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface OperationalWeatherCardProps {
  /** Cidade/estado do CADASTRO — os layouts dos painéis já buscam esses valores
   *  para o cabeçalho; passar aqui garante que o card mostre exatamente o mesmo. */
  city?: string;
  state?: string;
}

export function OperationalWeatherCard({ city: cityProp, state: stateProp }: OperationalWeatherCardProps) {
  const { user, activeProfile } = useAuth();
  const [aerialFailed, setAerialFailed] = useState(false);

  const [city, setCity] = useState<string | undefined>(undefined);
  const [state, setState] = useState<string | undefined>(undefined);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [resolved, setResolved] = useState(false);

  /* Clima SEMPRE da cidade em que o usuário se CADASTROU (não GPS, não residência).
     Fonte: prop do layout > RPC operacional > motoboy_profiles/driver_profiles. */
  useEffect(() => {
    // 'Cidade'/'UF' são placeholders dos layouts quando o cadastro está incompleto
    if (cityProp && cityProp !== 'Cidade') {
      setCity(cityProp);
      setState(stateProp !== 'UF' ? stateProp : undefined);
      return; // `resolved` é marcado no geocode abaixo
    }
    if (!user?.id) return;
    let cancelled = false;
    const fetchCity = async () => {
      try {
        const { data: rpc } = await supabase.rpc('get_motoboy_operational_profile' as any);
        const d = rpc as any;
        if (d?.cidade) {
          if (!cancelled) { setCity(d.cidade); setState(d.estado); }
          return;
        }
        const tables = activeProfile === 'driver'
          ? ['driver_profiles', 'motoboy_profiles']
          : ['motoboy_profiles', 'driver_profiles'];
        for (const table of tables) {
          const { data } = await (supabase.from(table) as any)
            .select('cidade, estado')
            .eq('user_id', user.id)
            .maybeSingle();
          if (data?.cidade) {
            if (!cancelled) { setCity(data.cidade); setState(data.estado); }
            return;
          }
        }
        if (!cancelled) setResolved(true); // sem cidade cadastrada → libera fallback do hook
      } catch {
        if (!cancelled) setResolved(true);
      }
    };
    fetchCity();
    return () => { cancelled = true; };
  }, [user?.id, activeProfile, cityProp, stateProp]);

  /* Geocodifica "cidade estado Brasil" via Mapbox → coordenadas exatas da cidade
     cadastrada. Evita o casamento por nome do OpenWeather, que erra em cidades
     pequenas/homônimas. Sem token ou falha → hook busca por q=cidade,BR. */
  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    const geocode = async () => {
      try {
        const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
        if (token) {
          const q = encodeURIComponent(`${city} ${state ?? ''} Brasil`.trim());
          const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?types=place&country=BR&limit=1&language=pt&access_token=${token}`
          );
          if (res.ok) {
            const json = await res.json();
            const center = json?.features?.[0]?.center;
            if (center && !cancelled) setCoords({ lng: center[0], lat: center[1] });
          }
        }
      } catch {
        // segue sem coords
      } finally {
        if (!cancelled) setResolved(true);
      }
    };
    geocode();
    return () => { cancelled = true; };
  }, [city, state]);

  const { weather, loading, error, minutesAgo } = useWeatherRich(coords?.lat, coords?.lng, city, resolved);

  /* Vista aérea (satélite) da cidade cadastrada — imagem estática do Mapbox
     nas mesmas coordenadas geocodificadas usadas para o clima */
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  const aerialUrl = coords && mapboxToken && !aerialFailed
    ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${coords.lng},${coords.lat},13,0/112x112@2x?access_token=${mapboxToken}`
    : undefined;

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
        <div className="relative bg-white rounded-xl border border-orange-100 shadow-sm flex items-center justify-center w-14 h-14 shrink-0">
          {aerialUrl ? (
            <>
              <img
                src={aerialUrl}
                alt={`Vista aérea de ${city || 'sua cidade'}`}
                className="w-full h-full object-cover rounded-xl"
                loading="lazy"
                onError={() => setAerialFailed(true)}
              />
              {/* Selo do clima sobre a vista aérea */}
              <span
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white border border-orange-100 shadow-sm flex items-center justify-center text-base leading-none"
                role="img"
                aria-label={weather.description}
              >
                {weather.icon}
              </span>
            </>
          ) : (
            <span className="text-4xl leading-none" role="img" aria-label={weather.description}>
              {weather.icon}
            </span>
          )}
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
        <span className="text-sm font-semibold truncate">{city || weather.cityName}</span>
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
