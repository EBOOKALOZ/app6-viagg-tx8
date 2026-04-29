import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const smtpHost = Deno.env.get("SMTP_HOST") || "";
const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
const smtpUser = Deno.env.get("SMTP_USER") || "";
const smtpPass = Deno.env.get("SMTP_PASS") || "";
const smtpFrom = Deno.env.get("SMTP_FROM") || "suporte@viagg-tx8.com";

interface TicketResponsePayload {
  ticket_number: string;
  assunto: string;
  resposta: string;
  client_email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: TicketResponsePayload = await req.json();
    
    console.log("Enviando resposta de ticket:", {
      ticket: payload.ticket_number,
      to: payload.client_email,
    });

    const { ticket_number, assunto, resposta, client_email } = payload;
    
    if (!client_email || !resposta || !ticket_number) {
      throw new Error("Dados incompletos: email, resposta ou número do ticket");
    }

    const subject = `Resposta ao seu ticket #${ticket_number}`;
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
            <p style="color: #18181b; font-size: 18px; font-weight: 600; margin: 0; font-family: monospace;">#${ticket_number}</p>
          </div>
          
          <div style="margin-bottom: 24px;">
            <p style="color: #71717a; font-size: 14px; margin: 0 0 4px 0;">Assunto:</p>
            <p style="color: #18181b; font-size: 16px; margin: 0;">${assunto}</p>
          </div>
          
          <div style="margin-bottom: 24px;">
            <p style="color: #71717a; font-size: 14px; margin: 0 0 8px 0;">Resposta do suporte:</p>
            <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; border-radius: 0 8px 8px 0;">
              <p style="color: #18181b; font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${resposta}</p>
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

    console.log("E-mail de resposta enviado com sucesso para:", client_email);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro ao enviar e-mail de resposta:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
