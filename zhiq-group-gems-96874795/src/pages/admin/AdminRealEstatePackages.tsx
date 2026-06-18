import { useState } from "react";
import { useAdminRealEstatePackages } from "@/hooks/useAdminRealEstatePackages";
import { useAdminCredits } from "@/hooks/useAdminCredits";
import { Loader2, Plus, Edit, Trash2, Building2, Star, CheckCircle2, Save, Car, CarFront, Globe, ShoppingBag, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import AdminRealEstateCharges from "./AdminRealEstateCharges";

export default function AdminRealEstatePackages() {
  const query = useAdminRealEstatePackages();
  const adminCredits = useAdminCredits();
  const { data: packages, isLoading, createPackage, updatePackage, deletePackage, togglePackage } = query;
  
  // Merchant products from useAdminCredits
  const merchantProducts = adminCredits.products || [];
  
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [showCreate, setShowCreate] = useState<string | boolean>(false);
  const [activeTab, setActiveTab] = useState("real_estate");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        Carregando pacotes de créditos...
      </div>
    );
  }

   const realEstatePackages = packages?.filter(p => p.category === 'real_estate') || [];
   const vehiclePackages = packages?.filter(p => p.category === 'vehicles') || [];
  
  // Map merchant products to match the expected grid structure for visualization
  const productPackages = merchantProducts.map(p => ({
    ...p,
    price_brl: p.price_brl,
    credits_amount: p.credits_amount,
    category: 'products',
    is_merchant_product: true // flag to distinguish source
  }));
  const renderPackageTable = (pkgs: any[], categoryLabel: string, icon: any) => {
    const Icon = icon;
    
    const translateType = (t: string) => {
      const m: Record<string, string> = { 
        pacote: "Avulso", 
        mensal: "Mensal", 
        semestral: "Semestral", 
        anual: "Anual", 
        one_time: "Avulso", 
        monthly: "Mensal" 
      };
      return m[t] || t;
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 py-4 border-b border-zinc-100">
           <Icon className="w-5 h-5 text-muted-foreground" />
           <h2 className="text-lg font-black uppercase tracking-tight text-zinc-900">{categoryLabel} ({pkgs.length})</h2>
        </div>

        <Card className="shadow-md border-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Ordem</th>
                  <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Nome</th>
                  <th className="text-left p-3 font-semibold text-xs text-muted-foreground">Tipo</th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Créditos</th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Base + Bônus</th>
                  <th className="text-right p-3 font-semibold text-xs text-muted-foreground">Preço</th>
                  <th className="text-center p-3 font-semibold text-xs text-muted-foreground">Badge</th>
                  <th className="text-center p-3 font-semibold text-xs text-muted-foreground">Destaque</th>
                  <th className="text-center p-3 font-semibold text-xs text-muted-foreground">Rollover</th>
                  <th className="text-center p-3 font-semibold text-xs text-muted-foreground">Status</th>
                  <th className="text-center p-3 font-semibold text-xs text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pkgs.map((p, idx) => (
                  <tr key={p.id} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="p-3 text-center">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{p.sort_order || idx + 1}</span>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-zinc-800 uppercase tracking-tight">{p.name || "—"}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[180px] italic">{p.description || ""}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] font-bold bg-zinc-50">{translateType(p.product_type || p.package_type || "")}</Badge>
                    </td>
                    <td className="p-3 text-right font-mono font-black text-zinc-900">{p.credits_amount}</td>
                    <td className="p-3 text-right text-[11px] text-zinc-400 font-medium">
                       {p.credits_base} + {p.credits_bonus}
                    </td>
                    <td className="p-3 text-right font-mono font-black text-emerald-600">
                      {formatCurrencyBRL(p.price_brl)}
                    </td>
                    <td className="p-3 text-center">
                      {p.badge_text ? (
                        <Badge className="text-[9px] font-black bg-amber-100 text-amber-800 border-amber-200 uppercase px-2">
                          {p.badge_text}
                        </Badge>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-center">
                      {p.is_recommended || p.is_featured ? (
                         <span className="text-amber-500">⭐</span>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-center">
                      {p.rollover_enabled ? (
                        <Badge variant="secondary" className="text-[10px] font-black bg-violet-50 text-violet-600 border-violet-100">
                          {p.rollover_percent}%
                        </Badge>
                      ) : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <Switch 
                        checked={p.is_active} 
                        onCheckedChange={(val) => {
                          if (p.is_merchant_product) {
                            adminCredits.updateProduct.mutate({ id: p.id, is_active: val });
                          } else {
                            togglePackage.mutate({ id: p.id, is_active: val });
                          }
                        }} 
                      />
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => setEditingPackage(p)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-red-50" onClick={() => {
                          if (confirm("Deseja realmente excluir este pacote?")) {
                            if (p.is_merchant_product) {
                              adminCredits.deleteProduct.mutate(p.id);
                            } else {
                              deletePackage.mutate(p.id);
                            }
                          }
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pkgs.length === 0 && (
                  <tr><td colSpan={11} className="p-10 text-center text-zinc-400 font-medium italic">Nenhum pacote cadastrado nesta categoria.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  const renderPackageGrid = (pkgs: any[], categoryLabel: string, icon: any) => {
    const Icon = icon;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 py-4 border-b border-zinc-100">
           <Icon className="w-5 h-5 text-muted-foreground" />
           <h2 className="text-lg font-black uppercase tracking-tight text-zinc-900">{categoryLabel} ({pkgs.length})</h2>
        </div>
        
        {pkgs.length === 0 ? (
          <Card className="border-dashed bg-zinc-50/50">
            <CardContent className="py-10 text-center space-y-3">
              <Icon className="h-6 w-6 text-zinc-300 mx-auto" />
              <div className="space-y-1">
                <CardTitle className="text-zinc-400 font-black uppercase text-xs">Nenhum pacote de {categoryLabel.toLowerCase()}</CardTitle>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pkgs.map((pkg) => (
              <Card key={pkg.id} className={cn(
                "relative overflow-hidden border-2 transition-all hover:shadow-md",
                pkg.is_recommended ? "border-amber-400/50 shadow-amber-100" : "border-zinc-100"
              )}>
                {pkg.badge_text && (
                  <div className="absolute top-0 right-0 z-20">
                    <div className="bg-[#FF6A00] text-white text-[9px] font-black px-3 py-1 rounded-bl-xl uppercase shadow-sm tracking-widest">
                      {pkg.badge_text}
                    </div>
                  </div>
                )}
                
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-black tracking-tight uppercase flex items-center gap-2">
                        {pkg.name}
                        {pkg.is_recommended && <Star className="h-4 w-4 text-amber-500 fill-current" />}
                      </CardTitle>
                      <p className="text-sm font-mono font-black text-blue-600">
                        {formatCurrencyBRL(pkg.price_brl)}
                        {pkg.is_merchant_product ? (
                          <span className="text-[10px] text-muted-foreground ml-1 bg-zinc-50 px-2 py-0.5 rounded border">
                             {pkg.credits_base} + {pkg.credits_bonus} BÔNUS
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground ml-1">/ {pkg.credits_amount} créditos</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:bg-blue-50" onClick={() => setEditingPackage(pkg)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => {
                        if (confirm("Deseja realmente excluir este pacote?")) {
                          if (pkg.is_merchant_product) {
                            adminCredits.deleteProduct.mutate(pkg.id);
                          } else {
                             deletePackage.mutate(pkg.id);
                          }
                        }
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed min-h-[48px] line-clamp-2 italic">
                    {pkg.description || "Sem descrição definida para este plano."}
                  </p>
                  
                  <div className="space-y-2 py-2 border-y border-zinc-50">
                    <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-tighter">Benefícios Inclusos</Label>
                    <div className="space-y-1.5">
                      {(!pkg.features_json || pkg.features_json.length === 0) ? (
                        <p className="text-[10px] text-zinc-300 italic">Nenhum benefício listado</p>
                      ) : (
                        pkg.features_json.map((f: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] font-bold text-zinc-600">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="leading-tight">{f}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={pkg.is_active} 
                        onCheckedChange={(val) => {
                          if (pkg.is_merchant_product) {
                            adminCredits.updateProduct.mutate({ id: pkg.id, is_active: val });
                          } else {
                            togglePackage.mutate({ id: pkg.id, is_active: val });
                          }
                        }} 
                      />
                      <span className={cn("font-black uppercase tracking-tighter", pkg.is_active ? "text-emerald-600" : "text-zinc-400")}>
                        {pkg.is_active ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    {pkg.is_featured && (
                        <Badge variant="secondary" className="gap-1 bg-indigo-50 text-indigo-600 border-indigo-100 uppercase text-[9px] font-black py-0.5">
                          <Star className="h-3 w-3 fill-current" /> Destaque
                        </Badge>
                      )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FF6A00] to-orange-600 flex items-center justify-center shadow-lg">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Créditos</h1>
            <p className="text-sm text-muted-foreground">Controle de pacotes para Imóveis, Veículos e Produtos</p>
          </div>
        </div>
        {activeTab !== "charges" && (
          <Button onClick={() => setShowCreate(activeTab)} className="gap-2 bg-[#FF6A00] hover:bg-[#e65c00]">
            <Plus className="h-4 w-4" /> Novo Pacote
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-100 p-1 rounded-xl">
          <TabsTrigger value="real_estate" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
            <Building2 className="w-4 h-4" /> Imóveis
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
            <CarFront className="w-4 h-4" /> Veículos
          </TabsTrigger>
          <TabsTrigger value="products" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
            <ShoppingBag className="w-4 h-4" /> Produtos
          </TabsTrigger>
          <TabsTrigger value="charges" className="rounded-lg gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm px-6">
            <Zap className="w-4 h-4" /> Cobranças
          </TabsTrigger>
        </TabsList>

        <TabsContent value="real_estate" className="mt-0 outline-none">
           {renderPackageGrid(realEstatePackages, "Imóveis", Building2)}
        </TabsContent>

        <TabsContent value="vehicles" className="mt-0 outline-none">
           {renderPackageGrid(vehiclePackages, "Veículos", CarFront)}
        </TabsContent>

        <TabsContent value="products" className="mt-0 outline-none">
           {renderPackageTable(productPackages, "Produtos", ShoppingBag)}
        </TabsContent>

        <TabsContent value="charges" className="mt-0 outline-none">
           <AdminRealEstateCharges />
        </TabsContent>
      </Tabs>

      {/* Dialog Create/Edit */}
      {(showCreate || editingPackage) && (
        <PackageFormDialog 
          key={editingPackage?.id || "create"}
          pkg={editingPackage} 
          initialCategory={typeof showCreate === 'string' ? showCreate : undefined}
          onClose={() => { setEditingPackage(null); setShowCreate(false); }}
          onSave={async (data: any) => {
            try {
              if (activeTab === 'products') {
                if (editingPackage) {
                  await adminCredits.updateProduct.mutateAsync({ id: editingPackage.id, ...data });
                } else {
                  await adminCredits.createProduct.mutateAsync(data);
                }
              } else {
                if (editingPackage) {
                  await updatePackage.mutateAsync({ id: editingPackage.id, ...data });
                } else {
                  await createPackage.mutateAsync(data);
                }
              }
              setEditingPackage(null);
              setShowCreate(false);
            } catch (err: any) {
              console.error("[AdminRealEstatePackages] Save failed:", err);
            }
          }}
          isSubmitting={createPackage.isPending || updatePackage.isPending || adminCredits.updateProduct.isPending || adminCredits.createProduct.isPending}
        />
      )}
    </div>
  );
}

export function PackageFormDialog({ pkg, onClose, onSave, isSubmitting, initialCategory }: any) {
  const isProduct = (pkg?.is_merchant_product) || (initialCategory === 'products');

  const [form, setForm] = useState({
    name: pkg?.name || "",
    description: pkg?.description || "",
    price_brl: pkg?.price_brl || 0,
    credits_amount: pkg?.credits_amount || 0,
    credits_base: pkg?.credits_base || pkg?.credits_amount || 0,
    credits_bonus: pkg?.credits_bonus || pkg?.bonus_credits || 0,
    package_type: pkg?.package_type || pkg?.product_type || "standard",
    product_type: pkg?.product_type || pkg?.package_type || "pacote",
    category: pkg?.category || initialCategory || "real_estate",
    badge_text: pkg?.badge_text || "",
    button_label: pkg?.button_label || pkg?.action_label || "Selecionar",
    is_recommended: pkg?.is_recommended || false,
    is_featured: pkg?.is_featured || false,
    sort_order: pkg?.sort_order || 0,
    features_json: pkg?.features_json || [],
    rollover_enabled: pkg?.rollover_enabled || false,
    rollover_percent: pkg?.rollover_percent || 0,
  });

  const [featuresText, setFeaturesText] = useState(
    Array.isArray(pkg?.features_json) ? pkg.features_json.join("\n") : ""
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pkg ? "Editar Pacote" : "Novo Pacote Imóveis"}</DialogTitle>
          <DialogDescription>Preencha os dados comerciais do pacote de visibilidade.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 py-4">
          {/* --- SECTION 1: BASIC INFO --- */}
          <div className="col-span-2 sm:col-span-1 space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Nome Comercial</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Pacote Premium" className="font-bold" />
          </div>

          <div className="col-span-2 sm:col-span-1 space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Posição (Ordem)</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
          </div>

          {/* --- SECTION 2: VALUES --- */}
          {isProduct ? (
            <div className="col-span-2 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100 space-y-4">
              <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Distribuição de Créditos</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-600">Base</Label>
                  <Input
                    type="number" min="0"
                    value={form.credits_base}
                    onChange={(e) => {
                      const base = Number(e.target.value) || 0;
                      const bonus = Number(form.credits_bonus) || 0;
                      setForm({ ...form, credits_base: base, credits_amount: base + bonus });
                    }}
                    className="h-10 text-center font-mono font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-600">Bônus</Label>
                  <Input
                    type="number" min="0"
                    value={form.credits_bonus}
                    onChange={(e) => {
                      const bonus = Number(e.target.value) || 0;
                      const base = Number(form.credits_base) || 0;
                      setForm({ ...form, credits_bonus: bonus, credits_amount: base + bonus });
                    }}
                    className="h-10 text-center font-mono font-bold text-emerald-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-600">Total</Label>
                  <Input
                    type="number"
                    value={form.credits_amount}
                    className="h-10 text-center font-mono font-black bg-white border-zinc-200"
                    disabled
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="col-span-2 grid grid-cols-2 gap-4 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100">
              <div className="space-y-2">
                <Label className="text-xs font-bold">Total de Créditos</Label>
                <Input type="number" value={form.credits_amount} onChange={(e) => setForm({ ...form, credits_amount: parseInt(e.target.value) || 0 })} className="font-mono font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold">Créditos de Bônus</Label>
                <Input type="number" value={form.credits_bonus} onChange={(e) => setForm({ ...form, credits_bonus: parseInt(e.target.value) || 0 })} className="font-mono font-bold text-emerald-600" />
              </div>
            </div>
          )}

          {/* --- SECTION 3: COMMERCIAL --- */}
          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Preço (R$)</Label>
            <Input 
              type="number" step="0.01" min="0"
              value={form.price_brl} 
              onChange={(e) => setForm({ ...form, price_brl: parseFloat(e.target.value) || 0 })}
              className="font-mono font-bold text-blue-600"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Tipo do Plano</Label>
            {isProduct ? (
              <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v, package_type: v })}>
                <SelectTrigger className="font-medium"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pacote">Avulso / Pacote</SelectItem>
                  <SelectItem value="mensal">Assinatura Mensal</SelectItem>
                  <SelectItem value="semestral">Assinatura Semestral</SelectItem>
                  <SelectItem value="anual">Assinatura Anual</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })} placeholder="standard, premium, exclusive" />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Texto da Badge</Label>
            <Input value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} placeholder="Ex: MAIS VENDIDO" className="uppercase font-black text-[11px]" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Texto do Botão</Label>
            <Input value={form.button_label} onChange={(e) => setForm({ ...form, button_label: e.target.value })} placeholder="ADQUIRIR AGORA" />
          </div>

          {/* --- SECTION 4: OPTIONS & ROLLOVER --- */}
          <div className="col-span-2 grid grid-cols-2 gap-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
               <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-zinc-700">Sugerido ⭐</Label>
                  <p className="text-[9px] text-zinc-400 italic font-medium leading-none">Marca como plano recomendado/melhor custo</p>
               </div>
               <Switch checked={form.is_recommended} onCheckedChange={(v) => setForm({ ...form, is_recommended: v })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
               <div className="space-y-0.5">
                  <Label className="text-xs font-bold text-zinc-700">Destaque 🚀</Label>
                  <p className="text-[9px] text-zinc-400 italic font-medium leading-none">Exibe estrela de destaque comercial no card</p>
               </div>
               <Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />
            </div>
          </div>

          {isProduct && (
            <div className="col-span-2 space-y-4 p-4 rounded-2xl bg-violet-50/50 border border-violet-100">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                   <Label className="text-xs font-black uppercase text-violet-700">Rollover (Acumular Créditos) 🔄</Label>
                   <p className="text-[10px] text-violet-500 italic">Créditos não usados acumulam para o próximo ciclo de faturamento.</p>
                </div>
                <Switch
                  checked={form.rollover_enabled}
                  onCheckedChange={(v) => setForm({ ...form, rollover_enabled: v })}
                />
              </div>
              {form.rollover_enabled && (
                <div className="flex items-center gap-3 pl-4 border-l-2 border-violet-200">
                  <Label className="text-xs font-bold text-violet-600 shrink-0">% Permitida:</Label>
                  <Input
                    type="number" min="0" max="100"
                    value={form.rollover_percent}
                    onChange={(e) => setForm({ ...form, rollover_percent: parseInt(e.target.value) || 0 })}
                    className="h-8 max-w-[80px] text-center font-bold"
                  />
                  <span className="text-xs font-bold text-violet-400">% do total base</span>
                </div>
              )}
            </div>
          )}

          {/* --- SECTION 5: CONTENT --- */}
          <div className="col-span-2 space-y-2">
            <Label className="text-xs font-black uppercase text-zinc-500">Descrição Comercial (Curta)</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Breve resumo do pacote que aparece no card..." rows={2} className="text-sm" />
          </div>

          <div className="col-span-2 space-y-3 pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between">
              <Label className="text-indigo-600 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Benefícios e Features (Um por linha)
              </Label>
              <span className="text-[9px] text-zinc-400 font-bold uppercase">Aparecem com check de confirmação</span>
            </div>
            <Textarea 
              value={featuresText} 
              onChange={(e) => setFeaturesText(e.target.value)} 
              placeholder="Ex:&#10;Exposição Premium&#10;Destaque no Marketplace&#10;Suporte VIP"
              className="min-h-[140px] font-mono text-xs leading-loose bg-zinc-50/30 border-zinc-200"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button 
            className="bg-[#FF6A00] hover:bg-[#e65c00]" 
            onClick={() => {
              // Converter o texto do textarea em array de strings limpo
              const features_json = featuresText
                .split("\n")
                .map(line => line.trim())
                .filter(line => line.length > 0);
              
              onSave({ ...form, features_json });
            }} 
            disabled={isSubmitting || !form.name.trim()}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {pkg ? "Salvar Alterações" : "Criar Pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
