/**
 * ai/cardCapture.ts
 * Captura cards de divulgação como imagem (OpenAI DALL-E 3) e enfileira ao Postador.
 *
 * Fluxo:
 *   promoted_listing_slots → DALL-E 3 gera imagem →
 *   Supabase Storage → postador_card_queue → 1 imagem por postagem
 */

import { supabase }   from "@/integrations/supabase/client";
import { AI_BASE_URL } from "./config";

/* ── Tipos ─────────────────────────────────────────────────────────────────── */

export type CardListingType =
  | "produto" | "imovel" | "veiculo" | "servico" | "frete" | "viagem";

export interface CardSlotData {
  slotId:         string;
  userId:         string;
  listingId:      string;
  listingType:    CardListingType;
  listingTitle:   string;
  listingPrice?:  number | null;
  listingImage?:  string | null;
  listingCity?:   string | null;
  storeName?:     string | null;
  storeWhatsapp?: string | null;
  storeSiteUrl?:  string | null;
}

export interface AICaptureResult {
  slotId:        string;
  listingId:     string;
  status:        "ready" | "error";
  imageUrl?:     string;
  imageBase64?:  string;
  capturedAt:    string;
  errorMessage?: string;
}

/** Alias legado */
export type GlmCaptureResult = AICaptureResult;

export interface PostadorQueueItem {
  id:           string;
  slotId:       string;
  postadorId:   string;
  imageUrl:     string;
  listingTitle: string;
  listingType:  CardListingType;
  status:       "pending" | "sent" | "failed";
  scheduledAt?: string;
  sentAt?:      string;
}

/* ── Configuração ───────────────────────────────────────────────────────────── */

const AI_API_URL = import.meta.env.VITE_GLM_API_URL ?? AI_BASE_URL;
const AI_API_KEY = import.meta.env.VITE_GLM_API_KEY ?? "";

const CARD_PROMPT = (card: CardSlotData) => `
Gere uma imagem promocional para divulgação no WhatsApp:
- Título: ${card.listingTitle}
- Preço: ${card.listingPrice ? `R$ ${card.listingPrice.toFixed(2)}` : "Consulte"}
- Loja: ${card.storeName ?? "Anunciante Viagg-TX8"}
- Cidade: ${card.listingCity ?? ""}
- Tipo: ${card.listingType}
Estilo: card moderno, fundo escuro, destaque laranja (#FF6A00), texto branco, 1080x1080px.
`.trim();

/* ── Geração de imagem ─────────────────────────────────────────────────────── */

async function generateCardImage(card: CardSlotData): Promise<string> {
  if (!AI_API_KEY) {
    console.warn("[AI] API key não configurada — usando imagem original do card");
    if (card.listingImage?.startsWith("http")) return card.listingImage;
    throw new Error("AI não configurada e card não tem imagem externa");
  }

  const response = await fetch(`${AI_API_URL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: CARD_PROMPT(card),
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });

  if (!response.ok) throw new Error(`AI Images API error: ${response.status} ${response.statusText}`);

  const json = await response.json();
  return json.data?.[0]?.b64_json ?? json.data?.[0]?.url ?? "";
}

/* ── Upload ─────────────────────────────────────────────────────────────────── */

async function uploadCardImageToStorage(base64OrUrl: string, slotId: string): Promise<string> {
  if (base64OrUrl.startsWith("http")) return base64OrUrl;

  const byteString = atob(base64OrUrl.replace(/^data:image\/\w+;base64,/, ""));
  const arr = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) arr[i] = byteString.charCodeAt(i);
  const blob = new Blob([arr], { type: "image/png" });

  const path = `card-captures/${slotId}.png`;
  const { error } = await supabase.storage
    .from("aaudio")
    .upload(path, blob, { upsert: true, contentType: "image/png" });

  if (error) throw new Error(`Upload falhou: ${error.message}`);

  const { data } = supabase.storage.from("aaudio").getPublicUrl(path);
  return data.publicUrl;
}

/* ── Fetch de slots ─────────────────────────────────────────────────────────── */

export async function fetchActiveCardSlots(limitPerUser = 5): Promise<CardSlotData[]> {
  const { data, error } = await supabase
    .from("promoted_listing_slots" as any)
    .select("id, user_id, listing_id, listing_type, listing_title, listing_price, listing_image, listing_city")
    .order("created_at", { ascending: true })
    .limit(limitPerUser * 50);

  if (error) throw new Error(`fetchActiveCardSlots: ${error.message}`);

  return (data ?? []).map((row: any): CardSlotData => ({
    slotId:       row.id,
    userId:       row.user_id,
    listingId:    row.listing_id,
    listingType:  row.listing_type as CardListingType,
    listingTitle: row.listing_title ?? "Sem título",
    listingPrice: row.listing_price,
    listingImage: row.listing_image,
    listingCity:  row.listing_city,
  }));
}

/* ── Captura individual ────────────────────────────────────────────────────── */

export async function captureCardAsImage(card: CardSlotData): Promise<AICaptureResult> {
  const capturedAt = new Date().toISOString();
  try {
    const imageData = await generateCardImage(card);
    const imageUrl  = await uploadCardImageToStorage(imageData, card.slotId);
    return { slotId: card.slotId, listingId: card.listingId, status: "ready", imageUrl, capturedAt };
  } catch (err: any) {
    console.error("[AI] captureCardAsImage falhou:", err);
    return { slotId: card.slotId, listingId: card.listingId, status: "error", capturedAt, errorMessage: err?.message ?? "Erro desconhecido" };
  }
}

/* ── Fila para o Postador ──────────────────────────────────────────────────── */

export async function captureAndQueueCards(
  postadorId: string,
  maxCards = 5,
): Promise<{ queued: number; errors: number }> {
  const slots  = await fetchActiveCardSlots(maxCards);
  const subset = slots.slice(0, maxCards);
  let queued = 0, errors = 0;

  for (const slot of subset) {
    const result = await captureCardAsImage(slot);
    if (result.status === "ready" && result.imageUrl) {
      const { error } = await supabase
        .from("postador_card_queue" as any)
        .upsert({
          slot_id:       slot.slotId,
          postador_id:   postadorId,
          image_url:     result.imageUrl,
          listing_title: slot.listingTitle,
          listing_type:  slot.listingType,
          status:        "pending",
          captured_at:   result.capturedAt,
        }, { onConflict: "slot_id,postador_id" });

      error ? errors++ : queued++;
    } else {
      errors++;
    }
  }

  return { queued, errors };
}
