/**
 * ai/postadorBridge.ts
 * Ponte: Cards de Divulgação (promoted_listing_slots) → Lotes do Postador
 *        (posting_lots + posting_lot_items)
 *
 * Perfis: viagens | fretes | servicos | veiculos | imoveis | produtos
 */

import { supabase }        from "@/integrations/supabase/client";
import { chatCompletion }  from "./client";
import { AI_MODEL }        from "./config";

/* ── Tipos ─────────────────────────────────────────────────────────────────── */

export type ProfileType =
  | "viagens" | "fretes" | "servicos"
  | "veiculos" | "imoveis" | "produtos";

export interface PromotedSlot {
  id:            string;  // promoted_listing_slots.id (UUID)
  user_id:       string;
  listing_id:    string;
  listing_type:  ProfileType;
  listing_title: string;
  listing_price: number | null;
  listing_image: string | null;
  listing_city:  string | null;
  position:      number;
  store_name?:       string | null;
  store_logo_url?:   string | null;
  store_whatsapp?:   string | null;
}

export interface BridgeResult {
  profile:      ProfileType;
  lotsCreated:  number;
  errors:       string[];
}

/* ── Metadados por perfil ──────────────────────────────────────────────────── */

const PROFILE_META: Record<ProfileType, { emoji: string; label: string; cta: string }> = {
  viagens:  { emoji: "✈️",  label: "Viagens & Turismo",    cta: "Reserve agora!"        },
  fretes:   { emoji: "🚛",  label: "Fretes & Transportes", cta: "Solicite seu frete!"   },
  servicos: { emoji: "🛠️", label: "Serviços",              cta: "Entre em contato!"     },
  veiculos: { emoji: "🚗",  label: "Veículos",             cta: "Confira o veículo!"    },
  imoveis:  { emoji: "🏠",  label: "Imóveis",              cta: "Agende uma visita!"    },
  produtos: { emoji: "🛍️", label: "Ofertas",              cta: "Compre agora!"         },
};

/* ── Geração de texto via IA ──────────────────────────────────────────────── */

async function generatePostText(slots: PromotedSlot[], profile: ProfileType): Promise<string> {
  const meta = PROFILE_META[profile];
  try {
    const text = await chatCompletion(buildPrompt(slots, profile), AI_MODEL);
    if (text.trim()) return text.trim();
  } catch (err) {
    console.warn("[AI Bridge] Edge function falhou, usando fallback:", err);
  }
  return buildFallbackText(slots, profile, meta);
}

function buildPrompt(slots: PromotedSlot[], profile: ProfileType): string {
  const meta  = PROFILE_META[profile];
  const items = slots
    .map(s => `- ${s.listing_title}${s.listing_price ? ` (R$ ${s.listing_price.toFixed(2)})` : ""}${s.listing_city ? ` | ${s.listing_city}` : ""}`)
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
  _profile: ProfileType,
  meta: { emoji: string; label: string; cta: string },
): string {
  const storeName = slots[0]?.store_name ?? "Anunciante Viagg-TX8";
  const city = slots.find(s => s.listing_city)?.listing_city ?? "";
  const lines = [
    `${meta.emoji} *${meta.label}* ${meta.emoji}`,
    `🏪 ${storeName}${city ? ` — ${city}` : ""}`,
    "",
    "📣 Confira nossas ofertas:",
    ...slots.map(s => `• ${s.listing_title}${s.listing_price ? ` — R$ ${s.listing_price.toFixed(2).replace(".", ",")}` : ""}`),
    "",
    `👉 ${meta.cta}`,
    "─────────────────────",
    "📲 Viagg-TX8 | Anuncie Grátis",
  ];
  return lines.join("\n");
}

/* ── Fetch de slots via RPC (Regra Arquitetural #2: IA usa API pública da Fila) ──*/

export async function fetchPromotedSlotsByProfile(
  profile: ProfileType,
  limit = 50,
): Promise<PromotedSlot[]> {
  // A RPC get_next_slots_for_posting foi removida do banco (PGRST202 em 07-21).
  // Leitura direta da fila real: promoted_listing_slots status='active' por perfil.
  // Colunas reais da tabela: id, user_id, listing_id/type/title/price/image/city,
  // networks, status, created_at — NÃO existe "position" (ordena por created_at).
  const { data: rows, error } = await supabase
    .from("promoted_listing_slots" as any)
    .select("id, user_id, listing_id, listing_type, listing_title, listing_price, listing_image, listing_city")
    .eq("status", "active")
    .eq("listing_type", profile)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`promoted_listing_slots(${profile}): ${error.message}`);

  const slots: any[] = (rows ?? []).map((r: any, i: number) => ({ ...r, slot_id: r.id, position: i }));
  if (slots.length === 0) return [];

  const userIds = [...new Set(slots.map((s: any) => s.user_id as string))];

  let storeMap: Record<string, { store_name: string; store_logo_url: string | null; store_whatsapp: string | null }> = {};
  if (userIds.length > 0) {
    const { data: stores } = await supabase
      .from("merchant_stores")
      .select("user_id, store_name, logo_url, whatsapp_number")
      .in("user_id", userIds);
    (stores ?? []).forEach((s: any) => {
      storeMap[s.user_id] = {
        store_name:    s.store_name,
        store_logo_url:s.logo_url,
        store_whatsapp:s.whatsapp_number,
      };
    });
  }

  return slots.map((s: any): PromotedSlot => ({
    id:            s.slot_id,       // UUID do promoted_listing_slots
    user_id:       s.user_id,
    listing_id:    s.listing_id,
    listing_type:  s.listing_type as ProfileType,
    listing_title: s.listing_title ?? "Sem título",
    listing_price: s.listing_price,
    listing_image: s.listing_image,
    listing_city:  s.listing_city,
    position:      s.position ?? 0,
    store_name:      storeMap[s.user_id]?.store_name     ?? null,
    store_logo_url:  storeMap[s.user_id]?.store_logo_url ?? null,
    store_whatsapp:  storeMap[s.user_id]?.store_whatsapp ?? null,
  }));
}

/* ── M53.2 · Camada de Compatibilidade — roteador do Motor Central ─────────
 * O Motor (motor_publish_request) é consultado ANTES do caminho legado.
 *   routed='motor'  → trabalho feito server-side; legado é PULADO
 *   routed='shadow' → Motor só registrou eventos; legado executa normalmente
 *   routed='off' | erro | RPC inexistente → legado executa normalmente
 * Rollback: UPDATE em motor_flags (sem deploy). Este bloco nunca lança. */

interface MotorRouteResult {
  handled: boolean;          // true = Motor criou o lote (pular legado)
  ok?: boolean;
  lotId?: string | null;
  reason?: string;
  requestId?: string | null; // presente em observe/shadow p/ reportar desfecho do legado
}

/** M53.2A: reporta ao Motor o desfecho do caminho legado (observe/shadow).
 *  Fire-and-forget — jamais bloqueia ou quebra o fluxo. */
function reportLegacyOutcome(requestId: string | null | undefined, ok: boolean, error?: string) {
  if (!requestId) return;
  void (supabase.rpc as any)("motor_report_outcome", {
    p_request_id: requestId,
    p_ok:         ok,
    p_error:      error ?? null,
    p_meta:       { via: "postadorBridge" },
  }).then(null, () => { /* telemetria é melhor-esforço */ });
}

let motorFlagsCache: { flags: Record<string, string>; ts: number } | null = null;

async function getMotorFlags(): Promise<Record<string, string>> {
  if (motorFlagsCache && Date.now() - motorFlagsCache.ts < 60_000) return motorFlagsCache.flags;
  try {
    const { data, error } = await (supabase.rpc as any)("motor_get_flags");
    if (error) throw error;
    motorFlagsCache = { flags: (data as Record<string, string>) ?? {}, ts: Date.now() };
  } catch {
    // Motor ainda não implantado neste ambiente → tudo off
    motorFlagsCache = { flags: {}, ts: Date.now() };
  }
  return motorFlagsCache.flags;
}

async function tryMotorPublish(
  origin: "manual" | "operator",
  profile: string,
  slotIds: string[],
  messageText: string,
): Promise<MotorRouteResult> {
  try {
    const flags = await getMotorFlags();
    const mode = flags[`entry.${origin}`] ?? "off";
    if (mode === "off") return { handled: false };

    const { data, error } = await (supabase.rpc as any)("motor_publish_request", {
      p_origin:       origin,
      p_profile:      profile,
      p_slot_ids:     slotIds,
      p_message_text: messageText,
    });
    if (error) throw error;

    const res = data as any;
    if (res?.routed === "motor") {
      return { handled: true, ok: !!res.ok, lotId: res.lot_id ?? null, reason: res.reason,
               requestId: res.request_id ?? null };
    }
    // off/observe/shadow → legado segue; request_id (se houver) permite reportar desfecho
    return { handled: false, requestId: res?.request_id ?? null };
  } catch (err) {
    console.warn("[Motor] indisponível — seguindo pelo caminho legado:", err);
    return { handled: false };
  }
}

/* ── Criação de lotes ────────────────────────────────────────────────────────*/

const MAX_ITEMS_PER_LOT = 3;

export async function createPostingLotFromSlots(
  slots: PromotedSlot[],
  profile: ProfileType,
  messageText: string,
): Promise<string> {
  const first = slots[0];
  if (!first) throw new Error("Nenhum slot para criar lote");

  const { data: lot, error: lotErr } = await supabase
    .from("posting_lots" as any)
    .insert({
      store_user_id:    first.user_id,
      store_name:       first.store_name     ?? "Anunciante",
      store_logo_url:   first.store_logo_url ?? null,
      target_city:      first.listing_city   ?? null,
      message_override: messageText,
      source_profile:   profile,
      status:           "available",
    })
    .select("id")
    .single();

  if (lotErr || !lot) throw new Error(`Erro ao criar lote: ${lotErr?.message}`);

  const itemRows = slots.slice(0, MAX_ITEMS_PER_LOT).map((s, i) => ({
    lot_id:            lot.id,
    product_name:      s.listing_title,
    product_price:     s.listing_price  ?? null,
    product_image_url: s.listing_image  ?? null,
    position:          i + 1,
    source_slot_id:    s.id,           // FK → promoted_listing_slots.id (rastreabilidade)
  }));

  const { error: itemsErr } = await supabase.from("posting_lot_items" as any).insert(itemRows);
  if (itemsErr) console.error("[AI Bridge] Erro ao inserir itens:", itemsErr.message);

  return lot.id;
}

/* ── Ponto de entrada ────────────────────────────────────────────────────────*/

export async function bridgeProfileToPostador(profile: ProfileType): Promise<BridgeResult> {
  const errors: string[] = [];
  let lotsCreated = 0;

  try {
    const slots = await fetchPromotedSlotsByProfile(profile);
    if (slots.length === 0) return { profile, lotsCreated: 0, errors: [] };

    const byUser = slots.reduce<Record<string, PromotedSlot[]>>((acc, s) => {
      if (!acc[s.user_id]) acc[s.user_id] = [];
      acc[s.user_id].push(s);
      return acc;
    }, {});

    for (const [, userSlots] of Object.entries(byUser)) {
      for (let i = 0; i < userSlots.length; i += MAX_ITEMS_PER_LOT) {
        const batch = userSlots.slice(i, i + MAX_ITEMS_PER_LOT);
        try {
          const messageText = await generatePostText(batch, profile);

          // M53.2: Motor Central primeiro; fallback automático ao legado
          const motor = await tryMotorPublish(
            "manual", profile, batch.map(s => s.id), messageText,
          );
          if (motor.handled) {
            if (motor.ok) lotsCreated++;
            else errors.push(motor.reason ?? "Motor recusou a publicação");
            continue;
          }

          try {
            await createPostingLotFromSlots(batch, profile, messageText);
            lotsCreated++;
            reportLegacyOutcome(motor.requestId, true);
          } catch (legacyErr: any) {
            reportLegacyOutcome(motor.requestId, false, legacyErr?.message);
            throw legacyErr;
          }
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

export async function bridgeAllProfilesToPostador(): Promise<BridgeResult[]> {
  const profiles: ProfileType[] = ["viagens", "fretes", "servicos", "veiculos", "imoveis", "produtos"];
  const results: BridgeResult[] = [];
  for (const profile of profiles) results.push(await bridgeProfileToPostador(profile));
  return results;
}

/* ══════════════════════════════════════════════════════════════════════════
 * TIER 2.2 — Bridge de Auto-Promoção de Operadores
 * Motorista (driver) · Moto Táxi (mototaxi) · Motoboy (motoboy)
 * Usa o MESMO Motor Universal — apenas a fonte de dados muda.
 * ══════════════════════════════════════════════════════════════════════════ */

export type OperatorProfileType = "driver" | "mototaxi" | "motoboy";

export interface OperatorSlot {
  slot_id:            string;
  user_id:            string;
  profile_type:       OperatorProfileType;
  service_type:       string;
  title:              string;
  description:        string | null;
  coverage_city:      string | null;
  coverage_state:     string | null;
  price_from:         number | null;
  price_to:           number | null;
  whatsapp:           string | null;
  image_url:          string | null;
  position:           number;
  post_count:         number;
  last_posted_at:     string | null;
  service_label:      string | null;
  service_icon:       string | null;
}

export interface OperatorBridgeResult {
  profile:      OperatorProfileType;
  lotsCreated:  number;
  errors:       string[];
}

const OPERATOR_PROFILE_META: Record<OperatorProfileType, { emoji: string; label: string; cta: string }> = {
  driver:   { emoji: "🚗",  label: "Motorista Profissional", cta: "Solicite sua corrida!"    },
  mototaxi: { emoji: "🏍️", label: "Moto Táxi",             cta: "Chame um moto táxi!"       },
  motoboy:  { emoji: "📦",  label: "Motoboy Express",        cta: "Solicite sua entrega!"    },
};

function buildOperatorPostText(slot: OperatorSlot): string {
  const meta = OPERATOR_PROFILE_META[slot.profile_type];
  const priceStr = slot.price_from
    ? `A partir de R$ ${slot.price_from.toFixed(2).replace(".", ",")}`
    : "";
  const cityStr  = slot.coverage_city ? ` — ${slot.coverage_city}` : "";
  const lines = [
    `${meta.emoji} *${slot.title}*`,
    slot.service_label ? `📋 ${slot.service_label}${cityStr}` : cityStr ? `📍${cityStr}` : "",
    slot.description ? `\n${slot.description}` : "",
    priceStr ? `\n💰 ${priceStr}` : "",
    slot.whatsapp ? `\n📲 WhatsApp: ${slot.whatsapp}` : "",
    `\n👉 ${meta.cta}`,
    "─────────────────────",
    "📲 Viagg-TX8 | Plataforma de Serviços",
  ].filter(Boolean);
  return lines.join("\n");
}

export async function fetchOperatorSlotsByProfile(
  profile: OperatorProfileType,
  limit = 50,
): Promise<OperatorSlot[]> {
  const { data, error } = await supabase.rpc(
    "get_next_operator_slots_for_posting",
    { p_profile_type: profile, p_limit: limit },
  );
  if (error) throw new Error(`get_next_operator_slots_for_posting(${profile}): ${error.message}`);
  const slots: any[] = (data as any)?.slots ?? [];
  return slots.map((s: any): OperatorSlot => ({
    slot_id:        s.slot_id,
    user_id:        s.user_id,
    profile_type:   s.profile_type as OperatorProfileType,
    service_type:   s.service_type,
    title:          s.title ?? "Sem título",
    description:    s.description ?? null,
    coverage_city:  s.coverage_city ?? null,
    coverage_state: s.coverage_state ?? null,
    price_from:     s.price_from ?? null,
    price_to:       s.price_to ?? null,
    whatsapp:       s.whatsapp ?? null,
    image_url:      s.image_url ?? null,
    position:       s.position ?? 0,
    post_count:     s.post_count ?? 0,
    last_posted_at: s.last_posted_at ?? null,
    service_label:  s.service_label ?? null,
    service_icon:   s.service_icon ?? null,
  }));
}

export async function bridgeOperatorProfileToPostador(
  profile: OperatorProfileType,
): Promise<OperatorBridgeResult> {
  const errors: string[] = [];
  let lotsCreated = 0;

  try {
    const slots = await fetchOperatorSlotsByProfile(profile);
    if (slots.length === 0) return { profile, lotsCreated: 0, errors: [] };

    // Agrupar por usuário — cada operador posta seus próprios serviços
    const byUser = slots.reduce<Record<string, OperatorSlot[]>>((acc, s) => {
      if (!acc[s.user_id]) acc[s.user_id] = [];
      acc[s.user_id].push(s);
      return acc;
    }, {});

    for (const [, userSlots] of Object.entries(byUser)) {
      // Máximo 3 slots por lote (espelha lojista)
      for (let i = 0; i < userSlots.length; i += MAX_ITEMS_PER_LOT) {
        const batch = userSlots.slice(i, i + MAX_ITEMS_PER_LOT);
        try {
          const messageText = buildOperatorPostText(batch[0]);

          // M53.2: Motor Central primeiro; fallback automático ao legado
          const motor = await tryMotorPublish(
            "operator", profile, batch.map(s => s.slot_id), messageText,
          );
          if (motor.handled) {
            if (motor.ok) lotsCreated++;
            else errors.push(motor.reason ?? "Motor recusou a publicação");
            continue;
          }

          try {
            const { data, error } = await supabase.rpc("generate_operator_posting_lots", {
              p_profile_type: profile,
              p_slot_ids:     batch.map(s => s.slot_id),
              p_message_text: messageText,
            });
            if (error) throw new Error(error.message);
            if ((data as any)?.ok) lotsCreated++;
            reportLegacyOutcome(motor.requestId, !!(data as any)?.ok);
          } catch (legacyErr: any) {
            reportLegacyOutcome(motor.requestId, false, legacyErr?.message);
            throw legacyErr;
          }
        } catch (err: any) {
          errors.push(err?.message ?? "Erro desconhecido");
        }
      }
    }
  } catch (err: any) {
    errors.push(err?.message ?? "Erro ao buscar slots de operador");
  }

  return { profile, lotsCreated, errors };
}

export async function bridgeAllOperatorProfilesToPostador(): Promise<OperatorBridgeResult[]> {
  const profiles: OperatorProfileType[] = ["driver", "mototaxi", "motoboy"];
  const results: OperatorBridgeResult[] = [];
  for (const profile of profiles) results.push(await bridgeOperatorProfileToPostador(profile));
  return results;
}
