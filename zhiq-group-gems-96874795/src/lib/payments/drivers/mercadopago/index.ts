/**
 * Mercado Pago Driver — Fase 2 (implementação real)
 *
 * Cobre:
 *  - charge() PIX        → POST /v1/payments (payment_method_id=pix) → QR + copia-e-cola
 *  - charge() cartão     → POST /checkout/preferences (Checkout Pro) → init_point
 *  - payout() PIX out    → POST /v1/payments (money out — gated na conta MP)
 *  - refund()            → POST /v1/payments/{id}/refunds (total e parcial)
 *  - getTransactionStatus→ GET /v1/payments/{id}
 *  - validateWebhook()   → HMAC SHA256 do header x-signature + GET payment p/ status
 *  - testConnection()    → GET /users/me
 *
 * Ambiente-agnóstico: usa `fetch` global e Web Crypto (`crypto.subtle`),
 * disponíveis no browser (orchestrator Fase 1) e no Deno (Edge Function P3).
 *
 * ⚠️ Segurança: hoje o orchestrator chama este driver no browser, expondo
 * `access_token`. Isso é herança da Fase 1 — a Prioridade 4 (Vault + Edge
 * Function) move credenciais e charge/payout pro backend. NÃO confiar neste
 * driver no client em produção até P4.
 *
 * Credenciais (ctx.credentials):
 *  - access_token   (TEST-... sandbox | APP_USR-... produção)
 *  - public_key     (tokenização client-side — não usado no Checkout Pro)
 *  - webhook_secret  (assinatura de webhook, painel MP → Webhooks)
 */

import type {
  ChargeParams,
  ChargeResult,
  ChargeStatus,
  PayoutParams,
  PayoutResult,
  PayoutStatus,
  RefundParams,
  RefundResult,
  TransactionStatusResult,
  WebhookValidationParams,
  WebhookValidationResult,
  NormalizedWebhookEvent,
  PaymentProvider,
  ProviderContext,
} from '../../types';

const MP_API = 'https://api.mercadopago.com';

/* ─────────── Helpers ─────────── */

class MpConfigError extends Error {}

function accessToken(ctx: ProviderContext): string {
  const token = ctx.credentials.access_token?.trim();
  if (!token) {
    throw new MpConfigError(
      'access_token não configurado em payment_gateways.credentials.',
    );
  }
  return token;
}

/** MP usa valor na moeda (reais, 2 casas), não centavos. */
function toAmount(cents: number): number {
  return Math.round(cents) / 100;
}

interface MpResponse<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  body: T;
}

async function mpFetch<T = Record<string, unknown>>(
  ctx: ProviderContext,
  path: string,
  init: {
    method: 'GET' | 'POST';
    body?: unknown;
    idempotencyKey?: string;
  },
): Promise<MpResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken(ctx)}`,
    'Content-Type': 'application/json',
  };
  if (init.idempotencyKey) {
    headers['X-Idempotency-Key'] = init.idempotencyKey;
  }

  const res = await fetch(`${MP_API}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  let body: unknown = {};
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
  }

  return { ok: res.ok, status: res.status, body: body as T };
}

/** Mensagem de erro legível a partir do corpo de erro do MP. */
function mpErrorMessage(status: number, body: Record<string, unknown>): string {
  const message =
    (body?.message as string) ||
    (body?.error as string) ||
    'Erro desconhecido no Mercado Pago.';
  const causes = Array.isArray(body?.cause)
    ? (body.cause as Array<{ description?: string; code?: string | number }>)
        .map((c) => c.description ?? c.code)
        .filter(Boolean)
        .join('; ')
    : '';
  return causes ? `MP ${status}: ${message} (${causes})` : `MP ${status}: ${message}`;
}

/**
 * Status de pagamento do MP → ChargeStatus.
 * Ref: https://www.mercadopago.com.br/developers — payment.status
 */
function mapMpPaymentStatus(mpStatus: string): ChargeStatus {
  switch (mpStatus) {
    case 'approved':
      return 'paid';
    case 'authorized':
      return 'authorized';
    case 'pending':
    case 'in_process':
    case 'in_mediation':
      return 'pending';
    case 'rejected':
      return 'failed';
    case 'cancelled':
      return 'expired'; // PIX/boleto não pago expira → MP marca cancelled
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    default:
      return 'pending';
  }
}

function payerFromParams(params: ChargeParams): Record<string, unknown> {
  const meta = params.metadata ?? {};
  // MP valida o e-mail e rejeita TLDs inválidos (ex.: `.local`). O fallback
  // precisa de formato válido; o e-mail real deve vir em metadata.payer_email.
  const email =
    (meta.payer_email as string) ||
    `usuario-${params.payer_user_id}@viagg.com.br`;
  return {
    email,
    first_name: (meta.payer_first_name as string) || 'Cliente',
    ...(meta.payer_doc
      ? {
          identification: {
            type: (meta.payer_doc_type as string) || 'CPF',
            number: meta.payer_doc as string,
          },
        }
      : {}),
  };
}

/* ─────────── HMAC (x-signature) ─────────── */

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Parse "ts=1700000000,v1=abc..." → { ts, v1 } */
function parseSignatureHeader(
  header: string | null,
): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts: Record<string, string> = {};
  for (const seg of header.split(',')) {
    const idx = seg.indexOf('=');
    if (idx === -1) continue;
    parts[seg.slice(0, idx).trim()] = seg.slice(idx + 1).trim();
  }
  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1 };
}

/* ─────────── Driver ─────────── */

export const mercadopagoDriver: PaymentProvider = {
  code: 'mercadopago',

  async charge(
    params: ChargeParams,
    ctx: ProviderContext,
  ): Promise<ChargeResult> {
    try {
      if (params.method === 'pix') {
        return await chargePix(params, ctx);
      }
      if (params.method === 'credit_card' || params.method === 'debit_card') {
        return await chargeCheckoutPro(params, ctx);
      }
      if (params.method === 'boleto') {
        return await chargeCheckoutPro(params, ctx);
      }
      return {
        charge_id: '',
        external_id: null,
        status: 'failed',
        error_message: `Método ${params.method} não suportado pelo driver Mercado Pago.`,
      };
    } catch (e) {
      return {
        charge_id: '',
        external_id: null,
        status: 'failed',
        error_message:
          e instanceof Error ? e.message : 'Erro inesperado na cobrança.',
      };
    }
  },

  async payout(
    params: PayoutParams,
    ctx: ProviderContext,
  ): Promise<PayoutResult> {
    try {
      // PIX out no MP exige a conta habilitada para "money out"/disbursements.
      // O endpoint mais portável é POST /v1/payments com transação de saída;
      // contas sem o produto retornam 403/4xx — devolvemos erro estruturado.
      const body = {
        transaction_amount: toAmount(params.amount.amount_cents),
        description: params.description,
        payment_method_id: 'pix',
        external_reference: `payout:${params.recipient_user_id}`,
        // Beneficiário do PIX out.
        additional_info: {
          payer: {
            first_name: params.expected_holder_name ?? undefined,
          },
        },
        payer: {
          type: 'bank_transfer',
          entity_type: params.pix_key_type === 'cnpj' ? 'association' : 'individual',
          identification: {
            type: params.pix_key_type === 'cnpj' ? 'CNPJ' : 'CPF',
            number: params.pix_key,
          },
        },
      };

      const res = await mpFetch(ctx, '/v1/payments', {
        method: 'POST',
        body,
        idempotencyKey: params.idempotency_key,
      });

      if (!res.ok) {
        return {
          payout_id: '',
          external_id: null,
          status: 'failed',
          error_message:
            res.status === 403 || res.status === 401
              ? 'Conta Mercado Pago não habilitada para PIX out (money out/disbursements). Solicite a habilitação no painel MP.'
              : mpErrorMessage(res.status, res.body),
        };
      }

      const b = res.body as Record<string, unknown>;
      const mpId = String(b.id ?? '');
      const status: PayoutStatus =
        b.status === 'approved'
          ? 'paid'
          : b.status === 'pending' || b.status === 'in_process'
            ? 'processing'
            : b.status === 'rejected'
              ? 'rejected'
              : 'pending';

      return {
        payout_id: mpId,
        external_id: mpId,
        status,
        end_to_end_id:
          ((b.point_of_interaction as Record<string, unknown>)
            ?.transaction_data as Record<string, unknown>)?.[
            'transaction_id'
          ] as string | undefined,
      };
    } catch (e) {
      return {
        payout_id: '',
        external_id: null,
        status: 'failed',
        error_message:
          e instanceof Error ? e.message : 'Erro inesperado no saque.',
      };
    }
  },

  async refund(
    params: RefundParams,
    ctx: ProviderContext,
  ): Promise<RefundResult> {
    try {
      // Estorno total: body vazio. Parcial: { amount }.
      const isPartial = params.amount.amount_cents > 0;
      const res = await mpFetch(
        ctx,
        `/v1/payments/${encodeURIComponent(params.original_charge_id)}/refunds`,
        {
          method: 'POST',
          body: isPartial
            ? { amount: toAmount(params.amount.amount_cents) }
            : {},
          idempotencyKey: params.idempotency_key,
        },
      );

      if (!res.ok) {
        return {
          refund_id: '',
          external_id: null,
          status: 'failed',
          error_message: mpErrorMessage(res.status, res.body),
        };
      }

      const b = res.body as Record<string, unknown>;
      const refundId = String(b.id ?? '');
      const status =
        b.status === 'approved'
          ? 'processed'
          : b.status === 'in_process' || b.status === 'pending'
            ? 'pending'
            : 'failed';

      return {
        refund_id: refundId,
        external_id: refundId,
        status: status as RefundResult['status'],
        ...(status === 'failed'
          ? { error_message: `Estorno MP em estado ${String(b.status)}.` }
          : {}),
      };
    } catch (e) {
      return {
        refund_id: '',
        external_id: null,
        status: 'failed',
        error_message:
          e instanceof Error ? e.message : 'Erro inesperado no estorno.',
      };
    }
  },

  async getTransactionStatus(
    external_id: string,
    ctx: ProviderContext,
  ): Promise<TransactionStatusResult> {
    const res = await mpFetch(
      ctx,
      `/v1/payments/${encodeURIComponent(external_id)}`,
      { method: 'GET' },
    );
    const b = res.body as Record<string, unknown>;
    return {
      external_id,
      status: res.ok
        ? mapMpPaymentStatus(String(b.status ?? 'pending'))
        : 'pending',
      raw: b,
    };
  },

  async validateWebhook(
    params: WebhookValidationParams,
    ctx: ProviderContext,
  ): Promise<WebhookValidationResult> {
    const secret = ctx.credentials.webhook_secret?.trim();
    if (!secret) {
      return { valid: false, error: 'webhook_secret não configurado.' };
    }

    const parsed = parseSignatureHeader(params.signature_header);
    if (!parsed) {
      return { valid: false, error: 'Header x-signature ausente ou inválido.' };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(params.raw_body) as Record<string, unknown>;
    } catch {
      return { valid: false, error: 'Body do webhook não é JSON válido.' };
    }

    // MP envia o id do recurso em data.id (body) ou ?data.id (query).
    const dataId =
      ((payload.data as Record<string, unknown>)?.id as string | undefined) ??
      (payload.id as string | undefined);
    const requestId =
      params.headers['x-request-id'] ?? params.headers['X-Request-Id'] ?? '';

    // Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
    // Partes ausentes são omitidas (mantém ';' do que existe).
    let manifest = '';
    if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
    if (requestId) manifest += `request-id:${requestId};`;
    manifest += `ts:${parsed.ts};`;

    const expected = await hmacSha256Hex(secret, manifest);
    if (expected !== parsed.v1) {
      return { valid: false, error: 'Assinatura HMAC não confere.' };
    }

    // Assinatura OK. Resolve o status real consultando o pagamento.
    const topic =
      (payload.type as string) ||
      (payload.topic as string) ||
      (payload.action as string) ||
      'unknown';

    let eventType: NormalizedWebhookEvent['event_type'] = 'unknown';
    let externalId = String(dataId ?? '');
    let occurredAt =
      (payload.date_created as string) ?? new Date().toISOString();

    if (topic.startsWith('payment') && dataId) {
      const status = await this.getTransactionStatus(String(dataId), ctx);
      externalId = String(dataId);
      switch (status.status) {
        case 'paid':
          eventType = 'charge.paid';
          break;
        case 'refunded':
          eventType = 'charge.refunded';
          break;
        case 'expired':
          eventType = 'charge.expired';
          break;
        case 'failed':
          eventType = 'charge.failed';
          break;
        default:
          eventType = 'unknown';
      }
      const rawDate = (status.raw as Record<string, unknown>)
        ?.date_last_updated as string | undefined;
      if (rawDate) occurredAt = rawDate;
    }

    return {
      valid: true,
      event: {
        event_type: eventType,
        external_id: externalId,
        occurred_at: occurredAt,
        raw_payload: payload,
      },
    };
  },

  async testConnection(
    ctx: ProviderContext,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      accessToken(ctx);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    try {
      const res = await mpFetch(ctx, '/users/me', { method: 'GET' });
      if (!res.ok) {
        return { ok: false, error: mpErrorMessage(res.status, res.body) };
      }
      const b = res.body as Record<string, unknown>;
      const liveToken = ctx.credentials.access_token?.startsWith('APP_USR');
      if (ctx.mode === 'production' && !liveToken) {
        return {
          ok: false,
          error:
            'Gateway em produção mas access_token é de teste (TEST-...). Use credenciais APP_USR-...',
        };
      }
      if (ctx.mode === 'sandbox' && liveToken) {
        return {
          ok: false,
          error:
            'Gateway em sandbox mas access_token é de produção (APP_USR-...). Use credenciais TEST-...',
        };
      }
      return {
        ok: true,
        error: `Conectado como ${String(b.nickname ?? b.id ?? 'conta MP')}.`,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Falha ao conectar no MP.',
      };
    }
  },
};

/* ─────────── charge: PIX ─────────── */

async function chargePix(
  params: ChargeParams,
  ctx: ProviderContext,
): Promise<ChargeResult> {
  const expiresMin = Number(
    (params.metadata?.pix_expires_minutes as number) ?? 30,
  );
  const expiresAt = new Date(Date.now() + expiresMin * 60 * 1000);

  const body = {
    transaction_amount: toAmount(params.amount.amount_cents),
    description: params.description,
    payment_method_id: 'pix',
    external_reference: `${params.reference_type}:${params.reference_id}`,
    date_of_expiration: expiresAt.toISOString(),
    ...(ctx.config.webhook_url
      ? { notification_url: ctx.config.webhook_url }
      : {}),
    payer: payerFromParams(params),
    metadata: {
      service_type: params.service_type,
      payer_user_id: params.payer_user_id,
      ...(params.metadata ?? {}),
    },
  };

  const res = await mpFetch(ctx, '/v1/payments', {
    method: 'POST',
    body,
    idempotencyKey: params.idempotency_key,
  });

  if (!res.ok) {
    return {
      charge_id: '',
      external_id: null,
      status: 'failed',
      error_message: mpErrorMessage(res.status, res.body),
    };
  }

  const b = res.body as Record<string, unknown>;
  const mpId = String(b.id ?? '');
  const txData = (b.point_of_interaction as Record<string, unknown>)
    ?.transaction_data as Record<string, unknown> | undefined;

  return {
    charge_id: mpId,
    external_id: mpId,
    status: mapMpPaymentStatus(String(b.status ?? 'pending')),
    payment_payload: {
      pix_qr_base64: txData?.qr_code_base64 as string | undefined,
      pix_copy_paste: txData?.qr_code as string | undefined,
    },
    expires_at:
      (b.date_of_expiration as string | undefined) ?? expiresAt.toISOString(),
  };
}

/* ─────────── charge: Checkout Pro (cartão/boleto) ─────────── */

async function chargeCheckoutPro(
  params: ChargeParams,
  ctx: ProviderContext,
): Promise<ChargeResult> {
  const meta = params.metadata ?? {};
  const body = {
    items: [
      {
        title: params.description,
        quantity: 1,
        unit_price: toAmount(params.amount.amount_cents),
        currency_id: 'BRL',
      },
    ],
    external_reference: `${params.reference_type}:${params.reference_id}`,
    payer: { email: (meta.payer_email as string) || undefined },
    ...(ctx.config.webhook_url
      ? { notification_url: ctx.config.webhook_url }
      : {}),
    ...(meta.back_url
      ? {
          back_urls: {
            success: meta.back_url as string,
            failure: meta.back_url as string,
            pending: meta.back_url as string,
          },
          auto_return: 'approved',
        }
      : {}),
    payment_methods:
      params.method === 'boleto'
        ? { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }] }
        : { excluded_payment_types: [{ id: 'ticket' }] },
  };

  const res = await mpFetch(ctx, '/checkout/preferences', {
    method: 'POST',
    body,
    idempotencyKey: params.idempotency_key,
  });

  if (!res.ok) {
    return {
      charge_id: '',
      external_id: null,
      status: 'failed',
      error_message: mpErrorMessage(res.status, res.body),
    };
  }

  const b = res.body as Record<string, unknown>;
  const prefId = String(b.id ?? '');
  const checkoutUrl =
    ctx.mode === 'production'
      ? (b.init_point as string)
      : (b.sandbox_init_point as string) ?? (b.init_point as string);

  // O pagamento real só existe quando o cliente paga; reconciliação via
  // external_reference no webhook (P3). Aqui devolvemos pending + URL.
  return {
    charge_id: prefId,
    external_id: prefId,
    status: 'pending',
    payment_payload: { checkout_url: checkoutUrl },
  };
}

export default mercadopagoDriver;
