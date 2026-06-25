import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plane, Loader2, Pencil } from "lucide-react";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { TRAVEL_CATEGORIES } from "@/lib/viagem/travelCategories";

export default function AdvertiserViagemListingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: viagens = [], isLoading } = useQuery({
    queryKey: ["viagens-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("travel_listings") as any)
        .select("id, title, category, destination, visibility_status, entry_price, price_per_person, city, state, is_featured, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (s: any) => {
        const { data: media } = await (supabase.from("travel_media") as any)
          .select("original_storage_path, public_masked_storage_path")
          .eq("listing_id", s.id)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        const hasThumb = !!media?.public_masked_storage_path && media.public_masked_storage_path !== media.original_storage_path;
        const path = hasThumb ? media.public_masked_storage_path : media?.original_storage_path;
        return { ...s, thumb: path ? getListingImageUrl(path, hasThumb ? "public" : "original") : null };
      }));
    },
  });

  return (
    <div className="w-full max-w-4xl min-w-0 mx-auto px-4 py-6 space-y-8">
      <div className="space-y-4">
        <h1 className="text-xl font-black text-zinc-900 flex items-center gap-2">
          <Plane className="w-5 h-5 text-sky-600" /> Anunciar viagem
        </h1>
        <p className="text-sm text-zinc-500">Escolha a categoria para cadastrar:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TRAVEL_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => navigate(`/anunciante/viagens/anuncios/novo/viagem?categoria=${encodeURIComponent(cat.value)}`)}
              className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-sky-300 hover:shadow-sm transition-all"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 bg-sky-600 text-3xl">
                {cat.emoji}
              </div>
              <span className="font-bold text-zinc-800 text-sm text-center leading-tight">{cat.label}</span>
              <span className="text-[11px] font-black text-sky-600">Anunciar gratis</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
          O anuncio e publicado gratuitamente. Voce usa creditos apenas para desbloquear o contato do interessado.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-black text-zinc-900">Meus anuncios ({viagens.length})</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : viagens.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
            Voce ainda nao tem viagens cadastradas. Escolha uma categoria acima para comecar.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
            {viagens.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-sky-50 to-sky-100 ring-1 ring-sky-200/60 shrink-0 flex items-center justify-center">
                  {s.thumb ? (
                    <img src={s.thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Plane className="w-6 h-6 text-sky-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{s.title || "Sem titulo"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {s.category}{s.destination && ` - ${s.destination}`} - {[s.city, s.state].filter(Boolean).join("/")} - {s.visibility_status}
                    {s.is_featured && " - destaque"}
                  </p>
                </div>
                <span className="text-sm font-black text-sky-600 shrink-0">
                  {s.entry_price?.trim() || (s.price_per_person ? `R$ ${Number(s.price_per_person).toLocaleString("pt-BR")}/p.` : "Consulte")}
                </span>
                <button
                  onClick={() => navigate(`/anunciante/viagens/anuncios/editar/viagem/${s.id}`)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-sky-600 hover:bg-sky-50 shrink-0"
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
