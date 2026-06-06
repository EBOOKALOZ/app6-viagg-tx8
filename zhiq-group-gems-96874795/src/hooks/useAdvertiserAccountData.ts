import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AdvertiserAccountData {
  id: string;
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  account_status: string;
  status: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at?: string | null;
  package_id: string | null;
  settings_json: {
    receive_email_notifications: boolean;
    receive_listing_alerts: boolean;
    receive_credit_warnings: boolean;
    receive_commercial_messages: boolean;
  };
  // Profile joined data
  profile: {
    name: string | null;
    avatar_url: string | null;
    cpf_cnpj: string | null;
    phone: string | null;
    email_confirmed: boolean;
  };
  // Plan joined data
  plan: {
    name: string;
    price: number;
    credits: number;
    benefits: string[];
    is_premium: boolean;
  } | null;
  // Stats
  stats: {
    total_listings: number;
    active_listings: number;
    paused_listings: number;
    expired_listings: number;
    available_credits: number;
    contacts_unlocked: boolean;
  };
}

export function useAdvertiserAccountData() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["advertiser-account-comprehensive", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;

      // 1. Fetch Advertiser Account
      // A linha de advertiser_accounts tem PK própria (id) + user_id; o
      // vínculo correto com o usuário logado é user_id (id pode divergir).
      let { data: account, error: accountError } = await supabase
        .from("advertiser_accounts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      // If account doesn't exist, try to ensure it
      if (!account && !accountError) {
        console.log("Account not found, attempting to ensure...");
        const { data: ensureData } = await supabase.rpc('ensure_advertiser_account', {
          p_full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
          p_whatsapp: user.user_metadata?.phone || null
        });
        
        // Fetch again after ensuring
        const { data: retryAccount } = await supabase
          .from("advertiser_accounts")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        
        account = retryAccount;
      }

      // If still no account, provide a safe fallback so the UI doesn't crash
      const safeAccount = account || {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || "Anunciante",
        email: user.email,
        whatsapp: null,
        account_status: 'active',
        status: 'active',
        onboarding_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        package_id: null,
        settings_json: null
      };

      // 2. Fetch Profile to get avatar_url and other core identity details
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, cpf_cnpj')
        .eq('id', user.id)
        .maybeSingle();

      // 3. Fetch Plan Details if any
      let planDetails = null;
      if (safeAccount.package_id) {
        const { data: pkg } = await supabase
          .from("real_estate_credit_packages")
          .select("*")
          .eq("id", safeAccount.package_id)
          .maybeSingle();
        
        if (pkg) {
          planDetails = {
            name: pkg.name,
            price: pkg.price_brl || 0,
            credits: pkg.credits_amount || 0,
            benefits: pkg.features_json || [],
            is_premium: (pkg.price_brl || 0) > 0
          };
        }
      }

      // 4. Fetch Stats (Listings & Credits) — soma TODAS as tabelas de anúncio
      const [reList, vList, advList, balData] = await Promise.all([
        supabase.from("real_estate_listings").select("visibility_status").eq("owner_user_id", user.id),
        (supabase.from("vehicle_listings" as any).select("visibility_status").eq("owner_user_id", user.id)) as any,
        safeAccount.id
          ? (supabase.from("advertiser_listings" as any).select("listing_status").eq("advertiser_account_id", safeAccount.id)) as any
          : { data: [] as any[] },
        safeAccount.id
          ? (supabase.from("advertiser_credit_balances" as any).select("available_credits, consumed_credits").eq("advertiser_account_id", safeAccount.id).maybeSingle()) as any
          : { data: null },
      ]);

      const allListings: { status: string }[] = [];
      for (const r of (reList?.data ?? []) as any[]) allListings.push({ status: String(r?.visibility_status ?? '').toLowerCase() });
      for (const v of (vList?.data ?? []) as any[]) allListings.push({ status: String(v?.visibility_status ?? '').toLowerCase() });
      for (const a of (advList?.data ?? []) as any[]) allListings.push({ status: String(a?.listing_status ?? '').toLowerCase() });

      const isActive = (s: string) => s === 'published' || s === 'active';
      const isPaused = (s: string) => s === 'paused' || s === 'draft';
      const isExpired = (s: string) => s === 'expired';

      const stats = {
        total_listings: allListings.length,
        active_listings: allListings.filter(l => isActive(l.status)).length,
        paused_listings: allListings.filter(l => isPaused(l.status)).length,
        expired_listings: allListings.filter(l => isExpired(l.status)).length,
        available_credits: (balData?.data as any)?.available_credits ?? 0,
        contacts_unlocked: !!planDetails?.is_premium || ((balData?.data as any)?.available_credits ?? 0) > 0,
      };

      const defaultSettings = {
        receive_email_notifications: true,
        receive_listing_alerts: true,
        receive_credit_warnings: true,
        receive_commercial_messages: false
      };

      return {
        ...safeAccount,
        settings_json: safeAccount.settings_json || defaultSettings,
        profile: {
          name: safeAccount.full_name,
          avatar_url: profile?.avatar_url || null,
          cpf_cnpj: profile?.cpf_cnpj || null,
          phone: safeAccount.whatsapp,
          email_confirmed: !!user.email_confirmed_at
        },
        plan: planDetails,
        stats
      } as AdvertiserAccountData;
    },
    staleTime: 0,
    refetchInterval: 15_000,           // revalida a cada 15s
    refetchOnWindowFocus: true,        // revalida ao voltar pra aba
    refetchOnMount: "always",
  });
}
