import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Droplets, Wind, MapPin, Thermometer, X } from 'lucide-react';
import { useWeatherRich } from '@/hooks/useWeatherRich';
import { useUserAutonomousCity } from '@/hooks/useUserAutonomousCity';

/**
 * <HomeHeroWeather /> — hero de clima + IA RIDV para o topo dos módulos
 * públicos. Reutiliza o useWeatherRich (GPS → fallback) e adapta a
 * mensagem da IA ao módulo atual (mercado/imóveis/veículos/serviços/
 * fretes/viagens) e às condições reais (chuva, vento, horário).
 * 
 * Atualizado com comportamento temporizado rotativo: o card começa a aparecer,
 * exibe a dica por 8 segundos (com barra de progresso e botão fechar) e depois some
 * convertendo-se em um mini-selo interativo para não desalinhar a barra de pesquisa.
 */

type Modulo = 'mercado' | 'imoveis' | 'veiculos' | 'servicos' | 'fretes' | 'viagens';

function moduloFromPath(path: string): Modulo {
  if (path.startsWith('/imoveis')) return 'imoveis';
  if (path.startsWith('/veiculos')) return 'veiculos';
  if (path.startsWith('/servicos')) return 'servicos';
  if (path.startsWith('/fretes')) return 'fretes';
  if (path.startsWith('/viagens')) return 'viagens';
  return 'mercado';
}

function mensagemIA(m: Modulo, w: { pop: number; windSpeed: number; temperature: number }): { texto: string; tom: 'verde' | 'amarelo' | 'azul' } {
  const chuvaAlta = w.pop >= 60;
  const chuvaMedia = w.pop >= 35 && w.pop < 60;
  const ventania = w.windSpeed >= 40;
  const hora = new Date().getHours();

  if (ventania) return { texto: 'Vento forte na região — atenção redobrada em deslocamentos e entregas.', tom: 'amarelo' };

  switch (m) {
    case 'mercado':
      if (chuvaAlta) return { texto: `Alta chance de chuva (${w.pop}%) — dia perfeito para pedir em casa. Delivery aquecido!`, tom: 'azul' };
      if (hora >= 10 && hora <= 13) return { texto: 'Horário de pico do almoço — restaurantes e mercados com maior movimento agora.', tom: 'verde' };
      return { texto: 'O clima está favorável para compras e entregas na sua região.', tom: 'verde' };
    case 'imoveis':
      if (chuvaAlta) return { texto: `Chuva provável (${w.pop}%) — bom momento para agendar visitas para mais tarde.`, tom: 'amarelo' };
      return { texto: 'Tempo aberto — condições ideais para visitar imóveis hoje.', tom: 'verde' };
    case 'veiculos':
      if (chuvaAlta) return { texto: `Pista molhada provável (${w.pop}% de chuva) — redobre a atenção em test-drives.`, tom: 'amarelo' };
      return { texto: 'Condições ideais para deslocamento e test-drive hoje.', tom: 'verde' };
    case 'fretes':
      if (chuvaAlta) return { texto: `Chuva prevista (${w.pop}%) — proteja a carga e planeje as rotas com folga.`, tom: 'amarelo' };
      if (chuvaMedia) return { texto: `Possibilidade de chuva (${w.pop}%) — priorize fretes no início do dia.`, tom: 'azul' };
      return { texto: 'Rotas com boas condições — ótimo dia para fretes e mudanças.', tom: 'verde' };
    case 'viagens':
      if (chuvaAlta) return { texto: `Chuva na região (${w.pop}%) — confira a previsão do destino antes de embarcar.`, tom: 'azul' };
      return { texto: 'Céu favorável — excelente dia para planejar sua próxima viagem.', tom: 'verde' };
    case 'servicos':
    default:
      if (chuvaAlta) return { texto: `Chuva provável (${w.pop}%) — serviços internos em alta na região.`, tom: 'azul' };
      return { texto: 'Condições gerais favoráveis para serviços na sua região hoje.', tom: 'verde' };
  }
}

const TOM_COR: Record<string, { bg: string; cor: string }> = {
  verde: { bg: 'rgba(22,163,74,.12)', cor: '#166534' },
  amarelo: { bg: 'rgba(245,158,11,.16)', cor: '#92400e' },
  azul: { bg: 'rgba(104,199,242,.22)', cor: '#075985' },
};

export function HomeHeroWeather({ compact = false }: { compact?: boolean }) {
  const { pathname } = useLocation();
  const modulo = moduloFromPath(pathname);
  const { city: userCity, resolved: cityResolved } = useUserAutonomousCity();
  const { weather, loading } = useWeatherRich(undefined, undefined, userCity, cityResolved);

  const ia = useMemo(
    () => (weather ? mensagemIA(modulo, weather) : null),
    [weather, modulo],
  );

  const [expanded, setExpanded] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!weather || !ia) return;

    let interval: NodeJS.Timeout | null = null;
    let timeout: NodeJS.Timeout | null = null;

    if (expanded) {
      // Quando visível, diminui o progresso ao longo de 15 segundos
      const duration = 15000;
      const stepTime = 100;
      const stepValue = 100 / (duration / stepTime);

      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev <= stepValue) {
            setExpanded(false);
            return 100;
          }
          return prev - stepValue;
        });
      }, stepTime);
    } else {
      // Quando oculto (some), aguarda 30 segundos para aparecer automaticamente de novo (ou reabre no clique)
      timeout = setTimeout(() => {
        setExpanded(true);
        setProgress(100);
      }, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [weather, ia, expanded]);

  if (loading && (!weather || !ia)) {
    return (
      <div
        className="h-[30px] w-full animate-pulse rounded-xl"
        style={{ background: 'rgba(255,255,255,.25)' }}
      />
    );
  }
  if (!weather || !ia) return null;

  if (!expanded) {
    return (
      <div className="hhw-pill-enter w-full flex items-center justify-start py-0.5">
        <style>{`
          @keyframes hhwPillIn { from{opacity:0; transform:scale(0.96)} to{opacity:1; transform:scale(1)} }
          .hhw-pill-enter { animation: hhwPillIn .3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        `}</style>
        <button
          onClick={() => { setExpanded(true); setProgress(100); }}
          className="group flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black shadow-md border border-white/80 transition-all hover:scale-[1.02] active:scale-95"
          style={{
            background: 'linear-gradient(135deg, rgba(200,236,252,.96) 0%, rgba(160,220,248,.94) 100%)',
            color: '#075985',
            backdropFilter: 'blur(10px)',
          }}
          title="Clique para expandir a previsão e dica de IA"
        >
          <span className="text-sm leading-none group-hover:scale-110 transition-transform">{weather.icon}</span>
          <span>{weather.temperature}°C</span>
          <span className="opacity-60">•</span>
          <span className="max-w-[140px] truncate">{weather.cityName}</span>
          <span className="opacity-60">•</span>
          <span className="flex items-center gap-1 text-[11px] font-extrabold text-[#075985] bg-white/80 px-2 py-0.5 rounded-full shadow-sm">
            <span>🤖</span> Dica de IA
          </span>
        </button>
      </div>
    );
  }

  const tom = TOM_COR[ia.tom];

  return (
    <div
      className="hhw-enter w-full overflow-hidden rounded-2xl relative transition-all"
      style={{
        background: 'linear-gradient(135deg, rgba(200,236,252,.95) 0%, rgba(160,220,248,.92) 55%, rgba(104,199,242,.85) 100%)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,.65)',
        boxShadow: '0 8px 22px -10px rgba(7,89,133,.35)',
      }}
    >
      <style>{`
        @keyframes hhwIn { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:none} }
        .hhw-enter { animation: hhwIn .4s ease-out both; }
        @keyframes hhwFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
        .hhw-ico { animation: hhwFloat 2.6s ease-in-out infinite; display:inline-block; }
      `}</style>

      {/* Faixa compacta (+30% sobre a slim), texto da IA SEMPRE visível */}
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 pr-8">
        <span className="hhw-ico shrink-0 text-base leading-none">{weather.icon}</span>
        <span className="shrink-0 text-[14px] font-black leading-none text-slate-900">{weather.temperature}°C</span>
        <span className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold text-slate-800"
          style={{ background: 'rgba(255,255,255,.75)' }}>
          <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: '#075985' }} />
          <span className="max-w-[140px] truncate">{weather.cityName}</span>
        </span>

        <span className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{ background: 'rgba(255,255,255,.6)', color: '#075985' }}>
          <Droplets className="h-3.5 w-3.5" style={{ color: '#68C7F2' }} />{weather.pop}%
        </span>
        <span className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-bold"
          style={{ background: 'rgba(255,255,255,.6)', color: '#075985' }}>
          <Wind className="h-3.5 w-3.5" style={{ color: '#68C7F2' }} />{weather.windSpeed}
        </span>
        {!compact && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-bold"
            style={{ background: 'rgba(255,255,255,.6)', color: '#075985' }}>
            <Thermometer className="h-3.5 w-3.5" style={{ color: '#68C7F2' }} />{weather.feelsLike}°
          </span>
        )}

        <span
          className="flex min-w-[180px] flex-1 items-start gap-1.5 rounded-lg px-2 py-1"
          style={{ background: tom.bg }}
        >
          <span className="shrink-0 text-[13px] leading-none">🤖</span>
          <span className="line-clamp-2 text-[12px] font-bold leading-snug" style={{ color: tom.cor }}>{ia.texto}</span>
        </span>
      </div>

      {/* Botão de Fechar Rápido (X) */}
      <button
        onClick={() => setExpanded(false)}
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/60 text-slate-800 shadow-sm transition-colors hover:bg-white active:scale-95"
        title="Ocultar previsão do tempo"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Barra de Progresso de Tempo (indicando que o card vai sumir suavemente) */}
      <div className="h-[3px] w-full bg-[#075985]/15 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#075985] to-[#0284c7] transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
