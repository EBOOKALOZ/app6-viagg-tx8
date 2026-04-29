import { useEffect, useState } from "react";

const TOTAL_SEGMENTS = 36;
const GAP_DEG = 2.5;
const SEGMENT_DEG = (360 - GAP_DEG * TOTAL_SEGMENTS) / TOTAL_SEGMENTS;
const RADIUS = 54;
const CX = 64;
const CY = 64;
const STROKE_WIDTH = 7;
const DURATION_MS = 6000;
const HOLD_MS = 300;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

interface CircularProgressSegmentedProps {
  onComplete?: () => void;
}

export default function CircularProgressSegmented({ onComplete }: CircularProgressSegmentedProps) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = Math.round(eased * 100);
      setPercent(value);

      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          setPercent(100);
          onComplete?.(); // 🔥 libera o app
        }, HOLD_MS);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  const activeCount = Math.round((percent / 100) * TOTAL_SEGMENTS);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <svg viewBox="0 0 128 128" className="h-36 w-36 sm:h-44 sm:w-44" fill="none" xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: TOTAL_SEGMENTS }).map((_, i) => {
            const startAngle = i * (SEGMENT_DEG + GAP_DEG);
            const endAngle = startAngle + SEGMENT_DEG;
            const active = i < activeCount;
            return (
              <path
                key={i}
                d={describeArc(CX, CY, RADIUS, startAngle, endAngle)}
                stroke={active ? "#22c55e" : "rgba(34,197,94,0.15)"}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                fill="none"
                style={{
                  transition: "stroke 0.15s ease",
                  filter: active ? "drop-shadow(0 0 4px rgba(34,197,94,0.45))" : "none",
                }}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold tracking-tight text-emerald-50 sm:text-4xl">{percent}%</span>
        </div>
      </div>

      <span className="text-base font-medium tracking-wide text-emerald-300/90">
        Preparando seu painel profissional
      </span>
    </div>
  );
}
