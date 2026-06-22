/**
 * AdvertiserImoveisListingsPage — /anunciante/imoveis/meus-anuncios
 *
 * Lista APENAS imóveis (real_estate_listings) do anunciante — sem produtos/
 * veículos do mercado. Cadastro novo é feito pelas 4 categorias (Sítio, Chácara,
 * Lote Urbano, Fazenda), levando ao PropertyForm com o tipo pré-selecionado.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, Trees, Tractor, MapPin, Wheat, Loader2, Pencil, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";

interface Cat { key: string; label: string; icon: LucideIcon; color: string; }
const CATEGORIES: Cat[] = [
  { key: "sitio", label: "Sítio", icon: Trees, color: "bg-emerald-600" },
  { key: "chacara", label: "Chácara", icon: Tractor, color: "bg-lime-600" },
  { key: "lote", label: "Lote Urbano", icon: MapPin, color: "bg-amber-600" },
  { key: "fazenda", label: "Fazenda", icon: Wheat, color: "bg-orange-600" },
];
const TYPE_LABEL: Record<string, string> = {
  sitio: "Sítio", chacara: "Chácara", lote: "Lote Urbano", fazenda: "Fazenda", terreno: "Terreno",
};
const DEFAULT_COST: Record<string, number> = { sitio: 80, chacara: 80, lote: 50, fazenda: 150 };

export default function AdvertiserImoveisListingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: imoveis = [], isLoading } = useQuery({
    queryKey: ["imoveis-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("real_estate_listings") as any)
        .select("id, title, property_type, visibility_status, price_brl, city, state, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      // Anexa a 1ª imagem de cada imóvel (miniatura na linha).
      return Promise.all(list.map(async (im: any) => {
        const { data: media } = await (supabase.from("real_estate_media") as any)
          .select("original_storage_path, thumb_masked_storage_path")
          .eq("listing_id", im.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.thumb_masked_storage_path;
        const path = media?.thumb_masked_storage_path || media?.original_storage_path;
        return { ...im, thumb: path ? getListingImageUrl(path, hasThumb ? 'public' : 'original') : null };
      }));
    },
  });

  // Custo de desbloqueio por categoria (admin → Cobranças).
  const { data: costs = DEFAULT_COST } = useQuery({
    queryKey: ["imoveis-unlock-costs"],
    queryFn: async () => {
      const codes = Object.keys(DEFAULT_COST).map((k) => `real_estate_unlock_${k}`);
      const { data } = await (supabase.from("merchant_credit_usage_rules") as any)
        .select("feature_code, credits_cost")
        .in("feature_code", codes);
      const out: Record<string, number> = { ...DEFAULT_COST };
      (data || []).forEach((r: any) => {
        out[String(r.feature_code).replace("real_estate_unlock_", "")] = Number(r.credits_cost) || 0;
      });
      return out;
    },
  });

  return (
    <div className="w-full max-w-4xl min-w-0 mx-auto px-4 py-6 space-y-8">
      {/* Cadastrar por categoria */}
      <div className="space-y-4">
        <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-600" /> Anunciar imóvel
        </h1>
        <p className="text-sm text-zinc-500">Escolha a categoria para cadastrar:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                onClick={() => navigate(`/anunciante/imoveis/anuncios/novo/imovel?tipo=${c.key}`)}
                className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all"
              >
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110", c.color)}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <span className="font-bold text-zinc-800 text-sm">{c.label}</span>
                <span className="text-[11px] font-black text-emerald-600">{costs[c.key]} cr p/ desbloquear</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          🔓 Cada categoria tem um <strong>custo fixo em créditos</strong> para desbloquear o contato do interessado (configurável no admin → Cobranças).
        </p>
      </div>

      {/* Meus imóveis */}
      <div className="space-y-3">
        <h2 className="text-lg font-black text-zinc-900">Meus imóveis ({imoveis.length})</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : imoveis.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
            Você ainda não tem imóveis cadastrados. Escolha uma categoria acima para começar.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
            {imoveis.map((im: any) => (
              <div key={im.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                  {im.thumb ? (
                    <img src={im.thumb} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <Building2 className="w-5 h-5 text-zinc-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{im.title || "Sem título"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {TYPE_LABEL[im.property_type] || im.property_type || "Imóvel"}
                    {" · "}{[im.city, im.state].filter(Boolean).join("/")}
                    {" · "}{im.visibility_status}
                  </p>
                </div>
                <span className="text-sm font-black text-emerald-600 shrink-0">
                  {im.price_brl ? `R$ ${Number(im.price_brl).toLocaleString("pt-BR")}` : "—"}
                </span>
                <button
                  onClick={() => navigate(`/anunciante/imoveis/anuncios/editar/imovel/${im.id}`)}
                  title="Editar"
                  className="p-2 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
