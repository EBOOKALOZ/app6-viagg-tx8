import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MerchantPanelHeader } from "@/components/merchant/MerchantPanelHeader";
import { StoreBottomNav } from "@/components/store/StoreBottomNav";
import { MerchantWeatherCard } from "@/components/merchant/MerchantWeatherCard";
import { FooterProfile } from "@/components/FooterProfile";
import { FloatingMessageButton } from "@/components/advertiser/FloatingMessageButton";

export function MerchantLayout() {
  const { user, isLoading, refreshProfiles } = useAuth();
  const location = useLocation();
  const [storeName, setStoreName] = useState("Minha Loja");
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | undefined>();
  const [storeCategory, setStoreCategory] = useState("");
  const [fullAddress, setFullAddress] = useState("");

  useEffect(() => {
    const initMerchant = async () => {
      if (!user?.id) return;

      // Re-sync auth context on route change
      refreshProfiles();

      try {
        await supabase.rpc("ensure_merchant_profile", { p_user_id: user.id });

        const { data: storeData } = await (supabase.from("merchant_stores") as any)
          .select("nome_loja, street, number, neighborhood, logo_url, categoria_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (storeData) {
          setStoreName(storeData.nome_loja || "Minha Loja");
          setStoreLogoUrl(storeData.logo_url || undefined);

          // Resolve categoria nome
          if (storeData.categoria_id) {
            try {
              const { data: cat } = await (supabase.from("categorias_loja") as any)
                .select("nome")
                .eq("id", storeData.categoria_id)
                .maybeSingle();
              setStoreCategory(cat?.nome || "");
            } catch { setStoreCategory(""); }
          } else {
            setStoreCategory("");
          }

          const addressParts = [];
          if (storeData.street) {
            addressParts.push(storeData.number ? `${storeData.street}, ${storeData.number}` : storeData.street);
          }
          if (storeData.neighborhood) {
            addressParts.push(storeData.neighborhood);
          }
          setFullAddress(addressParts.join(" • "));
        }
      } catch (error) {
        console.error("Error initializing merchant:", error);
      }
    };

    initMerchant();

    // Listener para o evento customizado
    const handleProfileUpdate = () => {
      initMerchant();
    };

    window.addEventListener('merchantProfileUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('merchantProfileUpdated', handleProfileUpdate);
    };
  }, [user?.id, location.pathname]);

  // ⛔ BLOQUEIO TOTAL ATÉ BOOT COMPLETO
  if (isLoading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-merchant-light flex flex-col">
      <MerchantPanelHeader
        storeLogoUrl={storeLogoUrl}
        storeName={storeName}
        storeCategory={storeCategory}
        fullAddress={fullAddress}
      />

      <div className="px-4 pt-3 lg:px-4 xl:px-6 w-full">
        <MerchantWeatherCard />
      </div>

      <main className="flex-1 flex flex-col pb-24 w-full">
        <Outlet />
      </main>

      <FooterProfile profile="merchant" />
      <StoreBottomNav />
      <FloatingMessageButton />
    </div>
  );
}