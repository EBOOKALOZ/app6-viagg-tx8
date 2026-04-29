import { useState, useEffect, useRef } from 'react';

interface WeatherRichData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  description: string;
  icon: string;
  iconUrl: string;
  cityName: string;
  pop: number; // Probability of precipitation (0 to 100)
  updatedAt: Date;
}

const API_KEY = 'c36eae0b93c1205aa8ba9fc30c61be3c';
const FALLBACK_LAT = -26.9194;
const FALLBACK_LNG = -49.0661;
const FALLBACK_CITY = 'Blumenau';
const CACHE_KEY = 'weatherRichCache';
const CACHE_TTL = 10 * 60 * 1000;

function loadCache(): { data: WeatherRichData; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.ts && Date.now() - parsed.ts < CACHE_TTL) {
      return { ...parsed, data: { ...parsed.data, updatedAt: new Date(parsed.data.updatedAt) } };
    }
  } catch { }
  return null;
}

function saveCache(data: WeatherRichData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { }
}

async function getCoords(): Promise<{ lat: number; lng: number } | null> {
  if (!('geolocation' in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    );
  });
}

export function useWeatherRich(lat?: number, lng?: number, fallbackCity?: string) {
  const cached = loadCache();
  const [weather, setWeather] = useState<WeatherRichData | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached?.data);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchWeather = async (signal?: AbortSignal) => {
    setError(false);
    console.log('[useWeatherRich] fetchWeather started with lat/lng/fallbackCity:', { lat, lng, fallbackCity });

    let locationQuery = '';

    if (lat != null && lng != null) {
      locationQuery = `lat=${lat}&lon=${lng}`;
    } else {
      console.log('[useWeatherRich] requesting getCoords()');
      const coords = await getCoords();
      if (coords) {
        console.log('[useWeatherRich] using GPS:', coords);
        locationQuery = `lat=${coords.lat}&lon=${coords.lng}`;
      } else if (fallbackCity) {
        console.log('[useWeatherRich] using fallbackCity:', fallbackCity);
        locationQuery = `q=${encodeURIComponent(fallbackCity)},BR`;
      } else {
        console.log('[useWeatherRich] using FALLBACK constants:', { FALLBACK_LAT, FALLBACK_LNG });
        locationQuery = `lat=${FALLBACK_LAT}&lon=${FALLBACK_LNG}`;
      }
    }

    try {
      // Execute both requests concurrently (current weather + forecast for precipitation)
      const currentUrl = `https://api.openweathermap.org/data/2.5/weather?${locationQuery}&appid=${API_KEY}&units=metric&lang=pt_br`;
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?${locationQuery}&appid=${API_KEY}&units=metric&lang=pt_br&cnt=2`;

      const [currentRes, forecastRes] = await Promise.all([
        fetch(currentUrl, { signal }),
        fetch(forecastUrl, { signal })
      ]);

      if (!currentRes.ok) {
        console.error('[useWeatherRich] API Error status:', currentRes.status, currentRes.statusText);
        throw new Error('API error');
      }

      const d = await currentRes.json();

      let popValue = 0;
      if (forecastRes.ok) {
        const f = await forecastRes.json();
        // POP is returned as 0..1, meaning we multiply by 100 to get percentage
        if (f.list && f.list.length > 0) {
          popValue = Math.round(f.list[0].pop * 100);
        }
      }

      console.log('[useWeatherRich] OpenWeatherMap response success', d, popValue);

      const data: WeatherRichData = {
        temperature: Math.round(d.main.temp),
        feelsLike: Math.round(d.main.feels_like),
        humidity: d.main.humidity,
        windSpeed: Math.round((d.wind.speed * 3.6)),
        description: d.weather[0].description.charAt(0).toUpperCase() + d.weather[0].description.slice(1),
        icon: mapIcon(d.weather[0].icon),
        iconUrl: `https://openweathermap.org/img/wn/${d.weather[0].icon}@2x.png`,
        cityName: d.name || fallbackCity || FALLBACK_CITY,
        pop: popValue,
        updatedAt: new Date(),
      };

      saveCache(data);
      setWeather(data);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[useWeatherRich] Fetch aborted');
        return;
      }
      console.error('[useWeatherRich] Error fetching weather:', err);
      setError(true);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Use cache for initial render, but still refresh
    if (cached?.data && Date.now() - (cached.ts ?? 0) < CACHE_TTL) {
      setWeather(cached.data);
      setLoading(false);
    }

    const ctrl = new AbortController();
    fetchWeather(ctrl.signal);

    const interval = setInterval(() => {
      fetchWeather();
    }, 900_000); // 15 minutos

    return () => {
      ctrl.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, fallbackCity]);

  const minutesAgo = weather
    ? Math.max(0, Math.round((Date.now() - weather.updatedAt.getTime()) / 60000))
    : 0;

  return { weather, loading, error, minutesAgo };
}

function mapIcon(owmIcon: string): string {
  const map: Record<string, string> = {
    '01d': '☀️', '01n': '🌙',
    '02d': '🌤️', '02n': '☁️',
    '03d': '⛅', '03n': '⛅',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '🌨️', '13n': '🌨️',
    '50d': '🌫️', '50n': '🌫️',
  };
  return map[owmIcon] ?? '🌡️';
}
