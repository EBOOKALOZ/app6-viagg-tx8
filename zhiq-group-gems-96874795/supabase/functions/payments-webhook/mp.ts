const MP_API = "https://api.mercadopago.com";
export interface MpCreds { access_token: string; public_key?: string; webhook_secret?: string; }
async function mpFetch(creds: MpCreds, path: string, init: { method: "GET"|"POST"; body?: unknown; idempotencyKey?: string }): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers: Record<string,string> = { Authorization: `Bearer ${creds.access_token}`, "Content-Type": "application/json" };
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${MP_API}${path}`, { method: init.method, headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  let body: Record<string, unknown> = {};
  const text = await res.text();
  if (text) { try { body = JSON.parse(text); } catch { body = { _raw: text }; } }
  return { ok: res.ok, status: res.status, body };
}
export async function mpGetPaymentStatus(creds: MpCreds, paymentId: string): Promise<{ status: string; raw: Record<string, unknown> }> {
  const res = await mpFetch(creds, `/v1/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
  return { status: res.ok ? String(res.body.status ?? "pending") : "pending", raw: res.body };
}
export function mpStatusToEvent(s: string): "charge.paid"|"charge.failed"|"charge.expired"|"charge.refunded"|"unknown" {
  switch (s) { case "approved": return "charge.paid"; case "rejected": return "charge.failed"; case "cancelled": return "charge.expired"; case "refunded": case "charged_back": return "charge.refunded"; default: return "unknown"; }
}
async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export interface WebhookResult { valid: boolean; error?: string; data_id?: string; topic?: string; raw?: Record<string, unknown>; }
export async function mpValidateWebhook(secret: string|undefined, rawBody: string, signatureHeader: string|null, requestId: string|null): Promise<WebhookResult> {
  if (!secret) return { valid: false, error: "webhook_secret não configurado" };
  if (!signatureHeader) return { valid: false, error: "x-signature ausente" };
  const parts: Record<string,string> = {};
  for (const segm of signatureHeader.split(",")) { const i = segm.indexOf("="); if (i>-1) parts[segm.slice(0,i).trim()] = segm.slice(i+1).trim(); }
  if (!parts.ts || !parts.v1) return { valid: false, error: "x-signature malformado" };
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); } catch { return { valid: false, error: "body não é JSON" }; }
  const dataId = (payload.data as Record<string, unknown>)?.id as string ?? (payload.id as string | undefined);
  let manifest = "";
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = await hmacHex(secret, manifest);
  if (expected !== parts.v1) return { valid: false, error: "assinatura HMAC não confere" };
  return { valid: true, data_id: dataId ? String(dataId) : undefined, topic: (payload.type as string) || (payload.topic as string) || (payload.action as string) || "unknown", raw: payload };
}
