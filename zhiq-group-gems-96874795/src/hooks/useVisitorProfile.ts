/**
 * useVisitorProfile — Persistent lightweight visitor registration
 *
 * Reusable across CESTA1, perguntas, leilão, arremate.
 * Auto-fills from localStorage, persists to Supabase visitor_profiles.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "vtx8_visitor_profile";

export interface VisitorProfile {
  id?: string;
  full_name: string;
  whatsapp: string;
  email: string;
  bairro: string;
  city: string;
  accepted_terms: boolean;
  accepted_privacy: boolean;
  accepted_direct_payment: boolean;
  accepted_store_contact: boolean;
}

const EMPTY_PROFILE: VisitorProfile = {
  full_name: "",
  whatsapp: "",
  email: "",
  bairro: "",
  city: "",
  accepted_terms: false,
  accepted_privacy: false,
  accepted_direct_payment: false,
  accepted_store_contact: false,
};

function getSessionToken(): string {
  const KEY = "vtx8_cart_session";
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(KEY, token);
  }
  return token;
}

export function useVisitorProfile() {
  const [profile, setProfile] = useState<VisitorProfile>(EMPTY_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setProfile({ ...EMPTY_PROFILE, ...parsed });
      }
    } catch { /* ignore */ }
    setIsLoaded(true);
  }, []);

  const hasProfile = !!(profile.full_name && profile.whatsapp && profile.accepted_terms &&
    profile.accepted_privacy && profile.accepted_direct_payment && profile.accepted_store_contact);

  const isValid = hasProfile;

  const save = useCallback(async (data: VisitorProfile): Promise<VisitorProfile> => {
    setIsSaving(true);
    try {
      const sessionToken = getSessionToken();
      const userId = (await supabase.auth.getUser()).data?.user?.id || null;

      const payload = {
        session_token: sessionToken,
        user_id: userId,
        full_name: data.full_name.trim(),
        whatsapp: data.whatsapp.replace(/\D/g, ""),
        email: data.email?.trim() || null,
        bairro: data.bairro?.trim() || null,
        city: data.city?.trim() || null,
        accepted_terms: data.accepted_terms,
        accepted_privacy: data.accepted_privacy,
        accepted_direct_payment: data.accepted_direct_payment,
        accepted_store_contact: data.accepted_store_contact,
        updated_at: new Date().toISOString(),
      };

      let savedId = data.id;

      try {
        if (data.id) {
          await (supabase.from("visitor_profiles") as any)
            .update(payload).eq("id", data.id);
        } else {
          const { data: inserted } = await (supabase.from("visitor_profiles") as any)
            .insert(payload).select("id").single();
          if (inserted) savedId = inserted.id;
        }
      } catch (dbError) {
        console.warn("[useVisitorProfile] DB operation failed (non-critical):", dbError);
        // DB insert/update failed (e.g., table/column missing). Continue with localStorage only.
      }

      const savedProfile = { ...data, id: savedId };
      setProfile(savedProfile);

      // Persist to localStorage always
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProfile));

      return savedProfile;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const update = useCallback((key: keyof VisitorProfile, value: any) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    profile,
    setProfile,
    update,
    isLoaded,
    isSaving,
    hasProfile,
    isValid,
    save,
  };
}
