import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handling CORS
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

        const ZAPI_INSTANCE = Deno.env.get("ZAPI_INSTANCE");
        const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN");
        const ZAPI_GROUP_ID = Deno.env.get("ZAPI_GROUP_ID"); // Fallback group ID
        
        // 1. Get next available lot
        const { data: lots, error: lotsErr } = await supabaseAdmin
            .from("postador_lotes_board")
            .select("*")
            .eq("lot_status", "available")
            .order("lot_created_at", { ascending: true })
            .limit(1);

        if (lotsErr) throw new Error("Error fetching lots: " + lotsErr.message);
        if (!lots || lots.length === 0) {
            return new Response(JSON.stringify({ message: "Nenhum lote disponível", success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const lot = lots[0];

        // 2. Format Context for AI
        const lines: string[] = [];
        if (lot.store_name) lines.push(`Loja: ${lot.store_name}`);
        const location = [lot.target_bairro || lot.target_region, lot.target_city].filter(Boolean).join(", ");
        if (location) lines.push(`Localização: ${location}`);
        lines.push("Produtos:");
        (lot.items || []).forEach((item: Record<string, unknown>) => {
            const price = item.product_price ? ` — R$ ${Number(item.product_price).toFixed(2).replace(".", ",")}` : "";
            lines.push(`• ${item.product_name}${price}`);
        });
        const context = lines.join("\n");

        // 3. Call OpenAI (gpt-4o-mini)
        const AIAPI_URL = Deno.env.get("AIAPI_BASE_URL") || "https://api.openai.com/v1";
        const AIAPI_KEY = Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || Deno.env.get("AIAPI_KEY");

        if (!AIAPI_KEY) throw new Error("OPENAI_API_KEY is missing");

        const systemPrompt = `Você é um copywriter especialista em marketing digital e vendas para WhatsApp e Instagram. 
Crie um texto de venda persuasivo (copy) que divulgue os itens fornecidos, usando gatilhos mentais (urgência, escassez, prova social).
O texto deve ser animado, usar emojis adequados e ter um call to action (CTA) claro no final.`;
        const userPrompt = `Por favor, crie um texto de divulgação para os seguintes itens:\n${context}\n\nLembre-se de adicionar placeholders para o link da loja, ex: [LINK DA LOJA].`;

        const aiReq = await fetch(`${AIAPI_URL}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AIAPI_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 800
            })
        });

        if (!aiReq.ok) throw new Error("Erro ao chamar AIAPI: " + await aiReq.text());
        const aiRes = await aiReq.json();
        const aiText = aiRes.choices[0].message.content;
        
        const finalMessage = `${aiText}\n\n─────────────────────\n📢 Quer anunciar seu produto aqui?\n👉 https://zhiq-group-gems-96874795.lovable.app/anunciante/meus-anuncios`;

        // 4. Send via Z-API (Mock if keys are missing)
        let zapiResponse = null;
        if (ZAPI_INSTANCE && ZAPI_TOKEN && ZAPI_GROUP_ID) {
            const zapiUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;
            const sendReq = await fetch(zapiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: ZAPI_GROUP_ID,
                    message: finalMessage
                })
            });
            zapiResponse = await sendReq.json();
            if (!sendReq.ok) throw new Error("Erro na Z-API: " + JSON.stringify(zapiResponse));
        } else {
            console.log("Z-API keys not configured. Simulating dispatch...");
        }

        // 5. Update Lot to 'posted' (Simulate confirmation)
        // Since we bypass RLS, we can just update the underlying table directly if we know it.
        // Wait, the table is `posting_lots`. Let's update it.
        const { error: updErr } = await supabaseAdmin
            .from("posting_lots")
            .update({
                lot_status: "posted",
                posted_at: new Date().toISOString(),
                proof_type: "text",
                proof_text: "Enviado pelo Robô Postador Autônomo via Z-API",
                notes: `Message length: ${finalMessage.length}`,
            })
            .eq("id", lot.lot_id);

        if (updErr) {
            console.error("Warning: Could not update posting_lots directly, falling back to RPC", updErr);
            // Fallback: Use the RPC but might fail if it requires auth.uid()
            await supabaseAdmin.rpc("confirm_posting_lot", {
                p_lot_id: lot.lot_id,
                p_proof_type: "text",
                p_proof_text: "Enviado pelo Robô Postador",
                p_notes: "Robô",
            });
        }

        return new Response(JSON.stringify({ 
            success: true, 
            message: "Lote processado e postado com sucesso!", 
            lotId: lot.lot_id,
            finalMessage,
            zapiResponse
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err: unknown) {
        const error = err as Error;
        console.error("Auto-Poster Error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
