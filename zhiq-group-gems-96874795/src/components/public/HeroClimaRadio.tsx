/**
 * HeroClimaRadio — topo do Mercado: o card de CLIMA se apresenta e, depois de
 * alguns segundos, sai de cena automaticamente deixando o mini player da RÁDIO
 * no lugar (pedido do usuário 07-20).
 *
 * Regras:
 *  • Clima aparece por CLIMA_MS e some sozinho (só quando há rádio ativa p/ assumir).
 *  • Sem rádio ativa → o clima permanece (não deixamos um buraco no header).
 *  • Rádio encerrada depois → o clima volta.
 */
import { useEffect, useState } from 'react';
import { HomeHeroWeather } from '@/components/public/HomeHeroWeather';
import { RadioMiniPlayerDocked } from '@/components/orion/RadioMiniPlayer';
import { subscribeRadio, getRadioState, type RadioState } from '@/lib/radioPlayer';

const CLIMA_MS = 8000;

export function HeroClimaRadio({ compact = false }: { compact?: boolean }) {
  const [radio, setRadio] = useState<RadioState>(getRadioState());
  const [climaDone, setClimaDone] = useState(false);

  useEffect(() => subscribeRadio(setRadio), []);

  useEffect(() => {
    const t = setTimeout(() => setClimaDone(true), CLIMA_MS);
    return () => clearTimeout(t);
  }, []);

  const showRadio = climaDone && !!radio.station;

  return (
    <div className="relative">
      {showRadio ? (
        <div className="animate-in fade-in slide-in-from-top-2 duration-500">
          <RadioMiniPlayerDocked />
        </div>
      ) : (
        <HomeHeroWeather compact={compact} />
      )}
    </div>
  );
}

export default HeroClimaRadio;
