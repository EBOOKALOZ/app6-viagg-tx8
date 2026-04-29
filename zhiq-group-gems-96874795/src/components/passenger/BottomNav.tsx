import { Home, History, User } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { icon: Home, label: "Início", path: "/passenger" },
  { icon: History, label: "Histórico", path: "/passenger/history" },
  { icon: User, label: "Perfil", path: "/profile" },
];

interface BottomNavProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = (item: typeof navItems[0]) => {
    // Se tem handler externo, usar ele
    if (onTabChange) {
      onTabChange(item.label);
      return;
    }
    // Senão, navegar diretamente
    navigate(item.path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border px-6 py-2 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          // Determinar ativo: ou via activeTab prop ou via location
          const isActive = activeTab 
            ? activeTab === item.label 
            : location.pathname === item.path;
          
          return (
            <button
              key={item.label}
              onClick={() => handleClick(item)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                isActive 
                  ? "text-zhiq-teal" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`p-2 rounded-xl transition-all ${isActive ? "bg-zhiq-teal/10" : ""}`}>
                <item.icon className={`h-5 w-5 ${isActive ? "text-zhiq-teal" : ""}`} />
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-zhiq-teal" : ""}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
