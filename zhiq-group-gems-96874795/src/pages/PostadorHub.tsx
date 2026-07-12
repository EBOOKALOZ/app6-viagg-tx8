import { useRef, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Send, Users, History,
  TrendingUp, Megaphone, Wallet, Sparkles,
  BarChart3, Globe2, Radio, Rocket, Bell,
} from 'lucide-react';

type Tab = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  segment: string; // sub-path segment after /impulsionar
  isRIDV?: boolean; // marca as abas RIDV
};

const TABS: Tab[] = [
  { key: 'dashboard',    label: 'Início',          icon: LayoutDashboard, segment: '' },
  { key: 'gerenciador',  label: 'Gerenciar',       icon: Rocket,          segment: 'gerenciador',  isRIDV: true },
  { key: 'analytics',    label: 'Analytics',       icon: BarChart3,       segment: 'analytics',    isRIDV: true },
  { key: 'creditos',     label: 'Créditos',        icon: Sparkles,        segment: 'creditos',     isRIDV: true },
  { key: 'notificacoes', label: 'Notificações',    icon: Bell,            segment: 'notificacoes', isRIDV: true },
  { key: 'divulgacoes',  label: 'Divulgações',     icon: Send,            segment: 'divulgacoes' },
  // Aba Campanhas UNIFICADA dentro de Divulgações (2026-07-12) — código preservado; descomentar para reativar
  // { key: 'campanhas',    label: 'Campanhas',       icon: Megaphone,       segment: 'campanhas',    isRIDV: true },
  { key: 'resultados',   label: 'Resultados',      icon: BarChart3,       segment: 'resultados',   isRIDV: true },
  { key: 'impacto',      label: 'Impacto',         icon: Globe2,          segment: 'impacto',      isRIDV: true },
  { key: 'ia-ridv',      label: 'IA RIDV',         icon: Sparkles,        segment: 'ia-ridv',      isRIDV: true },
  { key: 'historico',    label: 'Histórico',       icon: History,         segment: 'historico' },
  { key: 'grupos',       label: 'Grupos',          icon: Users,           segment: 'grupos' },
  { key: 'carteira',     label: 'Carteira',        icon: Wallet,          segment: 'carteira' },
  { key: 'comissao',     label: 'Comissão',        icon: TrendingUp,      segment: 'comissao' },
  // Página Promover OCULTA a pedido (2026-07-12) — descomentar para reativar
  // { key: 'promover',     label: 'Promover',        icon: Sparkles,        segment: 'promover' },
];

export default function PostadorHub() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Derive base from current path (/motoboy, /mototaxi, /driver)
  const base = pathname.startsWith('/mototaxi')
    ? '/mototaxi'
    : pathname.startsWith('/driver')
    ? '/driver'
    : '/motoboy';

  const hubRoot = `${base}/impulsionar`;

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector('[data-active="true"]') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [pathname]);

  // Active tab detection
  const getIsActive = (tab: Tab) => {
    if (tab.segment === '') {
      return pathname === hubRoot;
    }
    return pathname.startsWith(`${hubRoot}/${tab.segment}`);
  };

  // Active color by profile
  const activeClass = base === '/mototaxi'
    ? 'bg-footer-mototaxi text-footer-mototaxi-foreground'
    : base === '/driver'
    ? 'bg-amber-600 text-white'
    : 'bg-motoboy text-white';

  // RIDV active class (orange gradient — same across profiles)
  const ridvActiveClass = 'text-white shadow-orange-500/30 shadow-lg';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Hub identity bar ─────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-motoboy-surface border-b border-motoboy/15 shadow-sm">
        {/* RIDV identity strip */}
        <div
          className="flex items-center gap-2 px-3 pt-1.5 pb-1"
          style={{ borderBottom: '1px solid rgba(255,106,0,0.08)' }}
        >
          <Radio className="h-3 w-3 text-orange-400/60 shrink-0" />
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400/55">
            Central de Impulsionamento · RIDV
          </p>
        </div>

        {/* ── Tab bar ─────────────────────────────────── */}
        <div className="relative flex items-center px-1 py-2">
          {/* Container rolável */}
          <div
            ref={scrollRef}
            className="flex overflow-x-auto scrollbar-hide gap-1 px-2 w-full scroll-smooth"
          >
            {TABS.map((tab) => {
              const isActive = getIsActive(tab);
              return (
                <button
                  key={tab.key}
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() =>
                    navigate(tab.segment === '' ? hubRoot : `${hubRoot}/${tab.segment}`)
                  }
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                    'text-xs font-semibold whitespace-nowrap transition-all active:scale-95 shrink-0',
                    isActive
                      ? tab.isRIDV
                        ? ridvActiveClass
                        : `${activeClass} shadow-sm`
                      : 'text-muted-foreground hover:bg-muted/60'
                  )}
                  style={isActive && tab.isRIDV ? {
                    background: 'linear-gradient(135deg, #FF6A00, #FF9500)',
                    boxShadow: '0 2px 12px rgba(255,106,0,0.35)',
                  } : undefined}
                >
                  <tab.icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab content (nested route) ────────────── */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
