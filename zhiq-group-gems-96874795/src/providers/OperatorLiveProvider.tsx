import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function OperatorLiveProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const channel = supabase
      .channel("operator-live")

      // 🔥 Biblioteca
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_media_library" }, (payload) => {
        console.log("Realtime marketing_media_library:", payload);
        window.dispatchEvent(new Event("operator-live-update"));
      })

      // 🔥 Uso de mídia
      .on("postgres_changes", { event: "*", schema: "public", table: "media_usage_log" }, (payload) => {
        console.log("Realtime media_usage_log:", payload);
        window.dispatchEvent(new Event("operator-live-update"));
      })

      // 🔥 Grupos
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_groups" }, (payload) => {
        console.log("Realtime whatsapp_groups:", payload);
        window.dispatchEvent(new Event("operator-live-update"));
      })

      .subscribe((status) => {
        console.log("Operator Live Status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return <>{children}</>;
}
