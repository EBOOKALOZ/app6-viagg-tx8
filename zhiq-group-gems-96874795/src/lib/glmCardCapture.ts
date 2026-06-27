/**
 * glmCardCapture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Camada de integração com a IA GLM para captura e distribuição de Cards de
 * Divulgação ao Postador.
 *
 * Fluxo:
 *   promoted_listing_slots → GLM captura cada card como imagem →
 *   upload Supabase Storage → queue para Postador → 1 imagem por postagem
 *
 * Como conectar o GLM:
 *   1. Implemente `glmGenerateCardImage()` com a chamada real à API do GLM
 *   2. Configure VITE_GLM_API_KEY e VITE_GLM_API_URL no .env
 *   3. Chame `captureAndQueueCards()` a partir do painel do Postador/Motoboy
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "@/integrations/supabase/client";

/* ═══════════════════════════════════════════
   TIPOS
═══════════════════════════════════════════ */

export type CardListingType =
  | "produto"
  | "imovel"
  | "veiculo"
  | "servico"
  | "frete"
  | "viagem";

/** Dados de um slot promovido (promoted_listing_slots) */
export interface CardSlotData {
  slotId: string;          // ID do registro em promoted_listing_slots
  userId: string;          // dono do anúncio
  listingId: string;
  listingType: CardListingType;
  listingTitle: string;
  listingPrice?: number | null;
  listingImage?: string | null; // URL pública da imagem do produto
  listingCity?: string | null;
  storeName?: string | null;
  storeWhatsapp?: string | null;
  storeSiteUrl?: string | null;
}

/** Resultado da captura de 1 card pelo GLM */
export interface GlmCaptureResult {
  slotId: string;
  listingId: string;
  status: "ready" | "error";
  /** URL pública da imagem gerada (Supabase Storage) */
  imageUrl?: string;
  /** Base64 PNG — preenchido quando imageUrl não está disponível ainda */
  imageBase64?: string;
  capturedAt: string; // ISO
  errorMessage?: string;
}

/** Item da fila de distribuição ao Postador */
export interface PostadorQueueItem {
  id: string;
  slotId: string;
  postadorId: string;
  imageUrl: string;
  listingTitle: string;
  listingType: CardListingType;
  status: "pending" | "sent" | "failed";
  scheduledAt?: string;
  sentAt?: string;
}

/* ═══════════════════════════════════════════
   CONFIGURAÇÃO GLM
═══════════════════════════════════════════ */

const GLM_API_URL  = import.meta.env.VITE_GLM_API_URL  ?? "";
const GLM_API_KEY  = import.meta.env.VITE_GLM_API_KEY  ?? "";

/** Prompt base enviado ao GLM para renderizar o card como imagem */
const GLM_CARD_PROMPT_TEMPLATE = (card: CardSlotData) => `
Gere uma imagem promocional para divulgação no WhatsApp com as seguintes informações:
- Título: ${card.listingTitle}
- Preço: ${card.listingPrice ? `R$ ${card.listingPrice.toFixed(2)}` : "Consulte"}
- Loja: ${card.storeName ?? "Anunciante Viagg-TX8"}
- Cidade: ${card.listingCity ?? ""}
- Tipo: ${card.listingType}
Estilo: card moderno, fundo escuro, destaque laranja (#FF6A00), texto branco, 1080x1080px.
`.trim();

/* ═══════════════════════════════════════════
   BUSCA DE SLOTS PROMOVIDOS
═══════════════════════════════════════════ */

/**
 * Busca todos os slots ativos em promoted_listing_slots.
 * Usado pelo GLM para saber quais cards processar.
 */
export async function fetchActiveCardSlots(
  limitPerUser = 5
): Promise<CardSlotData[]> {
  const { data, error } = await supabase
    .from("promoted_listing_slots" as any)
    .select(`
      id,
      user_id,
      listing_id,
      listing_type,
      listing_title,
      listing_price,
      listing_image,
      listing_city
    `)
    .order("created_at", { ascending: true })
    .limit(limitPerUser * 50); // amplo — filtrado por postador depois

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

/* ═══════════════════════════════════════════
   INTEGRAÇÃO GLM — PONTO DE ENTRADA DA IA
═══════════════════════════════════════════ */

/**
 * ⚡ PONTO DE INTEGRAÇÃO DA IA GLM
 *
 * Recebe os dados de 1 card e retorna a imagem gerada (base64 PNG ou URL).
 * Substitua o corpo desta função pela chamada real à API do GLM quando disponível.
 *
 * Exemplo de integração:
 *   const response = await fetch(GLM_API_URL + "/generate", {
 *     method: "POST",
 *     headers: { Authorization: `Bearer ${GLM_API_KEY}`, "Content-Type": "application/json" },
 *     body: JSON.stringify({ prompt: GLM_CARD_PROMPT_TEMPLATE(card), size: "1080x1080" }),
 *   });
 *   const { image_base64 } = await response.json();
 *   return image_base64;
 */
async function glmGenerateCardImage(card: CardSlotData): Promise<string> {
  if (!GLM_API_URL || !GLM_API_KEY) {
    // Modo de desenvolvimento: retorna imagem existente ou placeholder
    console.warn("[GLM] API não configurada — usando imagem original do card");
    if (card.listingImage?.startsWith("http")) return card.listingImage;
    throw new Error("GLM não configurado e card não tem imagem externa");
  }

  const prompt = GLM_CARD_PROMPT_TEMPLATE(card);

  const response = await fetch(`${GLM_API_URL}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: card.listingImage ?? null, // opcional: GLM usa como base
      size: "1080x1080",
      format: "base64",
    }),
  });

  if (!response.ok) {
    throw new Error(`GLM API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  // Adapte o campo conforme a resposta real do GLM
  return json.image_base64 ?? json.url ?? json.data?.b64_json;
}

/* ═══════════════════════════════════════════
   UPLOAD AO SUPABASE STORAGE
═══════════════════════════════════════════ */

async function uploadCardImageToStorage(
  base64OrUrl: string,
  slotId: string
): Promise<string> {
  // Se já é URL pública, retorna direto
  if (base64OrUrl.startsWith("http")) return base64OrUrl;

  // Converte base64 → Blob
  const byteString = atob(base64OrUrl.replace(/^data:image\/\w+;base64,/, ""));
  const arrayBuffer = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    arrayBuffer[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([arrayBuffer], { type: "image/png" });

  const path = `card-captures/${slotId}.png`;
  const { error } = await supabase.storage
    .from("aaudio") // reutiliza bucket público — trocar para bucket dedicado se criar um
    .upload(path, blob, { upsert: true, contentType: "image/png" });

  if (error) throw new Error(`Upload falhou: ${error.message}`);

  const { data } = supabase.storage.from("aaudio").getPublicUrl(path);
  return data.publicUrl;
}

/* ═══════════════════════════════════════════
   CAPTURA INDIVIDUAL
═══════════════════════════════════════════ */

/**
 * Captura 1 card como imagem usando o GLM e faz upload ao Storage.
 * Retorna GlmCaptureResult pronto para ser enfileirado ao Postador.
 */
export async function captureCardAsImage(
  card: CardSlotData
): Promise<GlmCaptureResult> {
  const capturedAt = new Date().toISOString();
  try {
    const imageData = await glmGenerateCardImage(card);
    const imageUrl  = await uploadCardImageToStorage(imageData, card.slotId);

    return {
      slotId: card.slotId,
      listingId: card.listingId,
      status: "ready",
      imageUrl,
      capturedAt,
    };
  } catch (err: any) {
    console.error("[GLM] captureCardAsImage falhou:", err);
    return {
      slotId: card.slotId,
      listingId: card.listingId,
      status: "error",
      capturedAt,
      errorMessage: err?.message ?? "Erro desconhecido",
    };
  }
}

/* ═══════════════════════════════════════════
   FILA PARA O POSTADOR — 1 IMAGEM POR POSTAGEM
═══════════════════════════════════════════ */

/**
 * Captura todos os cards ativos e cria a fila de distribuição ao Postador.
 * Cada card gera exatamente 1 item na fila (1 imagem por postagem).
 *
 * @param postadorId  ID do motoboy/postador que vai receber os cards
 * @param maxCards    Máximo de cards a processar por chamada (default 5)
 */
export async function captureAndQueueCards(
  postadorId: string,
  maxCards = 5
): Promise<{ queued: number; errors: number }> {
  const slots  = await fetchActiveCardSlots(maxCards);
  const subset = slots.slice(0, maxCards);

  let queued = 0;
  let errors = 0;

  for (const slot of subset) {
    const result = await captureCardAsImage(slot);

    if (result.status === "ready" && result.imageUrl) {
      // Grava na tabela de fila (crie a migration abaixo se não existir)
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

      if (error) {
        console.error("[GLM] Erro ao gravar na fila:", error.message);
        errors++;
      } else {
        queued++;
      }
    } else {
      errors++;
    }
  }

  return { queued, errors };
}

/* ═══════════════════════════════════════════
   MIGRATION SQL (referência — rode no Supabase)
═══════════════════════════════════════════

  create table if not exists postador_card_queue (
    id            uuid primary key default gen_random_uuid(),
    slot_id       uuid not null,
    postador_id   uuid not null references auth.users(id),
    image_url     text not null,
    listing_title text,
    listing_type  text,
    status        text not null default 'pending',
    captured_at   timestamptz,
    sent_at       timestamptz,
    created_at    timestamptz default now(),
    unique(slot_id, postador_id)
  );

  alter table postador_card_queue enable row level security;

  -- Postador só vê a própria fila
  create policy "postador_vê_própria_fila" on postador_card_queue
    for select using (postador_id = auth.uid());

  -- Sistema pode inserir/atualizar
  create policy "sistema_insere" on postador_card_queue
    for all using (true) with check (true);

═══════════════════════════════════════════ */
