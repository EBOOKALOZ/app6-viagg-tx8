import { useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useHubBadges } from '@/hooks/useHubBadges';
import {
  LayoutDashboard, Send, Users, History,
  TrendingUp, Megaphone, Wallet, Sparkles,
  BarChart3, Globe2, Radio, Rocket, Bell,
} from 'lucide-react';

type Tab = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  segment: string;
  isRIDV?: boolean;
};

const TABS: Tab[] = [
  { key: 'dashboard',    label: 'Início',          icon: LayoutDashboard, segment: '' },
  // { key: 'gerenciador',  label: 'Gerenciar',       icon: Rocket,          segment: 'gerenciador',  isRIDV: true },
  { key: 'analytics',    label: 'Analytics',       icon: BarChart3,       segment: 'analytics',    isRIDV: true },
  // { key: 'creditos',     label: 'Créditos',        icon: Sparkles,        segment: 'creditos',     isRIDV: true },
  { key: 'notificacoes', label: 'Notificações',    icon: Bell,            segment: 'notificacoes', isRIDV: true },
  { key: 'divulgacoes',  label: 'Divulgações',     icon: Send,            segment: 'divulgacoes' },
  // { key: 'campanhas',    label: 'Campanhas',       icon: Megaphone,       segment: 'campanhas',    isRIDV: true },
  { key: 'resultados',   label: 'Resultados',      icon: BarChart3,       segment: 'resultados',   isRIDV: true },
  { key: 'impacto',      label: 'Impacto',         icon: Globe2,          segment: 'impacto',      isRIDV: true },
  { key: 'ia-ridv',      label: 'IA RIDV',         icon: Sparkles,        segment: 'ia-ridv',      isRIDV: true },
  { key: 'historico',    label: 'Histórico',       icon: History,         segment: 'historico' },
  { key: 'grupos',       label: 'Grupos',          icon: Users,           segment: 'grupos' },
  { key: 'carteira',     label: 'Carteira',        icon: Wallet,          segment: 'carteira' },
  { key: 'comissao',     label: 'Comissão',        icon: TrendingUp,      segment: 'comissao' },
  // { key: 'promover',     label: 'Promover',        icon: Sparkles,        segment: 'promover' },
];

export function CentralImpulsionamentoBanner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const hubProfile = base === '/mototaxi' ? 'mototaxi' as const
    : base === '/driver' ? 'driver' as const
    : 'motoboy' as const;
  const badges = useHubBadges(hubProfile);

  const getIsActive = (tab: Tab) => {
    if (tab.segment === '') {
      return pathname === hubRoot;
    }
    return pathname.startsWith(`${hubRoot}/${tab.segment}`);
  };

  const activeClass = base === '/mototaxi'
    ? 'bg-footer-mototaxi text-footer-mototaxi-foreground'
    : base === '/driver'
    ? 'bg-amber-600 text-white'
    : 'bg-motoboy text-white';

  const ridvActiveClass = 'text-white shadow-orange-500/30 shadow-lg';

  return (
    <div className="sticky top-0 z-30 bg-[#F5E62B] border-b border-black/10 shadow-sm shrink-0">
      <div
        className="flex items-center gap-2 px-3 pt-1.5 pb-1"
        style={{ borderBottom: '1px solid rgba(255,106,0,0.08)' }}
      >
        <Radio className="h-3 w-3 text-orange-400/60 shrink-0" />
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400/55">
          Central de Impulsionamento · RIDV
        </p>
      </div>

      <div className="relative flex items-center px-1 py-2">
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
                    : 'text-black/65 hover:bg-black/10'
                )}
                style={isActive && tab.isRIDV ? {
                  background: 'linear-gradient(135deg, #FF6A00, #FF9500)',
                  boxShadow: '0 2px 12px rgba(255,106,0,0.35)',
                } : undefined}
              >
                <tab.icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
                {badges?.[tab.key] != null && (
                  <span
                    className="ml-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-black text-white"
                    style={{ background: '#16a34a', boxShadow: '0 2px 6px rgba(22,163,74,.4)' }}
                  >
                    {badges[tab.key] > 99 ? '99+' : badges[tab.key]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
