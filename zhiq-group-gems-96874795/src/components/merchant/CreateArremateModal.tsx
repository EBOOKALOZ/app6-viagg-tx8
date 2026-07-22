/**
 * CreateArremateModal — "Colocar produto em arremate" 🏆
 *
 * Mesmo formato do seletor da Divulgação: lista tudo que o lojista já tem
 * cadastrado (produtos da loja, anúncios do marketplace, imóveis e veículos),
 * ele escolhe um item e configura o arremate (preço de oportunidade, duração
 * e entrega). Criação 100% via useAdvertiserAuctions.createListing →
 * RPC create_auction_listing com listing_type='arremate'.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdvertiserAuctions } from "@/hooks/useAdvertiserAuctions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Trophy, Search, Package, Plus, Loader2, CheckCircle2, Timer, Zap, X,
} from "lucide-react";

interface CatalogItem {
  id: string;
  kind: "Produto" | "Anúncio" | "Imóvel" | "Veículo";
  title: string;
  description: string | null;
  image: string | null;
  price: number | null;
}

function brl(v: number | null | undefined) {
  return `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
}

export function CreateArremateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const { arremateListings, createListing } = useAdvertiserAuctions();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("24");
  const [fulfillment, setFulfillment] = useState("pickup");

  // Catálogo completo do lojista — mesmas 4 fontes do módulo de Leilões
  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ["arremate-catalog-all", user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: advertiserData } = await supabase
        .from("advertiser_accounts" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const [pRes, aRes, rRes, vRes] = await Promise.all([
        supabase.from("product_listings" as any)
          .select("id, title, price, cover_image_url, description")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false }),
        (advertiserData as any)?.id
          ? supabase.from("advertiser_listings" as any)
              .select("id, title, description, cover_image_url, price, advertiser_listing_media(media_url)")
              .eq("advertiser_account_id", (advertiserData as any).id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("real_estate_listings" as any)
          .select("id, title, price_brl, description, real_estate_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("vehicle_listings" as any)
          .select("id, title, price_brl, description, cover_image_url, vehicle_media(original_storage_path, public_masked_storage_path)")
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const items: CatalogItem[] = [];
      const seen = new Set<string>();

      for (const p of ((pRes as any).data || []) as any[]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        let img = p.cover_image_url || null;
        if (img && !img.startsWith("http")) {
          img = supabase.storage.from("marketing-materials").getPublicUrl(img).data.publicUrl;
        }
        items.push({ id: p.id, kind: "Produto", title: p.title || "Sem título", description: p.description ?? null, image: img, price: p.price ?? null });
      }

      for (const a of ((aRes as any).data || []) as any[]) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        let img = a.cover_image_url || a.advertiser_listing_media?.[0]?.media_url || null;
        if (img && !img.startsWith("http")) {
          img = supabase.storage.from("marketing-materials").getPublicUrl(img).data.publicUrl;
        }
        items.push({ id: a.id, kind: "Anúncio", title: a.title || "Sem título", description: a.description ?? null, image: img, price: a.price ?? null });
      }

      for (const r of ((rRes as any).data || []) as any[]) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        let img: string | null = null;
        const m = r.real_estate_media?.[0];
        const path = m?.public_masked_storage_path || m?.original_storage_path;
        if (path) img = supabase.storage.from("real-estate-public").getPublicUrl(path).data.publicUrl;
        items.push({ id: r.id, kind: "Imóvel", title: r.title || "Sem título", description: r.description ?? null, image: img, price: r.price_brl ?? null });
      }

      for (const v of ((vRes as any).data || []) as any[]) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        let img: string | null = v.cover_image_url || null;
        if (!img) {
          const m = v.vehicle_media?.[0];
          const path = m?.public_masked_storage_path || m?.original_storage_path;
          if (path) img = path.startsWith("http") ? path : supabase.storage.from("real-estate-original").getPublicUrl(path).data.publicUrl;
        }
        items.push({ id: v.id, kind: "Veículo", title: v.title || "Sem título", description: v.description ?? null, image: img, price: v.price_brl ?? null });
      }

      return items;
    },
  });

  // Itens que já estão em arremate ativo ficam bloqueados no seletor
  const activeArremateIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of arremateListings as any[]) {
      if (l.status === "active" && l.product_id) s.add(l.product_id);
    }
    return s;
  }, [arremateListings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((i) =>
      i.title.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const pick = (item: CatalogItem) => {
    setSelected(item);
    setPrice(item.price != null ? String(item.price) : "");
    setSearch("");
  };

  const reset = () => {
    setSelected(null);
    setPrice("");
    setDuration("24");
    setFulfillment("pickup");
    setSearch("");
  };

  const priceNum = parseFloat(price.replace(",", ".")) || 0;
  const canSubmit = !!selected && priceNum > 0 && !createListing.isPending;

  const submit = async () => {
    if (!selected || priceNum <= 0) return;
    try {
      await createListing.mutateAsync({
        title: selected.title,
        description: selected.description || undefined,
        product_image_url: selected.image || undefined,
        starting_bid: priceNum,
        duration_hours: parseInt(duration) || 24,
        listing_type: "arremate",
        fulfillment_type: fulfillment,
        product_id: selected.id,
      });
      reset();
      onOpenChange(false);
    } catch {
      // erro já vira toast no hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#1A1F24] border-[#323A45] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-tight text-white">
            <div className="p-2 rounded-xl bg-[#FF7A00]/15">
              <Trophy className="h-5 w-5 text-[#FF7A00]" />
            </div>
            Colocar em Arremate
          </DialogTitle>
          <DialogDescription className="text-[#8E98A3] font-bold">
            Escolha um anúncio já cadastrado e defina as condições do arremate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!selected ? (
            <>
              {/* Busca — mesmo formato do seletor da Divulgação */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8E98A3]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nos seus anúncios cadastrados…"
                  autoFocus
                  className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#252B33] border border-[#323A45] text-white text-sm placeholder:text-[#8E98A3] outline-none focus:border-[#FF7A00]/50"
                />
              </div>

              {/* Lista de itens cadastrados */}
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-[#323A45] bg-[#252B33]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-[#FF7A00]" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Package className="h-6 w-6 text-[#8E98A3]/40" />
                    <p className="text-xs text-[#8E98A3]">
                      {catalog.length === 0 ? "Você ainda não tem anúncios cadastrados." : "Nenhum item encontrado."}
                    </p>
                  </div>
                ) : (
                  filtered.map((item) => {
                    const blocked = activeArremateIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (blocked) return;
                          pick(item);
                        }}
                        disabled={blocked}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 text-left border-b border-[#323A45]/50 last:border-b-0 transition-colors group",
                          blocked ? "opacity-60 cursor-not-allowed" : "hover:bg-[#FF7A00]/10"
                        )}
                      >
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#1A1F24] border border-[#323A45]/60 shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-4 w-4 text-[#323A45]" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-black text-[#FF7A00] uppercase tracking-widest">{item.kind}</p>
                          <p className="text-xs font-bold text-white truncate group-hover:text-[#FF7A00] transition-colors">
                            {item.title}
                          </p>
                          {item.price != null && (
                            <p className="text-xs font-black text-[#00C58E]">{brl(item.price)}</p>
                          )}
                        </div>
                        {blocked ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Já em arremate
                          </span>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-[#FF7A00]/10 flex items-center justify-center shrink-0 group-hover:bg-[#FF7A00] transition-colors">
                            <Plus className="h-3.5 w-3.5 text-[#FF7A00] group-hover:text-white transition-colors" />
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              {/* Preview do item escolhido */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#252B33] border border-[#FF7A00]/30">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#1A1F24] border border-[#323A45]/60 shrink-0">
                  {selected.image ? (
                    <img src={selected.image} alt={selected.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="h-5 w-5 text-[#323A45]" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-[#FF7A00] uppercase tracking-widest">{selected.kind}</p>
                  <p className="text-sm font-black text-white truncate">{selected.title}</p>
                  {selected.price != null && (
                    <p className="text-xs font-bold text-[#8E98A3]">Preço normal: {brl(selected.price)}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center gap-1 text-[9px] font-black text-[#8E98A3] uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-[#323A45] hover:border-[#FF7A00]/40 hover:text-[#FF7A00] transition-all shrink-0"
                >
                  <X className="h-3 w-3" /> Trocar
                </button>
              </div>

              {/* Preço de oportunidade */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">
                  Preço de Oportunidade (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-[#FF7A00] text-sm">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 rounded-2xl bg-[#252B33] border border-[#323A45] font-black text-white text-lg outline-none focus:border-[#FF7A00]/50"
                  />
                </div>
              </div>

              {/* Duração */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">
                  <Timer className="inline h-3 w-3 mr-1 mb-0.5" /> Duração
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {["6", "12", "24", "48"].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDuration(h)}
                      className={cn(
                        "py-2.5 rounded-xl border text-xs font-black transition-all",
                        duration === h
                          ? "border-[#FF7A00] bg-[#FF7A00]/15 text-[#FF7A00]"
                          : "border-[#323A45] text-[#8E98A3] hover:border-[#FF7A00]/40"
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Entrega */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-[#8E98A3] uppercase tracking-[0.2em] ml-1">
                  Entrega / Retirada
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "pickup", l: "🏪 Retirada" },
                    { v: "delivery", l: "🚚 Entrega" },
                    { v: "both", l: "↔️ Ambos" },
                  ].map(({ v, l }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFulfillment(v)}
                      className={cn(
                        "py-2.5 rounded-xl border text-xs font-bold transition-all",
                        fulfillment === v
                          ? "border-[#00C58E] bg-[#00C58E]/10 text-[#00C58E]"
                          : "border-[#323A45] text-[#8E98A3] hover:border-[#00C58E]/40"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF7A00] to-[#FF8E1F] hover:from-[#FF8E1F] hover:to-[#FFA357] text-white font-black uppercase tracking-[0.15em] text-sm shadow-lg shadow-[#FF7A00]/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
              >
                {createListing.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <><Zap className="h-5 w-5 stroke-[3px]" /> Colocar em Arremate</>
                )}
              </button>

              <p className="text-[10px] text-[#8E98A3] text-center">
                O arremate ativo aparece em <span className="font-bold text-[#B8C2CC]">Leilões</span>.
                Quando encerrar com vencedor, o pós-arremate aparece aqui neste painel.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
