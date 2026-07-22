/**
 * store-theme — Personalização visual do Perfil Público da Loja.
 *
 * Fonte única do schema `appearance` (merchant_stores.appearance JSONB):
 *   tipos, defaults (= visual atual da plataforma), sanitização e temas prontos.
 *
 * SEGURANÇA: nenhum CSS/HTML arbitrário. Todo valor passa por whitelist:
 *   cores = hex #RRGGBB · enums fechados · números com clamp · URLs https.
 * A sanitização roda no SAVE (editor) e no LOAD (perfil público) — mesmo que
 * o JSON no banco seja adulterado, só sai token válido.
 */
import type { CSSProperties } from "react";

// ─── Tipos ───────────────────────────────────────────────────

export type BgType = "solid" | "gradient" | "image" | "pattern";
export type PatternKey = "dots" | "grid" | "diagonal";
export type ShadowKey = "none" | "soft" | "strong" | "glow";
export type ButtonStyle = "solid" | "gradient" | "outline";
export type ProductLayout = "carousel" | "grid" | "large" | "compact";
export type FontKey = "padrao" | "moderna" | "elegante" | "arredondada" | "mono" | "condensada";
export type TitleCase = "uppercase" | "none" | "capitalize";
export type BannerStyle = "color" | "gradient" | "image";
export type BannerHeight = "compact" | "normal" | "tall";

export interface StoreAppearance {
  v: 1;
  preset: string | null;
  bg: {
    type: BgType;
    color: string;
    color2: string;
    angle: number;          // gradiente, 0-360
    imageUrl: string | null;
    pattern: PatternKey;
    overlay: number;        // 0-0.8 escurecimento sobre imagem/padrão
    blur: number;           // 0-12px, só p/ imagem de fundo
  };
  banner: {
    style: BannerStyle;
    color: string;
    color2: string;
    imageUrl: string | null;
    overlay: number;        // 0-0.8
    height: BannerHeight;
    textColor: string;
  };
  colors: {
    primary: string;   // destaque/abas/links ativos
    heading: string;   // títulos de seção
    text: string;      // textos secundários
    price: string;
    badge: string;     // selos de desconto
    cardBg: string;
    cardText: string;
    cardBorder: string;
    surface: string;   // barras/superfícies (abas, sidebar)
    btnBg: string;
    btnBg2: string;    // 2ª cor do gradiente do botão
    btnText: string;
  };
  cards: {
    radius: number;    // 0-32
    shadow: ShadowKey;
    borderW: number;   // 0-3
    opacity: number;   // 40-100 (%) — glassmorphism com <100 + glass
    glass: boolean;    // backdrop blur
    neon: boolean;     // borda iluminada na cor primária
  };
  buttons: {
    radius: number;    // 0-24
    style: ButtonStyle;
    glow: boolean;
  };
  font: {
    family: FontKey;
    titleCase: TitleCase;
    titleWeight: 700 | 800 | 900;
  };
  layout: { products: ProductLayout };
  effects: { hoverZoom: boolean; fadeIn: boolean; parallax: boolean };
  contact: {
    whatsapp: string;   // dígitos
    phone: string;      // dígitos
    instagram: string;  // handle sem @
    facebook: string;   // URL https
    site: string;       // URL https
    email: string;
  };
}

// ─── Defaults = visual ATUAL da loja (sem tema nada muda) ───

export const DEFAULT_APPEARANCE: StoreAppearance = {
  v: 1,
  preset: null,
  bg: { type: "solid", color: "#F5E62B", color2: "#FFD400", angle: 160, imageUrl: null, pattern: "dots", overlay: 0, blur: 0 },
  banner: { style: "color", color: "#68c7f2", color2: "#3BA7DD", imageUrl: null, overlay: 0.25, height: "normal", textColor: "#FFFFFF" },
  colors: {
    primary: "#FF6A00",
    heading: "#18181B",
    text: "#71717A",
    price: "#18181B",
    badge: "#FF6A00",
    cardBg: "#FFFFFF",
    cardText: "#27272A",
    cardBorder: "#E4E4E7",
    surface: "#FFFFFF",
    btnBg: "#FF6A00",
    btnBg2: "#FF8C33",
    btnText: "#FFFFFF",
  },
  cards: { radius: 24, shadow: "soft", borderW: 1, opacity: 100, glass: false, neon: false },
  buttons: { radius: 12, style: "solid", glow: false },
  font: { family: "padrao", titleCase: "uppercase", titleWeight: 900 },
  layout: { products: "carousel" },
  effects: { hoverZoom: true, fadeIn: true, parallax: false },
  contact: { whatsapp: "", phone: "", instagram: "", facebook: "", site: "", email: "" },
};

export const FONT_STACKS: Record<FontKey, string> = {
  padrao: "",
  moderna: "'Segoe UI', system-ui, -apple-system, sans-serif",
  elegante: "Georgia, 'Times New Roman', serif",
  arredondada: "'Trebuchet MS', Verdana, sans-serif",
  mono: "'Cascadia Code', Consolas, 'Courier New', monospace",
  condensada: "'Arial Narrow', 'Segoe UI', sans-serif",
};

export const FONT_LABELS: Record<FontKey, string> = {
  padrao: "Padrão Viagg",
  moderna: "Moderna",
  elegante: "Elegante (serifada)",
  arredondada: "Arredondada",
  mono: "Monoespaçada",
  condensada: "Condensada",
};

// ─── Sanitização (whitelist estrita) ────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function hex(v: unknown, fb: string): string {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toUpperCase() : fb;
}
function clamp(v: unknown, min: number, max: number, fb: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return fb;
  return Math.min(max, Math.max(min, n));
}
function oneOf<T extends string | number>(v: unknown, opts: readonly T[], fb: T): T {
  return (opts as readonly unknown[]).includes(v) ? (v as T) : fb;
}
function bool(v: unknown, fb: boolean): boolean {
  return typeof v === "boolean" ? v : fb;
}
function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 600) return null;
  if (!/^https:\/\/[^\s"'<>\\]+$/i.test(s)) return null;
  return s;
}
function digits(v: unknown, max = 15): string {
  if (typeof v !== "string") return "";
  return v.replace(/\D/g, "").slice(0, max);
}
function handle(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 40);
}
function emailStr(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim().slice(0, 120);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

/** Normaliza QUALQUER json em um StoreAppearance válido. Retorna null se não há tema. */
export function sanitizeAppearance(raw: unknown): StoreAppearance | null {
  // Defensivo: se a aparência voltar como JSON string (double-encoded), parseia.
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return null; } }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as any;
  const D = DEFAULT_APPEARANCE;
  return {
    v: 1,
    preset: typeof r.preset === "string" ? r.preset.slice(0, 40) : null,
    bg: {
      type: oneOf(r.bg?.type, ["solid", "gradient", "image", "pattern"] as const, D.bg.type),
      color: hex(r.bg?.color, D.bg.color),
      color2: hex(r.bg?.color2, D.bg.color2),
      angle: clamp(r.bg?.angle, 0, 360, D.bg.angle),
      imageUrl: httpsUrl(r.bg?.imageUrl),
      pattern: oneOf(r.bg?.pattern, ["dots", "grid", "diagonal"] as const, D.bg.pattern),
      overlay: clamp(r.bg?.overlay, 0, 0.8, D.bg.overlay),
      blur: clamp(r.bg?.blur, 0, 12, D.bg.blur),
    },
    banner: {
      style: oneOf(r.banner?.style, ["color", "gradient", "image"] as const, D.banner.style),
      color: hex(r.banner?.color, D.banner.color),
      color2: hex(r.banner?.color2, D.banner.color2),
      imageUrl: httpsUrl(r.banner?.imageUrl),
      overlay: clamp(r.banner?.overlay, 0, 0.8, D.banner.overlay),
      height: oneOf(r.banner?.height, ["compact", "normal", "tall"] as const, D.banner.height),
      textColor: hex(r.banner?.textColor, D.banner.textColor),
    },
    colors: {
      primary: hex(r.colors?.primary, D.colors.primary),
      heading: hex(r.colors?.heading, D.colors.heading),
      text: hex(r.colors?.text, D.colors.text),
      price: hex(r.colors?.price, D.colors.price),
      badge: hex(r.colors?.badge, D.colors.badge),
      cardBg: hex(r.colors?.cardBg, D.colors.cardBg),
      cardText: hex(r.colors?.cardText, D.colors.cardText),
      cardBorder: hex(r.colors?.cardBorder, D.colors.cardBorder),
      surface: hex(r.colors?.surface, D.colors.surface),
      btnBg: hex(r.colors?.btnBg, D.colors.btnBg),
      btnBg2: hex(r.colors?.btnBg2, D.colors.btnBg2),
      btnText: hex(r.colors?.btnText, D.colors.btnText),
    },
    cards: {
      radius: clamp(r.cards?.radius, 0, 32, D.cards.radius),
      shadow: oneOf(r.cards?.shadow, ["none", "soft", "strong", "glow"] as const, D.cards.shadow),
      borderW: clamp(r.cards?.borderW, 0, 3, D.cards.borderW),
      opacity: clamp(r.cards?.opacity, 40, 100, D.cards.opacity),
      glass: bool(r.cards?.glass, D.cards.glass),
      neon: bool(r.cards?.neon, D.cards.neon),
    },
    buttons: {
      radius: clamp(r.buttons?.radius, 0, 24, D.buttons.radius),
      style: oneOf(r.buttons?.style, ["solid", "gradient", "outline"] as const, D.buttons.style),
      glow: bool(r.buttons?.glow, D.buttons.glow),
    },
    font: {
      family: oneOf(r.font?.family, ["padrao", "moderna", "elegante", "arredondada", "mono", "condensada"] as const, D.font.family),
      titleCase: oneOf(r.font?.titleCase, ["uppercase", "none", "capitalize"] as const, D.font.titleCase),
      titleWeight: oneOf(r.font?.titleWeight, [700, 800, 900] as const, D.font.titleWeight),
    },
    layout: {
      products: oneOf(r.layout?.products, ["carousel", "grid", "large", "compact"] as const, D.layout.products),
    },
    effects: {
      hoverZoom: bool(r.effects?.hoverZoom, D.effects.hoverZoom),
      fadeIn: bool(r.effects?.fadeIn, D.effects.fadeIn),
      parallax: bool(r.effects?.parallax, D.effects.parallax),
    },
    contact: {
      whatsapp: digits(r.contact?.whatsapp),
      phone: digits(r.contact?.phone),
      instagram: handle(r.contact?.instagram),
      facebook: httpsUrl(r.contact?.facebook) || "",
      site: httpsUrl(r.contact?.site) || "",
      email: emailStr(r.contact?.email),
    },
  };
}

// ─── Helpers de cor/CSS (só recebem valores JÁ sanitizados) ─

export function hexToRgba(hexColor: string, alpha: number): string {
  const h = hexColor.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function patternCss(a: StoreAppearance): { image: string; size: string } {
  const c = hexToRgba(a.bg.color2, 0.35);
  switch (a.bg.pattern) {
    case "grid":
      return {
        image: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`,
        size: "26px 26px",
      };
    case "diagonal":
      return { image: `repeating-linear-gradient(45deg, ${c} 0 2px, transparent 2px 16px)`, size: "auto" };
    case "dots":
    default:
      return { image: `radial-gradient(${c} 1.4px, transparent 1.4px)`, size: "20px 20px" };
  }
}

/** Estilo do layer de fundo (renderizado pelo StoreThemeScope). */
export function buildBgLayerStyle(a: StoreAppearance): CSSProperties {
  const base: CSSProperties = { backgroundColor: a.bg.color };
  if (a.bg.type === "gradient") {
    base.backgroundImage = `linear-gradient(${a.bg.angle}deg, ${a.bg.color}, ${a.bg.color2})`;
  } else if (a.bg.type === "pattern") {
    const p = patternCss(a);
    base.backgroundImage = p.image;
    base.backgroundSize = p.size;
  } else if (a.bg.type === "image" && a.bg.imageUrl) {
    base.backgroundImage = `url("${a.bg.imageUrl}")`;
    base.backgroundSize = "cover";
    base.backgroundPosition = "center";
    if (a.effects.parallax) base.backgroundAttachment = "fixed";
    if (a.bg.blur > 0) {
      base.filter = `blur(${a.bg.blur}px)`;
      base.transform = "scale(1.06)"; // esconde a borda esfumada do blur
    }
  }
  return base;
}

/** CSS variables consumidas pelo store-theme.css dentro de .st-skin. */
export function buildThemeVars(a: StoreAppearance): CSSProperties {
  const c = a.colors;

  const shadowMap: Record<ShadowKey, [string, string]> = {
    none: ["none", "none"],
    soft: ["0 4px 24px rgba(0,0,0,0.05)", "0 16px 40px rgba(0,0,0,0.12)"],
    strong: ["0 10px 34px rgba(0,0,0,0.16)", "0 20px 52px rgba(0,0,0,0.24)"],
    glow: [`0 0 22px ${hexToRgba(c.primary, 0.3)}`, `0 0 34px ${hexToRgba(c.primary, 0.45)}`],
  };
  let [cardShadow, cardShadowHover] = shadowMap[a.cards.shadow];
  let cardBorderColor = a.cards.opacity < 100 ? hexToRgba(c.cardBorder, 0.6) : c.cardBorder;
  if (a.cards.neon) {
    cardBorderColor = c.primary;
    const neon = `0 0 14px ${hexToRgba(c.primary, 0.55)}`;
    cardShadow = cardShadow === "none" ? neon : `${cardShadow}, ${neon}`;
    cardShadowHover = `${cardShadowHover === "none" ? "" : cardShadowHover + ", "}0 0 24px ${hexToRgba(c.primary, 0.75)}`;
  }

  const isOutline = a.buttons.style === "outline";
  const btnBg = isOutline ? "transparent" : c.btnBg;
  const btnBgi = a.buttons.style === "gradient" ? `linear-gradient(135deg, ${c.btnBg}, ${c.btnBg2})` : "none";
  const btnText = isOutline ? c.btnBg : c.btnText;
  const btnBorder = isOutline ? `2px solid ${c.btnBg}` : "none";
  const btnShadow = a.buttons.glow ? `0 6px 20px ${hexToRgba(c.btnBg, 0.45)}` : "none";

  let bannerBg = a.banner.color;
  let bannerBgi = "none";
  if (a.banner.style === "gradient") {
    bannerBgi = `linear-gradient(135deg, ${a.banner.color}, ${a.banner.color2})`;
  } else if (a.banner.style === "image" && a.banner.imageUrl) {
    bannerBgi = `linear-gradient(${hexToRgba("#000000", a.banner.overlay)}, ${hexToRgba("#000000", a.banner.overlay)}), url("${a.banner.imageUrl}")`;
  }
  const bannerMinH = a.banner.height === "tall" ? "300px" : a.banner.height === "compact" ? "0px" : "180px";

  const vars: Record<string, string> = {
    "--st-primary": c.primary,
    "--st-heading": c.heading,
    "--st-text": c.text,
    "--st-price": c.price,
    "--st-badge": c.badge,
    "--st-card-bg": hexToRgba(c.cardBg, a.cards.opacity / 100),
    "--st-card-text": c.cardText,
    "--st-card-border": cardBorderColor,
    "--st-card-border-w": `${a.cards.borderW}px`,
    "--st-card-radius": `${a.cards.radius}px`,
    "--st-card-shadow": cardShadow,
    "--st-card-shadow-hover": cardShadowHover,
    "--st-surface": hexToRgba(c.surface, 0.88),
    "--st-btn-bg": btnBg,
    "--st-btn-bgi": btnBgi,
    "--st-btn-text": btnText,
    "--st-btn-border": btnBorder,
    "--st-btn-shadow": btnShadow,
    "--st-btn-radius": `${a.buttons.radius}px`,
    "--st-banner-bg": bannerBg,
    "--st-banner-bgi": bannerBgi,
    "--st-banner-text": a.banner.textColor,
    "--st-banner-minh": bannerMinH,
    "--st-title-case": a.font.titleCase,
    "--st-title-weight": String(a.font.titleWeight),
  };
  const stack = FONT_STACKS[a.font.family];
  if (stack) vars["--st-font"] = stack;
  return vars as CSSProperties;
}

// ─── Temas prontos ──────────────────────────────────────────

export interface StorePresetDef {
  key: string;
  label: string;
  /** cores para o swatch do seletor */
  swatch: [string, string, string];
  build: () => StoreAppearance;
}

function mk(key: string, patch: (d: StoreAppearance) => void): StoreAppearance {
  const d: StoreAppearance = JSON.parse(JSON.stringify(DEFAULT_APPEARANCE));
  patch(d);
  d.preset = key;
  return d;
}

export const STORE_PRESETS: StorePresetDef[] = [
  {
    key: "moderna", label: "Loja Moderna", swatch: ["#F4F4F5", "#2563EB", "#FFFFFF"],
    build: () => mk("moderna", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#F4F4F5" };
      d.colors = { ...d.colors, primary: "#2563EB", badge: "#2563EB", btnBg: "#2563EB", btnBg2: "#60A5FA", price: "#2563EB" };
      d.banner = { ...d.banner, style: "gradient", color: "#1D4ED8", color2: "#38BDF8" };
      d.cards.radius = 16; d.layout.products = "grid";
    }),
  },
  {
    key: "tecnologia", label: "Tecnologia", swatch: ["#0B1220", "#22D3EE", "#111C2E"],
    build: () => mk("tecnologia", (d) => {
      d.bg = { ...d.bg, type: "gradient", color: "#0B1220", color2: "#101B33", angle: 180 };
      d.colors = { ...d.colors, primary: "#22D3EE", heading: "#E2E8F0", text: "#94A3B8", price: "#22D3EE", badge: "#22D3EE", cardBg: "#111C2E", cardText: "#E2E8F0", cardBorder: "#1E3A5F", surface: "#0F1A2E", btnBg: "#06B6D4", btnBg2: "#3B82F6", btnText: "#FFFFFF" };
      d.banner = { ...d.banner, style: "gradient", color: "#0E7490", color2: "#1E40AF" };
      d.cards = { ...d.cards, radius: 12, shadow: "glow", neon: true };
      d.buttons = { ...d.buttons, style: "gradient", glow: true };
      d.font.family = "moderna"; d.layout.products = "grid";
    }),
  },
  {
    key: "moda", label: "Moda", swatch: ["#FDF2F8", "#DB2777", "#FFFFFF"],
    build: () => mk("moda", (d) => {
      d.bg = { ...d.bg, type: "gradient", color: "#FDF2F8", color2: "#FCE7F3", angle: 160 };
      d.colors = { ...d.colors, primary: "#DB2777", badge: "#DB2777", btnBg: "#DB2777", btnBg2: "#F472B6", price: "#9D174D", heading: "#500724" };
      d.banner = { ...d.banner, style: "gradient", color: "#DB2777", color2: "#F9A8D4" };
      d.cards.radius = 28; d.buttons = { ...d.buttons, radius: 20, style: "gradient" };
      d.font = { ...d.font, family: "elegante", titleCase: "capitalize", titleWeight: 700 };
      d.layout.products = "large";
    }),
  },
  {
    key: "luxo", label: "Luxo", swatch: ["#0C0A09", "#D4AF37", "#1C1917"],
    build: () => mk("luxo", (d) => {
      d.bg = { ...d.bg, type: "gradient", color: "#0C0A09", color2: "#1C1917", angle: 180 };
      d.colors = { ...d.colors, primary: "#D4AF37", heading: "#F5F5F4", text: "#A8A29E", price: "#D4AF37", badge: "#D4AF37", cardBg: "#1C1917", cardText: "#E7E5E4", cardBorder: "#44403C", surface: "#171412", btnBg: "#D4AF37", btnBg2: "#B8860B", btnText: "#1C1917" };
      d.banner = { ...d.banner, style: "color", color: "#171412", textColor: "#D4AF37" };
      d.cards = { ...d.cards, radius: 8, shadow: "strong", borderW: 1 };
      d.buttons = { ...d.buttons, radius: 4, style: "solid" };
      d.font = { ...d.font, family: "elegante", titleCase: "uppercase", titleWeight: 700 };
      d.layout.products = "large";
    }),
  },
  {
    key: "automoveis", label: "Automóveis", swatch: ["#18181B", "#EF4444", "#27272A"],
    build: () => mk("automoveis", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#18181B" };
      d.colors = { ...d.colors, primary: "#EF4444", heading: "#FAFAFA", text: "#A1A1AA", price: "#FAFAFA", badge: "#EF4444", cardBg: "#27272A", cardText: "#F4F4F5", cardBorder: "#3F3F46", surface: "#1F1F23", btnBg: "#EF4444", btnBg2: "#B91C1C" };
      d.banner = { ...d.banner, style: "gradient", color: "#7F1D1D", color2: "#18181B" };
      d.cards = { ...d.cards, radius: 14, shadow: "strong" };
      d.font.family = "condensada"; d.layout.products = "grid";
    }),
  },
  {
    key: "imoveis", label: "Imóveis", swatch: ["#F8FAFC", "#0F766E", "#FFFFFF"],
    build: () => mk("imoveis", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#F8FAFC" };
      d.colors = { ...d.colors, primary: "#0F766E", badge: "#0F766E", btnBg: "#0F766E", btnBg2: "#14B8A6", price: "#0F766E", heading: "#134E4A" };
      d.banner = { ...d.banner, style: "gradient", color: "#115E59", color2: "#0D9488" };
      d.cards.radius = 18; d.layout.products = "large";
      d.font.titleCase = "capitalize";
    }),
  },
  {
    key: "restaurante", label: "Restaurante", swatch: ["#FFF7ED", "#C2410C", "#FFFFFF"],
    build: () => mk("restaurante", (d) => {
      d.bg = { ...d.bg, type: "pattern", color: "#FFF7ED", color2: "#FDBA74", pattern: "dots" };
      d.colors = { ...d.colors, primary: "#C2410C", badge: "#C2410C", btnBg: "#C2410C", btnBg2: "#F97316", price: "#9A3412", heading: "#431407" };
      d.banner = { ...d.banner, style: "gradient", color: "#C2410C", color2: "#F59E0B" };
      d.cards.radius = 20; d.buttons.radius = 16;
      d.font = { ...d.font, family: "arredondada", titleCase: "capitalize" };
      d.layout.products = "compact";
    }),
  },
  {
    key: "mercado", label: "Mercado", swatch: ["#F0FDF4", "#16A34A", "#FFFFFF"],
    build: () => mk("mercado", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#F0FDF4" };
      d.colors = { ...d.colors, primary: "#16A34A", badge: "#DC2626", btnBg: "#16A34A", btnBg2: "#4ADE80", price: "#DC2626", heading: "#14532D" };
      d.banner = { ...d.banner, style: "color", color: "#16A34A" };
      d.cards.radius = 12; d.layout.products = "compact";
    }),
  },
  {
    key: "minimalista", label: "Minimalista", swatch: ["#FFFFFF", "#18181B", "#FAFAFA"],
    build: () => mk("minimalista", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#FFFFFF" };
      d.colors = { ...d.colors, primary: "#18181B", badge: "#18181B", btnBg: "#18181B", btnBg2: "#3F3F46", price: "#18181B", cardBorder: "#F4F4F5", surface: "#FAFAFA" };
      d.banner = { ...d.banner, style: "color", color: "#FAFAFA", textColor: "#18181B" };
      d.cards = { ...d.cards, radius: 6, shadow: "none", borderW: 1 };
      d.buttons = { ...d.buttons, radius: 2, style: "solid" };
      d.font = { ...d.font, titleCase: "none", titleWeight: 700 };
      d.effects = { ...d.effects, hoverZoom: false, fadeIn: false };
      d.layout.products = "grid";
    }),
  },
  {
    key: "darkpremium", label: "Dark Premium", swatch: ["#0D0F12", "#FF7A00", "#1A1F24"],
    build: () => mk("darkpremium", (d) => {
      d.bg = { ...d.bg, type: "gradient", color: "#0D0F12", color2: "#14171B", angle: 180 };
      d.colors = { ...d.colors, primary: "#FF7A00", heading: "#F5F7FA", text: "#8E98A3", price: "#FF7A00", badge: "#FF7A00", cardBg: "#1A1F24", cardText: "#E6EAEE", cardBorder: "#323A45", surface: "#14171B", btnBg: "#FF7A00", btnBg2: "#FF8E1F" };
      d.banner = { ...d.banner, style: "gradient", color: "#14171B", color2: "#2A1608" };
      d.cards = { ...d.cards, radius: 20, shadow: "strong" };
      d.buttons.style = "gradient";
      d.layout.products = "grid";
    }),
  },
  {
    key: "apple", label: "Apple Style", swatch: ["#FBFBFD", "#0071E3", "#FFFFFF"],
    build: () => mk("apple", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#FBFBFD" };
      d.colors = { ...d.colors, primary: "#0071E3", badge: "#0071E3", btnBg: "#0071E3", btnBg2: "#42A1EC", price: "#1D1D1F", heading: "#1D1D1F", text: "#86868B", cardBorder: "#F5F5F7" };
      d.banner = { ...d.banner, style: "color", color: "#F5F5F7", textColor: "#1D1D1F" };
      d.cards = { ...d.cards, radius: 18, shadow: "soft", borderW: 0 };
      d.buttons.radius = 22;
      d.font = { ...d.font, titleCase: "none", titleWeight: 700 };
      d.layout.products = "large";
    }),
  },
  {
    key: "meli", label: "Amarelo Vivo", swatch: ["#FFE600", "#3483FA", "#FFFFFF"],
    build: () => mk("meli", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#EBEBEB" };
      d.colors = { ...d.colors, primary: "#3483FA", badge: "#00A650", btnBg: "#3483FA", btnBg2: "#1259C3", price: "#333333", heading: "#333333" };
      d.banner = { ...d.banner, style: "color", color: "#FFE600", textColor: "#333333" };
      d.cards = { ...d.cards, radius: 6, shadow: "soft", borderW: 0 };
      d.font.titleCase = "none";
      d.layout.products = "compact";
    }),
  },
  {
    key: "magazine", label: "Magazine", swatch: ["#F5F5F4", "#7C3AED", "#FFFFFF"],
    build: () => mk("magazine", (d) => {
      d.bg = { ...d.bg, type: "pattern", color: "#F5F5F4", color2: "#A78BFA", pattern: "grid" };
      d.colors = { ...d.colors, primary: "#7C3AED", badge: "#7C3AED", btnBg: "#7C3AED", btnBg2: "#A855F7", price: "#5B21B6", heading: "#2E1065" };
      d.banner = { ...d.banner, style: "gradient", color: "#6D28D9", color2: "#C026D3" };
      d.cards.radius = 22; d.buttons.style = "gradient";
      d.layout.products = "large";
    }),
  },
  {
    key: "natureza", label: "Natureza", swatch: ["#ECFDF5", "#166534", "#FFFFFF"],
    build: () => mk("natureza", (d) => {
      d.bg = { ...d.bg, type: "gradient", color: "#ECFDF5", color2: "#D1FAE5", angle: 180 };
      d.colors = { ...d.colors, primary: "#166534", badge: "#166534", btnBg: "#166534", btnBg2: "#22C55E", price: "#14532D", heading: "#052E16" };
      d.banner = { ...d.banner, style: "gradient", color: "#14532D", color2: "#16A34A" };
      d.cards = { ...d.cards, radius: 26, shadow: "soft" };
      d.font = { ...d.font, family: "arredondada", titleCase: "capitalize", titleWeight: 800 };
    }),
  },
  {
    key: "neon", label: "Neon", swatch: ["#09090B", "#E879F9", "#18181B"],
    build: () => mk("neon", (d) => {
      d.bg = { ...d.bg, type: "gradient", color: "#09090B", color2: "#170B2B", angle: 200 };
      d.colors = { ...d.colors, primary: "#E879F9", heading: "#FAFAFA", text: "#A1A1AA", price: "#22D3EE", badge: "#E879F9", cardBg: "#18181B", cardText: "#F4F4F5", cardBorder: "#E879F9", surface: "#111113", btnBg: "#D946EF", btnBg2: "#8B5CF6" };
      d.banner = { ...d.banner, style: "gradient", color: "#4A044E", color2: "#1E1B4B" };
      d.cards = { ...d.cards, radius: 16, shadow: "glow", neon: true, borderW: 1 };
      d.buttons = { ...d.buttons, style: "gradient", glow: true };
      d.effects.fadeIn = true;
      d.layout.products = "grid";
    }),
  },
  {
    key: "elegante", label: "Elegante", swatch: ["#FAFAF9", "#44403C", "#FFFFFF"],
    build: () => mk("elegante", (d) => {
      d.bg = { ...d.bg, type: "solid", color: "#FAFAF9" };
      d.colors = { ...d.colors, primary: "#44403C", badge: "#44403C", btnBg: "#292524", btnBg2: "#57534E", price: "#292524", heading: "#1C1917", text: "#78716C", cardBorder: "#E7E5E4" };
      d.banner = { ...d.banner, style: "color", color: "#292524", textColor: "#FAFAF9" };
      d.cards = { ...d.cards, radius: 10, shadow: "soft", borderW: 1 };
      d.buttons.radius = 6;
      d.font = { ...d.font, family: "elegante", titleCase: "capitalize", titleWeight: 700 };
      d.layout.products = "large";
    }),
  },
];
