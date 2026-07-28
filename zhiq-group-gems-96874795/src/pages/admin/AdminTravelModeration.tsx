/**
 * AdminTravelModeration — fila de aprovação de anúncios de VIAGENS.
 * Espelho do padrão-ouro AdminRealEstateModeration (Imóveis), com as
 * ações executadas pela RPC auditada admin_moderate_travel_listing
 * (SECURITY DEFINER + public.is_admin() + travel_audit_log).
 * Rota: /admin/viagens/moderacao
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TravelListingModerationAction, TravelModerationResult } from "@/integrations/supabase/types-travel";
import { resolveTravelMedia, travelImgFallback } from "@/lib/viagem/travelMedia";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Plane, MapPin, User, Loader2,
  Calendar, PencilLine, Eye,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PendingTravelListing {
  id: string;
  title: string;
  category: string | null;
  destination: string | null;
  city: string | null;
  state: string | null;
  entry_price: string | number | null;
  price_per_person: number | null;
  total_price: number | null;
  departure_date: string | null;
  duration_days: number | null;
  moderation_reason: string | null;
  owner_user_id: string | null;
  created_at: string;
  travel_media?: { bucket: string | null; storage_path: string | null; public_url: string | null; moderation_status: string | null; sort_order: number }[];
}

function priceLabel(l: PendingTravelListing): string {
  if (l.entry_price) {
    const n = Number(l.entry_price);
    if (Number.isFinite(n) && n > 0) return `a partir de R$ ${n.toLocaleString("pt-BR")}`;
    if (typeof l.entry_price === "string" && l.entry_price.trim()) return l.entry_price;
  }
  if (l.price_per_person) return `R$ ${Number(l.price_per_person).toLocaleString("pt-BR")}/pessoa`;
  if (l.total_price) return `R$ ${Number(l.total_price).toLocaleString("pt-BR")}`;
  return "Consulte";
}

export const AdminTravelModeration = () => {
  const qc = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { data: listings = [], isLoading } = useQuery<PendingTravelListing[]>({
    queryKey: ["admin-travel-moderation-queue"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("travel_listings") as any)
        .select("id, title, category, destination, city, state, entry_price, price_per_person, total_price, departure_date, duration_days, moderation_reason, owner_user_id, created_at, travel_media(bucket, storage_path, public_url, moderation_status, sort_order)")
        .eq("visibility_status", "pending_review")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PendingTravelListing[];
    },
  });

  const moderate = async (id: string, action: TravelListingModerationAction) => {
    try {
      setProcessingId(id);
      const { data, error } = await (supabase.rpc as any)("admin_moderate_travel_listing", {
        p_listing_id: id,
        p_action: action,
        p_reason: reasons[id]?.trim() || null,
      });
      if (error) throw error;
      const res = data as TravelModerationResult;
      if (!res?.success) throw new Error(res?.error || "Falha na moderação");
      toast.success(
        action === "approve" ? "Anúncio aprovado e publicado!" :
        action === "reject" ? "Anúncio rejeitado." :
        "Ajustes solicitados ao anunciante.",
      );
      qc.invalidateQueries({ queryKey: ["admin-travel-moderation-queue"] });
      qc.invalidateQueries({ queryKey: ["admin-travel-overview"] });
    } catch (err: any) {
      toast.error(`Erro na operação: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
        <p className="text-sm text-zinc-500 font-medium animate-pulse tracking-wide uppercase">Carregando Moderação...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl">
            <Plane className="w-8 h-8 text-sky-500" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Moderação de Viagens</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
              Aprovação de pacotes pendentes · decisões auditadas (travel_audit_log)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-zinc-900/40 p-2 rounded-2xl border border-zinc-800/60">
          <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20 font-black h-8 px-4">
            {listings.length} PENDENTES
          </Badge>
        </div>
      </header>

      {listings.length === 0 ? (
        <Card className="bg-zinc-900/40 border-zinc-800/60 border-dashed py-20">
          <CardContent className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-zinc-950/50 border border-zinc-900 text-zinc-600">
              <CheckCircle2 className="w-12 h-12 opacity-20" />
            </div>
            <p className="text-zinc-500 font-bold uppercase tracking-tighter text-sm">Nenhum pacote pendente de revisão no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {listings.map((item) => {
            const media = [...(item.travel_media || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const thumbState = media.length > 0 ? resolveTravelMedia(media[0]) : { kind: "empty" as const };
            return (
              <Card key={item.id} className="bg-zinc-900/80 border-zinc-800 overflow-hidden group hover:border-sky-500/30 transition-all duration-300">
                <div className="flex flex-col lg:flex-row">
                  {/* Visual */}
                  <div className="lg:w-1/4 bg-zinc-950 flex flex-col justify-center items-center gap-4 border-r border-zinc-800 min-h-[180px] relative overflow-hidden">
                    {thumbState.kind === "ready" ? (
                      <img src={thumbState.url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" onError={travelImgFallback} />
                    ) : thumbState.kind === "reviewing" ? (
                      <div className="p-4 rounded-3xl bg-amber-500/5 border border-amber-500/10 text-center">
                        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-2" />
                        <p className="text-[9px] font-black text-amber-500 uppercase">Foto em análise</p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-3xl bg-sky-500/5 border border-sky-500/10">
                        <Plane className="w-16 h-16 text-zinc-700 group-hover:text-sky-500 transition-colors" />
                      </div>
                    )}
                    <Badge className="absolute bottom-4 bg-amber-500/10 text-amber-500 border-amber-500/20 font-black backdrop-blur">
                      AGUARDANDO
                    </Badge>
                  </div>

                  {/* Info */}
                  <div className="flex-1 p-8 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-black text-white tracking-tight leading-tight uppercase underline decoration-sky-500/30 underline-offset-8 decoration-4">
                          {item.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-4 text-zinc-400 font-medium">
                          <MapPin className="w-4 h-4 text-sky-500" />
                          <span className="text-xs uppercase tracking-tight">
                            {item.destination || "—"} · {[item.city, item.state].filter(Boolean).join("/") || "—"}
                          </span>
                        </div>
                        {item.moderation_reason && (
                          <p className="mt-3 text-[11px] text-amber-400/80 font-medium italic">
                            RIDV: {item.moderation_reason}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-zinc-500 uppercase">Preço Anunciado</p>
                        <p className="text-2xl font-black text-emerald-400 tracking-tighter">{priceLabel(item)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-zinc-800">
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase"><Plane className="w-3 h-3" /> Categoria</p>
                        <p className="text-sm font-bold text-zinc-200">{item.category || "—"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase"><Calendar className="w-3 h-3" /> Partida</p>
                        <p className="text-sm font-bold text-zinc-200">
                          {item.departure_date ? format(new Date(item.departure_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          {item.duration_days ? ` · ${item.duration_days}d` : ""}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase"><Calendar className="w-3 h-3" /> Criado em</p>
                        <p className="text-sm font-bold text-zinc-200">
                          {format(new Date(item.created_at), "dd 'de' MMMM", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-[9px] font-black text-zinc-500 uppercase"><User className="w-3 h-3" /> Anunciante</p>
                        <button
                          onClick={() => window.open(`/admin/users/${item.owner_user_id}`, "_blank")}
                          className="text-sm font-bold text-sky-400 hover:underline"
                        >
                          Ver perfil
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Input
                        placeholder="Motivo (obrigatório ao rejeitar / solicitar ajustes)"
                        value={reasons[item.id] || ""}
                        onChange={(e) => setReasons((r) => ({ ...r, [item.id]: e.target.value }))}
                        className="bg-zinc-950 border-zinc-800 text-zinc-200 h-10 text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-500 hover:text-white gap-1.5 shrink-0"
                        onClick={() => window.open(`/viagens/${item.id}`, "_blank")}
                      >
                        <Eye className="w-4 h-4" /> Prévia
                      </Button>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="bg-zinc-950 p-8 flex flex-row lg:flex-col justify-center gap-3 border-l border-zinc-800 min-w-[210px]">
                    <Button
                      onClick={() => moderate(item.id, "approve")}
                      disabled={processingId === item.id}
                      className="flex-1 lg:w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs gap-2 shadow-lg shadow-emerald-500/10"
                    >
                      {processingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> APROVAR</>}
                    </Button>
                    <Button
                      onClick={() => {
                        if (!reasons[item.id]?.trim()) { toast.error("Informe o motivo para solicitar ajustes."); return; }
                        moderate(item.id, "request_changes");
                      }}
                      disabled={processingId === item.id}
                      variant="ghost"
                      className="flex-1 lg:w-full h-12 rounded-2xl border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-black text-xs gap-2 uppercase"
                    >
                      <PencilLine className="w-4 h-4" /> Ajustes
                    </Button>
                    <Button
                      onClick={() => {
                        if (!reasons[item.id]?.trim()) { toast.error("Informe o motivo da rejeição."); return; }
                        moderate(item.id, "reject");
                      }}
                      disabled={processingId === item.id}
                      variant="ghost"
                      className="flex-1 lg:w-full h-12 rounded-2xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-black text-xs gap-2 uppercase"
                    >
                      <XCircle className="w-4 h-4" /> Rejeitar
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminTravelModeration;
