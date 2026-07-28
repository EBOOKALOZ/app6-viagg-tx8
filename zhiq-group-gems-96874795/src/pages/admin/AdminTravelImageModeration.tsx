/**
 * AdminTravelImageModeration — aprovação de imagens de VIAGENS.
 * Painel exclusivo do módulo (espelho de AdminRealEstateImageModeration /
 * Imóveis). Decisão de aprovação passa pela edge moderate-image (ação
 * approve_travel_media / reject_travel_media) — NÃO mais por RPC SQL pura,
 * porque aprovar mídia envolve mover o arquivo do bucket de quarentena
 * ('moderacao') para o bucket público, algo que só a edge (service_role,
 * acesso à API de Storage) é capaz de fazer. Ver migration
 * 20260723_travel_media_pipeline_definitivo.sql e travel_audit_log.
 * Rota: /admin/viagens/aprovacao-imagens
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TravelMediaModerationAction } from "@/integrations/supabase/types-travel";
import { resolveTravelMedia, travelImgFallback } from "@/lib/viagem/travelMedia";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Plane, Loader2, ShieldCheck,
  Image as ImageIcon, RefreshCcw, Eye,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TravelMediaItem {
  id: string;
  listing_id: string;
  owner_user_id: string;
  sort_order: number;
  bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  moderation_record_id: string | null;
  moderation_status: string;
  created_at: string;
  listing: {
    title: string | null;
    destination: string | null;
    city: string | null;
    state: string | null;
    visibility_status: string | null;
  } | null;
}

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-400",
  masked: "bg-emerald-500/10 text-emerald-400",
  rejected: "bg-red-500/10 text-red-400",
  queued: "bg-blue-500/10 text-blue-400",
  processing: "bg-blue-500/10 text-blue-400 animate-pulse",
};

export const AdminTravelImageModeration = () => {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pendentes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const { data: items = [], isLoading, refetch } = useQuery<TravelMediaItem[]>({
    queryKey: ["admin-travel-image-moderation", statusFilter],
    queryFn: async () => {
      let q = (supabase.from("travel_media") as any)
        .select("id, listing_id, owner_user_id, sort_order, bucket, storage_path, public_url, moderation_record_id, moderation_status, created_at, listing:travel_listings(title, destination, city, state, visibility_status)")
        .order("created_at", { ascending: false })
        .limit(80);
      if (statusFilter === "pendentes") q = q.in("moderation_status", ["queued", "processing", "pending_ai_analysis"]);
      else if (statusFilter !== "todas") q = q.eq("moderation_status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as TravelMediaItem[];
    },
  });

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) || items[0] || null,
    [items, selectedId],
  );

  // Enquanto a mídia está em quarentena (sem public_url), o único jeito de
  // pré-visualizá-la é uma signed URL temporária (bucket 'moderacao' é
  // privado) — obtida via action 'preview' da própria edge que decide.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    setPreviewUrl(null);
    if (!selected) return;
    const state = resolveTravelMedia(selected);
    if (state.kind === "ready") return; // já tem public_url — usa ela direto
    if (!selected.moderation_record_id) return; // linha legada sem vínculo — sem preview possível
    (async () => {
      const { data, error } = await supabase.functions.invoke("moderate-image", {
        body: { action: "preview", record_id: selected.moderation_record_id },
      });
      if (!error && data?.ok && data.url) setPreviewUrl(data.url);
    })();
  }, [selected]);

  const activeUrl = useMemo(() => {
    if (!selected) return null;
    const state = resolveTravelMedia(selected);
    if (state.kind === "ready") return state.url;
    return previewUrl;
  }, [selected, previewUrl]);

  const decide = async (action: TravelMediaModerationAction) => {
    if (!selected) return;
    if (action === "reject" && !reason.trim()) {
      toast.error("Informe o motivo da rejeição.");
      return;
    }
    try {
      setProcessing(true);
      // Aprovação de mídia move arquivo de bucket — só a edge (service_role)
      // tem acesso a Storage. A RPC SQL admin_moderate_travel_media não
      // aceita mais 'approve' (ver migration 20260723_travel_media_pipeline_definitivo) —
      // por desenho, para que nunca mais exista "aprovado no banco mas
      // arquivo continua na quarentena".
      const { data, error } = await supabase.functions.invoke("moderate-image", {
        body: {
          action: action === "approve" ? "approve_travel_media" : "reject_travel_media",
          media_id: selected.id,
          reason: reason.trim() || null,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Falha na moderação");
      toast.success(action === "approve" ? "Imagem aprovada e publicada!" : "Imagem rejeitada.");
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-travel-image-moderation"] });
      // A imagem aprovada pertence a um anúncio que pode já estar visível no
      // Painel Viagens e no Mercado — invalida também esses caches para que
      // ela apareça sem precisar de reload manual (Fase 10 / Teste 3).
      qc.invalidateQueries({ queryKey: ["viagens-meus-anuncios"] });
      qc.invalidateQueries({ queryKey: ["public-travel"] });
      qc.invalidateQueries({ queryKey: ["public-travel-home"] });
    } catch (err: any) {
      toast.error(`Erro na operação: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
        <p className="text-sm text-zinc-500 font-medium animate-pulse tracking-wide uppercase">Carregando Fila de Imagens...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-700 pb-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl">
            <ShieldCheck className="w-8 h-8 text-sky-500" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Aprovação de Imagens · Viagens</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
              Bucket oficial travel-public · decisões auditadas (travel_audit_log)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setSelectedId(null); }}>
            <SelectTrigger className="w-[160px] h-10 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendentes">Pendentes</SelectItem>
              <SelectItem value="approved">Aprovadas</SelectItem>
              <SelectItem value="rejected">Rejeitadas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20 font-black h-10 px-4">
            {items.length} NA FILA
          </Badge>
          <Button variant="outline" onClick={() => refetch()} className="bg-zinc-900 border-zinc-800 text-zinc-400 h-10 w-10 p-0 rounded-xl hover:text-white">
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {items.length === 0 ? (
        <Card className="bg-zinc-900/40 border-zinc-800/60 border-dashed py-20">
          <CardContent className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-zinc-950/50 border border-zinc-900 text-zinc-600">
              <ImageIcon className="w-12 h-12 opacity-20" />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-tighter text-sm">Nenhuma imagem nesta fila.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Fila */}
          <ScrollArea className="lg:w-80 max-h-[70vh] border border-zinc-800 rounded-2xl bg-zinc-900/40 shadow-inner">
            <div className="p-3 space-y-2">
              {items.map((item) => {
                const itemState = resolveTravelMedia(item);
                return (
                <button
                  key={item.id}
                  onClick={() => { setSelectedId(item.id); setReason(""); }}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all duration-200 border flex gap-3",
                    selected?.id === item.id
                      ? "bg-sky-500/10 border-sky-500/30"
                      : "bg-zinc-950/40 border-transparent hover:border-zinc-800 hover:bg-zinc-900/60",
                  )}
                >
                  <div className="w-14 h-14 rounded-lg bg-zinc-900 flex-shrink-0 overflow-hidden border border-zinc-800 flex items-center justify-center">
                    {itemState.kind === "ready" ? (
                      <img
                        src={itemState.url}
                        className="w-full h-full object-cover"
                        onError={travelImgFallback}
                        alt=""
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-zinc-700" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden flex flex-col justify-center gap-1">
                    <p className={cn(
                      "text-[12px] font-black truncate uppercase tracking-tight",
                      selected?.id === item.id ? "text-sky-400" : "text-zinc-200",
                    )}>
                      {item.listing?.title || "Anúncio sem título"}
                    </p>
                    <Badge variant="outline" className={cn(
                      "text-[9px] font-black px-1.5 py-0 h-4 border-none uppercase w-fit",
                      STATUS_BADGE[item.moderation_status] || "bg-zinc-800 text-zinc-500",
                    )}>
                      {item.moderation_status?.replace(/_/g, " ") || "sem status"}
                    </Badge>
                  </div>
                </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Preview + decisão */}
          <div className="flex-1 flex flex-col gap-4">
            <Card className="bg-zinc-950 border-zinc-800 rounded-3xl overflow-hidden relative flex flex-col min-h-[420px]">
              <div className="flex-1 flex items-center justify-center p-10">
                {activeUrl ? (
                  <img
                    src={activeUrl}
                    className="max-w-full max-h-[52vh] object-contain rounded-xl shadow-2xl"
                    onError={travelImgFallback}
                    alt="Preview de moderação"
                  />
                ) : (
                  <ImageIcon className="w-16 h-16 text-zinc-800" />
                )}
              </div>
              <div className="h-16 bg-black/40 border-t border-white/5 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                  <Plane className="w-4 h-4 text-sky-500" />
                  <span className="text-xs font-black text-white uppercase tracking-tight truncate max-w-[320px]">
                    {selected?.listing?.title || "—"}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">
                    {[selected?.listing?.destination, selected?.listing?.city, selected?.listing?.state].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">
                    {selected?.created_at ? format(new Date(selected.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : ""}
                  </span>
                  {selected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-white gap-1.5 h-8"
                      onClick={() => window.open(`/viagens/${selected.listing_id}`, "_blank")}
                    >
                      <Eye className="w-4 h-4" /> Ver anúncio
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl flex flex-col md:flex-row items-stretch md:items-center gap-3 p-5">
              <Input
                placeholder="Motivo (obrigatório ao rejeitar)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-200 h-12 text-xs flex-1"
              />
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="h-12 border-red-500/30 bg-transparent text-red-500 hover:bg-red-500/10 rounded-xl font-black text-xs uppercase px-8 gap-2"
                  onClick={() => decide("reject")}
                  disabled={processing || !selected}
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Rejeitar
                </Button>
                <Button
                  className="h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase px-8 gap-2 shadow-xl shadow-emerald-500/10"
                  onClick={() => decide("approve")}
                  disabled={processing || !selected}
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Aprovar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTravelImageModeration;
