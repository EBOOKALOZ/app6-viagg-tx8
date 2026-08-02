import React, { useEffect, useState } from 'react';

interface AudioEqualizerProps {
  /**
   * Se true, as barras de som ficam animadas (simulando áudio tocando).
   * Se false, as barras caem para o estado inativo.
   */
  active?: boolean;
  className?: string;
}

const BAR_COUNT = 10;
const BLOCKS_PER_BAR = 8; 

// Cores de baixo para cima, simulando um equalizador clássico (cyan -> green -> yellow -> red)
const COLORS = [
  'bg-cyan-400', 'bg-cyan-400', 
  'bg-emerald-500', 'bg-emerald-500', 'bg-emerald-500', 
  'bg-amber-400', 'bg-amber-400', 
  'bg-red-500'
];

export function AudioEqualizer({ active = true, className = '' }: AudioEqualizerProps) {
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(2));

  useEffect(() => {
    if (!active) {
      setLevels(Array(BAR_COUNT).fill(1)); // Estado de repouso
      return;
    }

    const interval = setInterval(() => {
      setLevels((prev) =>
        prev.map(() => Math.floor(Math.random() * BLOCKS_PER_BAR) + 1)
      );
    }, 150);

    return () => clearInterval(interval);
  }, [active]);

  return (
    <div 
      className={`bg-black p-3 rounded-xl inline-flex gap-[3px] h-20 items-end shadow-inner border border-zinc-800 ${className}`}
      title="Equalizador de Áudio"
    >
      {levels.map((level, barIdx) => (
        <div key={barIdx} className="flex flex-col-reverse gap-[3px] h-full justify-start w-3">
          {COLORS.map((color, blockIdx) => (
            <div
              key={blockIdx}
              className={`w-full flex-1 rounded-[1px] transition-opacity duration-150 ${
                blockIdx < level 
                  ? `${color} shadow-[0_0_3px_currentColor]` 
                  : 'bg-zinc-800 opacity-30'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
