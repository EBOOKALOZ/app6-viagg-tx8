import { ExpansionMetricsCard } from "@/components/admin/expansion/ExpansionMetricsCard";
import { CommissionDistributionCard } from "@/components/admin/expansion/CommissionDistributionCard";
import { RegionalEngagementCard } from "@/components/admin/expansion/RegionalEngagementCard";
import { GroupMonitoringCard } from "@/components/admin/expansion/GroupMonitoringCard";
import { TerritorialRadarCard } from "@/components/admin/expansion/TerritorialRadarCard";
import { ExpansionConfigCard } from "@/components/admin/expansion/ExpansionConfigCard";

export default function AdminExpansao() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          🌍 Central de Expansão Nacional
        </h1>
        <p className="text-muted-foreground">
          Gestão estratégica de grupos, comissão dinâmica e impacto territorial.
        </p>
      </div>
      <ExpansionMetricsCard />
      <CommissionDistributionCard />
      <RegionalEngagementCard />
      <GroupMonitoringCard />
      <TerritorialRadarCard />
      <ExpansionConfigCard />
    </div>
  );
}
