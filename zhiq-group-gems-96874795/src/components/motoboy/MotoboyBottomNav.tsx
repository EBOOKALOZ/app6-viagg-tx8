import { Home, History, User, Megaphone, Users } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function MotoboyBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProfile } = useAuth();

  // Base path based on active profile
  const basePath = activeProfile === 'mototaxi' ? '/mototaxi' : '/motoboy';

  const navItems = [
    { icon: Home, label: "Início", path: basePath },
    { icon: Users, label: "Grupos", path: `${basePath}/grupos` },
    { icon: History, label: "Histórico", path: `${basePath}/historico` },
    { icon: Megaphone, label: "Postador", path: `${basePath}/campanhas` },
    { icon: User, label: "Perfil", path: `${basePath}/profile` },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-footer-motoboy backdrop-blur-md border-t-2 border-footer-motoboy-border px-4 py-2 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          // Check if current path matches this nav item
          const isActive = location.pathname === item.path ||
            (item.path === basePath && location.pathname === basePath);
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${isActive
                ? "text-white"
                : "text-white/70 hover:text-white"
                }`}
            >
              <div className={`p-2 rounded-xl transition-all ${isActive ? "bg-white/20" : ""}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
