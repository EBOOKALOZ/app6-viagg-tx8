import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function TrackingRedirectPage() {
  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    async function track() {
      if (token) {
        await (supabase.rpc as any)("register_lot_click", { p_token: token });
      }
      window.location.replace("/mercado");
    }
    track();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0D0F12]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-[#A7B0BE] text-sm font-medium">Carregando...</p>
      </div>
    </div>
  );
}
