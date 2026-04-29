import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Break-glass admin access.
 * Zero bootstrap, zero profile logic, zero onboarding.
 * Validates ONLY: logged in + is_admin flag.
 */
export default function AdminEmergency() {
  const [state, setState] = useState<"loading" | "granted" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setState("denied"); return; }

        // Check admin via both tables
        const [rolesRes, profileRes] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
        ]);

        const isAdmin =
          rolesRes.data?.some((r) => r.role === "admin") ||
          !!profileRes.data?.is_admin;

        console.log("[AdminEmergency]", {
          userId: user.id,
          rolesData: rolesRes.data,
          rolesError: rolesRes.error?.message,
          profileIsAdmin: profileRes.data?.is_admin,
          profileError: profileRes.error?.message,
          isAdmin,
        });

        if (!cancelled) setState(isAdmin ? "granted" : "denied");
      } catch (err) {
        console.error("[AdminEmergency] error:", err);
        if (!cancelled) setState("denied");
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        Verificando acesso admin…
      </div>
    );
  }

  if (state === "denied") {
    return <Navigate to="/auth" replace />;
  }

  // Lazy import AdminDashboard to avoid circular deps
  return <GrantedView />;
}

function GrantedView() {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    import("@/pages/admin/AdminDashboard").then((m) => setComp(() => m.default));
  }, []);

  if (!Comp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        Carregando painel…
      </div>
    );
  }

  return <Comp />;
}
