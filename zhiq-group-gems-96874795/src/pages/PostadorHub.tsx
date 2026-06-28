import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Send, Users, History,
  TrendingUp, Megaphone, Wallet,
} from 'lucide-react';

type Tab = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  segment: string; // sub-path segment after /postador
};

const TABS: Tab[] = [
  { key: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard, segment: '' },
  { key: 'postagens',  label: 'Postagens',  icon: Send,            segment: 'postagens' },
  { key: 'grupos',     label: 'Grupos',     icon: Users,           segment: 'grupos' },
  { key: 'carteira',   label: 'Carteira',   icon: Wallet,          segment: 'carteira' },
  { key: 'historico',  label: 'Histórico',  icon: History,         segment: 'historico' },
  { key: 'comissao',   label: 'Comissão',   icon: TrendingUp,      segment: 'comissao' },
  { key: 'campanhas',  label: 'Campanhas',  icon: Megaphone,       segment: 'campanhas' },
];

export default function PostadorHub() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Derive base from current path (/motoboy, /mototaxi, /driver)
  const base = pathname.startsWith('/mototaxi')
    ? '/mototaxi'
    : pathname.startsWith('/driver')
    ? '/driver'
    : '/motoboy';

  const hubRoot = `${base}/postador`;

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

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Tab bar ─────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-motoboy-surface border-b border-motoboy/15 shadow-sm">
        <div className="flex overflow-x-auto scrollbar-hide gap-1 px-2 py-2">
          {TABS.map((tab) => {
            const isActive = getIsActive(tab);
            return (
              <button
                key={tab.key}
                onClick={() =>
                  navigate(tab.segment === '' ? hubRoot : `${hubRoot}/${tab.segment}`)
                }
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                  'text-xs font-semibold whitespace-nowrap transition-all active:scale-95',
                  isActive
                    ? `${activeClass} shadow-sm`
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
              >
                <tab.icon className="h-3.5 w-3.5 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content (nested route) ────────────── */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
