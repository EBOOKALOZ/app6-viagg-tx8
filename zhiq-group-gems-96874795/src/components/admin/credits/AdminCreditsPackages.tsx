import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Package, Edit, ArrowUpDown, Trash2, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { AdminCreditProduct, AdminCreditsData } from "@/hooks/useAdminCredits";

interface Props { data: AdminCreditsData; }

export function AdminCreditsPackages({ data }: Props) {
  const { products, toggleProduct, updateProduct, deleteProduct, createProduct } = data;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("order");
  const [editingProduct, setEditingProduct] = useState<AdminCreditProduct | null>(null);
  const [editForm, setEditForm] = useState<Partial<AdminCreditProduct>>({});
  const [featuresText, setFeaturesText] = useState("");

  const filtered = products
    .filter((p: AdminCreditProduct) => {
      if (filter === "active" && !p.is_active) return false;
      if (filter === "inactive" && p.is_active) return false;
      if (typeFilter !== "all" && p.product_type !== typeFilter) return false;
      return true;
    })
    .sort((a: AdminCreditProduct, b: AdminCreditProduct) => {
      switch (sortBy) {
        case "price_asc": return a.price_brl - b.price_brl;
        case "price_desc": return b.price_brl - a.price_brl;
        case "credits_asc": return a.credits_amount - b.credits_amount;
        case "credits_desc": return b.credits_amount - a.credits_amount;
        case "name": return (a.name || "").localeCompare(b.name || "");
        case "order": return a.sort_order - b.sort_order;
        default: return a.price_brl - b.price_brl;
      }
    });

  const handleToggle = async (p: AdminCreditProduct) => {
    try {
      await toggleProduct.mutateAsync({ id: p.id, is_active: !p.is_active });
      toast.success(`Pacote ${!p.is_active ? "ativado" : "desativado"}`);
    } catch { toast.error("Erro ao alterar status"); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct.mutateAsync(id);
      toast.success("Pacote excluído com sucesso!");
      setDeletingId(null);
    } catch { toast.error("Erro ao excluir pacote"); }
  };

  const openEdit = (p: AdminCreditProduct) => {
    setEditingProduct(p);
    setEditForm({
      name: p.name || "",
      credits_amount: p.credits_amount,
      credits_base: p.credits_base,
      credits_bonus: p.credits_bonus,
      price_brl: p.price_brl,
      description: p.description || "",
      badge_text: p.badge_text || "",
      sort_order: p.sort_order,
      product_type: p.product_type || "pacote",
      is_recommended: p.is_recommended,
      rollover_enabled: p.rollover_enabled,
      rollover_percent: p.rollover_percent,
      action_label: p.action_label || "",
      action_enabled: p.action_enabled ?? true,
      features_json: p.features_json || [],
    });
    setFeaturesText(Array.isArray(p.features_json) ? p.features_json.join("\n") : "");
  };

  const handleSave = async () => {
    if (!editingProduct) return;

    const totalCredits = (Number(editForm.credits_base) || 0) + (Number(editForm.credits_bonus) || 0);
    if (totalCredits <= 0) {
      toast.error("O total de créditos (base + bônus) deve ser maior que zero");
      return;
    }

    const payload = {
      id: editingProduct.id,
      name: editForm.name,
      credits_base: Number(editForm.credits_base),
      credits_bonus: Number(editForm.credits_bonus),
      price_cents: Math.round(Number(editForm.price_brl) * 100),
      description: editForm.description || null,
      badge_text: editForm.badge_text || null,
      action_label: editForm.action_label || null,
      action_enabled: editForm.action_enabled ?? true,
      sort_order: Number(editForm.sort_order),
      product_type: editForm.product_type,
      is_recommended: editForm.is_recommended,
      rollover_enabled: editForm.rollover_enabled,
      rollover_percent: Number(editForm.rollover_percent) || 0,
      features_json: featuresText.split("\n").map(l => l.trim()).filter(l => l.length > 0),
      updated_at: new Date().toISOString(),
    };
    console.log("[AdminCreditsPackages] Saving product:", payload);
    try {
      await updateProduct.mutateAsync(payload);
      toast.success("Pacote atualizado com sucesso!");
      setEditingProduct(null);
      if (data.refetch) data.refetch();
    } catch (err: unknown) {
      console.error("[AdminCreditsPackages] Save error:", err);
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : "Erro desconhecido"}`);
    }
  };

  const types = [...new Set(products.map((p: AdminCreditProduct) => p.product_type).filter(Boolean))];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="shadow-sm border-0">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={filter} onValueChange={(v: string) => setFilter(v)}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {types.map((t: string) => <SelectItem key={t} value={t}>{translateType(t)}</SelectItem>)}
            </SelectContent>
           </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-44 h-9 text-xs"><ArrowUpDown className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="price_asc">Menor preço</SelectItem>
              <SelectItem value="price_desc">Maior preço</SelectItem>
              <SelectItem value="credits_asc">Menos créditos</SelectItem>
              <SelectItem value="credits_desc">Mais créditos</SelectItem>
              <SelectItem value="name">Nome A-Z</SelectItem>
              <SelectItem value="order">Ordem manual</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs ml-auto">{filtered.length} pacotes</Badge>
          <Button size="sm" className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo Pacote
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
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
              {filtered.map((p: AdminCreditProduct) => (
                <tr key={p.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="p-3 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{p.sort_order}</span>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{p.name || p.slug || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description || ""}</div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs">{translateType(p.product_type || "")}</Badge>
                  </td>
                  <td className="p-3 text-right font-mono font-semibold">{p.credits_amount}</td>
                  <td className="p-3 text-right text-xs text-muted-foreground">{p.credits_base} + {p.credits_bonus}</td>
                  <td className="p-3 text-right font-mono font-semibold text-emerald-600">R$ {p.price_brl.toFixed(2)}</td>
                  <td className="p-3 text-center">
                    {p.badge_text ? <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">{p.badge_text}</Badge> : "—"}
                  </td>
                  <td className="p-3 text-center">{p.is_recommended ? <Badge className="text-[10px] bg-blue-100 text-blue-700">⭐</Badge> : "—"}</td>
                  <td className="p-3 text-center">{p.rollover_enabled ? <Badge variant="outline" className="text-[10px]">{p.rollover_percent}%</Badge> : "—"}</td>
                  <td className="p-3 text-center">
                    <Switch checked={p.is_active} onCheckedChange={() => handleToggle(p)} />
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingId(p.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Nenhum pacote encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4 text-yellow-600" /> Editar Pacote
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* Nome e Ordem */}
            <div className="col-span-2 sm:col-span-1 space-y-1">
              <Label className="text-[10px] font-black uppercase text-zinc-500">Nome Comercial</Label>
              <Input
                value={editForm.name ?? ""}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="h-10 text-sm font-bold"
                placeholder="Ex: Pacote 100"
              />
            </div>
            <div className="col-span-2 sm:col-span-1 space-y-1">
               <Label className="text-[10px] font-black uppercase text-zinc-500">Posição (Ordem)</Label>
               <Input
                  type="number" min="0"
                  value={editForm.sort_order ?? 0}
                  onChange={(e) => setEditForm({ ...editForm, sort_order: e.target.value })}
                  className="h-10 text-sm"
               />
            </div>

            {/* Distribuição de Créditos */}
            <div className="col-span-2 bg-zinc-50/50 p-4 rounded-2xl border border-zinc-100 space-y-3">
               <Label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Distribuição de Créditos</Label>
               <div className="grid grid-cols-3 gap-3">
                   <div className="space-y-1">
                     <Label className="text-xs font-bold text-zinc-600">Base</Label>
                     <Input
                       type="number" min="1"
                       value={editForm.credits_base ?? 0}
                       onChange={(e) => {
                         const base = Number(e.target.value) || 0;
                         const bonus = Number(editForm.credits_bonus) || 0;
                         setEditForm({ ...editForm, credits_base: base, credits_amount: base + bonus });
                       }}
                       className="h-9 text-sm text-center font-mono font-bold"
                     />
                   </div>
                   <div className="space-y-1">
                     <Label className="text-xs font-bold text-zinc-600">Bônus</Label>
                     <Input
                       type="number" min="0"
                       value={editForm.credits_bonus ?? 0}
                       onChange={(e) => {
                         const bonus = Number(e.target.value) || 0;
                         const base = Number(editForm.credits_base) || 0;
                         setEditForm({ ...editForm, credits_bonus: bonus, credits_amount: base + bonus });
                       }}
                       className="h-9 text-sm text-center font-mono font-bold text-emerald-600"
                     />
                   </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-zinc-600">Total</Label>
                    <Input
                      type="number"
                      value={editForm.credits_amount ?? 0}
                      className="h-9 text-sm text-center font-mono font-black bg-white select-none"
                      disabled
                    />
                  </div>
               </div>
            </div>

            {/* Preço e Tipo */}
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-zinc-500">Preço (R$)</Label>
              <Input
                type="number" step="0.01" min="0"
                value={editForm.price_brl ?? 0}
                onChange={(e) => setEditForm({ ...editForm, price_brl: e.target.value })}
                className="h-10 text-sm font-mono font-black text-blue-600"
              />
            </div>
            <div className="space-y-1">
               <Label className="text-[10px] font-black uppercase text-zinc-500">Tipo do Plano</Label>
               <Select value={editForm.product_type} onValueChange={(v) => setEditForm({ ...editForm, product_type: v })}>
                  <SelectTrigger className="h-10 text-sm font-medium"><SelectValue /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value="pacote">Avulso / Pacote</SelectItem>
                     <SelectItem value="mensal">Mensal</SelectItem>
                     <SelectItem value="semestral">Semestral</SelectItem>
                     <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
               </Select>
            </div>

            {/* Marketing Labels */}
            <div className="space-y-1">
               <Label className="text-[10px] font-black uppercase text-zinc-500">Badge Texto</Label>
               <Input
                  value={editForm.badge_text ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, badge_text: e.target.value })}
                  placeholder="Ex: MAIS VENDIDO"
                  className="h-10 text-[11px] font-black uppercase tracking-wider"
               />
            </div>
            <div className="space-y-1">
               <Label className="text-[10px] font-black uppercase text-zinc-500">Texto Botão</Label>
               <Input
                   value={editForm.action_label ?? ""}
                   onChange={(e) => setEditForm({ ...editForm, action_label: e.target.value })}
                   placeholder="COMPRAR CRÉDITOS"
                   className="h-10 text-sm"
               />
            </div>

            {/* Destaque e Rollover */}
            <div className="col-span-2 grid grid-cols-2 gap-4 py-2">
               <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="space-y-0.5 pr-4">
                     <Label className="text-xs font-bold text-zinc-700 leading-none">Destaque ⭐</Label>
                     <p className="text-[9px] text-zinc-400 italic font-medium leading-none">Melhor oferta/custo-benefício</p>
                  </div>
                  <Switch checked={editForm.is_recommended ?? false} onCheckedChange={(v) => setEditForm({ ...editForm, is_recommended: v })} />
               </div>
               <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="space-y-0.5 pr-4">
                     <Label className="text-xs font-bold text-zinc-700 leading-none">Rollover 🔄</Label>
                     <p className="text-[9px] text-zinc-400 italic font-medium leading-none">Acumula p/ próximo ciclo</p>
                  </div>
                  <Switch checked={editForm.rollover_enabled ?? false} onCheckedChange={(v) => setEditForm({ ...editForm, rollover_enabled: v })} />
               </div>
            </div>

            {editForm.rollover_enabled && (
              <div className="col-span-2 flex items-center gap-3 pl-4 border-l-2 border-violet-200 py-1 bg-violet-50/30 rounded-r-xl">
                 <Label className="text-xs font-bold text-violet-600 shrink-0">% Permitida:</Label>
                 <Input
                   type="number" min="0" max="100"
                   value={editForm.rollover_percent ?? 0}
                   onChange={(e) => setEditForm({ ...editForm, rollover_percent: e.target.value })}
                   className="h-8 max-w-[80px] text-center font-bold"
                 />
                 <span className="text-[10px] font-medium text-violet-400">do total de créditos do ciclo</span>
              </div>
            )}

            {/* Descrição e Benefícios */}
            <div className="col-span-2 space-y-1">
               <Label className="text-[10px] font-black uppercase text-zinc-500">Descrição Curta</Label>
               <Textarea
                  value={editForm.description ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Resumo que aparece no card do lojista..."
                  className="min-h-[60px] text-sm leading-relaxed"
                  rows={2}
               />
            </div>

            <div className="col-span-2 space-y-2 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                   <Label className="text-emerald-700 font-extrabold text-[10px] uppercase tracking-widest flex items-center gap-2">
                      <Plus className="h-3 w-3" /> Benefícios Premium (Um por linha)
                   </Label>
                </div>
                <Textarea
                   value={featuresText}
                   onChange={(e) => setFeaturesText(e.target.value)}
                   placeholder="Ex:&#10;Exposição Premium&#10;Destaque no Marketplace&#10;Relatórios em Tempo Real"
                   className="min-h-[120px] font-mono text-xs leading-loose bg-zinc-50/50 border-zinc-200"
                />
                <p className="text-[9px] text-zinc-400 italic font-medium">Cada linha acima aparecerá com um check verde no painel do anunciante.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditingProduct(null)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-white"
              onClick={handleSave}
              disabled={updateProduct.isPending}
            >
              {updateProduct.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Excluir Pacote
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja <strong>excluir permanentemente</strong> o pacote{" "}
            <strong>{products.find((p: AdminCreditProduct) => p.id === deletingId)?.name}</strong>?
          </p>
          <p className="text-xs text-red-500 font-medium">Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deletingId && handleDelete(deletingId)}
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <CreateProductDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={createProduct}
      />
    </div>
  );
}

function translateType(t: string) {
  const m: Record<string, string> = { pacote: "Avulso", mensal: "Mensal", semestral: "Semestral", anual: "Anual", one_time: "Avulso", monthly: "Mensal" };
  return m[t] || t;
}

// ─── CreateProductDialog ────────────────

function CreateProductDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: { mutateAsync: (input: Omit<AdminCreditProduct, 'id'>) => Promise<void>; isPending: boolean };
}) {
  const [form, setForm] = useState({
    name: "",
    product_type: "pacote",
    credits_base: 1,  // default minimum 1 to satisfy constraint
    credits_bonus: 0,
    price_brl: 0,
    description: "",
    badge_text: "",
    action_label: "",
    action_enabled: true,
    sort_order: 0,
    is_recommended: false,
    rollover_enabled: false,
    rollover_percent: 0,
    features_json: [] as string[],
  });

  const reset = () => {
    setForm({
      name: "", product_type: "pacote", credits_base: 1, credits_bonus: 0,
      price_brl: 0, description: "", badge_text: "", action_label: "",
      action_enabled: true, sort_order: 0, is_recommended: false,
      rollover_enabled: false, rollover_percent: 0,
      features_json: [],
    });
    setFeaturesText("");
  };

  const [featuresText, setFeaturesText] = useState("");

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    const totalCredits = form.credits_base + form.credits_bonus;
    if (totalCredits <= 0) {
      toast.error("O total de créditos (base + bônus) deve ser maior que zero");
      return;
    }
    try {
      await onCreate.mutateAsync({
        ...form,
        description: form.description || undefined,
        badge_text: form.badge_text || undefined,
        action_label: form.action_label || undefined,
        features_json: featuresText.split("\n").map(l => l.trim()).filter(l => l.length > 0),
      });
      toast.success("Pacote criado com sucesso! 🎉");
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(`Erro ao criar: ${err instanceof Error ? err.message : "Erro desconhecido"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-amber-600" /> Novo Pacote
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome Comercial *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 text-sm" placeholder="Ex: Pacote 100" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Tipo do Produto</Label>
            <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pacote">Avulso</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="semestral">Semestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Base</Label>
              <Input type="number" min="1" value={form.credits_base} onChange={(e) => setForm({ ...form, credits_base: Number(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Bônus</Label>
              <Input type="number" min="0" value={form.credits_bonus} onChange={(e) => setForm({ ...form, credits_bonus: Number(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Total</Label>
              <Input type="number" value={form.credits_base + form.credits_bonus} className="h-9 text-sm bg-muted" disabled />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Preço (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={form.price_brl} onChange={(e) => setForm({ ...form, price_brl: Number(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Ordem de Exibição</Label>
              <Input type="number" min="0" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Descrição</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 text-sm" placeholder="Descrição curta para o lojista" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Badge Visual</Label>
            <Input value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} className="h-9 text-sm" placeholder="Ex: MELHOR AVULSO" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Texto do Botão</Label>
              <Input value={form.action_label} onChange={(e) => setForm({ ...form, action_label: e.target.value })} className="h-9 text-sm" placeholder="Comprar Créditos" />
            </div>
            <div className="space-y-1 flex flex-col">
              <Label className="text-xs font-semibold">Ação Ativa</Label>
              <div className="flex-1 flex items-center">
                <Switch checked={form.action_enabled} onCheckedChange={(v) => setForm({ ...form, action_enabled: v })} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 p-3 rounded-xl bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Destaque ⭐</Label>
              <Switch checked={form.is_recommended} onCheckedChange={(v) => setForm({ ...form, is_recommended: v })} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Rollover</Label>
              <Switch checked={form.rollover_enabled} onCheckedChange={(v) => setForm({ ...form, rollover_enabled: v })} />
            </div>
          </div>
          {form.rollover_enabled && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold">% de Rollover</Label>
              <Input type="number" min="0" max="100" value={form.rollover_percent} onChange={(e) => setForm({ ...form, rollover_percent: Number(e.target.value) || 0 })} className="h-9 text-sm" placeholder="Ex: 30" />
            </div>
          )}

          <div className="col-span-1 space-y-2 pt-2 border-t border-zinc-100">
             <Label className="text-emerald-700 font-extrabold text-[10px] uppercase tracking-widest">Benefícios Inclusos</Label>
             <Textarea
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder="Ex:&#10;Primeira Página&#10;Destaque Ouro"
                className="min-h-[100px] font-mono text-xs leading-loose bg-zinc-50/50"
             />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            onClick={handleCreate}
            disabled={onCreate.isPending || !form.name.trim()}
          >
            {onCreate.isPending ? "Criando..." : "Criar Pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
