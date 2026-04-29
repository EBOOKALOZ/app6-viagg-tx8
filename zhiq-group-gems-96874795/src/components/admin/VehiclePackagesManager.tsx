/**
 * VehiclePackagesManager — Gestão de pacotes de créditos para veículos.
 * Componente reutilizável, extraído de AdminVehicleOverview.
 */

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, Trash2, CarFront, CheckCircle2 } from "lucide-react";
import { PackageFormDialog } from "@/components/admin/credits/PackageFormDialog";
import { toast } from "sonner";
import { cn, formatCurrencyBRL } from "@/lib/utils";

export function VehiclePackagesManager() {
  const [editingPkg, setEditingPkg] = useState<any>(null);
  const [showCreatePkg, setShowCreatePkg] = useState<boolean>(false);

  const { data: vehiclePackages = [], isLoading: loadingPkgs } = useQuery({
    queryKey: ["admin-vehicle-packages"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("real_estate_credit_packages") as any)
        .select("*")
        .eq("category", "vehicles")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name || p.slug || "Plano sem nome",
        slug: p.slug || "",
        credits_amount: p.credits_amount || 0,
        price_brl: p.price_brl || 0,
        description: p.description || "",
        badge_text: p.badge_text || null,
        package_type: p.package_type || "standard",
        bonus_credits: p.credits_bonus || 0,
        is_featured: !!p.is_featured,
        is_recommended: !!p.is_recommended,
        sort_order: p.sort_order || 0,
        features_json: (() => {
          if (Array.isArray(p.features_json)) return p.features_json;
          if (typeof p.features_json === 'string') {
            try { return JSON.parse(p.features_json); } catch (e) { return []; }
          }
          return [];
        })(),
        is_active: p.is_active !== false,
      }));
    },
  });

  const qc = useQueryClient();

  const createVehiclePkg = useMutation({
    mutationFn: async (input: any) => {
      const payload: any = {
        name: input.name,
        slug: input.slug || input.name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now(),
        category: 'vehicles',
        credits_amount: Number(input.credits_amount) || 1,
        price_brl: Number(input.price_brl) || 1,
        description: input.description || null,
        badge_text: input.badge_text || null,
        package_type: input.package_type || 'avulso',
        credits_bonus: Number(input.bonus_credits) || 0,
        features_json: Array.isArray(input.features_json) ? input.features_json : [],
        is_featured: !!input.is_featured,
        is_recommended: !!input.is_recommended,
        is_active: input.is_active !== false,
        sort_order: Number(input.sort_order) || 0,
      };
      const { data, error } = await supabase
        .from("real_estate_credit_packages")
        .upsert(payload, { onConflict: "slug" })
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vehicle-packages"] });
      toast.success("Pacote de veículo criado!");
    },
    onError: (err: any) => toast.error(`Falha: ${err.message}`),
  });

  const updateVehiclePkg = useMutation({
    mutationFn: async (input: any & { id: string }) => {
      const { id } = input;
      const payload: any = {
        name: input.name,
        credits_amount: Number(input.credits_amount) || 0,
        price_brl: Number(input.price_brl) || 0,
        description: input.description || "",
        package_type: input.package_type || "avulso",
        credits_bonus: Number(input.bonus_credits) || 0,
        category: 'vehicles',
        is_featured: !!input.is_featured,
        is_recommended: !!input.is_recommended,
        sort_order: Number(input.sort_order) || 0,
        badge_text: input.badge_text || null,
        button_label: input.button_label || "Selecionar",
        features_json: Array.isArray(input.features_json) ? input.features_json : [],
        is_active: input.is_active !== false,
      };
      const { data, error } = await supabase
        .from("real_estate_credit_packages")
        .update(payload)
        .eq("id", id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vehicle-packages"] });
      toast.success("Pacote atualizado!");
    },
    onError: (err: any) => toast.error(`Falha: ${err.message}`),
  });

  const deleteVehiclePkg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("real_estate_credit_packages")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vehicle-packages"] });
      toast.success("Pacote excluído!");
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const toggleVehiclePkg = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("real_estate_credit_packages")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-vehicle-packages"] });
    },
  });

  const handleSavePackage = (data: any) => {
    const packageData = {
      name: data.name,
      slug: data.slug || data.name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now(),
      category: 'vehicles',
      credits_amount: Number(data.credits_amount) || Number(data.credits_base || 1),
      price_brl: Number(data.price_brl) || 0,
      description: data.description || null,
      badge_text: data.badge_text || null,
      package_type: data.package_type || 'avulso',
      credits_bonus: Number(data.credits_bonus) || Number(data.bonus_credits) || 0,
      features_json: Array.isArray(data.features_json) ? data.features_json : [],
      is_featured: !!data.is_featured,
      is_recommended: !!data.is_recommended,
      is_active: data.is_active !== false,
      sort_order: Number(data.sort_order) || 0,
    };

    if (editingPkg) {
      updateVehiclePkg.mutate({ ...packageData, id: editingPkg.id }, {
        onSuccess: () => { setEditingPkg(null); setShowCreatePkg(false); },
      });
    } else {
      createVehiclePkg.mutate(packageData, {
        onSuccess: () => { setShowCreatePkg(false); setEditingPkg(null); },
      });
    }
  };

  const handleCloseForm = () => {
    setShowCreatePkg(false);
    setEditingPkg(null);
  };

  const isSubmitting = editingPkg ? updateVehiclePkg.isPending : createVehiclePkg.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <CarFront className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Pacotes de Veículos</h2>
            <p className="text-xs text-muted-foreground">Gestão de pacotes de créditos</p>
          </div>
        </div>
        <Button onClick={() => { setEditingPkg(null); setShowCreatePkg(true); }} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-xs h-8 px-3">
          <Plus className="h-3.5 w-3.5" /> Novo Pacote
        </Button>
      </div>

      {loadingPkgs ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {vehiclePackages.length === 0 ? (
            <Card className="col-span-full border-dashed bg-zinc-50/50">
              <CardContent className="py-8 text-center space-y-2">
                <CarFront className="h-5 w-5 text-zinc-300 mx-auto" />
                <CardTitle className="text-zinc-400 font-black uppercase text-[9px]">Nenhum pacote de veículos cadastrado</CardTitle>
              </CardContent>
            </Card>
          ) : (
            vehiclePackages.map((pkg: any) => (
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
                      <p className="text-sm font-mono font-black text-blue-600">
                        {formatCurrencyBRL(pkg.price_brl)}
                        <span className="text-[10px] text-muted-foreground ml-1">/ {pkg.credits_amount} créd.</span>
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:bg-blue-50" onClick={() => setEditingPkg(pkg)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => {
                        if (confirm("Excluir este pacote?")) deleteVehiclePkg.mutate(pkg.id);
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
                        onCheckedChange={(val) => toggleVehiclePkg.mutate({ id: pkg.id, is_active: val })}
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
          pkg={editingPkg || undefined}
          initialCategory="vehicles"
          onClose={handleCloseForm}
          onSave={handleSavePackage}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
