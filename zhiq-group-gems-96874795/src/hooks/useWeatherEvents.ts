import { useEffect, useState } from 'react';

/**
 * useWeatherEvents — previsão das próximas horas (OpenWeatherMap /forecast, passos de 3h)
 * + índice UV via Open-Meteo (grátis, sem chave). Mesma chave/local do useWeatherRich.
 */

export type WeatherCategory =
  | 'sun' | 'partly' | 'clouds' | 'rain' | 'storm' | 'fog' | 'wind' | 'snow';

export interface WeatherEvent {
  at: Date;
  hourLabel: string;      // "11:00" (primeiro slot = "Agora" na UI)
  icon: string;           // emoji
  title: string;          // descrição pt-br capitalizada
  category: WeatherCategory;
  intensity: 'leve' | 'moderada' | 'forte';
  temp: number;
  pop: number;            // 0-100
  rainMm: number;         // volume 3h
  windKmh: number;
  gustKmh: number;
  score: number;          // 0-100 p/ barra de intensidade
}

export interface WeatherExtras {
  humidity: number;
  gustKmh: number;
  feelsLike: number;
  uvIndex: number | null;
  visibilityKm: number;
  pressure: number;
}

const API_KEY = 'c36eae0b93c1205aa8ba9fc30c61be3c';
const CACHE_TTL = 10 * 60 * 1000;

function categorize(id: number, icon: string, gustKmh: number): { cat: WeatherCategory; emoji: string } {
  const night = icon.endsWith('n');
  if (id >= 200 && id < 300) return { cat: 'storm', emoji: '⛈️' };
  if (id >= 300 && id < 600) return { cat: 'rain', emoji: id >= 500 && id < 502 && !night ? '🌦️' : '🌧️' };
  if (id >= 600 && id < 700) return { cat: 'snow', emoji: '🌨️' };
  if (id >= 700 && id < 800) return { cat: 'fog', emoji: '🌫️' };
  if (gustKmh >= 45) return { cat: 'wind', emoji: '💨' };
  if (id === 800) return { cat: 'sun', emoji: night ? '🌙' : '☀️' };
  if (id === 801 || id === 802) return { cat: 'partly', emoji: night ? '☁️' : '🌤️' };
  return { cat: 'clouds', emoji: '☁️' };
}

function intensityOf(cat: WeatherCategory, rainMm: number, pop: number, gustKmh: number): 'leve' | 'moderada' | 'forte' {
  if (cat === 'storm') return 'forte';
  if (cat === 'rain' || cat === 'snow') {
    if (rainMm >= 7) return 'forte';
    if (rainMm >= 2 || pop >= 70) return 'moderada';
    return 'leve';
  }
  if (cat === 'wind') return gustKmh >= 60 ? 'forte' : 'moderada';
  return 'leve';
}

function scoreOf(cat: WeatherCategory, e: { rainMm: number; pop: number; gustKmh: number }): number {
  if (cat === 'storm') return Math.min(100, 80 + e.rainMm * 2);
  if (cat === 'rain' || cat === 'snow') return Math.min(90, 25 + e.pop * 0.4 + e.rainMm * 6);
  if (cat === 'wind') return Math.min(75, e.gustKmh);
  if (cat === 'clouds') return 22;
  if (cat === 'fog') return 30;
  if (cat === 'partly') return 12;
  return 6; // sol
}

export function useWeatherEvents(lat?: number, lng?: number, city?: string, enabled = true) {
  const [events, setEvents] = useState<WeatherEvent[]>([]);
  const [extras, setExtras] = useState<WeatherExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const locKey = lat != null && lng != null
    ? `${lat.toFixed(3)},${lng.toFixed(3)}`
    : (city || 'auto').toLowerCase();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const cacheKey = `weatherEventsCache:${locKey}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && Date.now() - parsed.ts < CACHE_TTL) {
          setEvents(parsed.events.map((e: any) => ({ ...e, at: new Date(e.at) })));
          setExtras(parsed.extras);
          setLoading(false);
        }
      }
    } catch { /* cache opcional */ }

    const run = async () => {
      try {
        const q = lat != null && lng != null
          ? `lat=${lat}&lon=${lng}`
          : `q=${encodeURIComponent(city || 'Blumenau')},BR`;

        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?${q}&appid=${API_KEY}&units=metric&lang=pt_br&cnt=9`
        );
        if (!res.ok) throw new Error(`forecast ${res.status}`);
        const f = await res.json();

        const list: WeatherEvent[] = (f.list || []).map((s: any) => {
          const at = new Date(s.dt * 1000);
          const gustKmh = Math.round((s.wind?.gust ?? s.wind?.speed ?? 0) * 3.6);
          const windKmh = Math.round((s.wind?.speed ?? 0) * 3.6);
          const rainMm = Number(s.rain?.['3h'] ?? 0);
          const pop = Math.round((s.pop ?? 0) * 100);
          const { cat, emoji } = categorize(s.weather?.[0]?.id ?? 800, s.weather?.[0]?.icon ?? '01d', gustKmh);
          const desc: string = s.weather?.[0]?.description ?? '';
          return {
            at,
            hourLabel: at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            icon: emoji,
            title: desc.charAt(0).toUpperCase() + desc.slice(1),
            category: cat,
            intensity: intensityOf(cat, rainMm, pop, gustKmh),
            temp: Math.round(s.main?.temp ?? 0),
            pop,
            rainMm,
            windKmh,
            gustKmh,
            score: Math.round(scoreOf(cat, { rainMm, pop, gustKmh })),
          } as WeatherEvent;
        });

        const first = f.list?.[0];
        let uv: number | null = null;
        // UV via Open-Meteo (sem chave). Coordenadas vêm da resposta do OWM (city.coord).
        const cLat = lat ?? f.city?.coord?.lat;
        const cLon = lng ?? f.city?.coord?.lon;
        if (cLat != null && cLon != null) {
          try {
            const uvRes = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${cLat}&longitude=${cLon}&current=uv_index&timezone=auto`
            );
            if (uvRes.ok) {
              const uvJson = await uvRes.json();
              const v = uvJson?.current?.uv_index;
              if (typeof v === 'number') uv = Math.round(v * 10) / 10;
            }
          } catch { /* UV é opcional */ }
        }

        const ex: WeatherExtras = {
          humidity: first?.main?.humidity ?? 0,
          gustKmh: Math.round((first?.wind?.gust ?? first?.wind?.speed ?? 0) * 3.6),
          feelsLike: Math.round(first?.main?.feels_like ?? 0),
          uvIndex: uv,
          visibilityKm: Math.round(((first?.visibility ?? 10000) / 1000) * 10) / 10,
          pressure: first?.main?.pressure ?? 0,
        };

        if (!cancelled) {
          setEvents(list);
          setExtras(ex);
          setError(false);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), events: list, extras: ex }));
          } catch { /* cache opcional */ }
        }
      } catch (e) {
        console.error('[useWeatherEvents]', e);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    const iv = setInterval(run, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey, enabled]);

  return { events, extras, loading, error };
}
