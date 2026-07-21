/**
 * HeroClimaRadio — topo do Mercado: o card de CLIMA se apresenta e, depois de
 * alguns segundos, sai de cena automaticamente deixando o mini player da RÁDIO
 * no lugar (pedido do usuário 07-20).
 *
 * Regras:
 *  • Clima aparece por CLIMA_MS e some sozinho (só quando há rádio ativa p/ assumir).
 *  • Sem rádio ativa → o clima permanece (não deixamos um buraco no header).
 *  • Rádio encerrada depois → o clima volta.
 *  • MINIMIZAR o clima (X) = fecha TOTALMENTE e cede o topo ao rádio (não vira
 *    pílula nem reabre sozinho). Sem rádio ativa, fica um mini-botão discreto
 *    p/ reabrir o clima — nunca um buraco.
 */
import { useEffect, useState } from 'react';
import { CloudSun } from 'lucide-react';
import { HomeHeroWeather } from '@/components/public/HomeHeroWeather';
import { RadioMiniPlayerDocked } from '@/components/orion/RadioMiniPlayer';
import { subscribeRadio, getRadioState, type RadioState } from '@/lib/radioPlayer';

const CLIMA_MS = 8000;

export function HeroClimaRadio({ compact = false }: { compact?: boolean }) {
  const [radio, setRadio] = useState<RadioState>(getRadioState());
  const [climaDone, setClimaDone] = useState(false);
  // usuário fechou o clima no X → cede o topo ao rádio de vez
  const [climaDismissed, setClimaDismissed] = useState(false);

  useEffect(() => subscribeRadio(setRadio), []);

  useEffect(() => {
    const t = setTimeout(() => setClimaDone(true), CLIMA_MS);
    return () => clearTimeout(t);
  }, []);

  const hasRadio = !!radio.station;
  // rádio assume quando: o clima terminou o tempo (e há rádio) OU o usuário fechou o clima
  const showRadio = hasRadio && (climaDone || climaDismissed);

  return (
    <div className="relative">
      {showRadio ? (
        <div className="animate-in fade-in slide-in-from-top-2 duration-500">
          <RadioMiniPlayerDocked />
        </div>
      ) : climaDismissed ? (
        // clima fechado pelo usuário e SEM rádio ativa: mini-botão p/ reabrir (nunca buraco)
        <div className="flex justify-end">
          <button
            onClick={() => setClimaDismissed(false)}
            aria-label="Mostrar previsão do tempo"
            title="Mostrar previsão do tempo"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[#075985] shadow-sm border border-white/70 backdrop-blur transition-all duration-200 hover:bg-white hover:scale-110 active:scale-95"
          >
            <CloudSun className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <HomeHeroWeather compact={compact} onClose={() => setClimaDismissed(true)} />
      )}
    </div>
  );
}

export default HeroClimaRadio;
