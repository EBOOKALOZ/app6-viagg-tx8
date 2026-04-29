/**
 * AdminPayDashboard — Unified Premium PAY Console
 * Tesouraria · Saques · Contas Bancárias · Extrato · Auditoria
 */
import { Landmark, Eye, Banknote, CreditCard, FileText, Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import PayKpiStrip from "@/components/admin/pay/PayKpiStrip";
import PayTreasury from "@/components/admin/pay/PayTreasury";
import PayWithdrawalsTab from "@/components/admin/pay/PayWithdrawalsTab";
import PayBankAccounts from "@/components/admin/pay/PayBankAccounts";
import PayStatement from "@/components/admin/pay/PayStatement";
import PayAuditAlerts from "@/components/admin/pay/PayAuditAlerts";
import { usePayAuditSummary } from "@/hooks/useAdminPayAudit";

const tabs = [
  { value: "overview", label: "Visão Geral", icon: Eye },
  { value: "withdrawals", label: "Saques", icon: Banknote },
  { value: "accounts", label: "Contas", icon: CreditCard },
  { value: "statement", label: "Extrato", icon: FileText },
  { value: "audit", label: "Auditoria", icon: Shield },
] as const;

export default function AdminPayDashboard() {
  const { data: auditSummary } = usePayAuditSummary();

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* ═══════════════════════════════════════════════ */}
      {/* HEADER                                         */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400/20">
            <Landmark className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">PAY</h1>
              <div className="h-6 w-px bg-border mx-1" />
              <span className="text-base font-light text-muted-foreground">Tesouraria Institucional</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">
              Núcleo financeiro · Ledger append-only · Backend-driven · Split & Treasury ready
            </p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-3.5 py-1.5 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" />
            <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wider">LIVE</span>
          </div>
          <span className="text-[9px] text-muted-foreground/50 font-medium">Auto-refresh 30s</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* KPI STRIP                                      */}
      {/* ═══════════════════════════════════════════════ */}
      <PayKpiStrip />

      {/* ═══════════════════════════════════════════════ */}
      {/* TABS                                           */}
      {/* ═══════════════════════════════════════════════ */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="border-b">
          <TabsList className="h-12 bg-transparent rounded-none p-0 gap-0 w-full justify-start">
            {tabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="relative h-12 px-5 text-[12px] font-bold text-muted-foreground rounded-none border-b-2 border-transparent 
                  data-[state=active]:border-b-emerald-500 data-[state=active]:text-foreground data-[state=active]:font-black
                  data-[state=active]:bg-transparent data-[state=active]:shadow-none
                  hover:text-foreground hover:bg-accent/30 transition-all"
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
                {value === "audit" && auditSummary && auditSummary.totalAlerts > 0 && (
                  <Badge className="absolute -top-0.5 right-1 h-4 min-w-[16px] px-1 flex items-center justify-center text-[8px] bg-red-500 text-white border-2 border-background rounded-full">
                    {auditSummary.totalAlerts}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Visão Geral ── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <PayTreasury />
        </TabsContent>

        {/* ── Saques ── */}
        <TabsContent value="withdrawals" className="mt-6">
          <PayWithdrawalsTab />
        </TabsContent>

        {/* ── Contas ── */}
        <TabsContent value="accounts" className="mt-6">
          <PayBankAccounts />
        </TabsContent>

        {/* ── Extrato ── */}
        <TabsContent value="statement" className="mt-6">
          <PayStatement />
        </TabsContent>

        {/* ── Auditoria ── */}
        <TabsContent value="audit" className="mt-6">
          <PayAuditAlerts />
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════ */}
      {/* FOOTER                                         */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="text-center py-3 border-t border-border/50">
        <p className="text-[9px] text-muted-foreground/40 font-medium tracking-wider">
          PAY v2.0 · Ledger append-only · Backend-driven · Split & Treasury ready · Reconciliação ativa
        </p>
      </div>
    </div>
  );
}
