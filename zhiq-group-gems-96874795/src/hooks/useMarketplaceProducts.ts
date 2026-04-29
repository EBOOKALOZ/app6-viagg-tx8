import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useMarketplaceProducts = (userId?: string) => {
  const queryClient = useQueryClient();

  const { data: myProducts, isLoading: loadingMyProducts } = useQuery({
    queryKey: ["product-listings", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("merchant_products")
        .select("id, nome as title, descricao as description, preco as price, imagem_url as cover_image_url, user_id as owner_user_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const createProduct = useMutation({
    mutationFn: async (payload: any) => {
      // Create product in the new merchant context
      const { data, error } = await supabase
        .from("merchant_products")
        .insert({
          user_id: payload.owner_user_id,
          nome: payload.title,
          descricao: payload.description,
          preco: payload.price,
          imagem_url: payload.cover_image_url
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-listings"] });
      toast.success("Anúncio criado com sucesso! Enviado para revisão.");
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar anúncio: ${error.message}`);
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, ...payload }: any) => {
      // Update product in the new merchant context
      const { data, error } = await supabase
        .from("merchant_products")
        .update({
          nome: payload.title,
          descricao: payload.description,
          preco: payload.price,
          imagem_url: payload.cover_image_url
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
      toast.success("Anúncio atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("marketplace_products")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
      toast.success("Anúncio removido.");
    },
  });

  return {
    myProducts,
    loadingMyProducts,
    createProduct,
    updateProduct,
    deleteProduct,
  };
};
