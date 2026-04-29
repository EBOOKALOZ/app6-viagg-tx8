import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Megaphone, Users, Shield, Clock, AlertTriangle, CheckCircle, XCircle,
  Search, RefreshCcw, BarChart3, Zap, MapPin, Send, Eye,
  TrendingDown, Activity, Globe, Target, Layers, History,
  ChevronDown, ChevronUp, ExternalLink, Filter,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useAdminPostingData,
  type AdminGroup,
  type AdminOperator,
  type RegionHealth,
} from "@/hooks/useAdminPostingData";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
const daysSince = (d: string | null | undefined): number => {
  if (!d) return 999;
  return Math.ceil((Date.now() - new Date(d).getTime()) / 86_400_000);
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }); }
  catch { return "—"; }
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  ativo: { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "Ativo" },
  em_analise: { bg: "bg-amber-500/10", text: "text-amber-600", label: "Pendente" },
  bloqueado: { bg: "bg-red-500/10", text: "text-red-600", label: "Bloqueado" },
  inativo: { bg: "bg-gray-500/10", text: "text-gray-500", label: "Inativo" },
};

// ─────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType; label: string; value: number | string; color: string; sub?: string;
}) {
  return (
    <Card className="border-0 shadow-md bg-card/90 hover:shadow-lg transition-shadow">
      <CardContent className="p-3 sm:p-4 space-y-1">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className={cn("p-1 sm:p-1.5 rounded-lg", `${color}/10`)}>
            <Icon className={cn("h-4 w-4", color)} />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        <p className="text-xl sm:text-2xl font-black text-foreground">{value}</p>
        {sub && <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// REGION HEALTH CARD
// ─────────────────────────────────────────────────────────
function RegionCard({ region }: { region: RegionHealth }) {
  const healthMap = {
    healthy: { color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Saudável", icon: CheckCircle },
    attention: { color: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Atenção", icon: AlertTriangle },
    critical: { color: "text-red-600", bg: "bg-red-500/10", border: "border-red-500/20", label: "Crítico", icon: XCircle },
  };
  const h = healthMap[region.health];
  return (
    <Card className={cn("border shadow-sm", h.border)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{region.city}</span>
          </div>
          <Badge variant="outline" className={cn("text-[10px] font-bold", h.color, h.bg, h.border)}>
            <h.icon className="h-3 w-3 mr-1" />
            {h.label}
          </Badge>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><p className="text-lg font-bold text-foreground">{region.total_groups}</p><p className="text-[9px] text-muted-foreground">Total</p></div>
          <div><p className="text-lg font-bold text-emerald-600">{region.valid_groups}</p><p className="text-[9px] text-muted-foreground">Válidos</p></div>
          <div><p className="text-lg font-bold text-amber-600">{region.pending_groups}</p><p className="text-[9px] text-muted-foreground">Pendentes</p></div>
          <div><p className="text-lg font-bold text-primary">{region.operators}</p><p className="text-[9px] text-muted-foreground">Operadores</p></div>
        </div>
        {region.at_risk > 0 && (
          <div className="flex items-center gap-1 text-orange-600 text-xs">
            <AlertTriangle className="h-3 w-3" /> {region.at_risk} em risco de expiração
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// COLLAPSIBLE SECTION
// ─────────────────────────────────────────────────────────
function Section({ title, icon: Icon, badge, defaultOpen = true, children }: {
  title: string; icon: React.ElementType; badge?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full group">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-base font-bold text-foreground tracking-tight">{title}</h2>
        {badge && <Badge variant="secondary" className="text-[10px] ml-1">{badge}</Badge>}
        <div className="flex-1" />
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────
export default function AdminPosting() {
  const {
    groups, validGroups, pendingGroups, rejectedGroups, expiredGroups, atRiskGroups,
    queue, queuePending, logs, operators, activeOperators,
    regionHealth, kpis, alerts, isLoading, refetch,
  } = useAdminPostingData();

  // Filters state
  const [groupSearch, setGroupSearch] = useState("");
  const [groupStatusFilter, setGroupStatusFilter] = useState("all");
  const [groupCityFilter, setGroupCityFilter] = useState("all");

  // Derived filter data
  const cities = useMemo(() => [...new Set(groups.map(g => g.city).filter((c): c is string => Boolean(c)))].sort(), [groups]);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => {
      if (groupStatusFilter !== "all" && g.status !== groupStatusFilter) return false;
      if (groupCityFilter !== "all" && g.city !== groupCityFilter) return false;
      if (groupSearch) {
        const q = groupSearch.toLowerCase();
        if (
          !g.city?.toLowerCase().includes(q) &&
          !g.owner_name?.toLowerCase().includes(q) &&
          !g.link?.toLowerCase().includes(q) &&
          !g.group_type?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [groups, groupStatusFilter, groupCityFilter, groupSearch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ═══════════════════════════════════════════════
          S1 — HEADER EXECUTIVO
         ═══════════════════════════════════════════════ */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
            <Megaphone className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">Central do Postador</h1>
            <Badge variant="outline" className="text-[9px] sm:text-[10px] font-bold text-primary border-primary/30 animate-pulse">
              <Activity className="h-3 w-3 mr-1" /> Ao Vivo
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground pl-8 sm:pl-10">
            Campanhas territoriais, fila operacional e saúde dos grupos
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={refetch} variant="outline" className="gap-1.5 text-xs">
            <RefreshCcw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Grupos</span> Pendentes
            {kpis.pendingGroups > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[9px] bg-amber-500 text-white">{kpis.pendingGroups}</Badge>
            )}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <Layers className="h-3.5 w-3.5" /> Fila
            {kpis.queuePending > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[9px] bg-primary text-primary-foreground">{kpis.queuePending}</Badge>
            )}
          </Button>
        </div>
      </div>

      <Separator />

      {/* ═══════════════════════════════════════════════
          S2 — KPI CARDS ESTRATÉGICOS
         ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <KpiCard icon={Globe} label="Grupos Totais" value={kpis.totalGroups} color="text-blue-500" sub={`${kpis.regionsCount} regiões cobertas`} />
        <KpiCard icon={Shield} label="Grupos Válidos" value={kpis.validGroups} color="text-emerald-500" sub="Comissão ativa" />
        <KpiCard icon={Clock} label="Pendentes Auditoria" value={kpis.pendingGroups} color="text-amber-500" sub="Aguardando revisão" />
        <KpiCard icon={Megaphone} label="Campanhas Ativas" value={kpis.activeCampaigns} color="text-purple-500" sub="Na fila de execução" />
        <KpiCard icon={Layers} label="Fila de Postagens" value={kpis.queuePending} color="text-indigo-500" sub="Itens pendentes" />
        <KpiCard icon={Users} label="Operadores Ativos" value={kpis.activeOperators} color="text-cyan-500" sub={`${operators.length} cadastrados`} />
        <KpiCard icon={MapPin} label="Regiões Cobertas" value={kpis.regionsCount} color="text-teal-500" sub={`${regionHealth.filter(r => r.health === 'healthy').length} saudáveis`} />
        <KpiCard icon={AlertTriangle} label="Risco Operacional" value={kpis.atRiskGroups + kpis.expiredGroups} color="text-red-500" sub={`${kpis.atRiskGroups} em risco · ${kpis.expiredGroups} expirados`} />
      </div>

      {/* ═══════════════════════════════════════════════
          S7 — ALERTAS E PENDÊNCIAS (before details)
         ═══════════════════════════════════════════════ */}
      {alerts.length > 0 && (
        <Section title="Alertas Operacionais" icon={AlertTriangle} badge={`${alerts.length}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
            {alerts.map((a, i) => (
              <Card key={i} className={cn(
                "border shadow-sm",
                a.type === "danger" ? "border-red-500/30 bg-red-500/5" :
                  a.type === "warning" ? "border-amber-500/30 bg-amber-500/5" :
                    "border-blue-500/30 bg-blue-500/5"
              )}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0",
                    a.type === "danger" ? "bg-red-500/10 text-red-600" :
                      a.type === "warning" ? "bg-amber-500/10 text-amber-600" :
                        "bg-blue-500/10 text-blue-600"
                  )}>
                    {a.count}
                  </div>
                  <div className="flex-1">
                    <p className={cn(
                      "text-sm font-bold",
                      a.type === "danger" ? "text-red-700 dark:text-red-400" :
                        a.type === "warning" ? "text-amber-700 dark:text-amber-400" :
                          "text-blue-700 dark:text-blue-400"
                    )}>
                      {a.label}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-xs shrink-0">
                    Ver →
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════════
          S3 — SAÚDE OPERACIONAL POR REGIÃO
         ═══════════════════════════════════════════════ */}
      <Section title="Saúde Regional" icon={Activity} badge={`${regionHealth.length} regiões`}>
        {regionHealth.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="py-10 text-center">
              <Globe className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhuma região com grupos cadastrados</p>
              <p className="text-xs text-muted-foreground mt-1">As regiões aparecerão conforme grupos forem vinculados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {regionHealth.slice(0, 9).map(r => (
              <RegionCard key={r.city} region={r} />
            ))}
          </div>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════
          S4 — GESTÃO DE GRUPOS
         ═══════════════════════════════════════════════ */}
      <Section title="Gestão de Grupos" icon={Shield} badge={`${groups.length} total`}>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cidade, operador, link..."
              value={groupSearch}
              onChange={e => setGroupSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Select value={groupStatusFilter} onValueChange={setGroupStatusFilter}>
              <SelectTrigger className="w-[150px] h-9 text-sm">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="em_analise">Pendentes</SelectItem>
                <SelectItem value="bloqueado">Bloqueados</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupCityFilter} onValueChange={setGroupCityFilter}>
              <SelectTrigger className="w-[140px] sm:w-[170px] h-9 text-xs sm:text-sm">
                <MapPin className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Cidades</SelectItem>
                {cities.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        {filteredGroups.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="py-10 text-center">
              <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum grupo encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou aguarde novos cadastros</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm overflow-hidden">
            <ScrollArea className="max-h-[500px]">
              <div className="min-w-[800px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Cidade / Tipo</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Operador</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Status</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Membros</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Última Postagem</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Criado em</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredGroups.slice(0, 50).map(g => {
                      const sc = statusColors[g.status] || statusColors.inativo;
                      const inactive = daysSince(g.last_posted_at);
                      const isRisk = g.status === "ativo" && inactive > 20 && inactive <= 30;
                      const isExpired = g.status === "ativo" && inactive > 30;
                      return (
                        <tr key={g.id} className={cn("hover:bg-muted/30 transition-colors", isExpired && "bg-red-500/5", isRisk && "bg-amber-500/5")}>
                          <td className="p-3">
                            <p className="font-semibold text-foreground">{g.city}</p>
                            <p className="text-[10px] text-muted-foreground">{g.group_type}</p>
                          </td>
                          <td className="p-3">
                            <p className="text-sm text-foreground">{g.owner_name || "—"}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{g.owner_email || ""}</p>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={cn("text-[10px] font-bold", sc.text, sc.bg)}>
                              {sc.label}
                            </Badge>
                            {isRisk && (
                              <Badge variant="outline" className="text-[9px] ml-1 text-orange-600 bg-orange-500/10 border-orange-500/20">
                                Risco
                              </Badge>
                            )}
                            {isExpired && (
                              <Badge variant="outline" className="text-[9px] ml-1 text-red-600 bg-red-500/10 border-red-500/20">
                                Expirado
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={cn("text-sm font-medium", g.min_members_valid ? "text-emerald-600" : "text-red-500")}>
                              {g.min_members_valid ? "✅ 90+" : "❌ <90"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={cn(
                              "text-xs",
                              inactive > 30 ? "text-red-500 font-bold" : inactive > 20 ? "text-amber-600 font-medium" : "text-muted-foreground"
                            )}>
                              {inactive === 999 ? "Nunca" : `${inactive}d atrás`}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">{fmtDate(g.created_at)}</td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              {g.link && (
                                <a href={g.link} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 border rounded-md hover:bg-muted text-muted-foreground">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {g.status === "em_analise" && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-500/10">
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
            {filteredGroups.length > 50 && (
              <div className="px-4 py-2 text-center text-xs text-muted-foreground border-t">
                Mostrando 50 de {filteredGroups.length} grupos
              </div>
            )}
          </Card>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════
          S5 — FILA DE POSTAGEM
         ═══════════════════════════════════════════════ */}
      <Section title="Fila de Postagens" icon={Layers} badge={`${queue.length}`} defaultOpen={false}>
        {queue.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="py-10 text-center">
              <Send className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Fila vazia</p>
              <p className="text-xs text-muted-foreground mt-1">Crie uma campanha para popular a fila operacional</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm overflow-hidden">
            <ScrollArea className="max-h-[400px]">
              <div className="min-w-[700px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">ID</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Campanha</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Status</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Agendado</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Executado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {queue.slice(0, 30).map(q => (
                      <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-xs font-mono text-muted-foreground">{q.id.slice(0, 8)}</td>
                        <td className="p-3 text-sm text-foreground">{q.campaign_id?.slice(0, 12) || "—"}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={cn(
                            "text-[10px] font-bold",
                            q.status === "completed" ? "text-emerald-600 bg-emerald-500/10" :
                              q.status === "pending" || q.status === "scheduled" ? "text-amber-600 bg-amber-500/10" :
                                q.status === "cancelled" ? "text-red-600 bg-red-500/10" :
                                  "text-muted-foreground bg-muted"
                          )}>
                            {q.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{fmtDate(q.scheduled_at)}</td>
                        <td className="p-3 text-xs text-muted-foreground">{fmtDate(q.executed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </Card>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════
          S6 — POSTADORES / OPERADORES
         ═══════════════════════════════════════════════ */}
      <Section title="Postadores / Operadores" icon={Users} badge={`${operators.length}`} defaultOpen={false}>
        {operators.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="py-10 text-center">
              <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum operador encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">Os operadores aparecerão conforme cadastrarem grupos</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm overflow-hidden">
            <ScrollArea className="max-h-[400px]">
              <div className="min-w-[650px]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">#</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Nome</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Região</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Grupos</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Postagens</th>
                      <th className="p-3 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {operators
                      .sort((a, b) => b.groups_count - a.groups_count)
                      .slice(0, 30)
                      .map((op, idx) => (
                        <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <span className={cn(
                              "inline-flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold",
                              idx === 0 ? "bg-amber-500 text-white" :
                                idx === 1 ? "bg-gray-400 text-white" :
                                  idx === 2 ? "bg-orange-600 text-white" :
                                    "bg-muted text-muted-foreground"
                            )}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="p-3">
                            <p className="font-semibold text-foreground">{op.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{op.email}</p>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">{op.city || "—"}</td>
                          <td className="p-3">
                            <span className="text-sm font-bold text-foreground">{op.groups_count}</span>
                          </td>
                          <td className="p-3">
                            <span className="text-sm text-foreground">{op.postings_count}</span>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={cn(
                              "text-[10px] font-bold",
                              op.groups_count > 0 ? "text-emerald-600 bg-emerald-500/10" : "text-gray-500 bg-gray-500/10"
                            )}>
                              {op.groups_count > 0 ? "Ativo" : "Inativo"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </Card>
        )}
      </Section>

      {/* ═══════════════════════════════════════════════
          S8 — HISTÓRICO / LOGS
         ═══════════════════════════════════════════════ */}
      <Section title="Atividade Recente" icon={History} badge={`${logs.length}`} defaultOpen={false}>
        {logs.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent">
            <CardContent className="py-10 text-center">
              <History className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhuma atividade registrada</p>
              <p className="text-xs text-muted-foreground mt-1">Os logs de postagem e auditoria aparecerão aqui</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[350px]">
                <div className="divide-y divide-border">
                  {logs.slice(0, 30).map(log => (
                    <div key={log.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                        log.status === "postado" ? "bg-emerald-500/10" :
                          log.status === "erro" ? "bg-red-500/10" :
                            "bg-muted"
                      )}>
                        {log.status === "postado" ? (
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        ) : log.status === "erro" ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {log.message?.substring(0, 60) || "Postagem executada"}
                          {log.message && log.message.length > 60 ? "..." : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Grupo {log.group_id?.slice(0, 8)} · {fmtDate(log.posted_at)}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn(
                        "text-[9px] shrink-0",
                        log.status === "postado" ? "text-emerald-600" : "text-red-500"
                      )}>
                        {log.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </Section>

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  );
}
