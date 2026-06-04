import { Home, Package, Wallet, Store, User, Repeat, Megaphone, BarChart3, ClipboardList, Coins, Gavel, Tag, TrendingUp, ShoppingBag } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMerchantNotificationBadges } from "@/hooks/useMerchantNotificationBadges";

export function MerchantBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearActiveProfile } = useAuth();
  const { badgeCounts, markSectionAsRead } = useMerchantNotificationBadges();

  const handleSwitchProfile = async () => {
    await clearActiveProfile();
    navigate("/select-profile");
  };

  const navItems = [
    { icon: Home, label: "Início", path: "/merchant", action: undefined, module: undefined },
    { icon: Store, label: "Loja", path: "/merchant/settings", action: undefined, module: "store" },
    { icon: ShoppingBag, label: "Mercado", path: "/mercado", action: undefined, module: undefined },
    { icon: Package, label: "Entregas", path: "/merchant/history", action: undefined, module: "delivery" },
    { icon: ClipboardList, label: "Pedidos", path: "/merchant/pedidos", action: undefined, module: "orders" },
    { icon: TrendingUp, label: "Conversões", path: "/merchant/conversoes", action: undefined, module: "conversions" },
    { icon: Coins, label: "Créditos", path: "/merchant/creditos", action: undefined, module: "credits" },
    // Leilão e Arremate ocultados
    { icon: BarChart3, label: "M1", path: "/merchant/m1", action: undefined, module: "m1" },
    { icon: Megaphone, label: "Campanhas", path: "/merchant/campanhas", action: undefined, module: "campaigns" },
    { icon: Wallet, label: "Carteira", path: "/merchant/billing", action: undefined, module: "wallet" },
    { icon: User, label: "Perfil", path: "/merchant/profile", action: undefined, module: "profile" },
    { icon: Repeat, label: "Trocar", path: null, action: handleSwitchProfile, module: undefined },
  ];

  const handleNav = (item: typeof navItems[0]) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      // Mark section as read when navigating
      if (item.module) {
        markSectionAsRead(item.module);
      }
      navigate(item.path);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0F3D2E] backdrop-blur-md border-t border-white/10 px-1 py-1 pb-safe lg:px-3 xl:px-6">
      <div className="flex items-center justify-around max-w-lg mx-auto lg:max-w-5xl lg:justify-evenly lg:gap-1">
        {navItems.map((item) => {
          const isActive = item.path ? location.pathname === item.path : false;
          const isTrocar = item.label === "Trocar";
          const count = item.module ? (badgeCounts[item.module] || 0) : 0;

          return (
            <button
              key={item.label}
              onClick={() => handleNav(item)}
              className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-xl transition-all min-w-0 lg:px-2 lg:py-2 ${isTrocar
                  ? "text-white/50 hover:text-white/80"
                  : isActive
                    ? "text-white"
                    : "text-white/60 hover:text-white/90"
                }`}
            >
              <div className={`relative p-1.5 rounded-xl transition-all lg:p-2 ${isActive ? "bg-white/20" : ""}`}>
                <item.icon className="h-5 w-5 lg:h-[22px] lg:w-[22px]" />
                {count > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-black text-white shadow-lg shadow-red-500/40 border border-white/20 animate-in zoom-in-50 duration-200"
                  >
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-tight text-center lg:text-[11px]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

