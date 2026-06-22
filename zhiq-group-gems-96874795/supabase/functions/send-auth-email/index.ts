import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuração SMTP
const smtpHost = Deno.env.get("SMTP_HOST") || "";
const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
const smtpUser = Deno.env.get("SMTP_USER") || "";
const smtpPass = Deno.env.get("SMTP_PASS") || "";
const smtpFrom = Deno.env.get("SMTP_FROM") || "";

// 🔐 Secret adicional (API_CLIENT_SECRET)
const CLIENT_SECRET = Deno.env.get("API_CLIENT_SECRET");
if (!CLIENT_SECRET) {
  throw new Error("API_CLIENT_SECRET não configurado nos Secrets do Supabase");
}

console.log("API_CLIENT_SECRET OK?", !!CLIENT_SECRET);

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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: WebhookPayload = await req.json();

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
