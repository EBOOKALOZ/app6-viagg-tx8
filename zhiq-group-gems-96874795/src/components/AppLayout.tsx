import { useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { FooterProfile } from "@/components/FooterProfile";
import MotoboyBottomNav from "@/components/motoboy/MotoboyBottomNav";
import BottomNav from "@/components/passenger/BottomNav";
import GlobalAudioPlayer from "@/components/GlobalAudioPlayer";
import { Home, History, User, Store, Wallet, Settings, Truck } from "lucide-react";

/* ===============================
   MERCHANT BOTTOM NAV
================================ */
function MerchantBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Store, label: "Início", path: "/merchant" },
    { icon: Truck, label: "Entregas", path: "/merchant/create-delivery" },
    { icon: Wallet, label: "Carteira", path: "/merchant/billing" },
    { icon: Settings, label: "Loja", path: "/merchant/settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-footer backdrop-blur-md border-t-2 border-footer-border px-4 py-2 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${isActive ? "text-merchant" : "text-footer-foreground/70 hover:text-footer-foreground"
                }`}
            >
              <div className={`p-2 rounded-xl ${isActive ? "bg-merchant/20" : ""}`}>
                <item.icon className={`h-5 w-5 ${isActive ? "text-merchant" : ""}`} />
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-merchant" : ""}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ===============================
   DRIVER BOTTOM NAV
================================ */
function DriverBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Home, label: "Início", path: "/driver" },
    { icon: History, label: "Corridas", path: "/driver/calls" },
    { icon: Wallet, label: "Carteira", path: "/wallet" },
    { icon: User, label: "Perfil", path: "/profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border px-4 py-2 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <div className={`p-2 rounded-xl ${isActive ? "bg-primary/10" : ""}`}>
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-primary" : ""}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ===============================
   ROUTE HELPERS
================================ */

const noBottomNavRoutes = [
  "/auth",
  "/auth/callback",
  "/select-profile",
  "/complete-profile",
  "/terms",
  "/privacidade",
  "/admin",
  "/aceite", // importante evitar layout conflitante
];

function shouldHideBottomNav(pathname: string): boolean {
  return noBottomNavRoutes.some((route) => pathname.startsWith(route));
}

/* ===============================
   APP LAYOUT COM BLOQUEIO GLOBAL
================================ */

export function AppLayout() {
  const { activeProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  /* ===============================
     BLOQUEIO REGULATÓRIO GLOBAL
  ================================ */
  useEffect(() => {
    async function verifyLegal() {
      const { data, error } = await supabase.rpc("check_pending_documents");

      if (error) {
        console.error("Erro ao verificar pendências legais:", error);
        return;
      }

      if (data && Array.isArray(data) && data.length > 0 && location.pathname !== "/aceite") {
        navigate("/aceite");
      }
    }

    verifyLegal();
  }, [location.pathname, navigate]);

  /* ===============================
     HIDE NAV (AUTH / ADMIN / ACEITE)
  ================================ */
  if (shouldHideBottomNav(location.pathname)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 flex flex-col">
          <Outlet />
        </main>
        <FooterProfile profile={activeProfile || "passenger"} />
      </div>
    );
  }

  /* ===============================
     BOTTOM NAV POR PERFIL
  ================================ */
  const renderBottomNav = () => {
    switch (activeProfile) {
      case "passenger":
        return <BottomNav />;
      case "merchant":
        return <MerchantBottomNav />;
      case "driver":
      case "freteiro":
        return <DriverBottomNav />;
      default:
        return null;
    }
  };

  // Só renderiza GlobalAudioPlayer em rotas autenticadas (não públicas)
  const isPublicRoute = shouldHideBottomNav(location.pathname);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex flex-col pb-24">
        <Outlet />
      </main>
      <FooterProfile profile={activeProfile || "passenger"} />
      {renderBottomNav()}
      {/* ★ Não toca música de fundo para motoboy — interfere com notificações de chamada */}
      {!isPublicRoute && activeProfile !== 'motoboy' && <GlobalAudioPlayer />}
    </div>
  );
}
