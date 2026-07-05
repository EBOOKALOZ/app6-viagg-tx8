/**
 * CampaignSharePage — página pública de compartilhamento de campanha
 * Rota: /divulgar/:campaignId
 * Finalidade: link estável que o motoboy envia no WhatsApp.
 * Visitantes veem os dados da campanha e são convidados a ver a loja.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Megaphone, MapPin, Store, ArrowRight, Loader2, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignData = {
  id: string;
  title: string | null;
  message_text: string | null;
  media_url: string | null;
  campaign_type: string | null;
  target_city: string | null;
  target_region: string | null;
  merchant_store_id: string | null;
  store_name: string | null;
  store_id: string | null;
};

// ─── Meta tag helper ──────────────────────────────────────────────────────────

function setMeta(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CampaignSharePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!campaignId) { setNotFound(true); setLoading(false); return; }

    (async () => {
      // 1. Buscar campanha
      const { data: cq, error } = await supabase
        .from("campaign_queue")
        .select("id, title, message_text, media_url, campaign_type, target_city, target_region, merchant_store_id")
        .eq("id", campaignId)
        .maybeSingle();

      if (error || !cq) { setNotFound(true); setLoading(false); return; }

      // 2. Buscar nome da loja (se houver merchant_store_id)
      let storeName: string | null = null;
      let storeId: string | null = null;
      if (cq.merchant_store_id) {
        const { data: storeRow } = await supabase
          .from("merchant_stores")
          .select("id, store_name")
          .eq("id", cq.merchant_store_id)
          .maybeSingle();
        storeName = storeRow?.store_name ?? null;
        storeId = storeRow?.id ?? null;
      }

      const result: CampaignData = {
        ...cq,
        store_name: storeName,
        store_id: storeId,
      };

      setCampaign(result);
      setLoading(false);

      // 3. Atualizar OG meta tags (melhor esforço para crawlers)
      const ogTitle = result.title ?? "Promoção Viagg";
      const ogDesc = result.message_text?.slice(0, 200) ?? "Veja essa oferta incrível!";
      const ogImage = result.media_url ?? "";

      document.title = `${ogTitle} — Viagg`;
      setMeta("og:title", ogTitle);
      setMeta("og:description", ogDesc);
      if (ogImage) setMeta("og:image", ogImage);
      setMeta("og:url", window.location.href);
      setMeta("og:type", "website");
    })();
  }, [campaignId]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5E62B]">
        <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────

  if (notFound || !campaign) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F5E62B] p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <h1 className="text-xl font-black text-foreground/80">Campanha não encontrada</h1>
        <p className="text-sm text-muted-foreground">Este link pode ter expirado ou sido removido.</p>
        <Button onClick={() => navigate("/mercado")} className="mt-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl">
          Ver Mercado Local
        </Button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5E62B]">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-orange-100 px-4 py-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center">
          <Megaphone className="h-4 w-4 text-white" />
        </div>
        <span className="font-black text-sm text-foreground/80 tracking-tight">Viagg · Promoção</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-10">
        {/* Store badge */}
        {campaign.store_name && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
              <Store className="h-3 w-3 text-orange-500" />
            </div>
            <span className="text-xs font-bold text-orange-600">{campaign.store_name}</span>
          </div>
        )}

        {/* Title */}
        <h1 className="text-2xl font-black text-foreground/90 leading-tight">
          {campaign.title ?? "Promoção Especial"}
        </h1>

        {/* Location */}
        {(campaign.target_city || campaign.target_region) && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-orange-400" />
            <span>{[campaign.target_city, campaign.target_region].filter(Boolean).join(" · ")}</span>
          </div>
        )}

        {/* Media */}
        {campaign.media_url && (
          <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: "1px solid rgba(255,200,190,0.30)" }}>
            <img
              src={campaign.media_url}
              alt={campaign.title ?? "Mídia da campanha"}
              className="w-full object-cover"
              style={{ maxHeight: 340 }}
            />
          </div>
        )}

        {/* Message */}
        {campaign.message_text && (
          <div
            className="p-4 rounded-2xl text-sm leading-relaxed text-foreground/75 whitespace-pre-wrap"
            style={{
              background: "rgba(255,245,243,0.8)",
              border: "1px solid rgba(255,200,190,0.30)",
            }}
          >
            {campaign.message_text}
          </div>
        )}

        {/* CTA: ir para a loja */}
        {campaign.store_id ? (
          <Button
            className="w-full h-12 text-sm font-black rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white gap-2"
            onClick={() => navigate(`/loja/${campaign.store_id}`)}
          >
            <Store className="h-4 w-4" />
            Ver Loja Completa
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            className="w-full h-12 text-sm font-black rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white gap-2"
            onClick={() => navigate("/mercado")}
          >
            Ver Mercado Local
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground/50 pt-2">
          Distribuído pela rede Viagg · Central de Impulsionamento
        </p>
      </div>
    </div>
  );
}
