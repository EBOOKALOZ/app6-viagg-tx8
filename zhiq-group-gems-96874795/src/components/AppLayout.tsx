import { useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { FooterProfile } from "@/components/FooterProfile";
import { FooterNeutral } from "@/components/FooterNeutral";
import MotoboyBottomNav from "@/components/motoboy/MotoboyBottomNav";
import BottomNav from "@/components/passenger/BottomNav";
import { StoreBottomNav } from "@/components/store/StoreBottomNav";
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
  const location = useLocation();

  const navItems = [
    { icon: Home,    label: "Início",   path: "/driver" },
    { icon: History, label: "Corridas", path: "/driver/calls" },
    { icon: Wallet,  label: "Carteira", path: "/driver/wallet" },
    { icon: User,    label: "Perfil",   path: "/driver/profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-blue-700 backdrop-blur-md border-t-2 border-blue-800 shadow-[0_-4px_20px_rgba(29,78,216,0.35)] px-4 py-2 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = item.path === "/driver"
            ? location.pathname === "/driver"
            : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.label}
              onClick={() => { window.location.href = item.path; }}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                isActive ? "text-white" : "text-white/70 hover:text-white"
              }`}
            >
              <div className={`p-2 rounded-xl ${isActive ? "bg-white/15" : ""}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">{item.label}</span>
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

  // Motorista não deve ficar em rotas genéricas — redireciona para o painel próprio
  useEffect(() => {
    if (activeProfile === 'driver' && location.pathname === '/profile') {
      window.location.href = '/driver/profile';
    }
    if (activeProfile === 'driver' && location.pathname === '/wallet') {
      window.location.href = '/driver/wallet';
    }
  }, [activeProfile, location.pathname]);

  // Se a pessoa chegou aqui vindo de um painel de anunciante (imóveis/veículos/
  // serviços — gravado pelo AdvertiserPanelLayout), mostra o mesmo rodapé neutro
  // do Painel Geral em vez do FooterProfile do perfil ativo (ex: motoboy).
  const panelContext = sessionStorage.getItem("viagg_panel_context");
  const cameFromAdvertiserPanel = ["imoveis", "veiculos", "servicos"].includes(panelContext || "");
  const PageFooter = cameFromAdvertiserPanel ? <FooterNeutral /> : <FooterProfile profile={activeProfile || "passenger"} />;

  /* ===============================
     BLOQUEIO REGULATÓRIO GLOBAL
  ================================ */
  useEffect(() => {
    async function verifyLegal() {
      const { data, error } = await supabase.rpc("check_pending_documents");

      if (error) {
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
        {PageFooter}
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
        return <StoreBottomNav />;
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
      {PageFooter}
      {renderBottomNav()}
    </div>
  );
}
