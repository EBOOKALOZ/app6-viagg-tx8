/**
 * mp-gateway-resolver — fonte única de credenciais Mercado Pago (FASE 1).
 *
 * Ordem de resolução (por campo):
 *  1. Config nova: RPC mp_get_gateway_credentials (Vault, ambiente ativo em
 *     mp_gateway_config) — service_role only.
 *  2. Variáveis de ambiente: MP_SANDBOX_* / MP_PROD_* conforme o ambiente.
 *  3. Legado: payment_gateways (linha ativa) — comportamento idêntico ao
 *     anterior, garantindo zero quebra enquanto a config nova estiver vazia.
 *
 * O ambiente vem de mp_gateway_config.active_environment; sem config nova,
 * cai no `mode` da linha legada (como hoje).
 */

// deno-lint-ignore-file no-explicit-any

export interface MpGatewayCreds {
  access_token?: string;
  public_key?: string;
  webhook_secret?: string;
  client_id?: string;
  client_secret?: string;
  user_id?: string;
  application_id?: string;
}

export interface ResolvedMpGateway {
  provider_code: "mercadopago";
  environment: "sandbox" | "production";
  sandbox: boolean;
  credentials: MpGatewayCreds;
  webhook_url?: string;
  /** de onde veio o access_token: mp_config | env | legacy */
  source: "mp_config" | "env" | "legacy";
}

export type ResolveResult =
  | { ok: true; gw: ResolvedMpGateway }
  | { ok: false; error: string };

const FIELDS: Array<keyof MpGatewayCreds> = [
  "access_token",
  "public_key",
  "webhook_secret",
  "client_id",
  "client_secret",
  "user_id",
  "application_id",
];

/** Sufixo da env var por campo (APP_ID abrevia application_id, conforme spec). */
const ENV_SUFFIX: Record<string, string> = {
  access_token: "ACCESS_TOKEN",
  public_key: "PUBLIC_KEY",
  webhook_secret: "WEBHOOK_SECRET",
  client_id: "CLIENT_ID",
  client_secret: "CLIENT_SECRET",
  user_id: "USER_ID",
  application_id: "APP_ID",
};

function envPrefix(environment: "sandbox" | "production"): string {
  return environment === "production" ? "MP_PROD" : "MP_SANDBOX";
}

function fromEnv(environment: "sandbox" | "production"): MpGatewayCreds {
  const out: MpGatewayCreds = {};
  const prefix = envPrefix(environment);
  for (const f of FIELDS) {
    const v = Deno.env.get(`${prefix}_${ENV_SUFFIX[f]}`);
    if (v && v.trim()) out[f] = v.trim();
  }
  return out;
}

/**
 * Resolve o gateway MP para as edge functions.
 * `svc` = supabase client com SERVICE_ROLE.
 * `opts.environment` força um ambiente (usado pelo teste de conexão).
 */
export async function resolveMpGateway(
  svc: any,
  opts?: { environment?: "sandbox" | "production" },
): Promise<ResolveResult> {
  let environment: "sandbox" | "production" | null = opts?.environment ?? null;
  let creds: MpGatewayCreds = {};
  let webhookUrl: string | undefined;
  let source: ResolvedMpGateway["source"] = "legacy";

  // 1. Config nova (Vault). Tolerante: RPC ausente (migration não rodada) → segue.
  try {
    const { data, error } = await svc.rpc("mp_get_gateway_credentials", {
      p_environment: environment,
    });
    if (!error && data && typeof data === "object") {
      const d = data as {
        environment?: string;
        webhook_url?: string;
        credentials?: MpGatewayCreds;
        configured?: boolean;
      };
      if (d.environment === "sandbox" || d.environment === "production") {
        environment = d.environment;
      }
      webhookUrl = d.webhook_url ?? undefined;
      if (d.credentials && typeof d.credentials === "object") {
        creds = { ...d.credentials };
      }
      if (creds.access_token) source = "mp_config";
    }
  } catch (_e) {
    // migration ainda não aplicada — segue para env/legado
  }

  // 2. Env vars completam campos ausentes (precisa saber o ambiente).
  if (environment) {
    const env = fromEnv(environment);
    for (const f of FIELDS) {
      if (!creds[f] && env[f]) creds[f] = env[f];
    }
    if (!webhookUrl) {
      const wu = Deno.env.get(`${envPrefix(environment)}_WEBHOOK_URL`);
      if (wu && wu.trim()) webhookUrl = wu.trim();
    }
    if (creds.access_token && source !== "mp_config") source = "env";
  }

  // 3. Legado payment_gateways — comportamento atual, intacto.
  if (!creds.access_token) {
    const { data: gw, error: gwErr } = await svc
      .from("payment_gateways")
      .select("provider_code, mode, credentials, config, is_active")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (gwErr || !gw) {
      return { ok: false, error: "nenhum gateway ativo" };
    }
    if (gw.provider_code !== "mercadopago") {
      return {
        ok: false,
        error: `gateway ativo é ${gw.provider_code}; esta função só faz mercadopago`,
      };
    }
    const legacy = (gw.credentials ?? {}) as MpGatewayCreds;
    for (const f of FIELDS) {
      if (!creds[f] && legacy[f]) creds[f] = legacy[f];
    }
    if (!environment) {
      environment = gw.mode === "production" ? "production" : "sandbox";
      // com o ambiente conhecido, env vars ainda podem completar campos
      const env = fromEnv(environment);
      for (const f of FIELDS) {
        if (!creds[f] && env[f]) creds[f] = env[f];
      }
    }
    if (!webhookUrl) {
      const cfg = (gw.config ?? {}) as Record<string, unknown>;
      if (typeof cfg.webhook_url === "string" && cfg.webhook_url) {
        webhookUrl = cfg.webhook_url;
      }
    }
    source = "legacy";
  }

  if (!environment) environment = "sandbox";
  if (!creds.access_token) {
    return { ok: false, error: "gateway sem access_token" };
  }

  return {
    ok: true,
    gw: {
      provider_code: "mercadopago",
      environment,
      sandbox: environment === "sandbox",
      credentials: creds,
      webhook_url: webhookUrl,
      source,
    },
  };
}

/**
 * Validação HMAC do x-signature do Mercado Pago (mesmo manifest do
 * payments-webhook/mp.ts). Retorna {valid} + dados úteis do header.
 */
export async function mpValidateSignatureHeader(
  webhookSecret: string,
  rawBody: string,
  signatureHeader: string | null,
  requestId: string | null,
  urlDataId?: string | null,
): Promise<{ valid: boolean; error?: string }> {
  if (!signatureHeader) return { valid: false, error: "sem x-signature" };
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  ) as Record<string, string>;
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return { valid: false, error: "x-signature malformado" };

  let dataId = urlDataId ?? null;
  if (!dataId) {
    try {
      const body = JSON.parse(rawBody) as Record<string, any>;
      dataId = String(body?.data?.id ?? body?.resource ?? "");
    } catch {
      dataId = "";
    }
  }
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${
    requestId ?? ""
  };ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === v1
    ? { valid: true }
    : { valid: false, error: "assinatura inválida" };
}
