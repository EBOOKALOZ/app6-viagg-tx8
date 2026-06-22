/**
 * AdvertiserVeiculosListingsPage — /anunciante/veiculos/meus-anuncios
 *
 * Lista APENAS veículos (vehicle_listings) do anunciante. Cadastro novo é feito
 * pelas 4 categorias (Carro, Moto, Barco, Utilitário), levando ao VehicleForm
 * com o tipo pré-selecionado (?tipo=). Espelha AdvertiserImoveisListingsPage.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Car, Bike, Ship, Truck, CarFront, Loader2, Pencil, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";

interface Cat { key: string; label: string; icon: LucideIcon; color: string; }
const CATEGORIES: Cat[] = [
  { key: "carro", label: "Carro", icon: Car, color: "bg-blue-600" },
  { key: "moto", label: "Moto", icon: Bike, color: "bg-indigo-600" },
  { key: "barco", label: "Barco", icon: Ship, color: "bg-cyan-600" },
  { key: "utilitario", label: "Utilitário", icon: Truck, color: "bg-slate-600" },
];
const TYPE_LABEL: Record<string, string> = {
  carro: "Carro", moto: "Moto", barco: "Barco", utilitario: "Utilitário",
};

export default function AdvertiserVeiculosListingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: veiculos = [], isLoading } = useQuery({
    queryKey: ["veiculos-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("vehicle_listings") as any)
        .select("id, title, vehicle_type, brand, model, year, visibility_status, price_brl, city, state, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (v: any) => {
        const { data: media } = await (supabase.from("vehicle_media") as any)
          .select("original_storage_path, public_masked_storage_path")
          .eq("listing_id", v.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.public_masked_storage_path && media.public_masked_storage_path !== media.original_storage_path;
        const path = hasThumb ? media.public_masked_storage_path : media?.original_storage_path;
        return { ...v, thumb: path ? getListingImageUrl(path, hasThumb ? 'public' : 'original') : null };
      }));
    },
  });

  return (
    <div className="w-full max-w-4xl min-w-0 mx-auto px-4 py-6 space-y-8">
      {/* Cadastrar por categoria */}
      <div className="space-y-4">
        <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
          <CarFront className="w-5 h-5 text-blue-600" /> Anunciar veículo
        </h1>
        <p className="text-sm text-zinc-500">Escolha a categoria para cadastrar:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                onClick={() => navigate(`/anunciante/veiculos/anuncios/novo/veiculo?tipo=${c.key}`)}
                className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110", c.color)}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <span className="font-bold text-zinc-800 text-sm">{c.label}</span>
                <span className="text-[11px] font-black text-blue-600">Anunciar grátis</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          🔓 O anúncio é publicado <strong>gratuitamente</strong>. Você usa créditos apenas para desbloquear o contato do interessado.
        </p>
      </div>

      {/* Meus veículos */}
      <div className="space-y-3">
        <h2 className="text-lg font-black text-zinc-900">Meus veículos ({veiculos.length})</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : veiculos.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
            Você ainda não tem veículos cadastrados. Escolha uma categoria acima para começar.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
            {veiculos.map((v: any) => (
              <div key={v.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 shrink-0 flex items-center justify-center">
                  {v.thumb ? (
                    <img src={v.thumb} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    <Car className="w-5 h-5 text-zinc-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{v.title || [v.brand, v.model].filter(Boolean).join(" ") || "Sem título"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {TYPE_LABEL[v.vehicle_type] || v.vehicle_type || "Veículo"}
                    {v.year ? ` · ${v.year}` : ""}
                    {" · "}{[v.city, v.state].filter(Boolean).join("/")}
                    {" · "}{v.visibility_status}
                  </p>
                </div>
                <span className="text-sm font-black text-blue-600 shrink-0">
                  {v.price_brl ? `R$ ${Number(v.price_brl).toLocaleString("pt-BR")}` : "—"}
                </span>
                <button
                  onClick={() => navigate(`/anunciante/veiculos/anuncios/editar/veiculo/${v.id}`)}
                  title="Editar"
                  className="p-2 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
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
