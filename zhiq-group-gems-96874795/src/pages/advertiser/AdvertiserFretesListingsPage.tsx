/**
 * AdvertiserFretesListingsPage — /anunciante/fretes/meus-anuncios
 *
 * Lista APENAS fretes (freight_listings) do anunciante. Cadastro novo é
 * feito pelo tipo de veículo (lista fechada de 7 — não precisa do Combobox
 * grande de Serviços), levando ao FreightForm com o tipo pré-selecionado
 * (?tipo=). Espelha AdvertiserServicesListingsPage.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { FREIGHT_VEHICLE_TYPES, resolveFreightVehicleIcon } from "@/lib/freight/vehicleTypes";

export default function AdvertiserFretesListingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: fretes = [], isLoading } = useQuery({
    queryKey: ["fretes-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("freight_listings") as any)
        .select("id, title, vehicle_type, visibility_status, price_label, price_per_km, city, state, is_featured, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (s: any) => {
        const { data: media } = await (supabase.from("freight_media") as any)
          .select("original_storage_path, public_masked_storage_path")
          .eq("listing_id", s.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.public_masked_storage_path && media.public_masked_storage_path !== media.original_storage_path;
        const path = hasThumb ? media.public_masked_storage_path : media?.original_storage_path;
        return { ...s, thumb: path ? getListingImageUrl(path, hasThumb ? 'public' : 'original') : null };
      }));
    },
  });

  return (
    <div className="w-full max-w-4xl min-w-0 mx-auto px-4 py-6 space-y-8">
      <div className="space-y-4">
        <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" /> Anunciar frete
        </h1>
        <p className="text-sm text-zinc-500">Escolha o tipo de veículo para cadastrar:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FREIGHT_VEHICLE_TYPES.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.value}
                onClick={() => navigate(`/anunciante/fretes/anuncios/novo/frete?tipo=${encodeURIComponent(v.value)}`)}
                className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 bg-blue-600">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <span className="font-bold text-zinc-800 text-sm">{v.label}</span>
                <span className="text-[11px] font-black text-blue-600">Anunciar grátis</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
          🔓 O anúncio é publicado <strong>gratuitamente</strong>. Você usa créditos apenas para desbloquear o contato do interessado.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-black text-zinc-900">Meus fretes ({fretes.length})</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : fretes.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
            Você ainda não tem fretes cadastrados. Escolha um tipo de veículo acima para começar.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
            {fretes.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 ring-1 ring-blue-200/60 shrink-0 flex items-center justify-center">
                  {s.thumb ? (
                    <img src={s.thumb} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    (() => { const RowIcon = resolveFreightVehicleIcon(s.vehicle_type); return <RowIcon className="w-[26px] h-[26px] text-blue-600" />; })()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{s.title || "Sem título"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {s.vehicle_type}
                    {" · "}{[s.city, s.state].filter(Boolean).join("/")}
                    {" · "}{s.visibility_status}
                    {s.is_featured && " · ⭐ destaque"}
                  </p>
                </div>
                <span className="text-sm font-black text-blue-600 shrink-0 text-right">
                  {s.price_label?.trim() || "—"}
                  {!!s.price_per_km && (
                    <span className="block text-[10px] font-bold text-zinc-400">
                      R$ {Number(s.price_per_km).toFixed(2)}/km
                    </span>
                  )}
                </span>
                <button
                  onClick={() => navigate(`/anunciante/fretes/anuncios/editar/frete/${s.id}`)}
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
