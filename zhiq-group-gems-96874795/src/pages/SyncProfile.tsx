import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * SyncProfile
 * Página técnica (headless).
 * NÃO renderiza loader.
 * Apenas garante sincronização e redireciona.
 */
export default function SyncProfile() {
  const navigate = useNavigate();
  const { user, activeProfile, refreshProfiles, isLoading } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (isLoading) return;

    ranRef.current = true;

    const run = async () => {
      try {
        if (user) {
          await refreshProfiles();
        }
      } finally {
        // Sempre sai para o fluxo oficial
        navigate("/loading", { replace: true });
      }
    };

    run();
  }, [isLoading, user, refreshProfiles, navigate]);

  // ⚠️ NUNCA renderiza UI
  return null;
}
