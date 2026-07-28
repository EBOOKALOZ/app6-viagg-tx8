/**
 * Caixa-preta de erros do cliente: grava crashes de tela na tabela
 * client_errors (window.onerror, unhandledrejection e ErrorBoundary),
 * permitindo diagnóstico direto no banco sem depender de prints.
 * Limite de 5 relatos por minuto para nunca inundar.
 */
import { supabase } from "@/integrations/supabase/client";

let sentThisMinute = 0;
let windowStart = 0;

export async function reportClientError(entry: {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
}) {
  try {
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      sentThisMinute = 0;
    }
    if (sentThisMinute >= 5) return;
    sentThisMinute++;

    const { data: auth } = await supabase.auth.getUser();
    // @ts-expect-error - unified table schema
    await supabase.from("client_errors").insert({
      user_id: auth?.user?.id ?? null,
      message: String(entry.message ?? "").slice(0, 500),
      stack: entry.stack ? String(entry.stack).slice(0, 3000) : null,
      component_stack: entry.componentStack ? String(entry.componentStack).slice(0, 3000) : null,
      url: window.location.href.slice(0, 300),
      user_agent: navigator.userAgent.slice(0, 200),
    });
  } catch {
    /* telemetria nunca pode quebrar o app */
  }
}

export function installGlobalErrorReporter() {
  window.addEventListener("error", (e) => {
    reportClientError({ message: e.message, stack: e.error?.stack });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as Record<string, unknown> | null;
    reportClientError({
      message: `unhandledrejection: ${r?.message ?? String(r)}`,
      stack: r?.stack,
    });
  });
}
