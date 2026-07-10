/**
 * moderatedUpload — porta ÚNICA de upload de imagens do Marketplace.
 *
 * A imagem NÃO vai para o storage: vai em base64 para a edge
 * moderate-image, que analisa com IA de visão ANTES de armazenar.
 *  • approved      → já gravada no bucket público; volta publicUrl.
 *  • manual_review → retida na quarentena privada (invisível ao público)
 *                    até decisão do admin em /admin/moderacao-imagens.
 *  • blocked       → NUNCA armazenada; volta o motivo para exibir.
 *
 * Todos os formulários de imagem do marketplace devem usar esta função
 * (nunca supabase.storage.upload direto para bucket público).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ModerationResult {
  status: "approved" | "manual_review" | "blocked";
  recordId: string | null;
  confidence: number;
  category: string;
  reason: string;
  publicUrl: string | null;
  storagePath: string | null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Falha ao ler a imagem"));
    reader.readAsDataURL(blob);
  });
}

export async function moderatedUpload(
  blob: Blob,
  opts: { fileName: string; mime?: string; listingId?: string },
): Promise<ModerationResult> {
  const image_base64 = await blobToBase64(blob);

  const { data, error } = await supabase.functions.invoke("moderate-image", {
    body: {
      action: "analyze",
      image_base64,
      mime: opts.mime || blob.type || "image/jpeg",
      file_name: opts.fileName,
      listing_id: opts.listingId ?? null,
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || "Falha na moderação da imagem");

  return {
    status: data.status,
    recordId: data.record_id ?? null,
    confidence: Number(data.confidence ?? 0),
    category: String(data.category ?? ""),
    reason: String(data.reason ?? ""),
    publicUrl: data.publicUrl ?? null,
    storagePath: data.storagePath ?? null,
  };
}
