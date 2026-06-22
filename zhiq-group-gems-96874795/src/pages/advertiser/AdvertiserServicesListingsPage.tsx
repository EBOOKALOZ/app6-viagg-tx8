/**
 * AdvertiserServicesListingsPage — /anunciante/servicos/meus-anuncios
 *
 * Lista APENAS serviços (service_listings) do anunciante. Cadastro novo é
 * feito pelas categorias, levando ao ServiceForm com o tipo pré-selecionado
 * (?tipo=). Espelha AdvertiserVeiculosListingsPage.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Briefcase, ChevronsUpDown, Dumbbell, Loader2, Pencil, Pill, Scale, Scissors, Stethoscope, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { getListingImageUrl } from "@/lib/real-estate/mediaUtils";
import { SERVICE_CATEGORY_GROUPS, SERVICE_ITEM_ICONS, resolveServiceTypeLabel, resolveServiceTypeIcon } from "@/lib/services/serviceCategories";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

// Atalhos das categorias mais usadas — os valores já são os nomes completos
// da lista mestre (LEGACY_SERVICE_TYPE_MAP em serviceCategories.ts).
const QUICK_CATEGORIES = [
  { label: "Academia", value: "Academias", icon: Dumbbell, color: "bg-orange-600" },
  { label: "Dentista", value: "Dentistas", icon: Stethoscope, color: "bg-sky-600" },
  { label: "Farmácia", value: "Farmácias", icon: Pill, color: "bg-emerald-600" },
  { label: "Advogado", value: "Advogados", icon: Scale, color: "bg-amber-600" },
  { label: "Mecânico", value: "Oficinas Mecânicas", icon: Wrench, color: "bg-zinc-600" },
  { label: "Salão", value: "Salões de Beleza", icon: Scissors, color: "bg-pink-600" },
  { label: "Clínica", value: "Clínicas Médicas", icon: Stethoscope, color: "bg-teal-600" },
];

export default function AdvertiserServicesListingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos-meus-anuncios", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase.from("service_listings") as any)
        .select("id, title, service_type, visibility_status, price_label, city, state, created_at")
        .eq("owner_user_id", user!.id)
        .order("created_at", { ascending: false });
      const list = data || [];
      return Promise.all(list.map(async (s: any) => {
        const { data: media } = await (supabase.from("service_media") as any)
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
          <Briefcase className="w-5 h-5 text-violet-600" /> Anunciar serviço
        </h1>
        <p className="text-sm text-zinc-500">Escolha a categoria para cadastrar:</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK_CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.value}
                onClick={() => navigate(`/anunciante/servicos/anuncios/novo/servico?tipo=${encodeURIComponent(c.value)}`)}
                className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-violet-300 hover:shadow-sm transition-all"
              >
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110", c.color)}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <span className="font-bold text-zinc-800 text-sm">{c.label}</span>
                <span className="text-[11px] font-black text-violet-600">Anunciar grátis</span>
              </button>
            );
          })}

          <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
            <PopoverTrigger asChild>
              <button className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-zinc-200 bg-white hover:border-violet-300 hover:shadow-sm transition-all">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 bg-violet-600">
                  <ChevronsUpDown className="w-7 h-7 text-white" />
                </div>
                <span className="font-bold text-zinc-800 text-sm">Outros</span>
                <span className="text-[11px] font-black text-violet-600">Ver todas</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] sm:w-[380px] p-0 rounded-lg shadow-xl bg-white sm:mt-3" align="start" sideOffset={12}>
              <Command className="bg-white">
                <CommandInput placeholder="Pesquisar categoria..." className="h-11 text-zinc-900 placeholder:text-zinc-400" />
                <CommandList className="max-h-[400px] bg-white">
                  <CommandEmpty className="text-zinc-500">Nenhuma categoria encontrada.</CommandEmpty>
                  {SERVICE_CATEGORY_GROUPS.map((g) => (
                    <CommandGroup
                      key={g.group}
                      heading={
                        <span className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 shrink-0">
                            <g.icon className="h-[15px] w-[15px]" />
                          </span>
                          {g.group}
                        </span>
                      }
                    >
                      {g.items.map((item) => {
                        const ItemIcon = SERVICE_ITEM_ICONS[item] || g.icon;
                        return (
                          <CommandItem
                            key={item}
                            value={item}
                            className="text-zinc-900 data-[selected=true]:text-zinc-900 gap-3"
                            onSelect={() => {
                              setCategoryPickerOpen(false);
                              navigate(`/anunciante/servicos/anuncios/novo/servico?tipo=${encodeURIComponent(item)}`);
                            }}
                          >
                            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 text-violet-700 shrink-0 ring-1 ring-violet-200/60 shadow-sm">
                              <ItemIcon className="h-[19px] w-[19px]" />
                            </span>
                            {item}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
          🔓 O anúncio é publicado <strong>gratuitamente</strong>. Você usa créditos apenas para desbloquear o contato do interessado.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-black text-zinc-900">Meus serviços ({servicos.length})</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 py-10 text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : servicos.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-10 text-center text-zinc-400 text-sm">
            Você ainda não tem serviços cadastrados. Escolha uma categoria acima para começar.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
            {servicos.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-violet-50 to-violet-100 ring-1 ring-violet-200/60 shrink-0 flex items-center justify-center">
                  {s.thumb ? (
                    <img src={s.thumb} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ) : (
                    (() => { const RowIcon = resolveServiceTypeIcon(s.service_type); return <RowIcon className="w-[26px] h-[26px] text-violet-600" />; })()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-sm truncate">{s.title || "Sem título"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {resolveServiceTypeLabel(s.service_type)}
                    {" · "}{[s.city, s.state].filter(Boolean).join("/")}
                    {" · "}{s.visibility_status}
                  </p>
                </div>
                <span className="text-sm font-black text-violet-600 shrink-0">
                  {s.price_label?.trim() || "—"}
                </span>
                <button
                  onClick={() => navigate(`/anunciante/servicos/anuncios/editar/servico/${s.id}`)}
                  title="Editar"
                  className="p-2 rounded-lg text-zinc-400 hover:text-violet-600 hover:bg-violet-50 shrink-0"
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
