// ── VIAGG-TX8™ — EventService — emissão de eventos ───────────────────────────
// POLÍTICA DE LOCALIZAÇÃO: SEMPRE GPS do dispositivo. Nunca IP de internet.
// O campo `ip` é deixado em branco intencionalmente — IP não determina localização.

import { supabase } from "@/integrations/supabase/client";
import type { PlatformEvent, EventType, EventModule, EventSeverity, EventStatus } from "./types";

// ── Coleta contexto do browser (sem IP) ──────────────────────────────────────

function getBrowserInfo(): { device: string; browser: string } {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android/i.test(ua);
  const device = isMobile ? "mobile" : "desktop";

  let browser = "unknown";
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Edg/i.test(ua)) browser = "Edge";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";

  return { device, browser };
}

// ── Cache de localização GPS (evita chamar GPS a cada evento) ─────────────────

interface GeoCache {
  latitude:  number;
  longitude: number;
  city?:     string;
  state?:    string;
  cachedAt:  number;
}

let geoCache: GeoCache | null = null;
const GEO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Busca localização via GPS do dispositivo + reverse geocode Nominatim
async function getGPSLocation(): Promise<Partial<GeoCache>> {
  // Usa cache se ainda válido
  if (geoCache && Date.now() - geoCache.cachedAt < GEO_CACHE_TTL_MS) {
    return geoCache;
  }

  // Sem suporte a geolocation
  if (!navigator.geolocation) return {};

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let city: string | undefined;
        let state: string | undefined;

        // Reverse geocode local (sem IP — usa coordenadas GPS reais)
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`;
          const res = await fetch(url, {
            headers: { "Accept-Language": "pt-BR,pt;q=0.9", "User-Agent": "VIAGG-TX8/1.0" },
          });
          if (res.ok) {
            const data = await res.json();
            const a = data.address ?? {};
            city  = a.city ?? a.town ?? a.village ?? a.municipality;
            state = a.state;
          }
        } catch { /* não bloqueia o evento */ }

        geoCache = { latitude, longitude, city, state, cachedAt: Date.now() };
        resolve(geoCache);
      },
      () => resolve({}),             // permissão negada → sem localização
      { timeout: 4000, maximumAge: 300_000, enableHighAccuracy: false }
    );
  });
}

// ── Enriquece payload com GPS (se não passou cidade/coords manualmente) ────────

async function enrichWithGPS(payload: PlatformEvent): Promise<PlatformEvent> {
  // Já tem coordenadas explícitas → respeita o que veio
  if (payload.latitude != null && payload.longitude != null) return payload;

  const geo = await getGPSLocation();
  return {
    ...payload,
    latitude:  geo.latitude,
    longitude: geo.longitude,
    city:      payload.city  ?? geo.city,
    state:     payload.state ?? geo.state,
    // ip: INTENCIONALMENTE omitido — IP de internet ≠ localização física
  };
}

// ── Payload builder ───────────────────────────────────────────────────────────

function buildPayload(
  event_type: EventType,
  module: EventModule,
  action: string,
  title: string,
  options: Partial<PlatformEvent> = {}
): PlatformEvent {
  const { device, browser } = getBrowserInfo();
  return {
    event_type,
    module,
    action,
    title,
    status:   options.status   ?? "success",
    severity: options.severity ?? "info",
    device,
    browser,
    ...options,
    metadata: options.metadata ?? {},
  };
}

// ── Emissão ao banco (enriquece com GPS antes de salvar) ─────────────────────

async function emit(payload: PlatformEvent): Promise<void> {
  try {
    const enriched = await enrichWithGPS(payload);
    const { error } = await supabase.from("platform_events").insert(enriched);
    if (error) console.warn("[EventService] falha ao emitir evento:", error.message);
  } catch (err) {
    console.warn("[EventService] erro inesperado:", err);
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

export const EventService = {
  /** Emite qualquer evento de forma livre */
  emit,

  /** Atalho para corridas */
  ride: {
    requested:   (rideId: string, city?: string, meta?: Record<string, unknown>) =>
      emit(buildPayload("ride.requested", "rides", "requested",
        "Nova corrida solicitada", { ride_id: rideId, city, severity: "info", metadata: meta })),

    driverAssigned: (rideId: string, driverId: string) =>
      emit(buildPayload("ride.driver_assigned", "rides", "driver_assigned",
        "Motorista atribuído", { ride_id: rideId, driver_id: driverId })),

    completed: (rideId: string, driverId?: string, meta?: Record<string, unknown>) =>
      emit(buildPayload("ride.completed", "rides", "completed",
        "Corrida concluída", { ride_id: rideId, driver_id: driverId, severity: "info", metadata: meta })),

    cancelled: (rideId: string, by: "passenger" | "driver" | "system", reason?: string) =>
      emit(buildPayload(`ride.cancelled_${by}` as EventType, "rides", "cancelled",
        `Corrida cancelada pelo ${by}`, { ride_id: rideId, severity: "warning",
          metadata: { reason } })),

    sos: (rideId: string, userId: string, lat?: number, lng?: number) =>
      emit(buildPayload("ride.sos_triggered", "rides", "sos",
        "🚨 SOS acionado em corrida!", { ride_id: rideId, user_id: userId,
          severity: "critical", latitude: lat, longitude: lng })),
  },

  /** Atalho para pagamentos */
  payment: {
    pixReceived: (paymentId: string, amount: number, userId?: string) =>
      emit(buildPayload("payment.pix_received", "finance", "pix_received",
        `PIX recebido: R$ ${amount.toFixed(2)}`, { payment_id: paymentId,
          user_id: userId, metadata: { amount } })),

    cardApproved: (paymentId: string, amount: number, userId?: string) =>
      emit(buildPayload("payment.card_approved", "finance", "card_approved",
        `Cartão aprovado: R$ ${amount.toFixed(2)}`, { payment_id: paymentId,
          user_id: userId, metadata: { amount } })),

    failed: (paymentId: string, reason: string, userId?: string) =>
      emit(buildPayload("payment.card_declined", "finance", "declined",
        "Pagamento recusado", { payment_id: paymentId, user_id: userId,
          severity: "error", metadata: { reason } })),
  },

  /** Atalho para usuários */
  user: {
    registered: (userId: string, city?: string) =>
      emit(buildPayload("user.registered", "users", "registered",
        "Novo usuário cadastrado", { user_id: userId, city })),

    loggedIn: (userId: string) =>
      emit(buildPayload("user.logged_in", "users", "logged_in",
        "Usuário fez login", { user_id: userId })),

    banned: (userId: string, reason: string) =>
      emit(buildPayload("user.banned", "users", "banned",
        "Usuário banido", { user_id: userId, severity: "warning", metadata: { reason } })),
  },

  /** Atalho para IA */
  ai: {
    chatMessage: (userId?: string, tokens?: number) =>
      emit(buildPayload("ai.chat_message", "ai", "chat",
        "Mensagem enviada à IA", { user_id: userId, metadata: { tokens } })),

    autoPost: (module: string, postsCount: number) =>
      emit(buildPayload("ai.auto_post_created", "ai", "auto_post",
        `GLM criou ${postsCount} post(s)`, { metadata: { module, postsCount } })),

    error: (error: string, context?: string) =>
      emit(buildPayload("ai.error", "ai", "error",
        "Erro na IA Viagg", { severity: "error", metadata: { error, context } })),
  },

  /** Atalho para segurança */
  security: {
    suspiciousLogin: (userId: string, ip?: string) =>
      emit(buildPayload("security.suspicious_login", "security", "suspicious_login",
        "Login suspeito detectado", { user_id: userId, ip, severity: "warning" })),

    fraudDetected: (userId: string, detail: string) =>
      emit(buildPayload("security.fraud_detected", "security", "fraud",
        "Fraude detectada!", { user_id: userId, severity: "critical", metadata: { detail } })),
  },

  /** Atalho para motoristas */
  driver: {
    online: (driverId: string, lat?: number, lng?: number, city?: string) =>
      emit(buildPayload("driver.online", "drivers", "online",
        "Motorista online", { driver_id: driverId, latitude: lat, longitude: lng, city })),

    offline: (driverId: string) =>
      emit(buildPayload("driver.offline", "drivers", "offline",
        "Motorista offline", { driver_id: driverId })),
  },
};
