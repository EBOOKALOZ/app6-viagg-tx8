import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MarketNavButtonsProps {
  onMercadoClick?: () => void;
  onMotoboyClick?: () => void;
}

const ROUTES: { label: string; path: string }[] = [
  { label: "Motoboy",           path: "__motoboy__" },
  { label: "Mercado",           path: "/mercado" },
  { label: "Imóveis",           path: "/imoveis" },
  { label: "Veículos",          path: "/automoveis" },
  { label: "Serviços",          path: "/servicos" },
  { label: "Fretes & Mudanças", path: "/fretes" },
  { label: "Viagens & Turismo", path: "/viagens" },
];

export function MarketNavButtons({ onMercadoClick, onMotoboyClick }: MarketNavButtonsProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (path: string) =>
    path === "/mercado"
      ? pathname === "/mercado" || pathname === "/"
      : pathname === path;

  const handleClick = (path: string) => {
    if (path === "__motoboy__") {
      if (onMotoboyClick) { onMotoboyClick(); return; }
      localStorage.setItem("viagg_auth_entry", "motoboy");
      navigate("/auth?entry=motoboy&signup=1");
      return;
    }
    if (path === "/mercado" && (pathname === "/mercado" || pathname === "/")) {
      onMercadoClick?.();
      return;
    }
    navigate(path);
  };

  return (
    <div className="pb-2 flex gap-1 sm:gap-2 justify-center px-1.5">
      {ROUTES.map(({ label, path }) => {
        const active = isActive(path);
        return (
          <button
            key={path}
            onClick={() => handleClick(path)}
            className={cn(
              "flex-1 sm:flex-none sm:px-4 flex items-center justify-center h-7 rounded-lg font-black text-[8px] sm:text-[11px] uppercase tracking-tight shadow-md hover:scale-105 active:scale-95 transition-all",
              active
                ? "bg-gray-900 text-[#F5E62B] ring-2 ring-black/20"
                : "bg-[#F5E62B] text-blue-600"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
