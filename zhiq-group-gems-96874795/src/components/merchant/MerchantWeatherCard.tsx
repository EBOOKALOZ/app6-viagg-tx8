import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useWeatherRich } from '@/hooks/useWeatherRich';
import { MapPin, Wind, Droplets, Clock, Store } from 'lucide-react';

interface StoreLocation {
  lat: number | undefined;
  lng: number | undefined;
  label: string;
}

export function MerchantWeatherCard() {
  const { user } = useAuth();
  const [storeLocation, setStoreLocation] = useState<StoreLocation>({
    lat: undefined,
    lng: undefined,
    label: 'Região da loja',
  });

  // Fetch store location from merchant_stores
  useEffect(() => {
    if (!user?.id) return;

    const fetchStore = async () => {
      const { data } = await (supabase.from('profiles') as any)
        .select('store_latitude, store_longitude, cidade, estado')
        .eq('id', user.id)
        .maybeSingle();

      if (!data) return;

      if (data.store_latitude && data.store_longitude) {
        setStoreLocation({
          lat: data.store_latitude,
          lng: data.store_longitude,
          label: data.cidade ? `${data.cidade}` : 'Região da loja',
        });
      } else if (data.cidade) {
        // Fallback: use city name via geocoding-free approach
        // OpenWeatherMap accepts city,state,BR as query — but our hook uses lat/lng.
        // We'll use a simple lookup for known cities or leave undefined to trigger hook fallback.
        setStoreLocation({
          lat: undefined,
          lng: undefined,
          label: `${data.cidade}${data.estado ? ` - ${data.estado}` : ''}`,
        });
      }
    };

    fetchStore();

    // Listener para o evento customizado disparado no save do formulário
    const handleProfileUpdate = () => {
      fetchStore();
    };

    window.addEventListener('merchantProfileUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('merchantProfileUpdated', handleProfileUpdate);
    };
  }, [user?.id]);

  const { weather, loading, error, minutesAgo } = useWeatherRich(
    storeLocation.lat,
    storeLocation.lng
  );

  if (loading) {
    return (
      <div className="rounded-xl bg-muted/40 border border-border/40 p-3 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-muted/60" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted/60 rounded" />
            <div className="h-3 w-32 bg-muted/40 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="rounded-xl bg-muted/40 border border-border/40 p-3">
        <p className="text-xs text-muted-foreground text-center">🌡️ Clima indisponível</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-emerald-950/30 dark:to-green-950/20 border border-green-200/60 dark:border-emerald-800/40 p-3 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        {/* Icon + temp */}
        <div className="flex items-center gap-2">
          <span className="text-3xl leading-none">{weather.icon}</span>
          <span className="text-2xl font-bold text-foreground tracking-tight">
            {weather.temperature}°
          </span>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {weather.description}
          </p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
            <span className="flex items-center gap-0.5">
              <Wind className="h-3 w-3" /> {weather.windSpeed} km/h
            </span>
            <span className="flex items-center gap-0.5">
              <Droplets className="h-3 w-3" /> {weather.humidity}%
            </span>
          </div>
        </div>

        {/* Location + updated */}
        <div className="text-right shrink-0">
          <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 justify-end">
            <Store className="h-3 w-3" /> {weather.cityName || storeLocation.label}
          </p>
          <p className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5 justify-end mt-0.5">
            <Clock className="h-2.5 w-2.5" />
            {minutesAgo === 0 ? 'Agora' : `${minutesAgo} min atrás`}
          </p>
        </div>
      </div>
    </div>
  );
}
