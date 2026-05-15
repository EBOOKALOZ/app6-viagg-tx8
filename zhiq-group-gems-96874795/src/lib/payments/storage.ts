/**
 * Gateway Storage Adapter
 *
 * Camada intermediária que abstrai a fonte dos dados de payment_gateways.
 *
 * FASE 1 (atual): backed por localStorage como placeholder.
 *  → Permite o admin configurar/testar a UI sem o DB schema deployado.
 * FASE 2: trocar implementação para `supabase.from('payment_gateways')`.
 *
 * O contrato externo (GatewayStorage) NÃO muda quando trocar o backend.
 */

import type {
  GatewayDescriptor,
  GatewayCredentials,
  GatewayConfig,
  GatewayMode,
  GatewayProviderCode,
} from './types';

const STORAGE_KEY = 'viagg.payment_gateways.v1';

export interface StoredGateway extends GatewayDescriptor {
  /** No DB final isso fica encriptado. Em localStorage fica plain (DEV ONLY). */
  credentials: GatewayCredentials;
  config: GatewayConfig;
}

export interface UpsertGatewayInput {
  id?: string;
  provider_code: GatewayProviderCode;
  display_name: string;
  mode: GatewayMode;
  credentials: GatewayCredentials;
  config: GatewayConfig;
}

export interface GatewayStorage {
  list(): Promise<StoredGateway[]>;
  get(id: string): Promise<StoredGateway | null>;
  upsert(input: UpsertGatewayInput): Promise<StoredGateway>;
  remove(id: string): Promise<void>;
  setActive(id: string): Promise<void>;
  getActive(): Promise<StoredGateway | null>;
}

/* ─────────── localStorage implementation (Fase 1) ─────────── */

function loadAll(): StoredGateway[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDefaults();
    const parsed = JSON.parse(raw) as StoredGateway[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seedDefaults();
    return parsed;
  } catch {
    return seedDefaults();
  }
}

function saveAll(list: StoredGateway[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function seedDefaults(): StoredGateway[] {
  const now = new Date().toISOString();
  const defaults: StoredGateway[] = [
    {
      id: 'gw_mock_default',
      provider_code: 'mock',
      display_name: 'Mock (Desenvolvimento)',
      mode: 'sandbox',
      is_active: true,
      config_preview: { auto_confirm_seconds: 0 },
      credentials: {},
      config: {
        mock_auto_confirm_seconds: 0,
        mock_force_failure: false,
      },
      created_at: now,
      updated_at: now,
    },
    {
      id: 'gw_mp_sandbox',
      provider_code: 'mercadopago',
      display_name: 'Mercado Pago (Sandbox)',
      mode: 'sandbox',
      is_active: false,
      config_preview: { has_access_token: false, has_public_key: false },
      credentials: {},
      config: {},
      created_at: now,
      updated_at: now,
    },
  ];
  saveAll(defaults);
  return defaults;
}

function maskCredentials(credentials: GatewayCredentials): Record<string, string | boolean | number | null> {
  return {
    has_access_token: Boolean(credentials.access_token),
    has_public_key: Boolean(credentials.public_key),
    has_webhook_secret: Boolean(credentials.webhook_secret),
    public_key_preview: credentials.public_key
      ? maskSecret(credentials.public_key)
      : null,
  };
}

function maskSecret(s: string): string {
  if (s.length <= 8) return '***';
  return s.slice(0, 4) + '...' + s.slice(-4);
}

export const localStorageGatewayAdapter: GatewayStorage = {
  async list(): Promise<StoredGateway[]> {
    return loadAll();
  },

  async get(id: string): Promise<StoredGateway | null> {
    return loadAll().find((g) => g.id === id) ?? null;
  },

  async upsert(input: UpsertGatewayInput): Promise<StoredGateway> {
    const all = loadAll();
    const now = new Date().toISOString();
    const existingIdx = input.id ? all.findIndex((g) => g.id === input.id) : -1;

    const upserted: StoredGateway =
      existingIdx >= 0
        ? {
            ...all[existingIdx],
            display_name: input.display_name,
            mode: input.mode,
            credentials: input.credentials,
            config: input.config,
            config_preview: maskCredentials(input.credentials),
            updated_at: now,
          }
        : {
            id:
              input.id ??
              `gw_${input.provider_code}_${Math.random().toString(36).slice(2, 8)}`,
            provider_code: input.provider_code,
            display_name: input.display_name,
            mode: input.mode,
            is_active: false,
            credentials: input.credentials,
            config: input.config,
            config_preview: maskCredentials(input.credentials),
            created_at: now,
            updated_at: now,
          };

    if (existingIdx >= 0) {
      all[existingIdx] = upserted;
    } else {
      all.push(upserted);
    }
    saveAll(all);
    return upserted;
  },

  async remove(id: string): Promise<void> {
    const all = loadAll().filter((g) => g.id !== id);
    saveAll(all);
  },

  async setActive(id: string): Promise<void> {
    const all = loadAll().map((g) => ({
      ...g,
      is_active: g.id === id,
      updated_at: g.id === id ? new Date().toISOString() : g.updated_at,
    }));
    // Bloqueio: Mock em production
    const target = all.find((g) => g.id === id);
    if (target && target.provider_code === 'mock' && target.mode === 'production') {
      throw new Error('Mock driver não pode estar ativo em produção.');
    }
    saveAll(all);
  },

  async getActive(): Promise<StoredGateway | null> {
    return loadAll().find((g) => g.is_active) ?? null;
  },
};

/* ─────────── Supabase implementation (Fase 1-DB) ─────────── */

import { supabase } from '@/integrations/supabase/client';

/**
 * Adapter que usa a tabela `payment_gateways` do Supabase.
 *
 * Em runtime detecta se a tabela existe; se não, levanta erro pra cair no
 * fallback localStorage. Quando o usuário rodar os SQLs da Fase 1-DB,
 * essa implementação passa a ser usada automaticamente.
 */
export const supabaseGatewayAdapter: GatewayStorage = {
  async list(): Promise<StoredGateway[]> {
    const { data, error } = await supabase
      .from('payment_gateways' as never)
      .select('*')
      .order('is_active', { ascending: false })
      .order('provider_code');
    if (error) throw error;
    return ((data ?? []) as unknown as Array<{
      id: string;
      provider_code: GatewayProviderCode;
      display_name: string;
      mode: GatewayMode;
      is_active: boolean;
      credentials: GatewayCredentials;
      config: GatewayConfig;
      created_at: string;
      updated_at: string;
    }>).map((row) => ({
      id: row.id,
      provider_code: row.provider_code,
      display_name: row.display_name,
      mode: row.mode,
      is_active: row.is_active,
      credentials: row.credentials ?? {},
      config: row.config ?? {},
      config_preview: maskCredentials(row.credentials ?? {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  },

  async get(id: string): Promise<StoredGateway | null> {
    const { data, error } = await supabase
      .from('payment_gateways' as never)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as {
      id: string;
      provider_code: GatewayProviderCode;
      display_name: string;
      mode: GatewayMode;
      is_active: boolean;
      credentials: GatewayCredentials;
      config: GatewayConfig;
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      provider_code: row.provider_code,
      display_name: row.display_name,
      mode: row.mode,
      is_active: row.is_active,
      credentials: row.credentials ?? {},
      config: row.config ?? {},
      config_preview: maskCredentials(row.credentials ?? {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async upsert(input: UpsertGatewayInput): Promise<StoredGateway> {
    const payload = {
      provider_code: input.provider_code,
      display_name: input.display_name,
      mode: input.mode,
      credentials: input.credentials,
      config: input.config,
    };
    const query = input.id
      ? supabase.from('payment_gateways' as never).update(payload).eq('id', input.id).select().single()
      : supabase.from('payment_gateways' as never).insert(payload).select().single();
    const { data, error } = await query;
    if (error) throw error;
    const row = data as unknown as {
      id: string;
      provider_code: GatewayProviderCode;
      display_name: string;
      mode: GatewayMode;
      is_active: boolean;
      credentials: GatewayCredentials;
      config: GatewayConfig;
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      provider_code: row.provider_code,
      display_name: row.display_name,
      mode: row.mode,
      is_active: row.is_active,
      credentials: row.credentials ?? {},
      config: row.config ?? {},
      config_preview: maskCredentials(row.credentials ?? {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('payment_gateways' as never)
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async setActive(id: string): Promise<void> {
    // Atomicidade: desativa todos, ativa o escolhido (em transação curta)
    const { error: e1 } = await supabase
      .from('payment_gateways' as never)
      .update({ is_active: false })
      .neq('id', id);
    if (e1) throw e1;
    const { error: e2 } = await supabase
      .from('payment_gateways' as never)
      .update({ is_active: true })
      .eq('id', id);
    if (e2) throw e2;
  },

  async getActive(): Promise<StoredGateway | null> {
    const { data, error } = await supabase
      .from('payment_gateways' as never)
      .select('*')
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as {
      id: string;
      provider_code: GatewayProviderCode;
      display_name: string;
      mode: GatewayMode;
      is_active: boolean;
      credentials: GatewayCredentials;
      config: GatewayConfig;
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      provider_code: row.provider_code,
      display_name: row.display_name,
      mode: row.mode,
      is_active: row.is_active,
      credentials: row.credentials ?? {},
      config: row.config ?? {},
      config_preview: maskCredentials(row.credentials ?? {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },
};

/* ─────────── Auto-detect: usa Supabase se a tabela existir, senão localStorage ─────────── */

let _detectedAdapter: GatewayStorage | null = null;
let _detectionPromise: Promise<GatewayStorage> | null = null;

async function detectAdapter(): Promise<GatewayStorage> {
  if (_detectedAdapter) return _detectedAdapter;
  if (_detectionPromise) return _detectionPromise;

  _detectionPromise = (async () => {
    try {
      // Tenta SELECT — se a tabela não existir, dá erro
      const { error } = await supabase
        .from('payment_gateways' as never)
        .select('id')
        .limit(1);
      if (error) {
        console.info('[payments] payment_gateways não disponível, usando localStorage:', error.message);
        _detectedAdapter = localStorageGatewayAdapter;
      } else {
        console.info('[payments] usando Supabase para gateways');
        _detectedAdapter = supabaseGatewayAdapter;
      }
    } catch (e) {
      console.warn('[payments] erro detectando adapter, usando localStorage:', e);
      _detectedAdapter = localStorageGatewayAdapter;
    }
    return _detectedAdapter;
  })();

  return _detectionPromise;
}

/**
 * Storage que adapta automaticamente: se a tabela payment_gateways existir
 * no Supabase, usa ela. Senão, cai pro localStorage.
 *
 * Para forçar um adapter específico, importe diretamente:
 *   - supabaseGatewayAdapter
 *   - localStorageGatewayAdapter
 */
export const gatewayStorage: GatewayStorage = {
  async list() {
    return (await detectAdapter()).list();
  },
  async get(id) {
    return (await detectAdapter()).get(id);
  },
  async upsert(input) {
    return (await detectAdapter()).upsert(input);
  },
  async remove(id) {
    return (await detectAdapter()).remove(id);
  },
  async setActive(id) {
    return (await detectAdapter()).setActive(id);
  },
  async getActive() {
    return (await detectAdapter()).getActive();
  },
};
