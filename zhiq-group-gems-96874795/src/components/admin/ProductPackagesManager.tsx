/**
 * ProductPackagesManager — Gestão de pacotes de produtos (marketplace/merchant).
 * Reutiliza a mesma estrutura do VehiclePackagesManager, mas para a tabela merchant_credit_products.
 */

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabaseAdmin } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, Trash2, ShoppingBag, CheckCircle2 } from "lucide-react";
import { PackageFormDialog } from "@/components/admin/credits/PackageFormDialog";
import { toast } from "sonner";
import { cn, formatCurrencyBRL } from "@/lib/utils";

export interface ProductPackage {
  id: string;
  name: string;
  slug?: string;
  credits_amount: number;
  credits_base: number;
  credits_bonus: number;
  price_brl: number;
  price_cents: number;
  description: string;
  badge_text: string | null;
  product_type: string;
  action_label: string;
  features_json: string[];
  is_featured: boolean;
  is_recommended: boolean;
  is_active: boolean;
  sort_order: number;
}

export function ProductPackagesManager() {
  const [editingPkg, setEditingPkg] = useState<ProductPackage | null>(null);
  const [showCreatePkg, setShowCreatePkg] = useState<boolean>(false);

  const { data: productPackages = [], isLoading: loadingPkgs, error: pkgsError } = useQuery({
    queryKey: ["admin-product-packages"],
    queryFn: async () => {
      console.log("🔍 ProductPackagesManager: buscando pacotes de produtos (admin)...");
      // Tenta buscar apenas colunas básicas que provavelmente existem
      const { data, error } = await supabaseAdmin
        .from("merchant_credit_products")
        .select("id, name, credits_base, credits_bonus, price_cents, description, is_active")
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("❌ Erro ao buscar pacotes de produtos:", error);
        throw error;
      }
      console.log("✅ Pacotes de produtos carregados:", data?.length || 0, data);
      return (data || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name || "Pacote sem nome",
        slug: "",
        credits_amount: (p.credits_base || 0) + (p.credits_bonus || 0),
        credits_base: p.credits_base || 0,
        credits_bonus: p.credits_bonus || 0,
        price_brl: (p.price_cents || 0) / 100,
        price_cents: p.price_cents || 0,
        description: p.description || "",
        badge_text: null,
        product_type: "product",
        action_label: "ADQUIRIR AGORA",
        features_json: [],
        is_featured: false,
        is_recommended: false,
        is_active: p.is_active !== false,
        sort_order: 0,
      }));
    },
  });

  const qc = useQueryClient();

  const createProductPkg = useMutation({
    mutationFn: async (input: Partial<ProductPackage>) => {
      const base = Number(input.credits_base) || 0;
      const bonus = Number(input.credits_bonus) || 0;
      const credits_amount_val = base + bonus;
      const price_cents_val = Math.round(Number(input.price_brl || 0) * 100);

      // Ensure positive total credits to satisfy CHECK constraint
      if (credits_amount_val <= 0) {
        throw new Error('O total de créditos deve ser maior que zero');
      }

      const payload: Record<string, unknown> = {
        name: input.name,
        slug: input.slug || input.name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now(),
        product_type: input.product_type || 'pacote',
        credits_base: base,
        credits_bonus: bonus,
        credits_amount: credits_amount_val,
        price_cents: price_cents_val,
        price_brl: Number(input.price_brl) || 0,
        description: input.description || null,
        badge_text: input.badge_text || null,
        action_label: input.action_label || "ADQUIRIR AGORA",
        features_json: Array.isArray(input.features_json) ? input.features_json : [],
        is_featured: !!input.is_featured,
        is_recommended: !!input.is_recommended,
        is_active: input.is_active !== false,
        sort_order: Number(input.sort_order) || 0,
      };
      const { data, error } = await supabaseAdmin
        .from("merchant_credit_products")
        .insert(payload)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-product-packages"] });
      toast.success("Pacote de produto criado!");
    },
    onError: (err: Error) => toast.error(`Falha: ${err.message}`),
  });

  const updateProductPkg = useMutation({
    mutationFn: async (input: Partial<ProductPackage> & { id: string }) => {
      const { id } = input;
      const base = Number(input.credits_base) || 0;
      const bonus = Number(input.credits_bonus) || 0;
      const credits_amount_val = base + bonus;
      const price_cents_val = Math.round(Number(input.price_brl || 0) * 100);

      if (credits_amount_val <= 0) {
        throw new Error('O total de créditos deve ser maior que zero');
      }

      const payload: Record<string, unknown> = {
        name: input.name,
        slug: input.slug || undefined,
        credits_base: base,
        credits_bonus: bonus,
        credits_amount: credits_amount_val,
        price_cents: price_cents_val,
        price_brl: Number(input.price_brl) || 0,
        description: input.description || "",
        product_type: input.product_type || "pacote",
        badge_text: input.badge_text || null,
        action_label: input.action_label || "ADQUIRIR AGORA",
        features_json: Array.isArray(input.features_json) ? input.features_json : [],
        is_featured: !!input.is_featured,
        is_recommended: !!input.is_recommended,
        is_active: input.is_active !== false,
        sort_order: Number(input.sort_order) || 0,
      };
      const { data, error } = await supabaseAdmin
        .from("merchant_credit_products")
        .update(payload)
        .eq("id", id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-product-packages"] });
      toast.success("Pacote atualizado!");
    },
    onError: (err: Error) => toast.error(`Falha: ${err.message}`),
  });

  const deleteProductPkg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseAdmin
        .from("merchant_credit_products")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-product-packages"] });
      toast.success("Pacote excluído!");
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const toggleProductPkg = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabaseAdmin
        .from("merchant_credit_products")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-product-packages"] });
    },
  });

   const handleSavePackage = (data: Partial<ProductPackage>) => {
     const packageData = {
       name: data.name,
       slug: data.slug || data.name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now(),
       product_type: data.product_type || 'product',
       credits_base: Number(data.credits_base) || 0,
       credits_bonus: Number(data.credits_bonus) || 0,
       price_brl: Number(data.price_brl) || 0,
       description: data.description || null,
       badge_text: data.badge_text || null,
       action_label: data.action_label || "ADQUIRIR AGORA",
       features_json: Array.isArray(data.features_json) ? data.features_json : [],
       is_featured: !!data.is_featured,
       is_recommended: !!data.is_recommended,
       is_active: data.is_active !== false,
       sort_order: Number(data.sort_order) || 0,
     };

    if (editingPkg) {
      updateProductPkg.mutate({ ...packageData, id: editingPkg.id }, {
        onSuccess: () => { setEditingPkg(null); setShowCreatePkg(false); },
      });
    } else {
      createProductPkg.mutate(packageData, {
        onSuccess: () => { setShowCreatePkg(false); setEditingPkg(null); },
      });
    }
  };

  const handleCloseForm = () => {
    setShowCreatePkg(false);
    setEditingPkg(null);
  };

  const isSubmitting = editingPkg ? updateProductPkg.isPending : createProductPkg.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <ShoppingBag className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Pacotes de Produtos</h2>
            <p className="text-xs text-muted-foreground">Gestão de pacotes de créditos para marketplace</p>
          </div>
        </div>
        <Button onClick={() => { setEditingPkg(null); setShowCreatePkg(true); }} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-xs h-8 px-3">
          <Plus className="h-3.5 w-3.5" /> Novo Pacote
        </Button>
      </div>

      {loadingPkgs ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pkgsError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8 text-center">
            <p className="text-red-600 font-bold text-sm">Erro ao carregar pacotes</p>
            <p className="text-red-500 text-xs mt-1">{pkgsError instanceof Error ? pkgsError.message : String(pkgsError)}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {productPackages.length === 0 ? (
            <Card className="col-span-full border-dashed bg-zinc-50/50">
              <CardContent className="py-8 text-center space-y-2">
                <ShoppingBag className="h-5 w-5 text-zinc-300 mx-auto" />
                <CardTitle className="text-zinc-400 font-black uppercase text-[9px]">Nenhum pacote de produtos cadastrado</CardTitle>
              </CardContent>
            </Card>
          ) : (
            productPackages.map((pkg: ProductPackage) => (
              <Card key={pkg.id} className={cn(
                "relative overflow-hidden border-2 transition-all hover:shadow-md",
                pkg.is_featured ? "border-amber-400/50 shadow-amber-100" : "border-zinc-100"
              )}>
                {pkg.badge_text && (
                  <div className="absolute top-0 right-0 z-20">
                    <div className="bg-[#FF6A00] text-white text-[8px] font-black px-2 py-0.5 rounded-bl-xl uppercase shadow-sm tracking-wider">
                      {pkg.badge_text}
                    </div>
                  </div>
                )}
                <CardHeader className="pb-3.5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-black tracking-tight uppercase">{pkg.name}</CardTitle>
                      <p className="text-sm font-mono font-black text-emerald-600">
                        {formatCurrencyBRL(pkg.price_brl)}
                        <span className="text-[10px] text-muted-foreground ml-1">/ {pkg.credits_amount} créd.</span>
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:bg-blue-50" onClick={() => setEditingPkg(pkg)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => {
                        if (confirm("Excluir este pacote?")) deleteProductPkg.mutate(pkg.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed min-h-[32px]">
                    {pkg.description || "Sem descrição."}
                  </p>
                  <div className="space-y-2 py-2 border-y border-zinc-50">
                    <div className="text-[10px] font-black uppercase text-zinc-400 tracking-tighter">Benefícios</div>
                    <div className="space-y-1">
                      {(!pkg.features_json || pkg.features_json.length === 0) ? (
                        <p className="text-[10px] text-zinc-400 italic">Nenhum benefício listado</p>
                      ) : (
                        pkg.features_json.map((f: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] font-medium text-zinc-700 leading-relaxed">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="leading-tight">{f}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={pkg.is_active}
                        onCheckedChange={(val) => toggleProductPkg.mutate({ id: pkg.id, is_active: val })}
                        className="scale-75 origin-left"
                      />
                      <span className={cn("font-black uppercase text-[9px]", pkg.is_active ? "text-emerald-600" : "text-zinc-400")}>
                        {pkg.is_active ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    {pkg.is_featured && (
                      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-600 border-amber-100 uppercase text-[8px] font-black py-0.5 h-5">
                        Destaque
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {(showCreatePkg || editingPkg) && (
        <PackageFormDialog
          key={editingPkg?.id || 'new'}
          pkg={editingPkg || undefined}
          initialCategory="products"
          onClose={handleCloseForm}
          onSave={handleSavePackage}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
