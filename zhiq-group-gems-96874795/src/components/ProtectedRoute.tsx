import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileRoute } from "@/lib/profileTypes";
import { isProfileRegistrationComplete, getProfileSetupRoute } from "@/lib/profileValidation";
import { supabase } from "@/integrations/supabase/client";
import { useSupportRole } from "@/hooks/useSupportRole";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requiredProfile?: string;
}

export function ProtectedRoute({ children, requireAdmin = false, requiredProfile }: ProtectedRouteProps) {
  const { user, initialized, isAdmin, role, activeProfile, availableProfiles, isProfileComplete, isLoading } = useAuth();
  const { supportRole, isLoading: isSupportRoleLoading } = useSupportRole();

  const location = useLocation();
  const pathname = location.pathname;

  // LOG INICIAL
  console.log('[ProtectedRoute] RENDER START', {
    pathname,
    requireAdmin,
    isAdminRoute: pathname.startsWith("/admin") || pathname.startsWith("/administrador"),
    user: user?.id,
    role,
    isAdmin,
    initialized,
    isLoading,
    activeProfile,
    availableProfiles: availableProfiles.length
  });

  /* =============================
     STATE
  ============================= */
  const [profileCheckState, setProfileCheckState] = useState<{
    checked: boolean;
    complete: boolean;
    setupRoute: string | null;
  }>({
    checked: true,
    complete: true,
    setupRoute: null,
  });

  /** Motoboy/Mototaxi onboarding status from backend RPC */
  const [motoboyOnboardingChecked, setMotoboyOnboardingChecked] = useState(false);
  const [motoboyOnboardingComplete, setMotoboyOnboardingComplete] = useState(true);

  /* =============================
     ROTAS
  ============================= */
  const publicRoutes = [
    "/auth",
    "/loading",
    "/choose-profile",
    "/select-profile",
    "/support",
    "/profile",
    "/merchant/settings",
    "/motoboy/profile",
    "/mototaxi/profile",
    "/motoboy/completar",
    "/merchant/profile",
  ];

  const isPublicRoute = publicRoutes.includes(pathname);

  const isPanelRoute =
    pathname.startsWith("/merchant") || pathname.startsWith("/motoboy") || pathname.startsWith("/mototaxi");

  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/administrador");
  const isAdvertiserRoute = pathname.startsWith("/anunciante");

  const selfManagedProfiles = ["motoboy", "mototaxi", "merchant"];
  const isSelfManaged = !!activeProfile && selfManagedProfiles.includes(activeProfile);

  /* Motoboy/Mototaxi onboarding lock:
     While profile_completed = false, only allow /motoboy/profile, /mototaxi/profile, and wallet routes */
  const isMotoboyOnboardingRoute =
    pathname === "/motoboy/profile" ||
    pathname === "/mototaxi/profile" ||
    pathname === "/motoboy/wallet" ||
    pathname === "/mototaxi/wallet" ||
    pathname === "/motoboy/lgpd" ||
    pathname.startsWith("/suporte") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/motoboy/support") ||
    pathname.startsWith("/mototaxi/support");

  /* =============================
     CHECK ESPECÍFICO (non-self-managed)
  ============================= */
  useEffect(() => {
    if (!user?.id || !activeProfile || isPublicRoute || isSelfManaged) {
      setProfileCheckState({
        checked: true,
        complete: true,
        setupRoute: null,
      });
      return;
    }

    let cancelled = false;

    const runCheck = async () => {
      const { complete } = await isProfileRegistrationComplete(user.id, activeProfile);

      if (!cancelled) {
        setProfileCheckState({
          checked: true,
          complete,
          setupRoute: complete ? null : getProfileSetupRoute(activeProfile),
        });
      }
    };

    setProfileCheckState((prev) => ({ ...prev, checked: false }));
    runCheck();

    return () => {
      cancelled = true;
    };
  }, [user?.id, activeProfile, isPublicRoute, isSelfManaged]);

  /* =============================
     CHECK ONBOARDING MOTOBOY/MOTOTAXI (backend RPC)
  ============================= */
  useEffect(() => {
    const isMotoboyType = activeProfile === "motoboy" || activeProfile === "mototaxi";
    if (!user?.id || !isMotoboyType) {
      setMotoboyOnboardingChecked(true);
      setMotoboyOnboardingComplete(true);
      return;
    }

    let cancelled = false;
    setMotoboyOnboardingChecked(false);

    const check = async () => {
      try {
        const { data } = await supabase.rpc("check_profile_onboarding" as any, {
          p_profile_type: activeProfile,
        });
        if (!cancelled) {
          setMotoboyOnboardingComplete(data === true);
          setMotoboyOnboardingChecked(true);
        }
      } catch {
        if (!cancelled) {
          setMotoboyOnboardingComplete(false);
          setMotoboyOnboardingChecked(true);
        }
      }
    };

    check();
    return () => { cancelled = true; };
  }, [user?.id, activeProfile]);

  /* =============================
     LOADING GLOBAL
     (único gate necessário)
  ============================= */
  /* =============================
     AGUARDA INICIALIZAÇÃO
     Nunca redirecionar durante o bootstrap
  ============================= */
  /* =============================
     AGUARDA INICIALIZAÇÃO COMPLETA
     Nunca redirecionar durante o bootstrap
  ============================= */
  if (!initialized || isLoading || isSupportRoleLoading) {
    console.log('[ProtectedRoute] Waiting for init…', { initialized, isLoading, pathname, isSupportRoleLoading });
    return null;
  }

  /* =============================
     NÃO AUTENTICADO
  ============================= */
  if (!user) {
    console.log('[ProtectedRoute] No user → /auth', { pathname });
    return <Navigate to="/auth" replace />;
  }

  /* =============================
     ADMIN — bypass total
     Admin não é perfil, é papel sistêmico.
     Ignora perfil ativo, onboarding, identidade.
  ============================= */
  if (isAdminRoute || requireAdmin) {
    console.log('[ProtectedRoute] Admin route detected', { 
      pathname, 
      role, 
      isAdmin, 
      isAdminRoute, 
      requireAdmin, 
      user: user?.id, 
      initialized, 
      isLoading,
      isPublicRoute,
      activeProfile
    });
    
    if (role === null) {
      console.log('[ProtectedRoute] Role is null, waiting...');
      return <div className="flex min-h-screen items-center justify-center">Verificando permissões…</div>;
    }

    if (isAdmin) {
      console.log('[ProtectedRoute] ✅ Admin access granted - RENDERING CHILDREN');
      return <>{children}</>;
    }

    // Support Role Fallback
    if (supportRole) {
      const isSupportPath = pathname.startsWith("/admin/support") || pathname.startsWith("/admin/supervisor");
      if (isSupportPath) {
        console.log('[ProtectedRoute] ✅ Support Agent access granted for Support Module');
        return <>{children}</>;
      }
    }

    console.log('[ProtectedRoute] ❌ Not admin, redirecting to /');
    return <Navigate to="/" replace />;
  }

  /* =============================
     ROTAS PÚBLICAS (perfil opcional)
  ============================= */
  if (isPublicRoute) {
    return <>{children}</>;
  }

  /* =============================
     USUÁRIO AUTENTICADO SEM PERFIL ATIVO
     → NUNCA voltar ao /auth, ir para seleção
     → EXCEÇÃO: rotas admin (já tratadas acima, mas safety-net)
  ============================= */
  if ((!activeProfile || availableProfiles.length === 0) && !isAdminRoute && !requireAdmin && !isAdvertiserRoute) {
    return <Navigate to="/select-profile" replace />;
  }

  /* =============================
     PAINEL SEM PERFIL CORRETO
  ============================= */
  if (isPanelRoute && !activeProfile) {
    return <Navigate to="/select-profile" replace />;
  }

  /* =============================
     FAILSAFE MERCHANT
  ============================= */
  if (pathname === "/complete-profile" && activeProfile === "merchant") {
    return <Navigate to="/merchant" replace />;
  }

  /* =============================
     PERFIL BÁSICO INCOMPLETO
  ============================= */
  if (!isProfileComplete && !isSelfManaged) {
    return <Navigate to="/complete-profile" replace />;
  }

  /* =============================
     MOTOBOY/MOTOTAXI ONBOARDING LOCK
     Bloqueia navegação enquanto onboarding não concluído
  ============================= */
  if ((activeProfile === "motoboy" || activeProfile === "mototaxi") && !isMotoboyOnboardingRoute) {
    if (!motoboyOnboardingChecked) {
      return <div className="flex min-h-screen items-center justify-center">Verificando cadastro…</div>;
    }
    // TEMPORARY BYPASS: allow access even if onboarding is incomplete
    // if (!motoboyOnboardingComplete) {
    //   const onboardingRoute = activeProfile === "mototaxi" ? "/mototaxi/profile" : "/motoboy/profile";
    //   return <Navigate to={onboardingRoute} replace />;
    // }
  }

  /* =============================
     CHECK ESPECÍFICO
  ============================= */
  if (!isSelfManaged) {
    if (!profileCheckState.checked) {
      return <div className="flex min-h-screen items-center justify-center">Verificando cadastro…</div>;
    }

    if (!profileCheckState.complete && profileCheckState.setupRoute) {
      return <Navigate to={profileCheckState.setupRoute} replace />;
    }
  }

  /* =============================
     PERFIL INCORRETO
     → Redireciona para dashboard do perfil ativo (NUNCA para /auth)
  ============================= */
  if (requiredProfile && activeProfile !== requiredProfile) {
    return <Navigate to={getProfileRoute(activeProfile)} replace />;
  }

  return <>{children}</>;
}
