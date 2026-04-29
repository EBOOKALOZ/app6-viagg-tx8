import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function RedirectByProfile() {
  const navigate = useNavigate();
  const { user, role, initialized, profileReady, isAdmin } = useAuth();

  const navigatedRef = useRef(false);

  useEffect(() => {
    if (navigatedRef.current) return;

    // ⏳ aguarda bootstrap completo
    if (!initialized || !profileReady) return;

    navigatedRef.current = true;

    // 🔐 não logado
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    // 👑 admin vai direto ao painel admin
    if (role === "admin" || isAdmin) {
      navigate("/admin", { replace: true });
      return;
    }

    // 📢 Advertiser check
    const authEntry = localStorage.getItem("viagg_auth_entry");
    if (authEntry === "advertiser") {
      navigate("/anunciante/painel", { replace: true });
      return;
    }

    // ✅ autenticado → sempre passa por "Escolher Perfil"
    navigate("/select-profile", { replace: true });
  }, [initialized, profileReady, user, role, navigate]);

  // fallback visual mínimo
  return (
    <div className="flex h-screen items-center justify-center bg-[#071f17]">
      <span className="text-sm text-emerald-300/50">Direcionando…</span>
    </div>
  );
}
