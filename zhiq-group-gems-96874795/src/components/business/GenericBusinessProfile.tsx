/**
 * GenericBusinessProfile — "Minha {Imobiliária|Revenda|…}" / "Meus {Leilões|
 * Arremates}". Réplica do modelo "Minha Loja" do lojista (intacto),
 * parametrizada pelo registry BUSINESS_MODULES:
 *  - identidade pública (nome, descrição, logo, banner, horário, WhatsApp,
 *    redes sociais, cidade/UF) — grava via RPC upsert_business_profile
 *    com confirmação de persistência;
 *  - preview do cabeçalho público REAL (StoreHeader + tema do módulo);
 *  - gestão dos anúncios DESTE módulo (lista + atalhos p/ editar/gerenciar).
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { sanitizeAppearance } from "@/lib/store-theme";
import { StoreThemeScope } from "@/components/public/store/StoreThemeScope";
import { StoreHeader } from "@/components/public/store/StoreHeader";
import { useBusinessProfile, type BusinessProfileRow } from "@/hooks/useBusinessProfile";
import type { BusinessModuleDef, BusinessListingItem } from "@/lib/business-modules";
import { viaggAI } from "@/lib/viaggAI";
import {
  Save, Loader2, ExternalLink, Palette, Image as ImageIcon, Package,
  Clock, Phone, Instagram, Facebook, Globe, Mail, MapPin, PencilLine, Plus, Sparkles,
} from "lucide-react";

type FormState = {
  display_name: string;
  description: string;
  opening_hours: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  site: string;
  email: string;
  city: string;
  state: string;
};

const emptyForm: FormState = {
  display_name: "", description: "", opening_hours: "", whatsapp: "",
  instagram: "", facebook: "", site: "", email: "", city: "", state: "",
};

function formFromProfile(p: BusinessProfileRow | null): FormState {
  return {
    display_name: p?.display_name ?? "",
    description: p?.description ?? "",
    opening_hours: p?.opening_hours ?? "",
    whatsapp: p?.whatsapp ?? "",
    instagram: p?.instagram ?? "",
    facebook: p?.facebook ?? "",
    site: p?.site ?? "",
    email: p?.email ?? "",
    city: p?.city ?? "",
    state: p?.state ?? "",
  };
}

function Field({ label, icon: Icon, value, onChange, placeholder, textarea }: {
  label: string; icon?: any; value: string; onChange: (v: string) => void;
  placeholder?: string; textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-[11px] font-black text-zinc-600 uppercase tracking-wider mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-[#FF6A00]" />} {label}
      </span>
      {textarea ? (
        <textarea
          value={value} placeholder={placeholder} rows={4}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60 resize-y"
        />
      ) : (
        <input
          type="text" value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60"
        />
      )}
    </label>
  );
}

export default function GenericBusinessProfile({ module }: { module: BusinessModuleDef }) {
  const { user } = useAuth();
  const { profile, isLoading, saveProfile } = useBusinessProfile(module);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  const gen = module.article === "os" ? "dos" : module.article === "o" ? "do" : "da";
  const meu = module.article === "os" ? "Meus" : "Minha";

  useEffect(() => {
    if (isLoading || seededRef.current) return;
    seededRef.current = true;
    setForm(formFromProfile(profile));
  }, [isLoading, profile]);

  const { data: listings = [], isLoading: loadingListings } = useQuery<BusinessListingItem[]>({
    queryKey: ["business-profile-listings", module.key, user?.id],
    enabled: !!user?.id,
    queryFn: () => module.fetchListings(user!.id),
  });

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveProfile(form);
      toast.success(`Dados ${gen} ${module.noun} salvos! Já estão valendo na página pública.`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  // ✨ IA: gera/melhora a descrição usando o contexto real do negócio
  // (nome, cidade e títulos dos anúncios publicados deste módulo).
  const handleGenerateDescription = async () => {
    setGenerating(true);
    try {
      const text = await viaggAI.generateBusinessDescription({
        businessType: `${module.noun} que anuncia ${module.listingsNoun}`,
        name: form.display_name || profile?.display_name || undefined,
        city: form.city || profile?.city || undefined,
        state: form.state || profile?.state || undefined,
        listings: listings.map((l) => l.title),
        currentText: form.description || undefined,
      });
      if (!text) throw new Error("A IA não retornou texto — tente novamente.");
      setForm((f) => ({ ...f, description: text }));
      toast.success("Descrição gerada! Revise, ajuste se quiser e clique em Salvar dados.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar a descrição com IA.");
    } finally {
      setGenerating(false);
    }
  };

  const uploadImage = async (file: File, kind: "logo" | "banner") => {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Máximo 3MB"); return; }
    setUploading(kind);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `business/${module.key}/${user!.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos_lojas").upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("logos_lojas").getPublicUrl(path);
      await saveProfile(kind === "logo" ? { logo_url: publicUrl } : { banner_url: publicUrl });
      toast.success(kind === "logo" ? "Logo atualizada!" : "Banner atualizado!");
    } catch (e: any) {
      toast.error(e.message || "Erro no upload");
    } finally {
      setUploading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Carregando {module.noun.toLowerCase()}…</p>
      </div>
    );
  }

  const appearance = sanitizeAppearance(profile?.appearance);
  const previewStore = {
    store_name: form.display_name || profile?.display_name || `${meu} ${module.noun}`,
    city: form.city || profile?.city || null,
    region: form.state || profile?.state || null,
    bairro: null,
    logradouro: null,
    logo_url: profile?.logo_url || null,
    banner_url: profile?.banner_url || null,
    description: form.description || profile?.description || null,
    categoria: module.profileType,
  } as any;

  return (
    <div className="px-4 pt-4 pb-28 lg:px-8 max-w-[1300px] w-full mx-auto space-y-5">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-zinc-200 p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/20 shrink-0 overflow-hidden">
            {profile?.logo_url ? (
              <img src={profile.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <module.icon className="h-7 w-7 text-white" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-black text-zinc-900 uppercase tracking-tight">{meu} {module.noun}</h1>
            <p className="text-xs font-bold text-zinc-500">
              Configure a identidade pública {gen} {module.noun} — tudo reflete na hora na sua página.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.id && (
            <a
              href={module.publicPathFor(user.id)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:border-[#FF6A00]/50 hover:text-[#FF6A00] transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver página pública
            </a>
          )}
          <Link
            to={module.appearancePath}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:border-[#FF6A00]/50 hover:text-[#FF6A00] transition-all"
          >
            <Palette className="h-3.5 w-3.5" /> {module.appearanceMenuLabel}
          </Link>
          <button
            onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider text-white bg-[#FF6A00] hover:bg-[#E65C00] transition-all shadow-lg shadow-[#FF6A00]/25 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar dados
          </button>
        </div>
      </div>

      {/* PREVIEW DO CABEÇALHO PÚBLICO (componente real + tema do módulo) */}
      <StoreThemeScope appearance={appearance} className="rounded-3xl overflow-hidden">
        <StoreHeader
          store={previewStore}
          productsCount={listings.length}
          profileType={module.profileType}
          compact
        />
      </StoreThemeScope>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ══ IDENTIDADE ══ */}
        <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-4">
          <h2 className="text-xs font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2">
            <PencilLine className="w-4 h-4 text-[#FF6A00]" /> Identidade pública
          </h2>

          {/* Logo + Banner */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider">Logo</span>
              <button
                type="button"
                onClick={() => logoFileRef.current?.click()}
                disabled={uploading === "logo"}
                className="w-full h-24 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 hover:border-[#FF6A00]/60 transition-all flex items-center justify-center overflow-hidden"
              >
                {uploading === "logo" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#FF6A00]" />
                ) : profile?.logo_url ? (
                  <img src={profile.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-zinc-400 text-[10px] font-bold uppercase"><ImageIcon className="w-5 h-5" /> Enviar logo</span>
                )}
              </button>
              <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "logo"); e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <span className="block text-[11px] font-black text-zinc-600 uppercase tracking-wider">Banner / Foto de capa</span>
              <button
                type="button"
                onClick={() => bannerFileRef.current?.click()}
                disabled={uploading === "banner"}
                className="w-full h-24 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 hover:border-[#FF6A00]/60 transition-all flex items-center justify-center overflow-hidden"
              >
                {uploading === "banner" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[#FF6A00]" />
                ) : profile?.banner_url ? (
                  <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-zinc-400 text-[10px] font-bold uppercase"><ImageIcon className="w-5 h-5" /> Enviar banner</span>
                )}
              </button>
              <input ref={bannerFileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "banner"); e.target.value = ""; }} />
            </div>
          </div>

          <Field label={`Nome ${gen} ${module.noun}`} value={form.display_name} onChange={set("display_name")} placeholder={`Ex.: ${module.noun} Silva & Filhos`} />

          {/* Descrição com assistente de IA (viagg-ai) */}
          <label className="block">
            <span className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-black text-zinc-600 uppercase tracking-wider">Descrição</span>
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={generating}
                title="A IA escreve a descrição usando o nome, a cidade e seus anúncios publicados"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[10px] font-black uppercase tracking-wider hover:bg-violet-100 transition-all disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {generating ? "Gerando…" : form.description ? "Melhorar com IA" : "Gerar com IA"}
              </button>
            </span>
            <textarea
              value={form.description}
              placeholder="Conte aos clientes o que você oferece… ou clique em Gerar com IA"
              rows={4}
              onChange={(e) => set("description")(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60 resize-y"
            />
          </label>
          <Field label="Horário de atendimento" icon={Clock} value={form.opening_hours} onChange={set("opening_hours")} placeholder="Seg a Sex 8h–18h · Sáb 8h–12h" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade" icon={MapPin} value={form.city} onChange={set("city")} placeholder="Aripuanã" />
            <Field label="UF" value={form.state} onChange={set("state")} placeholder="MT" />
          </div>
        </div>


      </div>

      {/* ══ ANÚNCIOS DO MÓDULO ══ */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-black text-zinc-800 uppercase tracking-widest flex items-center gap-2 capitalize">
            <Package className="w-4 h-4 text-[#FF6A00]" /> {module.listingsNoun} publicados ({listings.length})
          </h2>
          <Link
            to={module.manageListingsPath}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] text-[11px] font-black uppercase tracking-wider hover:bg-[#FF6A00]/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Gerenciar anúncios
          </Link>
        </div>

        {loadingListings ? (
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando anúncios…
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <p className="text-sm font-black text-zinc-500 uppercase">Nenhum anúncio publicado ainda</p>
            <p className="text-xs text-zinc-400">Publique seu primeiro anúncio para ele aparecer aqui e na sua página pública.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {listings.map((it) => {
              const card = (
                <div className={cn(
                  "rounded-2xl border border-zinc-200 overflow-hidden bg-white hover:shadow-md transition-all h-full flex flex-col",
                  !it.isActive && "opacity-60"
                )}>
                  <div className="h-28 bg-zinc-100 flex items-center justify-center overflow-hidden">
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <module.icon className="w-8 h-8 text-zinc-300" />
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <p className="text-[11px] font-black text-zinc-800 leading-tight line-clamp-2">{it.title}</p>
                    {it.priceLabel && <p className="text-[11px] font-black text-[#FF6A00]">{it.priceLabel}</p>}
                    <span className={cn(
                      "mt-auto inline-flex w-fit text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                      it.isActive ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                    )}>
                      {it.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              );
              return it.editHref ? (
                <Link key={it.id} to={it.editHref} className="block h-full">{card}</Link>
              ) : (
                <Link key={it.id} to={module.manageListingsPath} className="block h-full">{card}</Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
