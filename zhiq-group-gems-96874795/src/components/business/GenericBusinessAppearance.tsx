/**
 * GenericBusinessAppearance — "Aparência da {Imobiliária|Revenda|Leilões|
 * Arremates|Empresa|Agência}". Réplica fiel do editor do lojista
 * (MerchantStoreAppearance, que permanece intacto), parametrizada pelo
 * registry BUSINESS_MODULES:
 *  - mesmo schema/sanitização (src/lib/store-theme) e mesmos presets;
 *  - PREVIEW EM TEMPO REAL com os componentes reais (StoreThemeScope +
 *    StorePremiumCard) alimentado pelos anúncios do próprio módulo;
 *  - escrita SÓ via RPC set_business_appearance, com gravação VERIFICADA;
 *  - ao abrir, carrega a ÚLTIMA CONFIGURAÇÃO VÁLIDA salva do módulo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  type StoreAppearance,
  DEFAULT_APPEARANCE,
  STORE_PRESETS,
  FONT_LABELS,
  type FontKey,
  sanitizeAppearance,
} from "@/lib/store-theme";
import { StoreThemeScope } from "@/components/public/store/StoreThemeScope";
import { StorePremiumCard, type StoreProduct } from "@/components/public/store/StorePremiumCard";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import type { BusinessModuleDef } from "@/lib/business-modules";
import {
  Palette, Save, RotateCcw, ExternalLink, Loader2, Image as ImageIcon,
  Monitor, Smartphone, Layers, Type, MousePointerClick, LayoutGrid,
  Sparkles, Paintbrush, SquareStack, Store as StoreIcon, Star, MapPin, CheckCircle2, Info,
} from "lucide-react";

// ─── Controles reutilizáveis (mesmo visual do editor do lojista) ────

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 space-y-4">
      <h3 className="flex items-center gap-2 text-xs font-black text-zinc-800 uppercase tracking-widest">
        <Icon className="w-4 h-4 text-[#FF6A00]" /> {title}
      </h3>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] font-bold text-zinc-600">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-zinc-200 cursor-pointer bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-[76px] h-8 px-1.5 rounded-lg border border-zinc-200 text-[10px] font-mono uppercase text-zinc-700"
          maxLength={7}
        />
      </span>
    </label>
  );
}

function Pills<T extends string | number>({ options, value, onChange }: {
  options: { v: T; l: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all",
            value === o.v
              ? "bg-[#FF6A00] border-[#FF6A00] text-white"
              : "bg-white border-zinc-200 text-zinc-500 hover:border-[#FF6A00]/40"
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function SliderField({ label, value, min, max, step = 1, suffix = "", onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block py-1">
      <span className="flex items-center justify-between text-[11px] font-bold text-zinc-600 mb-1">
        {label} <span className="text-zinc-400 font-mono">{value}{suffix}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#FF6A00]"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between py-1.5"
    >
      <span className="text-[11px] font-bold text-zinc-600">{label}</span>
      <span className={cn("w-10 h-6 rounded-full p-0.5 transition-colors", checked ? "bg-[#FF6A00]" : "bg-zinc-200")}>
        <span className={cn("block w-5 h-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

// ─── Página ─────────────────────────────────────────────────

export default function GenericBusinessAppearance({ module }: { module: BusinessModuleDef }) {
  const { user } = useAuth();
  const { profile, isLoading, saveProfile, saveAppearance } = useBusinessProfile(module);
  const [theme, setTheme] = useState<StoreAppearance>(DEFAULT_APPEARANCE);
  const [savedJson, setSavedJson] = useState<string>("null");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"bg" | "banner" | "logo" | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const bgFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  // "da Imobiliária" / "dos Leilões" / "da Empresa"…
  const gen = module.article === "os" ? "dos" : module.article === "o" ? "do" : "da";

  // Última configuração VÁLIDA salva → preview (só na primeira carga, para
  // não sobrescrever edições em andamento em refetches de foco).
  useEffect(() => {
    if (isLoading || seededRef.current) return;
    seededRef.current = true;
    const current = sanitizeAppearance(profile?.appearance);
    setTheme(current ?? DEFAULT_APPEARANCE);
    setSavedJson(JSON.stringify(current ?? null));
  }, [isLoading, profile]);

  // Anúncios reais do módulo p/ o preview (fallback: amostras)
  const { data: previewProducts = [] } = useQuery<StoreProduct[]>({
    queryKey: ["business-appearance-preview", module.key, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const items = await module.fetchListings(user!.id);
      const out: StoreProduct[] = items.slice(0, 4).map((it) => ({
        id: it.id,
        title: it.title,
        short_description: null,
        image_url: it.imageUrl,
        price: parseFloat(String(it.priceLabel || "0").replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".")) || 0,
        original_price: null,
        price_label: it.priceLabel,
        cta_label: "Ver anúncio",
        tracking_slug: it.id,
        category: module.listingsNoun,
        condition: "new",
        is_active: true,
        is_digital: false,
        is_featured: false,
        created_at: it.createdAt || new Date().toISOString(),
      }));
      if (out.length === 0) {
        out.push(
          { id: "demo-1", title: `Exemplo — anúncio de ${module.listingsNoun}`, short_description: null, image_url: null, price: 1250, original_price: null, price_label: null, cta_label: "Ver anúncio", tracking_slug: "demo", category: module.listingsNoun, condition: "new", is_active: true, is_digital: false, is_featured: true, created_at: new Date().toISOString() },
          { id: "demo-2", title: `Exemplo — destaque de ${module.listingsNoun}`, short_description: null, image_url: null, price: 890, original_price: null, price_label: null, cta_label: "Ver anúncio", tracking_slug: "demo", category: module.listingsNoun, condition: "new", is_active: true, is_digital: false, is_featured: false, created_at: new Date().toISOString() },
        );
      }
      return out;
    },
  });

  const up = (fn: (d: StoreAppearance) => void) => {
    setTheme((t) => {
      const clone: StoreAppearance = JSON.parse(JSON.stringify(t));
      fn(clone);
      return sanitizeAppearance(clone) ?? DEFAULT_APPEARANCE;
    });
  };

  const dirty = useMemo(() => JSON.stringify(theme) !== savedJson, [theme, savedJson]);
  const hasSavedTheme = savedJson !== "null";

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = sanitizeAppearance(theme);
      await saveAppearance(payload);
      setSavedJson(JSON.stringify(payload));
      toast.success(`Aparência ${gen} ${module.noun} salva! 🎨 Já está valendo na sua página pública.`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar a aparência.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Restaurar o visual padrão da plataforma? Sua personalização será removida.")) return;
    setSaving(true);
    try {
      await saveAppearance(null);
      setTheme(DEFAULT_APPEARANCE);
      setSavedJson("null");
      toast.success("Visual padrão restaurado.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao restaurar.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    const saved = savedJson === "null" ? null : sanitizeAppearance(JSON.parse(savedJson));
    setTheme(saved ?? DEFAULT_APPEARANCE);
    toast.info("Voltamos para a última configuração salva.");
  };

  const uploadImage = async (file: File, kind: "bg" | "banner") => {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Máximo 3MB"); return; }
    setUploading(kind);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `business/${module.key}/${user!.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos_lojas").upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("logos_lojas").getPublicUrl(path);
      if (kind === "bg") up((d) => { d.bg.imageUrl = publicUrl; d.bg.type = "image"; });
      else up((d) => { d.banner.imageUrl = publicUrl; d.banner.style = "image"; });
      toast.success("Imagem enviada!");
    } catch (e: any) {
      toast.error(e.message || "Erro no upload");
    } finally {
      setUploading(null);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Máximo 3MB"); return; }
    setUploading("logo");
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `business/${module.key}/${user!.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos_lojas").upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("logos_lojas").getPublicUrl(path);
      await saveProfile({ logo_url: publicUrl });
      toast.success(`Logo ${gen} ${module.noun} atualizada!`);
    } catch (e: any) {
      toast.error(e.message || "Erro no upload da logo");
    } finally {
      setUploading(null);
    }
  };

  const businessName = profile?.display_name || `${module.article === "os" ? "Meus" : "Minha"} ${module.noun}`;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
        <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Carregando aparência…</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-28 lg:px-8 max-w-[1500px] w-full mx-auto space-y-5">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-zinc-200 p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3.5">
          <div
            onClick={() => logoFileRef.current?.click()}
            title={`Clique para alterar a logo ${gen} ${module.noun}`}
            className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/20 cursor-pointer group shrink-0 overflow-hidden border border-zinc-200/80"
          >
            {profile?.logo_url ? (
              <img src={profile.logo_url} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <Palette className="h-7 w-7 text-white" />
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              {uploading === "logo" ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <span className="text-[8px] font-black uppercase text-white tracking-tight text-center leading-tight px-1">Mudar Logo</span>
              )}
            </div>
          </div>
          <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
          <div>
            <h1 className="text-xl font-black text-zinc-900 uppercase tracking-tight">🎨 Aparência {gen} {module.noun}</h1>
            <p className="text-xs font-bold text-zinc-500">
              Personalize sua página pública — o preview reflete na hora, sem salvar.
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
          <button
            onClick={handleReset} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:border-red-300 hover:text-red-500 transition-all disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Padrão
          </button>
          <button
            onClick={handleSave} disabled={saving || !dirty}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider text-white transition-all shadow-lg",
              dirty ? "bg-[#FF6A00] hover:bg-[#E65C00] shadow-[#FF6A00]/25" : "bg-zinc-300 shadow-none cursor-not-allowed"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {dirty ? "Salvar aparência" : "Salvo"}
          </button>
        </div>
      </div>

      {/* STATUS: última configuração válida */}
      <div className={cn(
        "flex flex-wrap items-center gap-2 px-4 py-3 rounded-2xl border text-[11px] font-bold",
        hasSavedTheme ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-zinc-50 border-zinc-200 text-zinc-500"
      )}>
        {hasSavedTheme ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
        {hasSavedTheme ? (
          <>
            Mostrando a última configuração salva {gen} {module.noun}
            {profile?.updated_at ? ` (${new Date(profile.updated_at).toLocaleString("pt-BR")})` : ""}.
            {dirty && (
              <button type="button" onClick={handleRevert} className="underline underline-offset-2 hover:text-emerald-900">
                Descartar edições e voltar para ela
              </button>
            )}
          </>
        ) : (
          <>Ainda não há personalização salva — o preview mostra o visual padrão da plataforma. Configure e salve para publicar.</>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 items-start">
        {/* ══ CONTROLES ══ */}
        <div className="space-y-4 xl:max-h-[calc(100vh-140px)] xl:overflow-y-auto xl:pr-1 custom-scrollbar">

          <Section title="Temas Prontos" icon={Sparkles}>
            <div className="grid grid-cols-2 gap-2">
              {STORE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => { setTheme(p.build()); toast.info(`Tema "${p.label}" aplicado no preview — salve para publicar.`); }}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-xl border text-left transition-all",
                    theme.preset === p.key ? "border-[#FF6A00] bg-[#FF6A00]/5" : "border-zinc-200 hover:border-[#FF6A00]/40"
                  )}
                >
                  <span className="flex shrink-0 rounded-lg overflow-hidden border border-zinc-200">
                    {p.swatch.map((c, i) => (
                      <span key={i} className="w-3.5 h-7" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  <span className="text-[10px] font-black text-zinc-700 uppercase leading-tight">{p.label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title={`Logo ${gen} ${module.noun}`} icon={StoreIcon}>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl border border-zinc-200 overflow-hidden bg-zinc-50 flex items-center justify-center shrink-0">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <StoreIcon className="w-6 h-6 text-zinc-400" />
                )}
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => logoFileRef.current?.click()}
                  disabled={uploading === "logo"}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-dashed border-zinc-300 text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-all bg-white"
                >
                  {uploading === "logo" ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6A00]" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  {profile?.logo_url ? "Trocar logo" : "Enviar logo"}
                </button>
                <span className="text-[10px] font-bold text-zinc-400">Clique para enviar imagem (PNG ou JPG)</span>
              </div>
            </div>
          </Section>

          <Section title="Fundo da Página" icon={Layers}>
            <Pills
              options={[{ v: "solid", l: "Cor" }, { v: "gradient", l: "Gradiente" }, { v: "image", l: "Imagem" }, { v: "pattern", l: "Padrão" }]}
              value={theme.bg.type}
              onChange={(v) => up((d) => { d.bg.type = v as any; })}
            />
            <ColorField label="Cor principal" value={theme.bg.color} onChange={(v) => up((d) => { d.bg.color = v; })} />
            {(theme.bg.type === "gradient" || theme.bg.type === "pattern") && (
              <ColorField label={theme.bg.type === "pattern" ? "Cor do padrão" : "Cor secundária"} value={theme.bg.color2} onChange={(v) => up((d) => { d.bg.color2 = v; })} />
            )}
            {theme.bg.type === "gradient" && (
              <SliderField label="Ângulo" value={theme.bg.angle} min={0} max={360} suffix="°" onChange={(v) => up((d) => { d.bg.angle = v; })} />
            )}
            {theme.bg.type === "pattern" && (
              <Pills
                options={[{ v: "dots", l: "Pontos" }, { v: "grid", l: "Grade" }, { v: "diagonal", l: "Diagonal" }]}
                value={theme.bg.pattern}
                onChange={(v) => up((d) => { d.bg.pattern = v as any; })}
              />
            )}
            {theme.bg.type === "image" && (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bgFileRef.current?.click()}
                    disabled={uploading === "bg"}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-zinc-300 text-[10px] font-black uppercase text-zinc-500 hover:border-[#FF6A00]/50 hover:text-[#FF6A00]"
                  >
                    {uploading === "bg" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    Enviar imagem
                  </button>
                  {theme.bg.imageUrl && (
                    <img src={theme.bg.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-zinc-200" />
                  )}
                </div>
                <input ref={bgFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "bg"); e.target.value = ""; }} />
                <SliderField label="Escurecer (overlay)" value={Math.round(theme.bg.overlay * 100)} min={0} max={80} suffix="%" onChange={(v) => up((d) => { d.bg.overlay = v / 100; })} />
                <SliderField label="Desfoque (blur)" value={theme.bg.blur} min={0} max={12} suffix="px" onChange={(v) => up((d) => { d.bg.blur = v; })} />
              </>
            )}
          </Section>

          <Section title="Banner Superior" icon={StoreIcon}>
            <Pills
              options={[{ v: "color", l: "Cor" }, { v: "gradient", l: "Gradiente" }, { v: "image", l: "Imagem" }]}
              value={theme.banner.style}
              onChange={(v) => up((d) => { d.banner.style = v as any; })}
            />
            <ColorField label="Cor do banner" value={theme.banner.color} onChange={(v) => up((d) => { d.banner.color = v; })} />
            {theme.banner.style === "gradient" && (
              <ColorField label="Cor secundária" value={theme.banner.color2} onChange={(v) => up((d) => { d.banner.color2 = v; })} />
            )}
            {theme.banner.style === "image" && (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bannerFileRef.current?.click()}
                    disabled={uploading === "banner"}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-zinc-300 text-[10px] font-black uppercase text-zinc-500 hover:border-[#FF6A00]/50 hover:text-[#FF6A00]"
                  >
                    {uploading === "banner" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    Enviar imagem
                  </button>
                  {theme.banner.imageUrl && (
                    <img src={theme.banner.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-zinc-200" />
                  )}
                </div>
                <input ref={bannerFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, "banner"); e.target.value = ""; }} />
                <SliderField label="Escurecer (overlay)" value={Math.round(theme.banner.overlay * 100)} min={0} max={80} suffix="%" onChange={(v) => up((d) => { d.banner.overlay = v / 100; })} />
              </>
            )}
            <ColorField label="Cor do texto" value={theme.banner.textColor} onChange={(v) => up((d) => { d.banner.textColor = v; })} />
            <div>
              <span className="block text-[11px] font-bold text-zinc-600 mb-1.5">Altura</span>
              <Pills
                options={[{ v: "compact", l: "Compacto" }, { v: "normal", l: "Normal" }, { v: "tall", l: "Alto" }]}
                value={theme.banner.height}
                onChange={(v) => up((d) => { d.banner.height = v as any; })}
              />
            </div>
          </Section>

          <Section title="Paleta de Cores" icon={Paintbrush}>
            <ColorField label="Cor de destaque" value={theme.colors.primary} onChange={(v) => up((d) => { d.colors.primary = v; })} />
            <ColorField label="Títulos" value={theme.colors.heading} onChange={(v) => up((d) => { d.colors.heading = v; })} />
            <ColorField label="Textos" value={theme.colors.text} onChange={(v) => up((d) => { d.colors.text = v; })} />
            <ColorField label="Preços" value={theme.colors.price} onChange={(v) => up((d) => { d.colors.price = v; })} />
            <ColorField label="Selos/Badges" value={theme.colors.badge} onChange={(v) => up((d) => { d.colors.badge = v; })} />
            <div className="h-px bg-zinc-100 my-1" />
            <ColorField label="Fundo dos cards" value={theme.colors.cardBg} onChange={(v) => up((d) => { d.colors.cardBg = v; })} />
            <ColorField label="Texto dos cards" value={theme.colors.cardText} onChange={(v) => up((d) => { d.colors.cardText = v; })} />
            <ColorField label="Bordas" value={theme.colors.cardBorder} onChange={(v) => up((d) => { d.colors.cardBorder = v; })} />
            <ColorField label="Barras/superfícies" value={theme.colors.surface} onChange={(v) => up((d) => { d.colors.surface = v; })} />
          </Section>

          <Section title="Cards" icon={SquareStack}>
            <SliderField label="Arredondamento" value={theme.cards.radius} min={0} max={32} suffix="px" onChange={(v) => up((d) => { d.cards.radius = v; })} />
            <SliderField label="Espessura da borda" value={theme.cards.borderW} min={0} max={3} suffix="px" onChange={(v) => up((d) => { d.cards.borderW = v; })} />
            <SliderField label="Opacidade do fundo" value={theme.cards.opacity} min={40} max={100} suffix="%" onChange={(v) => up((d) => { d.cards.opacity = v; })} />
            <div>
              <span className="block text-[11px] font-bold text-zinc-600 mb-1.5">Sombra</span>
              <Pills
                options={[{ v: "none", l: "Sem" }, { v: "soft", l: "Suave" }, { v: "strong", l: "Forte" }, { v: "glow", l: "Brilho" }]}
                value={theme.cards.shadow}
                onChange={(v) => up((d) => { d.cards.shadow = v as any; })}
              />
            </div>
            <Toggle label="Efeito vidro (glassmorphism)" checked={theme.cards.glass} onChange={(v) => up((d) => { d.cards.glass = v; if (v && d.cards.opacity > 92) d.cards.opacity = 75; })} />
            <Toggle label="Borda neon iluminada" checked={theme.cards.neon} onChange={(v) => up((d) => { d.cards.neon = v; })} />
          </Section>

          <Section title="Botões" icon={MousePointerClick}>
            <ColorField label="Cor do botão" value={theme.colors.btnBg} onChange={(v) => up((d) => { d.colors.btnBg = v; })} />
            {theme.buttons.style === "gradient" && (
              <ColorField label="2ª cor (gradiente)" value={theme.colors.btnBg2} onChange={(v) => up((d) => { d.colors.btnBg2 = v; })} />
            )}
            <ColorField label="Texto do botão" value={theme.colors.btnText} onChange={(v) => up((d) => { d.colors.btnText = v; })} />
            <div>
              <span className="block text-[11px] font-bold text-zinc-600 mb-1.5">Estilo</span>
              <Pills
                options={[{ v: "solid", l: "Sólido" }, { v: "gradient", l: "Gradiente" }, { v: "outline", l: "Contorno" }]}
                value={theme.buttons.style}
                onChange={(v) => up((d) => { d.buttons.style = v as any; })}
              />
            </div>
            <SliderField label="Arredondamento" value={theme.buttons.radius} min={0} max={24} suffix="px" onChange={(v) => up((d) => { d.buttons.radius = v; })} />
            <Toggle label="Efeito brilho (glow)" checked={theme.buttons.glow} onChange={(v) => up((d) => { d.buttons.glow = v; })} />
          </Section>

          <Section title="Tipografia" icon={Type}>
            <div>
              <span className="block text-[11px] font-bold text-zinc-600 mb-1.5">Fonte</span>
              <Pills
                options={(Object.keys(FONT_LABELS) as FontKey[]).map((k) => ({ v: k, l: FONT_LABELS[k] }))}
                value={theme.font.family}
                onChange={(v) => up((d) => { d.font.family = v as any; })}
              />
            </div>
            <div>
              <span className="block text-[11px] font-bold text-zinc-600 mb-1.5">Títulos</span>
              <Pills
                options={[{ v: "uppercase", l: "MAIÚSCULAS" }, { v: "capitalize", l: "Capitalizado" }, { v: "none", l: "normal" }]}
                value={theme.font.titleCase}
                onChange={(v) => up((d) => { d.font.titleCase = v as any; })}
              />
            </div>
            <div>
              <span className="block text-[11px] font-bold text-zinc-600 mb-1.5">Peso dos títulos</span>
              <Pills
                options={[{ v: 700, l: "Médio" }, { v: 800, l: "Forte" }, { v: 900, l: "Máximo" }]}
                value={theme.font.titleWeight}
                onChange={(v) => up((d) => { d.font.titleWeight = v as any; })}
              />
            </div>
          </Section>

          <Section title="Estilo dos Anúncios" icon={LayoutGrid}>
            <Pills
              options={[
                { v: "carousel", l: "Carrossel" },
                { v: "grid", l: "Grade" },
                { v: "large", l: "Cards grandes" },
                { v: "compact", l: "Compacto" },
              ]}
              value={theme.layout.products}
              onChange={(v) => up((d) => { d.layout.products = v as any; })}
            />
            <p className="text-[10px] text-zinc-400">Vale para a vitrine de {module.listingsNoun} da sua página pública.</p>
          </Section>

          <Section title="Efeitos" icon={Sparkles}>
            <Toggle label="Zoom da foto ao passar o mouse" checked={theme.effects.hoverZoom} onChange={(v) => up((d) => { d.effects.hoverZoom = v; })} />
            <Toggle label="Aparecer suave (fade in)" checked={theme.effects.fadeIn} onChange={(v) => up((d) => { d.effects.fadeIn = v; })} />
            <Toggle label="Fundo fixo (parallax)" checked={theme.effects.parallax} onChange={(v) => up((d) => { d.effects.parallax = v; })} />
          </Section>
        </div>

        {/* ══ PREVIEW EM TEMPO REAL ══ */}
        <div className="xl:sticky xl:top-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
              <p className="text-[11px] font-black text-zinc-700 uppercase tracking-widest flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[#FF6A00]" /> Preview em tempo real
              </p>
              <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-0.5">
                <button onClick={() => setDevice("desktop")}
                  className={cn("p-1.5 rounded-md transition-all", device === "desktop" ? "bg-white shadow text-[#FF6A00]" : "text-zinc-400")}>
                  <Monitor className="w-4 h-4" />
                </button>
                <button onClick={() => setDevice("mobile")}
                  className={cn("p-1.5 rounded-md transition-all", device === "mobile" ? "bg-white shadow text-[#FF6A00]" : "text-zinc-400")}>
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-zinc-100 p-3 sm:p-5 flex justify-center max-h-[78vh] overflow-y-auto custom-scrollbar">
              <div className={cn("w-full transition-all duration-300", device === "mobile" ? "max-w-[390px]" : "max-w-full")}>
                <StoreThemeScope appearance={theme} className="rounded-2xl overflow-hidden border border-zinc-200 shadow-inner">
                  <div className="p-3 sm:p-4 space-y-5 min-h-[560px]">
                    {/* Banner (mock leve com a MESMA classe/tokens do real) */}
                    <div className="st-banner rounded-3xl bg-[#68c7f2] overflow-hidden shadow-xl flex flex-col justify-end">
                      <div className={cn("p-5", device === "mobile" ? "text-center" : "")}>
                        <div className={cn("flex items-center gap-4", device === "mobile" && "flex-col")}>
                          <div className="w-16 h-16 rounded-2xl bg-white p-1 ring-2 ring-white/40 shrink-0 overflow-hidden">
                            {profile?.logo_url ? (
                              <img src={profile.logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              <div className="w-full h-full rounded-xl bg-white/80 flex items-center justify-center">
                                <module.icon className="w-7 h-7 text-[#68c7f2]" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="inline-block text-[8px] font-black uppercase tracking-wider bg-white/25 text-white px-1.5 py-0.5 rounded-md mb-1">
                              {module.noun} Oficial
                            </span>
                            <h2 className="text-2xl font-black text-white leading-none truncate">{businessName}</h2>
                            <p className="flex items-center gap-1 text-[10px] text-white/90 font-bold mt-1 justify-center sm:justify-start">
                              <MapPin className="w-3 h-3" /> {profile?.city || "Sua cidade"} · <Star className="w-3 h-3 fill-current" /> 4.9
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-black/10 border-t border-white/20 px-5 py-2.5 flex items-center gap-2">
                        <span className="st-btn text-[9px] font-black uppercase tracking-wider bg-white text-[#FF6A00] px-3 py-1.5 rounded-lg">Seguir</span>
                        <span className="text-[9px] font-bold text-white/80 uppercase tracking-wider">Página pública {gen} {module.noun}</span>
                      </div>
                    </div>

                    {/* Abas */}
                    <div className="st-surface bg-white/80 rounded-xl px-4 flex items-center gap-5 shadow-sm">
                      <span className="st-tab-active py-3 text-[10px] font-black uppercase tracking-wider border-b-4 border-[#FF6A00] text-[#FF6A00]">Página Principal</span>
                      <span className="py-3 text-[10px] font-black uppercase tracking-wider border-b-4 border-transparent text-zinc-500 capitalize">{module.listingsNoun}</span>
                      <span className="py-3 text-[10px] font-black uppercase tracking-wider border-b-4 border-transparent text-zinc-500 hidden sm:block">Contato</span>
                    </div>

                    {/* Título de seção */}
                    <h3 className="st-heading text-lg font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2 capitalize">
                      <Sparkles className="st-accent w-5 h-5 text-[#FF6A00]" /> {module.listingsNoun} em Destaque
                    </h3>

                    {/* Cards REAIS de anúncio */}
                    <div className={cn(
                      theme.layout.products === "large"
                        ? (device === "mobile" ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-5")
                        : theme.layout.products === "compact"
                        ? (device === "mobile" ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-3 gap-3")
                        : (device === "mobile" ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 lg:grid-cols-3 gap-4")
                    )}>
                      {previewProducts.map((p) => (
                        <StorePremiumCard
                          key={p.id}
                          product={p}
                          isRecentlyAdded={false}
                          onAddToCart={() => toast.info("Preview — botão ilustrativo")}
                          onClick={() => toast.info("Preview — clique ilustrativo")}
                        />
                      ))}
                    </div>
                  </div>
                </StoreThemeScope>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 mt-2 text-center">
            O menu e o rodapé da plataforma Viagg-TX8 não mudam — a personalização vale só para a página pública {gen} {module.noun}.
          </p>
        </div>
      </div>
    </div>
  );
}
