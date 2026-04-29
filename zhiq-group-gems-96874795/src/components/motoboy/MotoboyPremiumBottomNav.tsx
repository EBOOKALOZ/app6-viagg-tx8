import { Home, Search, Heart, Package, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Início', path: '/motoboy' },
  { icon: Search, label: 'Buscar', path: '/motoboy/search' },
  { icon: Heart, label: 'Favoritos', path: '/motoboy/favorites' },
  { icon: Package, label: 'Pedidos', path: '/motoboy/rides' },
  { icon: User, label: 'Moto', path: '/profile' },
];

export function MotoboyPremiumBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/motoboy') {
      return location.pathname === '/motoboy';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/50 safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[60px] rounded-xl transition-all duration-200',
                active 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div
                className={cn(
                  'p-1.5 rounded-xl transition-all duration-200',
                  active && 'bg-primary/10'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 transition-transform',
                    active && 'scale-110'
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium transition-all',
                  active && 'font-semibold'
                )}
              >
                {item.label}
              </span>
              
              {/* Active indicator dot */}
              {active && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
