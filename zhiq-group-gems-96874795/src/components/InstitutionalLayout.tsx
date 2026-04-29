import { Outlet, useNavigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { FooterProfile } from "@/components/FooterProfile";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface InstitutionalLayoutProps {
  children?: ReactNode;
}

export function InstitutionalLayout({ children }: InstitutionalLayoutProps) {
  const { activeProfile, user } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!user;

  const handleGoHome = () => {
    const profileRoutes: Record<string, string> = {
      passenger: "/passenger",
      driver: "/driver",
      motoboy: "/motoboy",
      mototaxi: "/motoboy",
      merchant: "/merchant",
      freteiro: "/freteiro",
    };

    const route = activeProfile && profileRoutes[activeProfile] ? profileRoutes[activeProfile] : "/select-profile";

    navigate(route);
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* Header institucional neutro */}
      <header className="w-full flex items-center justify-center h-11 relative bg-black border-b border-white/10">
        {isLoggedIn && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoHome}
            className="absolute left-2 top-1/2 -translate-y-1/2 gap-1 h-8 px-2 text-xs text-white/80 hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Início
          </Button>
        )}

        <span className="text-xs tracking-wide text-white/70">
          Viagg-TX8 • Desenvolvido pela Plataforma de Mobilidade
        </span>
      </header>

      {/* Conteúdo */}
      <main className="flex-1">{children ? children : <Outlet />}</main>

      {/* Footer institucional */}
      <FooterProfile profile={activeProfile || 'passenger'} />
    </div>
  );
}
