// ── VIAGG-TX8™ — useRealtimeMetrics — métricas do dashboard ──────────────────

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeService } from "@/lib/events/RealtimeService";
import type { EventMetrics } from "@/lib/events/types";

const REFRESH_INTERVAL_MS = 30_000; // atualiza métricas a cada 30s

const EMPTY: EventMetrics = {
  total_today:       0,
  total_last_hour:   0,
  errors_today:      0,
  rides_today:       0,
  payments_today:    0,
  users_today:       0,
  ai_calls_today:    0,
  critical_alerts:   0,
  events_by_module:  {},
  events_by_hour:    [],
};

export function useRealtimeMetrics() {
  const [metrics, setMetrics]   = useState<EventMetrics>(EMPTY);
  const [loading, setLoading]   = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchMetrics = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_event_metrics");
    if (!error && data) {
      setMetrics(data as EventMetrics);
      setLastUpdate(new Date());
    }
    setLoading(false);
  }, []);

  // ── Carga inicial + polling ───────────────────────────────────────────────────
  useEffect(() => {
    fetchMetrics();
    const iv = setInterval(fetchMetrics, REFRESH_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchMetrics]);

  // ── Reactivo: re-fetch quando chega evento crítico ────────────────────────────
  useEffect(() => {
    const unsub = RealtimeService.subscribeCritical(() => {
      // debounce simples: atualiza 2s depois do evento crítico
      setTimeout(fetchMetrics, 2000);
    });
    return unsub;
  }, [fetchMetrics]);

  return { metrics, loading, lastUpdate, refetch: fetchMetrics };
}
