import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  MessageSquare, 
  User, 
  LogOut, 
  Users, 
  BarChart3,
  Menu,
  X,
  Wallet,
  UserPlus,
  Store,
  Building2,
  Car,
  Gavel
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Footer } from '@/components/Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAdmin, activeProfile, refreshProfiles } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Re-sync profile data on route change
  useEffect(() => {
    if (user?.id) refreshProfiles();
  }, [location.pathname]);

  // Links for motoboy/driver profiles (with groups)
  const providerLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/groups', label: 'Grupos', icon: MessageSquare },
    { href: '/wallet', label: 'Carteira', icon: Wallet },
    { href: '/profile', label: 'Perfil', icon: User },
  ];

  // Merchant links (no groups - different economic model)
  const merchantLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/wallet', label: 'Carteira', icon: Wallet },
    { href: '/profile', label: 'Perfil', icon: User },
  ];

  // Passenger-specific links (replace "Grupos" with "Indicar Amigos")
  const passengerLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/refer-friends', label: 'Indicar Amigos', icon: UserPlus },
    { href: '/wallet', label: 'Carteira', icon: Wallet },
    { href: '/profile', label: 'Perfil', icon: User },
  ];

  // Select links based on active profile
  const getUserLinks = () => {
    if (activeProfile === 'passenger') return passengerLinks;
    if (activeProfile === 'merchant') return merchantLinks;
    return providerLinks; // motoboy, driver, freteiro
  };
  
  const userLinks = getUserLinks();

  const adminLinks = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Usuários', icon: Users },
    { href: '/admin/stats', label: 'Estatísticas', icon: BarChart3 },
  ];

  const links = isAdmin ? adminLinks : userLinks;

  const exploreLinks = [
    { href: '/mercado', label: 'Mercado', icon: Store },
    { href: '/imoveis', label: 'Imóveis', icon: Building2 },
    { href: '/automoveis', label: 'Veículos', icon: Car },
    { href: '/leiloes', label: 'Leilões', icon: Gavel },
  ];

  // Navigate back to main panel based on active profile (not logout)
  const handleBackToPanel = () => {
    const profileRoutes: Record<string, string> = {
      passenger: '/',
      driver: '/driver',
      motoboy: '/motoboy',
      merchant: '/merchant',
    };
    const route = activeProfile ? profileRoutes[activeProfile] || '/' : '/select-profile';
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Logo size="sm" />
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-lg p-2 hover:bg-secondary"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background pt-16 md:hidden">
          <nav className="flex flex-col gap-2 p-4">
            {links.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-lg transition-colors',
                  location.pathname === link.href
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-secondary'
                )}
              >
                <link.icon className="h-5 w-5" />
                {link.label}
              </Link>
            ))}

            {isAdmin && (
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-lg text-muted-foreground hover:bg-secondary"
              >
                <User className="h-5 w-5" />
                Área do Usuário
              </Link>
            )}

            {exploreLinks.length > 0 && (
              <>
                <div className="h-px bg-border my-2" />
                {exploreLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-lg transition-colors',
                      location.pathname === link.href
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-secondary'
                    )}
                  >
                    <link.icon className="h-5 w-5" />
                    {link.label}
                  </Link>
                ))}
              </>
            )}

            <button
              onClick={handleBackToPanel}
              className="mt-4 flex items-center gap-3 rounded-lg px-4 py-3 text-lg text-muted-foreground hover:bg-secondary"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </button>
          </nav>
        </div>
      )}

      <div className="flex flex-1">
        {/* Desktop Sidebar - fixed position */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-card border-r border-border">
          <div className="flex flex-col flex-1 p-4">
            <div className="mb-8 px-2">
              <Logo size="md" showText />
            </div>

            <nav className="flex flex-col gap-1 flex-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    location.pathname === link.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-secondary'
                  )}
                >
                  <link.icon className="h-5 w-5" />
                  {link.label}
                </Link>
              ))}

              {isAdmin && (
                <Link
                  to="/dashboard"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary mt-4"
                >
                  <User className="h-5 w-5" />
                  Área do Usuário
                </Link>
              )}
            </nav>

            <div className="mt-auto border-t border-border pt-4">
              <div className="mb-3 px-3">
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                {isAdmin && (
                  <span className="inline-block mt-1 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                    Admin
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:bg-secondary"
                onClick={handleBackToPanel}
              >
                <LogOut className="h-5 w-5" />
                Sair
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Content - Sticky Footer Layout */}
        <main className="flex-1 md:ml-64 flex flex-col min-h-[calc(100vh-56px)] md:min-h-screen">
          <div className="container py-6 px-4 md:py-8 md:px-8 max-w-5xl flex-1 flex flex-col">
            {children}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
