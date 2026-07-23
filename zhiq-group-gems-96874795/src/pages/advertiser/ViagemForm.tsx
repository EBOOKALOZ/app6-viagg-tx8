import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plane, Save, ArrowLeft, Camera, ImagePlus, X, RefreshCw, Phone, Mail, Sparkles, Send } from "lucide-react";
import { chatCompletion } from "@/lib/aiapi";
import { StoreLocationPicker, type ValidAddressDetails } from "@/components/merchant/StoreLocationPicker";
import { TRAVEL_CATEGORIES, TRAVEL_INCLUDES } from "@/lib/viagem/travelCategories";
import { useToast } from "@/hooks/use-toast";
import { formatBrazilianPhone } from "@/lib/utils";
import { moderatedUpload } from "@/lib/moderation/moderatedUpload";
import { moderatedText } from "@/lib/moderation/moderatedText";
import { getTravelMediaUrl, resolveTravelUploadBucket } from "@/lib/viagem/travelMedia";

interface ExistingMedia {
  id: string;
  url: string;
  path: string;
}

interface FormData {
  title: string;
  category: string;
  trip_type: string;
  destination: string;
  country: string;
  departure_date: string;
  return_date: string;
  duration_days: string;
  available_spots: string;
  entry_price: string;
  price_per_person: string;
  total_price: string;
  not_included: string;
  installments_available: boolean;
  description: string;
  city: string;
  state: string;
  whatsapp: string;
  email: string;
  latitude: number | null;
  longitude: number | null;
  endereco_formatado: string | null;
  includes: Record<string, boolean>;
}

const EMPTY: FormData = {
  title: "", category: "", trip_type: "nacional", destination: "", country: "Brasil",
  departure_date: "", return_date: "", duration_days: "", available_spots: "",
  entry_price: "", price_per_person: "", total_price: "",
  not_included: "", installments_available: false,
  description: "", city: "", state: "", whatsapp: "", email: "",
  latitude: null, longitude: null, endereco_formatado: null,
  includes: Object.fromEntries(TRAVEL_INCLUDES.map(i => [i.key, false])),
};

export default function ViagemForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { listingId } = useParams<{ listingId: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const isEdit = !!listingId;

  const [form, setForm] = useState<FormData>({
    ...EMPTY,
    category: searchParams.get("categoria") || "",
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [existingMedia, setExistingMedia] = useState<ExistingMedia[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [glmOpen, setGlmOpen] = useState(false);
  const [glmPrompt, setGlmPrompt] = useState("");
  const [glmLoading, setGlmLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number>(-1); // índice na lista existingMedia a substituir

  const MAX_PHOTOS = 6;
  const totalPhotos = existingMedia.length + pendingFiles.length;

  const { data: existing } = useQuery({
    queryKey: ["viagem-form-edit", listingId],
    enabled: isEdit,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("*").eq("id", listingId).single();
      return data;
    },
  });

  const { data: mediaData } = useQuery({
    queryKey: ["viagem-form-media", listingId],
    enabled: isEdit && !!listingId,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_media") as any)
        .select("id, original_storage_path, sort_order")
        .eq("listing_id", listingId)
        .order("sort_order");
      return data || [];
    },
  });

  // Contatos moram em travel_listing_contacts (não em travel_listings) —
  // sem esta query os campos apareciam vazios ao editar.
  const { data: contactRow } = useQuery({
    queryKey: ["viagem-form-contacts", listingId],
    enabled: isEdit && !!listingId,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listing_contacts") as any)
        .select("whatsapp_e164, email")
        .eq("listing_id", listingId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!contactRow) return;
    setForm(prev => ({
      ...prev,
      whatsapp: prev.whatsapp || formatBrazilianPhone(contactRow.whatsapp_e164 || ""),
      email: prev.email || contactRow.email || "",
    }));
  }, [contactRow]);

  useEffect(() => {
    // Reseta SEMPRE que mediaData mudar (inclusive p/ vazio): sem isso, ao
    // editar um pacote sem fotos logo após outro COM fotos, as imagens do
    // anterior persistiam — mistura de mídia entre anúncios distintos.
    const mapped: ExistingMedia[] = (mediaData || []).map((m: any) => ({
      id: m.id,
      path: m.original_storage_path,
      url: getTravelMediaUrl(m.original_storage_path) || "",
    }));
    setExistingMedia(mapped);
  }, [mediaData]);

  useEffect(() => {
    if (!existing) return;
    setForm(prev => ({
      title: existing.title || "",
      category: existing.category || "",
      trip_type: existing.trip_type || "nacional",
      destination: existing.destination || "",
      country: existing.country || "Brasil",
      departure_date: existing.departure_date || "",
      return_date: existing.return_date || "",
      duration_days: existing.duration_days ? String(existing.duration_days) : "",
      available_spots: existing.available_spots ? String(existing.available_spots) : "",
      entry_price: existing.entry_price || "",
      price_per_person: existing.price_per_person ? String(existing.price_per_person) : "",
      total_price: existing.total_price ? String(existing.total_price) : "",
      not_included: existing.not_included || "",
      installments_available: existing.installments_available || false,
      description: existing.description || "",
      city: existing.city || "",
      state: existing.state || "",
      // contatos vêm de travel_listing_contacts (query própria acima)
      whatsapp: prev.whatsapp,
      email: prev.email,
      latitude: existing.latitude ?? null,
      longitude: existing.longitude ?? null,
      endereco_formatado: existing.endereco_formatado ?? null,
      includes: Object.fromEntries(
        TRAVEL_INCLUDES.map(i => [i.key, existing[`includes_${i.key}`] ?? false])
      ),
    }));
  }, [existing]);

  const set = (key: keyof FormData, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleDeleteExisting = async (id: string) => {
    setDeletingId(id);
    try {
      await (supabase.from("travel_media") as any).delete().eq("id", id);
      setExistingMedia(prev => prev.filter(m => m.id !== id));
      qc.invalidateQueries({ queryKey: ["viagem-form-media", listingId] });
    } catch {
      toast({ title: "Erro ao remover foto", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleReplaceExisting = (idx: number) => {
    replaceIndexRef.current = idx;
    replaceInputRef.current?.click();
  };

  /**
   * mode:
   *  - 'publish' → publica (define published_at)
   *  - 'draft'   → salva como rascunho (não aparece na vitrine)
   *  - 'keep'    → salva alterações mantendo o status atual (edição)
   */
  const handleSave = async (mode: "publish" | "draft" | "keep" = "publish") => {
    if (!user) return;
    if (!form.title.trim() || !form.category) {
      toast({ title: "Preencha o titulo e a categoria.", variant: "destructive" });
      return;
    }
    const targetStatus =
      mode === "publish" ? "published"
      : mode === "draft" ? "draft"
      : (existing?.visibility_status ?? "published");
    setSaving(true);
    try {
      const payload: any = {
        owner_user_id: user.id,
        title: form.title.trim(),
        category: form.category,
        trip_type: form.trip_type,
        destination: form.destination.trim() || null,
        country: form.country.trim() || null,
        departure_date: form.departure_date || null,
        return_date: form.return_date || null,
        duration_days: form.duration_days ? Number(form.duration_days) : null,
        available_spots: form.available_spots ? Number(form.available_spots) : null,
        entry_price: form.entry_price.trim()
          ? (isNaN(Number(form.entry_price.trim())) ? null : Number(form.entry_price.trim()))
          : null,
        price_per_person: form.price_per_person ? Number(form.price_per_person) : null,
        total_price: form.total_price ? Number(form.total_price) : null,
        not_included: form.not_included.trim() || null,
        installments_available: form.installments_available,
        description: form.description.trim() || null,
        city: form.city.trim() || form.destination.trim() || '',
        state: form.state.trim() || '',
        latitude: form.latitude ?? null,
        longitude: form.longitude ?? null,
        endereco_formatado: form.endereco_formatado ?? null,
        visibility_status: targetStatus,
      };
      if (mode === "publish") payload.published_at = new Date().toISOString();
      TRAVEL_INCLUDES.forEach(i => { payload[`includes_${i.key}`] = form.includes[i.key] || false; });

      const textMod = await moderatedText({
        title: form.title.trim(),
        description: form.description.trim() || '',
        category: 'travel',
        price: form.price_per_person ? Number(form.price_per_person) : 0,
        listingId: listingId ?? undefined,
      });

      if (textMod.status === 'blocked') {
        toast({ title: "Texto bloqueado pela RIDV", description: textMod.reason, variant: "destructive" });
        setSaving(false);
        return;
      }

      const isTextApproved = textMod.status === 'approved';
      payload.moderation_status = isTextApproved ? 'approved' : 'pending_ai_analysis';
      payload.ai_status = isTextApproved ? 'approved' : 'queued';
      payload.moderation_reason = textMod.reason;

      // Texto aprovado pela RIDV publica na hora (caminho rápido preservado);
      // texto retido entra na fila do admin (/admin/viagens/moderacao) em vez
      // de ir ao ar sem revisão.
      if (mode === "publish" && !isTextApproved) {
        payload.visibility_status = "pending_review";
        delete payload.published_at;
      }

      let savedId = listingId;
      if (isEdit) {
        const { error: updErr } = await (supabase.from("travel_listings") as any).update(payload).eq("id", listingId);
        if (updErr) throw new Error(updErr.message);
      } else {
        const { data, error: insErr } = await (supabase.from("travel_listings") as any).insert(payload).select("id").single();
        if (insErr) throw new Error(insErr.message);
        savedId = data?.id;
      }

      // Salva contatos em travel_listing_contacts (upsert)
      if (savedId && (form.whatsapp.trim() || form.email.trim())) {
        await (supabase.from("travel_listing_contacts") as any).upsert({
          listing_id: savedId,
          owner_user_id: user.id,
          whatsapp_e164: form.whatsapp.trim() || null,
          email: form.email.trim() || null,
        }, { onConflict: "listing_id" });
      }

      if (savedId && pendingFiles.length > 0) {
        // Resolve o bucket oficial 1x (travel-public se já existir, senão o
        // fallback público) — auto-migra para o oficial sem troca de código.
        const uploadBucket = await resolveTravelUploadBucket();
        for (let idx = 0; idx < pendingFiles.length; idx++) {
          const file = pendingFiles[idx];
          let modRes;
          try {
            modRes = await moderatedUpload(file, {
              fileName: file.name,
              mime: file.type || 'image/jpeg',
              listingId: savedId,
              category: 'travel',
              targetBucket: uploadBucket,
            });
          } catch (modErr: any) {
            toast({ title: "Erro na moderação da foto", description: modErr.message, variant: "destructive" });
            continue;
          }

          if (modRes.status === 'blocked') {
            toast({ title: "Foto bloqueada pelo Viagg-TX8™", description: modRes.reason, variant: "destructive" });
            continue;
          }

          const finalPath = modRes.storagePath || `${user.id}/travel/${savedId}/${Date.now()}_${idx}.jpg`;
          const finalStatus = modRes.status === 'approved' ? 'approved' : 'pending_ai_analysis';

          const { error: mediaErr } = await (supabase.from("travel_media") as any).insert({
            listing_id: savedId,
            owner_user_id: user.id,
            original_storage_path: finalPath,
            public_masked_storage_path: modRes.status === 'approved' ? finalPath : null,
            moderation_status: finalStatus,
            sort_order: idx,
          });
          if (mediaErr) {
            toast({ title: "Erro ao salvar foto", description: mediaErr.message, variant: "destructive" });
          }
        }
      }

      qc.invalidateQueries({ queryKey: ['public-travel'] });
      qc.invalidateQueries({ queryKey: ['public-travel-home'] });
      qc.invalidateQueries({ queryKey: ['viagens-meus-anuncios'] });
      toast({
        title: mode === "draft"
          ? "Rascunho salvo! Publique quando quiser."
          : mode === "keep"
            ? "Alterações salvas!"
            : "Viagem publicada com sucesso!",
      });
      navigate("/anunciante/viagens/meus-anuncios");
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-6 px-4 space-y-8">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/anunciante/viagens/meus-anuncios")} className="p-2 rounded-xl hover:bg-zinc-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-sky-100 text-sky-600 rounded-xl flex items-center justify-center">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-zinc-900">{isEdit ? "Editar viagem" : "Nova viagem"}</h1>
            <p className="text-xs text-zinc-500">Preencha os dados do pacote</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 bg-white rounded-2xl border border-zinc-200 p-5">
        <h2 className="font-black text-zinc-900">Dados da viagem</h2>
        <div>
          <label className="text-xs font-bold text-zinc-600 mb-1 block">Titulo *</label>
          <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Ex: Pacote Cancun 7 dias" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Categoria *</label>
            <Select value={form.category} onValueChange={v => set("category", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {TRAVEL_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Tipo</label>
            <Select value={form.trip_type} onValueChange={v => set("trip_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nacional">Nacional</SelectItem>
                <SelectItem value="internacional">Internacional</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Destino</label>
            <Input value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Cancun, Fernando de Noronha..." />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Pais</label>
            <Input value={form.country} onChange={e => set("country", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Data de saida</label>
            <Input type="date" value={form.departure_date} onChange={e => set("departure_date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Data de retorno</label>
            <Input type="date" value={form.return_date} onChange={e => set("return_date", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Duracao (dias)</label>
            <Input type="number" min="1" value={form.duration_days} onChange={e => set("duration_days", e.target.value)} placeholder="7" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Vagas disponiveis</label>
            <Input type="number" min="1" value={form.available_spots} onChange={e => set("available_spots", e.target.value)} placeholder="20" />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-zinc-600 mb-1 block">O que esta incluso?</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {TRAVEL_INCLUDES.map(inc => (
              <label key={inc.key} className="flex items-center gap-2 text-sm cursor-pointer text-zinc-900 font-medium">
                <input
                  type="checkbox"
                  checked={form.includes[inc.key] || false}
                  onChange={e => set("includes", { ...form.includes, [inc.key]: e.target.checked })}
                  className="rounded"
                />
                {inc.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4 bg-white rounded-2xl border border-zinc-200 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-zinc-900">Fotos</h2>
          <span className="text-[10px] font-bold text-zinc-400">{totalPhotos}/{MAX_PHOTOS}</span>
        </div>

        {/* inputs ocultos */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          const slots = MAX_PHOTOS - totalPhotos;
          const allowed = files.slice(0, Math.max(0, slots));
          if (!allowed.length) return;
          setPendingFiles(prev => [...prev, ...allowed]);
          setPreviews(prev => [...prev, ...allowed.map(f => URL.createObjectURL(f))]);
          e.target.value = "";
        }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          const slots = MAX_PHOTOS - totalPhotos;
          const allowed = files.slice(0, Math.max(0, slots));
          if (!allowed.length) return;
          setPendingFiles(prev => [...prev, ...allowed]);
          setPreviews(prev => [...prev, ...allowed.map(f => URL.createObjectURL(f))]);
          e.target.value = "";
        }} />
        {/* input de substituição de foto existente */}
        <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || replaceIndexRef.current < 0) return;
          const idx = replaceIndexRef.current;
          const media = existingMedia[idx];
          if (!media || !user) return;
          // faz upload do novo arquivo
          let modRes;
          try {
            modRes = await moderatedUpload(file, {
              fileName: file.name,
              mime: file.type || 'image/jpeg',
              listingId: listingId,
              category: 'travel',
              targetBucket: 'travel-public',
            });
          } catch (modErr: any) {
            toast({ title: "Erro na moderação da foto", description: modErr.message, variant: "destructive" });
            return;
          }

          if (modRes.status === 'blocked') {
            toast({ title: "Foto bloqueada pelo Viagg-TX8™", description: modRes.reason, variant: "destructive" });
            return;
          }

          const finalPath = modRes.storagePath || `${user.id}/travel/${listingId}/${Date.now()}_replace.jpg`;
          const finalUrl = modRes.publicUrl || getTravelMediaUrl(finalPath) || "";

          // atualiza o registro no banco
          await (supabase.from("travel_media") as any).update({
            original_storage_path: finalPath,
            public_masked_storage_path: modRes.status === 'approved' ? finalPath : null,
            moderation_status: modRes.status === 'approved' ? 'approved' : 'pending_ai_analysis',
          }).eq("id", media.id);

          // atualiza o preview localmente
          setExistingMedia(prev => prev.map((m, i) => i === idx ? { ...m, url: finalUrl + `?t=${Date.now()}`, path: finalPath } : m));
          toast({ title: modRes.status === 'approved' ? "Foto substituída e aprovada!" : "Foto enviada para análise!" });
          replaceIndexRef.current = -1;
          e.target.value = "";
        }} />

        {(existingMedia.length > 0 || previews.length > 0) ? (
          <div className="grid grid-cols-3 gap-2">
            {/* fotos já salvas no banco */}
            {existingMedia.map((media, i) => (
              <div key={media.id} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 group">
                <img 
                  src={media.url} 
                  alt="" 
                  className="w-full h-full object-cover" 
                  onError={e => {
                      const img = e.currentTarget as HTMLImageElement;
                      if (img.dataset.fallbackTried === "1") { img.style.display = "none"; return; }
                      if (img.src.includes("/travel-public/")) {
                          const fb = img.src.replace("/travel-public/", "/real-estate-original/").split("?")[0];
                          img.dataset.fallbackTried = "1";
                          img.src = fb;
                      } else {
                          img.style.display = "none";
                      }
                  }}
                />
                {deletingId === media.id && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
                {/* botões de ação — aparecem no hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    title="Substituir foto"
                    onClick={() => handleReplaceExisting(i)}
                    className="w-8 h-8 bg-sky-500 hover:bg-sky-400 rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-white" />
                  </button>
                  <button
                    type="button"
                    title="Apagar foto"
                    onClick={() => handleDeleteExisting(media.id)}
                    className="w-8 h-8 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                {/* badge "Salvo" */}
                <span className="absolute bottom-1 left-1 bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase leading-none opacity-80">Salvo</span>
              </div>
            ))}

            {/* novas fotos ainda não salvas */}
            {previews.map((src, i) => (
              <div key={`new-${i}`} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 group">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => {
                      setPendingFiles(prev => prev.filter((_, idx) => idx !== i));
                      setPreviews(prev => prev.filter((_, idx) => idx !== i));
                    }}
                    className="w-8 h-8 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <X className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                {/* badge "Novo" */}
                <span className="absolute bottom-1 left-1 bg-sky-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase leading-none opacity-80">Novo</span>
              </div>
            ))}

            {/* botão adicionar mais */}
            {totalPhotos < MAX_PHOTOS && (
              <div className="aspect-square rounded-xl border-2 border-dashed border-sky-200 flex flex-col items-center justify-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center hover:bg-sky-200 transition-colors">
                  <ImagePlus className="w-5 h-5 text-sky-600" />
                </button>
                <button type="button" onClick={() => cameraInputRef.current?.click()}
                  className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center hover:bg-sky-200 transition-colors">
                  <Camera className="w-5 h-5 text-sky-600" />
                </button>
                <span className="text-[9px] font-bold text-zinc-400">Galeria / Câm.</span>
              </div>
            )}
          </div>
        ) : (
          /* estado inicial: nenhuma foto */
          <div className="flex gap-3">
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 border-2 border-dashed border-sky-200 rounded-2xl p-5 hover:border-sky-400 hover:bg-sky-50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                <ImagePlus className="w-5 h-5 text-sky-600" />
              </div>
              <span className="text-xs font-bold text-zinc-600">Galeria</span>
            </button>
            <button type="button" onClick={() => cameraInputRef.current?.click()}
              className="flex-1 flex flex-col items-center gap-2 border-2 border-dashed border-sky-200 rounded-2xl p-5 hover:border-sky-400 hover:bg-sky-50 transition-all">
              <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                <Camera className="w-5 h-5 text-sky-600" />
              </div>
              <span className="text-xs font-bold text-zinc-600">Câmera</span>
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4 bg-white rounded-2xl border border-zinc-200 p-5">
        <h2 className="font-black text-zinc-900">Descricao e valores</h2>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-zinc-600">Descricao</label>
            <button
              type="button"
              onClick={() => setGlmOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-800 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              Gerar com Viagg-TX8™
            </button>
          </div>

          {/* Painel IA inline */}
          {glmOpen && (
            <div className="mb-2 rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
              <p className="text-[11px] font-bold text-violet-700">Descreva o pacote para o Viagg-TX8™ gerar o texto:</p>
              <Textarea
                value={glmPrompt}
                onChange={e => setGlmPrompt(e.target.value)}
                rows={2}
                placeholder="Ex: Pacote para Cancún, 7 dias, all inclusive, saindo de São Paulo, ideal para casais..."
                className="bg-white border-violet-200 text-zinc-900 placeholder:text-zinc-400 text-xs resize-none"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!glmPrompt.trim() || glmLoading}
                  onClick={async () => {
                    setGlmLoading(true);
                    try {
                      const dest = form.destination || form.title || "destino";
                      const result = await chatCompletion(
                        glmPrompt,
                        undefined,
                        `Você é um especialista em redação de anúncios turísticos. Crie uma descrição atrativa, persuasiva e completa para um pacote de viagem para ${dest}. Use parágrafos curtos, destaque os principais atrativos e escreva em português brasileiro. Máximo 200 palavras. Não use markdown, apenas texto.`
                      );
                      set("description", result.trim());
                      setGlmOpen(false);
                      setGlmPrompt("");
                    } catch {
                      /* noop */
                    } finally {
                      setGlmLoading(false);
                    }
                  }}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7 px-3"
                >
                  {glmLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {glmLoading ? "Gerando…" : "Gerar"}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => setGlmOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <Textarea
            value={form.description}
            onChange={e => set("description", e.target.value)}
            rows={4}
            placeholder="Descreva o pacote, roteiro e diferenciais..."
            className="bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">A partir de</label>
            <Input value={form.entry_price} onChange={e => set("entry_price", e.target.value)} placeholder="R$ 2.990" className="bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Por pessoa</label>
            <Input type="number" value={form.price_per_person} onChange={e => set("price_per_person", e.target.value)} placeholder="2990" className="bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Total</label>
            <Input type="number" value={form.total_price} onChange={e => set("total_price", e.target.value)} placeholder="5980" className="bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400" />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-zinc-600 mb-1 block">Nao incluso</label>
          <Input value={form.not_included} onChange={e => set("not_included", e.target.value)} placeholder="Passagem aerea, refeicoes extras..." className="bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-400" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer text-zinc-900 font-medium">
          <input type="checkbox" checked={form.installments_available} onChange={e => set("installments_available", e.target.checked)} className="rounded" />
          Parcelamento disponivel
        </label>
      </div>

      {/* ── Localização e Contato ── */}
      <div className="space-y-4 bg-white rounded-2xl border border-zinc-200 p-5">
        <h2 className="font-black text-zinc-900">Localização e contato</h2>

        {/* Mapa — mesmo componente do cadastro de lojista */}
        <StoreLocationPicker
          latitude={form.latitude}
          longitude={form.longitude}
          endereco_formatado={form.endereco_formatado}
          onLocationChange={(lat, lng, endereco, details?: ValidAddressDetails) => {
            setForm(prev => ({
              ...prev,
              latitude: lat,
              longitude: lng,
              endereco_formatado: endereco,
              city: details?.cidade || prev.city,
              state: details?.estado || prev.state,
            }));
          }}
        />

        {/* Campos de contato da agência */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block flex items-center gap-1">
              <Phone className="w-3 h-3" /> WhatsApp
            </label>
            <Input
              value={form.whatsapp}
              onChange={e => set("whatsapp", formatBrazilianPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              maxLength={15}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block flex items-center gap-1">
              <Mail className="w-3 h-3" /> E-mail
            </label>
            <Input
              type="email"
              value={form.email}
              onChange={e => set("email", e.target.value)}
              placeholder="agencia@email.com"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {(!isEdit || existing?.visibility_status === "draft") && (
          <Button
            onClick={() => handleSave("draft")}
            disabled={saving}
            variant="outline"
            className="flex-1 border-sky-300 text-sky-700 hover:bg-sky-50 rounded-2xl font-black h-12"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
            Salvar rascunho
          </Button>
        )}
        {isEdit && existing?.visibility_status !== "draft" && (
          <Button
            onClick={() => handleSave("keep")}
            disabled={saving}
            variant="outline"
            className="flex-1 border-sky-300 text-sky-700 hover:bg-sky-50 rounded-2xl font-black h-12"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
            Salvar alteracoes
          </Button>
        )}
        <Button
          onClick={() => handleSave("publish")}
          disabled={saving}
          className="flex-1 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl font-black h-12"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
          {isEdit && existing?.visibility_status === "published" ? "Republicar" : "Publicar viagem"}
        </Button>
      </div>
    </div>
  );
}
