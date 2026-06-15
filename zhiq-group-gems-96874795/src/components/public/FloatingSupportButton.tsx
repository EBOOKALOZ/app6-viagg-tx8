/**
 * FloatingSupportButton — botão de suporte global.
 *
 * Aparece SOMENTE dentro de áreas autenticadas (painéis internos)
 * e nunca na página pública do marketplace.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { Headphones } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// Rotas de painéis internos onde o botão DEVE aparecer
const SHOW_PREFIXES = [
  "/profile",
  "/merchant",
  "/motoboy",
  "/driver",
  "/admin",
  "/advertiser",
  "/passenger",
  "/freteiro",
  "/loading",
  "/select-profile",
];

// Dentro dessas sub-rotas de suporte, esconde para evitar duplicação
const HIDE_PREFIXES = [
  "/support",
  "/suporte",
  "/admin/support",
  "/motoboy/support",
];

export function FloatingSupportButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();

  // Só exibe para usuários logados
  if (!session) return null;

  // Esconde dentro da própria área de suporte
  const hidden = HIDE_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (hidden) return null;

  // Só mostra dentro de painéis internos autenticados
  const inPanel = SHOW_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (!inPanel) return null;

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

