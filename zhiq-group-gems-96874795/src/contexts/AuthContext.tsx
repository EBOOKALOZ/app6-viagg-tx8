import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

/* ================================
   Module-level singleton guard for wallet creation.
   Survives React StrictMode, AuthProvider remounts, and re-renders.
   Keyed by user ID so it resets correctly on logout/login with different user.
================================ */
let _walletEnsuredForUserId: string | null = null;
let _walletEnsurePromise: Promise<void> | null = null;
let _redirectedAfterLogin = false;

/** Rotas isentas do redirect global para /loading */
const BOOTSTRAP_EXEMPT_ROUTES = ["/admin", "/administrador", "/admin-emergencia"];

function isBootstrapExemptRoute(): boolean {
  const path = window.location.pathname;
  return BOOTSTRAP_EXEMPT_ROUTES.some((r) => path.startsWith(r));
}

/* ================================
   Types
================================ */

type AppRole = "admin" | "user";

/** Whitelist de teste — fallback de segurança para admins conhecidos */
const ADMIN_TEST_EMAILS = [
  "angelo_zanatta@hotmail.com",
  "angelozanatta100@gmail.com",
];

interface AuthContextType {
  initialized: boolean;
  user: User | null;
  session: Session | null;
  isLoading: boolean;

  profileReady: boolean;
  availableProfiles: string[];
  activeProfile: string | null;
  displayName: string | null;
  telefone: string | null;
  avatarUrl: string | null;
  isProfileComplete: boolean;
  termsAccepted: boolean;
  providerRole: string | null;

  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithFacebook: () => Promise<{ error: Error | null }>;
  signInWithTwitter: () => Promise<{ error: Error | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;

  clearActiveProfile: () => Promise<void>;
  setAvailableProfiles: (profiles: string[]) => Promise<void>;
  setActiveProfile: (profile: string, newAvailableProfiles?: string[]) => Promise<void>;
  enableProfile: (profileId: string) => Promise<void>;
  refreshProfiles: () => Promise<void>;

  role: AppRole | null;
  isAdmin: boolean;
}

/* ================================
   Context
================================ */

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ================================
   Provider
================================ */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const mountedRef = useRef(true);
  const firstInitDoneRef = useRef(false);
  // redirectedAfterLogin is now module-level (_redirectedAfterLogin)

  const [initialized, setInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  const [profileReady, setProfileReady] = useState(false);
  const [availableProfiles, setAvailableProfilesState] = useState<string[]>([]);
  const [activeProfile, setActiveProfileState] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [telefone, setTelefone] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [providerRole, setProviderRole] = useState<string | null>(null);

  const resetState = () => {
    setUser(null);
    setSession(null);
    setRole(null);
    setAvailableProfilesState([]);
    setActiveProfileState(null);
    setDisplayName(null);
    setTelefone(null);
    setAvatarUrl(null);
    setIsProfileComplete(false);
    setTermsAccepted(false);
    setProviderRole(null);
    setProfileReady(false);
    _walletEnsuredForUserId = null;
    _walletEnsurePromise = null;
    localStorage.removeItem("viagg_auth_entry");
  };

  const fetchUserRole = async (userId: string, email?: string | null) => {
    // Whitelist fallback — resolve imediatamente
    if (email && ADMIN_TEST_EMAILS.includes(email.toLowerCase())) {
      console.log('[AuthContext] Admin whitelist match:', email);
      setRole("admin");
      return;
    }

    // Timeout wrapper para evitar pending indefinitely
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('fetchUserRole timeout after 5s')), 5000)
    );

    try {
      const result = await Promise.race([
        (async () => {
          let hasAdminRole = false;
          let hasAdminFlag = false;

          // 1. Check user_roles table (fails gracefully if table doesn't exist)
          try {
            const { data: rolesData, error: rolesError } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", userId);

            if (!rolesError && rolesData && Array.isArray(rolesData)) {
              hasAdminRole = rolesData.some((r: any) => r.role === "admin");
            }
          } catch (rolesEx) {
            console.warn('[AuthContext] Could not fetch user_roles:', rolesEx);
          }

          // 2. Check profiles table for is_admin flag
          try {
            const { data: profileData, error: profileError } = await supabase
              .from("profiles")
              .select("is_admin")
              .eq("id", userId)
              .maybeSingle();

            if (!profileError && profileData) {
              hasAdminFlag = !!profileData.is_admin;
            }
          } catch (profileEx) {
            console.warn('[AuthContext] Could not fetch is_admin from profiles:', profileEx);
          }

          return hasAdminRole || hasAdminFlag ? "admin" : "user";
        })(),
        timeoutPromise
      ]);

      console.log('[AuthContext] fetchUserRole resolved:', { userId, result });
      setRole(result);
    } catch (err) {
      console.error('[AuthContext] fetchUserRole failed:', err.message);
      // Fallback para user em caso de erro/timeout
      setRole("user");
    }
  };

  const fetchUserProfiles = async (userId: string) => {
    setProfileReady(false);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          `
          available_profiles,
          active_profile,
          name,
          telefone,
          avatar_url
        `,
        )
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error('[AuthContext] Error fetching profiles:', error);
      }

      if (data) {
        setAvailableProfilesState(data.available_profiles ?? []);
        setActiveProfileState(data.active_profile ?? null);
        setDisplayName(data.name ?? null);
        setTelefone(data.telefone ?? null);
        setAvatarUrl(data.avatar_url ?? null);
        // Fallback states since the columns were removed from DB
        setIsProfileComplete(true);
        setTermsAccepted(true);
        setProviderRole(null);
      }
    } finally {
      setProfileReady(true);
    }
  };

  const ensureBase = async (userId: string) => {
    // Module-level dedup: skip if already ensured for this user
    if (_walletEnsuredForUserId === userId) return;
    // If another call is in-flight for this user, await it instead of duplicating
    if (_walletEnsurePromise && _walletEnsuredForUserId === null) {
      await _walletEnsurePromise;
      return;
    }
    _walletEnsurePromise = (async () => {
      try {
        await supabase.rpc("ensure_base_profile_and_wallet");
        _walletEnsuredForUserId = userId;
      } catch {
        // Allow retry on failure
        _walletEnsurePromise = null;
      }
    })();
    await _walletEnsurePromise;
  };

  const hydrateForUser = async (u: User) => {
    void ensureBase(u.id);
    void fetchUserRole(u.id, u.email);
    void fetchUserProfiles(u.id);
  };

  const refreshProfiles = async () => {
    if (!user?.id) return;
    await fetchUserProfiles(user.id);
  };

  /* ================================
     BOOTSTRAP + REDIRECT CONTROLADO
  ================================ */
  useEffect(() => {
    mountedRef.current = true;

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mountedRef.current) return;

      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await hydrateForUser(newSession.user);

        if (!isBootstrapExemptRoute() && window.location.pathname === "/auth") {
          navigate("/select-profile", { replace: true });
        }
        _redirectedAfterLogin = true;
      } else if (event === "SIGNED_OUT") {
        resetState();
      }

      if (!firstInitDoneRef.current && event === "INITIAL_SESSION") {
        firstInitDoneRef.current = true;
        setIsLoading(false);
        setInitialized(true);
      }
    });

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mountedRef.current) return;

        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);

        if (data.session?.user) {
          await hydrateForUser(data.session.user);

          if (!isBootstrapExemptRoute() && window.location.pathname === "/auth") {
            navigate("/select-profile", { replace: true });
          }
          _redirectedAfterLogin = true;
        }

        if (!firstInitDoneRef.current) {
          firstInitDoneRef.current = true;
          setIsLoading(false);
          setInitialized(true);
        }
      } catch {
        if (!firstInitDoneRef.current) {
          firstInitDoneRef.current = true;
          setIsLoading(false);
          setInitialized(true);
        }
      }
    })();

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  /* ================================
     AUTH ACTIONS
  ================================ */

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { 
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account',
        }
      },
    });
    return { error: error as Error | null };
  };

  const signInWithFacebook = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error as Error | null };
  };

  const signInWithTwitter = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "x",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error as Error | null };
  };

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error as Error | null };
  };
  
  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { 
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          name: email.split('@')[0], // Fallback name from email
        }
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[signOut] supabase.auth.signOut() falhou — limpando local mesmo assim:', err);
    }
    // Limpeza defensiva: se signOut falha (offline / token expirado), tokens persistem no
    // localStorage e o onAuthStateChange volta a hidratar o usuário no próximo render.
    try {
      if (typeof localStorage !== 'undefined') {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('sb-') || k.includes('supabase'))) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (err) {
      console.warn('[signOut] limpeza de localStorage falhou:', err);
    }
    resetState();
  };

  /* ================================
     PROFILE ACTIONS
  ================================ */

  const clearActiveProfile = async () => {
    if (!user?.id) return;
    await supabase.from("profiles").update({ active_profile: null }).eq("id", user.id);
    setActiveProfileState(null);
  };

  const setAvailableProfiles = async (profiles: string[]) => {
    if (!user?.id) return;
    await (supabase.from("profiles") as any).update({ available_profiles: profiles }).eq("id", user.id);
    setAvailableProfilesState(profiles);
  };

  const setActiveProfile = async (profile: string, newAvailableProfiles?: string[]) => {
    if (!user?.id) return;

    const base = newAvailableProfiles ?? availableProfiles;
    const updated = base.includes(profile) ? base : [...base, profile];

    await (supabase.from("profiles") as any).update({ available_profiles: updated, active_profile: profile }).eq("id", user.id);

    setAvailableProfilesState(updated);
    setActiveProfileState(profile);
  };

  const enableProfile = async (profileId: string) => {
    if (!user?.id || availableProfiles.includes(profileId)) return;
    const updated = [...availableProfiles, profileId];
    await (supabase.from("profiles") as any).update({ available_profiles: updated }).eq("id", user.id);
    setAvailableProfilesState(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        initialized,
        user,
        session,
        isLoading,
        profileReady,
        availableProfiles,
        activeProfile,
        displayName,
        telefone,
        avatarUrl,
        isProfileComplete,
        termsAccepted,
        providerRole,
        signInWithGoogle,
        signInWithFacebook,
        signInWithTwitter,
        signInWithMagicLink,
        signInWithPassword,
        signUp,
        signOut,
        clearActiveProfile,
        setAvailableProfiles,
        setActiveProfile,
        enableProfile,
        refreshProfiles,
        role,
        isAdmin: role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ================================
   Hook
================================ */

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used dentro de AuthProvider");
  return ctx;
}
