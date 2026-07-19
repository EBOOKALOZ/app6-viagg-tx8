/**
 * moderate-image — IA de moderação de imagens do Marketplace.
 *
 * SEGURANÇA POR DESENHO: a imagem chega em base64 e SÓ toca o storage
 * depois do veredito. Aprovada → bucket público. Bloqueada → NUNCA é
 * armazenada. Dúvida → bucket privado 'moderacao' (quarentena) até o
 * admin decidir. Toda decisão fica em image_moderation_records.
 *
 * Ações (POST):
 *  { action:'analyze', image_base64, mime, file_name, listing_id? }
 *  { action:'manual_decision', record_id, decision:'approve'|'reject', notes? }  (admin)
 *  { action:'preview', record_id }                                              (admin)
 *
 * Provedores plugáveis: PROVIDERS registra cada implementação com o
 * mesmo contrato — trocar/adicionar (OpenAI, Vision, Rekognition,
 * Azure) é escrever uma função nova, sem tocar no fluxo.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type Verdict = {
  decisao: "aprovada" | "revisao" | "bloqueada";
  confianca: number;
  categoria: string;
  motivo: string;
};

/**
 * Modera a imagem via ORION AI Gateway (multimodal). Prompt no Registry
 * (ridv.moderacao.imagem). A edge NÃO conhece provider/modelo/API key —
 * o Gateway escolhe, aplica cache/retry/timeout/fallback e audita custo.
 */
async function analisarViaGateway(b64: string, mime: string): Promise<{ verdict: Verdict; modelo: string }> {
  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/orion-ai-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      module: "ridv",
      task: "moderation_image",
      prompt_key: "ridv.moderacao.imagem",   // Prompt Registry oficial (ORION CORE)
      prompt: "Analise a imagem deste anúncio e responda no formato JSON especificado.",
      image_base64: b64,
      image_mime: mime,
      max_tokens: 300,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!data?.ok) throw new Error(String(data?.error || `gateway ${resp.status}`));
  const text: string = data.texto ?? "";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return {
    verdict: {
      decisao: ["aprovada", "revisao", "bloqueada"].includes(parsed.decisao) ? parsed.decisao : "revisao",
      confianca: Math.max(0, Math.min(100, Number(parsed.confianca) || 0)),
      categoria: String(parsed.categoria ?? "outro"),
      motivo: String(parsed.motivo ?? "").slice(0, 300),
    },
    modelo: `${data.provider ?? "gateway"}/${data.model ?? "?"}`,
  };
}

const b64ToBytes = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return json({ ok: false, error: "Não autenticado" }, 401);

  const input = await req.json().catch(() => ({}));
  const action = input.action ?? "analyze";

  // ── AÇÕES ADMIN (fila de revisão) ─────────────────────────────────
  if (action === "manual_decision" || action === "preview") {
    const { data: isAdmin } = await userClient.rpc("mp_is_admin");
    if (!isAdmin) return json({ ok: false, error: "Apenas administradores" }, 403);

    const { data: rec } = await svc
      .from("image_moderation_records")
      .select("*")
      .eq("id", input.record_id)
      .maybeSingle();
    if (!rec) return json({ ok: false, error: "Registro não encontrado" }, 404);

    if (action === "preview") {
      if (!rec.storage_path || rec.storage_bucket !== "moderacao") {
        return json({ ok: false, error: "Sem arquivo em quarentena" }, 400);
      }
      const { data: signed } = await svc.storage
        .from("moderacao")
        .createSignedUrl(rec.storage_path, 600);
      return json({ ok: true, url: signed?.signedUrl });
    }

    // manual_decision
    const approve = input.decision === "approve";
    let publicUrl: string | null = null;

    if (rec.storage_path && rec.storage_bucket === "moderacao") {
      if (approve) {
        const { data: file } = await svc.storage.from("moderacao").download(rec.storage_path);
        if (file) {
          const finalPath = rec.storage_path;
          await svc.storage.from("marketing-materials")
            .upload(finalPath, file, { contentType: file.type || "image/jpeg", upsert: true });
          publicUrl = svc.storage.from("marketing-materials").getPublicUrl(finalPath).data.publicUrl;
          if (rec.listing_id) {
            await svc.from("advertiser_listing_media").insert({
              listing_id: rec.listing_id,
              media_url: publicUrl,
              storage_path: finalPath,
              moderation_status: "approved",
            });
          }
        }
      }
      // aprovado (já copiado) ou rejeitado: sai da quarentena nos 2 casos
      await svc.storage.from("moderacao").remove([rec.storage_path]);
    }

    await svc.from("image_moderation_records").update({
      status: approve ? "manual_approved" : "manual_rejected",
      reviewed_by: uid,
      reviewed_at: new Date().toISOString(),
      review_notes: input.notes ?? null,
      ...(approve && publicUrl ? { storage_bucket: "marketing-materials" } : {}),
    }).eq("id", rec.id);

    // Registro na tabela de aprendizado da IA (Etapa 9)
    await svc.from("ridv_decisions_log").insert({
      listing_id: rec.listing_id ?? null,
      media_id: rec.id,
      category: rec.category ?? "outro",
      content_type: "image",
      status: approve ? "manual_approved" : "manual_rejected",
      confidence: rec.confidence ?? 100,
      reason: input.notes ?? (approve ? "Aprovado manualmente" : "Rejeitado manualmente"),
      verdict: approve ? "aprovada" : "bloqueada",
      ai_provider: rec.provider ?? "manual",
      user_id: rec.user_id,
      reviewed_by: uid,
      reviewed_at: new Date().toISOString(),
      metadata: { record_id: rec.id, manual: true },
    }).catch(() => {});

    return json({ ok: true, status: approve ? "manual_approved" : "manual_rejected", publicUrl });
  }

  // ── ANALYZE (fluxo de upload) ─────────────────────────────────────
  const b64: string = input.image_base64 ?? "";
  const mime: string = input.mime ?? "image/jpeg";
  const fileName: string = String(input.file_name ?? "imagem.jpg").replace(/[^\w.\-]/g, "_");
  const categoryModule: string = String(input.category ?? input.module ?? "product");
  if (!b64 || b64.length < 100) return json({ ok: false, error: "Imagem ausente" }, 400);
  if (b64.length > 9_000_000) return json({ ok: false, error: "Imagem grande demais (máx ~6MB)" }, 413);

  let verdict: Verdict;
  let modelo = "orion-ai-gateway";
  try {
    const r = await analisarViaGateway(b64, mime);
    verdict = r.verdict; modelo = r.modelo;
  } catch (e) {
    // IA/Gateway indisponível → NUNCA publicar sem análise: vai para quarentena.
    verdict = {
      decisao: "revisao", confianca: 0, categoria: categoryModule,
      motivo: `IA indisponível (${String(e).slice(0, 120)}) — retida para revisão manual`,
    };
  }

  // Limiar de automação: decisões só são automáticas com confiança >= 85
  const finalStatus =
    verdict.decisao === "aprovada" && verdict.confianca >= 85 ? "approved"
    : verdict.decisao === "bloqueada" && verdict.confianca >= 85 ? "blocked"
    : "manual_review";

  const path = `${uid}/${Date.now()}-${fileName}`;
  let storageBucket: string | null = null;
  let storagePath: string | null = null;
  let publicUrl: string | null = null;

  // Suporte a múltiplos buckets de destino dependendo do módulo (Etapa 1)
  const targetBucket: string = input.target_bucket ?? "marketing-materials";

  if (finalStatus === "approved") {
    const { error: upErr } = await svc.storage.from(targetBucket)
      .upload(path, b64ToBytes(b64), { contentType: mime, upsert: false });
    if (upErr) return json({ ok: false, error: `storage: ${upErr.message}` }, 500);
    storageBucket = targetBucket;
    storagePath = path;
    publicUrl = svc.storage.from(targetBucket).getPublicUrl(path).data.publicUrl;
  } else if (finalStatus === "manual_review") {
    // Quarentena privada — invisível ao público até a decisão do admin
    await svc.storage.from("moderacao")
      .upload(path, b64ToBytes(b64), { contentType: mime, upsert: false });
    storageBucket = "moderacao";
    storagePath = path;
  }
  // blocked: arquivo NUNCA é armazenado

  const { data: rec } = await svc.from("image_moderation_records").insert({
    user_id: uid,
    listing_id: input.listing_id ?? null,
    file_name: fileName,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    status: finalStatus,
    confidence: verdict.confianca,
    category: verdict.categoria || categoryModule,
    reason: verdict.motivo,
    provider: modelo,
    metadata: { mime, size_b64: b64.length, target_bucket: targetBucket, module: categoryModule },
  }).select("id").single();

  // Registro na tabela de aprendizado da IA (Etapa 9)
  await svc.from("ridv_decisions_log").insert({
    listing_id: input.listing_id ?? null,
    media_id: rec?.id ?? null,
    category: categoryModule,
    content_type: "image",
    status: finalStatus,
    confidence: verdict.confianca,
    reason: verdict.motivo,
    verdict: verdict.decisao,
    ai_provider: modelo,
    user_id: uid,
    metadata: { mime, size_b64: b64.length, record_id: rec?.id, target_bucket: targetBucket },
  }).catch(() => {});

  return json({
    ok: true,
    record_id: rec?.id,
    status: finalStatus,
    confidence: verdict.confianca,
    category: verdict.categoria || categoryModule,
    reason: verdict.motivo,
    publicUrl,
    storagePath,
  });
});
