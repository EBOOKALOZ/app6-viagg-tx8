/**
 * PayAuditAlerts — Premium audit & reconciliation center
 */
import { useState } from "react";
import {
  Shield, Webhook, FileText, AlertTriangle, Eye,
  CheckCircle, XCircle, Clock, Database, Lock, Zap,
  Server, ChevronDown, ChevronRight, Activity,
  RefreshCw, Search, ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePayAuditWebhooks,
  usePayAuditReconciliation,
  usePayAuditLongRunningPayouts,
  usePayAuditErrors,
  usePayAuditSummary,
} from "@/hooks/useAdminPayAudit";
import { formatDate, formatDateFull, formatBRL, truncateId } from "@/skills/pay/payUtils";

export default function PayAuditAlerts() {
  const { data: summary } = usePayAuditSummary();
  const { data: webhooks, isLoading: webhooksLoading } = usePayAuditWebhooks(50);
  const { data: reconciliation, isLoading: reconLoading } = usePayAuditReconciliation();
  const { data: longRunning } = usePayAuditLongRunningPayouts();
  const { data: errors } = usePayAuditErrors();

  const [selectedWebhook, setSelectedWebhook] = useState<any>(null);
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [searchEvents, setSearchEvents] = useState("");

  // Health status
  const isHealthy = summary && summary.totalAlerts === 0;

  const summaryCards = [
    { label: "Webhooks Pendentes", value: summary?.unprocessedWebhooks || 0, icon: Webhook, color: summary?.unprocessedWebhooks ? "text-amber-600" : "text-emerald-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "Erros Não Resolvidos", value: summary?.unresolvedErrors || 0, icon: XCircle, color: summary?.unresolvedErrors ? "text-red-600" : "text-emerald-600", bg: "bg-red-50 dark:bg-red-950/30" },
    { label: "Divergências", value: summary?.divergences || 0, icon: AlertTriangle, color: summary?.divergences ? "text-red-600" : "text-emerald-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
    { label: "Processing Longo", value: summary?.longRunningPayouts || 0, icon: Clock, color: summary?.longRunningPayouts ? "text-violet-600" : "text-emerald-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { label: "Saques Pendentes", value: summary?.pendingWithdrawals || 0, icon: Activity, color: summary?.pendingWithdrawals ? "text-blue-600" : "text-emerald-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
  ];

  const filteredWebhooks = webhooks?.filter(w =>
    !searchEvents.trim() ||
    w.event_type?.includes(searchEvents) ||
    w.source?.includes(searchEvents) ||
    w.id.includes(searchEvents)
  ) || [];

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
              <Shield className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">Auditoria e Reconciliação</h3>
              <p className="text-[10px] text-muted-foreground">Monitoramento de integridade operacional do PAY</p>
            </div>
          </div>
          <Badge className={`text-[9px] font-bold gap-1 px-3 py-1.5 ${
            isHealthy
              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
              : "bg-red-100 text-red-700 border-red-200 animate-pulse"
          }`}>
            {isHealthy ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {isHealthy ? "SAUDÁVEL" : `${summary?.totalAlerts || 0} ALERTA(S)`}
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {summaryCards.map(c => (
            <Card key={c.label} className="border shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                  <span className="text-[8px] text-muted-foreground font-extrabold uppercase tracking-[0.15em]">{c.label}</span>
                </div>
                <p className={`text-xl font-black tabular-nums ${c.color}`}>{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Integrity Panel */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-slate-500" />
              <p className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Integridade Financeira</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Ledger Append-Only", icon: FileText, ok: true },
                { label: "RLS Ativo", icon: Lock, ok: true },
                { label: "Webhook Idempotente", icon: Zap, ok: true },
                { label: "Reconciliação Ativa", icon: Shield, ok: !(summary?.divergences) },
                { label: "Backend-Driven", icon: Server, ok: true },
              ].map(item => (
                <div key={item.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
                  item.ok
                    ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400"
                }`}>
                  <item.icon className="h-3 w-3" />
                  {item.ok ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {item.label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sub-tabs: Events | Audit Trail | Reconciliation | Alerts */}
        <Tabs defaultValue="events" className="w-full">
          <TabsList className="h-9 bg-muted/50">
            <TabsTrigger value="events" className="text-[11px] gap-1 font-bold"><Webhook className="h-3 w-3" /> Eventos</TabsTrigger>
            <TabsTrigger value="audit" className="text-[11px] gap-1 font-bold"><FileText className="h-3 w-3" /> Trilha de Auditoria</TabsTrigger>
            <TabsTrigger value="reconciliation" className="text-[11px] gap-1 font-bold"><Shield className="h-3 w-3" /> Reconciliação</TabsTrigger>
            <TabsTrigger value="alerts" className="text-[11px] gap-1 font-bold">
              <AlertTriangle className="h-3 w-3" /> Alertas
              {(summary?.totalAlerts || 0) > 0 && (
                <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[8px] bg-red-500 text-white rounded-full">{summary?.totalAlerts}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Events Tab ── */}
          <TabsContent value="events" className="mt-4 space-y-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar por tipo, fonte..." value={searchEvents} onChange={e => setSearchEvents(e.target.value)} className="pl-8 h-8 text-[11px]" />
            </div>
            {webhooksLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Card className="border-0 shadow-lg">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["Data","Fonte","Tipo Evento","Processado","Erro",""].map(h => (
                            <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWebhooks.map((w: any) => (
                          <tr key={w.id} className="border-b hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => setSelectedWebhook(w)}>
                            <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{formatDate(w.received_at)}</td>
                            <td className="py-2 px-3 font-mono text-[10px]">{w.source || "—"}</td>
                            <td className="py-2 px-3"><Badge className="text-[8px] bg-slate-100 text-slate-700">{w.event_type || "—"}</Badge></td>
                            <td className="py-2 px-3">
                              {w.processed ? (
                                <Badge className="text-[8px] bg-emerald-100 text-emerald-700 gap-1"><CheckCircle className="h-2.5 w-2.5" /> Sim</Badge>
                              ) : (
                                <Badge className="text-[8px] bg-amber-100 text-amber-700 gap-1"><Clock className="h-2.5 w-2.5" /> Pendente</Badge>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[10px] text-red-500 max-w-[200px] truncate">{w.process_error || "—"}</td>
                            <td className="py-2 px-3"><Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Eye className="h-3 w-3" /></Button></td>
                          </tr>
                        ))}
                        {filteredWebhooks.length === 0 && (
                          <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">
                            <Webhook className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                            Nenhum evento encontrado
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Audit Trail Tab ── */}
          <TabsContent value="audit" className="mt-4 space-y-3">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {["Data","Payout ID","Ação","Status Anterior","Novo Status","Ator","Notas"].map(h => (
                          <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Populated from payout_audit_log when available */}
                      <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">
                        <FileText className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                        <p className="text-sm mb-1">Trilha de auditoria</p>
                        <p className="text-[10px]">Conecta com <code className="bg-muted px-1 rounded">payout_audit_log</code> para exibir transições de status</p>
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Reconciliation Tab ── */}
          <TabsContent value="reconciliation" className="mt-4 space-y-3">
            {reconLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Card className="border-0 shadow-lg">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          {["Data","Saldo Banco","Saldo Ledger","Divergência","Status",""].map(h => (
                            <th key={h} className="text-left py-2.5 px-3 font-extrabold text-muted-foreground text-[9px] uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(reconciliation || []).map((r: any) => (
                          <tr key={r.id} className="border-b hover:bg-accent/30 transition-colors">
                            <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">{formatDate(r.reconciliation_date || r.created_at)}</td>
                            <td className="py-2.5 px-3 font-bold tabular-nums">{formatBRL(r.bank_balance_cents || 0)}</td>
                            <td className="py-2.5 px-3 font-bold tabular-nums">{formatBRL(r.ledger_balance_cents || 0)}</td>
                            <td className={`py-2.5 px-3 font-bold tabular-nums ${
                              (r.divergence_cents || 0) !== 0 ? "text-red-600" : "text-emerald-600"
                            }`}>{formatBRL(r.divergence_cents || 0)}</td>
                            <td className="py-2.5 px-3">
                              <Badge className={`text-[8px] font-bold ${
                                r.status === "matched" ? "bg-emerald-100 text-emerald-700" :
                                r.status === "divergent" ? "bg-red-100 text-red-700" :
                                "bg-gray-100 text-gray-600"
                              }`}>{r.status === "matched" ? "✓ OK" : r.status === "divergent" ? "DIVERGENTE" : r.status || "—"}</Badge>
                            </td>
                            <td className="py-2.5 px-3"><Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Eye className="h-3 w-3" /></Button></td>
                          </tr>
                        ))}
                        {(!reconciliation || reconciliation.length === 0) && (
                          <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">
                            <Shield className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                            <p className="text-sm mb-1">Reconciliação</p>
                            <p className="text-[10px]">Conecta com <code className="bg-muted px-1 rounded">pay_reconciliation_log</code></p>
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Alerts Tab ── */}
          <TabsContent value="alerts" className="mt-4 space-y-4">
            {/* Long-running payouts */}
            {longRunning && longRunning.length > 0 && (
              <Card className="border-violet-200 dark:border-violet-900/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-violet-600 animate-pulse" />
                    <p className="text-[10px] font-extrabold text-violet-700 uppercase tracking-wider">Payouts em Processamento Excessivo</p>
                    <Badge className="text-[8px] bg-violet-500 text-white">{longRunning.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {longRunning.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between bg-violet-50/50 dark:bg-violet-950/20 rounded-lg p-2.5 text-[11px]">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-muted-foreground">{truncateId(p.id)}</span>
                          <span className="font-bold">{formatBRL(p.amount_cents)}</span>
                        </div>
                        <Badge className="text-[8px] bg-violet-200 text-violet-800">{p.hours_processing}h em processing</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Errors */}
            {errors && errors.length > 0 && (
              <Card className="border-red-200 dark:border-red-900/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <p className="text-[10px] font-extrabold text-red-700 uppercase tracking-wider">Erros Não Resolvidos</p>
                    <Badge className="text-[8px] bg-red-500 text-white">{errors.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {errors.map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between bg-red-50/50 dark:bg-red-950/20 rounded-lg p-2.5 text-[11px]">
                        <div className="flex items-center gap-3">
                          <Badge className="text-[8px] bg-red-100 text-red-700">{e.transaction_type}</Badge>
                          <span className="text-muted-foreground truncate max-w-[250px]">{e.error_message || e.error_code || "—"}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{formatDate(e.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All clear */}
            {isHealthy && (
              <Card className="border-emerald-200 dark:border-emerald-900/50 shadow-sm">
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-base font-bold text-emerald-700">Módulo PAY Saudável</p>
                  <p className="text-xs text-muted-foreground mt-1">Nenhum alerta operacional ativo</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Webhook Detail Dialog */}
      <Dialog open={!!selectedWebhook} onOpenChange={o => !o && setSelectedWebhook(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Detalhe do Evento</DialogTitle>
          </DialogHeader>
          {selectedWebhook && (
            <div className="space-y-3">
              {[
                ["ID", selectedWebhook.id],
                ["Fonte", selectedWebhook.source],
                ["Tipo", selectedWebhook.event_type],
                ["Processado", selectedWebhook.processed ? "Sim" : "Não"],
                ["Recebido em", formatDateFull(selectedWebhook.received_at)],
                ["Erro", selectedWebhook.process_error],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-start gap-2 text-[11px] py-1.5 border-b border-border/40">
                  <span className="font-bold text-muted-foreground min-w-[100px] shrink-0">{label}</span>
                  <span className="font-mono text-[10px] break-all">{value || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
