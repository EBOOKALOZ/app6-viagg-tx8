import { useEffect, useRef, useState } from 'react';
import { Award, Check, Lock, Crown, Trophy, Medal, Sparkles, Users, TrendingUp, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TierName = 'Inicial' | 'Bronze' | 'Prata' | 'Ouro' | 'Elite' | 'VIP';

export interface TierDef {
  name: TierName;
  rate: number;          // % de comissão TX8
  groupsRequired: number; // # mínimo de grupos válidos
  icon: typeof Award;
  /** Classes Tailwind para o gradient do badge do tier (quando atingido). */
  gradient: string;
  /** Cor da borda quando ativo / atingido. */
  ring: string;
  /** Cor do texto do nome / %. */
  accent: string;
}

export const TIER_LADDER: TierDef[] = [
  { name: 'Inicial', rate: 25, groupsRequired: 0, icon: Award,  gradient: 'from-zinc-500 to-zinc-700',         ring: 'ring-zinc-400/60',    accent: 'text-zinc-700' },
  { name: 'Bronze',  rate: 20, groupsRequired: 1, icon: Medal,  gradient: 'from-amber-700 to-amber-900',       ring: 'ring-amber-600/60',   accent: 'text-amber-700' },
  { name: 'Prata',   rate: 16, groupsRequired: 2, icon: Medal,  gradient: 'from-slate-300 to-slate-500',       ring: 'ring-slate-400/60',   accent: 'text-slate-600' },
  { name: 'Ouro',    rate: 12, groupsRequired: 3, icon: Trophy, gradient: 'from-yellow-400 to-yellow-600',     ring: 'ring-yellow-400/60',  accent: 'text-yellow-600' },
  { name: 'Elite',   rate: 9,  groupsRequired: 4, icon: Sparkles, gradient: 'from-sky-400 to-blue-600',         ring: 'ring-sky-400/60',     accent: 'text-blue-600' },
  { name: 'VIP',     rate: 6,  groupsRequired: 5, icon: Crown,  gradient: 'from-fuchsia-500 via-purple-500 to-emerald-500', ring: 'ring-purple-400/60', accent: 'text-purple-600' },
];

export function getCurrentTier(validGroups: number): TierDef {
  // Maior tier cujo groupsRequired ≤ validGroups
  let current = TIER_LADDER[0];
  for (const t of TIER_LADDER) {
    if (validGroups >= t.groupsRequired) current = t;
  }
  return current;
}

export function getNextTier(validGroups: number): TierDef | null {
  return TIER_LADDER.find(t => t.groupsRequired > validGroups) ?? null;
}

interface TierLadderCardProps {
  validGroups: number;
  avatarUrl?: string;
  userName?: string;
}

/** Contador animado (sobe suave até o valor em ~700ms). */
function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

/**
 * COMISSÃO INTELIGENTE — painel executivo premium.
 * Mesma lógica de tiers (Inicial → VIP); visual elevado: Inter, branco,
 * respiro, contador animado, barra com brilho, grid de níveis com o
 * card ATUAL em destaque laranja e rodapé explicativo.
 */
export function TierLadderCard({ validGroups }: TierLadderCardProps) {
  const current = getCurrentTier(validGroups);
  const next = getNextTier(validGroups);
  const groupsToNext = next ? next.groupsRequired - validGroups : 0;
  const MAX_GROUPS = 5;
  const progress = Math.min(100, Math.round((Math.min(validGroups, MAX_GROUPS) / MAX_GROUPS) * 100));
  const animatedRate = useCountUp(current.rate);
  const animatedProgress = useCountUp(progress);

  return (
    <div
      className="w-full rounded-[20px] bg-white p-6 sm:p-8 text-slate-900 tier-fadein"
      style={{
        fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 12px 40px -12px rgba(15,23,42,0.10)',
      }}
    >
      {/* Keyframes locais (brilho da barra, fade-in, glow do atual) */}
      <style>{`
        @keyframes tierShine { 0% { transform: translateX(-150%);} 100% { transform: translateX(400%);} }
        @keyframes tierFadeIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: none;} }
        .tier-fadein { animation: tierFadeIn .45s ease-out both; }
        .tier-card { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
        .tier-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -12px rgba(15,23,42,.16); }
      `}</style>

      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl"
            style={{ background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)', boxShadow: '0 8px 20px -8px rgba(22,163,74,.5)' }}
          >
            🎯
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontWeight: 700 }}>
              Comissão Inteligente
            </h2>
            <p className="mt-1 text-sm" style={{ color: '#64748b', fontWeight: 400 }}>
              Quanto mais grupos ativos, menor será sua comissão.
            </p>
          </div>
        </div>

        {/* Card de destaque à direita */}
        <div
          className="flex items-center gap-3 rounded-2xl px-5 py-4"
          style={{
            background: '#dcfce7',
            border: '1px solid rgba(22,163,74,.25)',
            boxShadow: '0 6px 16px -10px rgba(22,163,74,.35)',
          }}
        >
          <span className="text-3xl">🏆</span>
          <div>
            {next ? (
              <>
                <p className="text-sm font-semibold text-slate-900" style={{ fontWeight: 600 }}>
                  Falta{groupsToNext > 1 ? 'm' : ' apenas'} {groupsToNext} grupo{groupsToNext > 1 ? 's' : ''}
                </p>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Para atingir a comissão mínima de 6%.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-900" style={{ fontWeight: 600 }}>
                  Comissão mínima atingida!
                </p>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Você garante os 6% — a menor taxa da plataforma.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Indicadores ───────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 items-center gap-6">
        <div className="text-center">
          <p className="text-6xl leading-none sm:text-7xl" style={{ color: '#16a34a', fontWeight: 700 }}>
            {animatedRate}%
          </p>
          <p className="mt-2 text-sm" style={{ color: '#64748b', fontWeight: 400 }}>
            Comissão Atual
          </p>
        </div>
        <div className="relative text-center">
          <span aria-hidden className="absolute left-0 top-1/2 h-16 w-px -translate-y-1/2 bg-slate-200" />
          <p className="flex items-center justify-center gap-2 text-5xl leading-none sm:text-6xl" style={{ fontWeight: 700 }}>
            <Users className="h-8 w-8 shrink-0" style={{ color: '#16a34a' }} />
            {Math.min(validGroups, MAX_GROUPS)}<span className="text-3xl text-slate-300">/</span>{MAX_GROUPS}
          </p>
          <p className="mt-2 text-sm" style={{ color: '#64748b' }}>
            Grupos Ativos
          </p>
        </div>
      </div>

      {/* ── Barra de progresso premium ────────────────────────────── */}
      <div className="mt-8">
        <div className="relative h-7 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="relative flex h-full items-center justify-end overflow-hidden rounded-full pr-3 transition-all"
            style={{
              width: `${Math.max(progress, 9)}%`,
              background: 'linear-gradient(90deg,#22c55e 0%,#16a34a 100%)',
              transition: 'width .6s cubic-bezier(.22,.9,.35,1)',
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-16"
              style={{
                background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,.45) 50%, transparent 100%)',
                animation: 'tierShine 2.8s ease-in-out infinite',
              }}
            />
            <span className="relative text-xs text-white" style={{ fontWeight: 700 }}>
              {animatedProgress}%
            </span>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: '#16a34a', fontWeight: 600 }}>
          <TrendingUp className="h-4 w-4" />
          {progress >= 100
            ? 'Nível máximo alcançado — comissão mínima garantida!'
            : progress >= 60
              ? 'Você está muito perto! Continue aumentando seus grupos ativos.'
              : 'Cada grupo ativo reduz sua comissão. Continue crescendo!'}
        </p>
      </div>

      {/* ── Faixas de comissão ────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {TIER_LADDER.map((tier, idx) => {
          const achieved = validGroups >= tier.groupsRequired;
          const isCurrent = current.name === tier.name;
          const Icon = tier.icon;
          const nivel = TIER_LADDER.length - idx; // 25%=Nível 6 … 6%=Nível 1

          return (
            <div
              key={tier.name}
              className={cn('tier-card relative rounded-[18px] p-5 text-center')}
              style={
                isCurrent
                  ? {
                      background: 'linear-gradient(180deg,#fff 0%,#fff7ed 100%)',
                      border: '2px solid #f97316',
                      boxShadow: '0 10px 30px -10px rgba(249,115,22,.35), 0 0 0 4px rgba(249,115,22,.08)',
                    }
                  : {
                      background: 'rgba(255,255,255,.75)',
                      border: '1px solid #e2e8f0',
                      backdropFilter: 'blur(4px)',
                    }
              }
            >
              {isCurrent && (
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] uppercase tracking-widest text-white"
                  style={{ background: '#f97316', fontWeight: 700, boxShadow: '0 4px 10px -4px rgba(249,115,22,.6)' }}
                >
                  Atual
                </span>
              )}

              <div
                className={cn(
                  'mx-auto flex items-center justify-center rounded-full',
                  isCurrent ? 'h-12 w-12' : 'h-10 w-10',
                )}
                style={{
                  background: achieved ? '#dcfce7' : '#f1f5f9',
                  color: achieved ? '#16a34a' : '#94a3b8',
                }}
              >
                {achieved ? <Icon className={isCurrent ? 'h-6 w-6' : 'h-5 w-5'} /> : <Lock className="h-4 w-4" />}
              </div>

              <p
                className="mt-3 text-3xl leading-none"
                style={{ fontWeight: 700, color: isCurrent ? '#f97316' : achieved ? '#16a34a' : '#94a3b8' }}
              >
                {tier.rate}%
              </p>
              <p className="mt-1 text-xs" style={{ color: '#64748b' }}>
                {tier.groupsRequired === 0 ? '0 grupos' : `${tier.groupsRequired}+ grupo${tier.groupsRequired > 1 ? 's' : ''}`}
              </p>

              <span
                className="mt-3 inline-block rounded-full px-2.5 py-0.5 text-[10px]"
                style={{
                  background: achieved ? '#dcfce7' : '#f1f5f9',
                  color: achieved ? '#16a34a' : '#94a3b8',
                  fontWeight: 600,
                }}
              >
                Nível {nivel}
              </span>

              {isCurrent && (
                <p className="mt-2 text-[11px]" style={{ color: '#f97316', fontWeight: 600 }}>
                  Você está aqui!
                </p>
              )}
              {achieved && !isCurrent && (
                <p className="mt-2 flex items-center justify-center gap-1 text-[11px]" style={{ color: '#16a34a', fontWeight: 600 }}>
                  <Check className="h-3 w-3" /> Conquistado
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Rodapé informativo ────────────────────────────────────── */}
      <div
        className="mt-8 flex items-start gap-3 rounded-2xl p-5"
        style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,.18)' }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: '#dcfce7', color: '#16a34a' }}
        >
          <Lightbulb className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm text-slate-900" style={{ fontWeight: 600 }}>
            💡 Como funciona?
          </p>
          <p className="mt-0.5 text-sm" style={{ color: '#64748b', fontWeight: 400 }}>
            Sua comissão diminui conforme você mantém mais grupos ativos. Mantenha pelo menos 5
            grupos para garantir a comissão mínima de 6%.
          </p>
        </div>
      </div>
    </div>
  );
}
