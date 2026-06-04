import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

const TOTAL_SEGMENTS = 24;
const DURATION_MS = 6000;

type IconVariant = "spinner" | "clock" | "dots" | "none";
type ColorVariant = "motoboy" | "merchant" | "quero_vender" | "default";

interface LoadingButtonProps {
  icon?: IconVariant;
  color?: ColorVariant;
  onComplete?: () => void;
  className?: string;
  label?: string;
  /** When true, animation can finish and trigger onComplete. When false, animation holds at 100% until ready. */
  ready?: boolean;
}

/* ── Icon Components ── */

function SpinnerIcon() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeDasharray="63" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="2s" repeatCount="indefinite" />
      </circle>
      <line x1="12" y1="12" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3s" repeatCount="indefinite" />
      </line>
      <line x1="12" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="8s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

function DotsIcon() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-current"
          style={{ animation: `loading-dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

const ICONS: Record<IconVariant, () => JSX.Element> = {
  spinner: SpinnerIcon,
  clock: ClockIcon,
  dots: DotsIcon,
  none: () => <></>,
};

const GREEN_PALETTE = {
  active: "bg-emerald-500",
  inactive: "bg-white/[0.06]",
  icon: "text-emerald-400",
};

const COLOR_MAP: Record<ColorVariant, { active: string; inactive: string; icon: string }> = {
  motoboy: GREEN_PALETTE,
  merchant: GREEN_PALETTE,
  quero_vender: GREEN_PALETTE,
  default: GREEN_PALETTE,
};

/* ── Main Component ── */

export default function LoadingButton({
  icon = "spinner",
  color = "default",
  onComplete,
  className,
  label = "Carregando…",
  ready = true,
}: LoadingButtonProps) {
  const [percent, setPercent] = useState(0);
  const [animDone, setAnimDone] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Animation timer
  useEffect(() => {
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(elapsed / DURATION_MS, 1);
      setPercent(Math.round(p * 100));

      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setAnimDone(true);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fire onComplete only when both animation is done AND ready signal is true
  useEffect(() => {
    if (animDone && ready) {
      const t = setTimeout(() => onCompleteRef.current?.(), 250);
      return () => clearTimeout(t);
    }
  }, [animDone, ready]);

  const activeCount = Math.round((percent / 100) * TOTAL_SEGMENTS);
  const IconComponent = ICONS[icon];
  const colors = COLOR_MAP[color];

  return (
    <button
      type="button"
      disabled
      className={cn(
        "relative flex w-full flex-col items-stretch gap-3 rounded-xl border border-white/10",
        "bg-gradient-to-b from-neutral-900 to-black",
        "px-5 py-4 sm:py-5",
        "min-h-[56px] sm:min-h-[64px]",
        "text-white/90 shadow-xl",
        "cursor-not-allowed select-none transition-all",
        className,
      )}
    >
      {/* Top row: icon + label + percent */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {icon !== "none" && (
            <span className={colors.icon}>
              <IconComponent />
            </span>
          )}
          {label && <span className="text-sm font-medium tracking-wide sm:text-base">{label}</span>}
        </div>
        <span className="tabular-nums text-sm font-semibold text-white sm:text-base">{percent}%</span>
      </div>

      {/* Segmented progress bar */}
      <div className="flex gap-[3px]">
        {Array.from({ length: TOTAL_SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 flex-1 rounded-[3px] transition-colors duration-150",
              i < activeCount ? colors.active : colors.inactive,
            )}
          />
        ))}
      </div>
    </button>
  );
}
