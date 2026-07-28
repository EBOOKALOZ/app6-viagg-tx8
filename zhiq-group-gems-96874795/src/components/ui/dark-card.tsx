/**
 * ORION-AI — Design System DARK PREMIUM dos cards Viagg-TX8 (07-20).
 *
 * Tokens oficiais (spec congelada):
 *   fundo do card  #1A1F24 · caixas internas #252B33 · borda #323A45
 *   título #FFFFFF · descrição #B8C2CC · secundário #8E98A3
 *   ação principal #FF7A00 (hover #FF8E1F) · identidade/marca #00C58E
 * Regras: NUNCA branco puro em fundos; sombra discreta; radius 16 (card) / 12 (interno);
 * espaçamentos 24/16/12/8. Só UI — zero regra de negócio.
 */
import { forwardRef, type HTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DARK = {
  card: '#1A1F24',
  box: '#252B33',
  border: '#323A45',
  title: '#FFFFFF',
  desc: '#B8C2CC',
  muted: '#8E98A3',
  orange: '#FF7A00',
  orangeHover: '#FF8E1F',
  green: '#00C58E',
} as const;

/** Card raiz dark premium (radius 16, sombra discreta, borda grafite). */
export const CardDark = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl bg-[#1A1F24] border border-[#323A45] shadow-[0_8px_24px_rgba(0,0,0,0.35)] overflow-hidden',
        className
      )}
      {...props}
    />
  )
);
CardDark.displayName = 'CardDark';

/** Caixa interna grafite (Lance Inicial, Datas, Informações, Estatísticas…). */
export const CardInfo = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-xl bg-[#252B33] border border-[#323A45] p-3', className)}
      {...props}
    />
  )
);
CardInfo.displayName = 'CardInfo';

/** Caixa de DESTAQUE (Lance Atual): valor laranja sobre grafite — nunca branco. */
export function CardHighlight({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl bg-[#252B33] border border-[#323A45] p-3', className)}>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#8E98A3]">{label}</p>
      <p className="mt-0.5 text-xl font-black text-[#FF7A00] leading-tight">{value}</p>
    </div>
  );
}

/** Estatística compacta (label secundário + valor branco). */
export function DarkStat({ label, value, icon, className }: { label: string; value: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl bg-[#252B33] border border-[#323A45] p-3', className)}>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#8E98A3]">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-base font-black text-white leading-tight">{icon}{value}</p>
    </div>
  );
}

/** Badge nas 4 cores permitidas (verde/laranja/vermelho/cinza) — nunca branco. */
const BADGE_TONES = {
  green: 'bg-[#00C58E]/15 text-[#00C58E] border-[#00C58E]/40',
  orange: 'bg-[#FF7A00]/15 text-[#FF7A00] border-[#FF7A00]/40',
  red: 'bg-red-500/15 text-red-400 border-red-500/40',
  gray: 'bg-[#252B33] text-[#B8C2CC] border-[#323A45]',
} as const;
export function DarkBadge({ tone = 'gray', className, children }: { tone?: keyof typeof BADGE_TONES; className?: string; children: ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider',
      BADGE_TONES[tone], className
    )}>
      {children}
    </span>
  );
}

/** Botão de ação principal (Dar Lance…): laranja moderno, radius 16, sombra suave. */
export const DarkButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'rounded-2xl bg-[#FF7A00] hover:bg-[#FF8E1F] text-white font-black uppercase text-[11px] sm:text-[11.5px] tracking-normal sm:tracking-wide px-3 sm:px-4 py-2.5 shadow-[0_6px_18px_rgba(255,122,0,0.30)] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5 text-center whitespace-normal',
        className
      )}
      {...props}
    />
  )
);
DarkButton.displayName = 'DarkButton';

/** Botão "Ver no Mapa": transparente, borda e ícone verdes da marca, texto branco. */
export const DarkMapButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }>(
  ({ className, label = 'Ver no Mapa', children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl bg-transparent border border-[#00C58E] text-white text-xs font-bold px-3 py-2 transition-colors hover:bg-[rgba(0,197,142,0.12)]',
        className
      )}
      {...props}
    >
      <MapPin className="h-3.5 w-3.5 text-[#00C58E]" />
      {children ?? label}
    </button>
  )
);
DarkMapButton.displayName = 'DarkMapButton';

/** Overlay padrão para imagens de card (leitura do conteúdo sobre a foto). */
export function CardImageOverlay({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)' }}
    />
  );
}

/** Bloco de skeleton no tom grafite oficial (substitui o spinner isolado nas telas dark). */
export function DarkSkeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-[#252B33]', className)} />;
}
