import { Link, useLocation } from "react-router-dom";
import { Home, Store, PackageSearch, Megaphone, Menu } from "lucide-react";

export function StoreBottomNav() {
  const location = useLocation();

  const navItems = [
    {
      label: "Início",
      icon: <Home className="w-5 h-5 mb-1" />,
      path: "/home",
    },
    {
      label: "Minha Loja",
      icon: <Store className="w-5 h-5 mb-1" />,
      path: "/loja/minha-loja",
    },
    {
      label: "Pedidos",
      icon: <PackageSearch className="w-5 h-5 mb-1" />,
      path: "/loja/pedidos",
    },
    {
      label: "Campanhas",
      icon: <Megaphone className="w-5 h-5 mb-1" />,
      path: "/loja/campanhas",
    },
    {
        label: "Mais",
        icon: <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="w-5 h-5 mb-1" />, 
        path: "/loja/menu",
      },
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full bg-zinc-950/95 backdrop-blur-md border-t border-yellow-500/10 text-zinc-400 z-50 md:hidden pb-safe">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors ${
                isActive ? "text-yellow-500" : "hover:text-zinc-200"
              }`}
            >
              {item.icon}
              <span className={isActive ? "text-yellow-500" : ""}>{item.label}</span>
              {isActive && (
                <span className="absolute top-0 w-8 h-[2px] bg-yellow-500 rounded-b-full shadow-[0_0_8px_rgba(234,179,8,0.8)]" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
