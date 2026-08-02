import { useEffect, useRef } from "react";

export function RealtimeVisualizer({ mini }: { mini?: boolean }) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let animId: number;
    let dataArray: Uint8Array | null = null;
    let analyser: AnalyserNode | null = null;
    let smoothing = new Array(16).fill(0);

    const loop = () => {
      animId = requestAnimationFrame(loop);
      
      if (!analyser) {
        analyser = (window as any).__viagg_radio_analyser__;
        if (analyser) dataArray = new Uint8Array(analyser.frequencyBinCount);
      }

      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        for (let i = 0; i < 16; i++) {
          const val = dataArray[i]; 
          // O pico de graves (bins 0-3) é forte, vamos atenuar um pouco, e amplificar médios/agudos
          const multiplier = i < 4 ? 0.8 : 1.2;
          const target = Math.min(100, (val / 255) * 100 * multiplier);
          
          // Suavização simples
          smoothing[i] += (target - smoothing[i]) * 0.3;
          
          const bar = barsRef.current[i];
          if (bar) {
            const step = Math.ceil(smoothing[i] / 10) * 10;
            bar.style.height = `${step}%`;
          }
        }
      } else {
        // Fallback animado se o analyser não conectou ainda
        const time = Date.now();
        for (let i = 0; i < 16; i++) {
           const bar = barsRef.current[i];
           if (bar) {
             const base = (Math.sin(time / 200 + i) + 1) * 50;
             const step = Math.ceil(base / 10) * 10;
             bar.style.height = `${step}%`;
           }
        }
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const numCols = mini ? 8 : 16;
  const colW = mini ? "w-[4px]" : "w-[6px]";
  const colH = mini ? "h-[20px]" : "h-[40px]";
  const rowH = mini ? "h-[1px]" : "h-[3px]";

  return (
    <div className={`relative flex shrink-0 items-end gap-[1px] rounded bg-[#0b0f0b] p-1 ring-1 ring-white/10 ${mini ? 'scale-105 mx-1' : ''}`} aria-hidden="true">
      {Array.from({ length: numCols }).map((_, col) => {
        return (
          <div key={col} className={`relative flex flex-col-reverse gap-[1px] ${colH} ${colW}`}>
            <div className="absolute inset-0 flex flex-col-reverse gap-[1px]">
              {Array.from({ length: 10 }).map((_, row) => {
                let bg = "bg-emerald-500";
                if (row <= 1) bg = "bg-cyan-400";
                else if (row >= 2 && row <= 5) bg = "bg-emerald-500";
                else if (row >= 6 && row <= 7) bg = "bg-yellow-400";
                else if (row === 8) bg = "bg-orange-500";
                else bg = "bg-red-500";
                return <span key={row} className={`${rowH} w-full rounded-[1px] ${bg} opacity-15`} />
              })}
            </div>
            <div 
              ref={el => barsRef.current[col] = el}
              className="absolute bottom-0 left-0 right-0 overflow-hidden flex flex-col-reverse justify-start origin-bottom transition-all duration-75"
              style={{ height: '0%' }}
            >
              <div className={`flex flex-col-reverse gap-[1px] ${colH} ${colW}`}>
                {Array.from({ length: 10 }).map((_, row) => {
                  let bg = "bg-emerald-500";
                  if (row <= 1) bg = "bg-cyan-400";
                  else if (row >= 2 && row <= 5) bg = "bg-emerald-500";
                  else if (row >= 6 && row <= 7) bg = "bg-yellow-400";
                  else if (row === 8) bg = "bg-orange-500";
                  else bg = "bg-red-500";
                  return <span key={row} className={`${rowH} w-full rounded-[1px] ${bg} shadow-[0_0_4px_rgba(16,185,129,0.5)]`} />
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  );
}
