import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";
import { getProfileRoute } from "@/lib/profileTypes";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeProfile, user } = useAuth();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);

    // Auto-fix para o problema reportado de double slashes URL:
    if (location.pathname.includes('//motoboy/grupos')) {
      navigate('/motoboy/grupos', { replace: true });
    } else if (location.pathname.includes('//mototaxi/grupos')) {
      navigate('/mototaxi/grupos', { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleGoBack = () => {
    // Se tem perfil ativo, volta pro painel correto
    if (activeProfile) {
      const route = getProfileRoute(activeProfile);
      navigate(route);
      return;
    }

    // Se está logado mas sem perfil, vai pra seleção
    if (user) {
      navigate('/select-profile');
      return;
    }

    // Senão, vai pra home
    navigate('/');
  };

  const getButtonLabel = () => {
    if (activeProfile) {
      return 'Voltar ao painel';
    }
    if (user) {
      return 'Escolher perfil';
    }
    return 'Ir para início';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center px-4">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <span className="text-4xl font-bold text-muted-foreground">404</span>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Página não encontrada</h1>
        <p className="mb-6 text-muted-foreground max-w-sm mx-auto">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => navigate(-1)} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={handleGoBack} className="gap-2">
            <Home className="h-4 w-4" />
            {getButtonLabel()}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
