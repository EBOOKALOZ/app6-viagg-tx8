import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function LoadingScreenPremium() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<string | null>(null);

  const isMotoboy = profile === "motoboy" || profile === "mototaxi";
  const bgColor = isMotoboy ? "#ea580c" : "#0a1810";
  const spinnerColor = isMotoboy ? "#fff" : "#22c55e";

  useEffect(() => {
    // Try to read active profile from localStorage for theming
    try {
      const stored = localStorage.getItem("active_profile");
      if (stored) setProfile(stored);
    } catch {}
  }, []);

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }

      // 👑 Admin check — bypass completo (user_roles + profiles.is_admin)
      const [rolesResult, profileResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("profile_complete, is_admin").eq("id", user.id).single(),
      ]);

      const hasAdminRole = rolesResult.data?.some((r) => r.role === "admin");
      const hasAdminFlag = !!profileResult.data?.is_admin;

      if (hasAdminRole || hasAdminFlag) {
        navigate("/admin", { replace: true });
        return;
      }

      const profileData = profileResult.data;
      const error = profileResult.error;

      if (error || !profileData || profileData.profile_complete !== true) {
        navigate("/complete-profile", { replace: true });
        return;
      }

      navigate("/select-profile", { replace: true });
    };

    run();
  }, [navigate]);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: bgColor,
        transition: "background 0.3s ease",
      }}
    >
      <svg
        className="h-16 w-16 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 3a9 9 0 1 1-6.36 2.64"
          stroke={spinnerColor}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M5 3v4h4"
          stroke={spinnerColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
