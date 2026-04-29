import { Outlet } from "react-router-dom";
import { PublicFooter } from "@/components/PublicFooter";

/**
 * Layout para landing pages públicas — sem header, sem botão voltar.
 * Apenas conteúdo + Footer institucional.
 */
export function LandingLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-black">
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
