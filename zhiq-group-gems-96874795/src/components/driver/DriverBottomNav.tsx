import { Home, History, User, Megaphone, Users, Wallet, LogOut, TrendingUp } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type NavItem = {
  icon: typeof Home;
  label: string;
  path?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
};

export default function DriverBottomNav() {
  const location = useLocation();
  const { clearActiveProfile } = useAuth();

  const handleSair = async () => {
    await clearActiveProfile();
    window.location.href = "/select-profile";
  };

  const navItems: NavItem[] = [
    { icon: Home,        label: "Início",    path: "/driver" },
    { icon: Users,       label: "Grupos",    path: "/driver/groups" },
    { icon: History,     label: "Histórico", path: "/driver/history" },
    { icon: Wallet,      label: "Carteira",  path: "/driver/wallet" },
    { icon: Megaphone,   label: "Postador",  path: "/driver/postador" },
    { icon: TrendingUp,  label: "Comissão",  path: "/driver/comissao" },
    { icon: User,        label: "Perfil",    path: "/driver/profile" },
    { icon: LogOut,      label: "Sair",      onClick: handleSair, variant: "danger" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-blue-700 backdrop-blur-md border-t-2 border-blue-800 shadow-[0_-4px_20px_rgba(29,78,216,0.35)] px-1 py-1.5 pb-safe">
      <div className="flex items-stretch justify-between max-w-md mx-auto gap-0.5">
        {navItems.map((item) => {
          const isActive = !!item.path && (
            item.path === "/driver"
              ? location.pathname === "/driver"
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
                  ? "text-red-300 hover:text-red-200"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <div className={`p-1 rounded-lg transition-all ${isActive ? "bg-white/15" : ""}`}>
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
