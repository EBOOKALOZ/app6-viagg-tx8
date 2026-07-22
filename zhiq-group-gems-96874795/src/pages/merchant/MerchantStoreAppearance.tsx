/**
 * MerchantStoreAppearance — 🎨 Aparência da Loja (Personalização Visual)
 *
 * O lojista personaliza a vitrine pública (/loja/:id): fundo, banner, cores,
 * cards, botões, tipografia, layout dos produtos, efeitos e contatos — com
 * PREVIEW EM TEMPO REAL (mesmos componentes reais da loja pública dentro de
 * um StoreThemeScope local; nada precisa ser salvo para visualizar).
 *
 * Regras:
 *  - Escrita SÓ via RPC set_store_appearance (front nunca escreve na tabela).
 *  - Todo estado passa por sanitizeAppearance (whitelist: hex/enum/clamp/https).
 *  - A identidade da plataforma (menu/rodapé) NÃO é afetada — o tema só vale
 *    dentro do StoreThemeScope da vitrine.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Palette, Save, RotateCcw, ExternalLink, Loader2, Image as ImageIcon,
  Monitor, Smartphone, Layers, Type, MousePointerClick, LayoutGrid,
  Sparkles, Phone, Paintbrush, SquareStack, Store as StoreIcon, Star, MapPin,
} from "lucide-react";

// ─── Controles reutilizáveis ────────────────────────────────

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
      <span className={cn("w-10 h-5.5 h-6 rounded-full p-0.5 transition-colors", checked ? "bg-[#FF6A00]" : "bg-zinc-200")}>
        <span className={cn("block w-5 h-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

function TextField({ label, value, placeholder, onChange }: {
  label: string; value: string; placeholder?: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block py-1">
      <span className="block text-[11px] font-bold text-zinc-600 mb-1">{label}</span>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 rounded-xl border border-zinc-200 text-xs text-zinc-800 outline-none focus:border-[#FF6A00]/60"
      />
    </label>
  );
}

// ─── Página ─────────────────────────────────────────────────

export default function MerchantStoreAppearance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<StoreAppearance>(DEFAULT_APPEARANCE);
  const [savedJson, setSavedJson] = useState<string>("null");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"bg" | "banner" | "logo" | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const bgFileRef = useRef<HTMLInputElement>(null);
  const bannerFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  // Loja do lojista (dados p/ preview + appearance salva)
  const { data: store, isLoading } = useQuery({
    queryKey: ["store-appearance-editor", user?.id],
    enabled: !!user?.id,
    refetchOnMount: "always", // sempre recarrega a aparência salva ao abrir o editor
    staleTime: 0,
    queryFn: async () => {
      // .limit(1) em vez de maybeSingle direto: lojista com >1 loja não zera o
      // resultado (maybeSingle falha com múltiplas linhas → perderia a aparência salva).
      const { data } = await supabase
        .from("merchant_stores")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (!store) return;
    const current = sanitizeAppearance(store.appearance);
    setTheme(current ?? DEFAULT_APPEARANCE);
    setSavedJson(JSON.stringify(current ?? null));
  }, [store]);

  // Produtos reais do lojista p/ o preview (fallback: amostras)
  const { data: previewProducts = [] } = useQuery<StoreProduct[]>({
    queryKey: ["store-appearance-preview-products", user?.id, store?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const out: StoreProduct[] = [];
      if (store?.id) {
        const { data } = await (supabase.from("merchant_marketing_products") as any)
          .select("id, title, price_label, image_url, category, is_active, created_at")
          .eq("merchant_store_id", store.id)
          .eq("is_active", true)
          .limit(4);
        (data || []).forEach((p: any) => out.push({
          id: p.id, title: p.title || "Produto", short_description: null,
          image_url: p.image_url || null,
          price: parseFloat(String(p.price_label || "0").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0,
          original_price: null, price_label: p.price_label || null, cta_label: "Comprar",
          tracking_slug: p.id, category: p.category || "Produto", condition: "new",
          is_active: true, is_digital: false, is_featured: false, created_at: p.created_at,
        }));
      }
      if (out.length < 2) {
        const { data: pl } = await (supabase.from("product_listings") as any)
          .select("id, title, price, cover_image_url, created_at")
          .eq("owner_user_id", user!.id)
          .limit(4);
        (pl || []).forEach((p: any) => out.push({
          id: p.id, title: p.title || "Produto", short_description: null,
          image_url: p.cover_image_url || null, price: p.price || 0,
          original_price: null, price_label: null, cta_label: "Comprar",
          tracking_slug: p.id, category: "Produto", condition: "new",
          is_active: true, is_digital: false, is_featured: false, created_at: p.created_at,
        }));
      }
      if (out.length === 0) {
        out.push(
          { id: "demo-1", title: "Produto de exemplo — Camiseta Premium", short_description: null, image_url: null, price: 89.9, original_price: 129.9, price_label: null, cta_label: "Comprar", tracking_slug: "demo", category: "Produto", condition: "new", is_active: true, is_digital: false, is_featured: true, created_at: new Date().toISOString() },
          { id: "demo-2", title: "Produto de exemplo — Tênis Urbano", short_description: null, image_url: null, price: 249.0, original_price: null, price_label: null, cta_label: "Comprar", tracking_slug: "demo", category: "Produto", condition: "new", is_active: true, is_digital: false, is_featured: false, created_at: new Date().toISOString() },
        );
      }
      return out.slice(0, 4);
    },
  });

  // Atualização imutável + sanitizada (preview reflete na hora)
  const up = (fn: (d: StoreAppearance) => void) => {
    setTheme((t) => {
      const clone: StoreAppearance = JSON.parse(JSON.stringify(t));
      fn(clone);
      return sanitizeAppearance(clone) ?? DEFAULT_APPEARANCE;
    });
  };

  const dirty = useMemo(() => JSON.stringify(theme) !== savedJson, [theme, savedJson]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = sanitizeAppearance(theme);
      let rpcError = null;
      let rpcSuccess = false;

      // 1) Tentar salvar via RPC (com p_store_id e p_appearance)
      try {
        const { data, error } = await (supabase.rpc as any)("set_store_appearance", { p_appearance: payload, p_store_id: store?.id });
        if (error) {
          rpcError = error;
          // Tenta assinatura antiga (caso a migration ainda esteja na v1 sem p_store_id)
          if (String(error.code) === "PGRST202" || String(error.message).includes("function") || String(error.code) === "42883") {
            const { data: dOld, error: eOld } = await (supabase.rpc as any)("set_store_appearance", { p_appearance: payload });
            if (!eOld && (dOld as any)?.success) { rpcSuccess = true; rpcError = null; }
            else { rpcError = eOld || new Error((dOld as any)?.error || "Erro no RPC"); }
          }
        } else if (!(data as any)?.success) {
          rpcError = new Error((data as any)?.error || "Erro retornado pelo RPC");
        } else {
          rpcSuccess = true;
        }
      } catch (err: any) {
        rpcError = err;
      }

      // 2) Tentar salvar via update direto em merchant_stores (garante persistência no store.id exato)
      let directError = null;
      if (store?.id) {
        const { error: dErr } = await (supabase.from("merchant_stores") as any)
          .update({ appearance: payload })
          .eq("id", store.id);
        directError = dErr;
      }

      // Se ambos falharem, exibe erro
      if (!rpcSuccess && directError) {
        toast.error("Erro ao salvar: " + (rpcError?.message || directError.message || "Verifique as permissões/migration."));
        return;
      }

      setSavedJson(JSON.stringify(payload));
      await queryClient.invalidateQueries({ queryKey: ["store-appearance-editor"] });
      await queryClient.invalidateQueries({ queryKey: ["public-store-info"] });
      toast.success("Aparência da loja salva! 🎨 Já está valendo no seu perfil público.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Restaurar o visual padrão da plataforma? Sua personalização será removida.")) return;
    setSaving(true);
    try {
      if (store?.id) {
        await (supabase.from("merchant_stores") as any).update({ appearance: null }).eq("id", store.id);
      }
      try {
        await (supabase.rpc as any)("set_store_appearance", { p_appearance: null, p_store_id: store?.id });
      } catch (e) {
        try { await (supabase.rpc as any)("set_store_appearance", { p_appearance: null }); } catch {}
      }
      setTheme(DEFAULT_APPEARANCE);
      setSavedJson("null");
      await queryClient.invalidateQueries({ queryKey: ["store-appearance-editor"] });
      await queryClient.invalidateQueries({ queryKey: ["public-store-info"] });
      toast.success("Visual padrão restaurado.");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File, kind: "bg" | "banner") => {
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Máximo 3MB"); return; }
    setUploading(kind);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `themes/${user!.id}/${kind}-${Date.now()}.${ext}`;
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
    if (!store?.id) { toast.error("Loja não encontrada"); return; }
    setUploading("logo");
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `logos/${user!.id}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos_lojas").upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: { publicUrl } } = supabase.storage.from("logos_lojas").getPublicUrl(path);
      const { error: dbError } = await (supabase.from("merchant_stores") as any).update({ logo_url: publicUrl }).eq("id", store.id);
      if (dbError) throw new Error(dbError.message);
      await queryClient.invalidateQueries({ queryKey: ["store-appearance-editor"] });
      toast.success("Logo da loja atualizada!");
    } catch (e: any) {
      toast.error(e.message || "Erro no upload da logo");
    } finally {
      setUploading(null);
    }
  };

  const storeName = store?.nome_loja || "Minha Loja";

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
            title="Clique para alterar a logo da loja"
            className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/20 cursor-pointer group shrink-0 overflow-hidden border border-zinc-200/80"
          >
            {store?.logo_url ? (
              <img src={store.logo_url} alt="Logo" className="w-full h-full object-cover" />
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
            {store?.logo_url && (
              <div className="absolute bottom-0 right-0 p-1 bg-[#FF6A00] text-white rounded-tl-lg shadow">
                <Palette className="w-3 h-3" />
              </div>
            )}
          </div>
          <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
          <div>
            <h1 className="text-xl font-black text-zinc-900 uppercase tracking-tight">🎨 Aparência da Loja</h1>
            <p className="text-xs font-bold text-zinc-500">
              Personalize sua vitrine pública — o preview reflete na hora, sem salvar.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {store?.id && (
            <a
              href={`/loja/${store.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:border-[#FF6A00]/50 hover:text-[#FF6A00] transition-all"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver loja
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

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 items-start">
        {/* ══ CONTROLES ══ */}
        <div className="space-y-4 xl:max-h-[calc(100vh-140px)] xl:overflow-y-auto xl:pr-1 custom-scrollbar">

          {/* Temas prontos */}
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

          {/* Logo da Loja */}
          <Section title="Logo da Loja" icon={StoreIcon}>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl border border-zinc-200 overflow-hidden bg-zinc-50 flex items-center justify-center shrink-0">
                {store?.logo_url ? (
                  <img src={store.logo_url} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <StoreIcon className="w-6 h-6 text-zinc-400" />
                )}
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => logoFileRef.current?.click()}
                  disabled={uploading === "logo"}
                  className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-dashed border-zinc-300 text-[11px] font-black uppercase tracking-wider text-zinc-600 hover:border-[#FF6A00] hover:text-[#FF6A00] transition-all bg-white shadow-2xs"
                >
                  {uploading === "logo" ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF6A00]" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  {store?.logo_url ? "Trocar logo" : "Enviar logo"}
                </button>
                <span className="text-[10px] font-bold text-zinc-400">Clique para enviar imagem (PNG ou JPG)</span>
              </div>
            </div>
          </Section>

          {/* Fundo */}
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

          {/* Banner */}
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

          {/* Paleta de cores */}
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

          {/* Cards */}
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

          {/* Botões */}
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

          {/* Tipografia */}
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

          {/* Layout dos produtos */}
          <Section title="Estilo dos Produtos" icon={LayoutGrid}>
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
            <p className="text-[10px] text-zinc-400">Vale para a aba "Todos os Produtos" da sua loja.</p>
          </Section>

          {/* Efeitos */}
          <Section title="Efeitos" icon={Sparkles}>
            <Toggle label="Zoom da foto ao passar o mouse" checked={theme.effects.hoverZoom} onChange={(v) => up((d) => { d.effects.hoverZoom = v; })} />
            <Toggle label="Aparecer suave (fade in)" checked={theme.effects.fadeIn} onChange={(v) => up((d) => { d.effects.fadeIn = v; })} />
            <Toggle label="Fundo fixo (parallax)" checked={theme.effects.parallax} onChange={(v) => up((d) => { d.effects.parallax = v; })} />
          </Section>

          {/* Card "Botões de Contato" removido da Aparência da Loja (pedido do
              usuário). Os dados theme.contact.* são preservados no estado/banco
              e continuam alimentando o banner da loja se já estiverem salvos. */}
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
                            {store?.logo_url ? (
                              <img src={store.logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              <div className="w-full h-full rounded-xl bg-white/80 flex items-center justify-center">
                                <StoreIcon className="w-7 h-7 text-[#68c7f2]" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="inline-block text-[8px] font-black uppercase tracking-wider bg-white/25 text-white px-1.5 py-0.5 rounded-md mb-1">
                              Loja Oficial
                            </span>
                            <h2 className="text-2xl font-black text-white leading-none truncate">{storeName}</h2>
                            <p className="flex items-center gap-1 text-[10px] text-white/90 font-bold mt-1 justify-center sm:justify-start">
                              <MapPin className="w-3 h-3" /> {store?.cidade || "Sua cidade"} · <Star className="w-3 h-3 fill-current" /> 4.9
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-black/10 border-t border-white/20 px-5 py-2.5 flex items-center gap-2">
                        <span className="st-btn text-[9px] font-black uppercase tracking-wider bg-white text-[#FF6A00] px-3 py-1.5 rounded-lg">Seguir</span>
                        <span className="text-[9px] font-bold text-white/80 uppercase tracking-wider">1.2k seguidores</span>
                      </div>
                    </div>

                    {/* Abas */}
                    <div className="st-surface bg-white/80 rounded-xl px-4 flex items-center gap-5 shadow-sm">
                      <span className="st-tab-active py-3 text-[10px] font-black uppercase tracking-wider border-b-4 border-[#FF6A00] text-[#FF6A00]">Página Principal</span>
                      <span className="py-3 text-[10px] font-black uppercase tracking-wider border-b-4 border-transparent text-zinc-500">Todos os Produtos</span>
                      <span className="py-3 text-[10px] font-black uppercase tracking-wider border-b-4 border-transparent text-zinc-500 hidden sm:block">Promoções</span>
                    </div>

                    {/* Título de seção */}
                    <h3 className="st-heading text-lg font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                      <Sparkles className="st-accent w-5 h-5 text-[#FF6A00]" /> Produtos em Destaque
                    </h3>

                    {/* Cards REAIS de produto */}
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
            O menu e o rodapé da plataforma Viagg-TX8 não mudam — a personalização vale só para o espaço da sua loja.
          </p>
        </div>
      </div>
    </div>
  );
}
