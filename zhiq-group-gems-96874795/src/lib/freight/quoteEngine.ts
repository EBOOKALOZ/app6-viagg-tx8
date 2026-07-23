/**
 * quoteEngine — ORION do "Solicitar Frete" (marketplace de cotações).
 *
 * Determina quais TIPOS DE VEÍCULO podem atender uma carga a partir de peso,
 * dimensões, volumes e características. As regras são DETERMINÍSTICAS (nunca
 * dependem de rede); a IA (viaggAI) só enriquece com um parecer textual.
 * Os tipos são os MESMOS de freight_listings.vehicle_type (vehicleTypes.ts),
 * garantindo o casamento solicitação ↔ frota anunciada do transportador.
 */
import { viaggAI } from "@/lib/viaggAI";

/**
 * Capacidade aproximada por CATEGORIA (kg e m³) — base das regras ORION.
 * Superset V2: inclui as categorias de frota além dos 5 tipos dos anúncios.
 */
const VEHICLE_CAPACITY: Record<string, { maxKg: number; maxM3: number }> = {
  "Utilitário":       { maxKg: 600,    maxM3: 2 },
  "Fiorino":          { maxKg: 650,    maxM3: 3 },
  "HR":               { maxKg: 1800,   maxM3: 10 },
  "Van":              { maxKg: 1500,   maxM3: 8 },
  "VUC":              { maxKg: 3000,   maxM3: 18 },
  "Caminhão 3/4":     { maxKg: 3500,   maxM3: 25 },
  "Caminhão Pequeno": { maxKg: 3500,   maxM3: 20 },
  "Caminhão Médio":   { maxKg: 8000,   maxM3: 45 },
  "Truck":            { maxKg: 14000,  maxM3: 70 },
  "Carreta":          { maxKg: 27000,  maxM3: 100 },
  "Bitrem":           { maxKg: 37000,  maxM3: 120 },
  "Rodotrem":         { maxKg: 48000,  maxM3: 140 },
  "Baú":              { maxKg: 14000,  maxM3: 70 },
  "Sider":            { maxKg: 27000,  maxM3: 100 },
  "Graneleiro":       { maxKg: 27000,  maxM3: 100 },
  "Prancha":          { maxKg: 30000,  maxM3: 120 },
  "Munck":            { maxKg: 12000,  maxM3: 40 },
  "Guincho":          { maxKg: 3000,   maxM3: 15 },
  "Refrigerado":      { maxKg: 14000,  maxM3: 60 },
  "Tanque":           { maxKg: 30000,  maxM3: 45 },
};

/** Categorias disponíveis no cadastro da FROTA (Minha Frota — V2). */
export const FLEET_CATEGORIES = Object.keys(VEHICLE_CAPACITY);

/** Tipos de carga aceitos pelo veículo (checkboxes da frota — V2). */
export const FLEET_CARGO_TYPES = [
  { key: "mudancas",        label: "Mudanças" },
  { key: "construcao",      label: "Material de construção" },
  { key: "alimentos",       label: "Alimentos" },
  { key: "industrializados", label: "Produtos industrializados" },
  { key: "maquinas",        label: "Máquinas" },
  { key: "veiculos",        label: "Veículos" },
  { key: "animais",         label: "Animais" },
  { key: "refrigerados",    label: "Produtos refrigerados" },
  { key: "perigosas",       label: "Cargas perigosas" },
  { key: "moveis",          label: "Móveis" },
  { key: "ecommerce",       label: "E-commerce" },
  { key: "outros",          label: "Outros" },
] as const;

/** Dias da semana para rotas (Minhas Rotas — V2). */
export const WEEK_DAYS = [
  { key: "seg", label: "Seg" }, { key: "ter", label: "Ter" }, { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" }, { key: "sex", label: "Sex" }, { key: "sab", label: "Sáb" },
  { key: "dom", label: "Dom" },
] as const;

/** Características da carga (checkboxes do formulário). */
export const CARGO_CHARACTERISTICS = [
  { key: "fragil",              label: "Carga frágil",          emoji: "🫙" },
  { key: "refrigerada",         label: "Refrigerada",           emoji: "❄️" },
  { key: "perigosa",            label: "Perigosa",              emoji: "⚠️" },
  { key: "empilhavel",          label: "Empilhável",            emoji: "📦" },
  { key: "mudanca_residencial", label: "Mudança residencial",   emoji: "🏠" },
  { key: "mudanca_comercial",   label: "Mudança comercial",     emoji: "🏢" },
  { key: "animais",             label: "Animais",               emoji: "🐾" },
  { key: "maquinas",            label: "Máquinas",              emoji: "⚙️" },
  { key: "veiculos",            label: "Veículos",              emoji: "🚗" },
  { key: "material_construcao", label: "Material de construção", emoji: "🧱" },
  { key: "moveis",              label: "Móveis",                emoji: "🛋️" },
  { key: "outros",              label: "Outros",                emoji: "➕" },
] as const;

export type CargoCharacteristicKey = (typeof CARGO_CHARACTERISTICS)[number]["key"];

/** Características que exigem porte de caminhão (nunca utilitário pequeno). */
const HEAVY_ONLY: ReadonlyArray<string> = [
  "mudanca_residencial", "mudanca_comercial", "maquinas", "veiculos", "material_construcao",
];

export interface QuoteCargoInput {
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  volumes: number | null;
  characteristics: string[];
}

export interface OrionQuoteResult {
  allowedVehicleTypes: string[];
  volumeM3: number | null;
  reasons: string[];
}

/** Regras ORION: peso + volume + características → veículos compatíveis. */
export function computeAllowedVehicles(input: QuoteCargoInput): OrionQuoteResult {
  const reasons: string[] = [];
  const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : null;

  // Volume total estimado (dimensões de 1 volume × quantidade)
  let volumeM3: number | null = null;
  if (input.lengthCm && input.widthCm && input.heightCm) {
    const unit = (input.lengthCm / 100) * (input.widthCm / 100) * (input.heightCm / 100);
    volumeM3 = Math.round(unit * Math.max(1, input.volumes || 1) * 100) / 100;
  }

  let allowed = Object.keys(VEHICLE_CAPACITY).filter((type) => {
    const cap = VEHICLE_CAPACITY[type];
    if (weight !== null && weight > cap.maxKg) return false;
    if (volumeM3 !== null && volumeM3 > cap.maxM3) return false;
    return true;
  });

  if (weight !== null) reasons.push(`Peso informado: ${weight} kg.`);
  if (volumeM3 !== null) reasons.push(`Volume estimado: ${volumeM3} m³.`);

  // Cargas de porte (mudanças, máquinas, construção, móveis) → sem utilitários pequenos
  const heavy = input.characteristics.some((c) => HEAVY_ONLY.includes(c));
  if (heavy) {
    allowed = allowed.filter((t) => !["Utilitário", "Fiorino", "Guincho"].includes(t));
    reasons.push("Carga de porte (mudança/máquinas/construção): utilitários pequenos foram descartados.");
  }

  // Transporte de VEÍCULOS → equipamentos próprios
  if (input.characteristics.includes("veiculos")) {
    const carriers = ["Guincho", "Prancha", "Carreta", "Truck"];
    allowed = allowed.filter((t) => carriers.includes(t));
    reasons.push("Transporte de veículos: somente guincho/prancha/carreta.");
  }

  // Refrigerada → baú refrigerado
  if (input.characteristics.includes("refrigerada")) {
    allowed = allowed.includes("Refrigerado") ? ["Refrigerado"] : allowed;
    reasons.push("Carga refrigerada: direcionada a veículos refrigerados.");
  }

  // Carga perigosa → caminhões/tanque habilitados (regulamentação/segurança)
  if (input.characteristics.includes("perigosa")) {
    const hazmat = ["Tanque", "Caminhão Pequeno", "Caminhão Médio", "Truck", "Carreta", "Baú", "Sider"];
    allowed = allowed.filter((t) => hazmat.includes(t));
    reasons.push("Carga perigosa: somente veículos de carga habilitados (nunca utilitários).");
  }

  // Nunca lista vazia: menor categoria que comporta o peso; último recurso, Rodotrem
  if (allowed.length === 0) {
    const fit = Object.entries(VEHICLE_CAPACITY)
      .filter(([, cap]) => weight === null || weight <= cap.maxKg)
      .sort((a, b) => a[1].maxKg - b[1].maxKg)[0];
    allowed = [fit ? fit[0] : "Rodotrem"];
    reasons.push("Carga fora das capacidades típicas — direcionada ao porte mínimo compatível.");
  }

  return { allowedVehicleTypes: allowed, volumeM3, reasons };
}

/** Parecer textual do ORION (IA) — opcional, nunca bloqueia o envio. */
export async function orionQuoteAnalysis(params: {
  cargoType: string;
  weightKg: number | null;
  volumeM3: number | null;
  originCity: string;
  destCity: string;
  characteristics: string[];
  allowedVehicleTypes: string[];
}): Promise<string | null> {
  try {
    const text = await viaggAI.ask(
      `
Você é o ORION, IA logística da Viagg-TX8. Analise esta solicitação de frete em 2 frases (máx. 300 caracteres), em português, sem emojis:
- Carga: ${params.cargoType || "não informada"} · Peso: ${params.weightKg ?? "?"} kg · Volume: ${params.volumeM3 ?? "?"} m³
- Rota: ${params.originCity || "?"} → ${params.destCity || "?"}
- Características: ${params.characteristics.join(", ") || "nenhuma"}
- Veículos compatíveis: ${params.allowedVehicleTypes.join(", ")}
Comente a adequação dos veículos e um cuidado relevante para o transporte.`.trim(),
      { maxTokens: 160 },
    );
    return text?.trim() || null;
  } catch {
    return null; // IA fora do ar não impede a solicitação
  }
}

// ─── Status/labels compartilhados pelas telas ───────────────

export const REQUEST_STATUS: Record<string, { label: string; className: string }> = {
  aguardando: { label: "Aguardando propostas", className: "bg-amber-50 text-amber-700 border-amber-200" },
  recebendo:  { label: "Recebendo propostas",  className: "bg-blue-50 text-blue-700 border-blue-200" },
  negociacao: { label: "Em negociação",        className: "bg-violet-50 text-violet-700 border-violet-200" },
  aceita:     { label: "Aceita",               className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  finalizada: { label: "Finalizada",           className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  cancelada:  { label: "Cancelada",            className: "bg-red-50 text-red-600 border-red-200" },
};

export const PROPOSAL_SERVICES = [
  "Ajudante(s) de carga/descarga",
  "Embalagem",
  "Montagem/desmontagem",
  "Içamento",
  "Rastreamento",
  "Coleta agendada",
] as const;

export type QuoteSortKey = "preco" | "avaliacao" | "prazo" | "proximo" | "orion";

export const QUOTE_SORTS: { key: QuoteSortKey; label: string }[] = [
  { key: "orion",     label: "Recomendado pelo ORION" },
  { key: "preco",     label: "Menor preço" },
  { key: "avaliacao", label: "Melhor avaliação" },
  { key: "prazo",     label: "Menor prazo" },
  { key: "proximo",   label: "Mais próximo" },
];

/** Tempo restante amigável até expirar. */
export function timeLeftLabel(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expirada";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h restantes`;
  if (h >= 1) return `${h}h restantes`;
  return `${Math.max(1, Math.floor(ms / 60_000))}min restantes`;
}

export const brlLabel = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
