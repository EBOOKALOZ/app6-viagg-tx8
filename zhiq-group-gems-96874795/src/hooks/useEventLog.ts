// ── VIAGG-TX8™ — useEventLog — console de eventos em tempo real ───────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeService } from "@/lib/events/RealtimeService";
import type { PlatformEvent, EventModule, EventSeverity } from "@/lib/events/types";

const MAX_EVENTS = 200; // mantém os 200 últimos na memória

interface UseEventLogOptions {
  module?:   EventModule;
  severity?: EventSeverity;
  limit?:    number; // quantos buscar na inicialização
}

export function useEventLog(options: UseEventLogOptions = {}) {
  const { module, severity, limit = 50 } = options;

  const [events, setEvents]     = useState<PlatformEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [paused, setPaused]     = useState(false);
  const pausedRef               = useRef(false);

  // ── Busca inicial ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    let query = supabase
      .from("platform_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (module)   query = query.eq("module", module);
    if (severity) query = query.eq("severity", severity);

    query.then(({ data, error: err }) => {
      if (err) setError(err.message);
      else     setEvents((data as PlatformEvent[]) ?? []);
      setLoading(false);
    });
  }, [module, severity, limit]);

  // ── Stream Realtime ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = RealtimeService.subscribe((event) => {
      if (pausedRef.current) return;
      if (module   && event.module   !== module)   return;
      if (severity && event.severity !== severity) return;

      setEvents((prev) => {
        const next = [event, ...prev];
        return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
      });
    });
    return unsub;
  }, [module, severity]);

  // ── Controles ────────────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  return { events, loading, error, paused, togglePause, clear };
}
