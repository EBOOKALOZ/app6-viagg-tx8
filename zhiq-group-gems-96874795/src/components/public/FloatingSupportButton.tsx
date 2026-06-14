/**
 * FloatingSupportButton — botão de suporte global.
 *
 * Aparece em todas as páginas (canto inferior esquerdo, para não colidir com o
 * carrinho flutuante à direita) e leva o usuário à área de suporte, onde pode
 * abrir um chamado / falar com o atendimento.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { Headphones } from "lucide-react";

// Não mostra dentro da própria área de suporte e em telas de transição/login.
const HIDE_PREFIXES = [
  "/support",
  "/suporte",
  "/admin/support",
  "/motoboy/support",
  "/auth",
  "/loading",
  "/select-profile",
];

export function FloatingSupportButton() {
  const location = useLocation();
  const navigate = useNavigate();

  const hidden = HIDE_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (hidden) return null;

  return (
    <button
      onClick={() => navigate("/support")}
      title="Falar com o Suporte"
      aria-label="Falar com o Suporte"
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-white shadow-2xl transition-all duration-200 hover:scale-105"
      style={{ boxShadow: "0 8px 30px rgba(16,185,129,0.4)" }}
    >
      <Headphones className="h-5 w-5" />
      <span className="text-sm font-bold">Suporte</span>
    </button>
  );
}

export default FloatingSupportButton;
