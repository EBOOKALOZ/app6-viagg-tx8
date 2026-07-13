import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Droplets, Wind, MapPin, Thermometer } from 'lucide-react';
import { useWeatherRich } from '@/hooks/useWeatherRich';

/**
 * <HomeHeroWeather /> — hero de clima + IA RIDV para o topo dos módulos
 * públicos. Reutiliza o useWeatherRich (GPS → fallback) e adapta a
 * mensagem da IA ao módulo atual (mercado/imóveis/veículos/serviços/
 * fretes/viagens) e às condições reais (chuva, vento, horário).
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
  const { weather, loading } = useWeatherRich();

  const ia = useMemo(
    () => (weather ? mensagemIA(modulo, weather) : null),
    [weather, modulo],
  );

  if (loading) {
    return (
      <div
        className={compact ? 'h-[52px] w-full animate-pulse rounded-2xl' : 'h-[76px] w-full animate-pulse rounded-2xl'}
        style={{ background: 'rgba(255,255,255,.25)' }}
      />
    );
  }
  if (!weather || !ia) return null;

  const tom = TOM_COR[ia.tom];

  return (
    <div
      className="hhw-enter w-full overflow-hidden rounded-2xl"
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

      <div className={compact ? 'flex items-center gap-2.5 px-3 py-1.5' : 'flex flex-wrap items-center gap-3 px-4 py-2.5'}>
        {/* Temperatura + condição */}
        <div className="flex shrink-0 items-center gap-2">
          <span className={compact ? 'hhw-ico text-xl leading-none' : 'hhw-ico text-2xl leading-none'}>{weather.icon}</span>
          <div className="leading-none">
            <p className={compact ? 'text-base font-black text-slate-900' : 'text-xl font-black text-slate-900'}>
              {weather.temperature}°C
            </p>
            <p className="mt-0.5 flex items-center gap-0.5 text-[9px] font-bold text-slate-500">
              <MapPin className="h-2.5 w-2.5" style={{ color: '#68C7F2' }} />
              <span className="max-w-[90px] truncate">{weather.cityName}</span>
            </p>
          </div>
        </div>

        {/* Métricas azuis (+30%) */}
        <div className="flex shrink-0 items-center gap-2 text-[13px] font-bold" style={{ color: '#075985' }}>
          <span className="flex items-center gap-1 rounded-full px-2 py-1" style={{ background: 'rgba(255,255,255,.6)' }}>
            <Droplets className="h-4 w-4" style={{ color: '#68C7F2' }} />{weather.pop}%
          </span>
          <span className="flex items-center gap-1 rounded-full px-2 py-1" style={{ background: 'rgba(255,255,255,.6)' }}>
            <Wind className="h-4 w-4" style={{ color: '#68C7F2' }} />{weather.windSpeed}
          </span>
          {!compact && (
            <span className="flex items-center gap-1 rounded-full px-2 py-1" style={{ background: 'rgba(255,255,255,.6)' }}>
              <Thermometer className="h-4 w-4" style={{ color: '#68C7F2' }} />{weather.feelsLike}°
            </span>
          )}
        </div>

        {/* IA RIDV (+30%) */}
        <div
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: tom.bg }}
        >
          <span className="shrink-0 text-lg">🤖</span>
          <p className={compact ? 'truncate text-[13px] font-bold' : 'line-clamp-2 text-[14px] font-bold leading-snug'} style={{ color: tom.cor }}>
            {ia.texto}
          </p>
        </div>
      </div>
    </div>
  );
}
