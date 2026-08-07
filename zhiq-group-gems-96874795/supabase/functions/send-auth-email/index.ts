import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Configuração SMTP
const smtpHost = Deno.env.get("SMTP_HOST") || "";
const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
const smtpUser = Deno.env.get("SMTP_USER") || "";
const smtpPass = Deno.env.get("SMTP_PASS") || "";
const smtpFrom = Deno.env.get("SMTP_FROM") || "";

// 🔐 Secret do Auth Hook (API_CLIENT_SECRET)
const CLIENT_SECRET = Deno.env.get("API_CLIENT_SECRET");
if (!CLIENT_SECRET) {
  throw new Error("API_CLIENT_SECRET não configurado nos Secrets do Supabase");
}

console.log("API_CLIENT_SECRET OK?", !!CLIENT_SECRET);

// ---------------------------------------------------------------------------
// Verificação do chamador (Supabase Auth "Send Email" Hook)
//
// O GoTrue chama este endpoint HTTP como um Auth Hook. Quando um secret é
// configurado no Dashboard (Auth > Hooks), o GoTrue assina a requisição no
// formato Standard Webhooks (https://www.standardwebhooks.com/), enviando os
// headers `webhook-id`, `webhook-timestamp` e `webhook-signature`
// (`v1,<base64 hmac-sha256>` sobre `"{id}.{timestamp}.{body}"`, usando o
// secret no formato `whsec_<base64>`).
//
// Esta função aceita esse contrato oficial. Como fallback — para não quebrar
// caso o secret configurado no Dashboard não siga o formato `whsec_...`
// (o `API_CLIENT_SECRET` já provisionado neste projeto é uma string simples,
// não um `whsec_...`) — também aceita um header simples `x-client-secret`
// comparado byte-a-byte contra `API_CLIENT_SECRET` via HMAC (constant-time).
// Qualquer requisição sem um dos dois provada é rejeitada com 401 antes de
// qualquer processamento do payload ou envio de e-mail.
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();

/** Importa o secret cru como chave HMAC-SHA256 para uso com crypto.subtle. */
async function importHmacKey(rawSecret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawSecret as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Decodifica base64 padrão para bytes. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Verifica a assinatura Standard Webhooks enviada pelo GoTrue.
 * Retorna true somente se a assinatura bater com alguma das versões `v1`
 * presentes no header (comparação feita via crypto.subtle.verify, que é
 * constant-time em relação ao MAC).
 */
async function verifyStandardWebhookSignature(
  webhookId: string,
  webhookTimestamp: string,
  webhookSignatureHeader: string,
  rawBody: string,
  secret: string,
): Promise<boolean> {
  // Secret no formato Standard Webhooks: "whsec_<base64>". Se não tiver o
  // prefixo, trata a string inteira como o material codificado em base64;
  // se não for base64 válido, usa os bytes UTF-8 crus como fallback.
  const secretMaterial = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;

  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(secretMaterial);
  } catch {
    keyBytes = textEncoder.encode(secretMaterial);
  }

  const key = await importHmacKey(keyBytes);
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expectedMac = await crypto.subtle.sign("HMAC", key, textEncoder.encode(signedContent));

  // webhook-signature pode conter múltiplas assinaturas espaço-separadas,
  // cada uma no formato "v1,<base64>".
  const candidates = webhookSignatureHeader.split(" ").filter(Boolean);
  for (const candidate of candidates) {
    const [version, sig] = candidate.split(",");
    if (version !== "v1" || !sig) continue;
    let sigBytes: Uint8Array;
    try {
      sigBytes = base64ToBytes(sig);
    } catch {
      continue;
    }
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, textEncoder.encode(signedContent));
    if (valid) return true;
    // fallback redundante (crypto.subtle.verify já é o caminho correto,
    // mas comparamos o MAC calculado também por robustez de runtime)
    if (sigBytes.length === new Uint8Array(expectedMac).length) {
      let diff = 0;
      const expected = new Uint8Array(expectedMac);
      for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ sigBytes[i];
      if (diff === 0) return true;
    }
  }
  return false;
}

/**
 * Compara duas strings em tempo constante usando HMAC-SHA256 sobre uma
 * chave efêmera aleatória (evita early-exit de comparação char-a-char).
 * Usado apenas no fallback de header simples (x-client-secret).
 */
async function constantTimeStringEqual(a: string, b: string): Promise<boolean> {
  const randomKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await importHmacKey(randomKeyBytes);
  const macA = await crypto.subtle.sign("HMAC", key, textEncoder.encode(a));
  const macB = await crypto.subtle.sign("HMAC", key, textEncoder.encode(b));
  const bytesA = new Uint8Array(macA);
  const bytesB = new Uint8Array(macB);
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

/**
 * Autentica a requisição recebida contra API_CLIENT_SECRET.
 * Tenta primeiro o contrato oficial do Auth Hook (Standard Webhooks);
 * cai para o header simples `x-client-secret` se os headers de assinatura
 * não estiverem presentes.
 */
async function verifyCallerAuthenticity(req: Request, rawBody: string): Promise<boolean> {
  const webhookId = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");

  if (webhookId && webhookTimestamp && webhookSignature) {
    // Rejeita timestamps fora de uma janela de 5 minutos (proteção básica
    // contra replay), igual à tolerância padrão do Standard Webhooks.
    const ts = Number(webhookTimestamp);
    if (!Number.isFinite(ts)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - ts) > 300) return false;

    return verifyStandardWebhookSignature(
      webhookId,
      webhookTimestamp,
      webhookSignature,
      rawBody,
      CLIENT_SECRET as string,
    );
  }

  // Fallback: header simples comparado em tempo constante.
  const simpleHeader = req.headers.get("x-client-secret") || req.headers.get("authorization");
  if (!simpleHeader) return false;
  const bearer = simpleHeader.startsWith("Bearer ") ? simpleHeader.slice("Bearer ".length) : simpleHeader;
  return constantTimeStringEqual(bearer, CLIENT_SECRET as string);
}

// Templates de e-mail em português
const getEmailTemplate = (type: string, data: EmailData): { subject: string; html: string } => {
  const { token, token_hash, redirect_to, email_action_type, site_url } = data;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

  // Link de verificação padrão do Supabase
  const verifyLink = `${supabaseUrl}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect_to || site_url}`;

  const templates: Record<string, { subject: string; html: string }> = {
    signup: {
      subject: "Confirme seu cadastro - Viagg-TX8",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <img src="https://www.viagg-tx8.com.br/images/viagg-tx8-logo.png" alt="Viagg-TX8" style="width: 72px; height: 72px; border-radius: 12px;">
            </div>
            <h1 style="color: #18181b; font-size: 24px; margin-bottom: 16px;">Bem-vindo ao Viagg-TX8! 🎉</h1>
            <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
              Obrigado por se cadastrar! Para ativar sua conta, clique no botão abaixo:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="background-color: #0ea5e9; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Confirmar meu cadastro
              </a>
            </div>
            <p style="color: #71717a; font-size: 14px;">
              Ou copie e cole este link no seu navegador:<br>
              <a href="${verifyLink}" style="color: #0ea5e9; word-break: break-all;">${verifyLink}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; font-size: 12px;">
              Se você não solicitou este cadastro, ignore este e-mail.
            </p>
            <p style="color: #a1a1aa; font-size: 12px;">Atenciosamente,<br>Equipe Viagg-TX8</p>
          </div>
        </body>
        </html>
      `,
    },
    magiclink: {
      subject: "Seu link de acesso - Viagg-TX8",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h1 style="color: #18181b; font-size: 24px; margin-bottom: 16px;">Acesse sua conta 🔐</h1>
            <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
              Clique no botão abaixo para acessar sua conta de forma segura:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="background-color: #0ea5e9; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Entrar na minha conta
              </a>
            </div>
            ${
              token
                ? `
            <p style="color: #52525b; font-size: 14px; text-align: center;">
              Ou use este código de acesso: <strong style="font-family: monospace; background: #f4f4f5; padding: 4px 8px; border-radius: 4px;">${token}</strong>
            </p>
            `
                : ""
            }
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; font-size: 12px;">
              Este link expira em 1 hora. Se você não solicitou este acesso, ignore este e-mail.
            </p>
            <p style="color: #a1a1aa; font-size: 12px;">Atenciosamente,<br>Equipe Viagg-TX8</p>
          </div>
        </body>
        </html>
      `,
    },
    recovery: {
      subject: "Recupere sua senha - Viagg-TX8",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h1 style="color: #18181b; font-size: 24px; margin-bottom: 16px;">Recuperação de senha 🔑</h1>
            <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
              Você solicitou a recuperação da sua senha. Clique no botão abaixo para criar uma nova senha:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="background-color: #0ea5e9; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Redefinir minha senha
              </a>
            </div>
            <p style="color: #71717a; font-size: 14px;">
              Ou copie e cole este link no seu navegador:<br>
              <a href="${verifyLink}" style="color: #0ea5e9; word-break: break-all;">${verifyLink}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; font-size: 12px;">
              Se você não solicitou a recuperação de senha, ignore este e-mail. Sua senha permanecerá inalterada.
            </p>
            <p style="color: #a1a1aa; font-size: 12px;">Atenciosamente,<br>Equipe Viagg-TX8</p>
          </div>
        </body>
        </html>
      `,
    },
    email_change: {
      subject: "Confirme seu novo e-mail - Viagg-TX8",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h1 style="color: #18181b; font-size: 24px; margin-bottom: 16px;">Confirme seu novo e-mail ✉️</h1>
            <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
              Você solicitou a alteração do seu endereço de e-mail. Clique no botão abaixo para confirmar:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="background-color: #0ea5e9; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Confirmar novo e-mail
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; font-size: 12px;">
              Se você não solicitou esta alteração, ignore este e-mail ou entre em contato com nosso suporte.
            </p>
            <p style="color: #a1a1aa; font-size: 12px;">Atenciosamente,<br>Equipe Viagg-TX8</p>
          </div>
        </body>
        </html>
      `,
    },
    invite: {
      subject: "Você foi convidado - Viagg-TX8",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <h1 style="color: #18181b; font-size: 24px; margin-bottom: 16px;">Você foi convidado! 🎉</h1>
            <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
              Você recebeu um convite para se juntar ao Viagg-TX8. Clique no botão abaixo para aceitar:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyLink}" style="background-color: #0ea5e9; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                Aceitar convite
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; font-size: 12px;">
              Se você não esperava este convite, pode ignorar este e-mail com segurança.
            </p>
            <p style="color: #a1a1aa; font-size: 12px;">Atenciosamente,<br>Equipe Viagg-TX8</p>
          </div>
        </body>
        </html>
      `,
    },
  };

  // Fallback para tipo desconhecido
  return templates[type] || templates.magiclink;
};

interface EmailData {
  token?: string;
  token_hash: string;
  redirect_to?: string;
  email_action_type: string;
  site_url?: string;
}

interface WebhookPayload {
  user: {
    email: string;
  };
  email_data: EmailData;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    const isAuthentic = await verifyCallerAuthenticity(req, rawBody);
    if (!isAuthentic) {
      console.error("send-auth-email: chamador não autenticado (secret/assinatura ausente ou inválida)");
      return new Response(
        JSON.stringify({ error: { message: "Não autorizado", http_code: 401 } }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const payload: WebhookPayload = JSON.parse(rawBody);

    console.log(
      "Recebido webhook de e-mail:",
      JSON.stringify({
        email: payload.user?.email,
        type: payload.email_data?.email_action_type,
      }),
    );

    const { user, email_data } = payload;

    if (!user?.email || !email_data) {
      throw new Error("Payload inválido: faltam dados do usuário ou e-mail");
    }

    const emailType = email_data.email_action_type || "magiclink";
    const template = getEmailTemplate(emailType, email_data);

    console.log(`Enviando e-mail de ${emailType} para ${user.email}`);

    // Criar cliente SMTP
    const client = new SmtpClient();

    // Conectar ao servidor SMTP
    await client.connectTLS({
      hostname: smtpHost,
      port: smtpPort,
      username: smtpUser,
      password: smtpPass,
    });

    // Enviar e-mail
    await client.send({
      from: smtpFrom,
      to: user.email,
      subject: template.subject,
      content: template.html,
      html: template.html,
    });

    // Fechar conexão
    await client.close();

    console.log("E-mail enviado com sucesso para:", user.email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro ao enviar e-mail:", errorMessage);

    return new Response(
      JSON.stringify({
        error: {
          message: errorMessage,
          http_code: 500,
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};

serve(handler);
