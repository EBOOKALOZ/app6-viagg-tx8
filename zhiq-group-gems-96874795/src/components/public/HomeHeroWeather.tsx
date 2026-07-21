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

const IA_TAGS = [
  { icon: "🤖", label: "Dica IA" },
  { icon: "✨", label: "Oferta IA" },
  { icon: "📍", label: "Próximo de você" },
  { icon: "🔥", label: "Tendências" },
  { icon: "⚡", label: "Promoções" },
  { icon: "💡", label: "Sugestão Inteligente" },
];

export function HomeHeroWeather({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const { pathname } = useLocation();
  const modulo = moduloFromPath(pathname);
  const { city: userCity, resolved: cityResolved } = useUserAutonomousCity();
  const { weather, loading } = useWeatherRich(undefined, undefined, userCity, cityResolved);

  const ia = useMemo(
    () => (weather ? mensagemIA(modulo, weather) : null),
    [weather, modulo],
  );

  // dispensado = o usuário minimizou o card. Fecha TOTALMENTE (sem pílula,
  // sem reabrir sozinho) e avisa o pai (HeroClimaRadio) p/ deixar só o rádio.
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [progress, setProgress] = useState(100);
  const [iaTagIdx, setIaTagIdx] = useState(0);
  const [iaTagFade, setIaTagFade] = useState(true);

  // Efeito rotativo dinâmico das tags da IA
  useEffect(() => {
    const timer = setInterval(() => {
      setIaTagFade(false);
      setTimeout(() => {
        setIaTagIdx((prev) => (prev + 1) % IA_TAGS.length);
        setIaTagFade(true);
      }, 200);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

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
    } else if (!dismissed) {
      // Encolhido pelo TEMPO (não pelo usuário): aguarda 30s e reabre sozinho.
      // Se foi DISPENSADO pelo usuário (X), não reabre — fica fechado de vez.
      timeout = setTimeout(() => {
        setExpanded(true);
        setProgress(100);
      }, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [weather, ia, expanded, dismissed]);

  if (loading && (!weather || !ia)) {
    return (
      <div
        className="h-[30px] w-full animate-pulse rounded-xl"
        style={{ background: 'rgba(255,255,255,.25)' }}
      />
    );
  }
  if (!weather || !ia) return null;

  // Dispensado pelo usuário: fecha TOTALMENTE (sem pílula, sem reabrir).
  // O HeroClimaRadio assume o topo com o rádio.
  if (dismissed) return null;

  if (!expanded) {
    return (
      <div className="hhw-pill-enter w-full flex items-center justify-between py-1">
        <style>{`
          @keyframes hhwPillIn { from{opacity:0; transform:scale(0.96)} to{opacity:1; transform:scale(1)} }
          .hhw-pill-enter { animation: hhwPillIn .3s cubic-bezier(0.16, 1, 0.3, 1) both; }
        `}</style>
        <button
          onClick={() => { setExpanded(true); setProgress(100); }}
          className="group w-full flex items-center justify-between gap-2 sm:gap-2.5 rounded-[20px] px-3.5 sm:px-4 py-2 text-xs font-black shadow-[0_2px_12px_rgba(7,89,133,0.12)] border border-white/90 transition-all duration-200 hover:scale-[1.01] active:scale-95 cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, rgba(200,236,252,.96) 0%, rgba(160,220,248,.94) 100%)',
            color: '#075985',
            backdropFilter: 'blur(12px)',
          }}
          title="Clique para expandir a previsão e dica de IA"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none group-hover:scale-110 transition-transform shrink-0">{weather.icon}</span>
            <span className="shrink-0">{weather.temperature}°C</span>
            <span className="opacity-60 shrink-0">•</span>
            <span className="truncate">{weather.cityName}</span>
          </div>
          <span className="flex items-center gap-1.5 shrink-0 text-[11px] font-extrabold text-[#075985] bg-white/90 px-2.5 py-1 rounded-full shadow-sm">
            <span className="inline-block transition-transform duration-300 group-hover:scale-125">{IA_TAGS[iaTagIdx].icon}</span>
            <span className={`transition-opacity duration-300 ${iaTagFade ? "opacity-100" : "opacity-0"}`}>{IA_TAGS[iaTagIdx].label}</span>
          </span>
        </button>
      </div>
    );
  }

  const tom = TOM_COR[ia.tom];

  return (
    <div
      className="hhw-enter w-full overflow-hidden rounded-[22px] relative transition-all duration-200 border border-white/85 shadow-[0_6px_20px_rgba(7,89,133,0.15)]"
      style={{
        background: 'linear-gradient(135deg, rgba(200,236,252,.96) 0%, rgba(160,220,248,.94) 55%, rgba(104,199,242,.88) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <style>{`
        @keyframes hhwIn { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:none} }
        .hhw-enter { animation: hhwIn .4s ease-out both; }
        @keyframes hhwFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
        .hhw-ico { animation: hhwFloat 2.6s ease-in-out infinite; display:inline-block; }
      `}</style>

      {/* Faixa premium com cápsulas padronizadas (h-9) e espaçamento equilibrado */}
      <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 pr-10">
        <span className="hhw-ico shrink-0 text-lg leading-none">{weather.icon}</span>
        <span className="shrink-0 text-[15px] font-black leading-none text-slate-950">{weather.temperature}°C</span>
        
        <span className="flex shrink-0 items-center gap-1.5 h-9 rounded-[18px] px-3.5 text-xs font-extrabold text-slate-900 bg-white/90 shadow-sm border border-white/60 transition-all duration-200 hover:bg-white hover:scale-[1.03] hover:shadow-md cursor-pointer select-none">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#075985]" />
          <span className="max-w-[150px] truncate">{weather.cityName}</span>
        </span>

        <span className="flex shrink-0 items-center gap-1 h-9 rounded-[18px] px-3 text-xs font-bold bg-white/75 text-[#075985] shadow-sm border border-white/50 transition-all duration-200 hover:scale-[1.02] select-none">
          <Droplets className="h-3.5 w-3.5 text-[#68C7F2]" />{weather.pop}%
        </span>
        <span className="flex shrink-0 items-center gap-1 h-9 rounded-[18px] px-3 text-xs font-bold bg-white/75 text-[#075985] shadow-sm border border-white/50 transition-all duration-200 hover:scale-[1.02] select-none">
          <Wind className="h-3.5 w-3.5 text-[#68C7F2]" />{weather.windSpeed}
        </span>
        {!compact && (
          <span className="flex shrink-0 items-center gap-1 h-9 rounded-[18px] px-3 text-xs font-bold bg-white/75 text-[#075985] shadow-sm border border-white/50 transition-all duration-200 hover:scale-[1.02] select-none">
            <Thermometer className="h-3.5 w-3.5 text-[#68C7F2]" />{weather.feelsLike}°
          </span>
        )}

        <span
          className="group/ia flex min-w-[200px] flex-1 items-center gap-2.5 min-h-9 rounded-[18px] px-3.5 py-1.5 shadow-sm border border-white/60 transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_0_16px_rgba(104,199,242,0.4)] cursor-default select-none"
          style={{ background: tom.bg }}
        >
          <span className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full bg-white/90 text-[11px] font-black tracking-tight text-[#075985] shadow-xs border border-white/80 transition-all duration-300">
            <span className="inline-block transition-transform duration-300 group-hover/ia:scale-125">{IA_TAGS[iaTagIdx].icon}</span>
            <span className={`transition-opacity duration-300 ${iaTagFade ? "opacity-100" : "opacity-0"}`}>{IA_TAGS[iaTagIdx].label}</span>
          </span>
          <span className="line-clamp-2 text-xs font-extrabold leading-snug flex-1" style={{ color: tom.cor }}>{ia.texto}</span>
        </span>
      </div>

      {/* Botão de Fechar (X): dispensa TOTALMENTE o card e cede o topo ao rádio */}
      <button
        onClick={() => { setDismissed(true); onClose?.(); }}
        aria-label="Fechar previsão do tempo"
        className="absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-slate-800 shadow-sm transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95 cursor-pointer"
        title="Fechar previsão do tempo"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Barra de Progresso de Tempo */}
      <div className="h-[3px] w-full bg-[#075985]/15 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#075985] to-[#0284c7] transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
