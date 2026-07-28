// ── VIAGG-TX8™ — RealtimeService — canal Supabase Realtime ───────────────────

import { supabase } from "@/integrations/supabase/client";
import type { PlatformEvent } from "./types";

type EventHandler = (event: PlatformEvent) => void;
type UnsubscribeFn = () => void;

const CHANNEL_NAME = "platform_events_realtime";

let channel: ReturnType<typeof supabase.channel> | null = null;
const handlers: Set<EventHandler> = new Set();

// ── Subscrição singleton ──────────────────────────────────────────────────────

function ensureChannel() {
  if (channel) return;

  channel = supabase
    .channel(CHANNEL_NAME)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "platform_events" },
      (payload: { new: PlatformEvent }) => {
        const event = payload.new as PlatformEvent;
        handlers.forEach((h) => {
          try { h(event); } catch (e) { console.warn("[RealtimeService] handler error:", e); }
        });
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.info("[RealtimeService] canal conectado:", CHANNEL_NAME);
      }
      if (status === "CHANNEL_ERROR") {
        console.warn("[RealtimeService] erro no canal, reconectando em 5s…");
        setTimeout(() => {
          channel = null;
          ensureChannel();
        }, 5000);
      }
    });
}

// ── API pública ───────────────────────────────────────────────────────────────

export const RealtimeService = {
  /** Subscreve a todos os eventos em tempo real. Retorna função de cleanup. */
  subscribe(handler: EventHandler): UnsubscribeFn {
    ensureChannel();
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0 && channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  },

  /** Subscreve filtrando por módulo */
  subscribeModule(module: string, handler: EventHandler): UnsubscribeFn {
    return RealtimeService.subscribe((event) => {
      if (event.module === module) handler(event);
    });
  },

  /** Subscreve apenas eventos críticos */
  subscribeCritical(handler: EventHandler): UnsubscribeFn {
    return RealtimeService.subscribe((event) => {
      if (event.severity === "critical" || event.severity === "error") handler(event);
    });
  },

  /** Desconecta o canal globalmente (use somente em cleanup de app) */
  disconnect() {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    handlers.clear();
  },
};
