import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Menu, LogOut, Users, HeadphonesIcon, FileText, Shield } from 'lucide-react';
import logoImg from '@/assets/logo.png';

/**
 * Layout limpo para onboarding do Motoboy (perfil incompleto).
 * Header com card do usuário + hamburger → drawer lateral.
 * Sem sidebar fixa, bottom nav ou footer operacional.
 */
export function MotoboyOnboardingLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Motoboy';
  const avatarUrl = user?.user_metadata?.avatar_url || '';
  const initials = userName.slice(0, 2).toUpperCase();

  const menuItems = [
    {
      icon: LogOut,
      label: 'Sair / Voltar',
      onClick: () => navigate('/select-profile', { replace: true }),
    },
    {
      icon: Users,
      label: 'Trocar perfil',
      onClick: () => navigate('/select-profile', { replace: true }),
    },
    {
      icon: HeadphonesIcon,
      label: 'Suporte',
      onClick: () => navigate('/motoboy/support'),
    },
    {
      icon: FileText,
      label: 'Termos / Privacidade',
      onClick: () => navigate('/termos'),
    },
  ];

  return (
    <div className="min-h-screen bg-motoboy-surface flex flex-col">
      {/* ── Header ── */}
      <header className="px-4 pt-5 pb-4 bg-motoboy-header flex items-center justify-between gap-3">
        {/* User card */}
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10 border-2 border-white/20 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="bg-white/10 text-white text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-motoboy-header-foreground truncate">
              {userName}
            </p>
            <p className="text-[11px] text-motoboy-header-foreground/60 truncate">
              {user?.email}
            </p>
            <span className="inline-flex items-center mt-0.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-motoboy-header-foreground/80">
              Motoboy em cadastro
            </span>
          </div>
        </div>

        {/* Hamburger removed */}
      </header>

      {/* ── Drawer overlay ── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-72 bg-motoboy-header border-l-0 p-0">
          <SheetHeader className="px-5 pt-6 pb-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <img src={logoImg} alt="Viagg" className="h-8 w-8 rounded-lg" />
              <SheetTitle className="text-motoboy-header-foreground text-base">
                Menu
              </SheetTitle>
            </div>
          </SheetHeader>

          <nav className="flex flex-col py-2">
            {menuItems.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setDrawerOpen(false);
                  item.onClick();
                }}
                className="flex items-center gap-3 px-5 py-3.5 text-sm text-motoboy-header-foreground/90 hover:bg-white/10 transition-colors text-left"
              >
                <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                {item.label}
              </button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* ── Conteúdo (formulário de perfil) ── */}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {/* ── Rodapé institucional simples ── */}
      <footer className="border-t border-white/10 py-5 px-4" style={{ backgroundColor: '#0f1729' }}>
        <div className="max-w-lg mx-auto flex flex-col items-center gap-2">
          <div className="flex items-center gap-4 text-white/50 text-[11px]">
            <button onClick={() => navigate('/termos')} className="hover:text-white/80 transition-colors">
              Termos de uso
            </button>
            <span className="text-white/20">•</span>
            <button onClick={() => navigate('/privacidade')} className="hover:text-white/80 transition-colors">
              Privacidade
            </button>
            <span className="text-white/20">•</span>
            <button onClick={() => navigate('/motoboy/support')} className="hover:text-white/80 transition-colors">
              Suporte
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-white/30 text-[10px]">
            <Shield className="h-3 w-3" />
            <span>© {new Date().getFullYear()} Viagg-TX8 — Dados protegidos</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
