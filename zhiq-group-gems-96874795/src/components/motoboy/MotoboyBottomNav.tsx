import { Home, History, User, Rocket, Users, LogOut, TrendingUp } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type NavItem = {
  icon: typeof Home;
  label: string;
  path?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
};

export default function MotoboyBottomNav() {
  const location = useLocation();
  const { activeProfile, clearActiveProfile } = useAuth();

  const basePath = activeProfile === 'mototaxi' ? '/mototaxi' : '/motoboy';

  const handleSair = async () => {
    await clearActiveProfile();
    window.location.href = "/select-profile";
  };

  const navItems: NavItem[] = [
    { icon: Home,   label: "Início",      path: basePath },
    { icon: Users,  label: "Grupos",      path: `${basePath}/grupos` },
    { icon: Rocket, label: "Impulsionar", path: `${basePath}/impulsionar` },
    { icon: User,   label: "Perfil",      path: `${basePath}/profile` },
    { icon: LogOut, label: "Sair",        onClick: handleSair, variant: "danger" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-footer-motoboy backdrop-blur-md border-t-2 border-footer-motoboy-border px-1 py-1.5 pb-safe">
      <div className="flex items-stretch justify-between max-w-md mx-auto gap-0.5">
        {navItems.map((item) => {
          const isActive = !!item.path && (
            item.path === basePath
              ? location.pathname === basePath
              : location.pathname.startsWith(item.path)
          );
          const danger = item.variant === "danger";
          return (
            <button
              key={item.label}
              onClick={() => (item.onClick ? item.onClick() : item.path && (window.location.href = item.path))}
              className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 px-0.5 py-1 rounded-lg transition-all active:scale-95 ${
                isActive
                  ? "text-white"
                  : danger
                  ? "text-red-200 hover:text-red-100"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <div className={`p-1 rounded-lg transition-all ${isActive ? "bg-white/20" : ""}`}>
                <item.icon className="h-[18px] w-[18px]" />
              </div>
              <span className="text-[10px] font-medium leading-none truncate w-full text-center">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
