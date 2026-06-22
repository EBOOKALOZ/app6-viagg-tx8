import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useAdminServiceOverview,
  type AdminServiceListingRow,
  type AdvertiserKind,
} from "@/hooks/useAdminServiceOverview";
import { PackageFormDialog } from "@/pages/admin/AdminRealEstatePackages";
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Briefcase, Search, Loader2, TrendingUp, TrendingDown, Users,
  Package, Coins, CheckCircle2, Clock, Ban, MapPin, Store,
  User as UserIcon, Eye, Calendar, Sparkles, Filter, ArrowUpRight, ExternalLink,
  Plus, Edit, Trash2,
} from "lucide-react";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveServiceTypeLabel as SERVICE_TYPE_LABEL_FN } from "@/lib/services/serviceCategories";

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

type SelectedRow = AdminServiceListingRow;

function ServiceDetailDrawer({ selected, open, onClose }: { selected: SelectedRow | null; open: boolean; onClose: () => void }) {
  if (!selected) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            {selected.title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <h4 className="text-[13px] font-bold uppercase text-muted-foreground mb-3">Informações do Serviço</h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Categoria" value={SERVICE_TYPE_LABEL_FN(selected.service_type)} />
              <DetailRow label="Valor" value={selected.price_label?.trim() || "Consulte"} />
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
              <DetailRow label="Total de Serviços" value={formatNumber(selected.advertiser_listings_total)} />
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
            <Button variant="outline" size="sm" className="flex-1" onClick={() => window.open(`/servicos/${selected.id}`, '_blank')}>
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

export default function AdminServiceOverview() {
  const navigate = useNavigate();
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [selectedRow, setSelectedRow] = useState<SelectedRow | null>(null);

  const { data, isLoading, cities } = useAdminServiceOverview({ periodDays });

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows.filter((row) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          row.title?.toLowerCase().includes(q) ||
          row.service_type?.toLowerCase().includes(q) ||
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

  const { data: servicePackages = [], isLoading: loadingPkgs } = useQuery({
    queryKey: ['admin-service-packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('real_estate_credit_packages')
        .select('*')
        .eq('category', 'services')
        .order('sort_order');
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        is_active: p.is_active !== false,
      }));
    },
  });

  const createServicePkg = useMutation({
    mutationFn: async (input: any) => {
      const payload: any = {
        name: input.name,
        slug: input.slug || input.name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now(),
        category: 'services',
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
      qc.invalidateQueries({ queryKey: ["admin-service-packages"] });
      qc.invalidateQueries({ queryKey: ["admin-service-overview"] });
      toast.success("Pacote de serviço criado!");
    },
    onError: (err: any) => toast.error(`Falha: ${err.message}`),
  });

  const updateServicePkg = useMutation({
    mutationFn: async (input: any & { id: string }) => {
      const { id } = input;
      const payload: any = {
        name: input.name,
        credits_amount: Number(input.credits_amount) || 0,
        price_brl: Number(input.price_brl) || 0,
        description: input.description || "",
        package_type: input.package_type || "avulso",
        credits_bonus: Number(input.bonus_credits) || 0,
        category: 'services',
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
      qc.invalidateQueries({ queryKey: ["admin-service-packages"] });
      qc.invalidateQueries({ queryKey: ["admin-service-overview"] });
      toast.success("Pacote atualizado!");
    },
    onError: (err: any) => toast.error(`Falha: ${err.message}`),
  });

  const deleteServicePkg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("real_estate_credit_packages")
        .delete()
        .eq("id", id);

      if (error) {
        if (error.message?.includes("foreign key") || error.code === "23503") {
          const { error: updateErr } = await supabase
            .from("real_estate_credit_packages")
            .update({ is_active: false } as any)
            .eq("id", id);
          if (updateErr) throw updateErr;
          return "deactivated" as const;
        }
        throw error;
      }
      return "deleted" as const;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["admin-service-packages"] });
      qc.invalidateQueries({ queryKey: ["admin-service-overview"] });
      if (result === "deactivated") {
        toast.success("Pacote desativado (possui compras vinculadas e não pode ser excluído).");
      } else {
        toast.success("Pacote excluído!");
      }
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const toggleServicePkg = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("real_estate_credit_packages")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-service-packages"] });
      qc.invalidateQueries({ queryKey: ["admin-service-overview"] });
    },
  });

  const handleSavePackage = (data: any) => {
    const packageData = {
      name: data.name,
      slug: data.slug || data.name?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now(),
      category: 'services',
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
      updateServicePkg.mutate({ ...packageData, id: editingPkg.id }, {
        onSuccess: () => { setEditingPkg(null); setShowCreatePkg(false); },
      });
    } else {
      createServicePkg.mutate(packageData, {
        onSuccess: () => { setShowCreatePkg(false); setEditingPkg(null); },
      });
    }
  };

  const handleCloseForm = () => {
    setShowCreatePkg(false);
    setEditingPkg(null);
  };

  const isSubmitting = editingPkg ? updateServicePkg.isPending : createServicePkg.isPending;

  return (
    <div className="space-y-6">
      {/* Cabeçalho da seção de pacotes */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
            <Briefcase className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Pacotes de Serviços</h2>
            <p className="text-xs text-muted-foreground">Gestão de pacotes de créditos</p>
          </div>
        </div>
        <Button onClick={() => { setEditingPkg(null); setShowCreatePkg(true); }} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-xs h-8 px-3">
          <Plus className="h-3.5 w-3.5" /> Novo Pacote
        </Button>
      </div>

      {loadingPkgs ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {servicePackages.length === 0 ? (
            <Card className="col-span-full border-dashed bg-zinc-50/50">
              <CardContent className="py-8 text-center space-y-2">
                <Briefcase className="h-5 w-5 text-zinc-300 mx-auto" />
                <CardTitle className="text-zinc-400 font-black uppercase text-[9px]">Nenhum pacote de serviços cadastrado</CardTitle>
              </CardContent>
            </Card>
          ) : (
            servicePackages.map((pkg: any) => (
              <Card key={pkg.id} className={cn(
                "relative overflow-hidden border-2 transition-all hover:shadow-md",
                pkg.is_featured ? "border-violet-400/50 shadow-violet-100" : "border-zinc-100"
              )}>
                {pkg.badge_text && (
                  <div className="absolute top-0 right-0 z-20">
                    <div className="bg-violet-600 text-white text-[8px] font-black px-2 py-0.5 rounded-bl-xl uppercase shadow-sm tracking-wider">
                      {pkg.badge_text}
                    </div>
                  </div>
                )}
                <CardHeader className="pb-3.5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base font-black tracking-tight uppercase">{pkg.name}</CardTitle>
                      <p className="text-sm font-mono font-black text-violet-600">
                        {formatCurrencyBRL(pkg.price_brl)}
                        <span className="text-[10px] text-muted-foreground ml-1">/ {pkg.credits_amount} créd.</span>
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-500 hover:bg-violet-50" onClick={() => setEditingPkg(pkg)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => {
                        if (confirm("Excluir este pacote?")) deleteServicePkg.mutate(pkg.id);
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
                        onCheckedChange={(val) => toggleServicePkg.mutate({ id: pkg.id, is_active: val })}
                        className="scale-75 origin-left"
                      />
                      <span className={cn("font-black uppercase text-[9px]", pkg.is_active ? "text-emerald-600" : "text-zinc-400")}>
                        {pkg.is_active ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    {pkg.is_featured && (
                      <Badge variant="secondary" className="gap-1 bg-violet-50 text-violet-600 border-violet-100 uppercase text-[8px] font-black py-0.5 h-5">
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
          initialCategory="services"
          onClose={handleCloseForm}
          onSave={handleSavePackage}
          isSubmitting={isSubmitting}
        />
      )}

      {/* ── KPIs ── */}
      <div className="flex items-center gap-2 pt-4">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
          <Briefcase className="h-4 w-4 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Visão Geral de Serviços</h2>
          <p className="text-xs text-muted-foreground">Anúncios, anunciantes e consumo de créditos</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard title="Total de Anúncios" value={formatNumber(kpis?.total_listings)} delta={kpis?.listings_growth_pct} icon={Briefcase} />
            <MetricCard title="Anunciantes" value={formatNumber(kpis?.total_advertisers)} delta={kpis?.advertisers_growth_pct} icon={Users} />
            <MetricCard title="Créditos Consumidos" value={formatNumber(kpis?.total_credits_consumed)} icon={Coins} />
            <MetricCard title="Taxa de Aprovação" value={`${(kpis?.approval_rate_pct ?? 0).toFixed(0)}%`} icon={CheckCircle2} />
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por título, categoria, cidade..." className="pl-8 h-9 bg-white text-black" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 bg-white text-black"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
                <SelectItem value="pending_review">Pendente</SelectItem>
                <SelectItem value="rejected">Rejeitado</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-[140px] h-9 bg-white text-black"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos tipos</SelectItem>
                <SelectItem value="lojista">Lojista</SelectItem>
                <SelectItem value="pessoa">Pessoa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-[140px] h-9 bg-white text-black"><SelectValue placeholder="Cidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas cidades</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
              <SelectTrigger className="w-[120px] h-9 bg-white text-black"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabela */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Anunciante</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Créditos</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum serviço encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedRow(row)}>
                      <TableCell className="font-medium max-w-[220px] truncate">{row.title}</TableCell>
                      <TableCell>{SERVICE_TYPE_LABEL_FN(row.service_type)}</TableCell>
                      <TableCell className="flex items-center gap-1.5">
                        {row.advertiser_name}
                        <KindPill kind={row.advertiser_kind} />
                      </TableCell>
                      <TableCell className="flex items-center gap-1 text-muted-foreground text-[12px]">
                        <MapPin className="w-3 h-3" /> {row.city || "—"}
                      </TableCell>
                      <TableCell><StatusPill status={row.visibility_status} /></TableCell>
                      <TableCell>{row.lead_count}</TableCell>
                      <TableCell>{row.credits_consumed}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">
                        {row.created_at ? format(new Date(row.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ServiceDetailDrawer selected={selectedRow} open={!!selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}
