/**
 * Supabase Client with Fallback Protection
 *
 * This file provides the Supabase client for the entire application.
 * It includes fallback values to prevent crashes when environment variables
 * are not properly injected by the build system.
 *
 * IMPORTANT: The fallback values are the Lovable Cloud credentials for this project.
 * The anon key is a PUBLIC key and is safe to include in client-side code.
 *
 * TIMEOUT DE REDE (ORION-480 achado A-5)
 * ---------------------------------------
 * O cliente era criado sem `global.fetch` customizado, o que deixava toda
 * requisição (auth, PostgREST, RPC, Storage) sujeita ao timeout implícito do
 * navegador — que pode ser muito longo ou inexistente, deixando a UI
 * pendurada indefinidamente em rede degradada.
 *
 * O único timeout que já existia no projeto (src/dashboards/core/api.ts) é
 * "soft": usa Promise.race para abandonar a Promise do lado do chamador, mas
 * NÃO cancela o fetch real — o request HTTP segue em voo, consumindo
 * conexão/socket, podendo inclusive completar e gravar em cache depois que o
 * chamador já desistiu.
 *
 * A correção abaixo passa um `fetch` customizado via `global.fetch` (opção
 * suportada desde supabase-js v2, confirmada na v2.89.0 instalada). Esse
 * fetch usa AbortController para abortar de fato a conexão de rede quando o
 * timeout expira, e é aplicado a `this.fetch` internamente, reaproveitado
 * por PostgREST (`rest`), Storage e Functions — cobrindo as ~140+ chamadas
 * existentes sem precisar editar cada call site. NÃO cobre o Realtime
 * (websocket): `_initRealtimeClient` constrói o RealtimeClient com sua
 * própria URL/transporte e nunca recebe `this.fetch` (ver
 * node_modules/@supabase/supabase-js/dist/index.mjs, método
 * `_initRealtimeClient` — só repassa `headers` e `accessToken`).
 *
 * Storage recebe um timeout maior que queries/RPC: nem todo upload no
 * projeto passa por compressão client-side (ex: src/hooks/useCompressedImageUpload.ts
 * comprime para ~100KB, mas src/components/driver/DocumentUpload.tsx e
 * outros ~10 call sites de `.storage.from(...).upload(...)` enviam o arquivo
 * bruto — que pode ser um PDF ou foto em alta resolução de vários MB). A
 * diferenciação é por padrão de URL (`/storage/v1/`), já que o SDK não expõe
 * metadado "isto é upload" no nível de fetch. LIMITAÇÃO CONHECIDA: dentro do
 * Storage não há como diferenciar, só pela URL, um upload pesado de uma
 * operação leve (getPublicUrl, remove, list) — todas recebem o mesmo teto
 * maior. Isso é deliberadamente conservador (evita heurística frágil por
 * tamanho de payload, que o wrapper de fetch não tem como inspecionar sem
 * bufferizar o body) e não corrige uploads que hoje já são lentos por outros
 * motivos; é apenas a rede sendo tratada, não o volume de dados.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const getEnv = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as any)[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

export const SUPABASE_URL = getEnv("VITE_SUPABASE_URL") || "https://broifhfqmnzqoongtokm.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = getEnv("VITE_SUPABASE_PUBLISHABLE_KEY") || getEnv("VITE_SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8";

if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  console.log('[Supabase] Initializing client:', {
    url: SUPABASE_URL.substring(0, 40) + '...',
    usingEnvUrl: Boolean(getEnv("VITE_SUPABASE_URL")),
    usingEnvKey: Boolean(SUPABASE_PUBLISHABLE_KEY)
  });
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

/**
 * Timeout REAL (aborta a requisição de fato) aplicado a toda chamada feita
 * pelo cliente Supabase compartilhado — REST (PostgREST), Storage, Auth e
 * Functions. Isso NÃO afeta o Realtime (websocket): o supabase-js constrói o
 * RealtimeClient com sua própria URL/transporte e nunca recebe `global.fetch`
 * (ver node_modules/@supabase/supabase-js SupabaseClient — `_initRealtimeClient`
 * não repassa `this.fetch`).
 *
 * 20s cobre com folga queries e RPCs comuns (SELECT/insert/update pequenos,
 * chamadas de função). Requisições de Storage (upload/download de arquivo)
 * recebem um teto maior (90s) porque nem todo upload é pré-comprimido no
 * cliente — ver nota no cabeçalho do arquivo.
 *
 * Antes só existia timeout "soft" via Promise.race em src/dashboards/core/api.ts,
 * que não cancelava o fetch real — a requisição perdedora da race continuava
 * rodando em segundo plano, prendendo conexão/socket até o navegador desistir.
 */
const SUPABASE_FETCH_TIMEOUT_MS = 20_000;
const SUPABASE_STORAGE_FETCH_TIMEOUT_MS = 90_000;

function isStorageRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.includes('/storage/v1/');
}

const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeoutMs = isStorageRequest(input) ? SUPABASE_STORAGE_FETCH_TIMEOUT_MS : SUPABASE_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Se o chamador já passou um signal (ex: cancelamento de request-scoped),
  // respeita o abort dele também — o primeiro a disparar vence.
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
