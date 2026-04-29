import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminCredits } from "@/hooks/useAdminCredits";
import { Loader2, Coins, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminCreditsOverview } from "@/components/admin/credits/AdminCreditsOverview";
import { AdminCreditsPackages } from "@/components/admin/credits/AdminCreditsPackages";
import { AdminCreditsSubscriptions } from "@/components/admin/credits/AdminCreditsSubscriptions";
import { AdminCreditsBalances } from "@/components/admin/credits/AdminCreditsBalances";
import { AdminCreditsLedger } from "@/components/admin/credits/AdminCreditsLedger";
import { AdminCreditsEvents } from "@/components/admin/credits/AdminCreditsEvents";
import { AdminCreditsAudit } from "@/components/admin/credits/AdminCreditsAudit";

export default function AdminCreditsModule() {
  const data = useAdminCredits();
  const [tab, setTab] = useState("overview");

  if (data.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-muted-foreground">Carregando módulo de créditos…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <Coins className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(var(--admin-card-foreground, var(--foreground)))" }}>
              Créditos e Monetização
            </h1>
            <p className="text-sm" style={{ color: "hsl(var(--admin-muted-foreground, var(--muted-foreground)))" }}>
              Gestão completa de créditos, pacotes, assinaturas e auditoria
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={data.refetch} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7 h-auto p-1 bg-muted/50 rounded-xl">
          {[
            { value: "overview", label: "Visão Geral" },
            { value: "packages", label: "Pacotes" },
            { value: "subscriptions", label: "Assinaturas" },
            { value: "balances", label: "Saldos" },
            { value: "ledger", label: "Extrato" },
            { value: "events", label: "Eventos" },
            { value: "audit", label: "Auditoria" },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="text-xs sm:text-sm py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"><AdminCreditsOverview data={data} /></TabsContent>
        <TabsContent value="packages"><AdminCreditsPackages data={data} /></TabsContent>
        <TabsContent value="subscriptions"><AdminCreditsSubscriptions data={data} /></TabsContent>
        <TabsContent value="balances"><AdminCreditsBalances data={data} /></TabsContent>
        <TabsContent value="ledger"><AdminCreditsLedger data={data} /></TabsContent>
        <TabsContent value="events"><AdminCreditsEvents data={data} /></TabsContent>
        <TabsContent value="audit"><AdminCreditsAudit data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}
