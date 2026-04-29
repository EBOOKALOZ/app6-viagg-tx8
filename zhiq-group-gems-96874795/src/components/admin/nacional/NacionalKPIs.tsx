import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, CheckCircle, Shield, Clock, Send, AlertTriangle } from "lucide-react";

function useGrowthKPIs() {
  return useQuery({
    queryKey: ['admin-growth-kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_admin_growth_kpis')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });
}

function useActiveRegions() {
  return useQuery({
    queryKey: ['admin-active-regions-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('active_regions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30000,
  });
}

function useProfileCounts() {
  return useQuery({
    queryKey: ['admin-profile-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('active_profile')
        .not('active_profile', 'is', null);
      if (error) throw error;
      return data?.length ?? 0;
    },
    staleTime: 60000,
  });
}

function formatNumber(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat('pt-BR').format(Number(value));
}

interface KPICardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  subtitle?: string;
}

function KPICard({ title, value, icon, variant = 'default', subtitle }: KPICardProps) {
  const styles = {
    default: 'border-border',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    danger: 'border-red-500/30 bg-red-500/5',
  };

  return (
    <Card className={`${styles[variant]} shadow-lg transition-all hover:shadow-xl`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export function NacionalKPIs() {
  const { data: kpis, isLoading: kpisLoading } = useGrowthKPIs();
  const { data: activeRegions, isLoading: regionsLoading } = useActiveRegions();
  const { data: totalProfiles, isLoading: profilesLoading } = useProfileCounts();
  const isLoading = kpisLoading || regionsLoading || profilesLoading;

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {[...Array(8)].map((_, i) => (
          <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-20" /></CardHeader><CardContent><Skeleton className="h-8 w-14" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
      <KPICard title="Regiões Ativas" value={formatNumber(activeRegions)} icon={<Shield className="h-5 w-5" />} variant="success" />
      <KPICard title="Perfis Ativos" value={formatNumber(totalProfiles)} icon={<Users className="h-5 w-5" />} />
      <KPICard title="Total Grupos" value={formatNumber(kpis?.total_groups)} icon={<Users className="h-5 w-5" />} />
      <KPICard title="Grupos Ativos" value={formatNumber(kpis?.active_groups)} icon={<CheckCircle className="h-5 w-5" />} variant="success" />
      <KPICard title="Autorizados" value={formatNumber(kpis?.authorized_groups)} icon={<Shield className="h-5 w-5" />} variant="success" />
      <KPICard title="Elegíveis Hoje" value={formatNumber(kpis?.eligible_now_authorized)} icon={<Clock className="h-5 w-5" />} variant="warning" />
      <KPICard title="Enviados Hoje" value={formatNumber(kpis?.sent_today)} icon={<Send className="h-5 w-5" />} />
      <KPICard
        title="Erros Hoje"
        value={formatNumber(kpis?.errors_today)}
        icon={<AlertTriangle className="h-5 w-5" />}
        variant={Number(kpis?.errors_today || 0) > 10 ? 'danger' : 'default'}
      />
    </div>
  );
}
