/**
 * glmPostadorBridge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ponte: Cards de Divulgação (promoted_listing_slots) → Lotes do Postador
 *        (posting_lots + posting_lot_items)
 *
 * Fluxo por perfil:
 *   Anunciante de Viagens publica seus cards
 *     → GLM gera texto de postagem personalizado por tipo
 *       → Lote criado em posting_lots (disponível para motoboy postador)
 *         → Motoboy vê o card no painel e clica "Postar no WhatsApp"
 *
 * Perfis suportados: viagens | fretes | servicos | veiculos | imoveis | produtos
 *
 * Como ativar o GLM real:
 *   Defina VITE_GLM_API_KEY e VITE_GLM_API_URL no .env
 *   Implemente glmGeneratePostText() com a chamada real
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "@/integrations/supabase/client";
import { chatCompletion } from "@/lib/aiapi";

/* ═══════════════════════════════════════════
   TIPOS
═══════════════════════════════════════════ */

export type ProfileType =
  | "viagens"
  | "fretes"
  | "servicos"
  | "veiculos"
  | "imoveis"
  | "produtos";

export interface PromotedSlot {
  id: string;
  user_id: string;
  listing_id: string;
  listing_type: ProfileType;
  listing_title: string;
  listing_price: number | null;
  listing_image: string | null;
  listing_city: string | null;
  store_name?: string | null;
  store_logo_url?: string | null;
  store_whatsapp?: string | null;
}

export interface BridgeResult {
  profile: ProfileType;
  lotsCreated: number;
  errors: string[];
}

/* ═══════════════════════════════════════════
   EMOJIS E RÓTULOS POR PERFIL
═══════════════════════════════════════════ */

const PROFILE_META: Record<ProfileType, { emoji: string; label: string; cta: string }> = {
  viagens:  { emoji: "✈️", label: "Viagens & Turismo", cta: "Reserve agora!" },
  fretes:   { emoji: "🚛", label: "Fretes & Transportes", cta: "Solicite seu frete!" },
  servicos: { emoji: "🛠️", label: "Serviços", cta: "Entre em contato!" },
  veiculos: { emoji: "🚗", label: "Veículos", cta: "Confira o veículo!" },
  imoveis:  { emoji: "🏠", label: "Imóveis", cta: "Agende uma visita!" },
  produtos: { emoji: "🛍️", label: "Ofertas", cta: "Compre agora!" },
};

/* ═══════════════════════════════════════════
   GLM — GERAÇÃO DE TEXTO POR PERFIL
   (via edge function ai-chat — chave permanece no servidor)
═══════════════════════════════════════════ */

/**
 * ⚡ PONTO DE INTEGRAÇÃO DA IA GLM
 *
 * Usa a edge function `ai-chat` (mesma que o Postador IA usa no painel do anunciante).
 * Fallback automático para texto estruturado se a edge function falhar.
 */
async function glmGeneratePostText(
  slots: PromotedSlot[],
  profile: ProfileType
): Promise<string> {
  const meta = PROFILE_META[profile];

  try {
    const text = await chatCompletion(buildGlmPrompt(slots, profile), "glm-4-plus");
    if (text.trim()) return text.trim();
  } catch (err) {
    console.warn("[GLM Bridge] Edge function falhou, usando fallback:", err);
  }

  return buildFallbackText(slots, profile, meta);
}

function buildGlmPrompt(slots: PromotedSlot[], profile: ProfileType): string {
  const meta = PROFILE_META[profile];
  const items = slots
    .map(
      (s) =>
        `- ${s.listing_title}${s.listing_price ? ` (R$ ${s.listing_price.toFixed(2)})` : ""}${s.listing_city ? ` | ${s.listing_city}` : ""}`
    )
    .join("\n");

  return `
Crie uma mensagem promocional curta e atrativa para WhatsApp sobre ${meta.label}.
Tom: animado, local, emoji moderado.
Máximo 5 linhas. Termine com a CTA "${meta.cta}".

Anúncios:
${items}

Loja: ${slots[0]?.store_name ?? "Anunciante Viagg-TX8"}
  `.trim();
}

function buildFallbackText(
  slots: PromotedSlot[],
  profile: ProfileType,
  meta: { emoji: string; label: string; cta: string }
): string {
  const storeName = slots[0]?.store_name ?? "Anunciante Viagg-TX8";
  const city = slots.find((s) => s.listing_city)?.listing_city ?? "";

  const lines: string[] = [
    `${meta.emoji} *${meta.label}* ${meta.emoji}`,
    `🏪 ${storeName}${city ? ` — ${city}` : ""}`,
    "",
    "📣 Confira nossas ofertas:",
  ];

  slots.forEach((s) => {
    const price = s.listing_price
      ? ` — R$ ${s.listing_price.toFixed(2).replace(".", ",")}`
      : "";
    lines.push(`• ${s.listing_title}${price}`);
  });

  lines.push("");
  lines.push(`👉 ${meta.cta}`);
  lines.push("─────────────────────");
  lines.push("📲 Viagg-TX8 | Anuncie Grátis");

  return lines.join("\n");
}

/* ═══════════════════════════════════════════
   FETCH DE SLOTS PROMOVIDOS
═══════════════════════════════════════════ */

export async function fetchPromotedSlotsByProfile(
  profile: ProfileType
): Promise<PromotedSlot[]> {
  const { data, error } = await supabase
    .from("promoted_listing_slots" as any)
    .select("id, user_id, listing_id, listing_type, listing_title, listing_price, listing_image, listing_city")
    .eq("listing_type", profile)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`fetchPromotedSlots(${profile}): ${error.message}`);

  // Enriquecer com dados da loja
  const slots = data ?? [];
  const userIds = [...new Set(slots.map((s: any) => s.user_id))];

  let storeMap: Record<string, { store_name: string; store_logo_url: string | null; store_whatsapp: string | null }> = {};
  if (userIds.length > 0) {
    const { data: stores } = await supabase
      .from("merchant_stores")
      .select("user_id, store_name, logo_url, whatsapp_number")
      .in("user_id", userIds);

    (stores ?? []).forEach((s: any) => {
      storeMap[s.user_id] = {
        store_name: s.store_name,
        store_logo_url: s.logo_url,
        store_whatsapp: s.whatsapp_number,
      };
    });
  }

  return slots.map((s: any): PromotedSlot => ({
    id: s.id,
    user_id: s.user_id,
    listing_id: s.listing_id,
    listing_type: s.listing_type as ProfileType,
    listing_title: s.listing_title ?? "Sem título",
    listing_price: s.listing_price,
    listing_image: s.listing_image,
    listing_city: s.listing_city,
    store_name: storeMap[s.user_id]?.store_name ?? null,
    store_logo_url: storeMap[s.user_id]?.store_logo_url ?? null,
    store_whatsapp: storeMap[s.user_id]?.store_whatsapp ?? null,
  }));
}

/* ═══════════════════════════════════════════
   CRIAÇÃO DE LOTES (posting_lots)
   Até MAX_ITEMS_PER_LOT por lote
═══════════════════════════════════════════ */

const MAX_ITEMS_PER_LOT = 3;

export async function createPostingLotFromSlots(
  slots: PromotedSlot[],
  profile: ProfileType,
  messageText: string
): Promise<string> {
  const first = slots[0];
  if (!first) throw new Error("Nenhum slot para criar lote");

  // Insere o lote principal
  const { data: lot, error: lotErr } = await supabase
    .from("posting_lots" as any)
    .insert({
      store_user_id: first.user_id,
      store_name: first.store_name ?? "Anunciante",
      store_logo_url: first.store_logo_url ?? null,
      target_city: first.listing_city ?? null,
      message_override: messageText,   // texto gerado pelo GLM
      source_profile: profile,         // qual perfil originou o lote
      status: "available",
    })
    .select("id")
    .single();

  if (lotErr || !lot) throw new Error(`Erro ao criar lote: ${lotErr?.message}`);

  // Insere os itens do lote (até MAX_ITEMS_PER_LOT)
  const itemRows = slots.slice(0, MAX_ITEMS_PER_LOT).map((s, i) => ({
    lot_id: lot.id,
    product_id: s.listing_id,
    product_name: s.listing_title,
    product_price: s.listing_price ?? null,
    product_image_url: s.listing_image ?? null,
    position: i + 1,
  }));

  const { error: itemsErr } = await supabase
    .from("posting_lot_items" as any)
    .insert(itemRows);

  if (itemsErr) {
    console.error("[Bridge] Erro ao inserir itens:", itemsErr.message);
  }

  return lot.id;
}

/* ═══════════════════════════════════════════
   PONTO DE ENTRADA PRINCIPAL
   Processa 1 ou todos os perfis
═══════════════════════════════════════════ */

/**
 * Converte os cards promovidos de UM perfil em lotes para o Postador.
 * Cada lote de até 3 cards gera 1 item no painel do motoboy.
 */
export async function bridgeProfileToPostador(
  profile: ProfileType
): Promise<BridgeResult> {
  const errors: string[] = [];
  let lotsCreated = 0;

  try {
    const slots = await fetchPromotedSlotsByProfile(profile);
    if (slots.length === 0) return { profile, lotsCreated: 0, errors: [] };

    // Agrupa por usuário (cada anunciante gera seu próprio lote)
    const byUser = slots.reduce<Record<string, PromotedSlot[]>>((acc, s) => {
      if (!acc[s.user_id]) acc[s.user_id] = [];
      acc[s.user_id].push(s);
      return acc;
    }, {});

    for (const [, userSlots] of Object.entries(byUser)) {
      // Divide em lotes de MAX_ITEMS_PER_LOT
      for (let i = 0; i < userSlots.length; i += MAX_ITEMS_PER_LOT) {
        const batch = userSlots.slice(i, i + MAX_ITEMS_PER_LOT);
        try {
          const messageText = await glmGeneratePostText(batch, profile);
          await createPostingLotFromSlots(batch, profile, messageText);
          lotsCreated++;
        } catch (err: any) {
          errors.push(err?.message ?? "Erro desconhecido");
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? "Erro ao buscar slots");
  }

  return { profile, lotsCreated, errors };
}

/**
 * Processa TODOS os perfis de uma vez.
 * Útil para chamada programada (cron / edge function).
 */
export async function bridgeAllProfilesToPostador(): Promise<BridgeResult[]> {
  const profiles: ProfileType[] = [
    "viagens", "fretes", "servicos", "veiculos", "imoveis", "produtos",
  ];
  const results: BridgeResult[] = [];
  for (const profile of profiles) {
    results.push(await bridgeProfileToPostador(profile));
  }
  return results;
}
