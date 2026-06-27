/**
 * AdminPromotionPackagesPage.tsx
 * Módulo admin de Pacotes de Promoção por perfil de anunciante.
 * CRUD completo + IA GLM + abas por perfil.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { chatCompletion } from "@/lib/aiapi";
import { toast } from "sonner";
import {
  Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Star, StarOff,
  Bot, Loader2, Save, X, ChevronUp, ChevronDown, History,
  Megaphone, Check, Undo2, Sparkles, Package, DatabaseZap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  type PromotionPackage,
  type ProfileType,
  PROFILE_LABELS,
} from "@/components/promotion/PromotionPlansModal";

/* ── Perfis disponíveis ─────────────────────────── */

const ALL_PROFILES: Array<{ key: ProfileType | "global" | "all"; label: string; emoji: string }> = [
  { key: "all",      label: "Todos",              emoji: "📦" },
  { key: "global",   label: "Global",             emoji: "🌐" },
  { key: "viagens",  label: "Viagens & Turismo",  emoji: "✈️" },
  { key: "fretes",   label: "Fretes",             emoji: "🚛" },
  { key: "servicos", label: "Serviços",            emoji: "🛠️" },
  { key: "veiculos", label: "Veículos",            emoji: "🚗" },
  { key: "imoveis",  label: "Imóveis",             emoji: "🏠" },
  { key: "produtos", label: "Produtos",            emoji: "🛍️" },
];

/* ── Log type ─────────────────────────────────── */

interface PackageLog {
  id: string;
  package_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  performed_by: string;
  ai_command: string | null;
  created_at: string;
}

/* ── Helpers ─────────────────────────────────── */

function toSlug(name: string) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function saveLog(action: string, pkgId: string | null, old: unknown, next: unknown, ai?: string) {
  try {
    await (supabase as any).from("promotion_package_logs").insert({
      package_id: pkgId, action,
      old_data: old ? JSON.parse(JSON.stringify(old)) : null,
      new_data: next ? JSON.parse(JSON.stringify(next)) : null,
      performed_by: "admin", ai_command: ai ?? null,
    });
  } catch { /* silent */ }
}

/* ── GLM system prompt ─────────────────────────── */

function buildGlmPrompt(packages: PromotionPackage[]): string {
  const list = packages.map((p) =>
    `- id:"${p.id}" name:"${p.name}" profile:"${p.profile_type ?? "global"}" boosts:${p.daily_boosts} price:${p.price_monthly} active:${p.is_active}`
  ).join("\n");

  return `Você é assistente de gestão de pacotes de promoção da Viagg-TX8.
Interprete comandos em português e retorne APENAS um JSON válido (sem markdown).

Pacotes: ${list || "(nenhum)"}
Perfis válidos: global, viagens, fretes, servicos, veiculos, imoveis, produtos

Resposta JSON:
{
  "action": "create"|"update"|"delete"|"toggle_active"|"toggle_popular"|"bulk_price_update"|"duplicate",
  "package_id": "<id se atualizar/deletar>",
  "data": { campos a alterar: name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_popular, badge_text, profile_type },
  "multiplier": number,
  "confirmation_message": "O que será feito"
}

Retorne SOMENTE o JSON.`;
}

/* ── Seed data — pacotes padrão por perfil ─────── */

type SeedRow = Omit<PromotionPackage, "id">;

const SEED_PACKAGES: SeedRow[] = [
  // ── Global (sem perfil) ──
  { name:"Bronze",       slug:"global-bronze",   description:"Mais visibilidade para seu anúncio",              color:"#CD7F32",color_secondary:"#B87333",icon:"🥉",daily_boosts:5, price_monthly:9.90, period_options:[7,15,30], benefits:["Destaque no feed e nas buscas","Mais visualizações para seu anúncio","Distribuição ao longo do dia","Relatório de desempenho básico"],                                                        is_active:true,is_popular:false,badge_text:null,sort_order:1,profile_type:null },
  { name:"Prata",        slug:"global-prata",    description:"Mais alcance para você vender mais",              color:"#9E9E9E",color_secondary:"#757575",icon:"🥈",daily_boosts:15,price_monthly:19.90,period_options:[7,15,30], benefits:["Destaque no feed e nas buscas","Mais visualizações para seu anúncio","Distribuição ao longo do dia","Prioridade nas buscas","Relatório de desempenho completo"],                         is_active:true,is_popular:true, badge_text:"Mais Popular",sort_order:2,profile_type:null },
  { name:"Ouro",         slug:"global-ouro",     description:"Máxima exposição para resultados reais",          color:"#FFD700",color_secondary:"#FFA500",icon:"🥇",daily_boosts:30,price_monthly:39.90,period_options:[7,15,30], benefits:["Destaque no topo do feed","Máxima prioridade nas buscas","Distribuição estratégica ao longo do dia","Selo de anúncio promovido","Relatórios avançados com gráficos"],                  is_active:true,is_popular:false,badge_text:null,sort_order:3,profile_type:null },
  // ── Viagens ──
  { name:"Bronze Viajante",  slug:"viagens-bronze",  description:"Mais visibilidade para seus pacotes de viagem",         color:"#CD7F32",color_secondary:"#B87333",icon:"✈️",daily_boosts:5, price_monthly:9.90, period_options:[7,15,30], benefits:["Destaque no feed de viagens ✈️","Mais visualizações para seus roteiros","Distribuição ao longo do dia","Relatório de desempenho básico"],                                   is_active:true,is_popular:false,badge_text:null,sort_order:1,profile_type:"viagens" },
  { name:"Prata Viajante",   slug:"viagens-prata",   description:"Mais reservas e mais clientes viajando",               color:"#9E9E9E",color_secondary:"#757575",icon:"🥈",daily_boosts:15,price_monthly:19.90,period_options:[7,15,30], benefits:["Destaque no feed de viagens ✈️","Prioridade nas buscas de destinos","Mais visualizações para seus roteiros","Distribuição ao longo do dia","Relatório de desempenho completo"],  is_active:true,is_popular:true, badge_text:"Mais Popular",sort_order:2,profile_type:"viagens" },
  { name:"Ouro Viajante",    slug:"viagens-ouro",    description:"Máxima exposição para sua agência de turismo",          color:"#FFD700",color_secondary:"#FFA500",icon:"🥇",daily_boosts:30,price_monthly:39.90,period_options:[7,15,30], benefits:["Topo do feed de viagens ✈️","Máxima prioridade nas buscas de destinos","Distribuição estratégica ao longo do dia","Selo de parceiro Viagg-TX8","Relatórios avançados com gráficos"], is_active:true,is_popular:false,badge_text:null,sort_order:3,profile_type:"viagens" },
  // ── Fretes ──
  { name:"Bronze Transportador", slug:"fretes-bronze", description:"Mais visibilidade para suas rotas de frete",       color:"#CD7F32",color_secondary:"#B87333",icon:"🚛",daily_boosts:5, price_monthly:9.90, period_options:[7,15,30], benefits:["Destaque no feed de fretes 🚛","Mais contatos para suas rotas","Distribuição ao longo do dia","Relatório de desempenho básico"],                                                is_active:true,is_popular:false,badge_text:null,sort_order:1,profile_type:"fretes" },
  { name:"Prata Transportador",  slug:"fretes-prata",  description:"Mais cargas e mais contratos garantidos",          color:"#9E9E9E",color_secondary:"#757575",icon:"🥈",daily_boosts:15,price_monthly:19.90,period_options:[7,15,30], benefits:["Destaque no feed de fretes 🚛","Prioridade nas buscas de fretes","Mais contatos para suas rotas","Distribuição ao longo do dia","Relatório de desempenho completo"],            is_active:true,is_popular:true, badge_text:"Mais Popular",sort_order:2,profile_type:"fretes" },
  { name:"Ouro Transportador",   slug:"fretes-ouro",   description:"Máxima exposição para sua empresa de transporte",  color:"#FFD700",color_secondary:"#FFA500",icon:"🥇",daily_boosts:30,price_monthly:39.90,period_options:[7,15,30], benefits:["Topo do feed de fretes 🚛","Máxima prioridade nas buscas","Distribuição estratégica ao longo do dia","Selo de transportador preferencial","Relatórios avançados com gráficos"], is_active:true,is_popular:false,badge_text:null,sort_order:3,profile_type:"fretes" },
  // ── Serviços ──
  { name:"Bronze Prestador", slug:"servicos-bronze", description:"Mais visibilidade para seus serviços",            color:"#CD7F32",color_secondary:"#B87333",icon:"🛠️",daily_boosts:5, price_monthly:9.90, period_options:[7,15,30], benefits:["Destaque no feed de serviços 🛠️","Mais chamadas para seu serviço","Distribuição ao longo do dia","Relatório de desempenho básico"],                                              is_active:true,is_popular:false,badge_text:null,sort_order:1,profile_type:"servicos" },
  { name:"Prata Prestador",  slug:"servicos-prata",  description:"Mais clientes e mais oportunidades de serviço",  color:"#9E9E9E",color_secondary:"#757575",icon:"🥈",daily_boosts:15,price_monthly:19.90,period_options:[7,15,30], benefits:["Destaque no feed de serviços 🛠️","Prioridade nas buscas de serviços","Mais chamadas para seu serviço","Distribuição ao longo do dia","Relatório de desempenho completo"],            is_active:true,is_popular:true, badge_text:"Mais Popular",sort_order:2,profile_type:"servicos" },
  { name:"Ouro Prestador",   slug:"servicos-ouro",   description:"Máxima exposição para seu negócio de serviços",  color:"#FFD700",color_secondary:"#FFA500",icon:"🥇",daily_boosts:30,price_monthly:39.90,period_options:[7,15,30], benefits:["Topo do feed de serviços 🛠️","Máxima prioridade nas buscas","Distribuição estratégica ao longo do dia","Selo de prestador premium","Relatórios avançados com gráficos"],         is_active:true,is_popular:false,badge_text:null,sort_order:3,profile_type:"servicos" },
  // ── Veículos ──
  { name:"Bronze Revendedor", slug:"veiculos-bronze", description:"Mais visibilidade para seus veículos",          color:"#CD7F32",color_secondary:"#B87333",icon:"🚗",daily_boosts:5, price_monthly:9.90, period_options:[7,15,30], benefits:["Destaque no feed de veículos 🚗","Mais visualizações para seus anúncios","Distribuição ao longo do dia","Relatório de desempenho básico"],                                            is_active:true,is_popular:false,badge_text:null,sort_order:1,profile_type:"veiculos" },
  { name:"Prata Revendedor",  slug:"veiculos-prata",  description:"Mais negociações e mais vendas de veículos",   color:"#9E9E9E",color_secondary:"#757575",icon:"🥈",daily_boosts:15,price_monthly:19.90,period_options:[7,15,30], benefits:["Destaque no feed de veículos 🚗","Prioridade nas buscas de veículos","Mais visualizações para seus anúncios","Distribuição ao longo do dia","Relatório de desempenho completo"],         is_active:true,is_popular:true, badge_text:"Mais Popular",sort_order:2,profile_type:"veiculos" },
  { name:"Ouro Revendedor",   slug:"veiculos-ouro",   description:"Máxima exposição para sua revenda",            color:"#FFD700",color_secondary:"#FFA500",icon:"🥇",daily_boosts:30,price_monthly:39.90,period_options:[7,15,30], benefits:["Topo do feed de veículos 🚗","Máxima prioridade nas buscas","Distribuição estratégica ao longo do dia","Selo de revendedor destaque","Relatórios avançados com gráficos"],             is_active:true,is_popular:false,badge_text:null,sort_order:3,profile_type:"veiculos" },
  // ── Imóveis ──
  { name:"Bronze Imobiliário", slug:"imoveis-bronze", description:"Mais visibilidade para seus imóveis",          color:"#CD7F32",color_secondary:"#B87333",icon:"🏠",daily_boosts:5, price_monthly:9.90, period_options:[7,15,30], benefits:["Destaque no feed de imóveis 🏠","Mais visualizações para seus imóveis","Distribuição ao longo do dia","Relatório de desempenho básico"],                                              is_active:true,is_popular:false,badge_text:null,sort_order:1,profile_type:"imoveis" },
  { name:"Prata Imobiliário",  slug:"imoveis-prata",  description:"Mais visitas e mais negociações imobiliárias", color:"#9E9E9E",color_secondary:"#757575",icon:"🥈",daily_boosts:15,price_monthly:19.90,period_options:[7,15,30], benefits:["Destaque no feed de imóveis 🏠","Prioridade nas buscas de imóveis","Mais visualizações para seus imóveis","Distribuição ao longo do dia","Relatório de desempenho completo"],              is_active:true,is_popular:true, badge_text:"Mais Popular",sort_order:2,profile_type:"imoveis" },
  { name:"Ouro Imobiliário",   slug:"imoveis-ouro",   description:"Máxima exposição para sua imobiliária",        color:"#FFD700",color_secondary:"#FFA500",icon:"🥇",daily_boosts:30,price_monthly:39.90,period_options:[7,15,30], benefits:["Topo do feed de imóveis 🏠","Máxima prioridade nas buscas","Distribuição estratégica ao longo do dia","Selo de imobiliária destaque","Relatórios avançados com gráficos"],                is_active:true,is_popular:false,badge_text:null,sort_order:3,profile_type:"imoveis" },
  // ── Produtos ──
  { name:"Bronze Lojista", slug:"produtos-bronze", description:"Mais visibilidade para sua loja e produtos",      color:"#CD7F32",color_secondary:"#B87333",icon:"🛍️",daily_boosts:5, price_monthly:9.90, period_options:[7,15,30], benefits:["Destaque no feed de produtos 🛍️","Mais visualizações para seus produtos","Distribuição ao longo do dia","Relatório de desempenho básico"],                                              is_active:true,is_popular:false,badge_text:null,sort_order:1,profile_type:"produtos" },
  { name:"Prata Lojista",  slug:"produtos-prata",  description:"Mais vendas e mais clientes na sua loja",         color:"#9E9E9E",color_secondary:"#757575",icon:"🥈",daily_boosts:15,price_monthly:19.90,period_options:[7,15,30], benefits:["Destaque no feed de produtos 🛍️","Prioridade nas buscas de produtos","Mais visualizações para seus produtos","Distribuição ao longo do dia","Relatório de desempenho completo"],              is_active:true,is_popular:true, badge_text:"Mais Popular",sort_order:2,profile_type:"produtos" },
  { name:"Ouro Lojista",   slug:"produtos-ouro",   description:"Máxima exposição para sua loja virtual",          color:"#FFD700",color_secondary:"#FFA500",icon:"🥇",daily_boosts:30,price_monthly:39.90,period_options:[7,15,30], benefits:["Topo do feed de produtos 🛍️","Máxima prioridade nas buscas","Distribuição estratégica ao longo do dia","Selo de vendedor top","Relatórios avançados com gráficos"],                        is_active:true,is_popular:false,badge_text:null,sort_order:3,profile_type:"produtos" },
];

/* ── Empty form ─────────────────────────────── */

type FormData = Omit<PromotionPackage, "id" | "is_active" | "sort_order">;

const EMPTY: FormData = {
  name: "", slug: "", description: "",
  color: "#CD7F32", color_secondary: "#B87333", icon: "🏅",
  daily_boosts: 5, price_monthly: 9.9,
  period_options: [7, 15, 30], benefits: [""],
  is_popular: false, badge_text: null, profile_type: null,
};

/* ═══════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════ */

export default function AdminPromotionPackagesPage() {
  const [packages, setPackages]   = useState<PromotionPackage[]>([]);
  const [logs, setLogs]           = useState<PackageLog[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<"packages" | "logs">("packages");
  const [profileTab, setProfileTab] = useState<"all" | "global" | ProfileType>("all");

  /* Form */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<FormData>(EMPTY);
  const [saving, setSaving]       = useState(false);

  /* GLM */
  const [glmCmd, setGlmCmd]         = useState("");
  const [glmBusy, setGlmBusy]       = useState(false);
  const [glmPreview, setGlmPreview] = useState<string | null>(null);
  const [glmParsed, setGlmParsed]   = useState<Record<string, unknown> | null>(null);

  /* ── Fetch ── */

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, logRes] = await Promise.all([
        (supabase as any).from("promotion_packages").select("*").order("profile_type", { ascending: true, nullsFirst: true }).order("sort_order", { ascending: true }),
        (supabase as any).from("promotion_package_logs").select("*").order("created_at", { ascending: false }).limit(60),
      ]);
      if (pkgRes.data)  setPackages(pkgRes.data as PromotionPackage[]);
      if (logRes.data)  setLogs(logRes.data as PackageLog[]);
    } catch {
      toast.error("Erro ao buscar pacotes. Rode a migration SQL primeiro.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── Seed default packages ── */
  const [seeding, setSeeding] = useState(false);

  async function handleSeedDefaults() {
    if (!confirm(`Inserir ${SEED_PACKAGES.length} pacotes padrão (todos os perfis)?`)) return;
    setSeeding(true);
    try {
      // Insert in batches of 5 to avoid payload limits
      let created = 0;
      let skipped = 0;
      for (let i = 0; i < SEED_PACKAGES.length; i += 5) {
        const batch = SEED_PACKAGES.slice(i, i + 5);
        const { data, error } = await (supabase as any)
          .from("promotion_packages")
          .upsert(batch, { onConflict: "slug", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        created += data?.length ?? 0;
        skipped += batch.length - (data?.length ?? 0);
      }
      await saveLog("seed_defaults", null, null, { total: SEED_PACKAGES.length, created, skipped });
      toast.success(`${created} pacote(s) criado(s)!${skipped > 0 ? ` ${skipped} já existiam (ignorados).` : ""}`);
      fetchAll();
    } catch (err: any) {
      // Table may not exist — show helpful message
      if (err.message?.includes("does not exist") || err.code === "42P01") {
        toast.error("Tabela não existe. Rode a migration SQL no Supabase primeiro.");
      } else {
        toast.error(`Erro: ${err.message}`);
      }
    } finally {
      setSeeding(false);
    }
  }

  /* ── Filter by profile tab ── */

  const visible = packages.filter((p) => {
    if (profileTab === "all")    return true;
    if (profileTab === "global") return p.profile_type === null;
    return p.profile_type === profileTab;
  });

  /* ── Form helpers ── */

  function openCreate(defaultProfile?: ProfileType | null) {
    setEditingId(null);
    setForm({ ...EMPTY, profile_type: defaultProfile ?? null, benefits: [""] });
    setShowForm(true);
  }

  function openEdit(pkg: PromotionPackage) {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name, slug: pkg.slug, description: pkg.description ?? "",
      color: pkg.color, color_secondary: pkg.color_secondary ?? "", icon: pkg.icon ?? "🏅",
      daily_boosts: pkg.daily_boosts, price_monthly: pkg.price_monthly,
      period_options: pkg.period_options ?? [7, 15, 30], benefits: pkg.benefits ?? [""],
      is_popular: pkg.is_popular, badge_text: pkg.badge_text, profile_type: pkg.profile_type,
    });
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditingId(null); setForm({ ...EMPTY, benefits: [""] }); }

  /* ── CRUD ── */

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Nome obrigatório.");
    setSaving(true);
    try {
      const payload = { ...form, slug: form.slug || toSlug(form.name), benefits: form.benefits.filter((b) => b.trim()) };
      if (editingId) {
        const old = packages.find((p) => p.id === editingId);
        const { error } = await (supabase as any).from("promotion_packages").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingId);
        if (error) throw error;
        await saveLog("update", editingId, old, payload);
        toast.success(`"${form.name}" atualizado!`);
      } else {
        const maxOrder = packages.filter((p) => p.profile_type === form.profile_type).reduce((m, p) => Math.max(m, p.sort_order), 0);
        const { error } = await (supabase as any).from("promotion_packages").insert({ ...payload, is_active: true, sort_order: maxOrder + 1 });
        if (error) throw error;
        await saveLog("create", null, null, payload);
        toast.success(`"${form.name}" criado!`);
      }
      closeForm(); fetchAll();
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setSaving(false); }
  }

  async function handleDelete(pkg: PromotionPackage) {
    if (!confirm(`Excluir "${pkg.name}"?`)) return;
    await (supabase as any).from("promotion_packages").delete().eq("id", pkg.id);
    await saveLog("delete", pkg.id, pkg, null);
    toast.success(`"${pkg.name}" excluído.`); fetchAll();
  }

  async function handleToggleActive(pkg: PromotionPackage) {
    const next = !pkg.is_active;
    await (supabase as any).from("promotion_packages").update({ is_active: next }).eq("id", pkg.id);
    await saveLog("toggle_active", pkg.id, { is_active: pkg.is_active }, { is_active: next });
    toast(next ? `"${pkg.name}" ativado.` : `"${pkg.name}" desativado.`); fetchAll();
  }

  async function handleTogglePopular(pkg: PromotionPackage) {
    const next = !pkg.is_popular;
    await (supabase as any).from("promotion_packages").update({ is_popular: next, badge_text: next ? (pkg.badge_text ?? "Mais Popular") : null }).eq("id", pkg.id);
    await saveLog("toggle_popular", pkg.id, { is_popular: pkg.is_popular }, { is_popular: next });
    toast(next ? `"${pkg.name}" marcado como popular!` : `"${pkg.name}" desmarcado.`); fetchAll();
  }

  async function handleMoveOrder(pkg: PromotionPackage, dir: -1 | 1) {
    const scoped = [...packages].filter((p) => p.profile_type === pkg.profile_type).sort((a, b) => a.sort_order - b.sort_order);
    const idx = scoped.findIndex((p) => p.id === pkg.id);
    const swap = scoped[idx + dir];
    if (!swap) return;
    await Promise.all([
      (supabase as any).from("promotion_packages").update({ sort_order: swap.sort_order }).eq("id", pkg.id),
      (supabase as any).from("promotion_packages").update({ sort_order: pkg.sort_order }).eq("id", swap.id),
    ]);
    fetchAll();
  }

  /* ── GLM ── */

  async function handleGlmSend() {
    if (!glmCmd.trim()) return;
    setGlmBusy(true); setGlmPreview(null); setGlmParsed(null);
    try {
      const raw = await chatCompletion(glmCmd, "glm-4-plus", buildGlmPrompt(packages));
      const parsed = JSON.parse(raw.trim()) as Record<string, unknown>;
      setGlmParsed(parsed);
      setGlmPreview((parsed.confirmation_message as string) ?? "Operação pronta.");
    } catch { toast.error("GLM não entendeu. Tente novamente."); }
    finally { setGlmBusy(false); }
  }

  async function handleGlmExecute() {
    if (!glmParsed) return;
    setGlmBusy(true);
    try {
      const { action, package_id, data, multiplier } = glmParsed as any;
      if (action === "create") {
        const maxOrder = packages.filter((p) => p.profile_type === (data?.profile_type ?? null)).reduce((m, p) => Math.max(m, p.sort_order), 0);
        await (supabase as any).from("promotion_packages").insert({ ...data, slug: data.slug ?? toSlug(data.name ?? "pacote"), is_active: true, sort_order: maxOrder + 1 });
        await saveLog("create", null, null, data, glmCmd); toast.success(`"${data.name}" criado pela IA!`);
      } else if (action === "update" && package_id) {
        const old = packages.find((p) => p.id === package_id);
        await (supabase as any).from("promotion_packages").update({ ...data, updated_at: new Date().toISOString() }).eq("id", package_id);
        await saveLog("update", package_id, old, data, glmCmd); toast.success("Atualizado pela IA!");
      } else if (action === "delete" && package_id) {
        const old = packages.find((p) => p.id === package_id);
        await (supabase as any).from("promotion_packages").delete().eq("id", package_id);
        await saveLog("delete", package_id, old, null, glmCmd); toast.success("Excluído pela IA.");
      } else if (action === "toggle_active" && package_id) {
        const pkg = packages.find((p) => p.id === package_id);
        const next = !pkg?.is_active;
        await (supabase as any).from("promotion_packages").update({ is_active: next }).eq("id", package_id);
        await saveLog("toggle_active", package_id, { is_active: pkg?.is_active }, { is_active: next }, glmCmd);
        toast.success(next ? "Ativado." : "Desativado.");
      } else if (action === "bulk_price_update" && multiplier) {
        for (const p of packages) {
          await (supabase as any).from("promotion_packages").update({ price_monthly: parseFloat((p.price_monthly * multiplier).toFixed(2)) }).eq("id", p.id);
        }
        await saveLog("bulk_price_update", null, null, { multiplier }, glmCmd);
        toast.success(`Preços ajustados ×${multiplier} pela IA!`);
      } else if (action === "duplicate" && package_id) {
        const src = packages.find((p) => p.id === package_id);
        if (src) {
          const { id: _, ...rest } = src;
          const maxOrder = packages.filter((p) => p.profile_type === (data?.profile_type ?? src.profile_type)).reduce((m, p) => Math.max(m, p.sort_order), 0);
          await (supabase as any).from("promotion_packages").insert({ ...rest, ...data, name: data?.name ?? `${src.name} (Cópia)`, slug: toSlug(data?.name ?? `${src.name}-copia`), sort_order: maxOrder + 1 });
          await saveLog("duplicate", package_id, src, data, glmCmd); toast.success("Duplicado pela IA!");
        }
      } else { toast.error("Ação não reconhecida."); }

      setGlmCmd(""); setGlmPreview(null); setGlmParsed(null); fetchAll();
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setGlmBusy(false); }
  }

  /* ── Profile label util ── */

  function profileLabel(pt: ProfileType | null) {
    if (!pt) return { label: "Global", emoji: "🌐" };
    return PROFILE_LABELS[pt];
  }

  /* ── Render ── */

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#FF8C33] flex items-center justify-center shadow-lg shadow-[#FF6A00]/25">
            <Package className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#F5F7FA] tracking-tight uppercase">Pacotes de Promoção</h1>
            <p className="text-sm text-[#A7B0BE] mt-0.5">Gerencie planos por perfil de anunciante</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSeedDefaults} disabled={seeding} variant="outline"
            className="border-violet-500/40 text-violet-300 hover:bg-violet-500/10 hover:border-violet-400 font-black uppercase tracking-wider text-xs h-10 px-4 rounded-xl bg-transparent">
            {seeding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DatabaseZap className="w-4 h-4 mr-2" />}
            Seed Padrão (21)
          </Button>
          <Button onClick={() => openCreate(profileTab === "all" || profileTab === "global" ? null : profileTab as ProfileType)}
            className="bg-[#FF6A00] hover:bg-[#E65C00] text-white font-black uppercase tracking-wider text-xs h-10 px-5 rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Novo Pacote
          </Button>
        </div>
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 p-1 bg-[#1B1F24] rounded-xl w-fit">
        {(["packages", "logs"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === tab ? "bg-[#FF6A00] text-white" : "text-[#A7B0BE] hover:text-white"}`}>
            {tab === "packages" ? <Package className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
            {tab === "packages" ? "Pacotes" : "Histórico"}
          </button>
        ))}
      </div>

      {/* ── PACKAGES TAB ── */}
      {activeTab === "packages" && (
        <div className="space-y-5">
          {/* GLM AI */}
          <div className="bg-[#0D0F12] border border-violet-500/20 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-violet-500/15"
              style={{ background: "linear-gradient(to right, rgba(139,92,246,0.08), transparent)" }}>
              <Bot className="w-4 h-4 text-violet-400" />
              <p className="text-xs font-black text-violet-300 uppercase tracking-wider flex-1">IA GLM — Gestão por comando</p>
              <Sparkles className="w-3.5 h-3.5 text-violet-400/50" />
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[10px] text-[#A7B0BE]/50 leading-relaxed">
                Exemplos: <em>"Criar pacote Diamante para viagens com 60 boosts por R$ 79,90"</em> ·
                <em>"Reajustar todos os preços em +10%"</em> · <em>"Desativar Bronze de serviços"</em> · <em>"Duplicar Ouro de imóveis como Premium"</em>
              </p>
              <div className="flex gap-2">
                <input value={glmCmd} onChange={(e) => setGlmCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleGlmSend()}
                  placeholder="Digite um comando em português..."
                  className="flex-1 h-10 bg-[#1B1F24] border border-violet-500/20 rounded-xl px-4 text-[#F5F7FA] text-sm placeholder:text-[#A7B0BE]/30 outline-none focus:border-violet-500/50 transition-colors" />
                <Button onClick={handleGlmSend} disabled={glmBusy || !glmCmd.trim()}
                  className="h-10 px-4 bg-violet-600 hover:bg-violet-500 text-white font-black text-xs rounded-xl">
                  {glmBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                </Button>
              </div>
              {glmPreview && glmParsed && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 animate-in fade-in duration-200">
                  <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-violet-300 font-bold">{glmPreview}</p>
                    <p className="text-[9px] text-violet-400/50 mt-0.5">Ação: <strong>{(glmParsed as any).action}</strong></p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={handleGlmExecute} disabled={glmBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[10px] font-black hover:bg-violet-500 transition-colors">
                      {glmBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Executar
                    </button>
                    <button onClick={() => { setGlmPreview(null); setGlmParsed(null); }}
                      className="p-1.5 rounded-lg bg-[#2A3038] text-[#A7B0BE] hover:text-white transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Profile tabs */}
          <div className="flex gap-1 flex-wrap">
            {ALL_PROFILES.map((p) => {
              const count = p.key === "all"
                ? packages.length
                : p.key === "global"
                  ? packages.filter((pkg) => pkg.profile_type === null).length
                  : packages.filter((pkg) => pkg.profile_type === p.key).length;

              return (
                <button key={p.key} onClick={() => setProfileTab(p.key as typeof profileTab)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                    profileTab === p.key
                      ? "bg-[#FF6A00] text-white"
                      : "bg-[#1B1F24] text-[#A7B0BE] hover:text-white hover:bg-[#2A3038]"
                  }`}>
                  <span>{p.emoji}</span>
                  {p.label}
                  <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-black ${profileTab === p.key ? "bg-white/20 text-white" : "bg-[#2A3038] text-[#A7B0BE]"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Cards */}
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-[#FF6A00] animate-spin" /></div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-[#0D0F12] rounded-2xl border border-[#2A3038]/60">
              <Package className="w-10 h-10 text-[#2A3038]" />
              <p className="text-[#A7B0BE]/50 text-sm font-bold">Nenhum pacote neste perfil.</p>
              <Button size="sm" onClick={() => openCreate(profileTab === "all" || profileTab === "global" ? null : profileTab as ProfileType)}
                className="bg-[#FF6A00] hover:bg-[#E65C00] text-white font-black text-xs uppercase">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar Pacote
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((pkg) => {
                const pl = profileLabel(pkg.profile_type);
                return (
                  <div key={pkg.id}
                    className={`rounded-2xl overflow-hidden border transition-all ${!pkg.is_active ? "opacity-50 grayscale" : ""}`}
                    style={{ borderColor: pkg.color + "40" }}>
                    {/* Card header */}
                    <div className="px-4 py-3 flex items-center justify-between"
                      style={{ background: `linear-gradient(135deg, ${pkg.color}22, ${pkg.color_secondary ?? pkg.color}10)`, borderBottom: `1px solid ${pkg.color}25` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl shrink-0">{pkg.icon ?? "🏅"}</span>
                        <div className="min-w-0">
                          <p className="text-white font-black text-sm uppercase tracking-wide truncate">{pkg.name}</p>
                          <p className="text-[#A7B0BE] text-[10px] truncate">{pkg.description}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        {pkg.is_popular && (
                          <Badge className="text-[8px] font-black px-1.5 py-0.5" style={{ background: pkg.color + "30", color: pkg.color, border: `1px solid ${pkg.color}50` }}>
                            <Star className="w-2 h-2 mr-0.5" /> Popular
                          </Badge>
                        )}
                        <Badge className={`text-[8px] font-black px-1.5 py-0.5 ${pkg.is_active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-red-500/15 text-red-400 border-red-500/25"}`}>
                          {pkg.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </div>

                    {/* Profile badge */}
                    <div className="px-4 py-2 flex items-center gap-1.5 bg-[#1B1F24]/60 border-b border-[#2A3038]/30">
                      <span className="text-xs">{pl.emoji}</span>
                      <span className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-wider">{pl.label}</span>
                    </div>

                    {/* Stats */}
                    <div className="bg-[#0D0F12] px-4 py-3 space-y-1.5">
                      {[
                        ["Impulsionamentos/dia", pkg.daily_boosts, pkg.color],
                        ["Preço/mês", `R$ ${pkg.price_monthly.toFixed(2).replace(".", ",")}`, "#fff"],
                        ["Benefícios", pkg.benefits?.length ?? 0, "#fff"],
                        ["Períodos", (pkg.period_options ?? []).join(", ") + " dias", "#fff"],
                      ].map(([label, value, color]) => (
                        <div key={label as string} className="flex items-center justify-between text-[11px]">
                          <span className="text-[#A7B0BE]">{label}</span>
                          <span className="font-black" style={{ color: color as string }}>{value as string}</span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="bg-[#0D0F12] px-4 pb-3 pt-3 flex flex-wrap gap-1.5 border-t border-[#2A3038]/40">
                      <button onClick={() => openEdit(pkg)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1B1F24] text-[#A7B0BE] hover:text-white text-[10px] font-black transition-all hover:bg-[#2A3038]">
                        <Edit2 className="w-3 h-3" /> Editar
                      </button>
                      <button onClick={() => handleToggleActive(pkg)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all ${pkg.is_active ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}>
                        {pkg.is_active ? <ToggleLeft className="w-3 h-3" /> : <ToggleRight className="w-3 h-3" />}
                        {pkg.is_active ? "Desativar" : "Ativar"}
                      </button>
                      <button onClick={() => handleTogglePopular(pkg)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all ${pkg.is_popular ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20" : "bg-[#1B1F24] text-[#A7B0BE] hover:text-white hover:bg-[#2A3038]"}`}>
                        {pkg.is_popular ? <Star className="w-3 h-3" /> : <StarOff className="w-3 h-3" />}
                        {pkg.is_popular ? "Popular" : "Destacar"}
                      </button>
                      <button onClick={() => handleMoveOrder(pkg, -1)} className="p-1.5 rounded-lg bg-[#1B1F24] text-[#A7B0BE] hover:text-white hover:bg-[#2A3038] transition-all" title="Subir">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleMoveOrder(pkg, 1)} className="p-1.5 rounded-lg bg-[#1B1F24] text-[#A7B0BE] hover:text-white hover:bg-[#2A3038] transition-all" title="Descer">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(pkg)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-black transition-all ml-auto">
                        <Trash2 className="w-3 h-3" /> Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LOGS TAB ── */}
      {activeTab === "logs" && (
        <div className="bg-[#0D0F12] rounded-2xl border border-[#2A3038]/60 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2A3038]/40">
            <History className="w-4 h-4 text-[#FF6A00]" />
            <p className="text-sm font-black text-white uppercase tracking-wider">Histórico de Alterações</p>
            <Badge className="bg-[#FF6A00]/15 text-[#FF6A00] border-[#FF6A00]/30 text-[10px] font-black ml-auto">{logs.length} registros</Badge>
          </div>
          {logs.length === 0 ? (
            <div className="flex items-center justify-center py-12"><p className="text-[#A7B0BE]/40 text-sm">Nenhum log encontrado.</p></div>
          ) : (
            <div className="divide-y divide-[#2A3038]/30">
              {logs.map((log) => {
                const pkg = packages.find((p) => p.id === log.package_id);
                return (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-[#1B1F24]/50 transition-colors">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: log.ai_command ? "rgba(139,92,246,0.10)" : "rgba(255,106,0,0.10)", border: log.ai_command ? "1px solid rgba(139,92,246,0.20)" : "1px solid rgba(255,106,0,0.20)" }}>
                      {log.ai_command ? <Bot className="w-3.5 h-3.5 text-violet-400" /> : <Undo2 className="w-3.5 h-3.5 text-[#FF6A00]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white uppercase">{log.action}</span>
                        {pkg && <span className="text-[10px] text-[#A7B0BE]">→ {pkg.name}</span>}
                        {log.ai_command && <span className="text-[9px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded-full font-bold">IA</span>}
                      </div>
                      {log.ai_command && <p className="text-[10px] text-violet-400/70 mt-0.5 truncate italic">"{log.ai_command}"</p>}
                      <p className="text-[9px] text-[#A7B0BE]/40 mt-0.5">
                        {new Date(log.created_at).toLocaleString("pt-BR")} · {log.performed_by}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════
          FORM OVERLAY
      ══════════════════════════════ */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0D0F12] border border-[#2A3038]/60 shadow-2xl custom-scrollbar">
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#0D0F12] border-b border-[#2A3038]/40">
              <p className="text-white font-black text-sm uppercase tracking-wider">
                {editingId ? "Editar Pacote" : "Novo Pacote"}
              </p>
              <button onClick={closeForm} className="text-[#A7B0BE] hover:text-white transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Perfil */}
              <div>
                <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Perfil do Anunciante</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setForm((p) => ({ ...p, profile_type: null }))}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${form.profile_type === null ? "bg-[#FF6A00] text-white" : "bg-[#1B1F24] text-[#A7B0BE] hover:text-white"}`}>
                    🌐 Global
                  </button>
                  {(Object.keys(PROFILE_LABELS) as ProfileType[]).map((pt) => (
                    <button key={pt} onClick={() => setForm((p) => ({ ...p, profile_type: pt }))}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${form.profile_type === pt ? "bg-[#FF6A00] text-white" : "bg-[#1B1F24] text-[#A7B0BE] hover:text-white"}`}>
                      {PROFILE_LABELS[pt].emoji} {PROFILE_LABELS[pt].label.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Nome *</label>
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value, slug: p.slug || toSlug(e.target.value) }))}
                    className="bg-[#1B1F24] border-[#2A3038] text-white" placeholder="Ex: Diamante" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Slug</label>
                  <Input value={form.slug ?? ""} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                    className="bg-[#1B1F24] border-[#2A3038] text-white font-mono text-xs" placeholder="diamante" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Ícone (emoji)</label>
                  <Input value={form.icon ?? ""} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
                    className="bg-[#1B1F24] border-[#2A3038] text-white text-center text-xl" placeholder="💎" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Descrição</label>
                  <Input value={form.description ?? ""} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className="bg-[#1B1F24] border-[#2A3038] text-white" placeholder="Slogan do pacote" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Cor principal</label>
                  <div className="flex gap-2">
                    <input type="color" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                      className="w-10 h-9 rounded-lg border border-[#2A3038] bg-[#1B1F24] cursor-pointer" />
                    <Input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                      className="bg-[#1B1F24] border-[#2A3038] text-white font-mono text-xs flex-1" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Cor secundária</label>
                  <div className="flex gap-2">
                    <input type="color" value={form.color_secondary ?? "#000000"} onChange={(e) => setForm((p) => ({ ...p, color_secondary: e.target.value }))}
                      className="w-10 h-9 rounded-lg border border-[#2A3038] bg-[#1B1F24] cursor-pointer" />
                    <Input value={form.color_secondary ?? ""} onChange={(e) => setForm((p) => ({ ...p, color_secondary: e.target.value }))}
                      className="bg-[#1B1F24] border-[#2A3038] text-white font-mono text-xs flex-1" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Impulsionamentos/dia *</label>
                  <Input type="number" value={form.daily_boosts} min={1}
                    onChange={(e) => setForm((p) => ({ ...p, daily_boosts: parseInt(e.target.value) || 0 }))}
                    className="bg-[#1B1F24] border-[#2A3038] text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Preço/mês (R$) *</label>
                  <Input type="number" value={form.price_monthly} min={0} step={0.01}
                    onChange={(e) => setForm((p) => ({ ...p, price_monthly: parseFloat(e.target.value) || 0 }))}
                    className="bg-[#1B1F24] border-[#2A3038] text-white" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Períodos (dias, vírgula)</label>
                  <Input value={(form.period_options ?? []).join(", ")}
                    onChange={(e) => { const v = e.target.value.split(",").map((x) => parseInt(x.trim())).filter((n) => !isNaN(n)); setForm((p) => ({ ...p, period_options: v })); }}
                    className="bg-[#1B1F24] border-[#2A3038] text-white" placeholder="7, 15, 30" />
                </div>

                {/* Benefits */}
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-2 block">Benefícios</label>
                  <div className="space-y-1.5">
                    {(form.benefits ?? [""]).map((b, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={b} onChange={(e) => { const u = [...(form.benefits ?? [""])]; u[i] = e.target.value; setForm((p) => ({ ...p, benefits: u })); }}
                          className="bg-[#1B1F24] border-[#2A3038] text-white flex-1 text-xs" placeholder={`Benefício ${i + 1}`} />
                        <button onClick={() => { const u = (form.benefits ?? [""]).filter((_, j) => j !== i); setForm((p) => ({ ...p, benefits: u.length ? u : [""] })); }}
                          className="text-red-400 hover:text-red-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <button onClick={() => setForm((p) => ({ ...p, benefits: [...(p.benefits ?? []), ""] }))}
                      className="flex items-center gap-1.5 text-[10px] text-[#FF6A00] font-bold hover:text-[#FF8C33] transition-colors">
                      <Plus className="w-3 h-3" /> Adicionar benefício
                    </button>
                  </div>
                </div>

                <div className="col-span-2 flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_popular} onChange={(e) => setForm((p) => ({ ...p, is_popular: e.target.checked }))}
                      className="w-4 h-4 accent-[#FF6A00]" />
                    <span className="text-xs font-bold text-[#A7B0BE]">Marcar como Mais Popular</span>
                  </label>
                </div>
                {form.is_popular && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest mb-1 block">Texto do badge</label>
                    <Input value={form.badge_text ?? ""} onChange={(e) => setForm((p) => ({ ...p, badge_text: e.target.value || null }))}
                      className="bg-[#1B1F24] border-[#2A3038] text-white" placeholder="Mais Popular" />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={closeForm} variant="outline" className="flex-1 border-[#2A3038] text-[#A7B0BE] hover:text-white bg-transparent">Cancelar</Button>
                <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#FF6A00] hover:bg-[#E65C00] text-white font-black uppercase tracking-wider text-xs">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {editingId ? "Salvar" : "Criar Pacote"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
