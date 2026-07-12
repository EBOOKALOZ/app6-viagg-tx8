import { useEffect, useMemo, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { useWeatherEvents, WeatherCategory, WeatherEvent } from '@/hooks/useWeatherEvents';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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

/* ── Estilos de card glassmorphism ── */
const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255, 0.62)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255, 0.7)',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04), 0 8px 32px -8px rgba(15,23,42,0.08)',
  borderRadius: '22px',
};

export function WeatherEventsCard({ city: cityProp, state: stateProp }: WeatherEventsCardProps) {
  const { user, activeProfile } = useAuth();
  const [city, setCity] = useState<string | undefined>(
    cityProp && cityProp !== 'Cidade' ? cityProp : undefined
  );
  const [state, setState] = useState<string | undefined>(
    stateProp && stateProp !== 'UF' ? stateProp : undefined
  );
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [geoDone, setGeoDone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [aerialFailed, setAerialFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  /* Cidade SEMPRE a do cadastro — prop do layout > RPC operacional > perfis.
     Mesmo fallback do antigo card de clima atual. */
  useEffect(() => {
    if (cityProp && cityProp !== 'Cidade') {
      setCity(cityProp);
      setState(stateProp !== 'UF' ? stateProp : undefined);
      return;
    }
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
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
        if (!cancelled) setGeoDone(true); // sem cidade cadastrada → segue fallback do hook
      } catch {
        if (!cancelled) setGeoDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [cityProp, stateProp, user?.id, activeProfile]);

  /* Geocodifica a cidade cadastrada → coordenadas p/ previsão + vista aérea. */
  useEffect(() => {
    if (!city) return;
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

  /* ── ANIMAÇÕES ── */
  const wxStyles = `
    /* Base icon animations (preserved) */
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

    /* Staggered section entrance */
    @keyframes wxSectionIn {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: none; }
    }
    .wx-section { animation: wxSectionIn 0.5s ease-out both; }
    .wx-section:nth-child(2) { animation-delay: 0.07s; }
    .wx-section:nth-child(3) { animation-delay: 0.13s; }
    .wx-section:nth-child(4) { animation-delay: 0.19s; }
    .wx-section:nth-child(5) { animation-delay: 0.25s; }
    .wx-section:nth-child(6) { animation-delay: 0.31s; }
    .wx-section:nth-child(7) { animation-delay: 0.37s; }

    /* Timeline row hover */
    .wx-row { transition: transform .25s ease, box-shadow .25s ease, background .25s ease; border-radius: 16px; }
    .wx-row:hover { transform: translateY(-2px); background: rgba(255,255,255,.92); box-shadow: 0 10px 22px -12px rgba(15,23,42,.18); }

    /* Bar grow animation */
    @keyframes wxBarGrow { from { height: 4px; } }
    .wx-bar { animation: wxBarGrow .7s cubic-bezier(.22,.9,.35,1) both; }

    /* Shimmer skeleton */
    @keyframes wxShimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .wx-shimmer {
      background: linear-gradient(90deg, #e8ecf0 25%, #d5dbe3 50%, #e8ecf0 75%);
      background-size: 200% 100%;
      animation: wxShimmer 1.5s ease-in-out infinite;
      border-radius: 12px;
    }

    /* Indicator card hover */
    .wx-indicator { transition: transform 0.3s ease, box-shadow 0.3s ease; }
    .wx-indicator:hover { transform: translateY(-3px); box-shadow: 0 8px 20px -6px rgba(15,23,42,0.15); }

    /* Countdown pulse */
    @keyframes wxCountdownPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
    .wx-countdown { animation: wxCountdownPulse 2s ease-in-out infinite; }

    /* Hero next-event gentle glow */
    @keyframes wxHeroGlow { 0%,100% { box-shadow: 0 8px 24px -8px var(--wx-hero-glow, rgba(37,99,235,0.25)); } 50% { box-shadow: 0 12px 32px -8px var(--wx-hero-glow, rgba(37,99,235,0.35)); } }
    .wx-hero-glow { animation: wxHeroGlow 3s ease-in-out infinite; }
  `;

  /* ── LOADING (Skeleton Premium) ── */
  if (loading) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
        <style>{wxStyles}</style>
        <div className="space-y-3">
          {/* Skeleton Header */}
          <div style={glassCard} className="p-5">
            <div className="flex items-center gap-3">
              <div className="wx-shimmer h-12 w-12 shrink-0" style={{ borderRadius: '14px' }} />
              <div className="flex-1 space-y-2">
                <div className="wx-shimmer h-5 w-36" />
                <div className="wx-shimmer h-3 w-48" />
              </div>
            </div>
          </div>
          {/* Skeleton Next Event */}
          <div style={glassCard} className="p-5">
            <div className="flex items-center gap-4">
              <div className="wx-shimmer h-10 w-10 shrink-0" style={{ borderRadius: '50%' }} />
              <div className="flex-1 space-y-2">
                <div className="wx-shimmer h-3 w-24" />
                <div className="wx-shimmer h-5 w-32" />
              </div>
              <div className="wx-shimmer h-6 w-20" />
            </div>
          </div>
          {/* Skeleton Timeline */}
          <div style={glassCard} className="p-5 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="wx-shimmer h-4 w-10" />
                <div className="wx-shimmer h-6 w-1" />
                <div className="wx-shimmer h-6 w-6" style={{ borderRadius: '50%' }} />
                <div className="flex-1 space-y-1.5">
                  <div className="wx-shimmer h-4 w-28" />
                  <div className="wx-shimmer h-3 w-36" />
                </div>
                <div className="wx-shimmer h-5 w-14" style={{ borderRadius: '20px' }} />
              </div>
            ))}
          </div>
          {/* Skeleton Indicators */}
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={glassCard} className="p-3 space-y-2">
                <div className="wx-shimmer h-5 w-5 mx-auto" style={{ borderRadius: '50%' }} />
                <div className="wx-shimmer h-4 w-10 mx-auto" />
                <div className="wx-shimmer h-3 w-14 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── ERROR / EMPTY ── */
  if (error || !events.length) {
    return (
      <div
        className="flex flex-col items-center gap-3 p-8"
        style={{
          ...glassCard,
          fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)' }}
        >
          <CloudOff className="h-7 w-7 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Eventos do clima indisponíveis</p>
        <p className="text-xs text-slate-400">Tente novamente mais tarde</p>
      </div>
    );
  }

  const maxScore = Math.max(...events.map(e => e.score), 1);

  /* ── RENDER PRINCIPAL ── */
  return (
    <div
      style={{ fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif" }}
      className="space-y-3"
    >
      <style>{wxStyles}</style>

      {/* ═══════════════════════════════════════════════════════════
          SEÇÃO 1 — Header + Alertas
          ═══════════════════════════════════════════════════════════ */}
      <div className="wx-section" style={{ ...glassCard, padding: '20px' }}>
        {/* Cabeçalho — vista aérea da cidade de cadastro quando disponível */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            {(() => {
              const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
              const aerialUrl = coords && token && !aerialFailed
                ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${coords.lng},${coords.lat},13,0/96x96@2x?access_token=${token}`
                : undefined;
              return aerialUrl ? (
                <div className="relative h-12 w-12 shrink-0">
                  <img
                    src={aerialUrl}
                    alt={`Vista aérea de ${city || 'sua cidade'}`}
                    className="h-full w-full object-cover"
                    style={{ borderRadius: '14px', boxShadow: '0 8px 18px -8px rgba(15,23,42,.4)' }}
                    loading="lazy"
                    onError={() => setAerialFailed(true)}
                  />
                  <span
                    className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-sm leading-none shadow-sm"
                    style={{ background: 'white', border: '1px solid #f1f5f9' }}
                  >
                    {events[0]?.icon ?? '🌦️'}
                  </span>
                </div>
              ) : (
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center text-xl"
                  style={{
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg,#38bdf8,#2563eb)',
                    boxShadow: '0 8px 18px -8px rgba(37,99,235,.55)',
                  }}
                >
                  🌦️
                </div>
              );
            })()}
            <div>
              <h3 className="text-base leading-tight text-slate-900" style={{ fontWeight: 700 }}>Eventos do Clima</h3>
              <p className="text-xs" style={{ color: '#64748b' }}>
                Próximas horas{city ? <> · <span style={{ fontWeight: 600, color: '#475569' }}>📍 {city}</span></> : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="shrink-0 text-xs underline-offset-2 hover:underline"
            style={{
              color: '#2563eb',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '10px',
              background: 'rgba(37,99,235,0.06)',
              transition: 'background 0.2s',
            }}
          >
            {expanded ? 'Ver menos' : 'Ver completa →'}
          </button>
        </div>

        {/* Alertas em destaque */}
        {alerts.length > 0 && (
          <div className="mt-3 space-y-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3.5 py-2.5 text-xs"
                style={{
                  borderRadius: '14px',
                  ...(a.tone === 'red'
                    ? { background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600 }
                    : a.tone === 'orange'
                      ? { background: '#ffedd5', border: '1px solid #fed7aa', color: '#c2410c', fontWeight: 600 }
                      : { background: '#fef9c3', border: '1px solid #fde68a', color: '#a16207', fontWeight: 600 }),
                }}
              >
                <span className="text-base">{a.icon}</span>
                <span>{a.tone === 'red' ? 'Alerta' : 'Atenção'} — {a.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SEÇÃO 2 — Próximo Evento (Hero Premium)
          ═══════════════════════════════════════════════════════════ */}
      {nextEvent && (() => {
        const cs = CAT_STYLE[nextEvent.category];
        return (
          <div
            className="wx-section wx-hero-glow flex items-center gap-4"
            style={{
              borderRadius: '22px',
              padding: '18px 20px',
              background: `linear-gradient(135deg, ${cs.bg}, rgba(255,255,255,0.7))`,
              border: `1px solid ${cs.color}22`,
              '--wx-hero-glow': `${cs.color}30`,
            } as React.CSSProperties}
          >
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '16px',
                background: `${cs.color}15`,
                fontSize: '28px',
              }}
            >
              <span className={iconAnim(nextEvent.category)}>{nextEvent.icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="uppercase tracking-widest"
                style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, letterSpacing: '0.15em' }}
              >
                Próximo evento
              </p>
              <p className="truncate text-slate-900" style={{ fontSize: '15px', fontWeight: 800, lineHeight: 1.3 }}>
                {nextEvent.title}
              </p>
            </div>
            <div
              className="wx-countdown shrink-0 tabular-nums"
              style={{
                color: cs.color,
                fontWeight: 800,
                fontSize: '14px',
                padding: '6px 12px',
                borderRadius: '12px',
                background: `${cs.color}10`,
              }}
            >
              {fmtCountdown(nextEvent.at.getTime() - now)}
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════
          SEÇÃO 3 — Timeline "Próximos Eventos"
          ═══════════════════════════════════════════════════════════ */}
      <div className="wx-section" style={{ ...glassCard, padding: '20px' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">🕐</span>
          <p
            className="uppercase tracking-widest"
            style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.12em' }}
          >
            Próximos Eventos
          </p>
        </div>

        <div className="space-y-1">
          {visible.map((e, idx) => {
            const cs = CAT_STYLE[e.category];
            const its = INTENSITY_STYLE[e.intensity];
            return (
              <div
                key={e.at.getTime()}
                className="wx-row flex items-center gap-3"
                style={{ padding: '10px 12px' }}
              >
                {/* horário */}
                <div className="flex w-11 shrink-0 flex-col items-center">
                  <span
                    className="tabular-nums"
                    style={{
                      fontSize: '11px',
                      color: idx === 0 ? '#0f172a' : '#64748b',
                      fontWeight: idx === 0 ? 700 : 600,
                    }}
                  >
                    {idx === 0 ? 'Agora' : e.hourLabel}
                  </span>
                </div>
                {/* linha vertical */}
                <span
                  className="h-8 w-1 shrink-0"
                  style={{ borderRadius: '4px', background: cs.color, opacity: 0.35 }}
                />
                {/* ícone */}
                <span className={`shrink-0 text-xl ${iconAnim(e.category)}`}>{e.icon}</span>
                {/* info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-900" style={{ fontWeight: 600 }}>{e.title}</p>
                  <p className="truncate" style={{ fontSize: '11px', color: '#64748b' }}>
                    {e.temp}°C{e.pop > 0 ? ` · ${e.pop}% chuva` : ''}{e.gustKmh >= 30 ? ` · rajadas ${e.gustKmh} km/h` : ''}
                  </p>
                </div>
                {/* badge intensidade */}
                <span
                  className="shrink-0"
                  style={{
                    background: its.bg,
                    color: its.color,
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '3px 10px',
                    borderRadius: '20px',
                  }}
                >
                  {its.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SEÇÃO 4 — Barra de Intensidade do Dia
          ═══════════════════════════════════════════════════════════ */}
      <div className="wx-section" style={{ ...glassCard, padding: '20px' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">📊</span>
          <p
            className="uppercase tracking-widest"
            style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '0.12em' }}
          >
            Intensidade ao longo do dia
          </p>
        </div>
        <div className="flex items-end justify-between gap-1.5">
          {events.slice(0, 8).map((e) => (
            <div key={e.at.getTime()} className="flex flex-1 flex-col items-center gap-1.5">
              <span style={{ fontSize: '13px' }}>{e.icon}</span>
              <div className="flex h-[42px] w-full items-end justify-center">
                <div
                  className="wx-bar w-full rounded-full"
                  style={{
                    maxWidth: '22px',
                    height: `${Math.max(14, (e.score / maxScore) * 100)}%`,
                    background: `linear-gradient(180deg, ${CAT_STYLE[e.category].color}, ${CAT_STYLE[e.category].color}88)`,
                  }}
                  title={`${e.hourLabel} — ${e.title}`}
                />
              </div>
              <span className="tabular-nums" style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>
                {String(e.at.getHours()).padStart(2, '0')}h
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          SEÇÃO 5 — Grid de Indicadores Premium
          ═══════════════════════════════════════════════════════════ */}
      {extras && (
        <div className="wx-section grid grid-cols-3 gap-3">
          {[
            { icon: '💧', label: 'Umidade', value: `${extras.humidity}%` },
            { icon: '🌬️', label: 'Rajadas', value: `${extras.gustKmh} km/h` },
            { icon: '🌡️', label: 'Sensação', value: `${extras.feelsLike}°C` },
            { icon: '☀️', label: 'Índice UV', value: extras.uvIndex != null ? `${extras.uvIndex}` : '—' },
            { icon: '👁️', label: 'Visibilidade', value: `${extras.visibilityKm} km` },
            { icon: '🧭', label: 'Pressão', value: `${extras.pressure} hPa` },
          ].map((c) => (
            <div
              key={c.label}
              className="wx-indicator text-center"
              style={{
                ...glassCard,
                padding: '14px 10px',
                borderRadius: '18px',
              }}
            >
              <p style={{ fontSize: '20px', lineHeight: 1 }}>{c.icon}</p>
              <p
                className="mt-1.5 tabular-nums text-slate-900"
                style={{ fontSize: '15px', fontWeight: 800, lineHeight: 1.2 }}
              >
                {c.value}
              </p>
              <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SEÇÃO 6 — IA do Clima
          ═══════════════════════════════════════════════════════════ */}
      {summary && (
        <div
          className="wx-section flex items-start gap-3"
          style={{
            borderRadius: '22px',
            padding: '18px 20px',
            background: 'linear-gradient(135deg, rgba(240,249,255,0.8), rgba(219,234,254,0.5))',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(37,99,235, 0.12)',
            boxShadow: '0 2px 8px rgba(37,99,235,0.04)',
          }}
        >
          <span className="text-lg shrink-0">🤖</span>
          <div>
            <p
              className="uppercase tracking-widest"
              style={{ fontSize: '9px', color: '#2563eb', fontWeight: 700, letterSpacing: '0.15em' }}
            >
              IA do Clima
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: '#334155' }}>{summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
