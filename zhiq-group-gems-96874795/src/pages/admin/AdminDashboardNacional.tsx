import { NacionalKPIs } from "@/components/admin/nacional/NacionalKPIs";
import { NacionalEconomy } from "@/components/admin/nacional/NacionalEconomy";
import { NacionalAlerts } from "@/components/admin/nacional/NacionalAlerts";
import { NacionalRegionRanking } from "@/components/admin/nacional/NacionalRegionRanking";
import { NacionalGrowthChart } from "@/components/admin/nacional/NacionalGrowthChart";

export default function AdminDashboardNacional() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          🇧🇷 Dashboard Nacional
        </h1>
        <p className="text-muted-foreground text-sm">
          Visão estratégica do sistema de expansão em tempo real
        </p>
      </div>

      <NacionalKPIs />
      <NacionalAlerts />
      <NacionalEconomy />

      <div className="grid gap-6 lg:grid-cols-2">
        <NacionalGrowthChart />
        <NacionalRegionRanking />
      </div>
    </div>
  );
}
