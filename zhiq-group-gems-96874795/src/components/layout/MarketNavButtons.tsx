import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MarketNavButtonsProps {
  onMercadoClick?: () => void;
  onMotoboyClick?: () => void;
}

const TOP_ROUTES: { label: string; path: string }[] = [
  { label: "Corridas", path: "/corridas-inicio" },
  { label: "Mercado",  path: "/mercado" },
  { label: "Imóveis",  path: "/imoveis" },
  { label: "Veículos", path: "/automoveis" },
  { label: "Serviços", path: "/servicos" },
];

const BOTTOM_ROUTES: { label: string; path: string }[] = [
  { label: "Fretes & Mudanças", path: "/fretes" },
  { label: "Viagens & Turismo", path: "/viagens" },
  { label: "🏷️ Leilões", path: "/leiloes" },
];

export function MarketNavButtons({ onMercadoClick, onMotoboyClick }: MarketNavButtonsProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (path: string) => {
    if (path === "/corridas-inicio") {
      return pathname.startsWith("/corridas") || pathname.startsWith("/solicitar-corrida") || pathname.startsWith("/corrida");
    }
    if (path === "/mercado") {
      return (
        pathname === "/mercado" ||
        pathname === "/" ||
        pathname.startsWith("/mercado/") ||
        pathname.startsWith("/produto/") ||
        pathname.startsWith("/p/") ||
        pathname.startsWith("/loja/") ||
        pathname.startsWith("/checkout/produto/") ||
        pathname.startsWith("/pagamento/") ||
        pathname.startsWith("/leiloes") ||
        pathname.startsWith("/leilao/") ||
        pathname.startsWith("/arremate/")
      );
    }
    if (path === "/imoveis") {
      return pathname.startsWith("/imoveis") || pathname.startsWith("/real-estate");
    }
    if (path === "/automoveis") {
      return pathname.startsWith("/automoveis") || pathname.startsWith("/veiculos");
    }
    if (path === "/servicos") {
      return pathname.startsWith("/servicos");
    }
    if (path === "/fretes") {
      return pathname.startsWith("/fretes");
    }
    if (path === "/viagens") {
      return pathname.startsWith("/viagens");
    }
    if (path === "/leiloes") {
      return pathname.startsWith("/leiloes") || pathname.startsWith("/leilao/") || pathname.startsWith("/arremate/");
    }
    return pathname === path;
  };

  const handleClick = (path: string) => {
    if (path === "/mercado" && (pathname === "/mercado" || pathname === "/")) {
      onMercadoClick?.();
      return;
    }
    navigate(path);
  };

  return (
    <div className="pb-2.5 pt-1.5 flex flex-col gap-1.5 sm:gap-2 justify-center items-center px-1 sm:px-0 w-full" role="navigation" aria-label="Categorias da plataforma">
      {/* Linha Superior: Corridas, Mercado, Imóveis, Veículos, Serviços */}
      <div className="flex flex-wrap sm:flex-nowrap gap-1.5 sm:gap-2.5 justify-center items-center w-full">
        {TOP_ROUTES.map(({ label, path }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => handleClick(path)}
              aria-label={`Categoria ${label}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-1 sm:flex-none sm:px-5 flex items-center justify-center h-8 sm:h-9 rounded-[18px] font-black text-[10px] sm:text-xs uppercase tracking-tight select-none transition-all duration-200 ease-out cursor-pointer focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-none",
                active
                  ? "bg-[#68C7F2] text-slate-950 border-2 border-[#FFC107] shadow-[0_0_18px_rgba(255,193,7,0.5)] scale-[1.03] z-10 font-black"
                  : "bg-[#68C7F2] text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.1)] hover:bg-[#5bbdee] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:scale-[1.03] active:scale-95 active:translate-y-0"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Linha Inferior (Botões Horizontais Largos): Fretes & Mudanças | Viagens & Turismo | Leilões */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 w-full">
        {BOTTOM_ROUTES.map(({ label, path }) => {
          const active = isActive(path);
          return (
            <button
              key={path}
              onClick={() => handleClick(path)}
              aria-label={`Categoria ${label}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "w-full flex items-center justify-center h-8 sm:h-9 rounded-[18px] font-black text-[10px] sm:text-xs uppercase tracking-tight select-none transition-all duration-200 ease-out cursor-pointer focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-none",
                active
                  ? "bg-[#68C7F2] text-slate-950 border-2 border-[#FFC107] shadow-[0_0_18px_rgba(255,193,7,0.5)] scale-[1.03] z-10 font-black"
                  : "bg-[#68C7F2] text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.1)] hover:bg-[#5bbdee] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(0,0,0,0.16)] hover:scale-[1.03] active:scale-95 active:translate-y-0"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
