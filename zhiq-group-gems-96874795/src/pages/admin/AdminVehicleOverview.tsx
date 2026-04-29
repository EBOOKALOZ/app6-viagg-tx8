import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAdminVehicleOverview,
  type AdminVehicleListingRow,
  type AdvertiserKind,
} from "@/hooks/useAdminVehicleOverview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Car, Search, Loader2, TrendingUp, TrendingDown, Users,
  Package, Coins, CheckCircle2, Clock, Ban, MapPin, Store,
  User as UserIcon, Eye, Calendar, Sparkles, Filter, ArrowUpRight, ExternalLink,
  Fuel, Settings2, Gauge, Tag, Plus, Edit, Trash2, CarFront,
} from "lucide-react";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { VehiclePackagesManager } from "@/components/admin/VehiclePackagesManager";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  published:   { label: "Publicado",  className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  approved:    { label: "Aprovado",   className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  active:      { label: "Ativo",      className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", icon: CheckCircle2 },
  pending_review: { label: "Pendente", className: "bg-amber-500/15 text-amber-500 border-amber-500/30", icon: Clock },
  pending:     { label: "Pendente",   className: "bg-amber-500/15 text-amber-500 border-amber-500/30", icon: Clock },
  draft:       { label: "Rascunho",   className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Clock },
  rejected:    { label: "Rejeitado",  className: "bg-red-500/15 text-red-500 border-red-500/30", icon: Ban },
  blocked:     { label: "Bloqueado",  className: "bg-red-500/15 text-red-500 border-red-500/30", icon: Ban },
  suspended:   { label: "Suspenso",   className: "bg-red-500/15 text-red-500 border-red-500/30", icon: Ban },
};

function StatusPill({ status }: { status: string | null }) {
  const meta = STATUS_META[status || ""] || { label: status || "—", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Clock };
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-bold uppercase text-[10px] tracking-wider", meta.className)}>
      <Icon className="w-3 h-3" /> {meta.label}
    </Badge>
  );
}

function KindPill({ kind }: { kind: AdvertiserKind }) {
  if (kind === "lojista") {
    return (
      <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        <Store className="w-3 h-3" /> Lojista
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
      <UserIcon className="w-3 h-3" /> Pessoa
    </span>
  );
}

function formatPct(n: number): string {
  if (!isFinite(n)) return "0%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString('pt-BR');
}

function MetricCard({ title, value, delta, icon: Icon, className }: any) {
  const positive = delta !== undefined && delta >= 0;
  const negative = delta !== undefined && delta < 0;
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {delta !== undefined && (
          <div className={cn("text-[11px] font-semibold mt-1 flex items-center gap-1", positive ? "text-emerald-500" : "text-red-500")}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {formatPct(delta)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type DetailRowProps = { label: string; value: React.ReactNode };
function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between py-1 border-b border-muted/30 last:border-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-semibold text-right">{value}</span>
    </div>
  );
}

type SelectedRow = AdminVehicleListingRow;

function VehicleDetailDrawer({ selected, open, onClose }: { selected: SelectedRow | null; open: boolean; onClose: () => void }) {
  if (!selected) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Car className="w-5 h-5" />
            {selected.title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <h4 className="text-[13px] font-bold uppercase text-muted-foreground mb-3">Informações do Veículo</h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Marca" value={selected.brand || "—"} />
              <DetailRow label="Modelo" value={selected.model || "—"} />
              <DetailRow label="Ano" value={String(selected.year || "—")} />
              <DetailRow label="Tipo" value={selected.vehicle_type || "—"} />
              <DetailRow label="Condição" value={selected.condition || "—"} />
              <DetailRow label="KM" value={formatNumber(selected.kilometers)} />
              <DetailRow label="Combustível" value={selected.fuel_type || "—"} />
              <DetailRow label="Câmbio" value={selected.transmission || "—"} />
              <DetailRow label="Preço" value={formatCurrencyBRL(selected.price_brl)} />
              <DetailRow label="Status" value={<StatusPill status={selected.visibility_status} />} />
            </div>
          </section>

          <section>
            <h4 className="text-[13px] font-bold uppercase text-muted-foreground mb-3">Localização</h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Cidade" value={selected.city || "—"} />
              <DetailRow label="Estado" value={selected.state || "—"} />
              <DetailRow label="Bairro" value={selected.neighborhood || "—"} />
            </div>
          </section>

          <section>
            <h4 className="text-[13px] font-bold uppercase text-muted-foreground mb-3">Anunciante</h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Nome" value={selected.advertiser_name} />
              <DetailRow label="Tipo" value={<KindPill kind={selected.advertiser_kind} />} />
              <DetailRow label="Cidade" value={selected.advertiser_city || "—"} />
              <DetailRow label="Contato" value={selected.advertiser_phone || "—"} />
              <DetailRow label="Total de Veículos" value={formatNumber(selected.advertiser_listings_total)} />
            </div>
          </section>

          <section>
            <h4 className="text-[13px] font-bold uppercase text-muted-foreground mb-3">Pacote / Créditos</h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Pacote" value={selected.package_name || "—"} />
              <DetailRow label="Créditos Consumidos" value={formatNumber(selected.credits_consumed)} />
              <DetailRow label="Leads Gerados" value={formatNumber(selected.lead_count)} />
            </div>
          </section>

          <section>
            <h4 className="text-[13px] font-bold uppercase text-muted-foreground mb-3">Datas</h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Criado em" value={selected.created_at ? format(new Date(selected.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"} />
              <DetailRow label="Atualizado em" value={selected.updated_at ? format(new Date(selected.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"} />
              <DetailRow label="Publicado em" value={selected.published_at ? format(new Date(selected.published_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"} />
            </div>
          </section>

          <div className="pt-4 border-t flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              <Eye className="w-4 h-4 mr-2" /> Ver Anúncio
            </Button>
            <Button variant="default" size="sm" className="flex-1" onClick={() => window.open(`/admin/users/${selected.owner_user_id}`, '_blank')}>
              <UserIcon className="w-4 h-4 mr-2" /> Perfil do Anunciante
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminVehicleOverview() {
  const navigate = useNavigate();
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [selectedRow, setSelectedRow] = useState<SelectedRow | null>(null);

  const { data, isLoading, cities } = useAdminVehicleOverview({ periodDays });

  // Filtro na tabela de anúncios
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.filter((row) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          row.title?.toLowerCase().includes(q) ||
          row.brand?.toLowerCase().includes(q) ||
          row.model?.toLowerCase().includes(q) ||
          row.city?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFilter !== "all" && row.visibility_status !== statusFilter) return false;
      if (kindFilter !== "all" && row.advertiser_kind !== kindFilter) return false;
      if (packageFilter !== "all" && row.package_slug !== packageFilter) return false;
      if (cityFilter !== "all" && row.city !== cityFilter) return false;
      return true;
    });
  }, [data?.rows, search, statusFilter, kindFilter, packageFilter, cityFilter]);

  const kpis = data?.kpis;

  // ── Gestão de Pacotes ──
  const qc = useQueryClient();
  const [showCreatePkg, setShowCreatePkg] = useState(false);
  const [editingPkg, setEditingPkg] = useState<any>(null);

  const { data: vehiclePackages = [], isLoading: loadingPkgs } = useQuery({
    queryKey: ['admin-vehicle-packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('real_estate_credit_packages')
        .select('*')
        .eq('category', 'vehicles')
        .order('sort_order');
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        is_active: p.is_active !== false,
      }));
    },
  });

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
      qc.invalidateQueries({ queryKey: ["admin-vehicle-overview"] });
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
      qc.invalidateQueries({ queryKey: ["admin-vehicle-overview"] });
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
      qc.invalidateQueries({ queryKey: ["admin-vehicle-overview"] });
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
      qc.invalidateQueries({ queryKey: ["admin-vehicle-overview"] });
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
      {/* Cabeçalho da seção de pacotes */}
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

      {/* Grid de pacotes */}
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

      {/* Dialog de criação/edição */}
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
