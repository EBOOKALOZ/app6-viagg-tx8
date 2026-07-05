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

export default function MototaxiBottomNav() {
  const location = useLocation();
  const { clearActiveProfile } = useAuth();

  const handleSair = async () => {
    await clearActiveProfile();
    window.location.href = "/select-profile";
  };

  const navItems: NavItem[] = [
    { icon: Home,   label: "Início",      path: "/mototaxi" },
    { icon: Users,  label: "Grupos",      path: "/mototaxi/grupos" },
    { icon: Rocket, label: "Impulsionar", path: "/mototaxi/impulsionar" },
    { icon: User,   label: "Perfil",      path: "/mototaxi/profile" },
    { icon: LogOut, label: "Sair",        onClick: handleSair, variant: "danger" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-footer-mototaxi backdrop-blur-md border-t-2 border-footer-mototaxi-border shadow-[0_-4px_20px_rgba(245,230,43,0.3)] px-1 py-1.5 pb-safe">
      <div className="flex items-stretch justify-between max-w-md mx-auto gap-0.5">
        {navItems.map((item) => {
          const isActive = !!item.path && (
            item.path === "/mototaxi"
              ? location.pathname === "/mototaxi"
              : location.pathname.startsWith(item.path)
          );
          const danger = item.variant === "danger";
          return (
            <button
              key={item.label}
              onClick={() => (item.onClick ? item.onClick() : item.path && (window.location.href = item.path))}
              className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 px-0.5 py-1 rounded-lg transition-all active:scale-95 ${
                isActive
                  ? "text-footer-mototaxi-foreground"
                  : danger
                  ? "text-red-700 hover:text-red-600"
                  : "text-footer-mototaxi-foreground/70 hover:text-footer-mototaxi-foreground"
              }`}
            >
              <div className={`p-1 rounded-lg transition-all ${isActive ? "bg-footer-mototaxi-foreground/10" : ""}`}>
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
