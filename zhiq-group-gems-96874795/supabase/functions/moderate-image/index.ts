/**
 * moderate-image — IA de moderação de imagens do Marketplace.
 *
 * SEGURANÇA POR DESENHO: a imagem chega em base64 e SÓ toca o storage
 * depois do veredito. Aprovada → bucket público. Bloqueada → NUNCA é
 * armazenada. Dúvida → bucket privado 'moderacao' (quarentena) até o
 * admin decidir. Toda decisão fica em image_moderation_records.
 *
 * ARQUITETURA DEFINITIVA (Missão Orion 2026-07-23): esta edge é a
 * ÚNICA responsável por qualquer mutação de Storage — nenhuma RPC SQL
 * tem acesso à API de Storage, então nenhuma aprovação de mídia pode
 * ser feita fora daqui. Para o módulo `travel`, esta edge também é
 * quem grava/atualiza a linha em `travel_media` diretamente (o
 * frontend nunca faz INSERT/UPDATE de travel_media relacionado a
 * moderação — só lê o resultado). Isso elimina a classe de bug em que
 * o status do banco diverge do estado real do Storage.
 *
 * Ações (POST):
 *  { action:'analyze', image_base64, mime, file_name, listing_id?, category?, sort_order? }
 *  { action:'approve_travel_media', media_id }                                    (admin)
 *  { action:'manual_decision', record_id, decision:'approve'|'reject', notes? }    (admin, módulos legados sem tabela dedicada)
 *  { action:'preview', record_id }                                                (admin)
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

/** Tabela de mídia por módulo — chaves batem com o `category` real enviado
 * por cada formulário ao moderatedUpload() (vehicle/service usam plural). */
const MODULE_MEDIA_TABLE: Record<string, string> = {
  travel: "travel_media",
  real_estate: "real_estate_media",
  vehicles: "vehicle_media",
  services: "service_media",
  freight: "freight_media",
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
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr) console.error(userErr);
  const uid = userData?.user?.id;
  if (!uid) return json({ ok: false, error: "Não autenticado" }, 401);

  const input = await req.json().catch(() => ({}));
  const action = input.action ?? "analyze";

  // ── AÇÃO: aprovação/rejeição de mídia de um módulo com tabela dedicada
  // (travel_media, real_estate_media, ...) — fonte da verdade única.
  // Substitui o antigo caminho RPC-SQL-only, que mudava o status no
  // banco mas NUNCA movia o arquivo (RPC não tem acesso a Storage).
  if (action === "approve_travel_media" || action === "reject_travel_media") {
    const { data: isAdmin, error: adminErr } = await userClient.rpc("mp_is_admin");
    if (adminErr) console.error(adminErr);
    if (!isAdmin) return json({ ok: false, error: "Apenas administradores" }, 403);

    const mediaId: string | undefined = input.media_id;
    if (!mediaId) return json({ ok: false, error: "media_id ausente" }, 400);

    const { data: media, error: mediaErr } = await svc
      .from("travel_media")
      .select("id, listing_id, original_storage_path, public_masked_storage_path, storage_path, bucket, moderation_record_id, moderation_status")
      .eq("id", mediaId)
      .maybeSingle();
    if (mediaErr) console.error(mediaErr);
    if (!media) return json({ ok: false, error: "Mídia não encontrada" }, 404);

    if (action === "reject_travel_media") {
      const { error: updErr } = await svc.from("travel_media").update({
        moderation_status: "rejected",
      }).eq("id", mediaId);
      if (updErr) console.error(updErr);
      const { error: logErr } = await svc.from("travel_audit_log").insert({
        entity: "travel_media", entity_id: mediaId, action: "moderate:reject",
        actor_user_id: uid, reason: input.reason ?? null,
        old_data: { moderation_status: media.moderation_status },
        new_data: { moderation_status: "rejected" },
      });
      if (logErr) console.error(logErr);
      return json({ ok: true, status: "rejected" });
    }

    // approve_travel_media: precisa localizar o arquivo físico. Pode
    // estar em 'moderacao' (quarentena — caso normal) ou, para linhas
    // legadas, já ter um path que nunca foi de fato movido.
    const quarantinePath = media.storage_path || media.public_masked_storage_path || media.original_storage_path;
    if (!quarantinePath) return json({ ok: false, error: "Mídia sem storage_path" }, 400);

    // Bucket de destino: preferimos o bucket oficial de viagens; se o
    // registro de moderação original tiver outro target_bucket
    // (ex: fallback usado antes da migration do bucket oficial rodar),
    // respeitamos esse — garante consistência com o que foi de fato
    // configurado no momento do upload.
    let destBucket = "travel-public";
    if (media.moderation_record_id) {
      const { data: rec, error: recErr } = await svc
        .from("image_moderation_records")
        .select("metadata")
        .eq("id", media.moderation_record_id)
        .maybeSingle();
      if (recErr) console.error(recErr);
      if (rec?.metadata?.target_bucket) destBucket = rec.metadata.target_bucket;
    }

    const { data: file, error: downloadErr } = await svc.storage.from("moderacao").download(quarantinePath);
    if (downloadErr) console.error(downloadErr);
    const finalPath = quarantinePath;
    if (file) {
      // Arquivo estava mesmo em quarentena: copia para o bucket público
      // e limpa a quarentena.
      const { error: upErr } = await svc.storage.from(destBucket)
        .upload(finalPath, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (upErr) return json({ ok: false, error: `storage: ${upErr.message}` }, 500);
      const { error: rmErr } = await svc.storage.from("moderacao").remove([quarantinePath]);
      if (rmErr) console.error(rmErr);
    }
    // Se o arquivo NÃO estava em 'moderacao' (ex: já tinha sido movido
    // manualmente antes desta correção existir), assume que já está no
    // destBucket — getPublicUrl abaixo só monta a URL, não confirma
    // existência; é responsabilidade do runbook de backfill (Fase 12
    // do relatório) confirmar objetos órfãos remanescentes.
    const publicUrl = svc.storage.from(destBucket).getPublicUrl(finalPath).data.publicUrl;

    const { error: mediaUpdErr } = await svc.from("travel_media").update({
      bucket: destBucket,
      storage_path: finalPath,
      public_url: publicUrl,
      public_masked_storage_path: finalPath,
      moderation_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: uid,
    }).eq("id", mediaId);
    if (mediaUpdErr) console.error(mediaUpdErr);

    if (media.moderation_record_id) {
      const { error: recUpdErr } = await svc.from("image_moderation_records").update({
        status: "manual_approved",
        storage_bucket: destBucket,
        reviewed_by: uid,
        reviewed_at: new Date().toISOString(),
      }).eq("id", media.moderation_record_id);
      if (recUpdErr) console.error(recUpdErr);
    }

    const { error: auditErr } = await svc.from("travel_audit_log").insert({
      entity: "travel_media", entity_id: mediaId, action: "moderate:approve",
      actor_user_id: uid, reason: input.reason ?? null,
      old_data: { moderation_status: media.moderation_status, bucket: media.bucket },
      new_data: { moderation_status: "approved", bucket: destBucket, public_url: publicUrl },
    });
    if (auditErr) console.error(auditErr);

    return json({ ok: true, status: "approved", publicUrl, bucket: destBucket, storagePath: finalPath });
  }

  // ── AÇÕES ADMIN LEGADAS (módulos sem tabela de mídia dedicada — ex.
  // produtos do painel de anunciante genérico, via advertiser_listing_media) ──
  if (action === "manual_decision" || action === "preview") {
    const { data: isAdmin, error: adminErr } = await userClient.rpc("mp_is_admin");
    if (adminErr) console.error(adminErr);
    if (!isAdmin) return json({ ok: false, error: "Apenas administradores" }, 403);

    const { data: rec, error: recErr } = await svc
      .from("image_moderation_records")
      .select("*")
      .eq("id", input.record_id)
      .maybeSingle();
    if (recErr) console.error(recErr);
    if (!rec) return json({ ok: false, error: "Registro não encontrado" }, 404);

    if (action === "preview") {
      if (!rec.storage_path || rec.storage_bucket !== "moderacao") {
        return json({ ok: false, error: "Sem arquivo em quarentena" }, 400);
      }
      const { data: signed, error: signErr } = await svc.storage
        .from("moderacao")
        .createSignedUrl(rec.storage_path, 600);
      if (signErr) console.error(signErr);
      return json({ ok: true, url: signed?.signedUrl });
    }

    // manual_decision
    const approve = input.decision === "approve";
    let publicUrl: string | null = null;
    const finalBucket: string = rec.metadata?.target_bucket || "marketing-materials";

    if (rec.storage_path && rec.storage_bucket === "moderacao") {
      if (approve) {
        const { data: file, error: downloadErr } = await svc.storage.from("moderacao").download(rec.storage_path);
        if (downloadErr) console.error(downloadErr);
        if (file) {
          const finalPath = rec.storage_path;
          const { error: upErr } = await svc.storage.from(finalBucket)
            .upload(finalPath, file, { contentType: file.type || "image/jpeg", upsert: true });
          if (upErr) console.error(upErr);
          publicUrl = svc.storage.from(finalBucket).getPublicUrl(finalPath).data.publicUrl;

          // Módulos com tabela de mídia dedicada devem usar
          // approve_travel_media (acima) — este ramo é o fallback
          // histórico para produtos do painel de anunciante genérico.
          const targetTable = MODULE_MEDIA_TABLE[rec.category as string];
          if (targetTable && rec.listing_id) {
            const { error: mediaErr } = await svc.from(targetTable).update({
              public_masked_storage_path: finalPath,
              moderation_status: "approved",
            }).eq("listing_id", rec.listing_id).eq("original_storage_path", rec.storage_path);
            if (mediaErr) console.error(mediaErr);
          } else if (rec.listing_id) {
            const { error: insErr } = await svc.from("advertiser_listing_media").insert({
              listing_id: rec.listing_id,
              media_url: publicUrl,
              storage_path: finalPath,
              moderation_status: "approved",
            });
            if (insErr) console.error(insErr);
          }
        }
      } else if (rec.listing_id) {
        const targetTable = MODULE_MEDIA_TABLE[rec.category as string];
        if (targetTable) {
          const { error: rejErr } = await svc.from(targetTable).update({
            moderation_status: "rejected",
          }).eq("listing_id", rec.listing_id).eq("original_storage_path", rec.storage_path);
          if (rejErr) console.error(rejErr);
        }
      }
      const { error: rmErr } = await svc.storage.from("moderacao").remove([rec.storage_path]);
      if (rmErr) console.error(rmErr);
    }

    const { error: recUpdErr } = await svc.from("image_moderation_records").update({
      status: approve ? "manual_approved" : "manual_rejected",
      reviewed_by: uid,
      reviewed_at: new Date().toISOString(),
      review_notes: input.notes ?? null,
      ...(approve && publicUrl ? { storage_bucket: finalBucket } : {}),
    }).eq("id", rec.id);
    if (recUpdErr) console.error(recUpdErr);

    const { error: logErr } = await svc.from("ridv_decisions_log").insert({
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
    });
    if (logErr) console.error(logErr);

    return json({ ok: true, status: approve ? "manual_approved" : "manual_rejected", publicUrl });
  }

  // ── ANALYZE (fluxo de upload) ─────────────────────────────────────
  const b64: string = input.image_base64 ?? "";
  const mime: string = input.mime ?? "image/jpeg";
  const fileName: string = String(input.file_name ?? "imagem.jpg").replace(/[^\w.-]/g, "_");
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
    const { error: quarantineErr } = await svc.storage.from("moderacao")
      .upload(path, b64ToBytes(b64), { contentType: mime, upsert: false });
    if (quarantineErr) return json({ ok: false, error: `storage: ${quarantineErr.message}` }, 500);
    storageBucket = "moderacao";
    storagePath = path;
  }
  // blocked: arquivo NUNCA é armazenado

  const { data: rec, error: recInsErr } = await svc.from("image_moderation_records").insert({
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
  if (recInsErr) console.error(recInsErr);

  const { error: logInsErr } = await svc.from("ridv_decisions_log").insert({
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
  });
  if (logInsErr) console.error(logInsErr);

  // ── Módulo travel: a edge grava a linha em travel_media DIRETAMENTE.
  // O frontend não faz mais INSERT — elimina a janela em que a
  // resposta da edge e o INSERT do cliente podem divergir (ex: cliente
  // fecha a aba entre as duas chamadas, ou grava o path errado).
  let mediaId: string | null = null;
  if (categoryModule === "travel" && input.listing_id) {
    const { data: mediaRow, error: mediaInsErr } = await svc.from("travel_media").insert({
      listing_id: input.listing_id,
      owner_user_id: uid,
      original_storage_path: storagePath,
      public_masked_storage_path: finalStatus === "approved" ? storagePath : null,
      bucket: finalStatus === "approved" ? storageBucket : null,
      storage_path: storagePath,
      public_url: finalStatus === "approved" ? publicUrl : null,
      moderation_status: finalStatus === "approved" ? "approved" : "pending_ai_analysis",
      moderation_record_id: rec?.id ?? null,
      sort_order: Number(input.sort_order ?? 0),
      approved_at: finalStatus === "approved" ? new Date().toISOString() : null,
    }).select("id").single();
    if (mediaInsErr) console.error(mediaInsErr);
    mediaId = mediaRow?.id ?? null;
  }

  return json({
    ok: true,
    record_id: rec?.id,
    media_id: mediaId,
    status: finalStatus,
    confidence: verdict.confianca,
    category: verdict.categoria || categoryModule,
    reason: verdict.motivo,
    publicUrl,
    storagePath,
    bucket: storageBucket,
  });
});
