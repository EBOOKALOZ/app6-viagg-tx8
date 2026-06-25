import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketServiceCard } from "@/components/services/MarketServiceCard";
import { SellServiceCTA } from "@/components/services/SellServiceCTA";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { ChevronsUpDown, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_CATEGORY_GROUPS, SERVICE_ITEM_ICONS, resolveServiceTypeIcon } from "@/lib/services/serviceCategories";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export default function PublicServicesHome() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const SelectedCategoryIcon = useMemo(
    () => (categoryFilter === "all" ? LayoutGrid : resolveServiceTypeIcon(categoryFilter)),
    [categoryFilter]
  );

  const { data: rawServiceListings = [], isLoading } = useQuery<any[]>({
    queryKey: ["public-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_service_listings" as any)
        .select("*")
        .order("published_at", { ascending: false });
      if (error) {
        console.error("[PublicServicesHome] public_service_listings query error:", error);
        return [];
      }
      const rows = (data as any[]) || [];
      if (rows.length === 0) return [];

      const ids = rows.map((s) => s.id);
      const { data: mediaRows } = await supabase
        .from("service_media" as any)
        .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
        .in("listing_id", ids)
        .order("sort_order", { ascending: true });

      const mediaMap = new Map<string, string>();
      for (const row of (mediaRows as any[]) || []) {
        if (!mediaMap.has(row.listing_id)) {
          const p = row.public_masked_storage_path || row.original_storage_path;
          if (p) {
            mediaMap.set(
              row.listing_id,
              p.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl
            );
          }
        }
      }
      return rows.map((s) => ({ ...s, thumbnail_url: mediaMap.get(s.id) || null }));
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    rawServiceListings.forEach((s) => {
      const raw = String(s.city || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawServiceListings]);

  const filteredServices = useMemo(() => {
    return rawServiceListings.filter((s) => {
      if (categoryFilter !== "all" && s.service_type !== categoryFilter) return false;
      if (cityFilter !== "all" && s.city?.trim().toLowerCase() !== cityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !s.title?.toLowerCase().includes(q) &&
          !s.city?.toLowerCase().includes(q) &&
          !s.neighborhood?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rawServiceListings, categoryFilter, cityFilter, search]);

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch={true}
      hideCart={true}
      headerRight={null}
      headerChildren={<MarketNavButtons />}
      blueFooter
      myAccountPath="/minha-conta"
    >
      <InstitutionalSafetyBanner />

      <section className="px-4 pt-6 space-y-3">
        <h1 className="text-2xl font-black text-white tracking-tight">Serviços</h1>
        <p className="text-white/70 text-sm">
          Divulgue sua empresa e receba contatos de clientes interessados.
        </p>
        <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full sm:w-[360px] h-12 justify-between rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <span className="flex items-center gap-2.5 truncate">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30 shrink-0">
                  <SelectedCategoryIcon className="h-[18px] w-[18px]" />
                </span>
                {categoryFilter === "all" ? "Todas as categorias" : categoryFilter}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-lg shadow-xl bg-white" align="start">
            <Command className="bg-white">
              <CommandInput placeholder="Pesquisar categoria..." className="h-11 text-zinc-900 placeholder:text-zinc-400" />
              <CommandList className="max-h-[400px] bg-white">
                <CommandEmpty className="text-zinc-500">Nenhuma categoria encontrada.</CommandEmpty>
                <CommandGroup heading="Geral">
                  <CommandItem
                    value="Todos"
                    className="text-zinc-900 data-[selected=true]:text-zinc-900"
                    onSelect={() => { setCategoryFilter("all"); setCategoryPickerOpen(false); }}
                  >
                    Todas as categorias
                  </CommandItem>
                </CommandGroup>
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
                          onSelect={() => { setCategoryFilter(item); setCategoryPickerOpen(false); }}
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
      </section>

      <section className="p-4">
        {isLoading && <p className="text-center text-white/70">Carregando serviços...</p>}
        {!isLoading && filteredServices.length === 0 && (
          <p className="text-center text-white/70">Nenhum serviço encontrado.</p>
        )}
        <HorizontalCarousel gap="gap-4">
          {filteredServices.map((s) => (
            <MarketServiceCard key={s.id} service={s} />
          ))}
        </HorizontalCarousel>
      </section>

      <section className="p-4">
        <SellServiceCTA variant="banner" />
      </section>
    </MarketLayout>
  );
}
