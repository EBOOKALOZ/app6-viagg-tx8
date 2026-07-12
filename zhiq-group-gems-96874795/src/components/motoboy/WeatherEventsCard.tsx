import { useEffect, useMemo, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { useWeatherEvents, WeatherCategory, WeatherEvent } from '@/hooks/useWeatherEvents';

interface WeatherEventsCardProps {
  city?: string;
  state?: string;
}

/** Paleta dinâmica por categoria de clima. */
const CAT_STYLE: Record<WeatherCategory, { color: string; bg: string; label: string }> = {
  sun:    { color: '#ca8a04', bg: '#fef9c3', label: 'Sol' },
  partly: { color: '#f97316', bg: '#ffedd5', label: 'Parcial' },
  clouds: { color: '#64748b', bg: '#f1f5f9', label: 'Nublado' },
  rain:   { color: '#2563eb', bg: '#dbeafe', label: 'Chuva' },
  storm:  { color: '#7c3aed', bg: '#ede9fe', label: 'Tempestade' },
  fog:    { color: '#94a3b8', bg: '#f8fafc', label: 'Neblina' },
  wind:   { color: '#0ea5e9', bg: '#e0f2fe', label: 'Vento' },
  snow:   { color: '#0891b2', bg: '#ecfeff', label: 'Neve' },
};

const INTENSITY_STYLE = {
  leve:     { label: 'Leve',     color: '#16a34a', bg: '#dcfce7' },
  moderada: { label: 'Moderada', color: '#d97706', bg: '#fef3c7' },
  forte:    { label: 'Forte',    color: '#dc2626', bg: '#fee2e2' },
} as const;

/** Classe de animação do ícone conforme a categoria. */
const iconAnim = (cat: WeatherCategory) =>
  cat === 'sun' ? 'wx-anim-sun'
    : cat === 'rain' || cat === 'snow' ? 'wx-anim-rain'
    : cat === 'storm' ? 'wx-anim-flash'
    : cat === 'wind' ? 'wx-anim-wind'
    : 'wx-anim-cloud';

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `em ${m} minuto${m === 1 ? '' : 's'}`;
  return `em ${h}h ${String(m).padStart(2, '0')}min`;
}

/** Resumo "IA do Clima" — texto determinístico gerado dos próximos slots. */
function buildSummary(events: WeatherEvent[]): string {
  if (!events.length) return '';
  const wet = events.filter(e => e.category === 'rain' || e.category === 'storm');
  const storm = events.find(e => e.category === 'storm');
  const parts: string[] = [];
  if (wet.length) {
    const ini = wet[0].at.getHours();
    const fim = wet[wet.length - 1].at.getHours();
    const grau = wet.some(e => e.intensity === 'forte') ? 'forte'
      : wet.some(e => e.intensity === 'moderada') ? 'moderada' : 'fraca';
    parts.push(ini === fim
      ? `Há previsão de chuva ${grau} por volta das ${ini}h.`
      : `Há previsão de chuva ${grau} entre ${ini}h e ${fim}h.`);
    const after = events.slice(events.indexOf(wet[wet.length - 1]) + 1);
    if (after.some(e => e.category === 'sun' || e.category === 'partly')) {
      parts.push('Após esse período o céu ficará parcialmente aberto.');
    }
  } else {
    const dominante = events.filter(e => e.category === 'sun' || e.category === 'partly').length >= events.length / 2
      ? 'com predominância de sol' : 'predominantemente nublado';
    parts.push(`Sem previsão de chuva nas próximas horas, tempo ${dominante}.`);
  }
  parts.push(storm
    ? `Atenção: risco de tempestade por volta das ${storm.at.getHours()}h.`
    : 'Não há risco de tempestades severas.');
  const ventania = events.find(e => e.gustKmh >= 45);
  if (ventania) parts.push(`Rajadas de vento de até ${ventania.gustKmh} km/h previstas.`);
  return parts.join(' ');
}

export function WeatherEventsCard({ city: cityProp, state }: WeatherEventsCardProps) {
  const city = cityProp && cityProp !== 'Cidade' ? cityProp : undefined;
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [geoDone, setGeoDone] = useState(!city);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /* Mesma estratégia do card de clima atual: geocodifica a cidade cadastrada. */
  useEffect(() => {
    if (!city) { setGeoDone(true); return; }
    let cancelled = false;
    (async () => {
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
      } catch { /* segue por nome da cidade */ }
      finally { if (!cancelled) setGeoDone(true); }
    })();
    return () => { cancelled = true; };
  }, [city, state]);

  const { events, extras, loading, error } = useWeatherEvents(coords?.lat, coords?.lng, city, geoDone);

  /* Relógio p/ contador regressivo em tempo real */
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const visible = expanded ? events : events.slice(0, 5);

  /* Próximo evento notável (chuva/tempestade/vento) ainda no futuro */
  const nextEvent = useMemo(
    () => events.find(e =>
      e.at.getTime() > now &&
      (e.category === 'rain' || e.category === 'storm' || e.category === 'wind')),
    [events, now]
  );

  /* Alertas em destaque */
  const alerts = useMemo(() => {
    const list: { tone: 'yellow' | 'orange' | 'red'; icon: string; text: string }[] = [];
    const storm = events.find(e => e.category === 'storm');
    if (storm) list.push({ tone: 'red', icon: '⛈️', text: `Tempestade intensa prevista às ${storm.hourLabel}` });
    const wind = events.find(e => e.gustKmh >= 45);
    if (wind) list.push({ tone: 'orange', icon: '💨', text: `Vento forte previsto (rajadas de ${wind.gustKmh} km/h)` });
    const rain = events.find(e => e.category === 'rain' && e.pop >= 50);
    if (rain && !storm) list.push({ tone: 'yellow', icon: '🌧️', text: `Possibilidade de chuva às ${rain.hourLabel}` });
    return list.slice(0, 2);
  }, [events]);

  const summary = useMemo(() => buildSummary(events), [events]);

  if (loading) {
    return (
      <div className="rounded-[24px] border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-[18px] animate-pulse space-y-3">
        <div className="h-6 w-40 rounded bg-slate-100" />
        <div className="h-16 w-full rounded-2xl bg-slate-100/70" />
        <div className="h-24 w-full rounded-2xl bg-slate-50" />
      </div>
    );
  }

  if (error || !events.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[24px] border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-[18px]">
        <CloudOff className="h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Eventos do clima indisponíveis</p>
        <p className="text-xs text-slate-400">Tente novamente mais tarde</p>
      </div>
    );
  }

  const maxScore = Math.max(...events.map(e => e.score), 1);

  return (
    <div
      className="wx-enter rounded-[24px] p-4 sm:p-5"
      style={{
        background: 'rgba(255,255,255,.72)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,.6)',
        boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 16px 44px -18px rgba(15,23,42,.14)',
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @keyframes wxEnter { from { opacity: 0; transform: translateY(12px);} to { opacity: 1; transform: none;} }
        .wx-enter { animation: wxEnter .5s ease-out both; }
        @keyframes wxSun { 0%,100% { transform: scale(1); filter: brightness(1);} 50% { transform: scale(1.12); filter: brightness(1.25);} }
        .wx-anim-sun { animation: wxSun 3s ease-in-out infinite; display:inline-block; }
        @keyframes wxRain { 0%,100% { transform: translateY(0);} 50% { transform: translateY(2.5px);} }
        .wx-anim-rain { animation: wxRain 1.1s ease-in-out infinite; display:inline-block; }
        @keyframes wxCloud { 0%,100% { transform: translateX(0);} 50% { transform: translateX(3px);} }
        .wx-anim-cloud { animation: wxCloud 4s ease-in-out infinite; display:inline-block; }
        @keyframes wxWind { 0%,100% { transform: translateX(0) rotate(0deg);} 25% { transform: translateX(2px) rotate(3deg);} 75% { transform: translateX(-2px) rotate(-3deg);} }
        .wx-anim-wind { animation: wxWind 1.6s ease-in-out infinite; display:inline-block; }
        @keyframes wxFlash { 0%,88%,100% { filter: brightness(1);} 92% { filter: brightness(2.2);} 96% { filter: brightness(1.1);} 98% { filter: brightness(2.6);} }
        .wx-anim-flash { animation: wxFlash 3.2s linear infinite; display:inline-block; }
        .wx-row { transition: transform .25s ease, box-shadow .25s ease, background .25s ease; }
        .wx-row:hover { transform: translateY(-2px); background: rgba(255,255,255,.9); box-shadow: 0 10px 22px -12px rgba(15,23,42,.18); }
        @keyframes wxBarGrow { from { height: 4px; } }
        .wx-bar { animation: wxBarGrow .7s cubic-bezier(.22,.9,.35,1) both; }
      `}</style>

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
            style={{ background: 'linear-gradient(135deg,#38bdf8,#2563eb)', boxShadow: '0 8px 18px -8px rgba(37,99,235,.55)' }}
          >
            🌦️
          </div>
          <div>
            <h3 className="text-base leading-tight text-slate-900" style={{ fontWeight: 700 }}>Eventos do Clima</h3>
            <p className="text-xs" style={{ color: '#64748b' }}>Próximas horas</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 text-xs underline-offset-2 hover:underline"
          style={{ color: '#2563eb', fontWeight: 600 }}
        >
          {expanded ? 'Ver menos' : 'Ver previsão completa →'}
        </button>
      </div>

      {/* Alertas em destaque */}
      {alerts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {alerts.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
              style={a.tone === 'red'
                ? { background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600 }
                : a.tone === 'orange'
                  ? { background: '#ffedd5', border: '1px solid #fed7aa', color: '#c2410c', fontWeight: 600 }
                  : { background: '#fef9c3', border: '1px solid #fde68a', color: '#a16207', fontWeight: 600 }}
            >
              <span>{a.icon}</span>
              <span>{a.tone === 'red' ? 'Alerta' : 'Atenção'} — {a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Próximo evento (countdown em tempo real) */}
      {nextEvent && (
        <div
          className="mt-3 flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background: CAT_STYLE[nextEvent.category].bg,
            border: `1px solid ${CAT_STYLE[nextEvent.category].color}33`,
          }}
        >
          <span className={`text-2xl ${iconAnim(nextEvent.category)}`}>{nextEvent.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: '#64748b', fontWeight: 600 }}>Próximo evento</p>
            <p className="truncate text-sm text-slate-900" style={{ fontWeight: 700 }}>{nextEvent.title}</p>
          </div>
          <p className="shrink-0 tabular-nums text-xs" style={{ color: CAT_STYLE[nextEvent.category].color, fontWeight: 700 }}>
            {fmtCountdown(nextEvent.at.getTime() - now)}
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-4 space-y-1.5">
        {visible.map((e, idx) => {
          const cs = CAT_STYLE[e.category];
          const its = INTENSITY_STYLE[e.intensity];
          return (
            <div key={e.at.getTime()} className="wx-row flex items-center gap-3 rounded-2xl px-2.5 py-2">
              {/* horário + linha */}
              <div className="flex w-11 shrink-0 flex-col items-center">
                <span className="tabular-nums text-[11px]" style={{ color: idx === 0 ? '#0f172a' : '#64748b', fontWeight: idx === 0 ? 700 : 600 }}>
                  {idx === 0 ? 'Agora' : e.hourLabel}
                </span>
              </div>
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: cs.color, opacity: .5 }} />
              <span className={`shrink-0 text-xl ${iconAnim(e.category)}`}>{e.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-900" style={{ fontWeight: 600 }}>{e.title}</p>
                <p className="truncate text-[11px]" style={{ color: '#64748b' }}>
                  {e.temp}°C{e.pop > 0 ? ` · ${e.pop}% chuva` : ''}{e.gustKmh >= 30 ? ` · rajadas ${e.gustKmh} km/h` : ''}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                style={{ background: its.bg, color: its.color, fontWeight: 700 }}
              >
                {its.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Barra de intensidade do dia */}
      <div className="mt-4 rounded-2xl border border-slate-100 bg-white/60 px-3 pb-2 pt-3">
        <p className="mb-2 text-[10px] uppercase tracking-widest" style={{ color: '#64748b', fontWeight: 600 }}>
          Intensidade ao longo do dia
        </p>
        <div className="flex items-end justify-between gap-1">
          {events.slice(0, 8).map((e) => (
            <div key={e.at.getTime()} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-[38px] w-full items-end justify-center">
                <div
                  className="wx-bar w-full max-w-[18px] rounded-full"
                  style={{
                    height: `${Math.max(12, (e.score / maxScore) * 100)}%`,
                    background: `linear-gradient(180deg, ${CAT_STYLE[e.category].color}, ${CAT_STYLE[e.category].color}88)`,
                  }}
                  title={`${e.hourLabel} — ${e.title}`}
                />
              </div>
              <span className="tabular-nums text-[9px]" style={{ color: '#94a3b8' }}>
                {String(e.at.getHours()).padStart(2, '0')}h
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Informações extras */}
      {extras && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            { icon: '💧', label: 'Umidade', value: `${extras.humidity}%` },
            { icon: '🌬️', label: 'Rajadas', value: `${extras.gustKmh} km/h` },
            { icon: '🌡️', label: 'Sensação', value: `${extras.feelsLike}°C` },
            { icon: '☀️', label: 'Índice UV', value: extras.uvIndex != null ? `${extras.uvIndex}` : '—' },
            { icon: '👁️', label: 'Visibilidade', value: `${extras.visibilityKm} km` },
            { icon: '🧭', label: 'Pressão', value: `${extras.pressure} hPa` },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-100 bg-white/70 px-2 py-2 text-center">
              <p className="text-sm leading-none">{c.icon}</p>
              <p className="mt-1 tabular-nums text-xs text-slate-900" style={{ fontWeight: 700 }}>{c.value}</p>
              <p className="text-[9px]" style={{ color: '#64748b' }}>{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* IA do Clima */}
      {summary && (
        <div
          className="mt-3 flex items-start gap-2.5 rounded-2xl px-3.5 py-3"
          style={{ background: '#f0f9ff', border: '1px solid rgba(37,99,235,.15)' }}
        >
          <span className="text-base">🤖</span>
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: '#2563eb', fontWeight: 700 }}>IA do Clima</p>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: '#334155' }}>{summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
