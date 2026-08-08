import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const smtpHost = Deno.env.get("SMTP_HOST") || "";
const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
const smtpUser = Deno.env.get("SMTP_USER") || "";
const smtpPass = Deno.env.get("SMTP_PASS") || "";
const smtpFrom = Deno.env.get("SMTP_FROM") || "suporte@viagg-tx8.com";

interface TicketResponsePayload {
  ticket_number: string;
  resposta: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // P0-02: endpoint era público (verify_jwt=false) sem nenhuma checagem de
  // identidade — qualquer chamador não autenticado disparava e-mail
  // arbitrário via SMTP corporativo. Agora exige Authorization + admin,
  // no mesmo padrão de payments-gateway-test/index.ts.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ ok: false, error: "Authorization obrigatório" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const svc = createClient(SUPABASE_URL, SERVICE);

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ ok: false, error: "Não autenticado" }, 401);

  let isAdmin = false;
  const { data: roleRow } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  isAdmin = !!roleRow;
  if (!isAdmin) return json({ ok: false, error: "Apenas administradores" }, 403);

  try {
    const payload: TicketResponsePayload = await req.json();
    const { ticket_number, resposta } = payload;

    if (!resposta || !ticket_number) {
      return json({ ok: false, error: "Dados incompletos: resposta ou número do ticket" }, 400);
    }

    // client_email nunca vem do payload — sempre derivado do ticket real no
    // banco, para impedir envio a destinatário arbitrário controlado pelo
    // chamador e para confirmar que o ticket de fato existe.
    const { data: ticket, error: ticketErr } = await svc
      .from("support_tickets")
      .select("id, ticket_number, assunto, user_id")
      .eq("ticket_number", ticket_number)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return json({ ok: false, error: "Ticket não encontrado" }, 404);
    }

    const { data: profile } = await svc
      .from("profiles")
      .select("email")
      .eq("id", ticket.user_id)
      .maybeSingle();

    const client_email = profile?.email;
    if (!client_email) {
      return json({ ok: false, error: "Cliente do ticket sem e-mail cadastrado" }, 422);
    }

    const assunto = escapeHtml(ticket.assunto || "");
    const respostaSafe = escapeHtml(resposta);
    const subject = `Resposta ao seu ticket #${ticket.ticket_number}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h1 style="color: #18181b; font-size: 24px; margin-bottom: 16px;">Resposta ao seu Ticket 📩</h1>

          <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #71717a; font-size: 14px; margin: 0 0 4px 0;">Número do ticket:</p>
            <p style="color: #18181b; font-size: 18px; font-weight: 600; margin: 0; font-family: monospace;">#${ticket.ticket_number}</p>
          </div>

          <div style="margin-bottom: 24px;">
            <p style="color: #71717a; font-size: 14px; margin: 0 0 4px 0;">Assunto:</p>
            <p style="color: #18181b; font-size: 16px; margin: 0;">${assunto}</p>
          </div>

          <div style="margin-bottom: 24px;">
            <p style="color: #71717a; font-size: 14px; margin: 0 0 8px 0;">Resposta do suporte:</p>
            <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 0 8px 8px 0;">
              <p style="color: #18181b; font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${respostaSafe}</p>
            </div>
          </div>

          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">

          <p style="color: #52525b; font-size: 14px; line-height: 1.6;">
            Caso tenha dúvidas, responda este e-mail ou abra um novo ticket pelo aplicativo.
          </p>

          <p style="color: #a1a1aa; font-size: 12px; margin-top: 24px;">
            Atenciosamente,<br>
            <strong>Equipe de Suporte - Viagg-TX8</strong>
          </p>
        </div>
      </body>
      </html>
    `;

    const client = new SmtpClient();

    await client.connectTLS({
      hostname: smtpHost,
      port: smtpPort,
      username: smtpUser,
      password: smtpPass,
    });

    await client.send({
      from: smtpFrom,
      to: client_email,
      subject: subject,
      content: html,
      html: html,
    });

    await client.close();

    console.log("E-mail de resposta enviado por admin", user.id, "para ticket", ticket.ticket_number);

    return json({ success: true }, 200);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro ao enviar e-mail de resposta:", errorMessage);
    return json({ error: errorMessage }, 500);
  }
};

serve(handler);
