import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plane, Save, ArrowLeft, Camera, ImagePlus, X } from "lucide-react";
import { TRAVEL_CATEGORIES, TRAVEL_INCLUDES } from "@/lib/viagem/travelCategories";
import { useToast } from "@/hooks/use-toast";

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
  includes: Record<string, boolean>;
}

const EMPTY: FormData = {
  title: "", category: "", trip_type: "nacional", destination: "", country: "Brasil",
  departure_date: "", return_date: "", duration_days: "", available_spots: "",
  entry_price: "", price_per_person: "", total_price: "",
  not_included: "", installments_available: false,
  description: "", city: "", state: "", whatsapp: "", email: "",
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
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { data: existing } = useQuery({
    queryKey: ["viagem-form-edit", listingId],
    enabled: isEdit,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("*").eq("id", listingId).single();
      return data;
    },
  });

  useEffect(() => {
    if (!existing) return;
    setForm({
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
      whatsapp: existing.whatsapp || "",
      email: existing.email || "",
      includes: Object.fromEntries(
        TRAVEL_INCLUDES.map(i => [i.key, existing[`includes_${i.key}`] ?? false])
      ),
    });
  }, [existing]);

  const set = (key: keyof FormData, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!user) return;
    if (!form.title.trim() || !form.category) {
      toast({ title: "Preencha o titulo e a categoria.", variant: "destructive" });
      return;
    }
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
        visibility_status: "published",
        published_at: new Date().toISOString(),
      };
      TRAVEL_INCLUDES.forEach(i => { payload[`includes_${i.key}`] = form.includes[i.key] || false; });

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
        for (let idx = 0; idx < pendingFiles.length; idx++) {
          const file = pendingFiles[idx];
          const ext = file.name.split(".").pop() || "jpg";
          const filePath = `${user.id}/travel/${savedId}/${Date.now()}_${idx}.${ext}`;
          const { error: upErr } = await supabase.storage.from("real-estate-original").upload(filePath, file, { contentType: file.type });
          if (upErr) {
            toast({ title: "Erro no upload da foto", description: upErr.message, variant: "destructive" });
            continue;
          }
          const { error: mediaErr } = await (supabase.from("travel_media") as any).insert({
            listing_id: savedId,
            owner_user_id: user.id,
            original_storage_path: filePath,
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
      toast({ title: "Viagem salva com sucesso!" });
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
        <h2 className="font-black text-zinc-900">Fotos</h2>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          const allowed = files.slice(0, Math.max(0, 3 - pendingFiles.length));
          if (!allowed.length) return;
          setPendingFiles(prev => [...prev, ...allowed]);
          setPreviews(prev => [...prev, ...allowed.map(f => URL.createObjectURL(f))]);
          e.target.value = "";
        }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          const allowed = files.slice(0, Math.max(0, 3 - pendingFiles.length));
          if (!allowed.length) return;
          setPendingFiles(prev => [...prev, ...allowed]);
          setPreviews(prev => [...prev, ...allowed.map(f => URL.createObjectURL(f))]);
          e.target.value = "";
        }} />

        {previews.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100">
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setPendingFiles(prev => prev.filter((_, idx) => idx !== i));
                    setPreviews(prev => prev.filter((_, idx) => idx !== i));
                  }}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
            {previews.length < 3 && (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-sky-200 flex flex-col items-center justify-center gap-1 hover:border-sky-400 hover:bg-sky-50 transition-all">
                <ImagePlus className="w-5 h-5 text-sky-500" />
                <span className="text-[10px] font-bold text-sky-500">Mais</span>
              </button>
            )}
          </div>
        ) : (
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
          <label className="text-xs font-bold text-zinc-600 mb-1 block">Descricao</label>
          <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={4} placeholder="Descreva o pacote, roteiro e diferenciais..." />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">A partir de</label>
            <Input value={form.entry_price} onChange={e => set("entry_price", e.target.value)} placeholder="R$ 2.990" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Por pessoa</label>
            <Input type="number" value={form.price_per_person} onChange={e => set("price_per_person", e.target.value)} placeholder="2990" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Total</label>
            <Input type="number" value={form.total_price} onChange={e => set("total_price", e.target.value)} placeholder="5980" />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-zinc-600 mb-1 block">Nao incluso</label>
          <Input value={form.not_included} onChange={e => set("not_included", e.target.value)} placeholder="Passagem aerea, refeicoes extras..." />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer text-zinc-900 font-medium">
          <input type="checkbox" checked={form.installments_available} onChange={e => set("installments_available", e.target.checked)} className="rounded" />
          Parcelamento disponivel
        </label>
      </div>

      <div className="space-y-4 bg-white rounded-2xl border border-zinc-200 p-5">
        <h2 className="font-black text-zinc-900">Localizacao e contato</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Cidade</label>
            <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Sao Paulo" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">Estado (sigla)</label>
            <Input value={form.state} onChange={e => set("state", e.target.value)} maxLength={2} placeholder="SP" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">WhatsApp</label>
            <Input value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-600 mb-1 block">E-mail</label>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="agencia@email.com" />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-2xl font-black h-12">
        {saving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
        {isEdit ? "Salvar alteracoes" : "Publicar viagem"}
      </Button>
    </div>
  );
}
