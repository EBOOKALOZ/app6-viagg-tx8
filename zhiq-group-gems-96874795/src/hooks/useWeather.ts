import { useState, useEffect, useRef } from 'react';

interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
  icon: string;
}

const WMO_MAP: Record<number, { description: string; icon: string }> = {
  0: { description: 'Céu limpo', icon: '☀️' },
  1: { description: 'Predominantemente limpo', icon: '🌤️' },
  2: { description: 'Parcialmente nublado', icon: '⛅' },
  3: { description: 'Nublado', icon: '☁️' },
  45: { description: 'Neblina', icon: '🌫️' },
  48: { description: 'Neblina com geada', icon: '🌫️' },
  51: { description: 'Garoa leve', icon: '🌦️' },
  53: { description: 'Garoa moderada', icon: '🌦️' },
  55: { description: 'Garoa forte', icon: '🌧️' },
  61: { description: 'Chuva leve', icon: '🌧️' },
  63: { description: 'Chuva moderada', icon: '🌧️' },
  65: { description: 'Chuva forte', icon: '🌧️' },
  71: { description: 'Neve leve', icon: '🌨️' },
  73: { description: 'Neve moderada', icon: '🌨️' },
  75: { description: 'Neve forte', icon: '❄️' },
  80: { description: 'Pancadas leves', icon: '🌦️' },
  81: { description: 'Pancadas moderadas', icon: '🌧️' },
  82: { description: 'Pancadas fortes', icon: '⛈️' },
  95: { description: 'Tempestade', icon: '⛈️' },
  96: { description: 'Tempestade com granizo', icon: '⛈️' },
  99: { description: 'Tempestade severa', icon: '⛈️' },
};

function resolveWMO(code: number) {
  return WMO_MAP[code] ?? { description: 'Indisponível', icon: '🌡️' };
}

// Simple in-memory cache (10 min TTL)
const cache: Record<string, { data: WeatherData; ts: number }> = {};
const CACHE_TTL = 10 * 60 * 1000;

export function useWeather(lat: number | undefined, lng: number | undefined) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (lat == null || lng == null) return;

    const key = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
    const cached = cache[key];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setWeather(cached.data);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=America%2FSao_Paulo`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((d) => {
        if (d?.current_weather) {
          const wmo = resolveWMO(d.current_weather.weathercode);
          const data: WeatherData = {
            temperature: Math.round(d.current_weather.temperature),
            weatherCode: d.current_weather.weathercode,
            description: wmo.description,
            icon: wmo.icon,
          };
          cache[key] = { data, ts: Date.now() };
          setWeather(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [lat, lng]);

  return { weather, loading };
}
