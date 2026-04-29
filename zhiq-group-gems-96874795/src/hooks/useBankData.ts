import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface BankData {
  id: string;
  user_id: string;
  pix_tipo_chave: string | null;
  pix_chave: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  nome_titular: string | null;
  cpf_titular: string | null;
  created_at: string;
  updated_at: string;
}

export const useBankData = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bankData, isLoading } = useQuery({
    queryKey: ["motoboy-bank-data", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("motoboy_bank_data")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching bank data:", error);
        throw error;
      }

      return data as BankData | null;
    },
    enabled: !!user?.id,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["motoboy-bank-data", user?.id] });
  };

  const hasPixData = !!(bankData?.pix_tipo_chave && bankData?.pix_chave);
  const hasBankAccountData = !!(bankData?.banco && bankData?.agencia && bankData?.conta);

  return {
    bankData,
    isLoading,
    refetch,
    hasPixData,
    hasBankAccountData,
  };
};
