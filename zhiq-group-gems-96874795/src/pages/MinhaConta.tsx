import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { PersonalProfileCard } from "@/components/profile/PersonalProfileCard";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROFILE_QUERY_KEY = ["minha-conta-profile"];

export default function MinhaConta() {
  const { user, isMerchant } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: [...PROFILE_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("profiles") as any)
        .select("name, full_name, avatar_url, cidade, estado, telefone, whatsapp")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div>
          <h1 className="text-2xl font-black text-zinc-900">Minha Conta</h1>
          <p className="text-sm text-zinc-500 mt-1">Seus dados pessoais — nome, telefone e localização.</p>
        </div>

        <PersonalProfileCard
          profile={profile}
          queryKey={[...PROFILE_QUERY_KEY, user?.id ?? ""]}
          onSignOut={() => navigate("/")}
        />

        {isMerchant && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-700">
              <ShieldCheck className="w-4 h-4 text-orange-500" />
              Configurações de Anunciante
            </div>
            <p className="text-xs text-zinc-500">
              Para editar dados da loja, categoria, endereço comercial e meios de pagamento, acesse as configurações de anunciante.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/profile")}
              className="rounded-xl text-xs font-bold"
            >
              Abrir configurações do anunciante
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
