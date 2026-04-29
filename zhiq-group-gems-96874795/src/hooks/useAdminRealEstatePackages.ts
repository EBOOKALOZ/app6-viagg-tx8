import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RealEstatePackage } from "./useRealEstatePackages";

export function useAdminRealEstatePackages() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-real-estate-packages"],
    queryFn: async () => {
      console.log("[AdminRealEstatePackages] Fetching packages...");
      const { data, error } = await supabase
        .from("real_estate_credit_packages")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) {
        console.error("[AdminRealEstatePackages] Fetch error:", error);
        return [] as RealEstatePackage[];
      }
      
      console.log("[AdminRealEstatePackages] Data received:", data);
      
       return (data || []).map((p: any) => ({
         id: p.id,
         name: p.name || p.slug || "Plano sem nome",
         slug: p.slug || "",
         credits_amount: p.credits_amount || 0,
         price_brl: p.price_brl || 0,
         description: p.description || "",
         badge_text: p.badge_text || null,
         button_label: p.button_label || "Selecionar",
         package_type: p.package_type || "standard",
         bonus_credits: p.bonus_credits || 0,
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
       })) as RealEstatePackage[];
    },
  });

  const createPackage = useMutation({
    mutationFn: async (input: Partial<RealEstatePackage>) => {
      // Campos permitidos no banco para evitar erros de colunas extras ou nulas
       const payload: any = {
         name: input.name,
         slug: input.slug || input.name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") || "package-" + Date.now(),
         credits_amount: Number(input.credits_amount) || 0,
         price_brl: Number(input.price_brl) || 0,
         description: input.description || "",
         package_type: input.package_type || "standard",
         bonus_credits: Number(input.bonus_credits) || 0,
         category: input.category || 'real_estate',
         is_featured: !!input.is_featured,
         is_recommended: !!input.is_recommended,
         sort_order: Number(input.sort_order) || 0,
         badge_text: input.badge_text || null,
         button_label: input.button_label || "Selecionar",
         features_json: Array.isArray(input.features_json) ? input.features_json : [],
         is_active: input.is_active !== false,
       };
      
      console.log("[AdminRealEstatePackages] CREATE Payload:", payload);
      
      const { data, error } = await supabase
        .from("real_estate_credit_packages")
        .upsert(payload, { onConflict: "slug" })
        .select();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-real-estate-packages"] });
      qc.invalidateQueries({ queryKey: ["real-estate-packages"] });
      toast.success("Pacote criado com sucesso!");
    },
    onError: (err: any) => {
      console.error("[AdminRealEstatePackages] Mutation Error:", err);
      toast.error(`Falha ao criar: ${err.message || "Erro desconhecido"}`);
    },
  });

  const updatePackage = useMutation({
    mutationFn: async (input: Partial<RealEstatePackage> & { id: string }) => {
      const { id } = input;
      
       const payload: any = {
         name: input.name,
         credits_amount: Number(input.credits_amount) || 0,
         price_brl: Number(input.price_brl) || 0,
         description: input.description || "",
         package_type: input.package_type || "standard",
         bonus_credits: Number(input.bonus_credits) || 0,
         category: input.category || 'real_estate',
         is_featured: !!input.is_featured,
         is_recommended: !!input.is_recommended,
         sort_order: Number(input.sort_order) || 0,
         badge_text: input.badge_text || null,
         button_label: input.button_label || "Selecionar",
         features_json: Array.isArray(input.features_json) ? input.features_json : [],
         is_active: input.is_active !== false,
       };
      
      console.log("[AdminRealEstatePackages] UPDATE Payload for", id, ":", payload);
      
      const { data, error } = await supabase
        .from("real_estate_credit_packages")
        .update(payload)
        .eq("id", id)
        .select();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-real-estate-packages"] });
      qc.invalidateQueries({ queryKey: ["real-estate-packages"] });
      toast.success("Pacote atualizado!");
    },
    onError: (err: any) => {
      console.error("[AdminRealEstatePackages] Mutation Error:", err);
      toast.error(`Falha ao salvar: ${err.message || "Erro desconhecido"}`);
    },
  });

  const deletePackage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("real_estate_credit_packages")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-real-estate-packages"] });
      qc.invalidateQueries({ queryKey: ["real-estate-packages"] });
      toast.success("Pacote excluído!");
    },
    onError: (err: any) => toast.error(`Erro ao excluir: ${err.message}`),
  });

  const togglePackage = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("real_estate_credit_packages")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-real-estate-packages"] });
      qc.invalidateQueries({ queryKey: ["real-estate-packages"] });
    },
  });

  return {
    ...query,
    createPackage,
    updatePackage,
    deletePackage,
    togglePackage,
  };
}
