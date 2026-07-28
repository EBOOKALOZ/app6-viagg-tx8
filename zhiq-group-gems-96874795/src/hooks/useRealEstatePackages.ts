import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RealEstatePackage {
  id: string;
  name: string;
  slug: string;
  credits_amount: number;
  price_brl: number;
  description: string | null;
  badge_text: string | null;
  button_label: string;
  package_type: string;
  credits_bonus: number;
  is_featured: boolean;
  is_recommended: boolean;
  sort_order: number;
  highlight_color: string | null;
  logo_url?: string | null;
  features_json: string[];
  category: string;
  is_active: boolean;
}

export function useRealEstatePackages() {
  return useQuery({
    queryKey: ["real-estate-packages"],
    queryFn: async () => {
      console.log("[RealEstatePackages] Fetching active packages...");
      const { data, error } = await supabase
        .from("real_estate_credit_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("is_featured", { ascending: false })
        .order("credits_amount", { ascending: true });

      if (error) {
        console.error("[RealEstatePackages] Fetch error:", error);
        return [] as RealEstatePackage[];
      }
      
      console.log("[RealEstatePackages] Data received from DB:", data);

      return (data || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name || p.slug || "Plano sem nome",
        slug: p.slug || "",
        credits_amount: p.credits_amount || 0,
        price_brl: p.price_brl || 0,
        description: p.description || "",
        badge_text: p.badge_text || null,
        button_label: p.button_label || "Selecionar",
        package_type: p.package_type || "standard",
        credits_bonus: p.credits_bonus || 0,
        is_featured: !!p.is_featured,
        is_recommended: !!p.is_recommended,
        sort_order: p.sort_order || 0,
        highlight_color: p.highlight_color || null,
        category: p.category || 'real_estate',
        features_json: (() => {
          if (Array.isArray(p.features_json)) return p.features_json;
          if (typeof p.features_json === 'string') {
            try { return JSON.parse(p.features_json); } catch (e) { return []; }
          }
          return [];
        })(),
        is_active: p.is_active !== false,
        logo_url: p.logo_url || null,
      })) as RealEstatePackage[];
    },
    staleTime: 1000 * 5, // 5 seconds (fast response for admin updates)
    refetchOnWindowFocus: true,
  });
}
