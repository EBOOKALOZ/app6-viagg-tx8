import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Bike, Store, Car, Truck, Zap, Flag, Users } from "lucide-react";
import { useParams } from "react-router-dom";
import { MerchantGrowth } from "@/components/admin/MerchantGrowth";
import { MerchantPackageStats } from "@/components/admin/MerchantPackageStats";
import { MerchantCreditBuyers } from "@/components/admin/MerchantCreditBuyers";
import { MotoboyFinanceStats } from "@/components/admin/MotoboyFinanceStats";
import AdminMerchantInvoices from "@/pages/admin/AdminMerchantInvoices";

const profileMeta: Record<string, { label: string; icon: React.ElementType; profileKey: string }> = {
  motoboys: { label: 'Motoboys', icon: Bike, profileKey: 'motoboy' },
  lojistas: { label: 'Lojistas', icon: Store, profileKey: 'merchant' },
  passageiros: { label: 'Passageiros', icon: Car, profileKey: 'passenger' },
  motoristas: { label: 'Motoristas', icon: Truck, profileKey: 'driver' },
  mototaxi: { label: 'Moto-Táxi', icon: Zap, profileKey: 'mototaxi' },
  fretes: { label: 'Fretes', icon: Flag, profileKey: 'freteiro' },
};

export default function AdminMultiPerfil() {
  const { profileType = 'motoboys' } = useParams<{ profileType: string }>();
  const meta = profileMeta[profileType] || profileMeta.motoboys;
  const Icon = meta.icon;

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['admin-profile-count', meta.profileKey],
    queryFn: async () => {
      let error = null;

      if (meta.profileKey === 'merchant') {
        const { data: stores, error: storesErr } = await (supabase.from('merchant_stores') as any)
          .select('user_id, cidade, city, estado, region, status');

        error = storesErr;
        if (error) throw error;

        const isActiveStatus = (s: any) => {
          const v = (s || '').toString().toLowerCase().trim();
          return !v || v === 'ativo' || v === 'active';
        };

        const totalLojistas = stores?.length || 0;
        const totalAtivos = (stores || []).filter((m: any) => isActiveStatus(m.status)).length;

        const citiesMap = new Map<string, number>();
        (stores || []).forEach((m: any) => {
          const cidade = m.cidade || m.city;
          if (cidade) {
            const key = `${cidade}${m.estado || m.region ? ` - ${m.estado || m.region}` : ''}`;
            citiesMap.set(key, (citiesMap.get(key) || 0) + 1);
          }
        });

        const totalCidades = citiesMap.size;
        const densidadeMedia = totalCidades > 0 ? totalLojistas / totalCidades : 0;

        const distribuicao_cidades = Array.from(citiesMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        return {
          isMerchant: true,
          totalAtivos,
          totalLojistas,
          totalCidades,
          densidadeMedia,
          percentualCrescimento: 0,
          byCity: distribuicao_cidades,
        };
      } else {
        const result = await supabase
          .from('profiles')
          .select('cidade, estado')
          .contains('available_profiles', [meta.profileKey]);

        const data = result.data;
        error = result.error;

        if (error) throw error;

        const byCity: Record<string, number> = {};
        (data || []).forEach(p => {
          const key = p.cidade ? `${p.cidade} - ${p.estado || ''}` : 'Sem cidade';
          byCity[key] = (byCity[key] || 0) + 1;
        });

        return {
          isMerchant: false,
          total: data?.length || 0,
          byCity: Object.entries(byCity)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 20)
            .map(([name, value]) => ({ name, value })),
        };
      }
    },
    staleTime: 9_000,
    refetchInterval: 9_000,
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Icon className="h-8 w-8 text-primary" />
          {meta.label}
        </h1>
        <p className="text-muted-foreground text-sm">
          Distribuição territorial e métricas do perfil {meta.label}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Lojistas Cards */}
        {profiles?.isMerchant ? (
          <>
            <Card className="shadow-lg border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider">Total Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-10 w-20" /> : (
                  <div className="text-4xl font-bold text-primary">{profiles?.totalAtivos || 0}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Lojas ativas na plataforma</p>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider">Cidades</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-10 w-20" /> : (
                  <div className="text-4xl font-bold">{profiles?.totalCidades || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider">Densidade Média</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-10 w-20" /> : (
                  <div className="text-4xl font-bold">
                    {profiles?.densidadeMedia ? profiles.densidadeMedia.toFixed(1) : 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">por cidade</p>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Generic Cards */
          <>
            <Card className="shadow-lg border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider">Total Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-10 w-20" /> : (
                  <div className="text-4xl font-bold text-primary">{profiles?.total || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider">Cidades</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-10 w-20" /> : (
                  <div className="text-4xl font-bold">{profiles?.byCity?.length || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase text-muted-foreground tracking-wider">Densidade Média</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-10 w-20" /> : (
                  <div className="text-4xl font-bold">
                    {profiles && profiles.byCity && profiles.byCity.length > 0
                      ? (profiles.total / profiles.byCity.length).toFixed(1)
                      : 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">por cidade</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Distribuição por Cidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : profiles?.byCity && profiles.byCity.length > 0 ? (
            <div className="space-y-3">
              {profiles.isMerchant ? (
                // Lojistas distribution array is an array of { name, value }
                profiles.byCity.map((item: any, idx: number) => (
                  <div key={item.name || idx} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-6 text-right font-bold">{idx + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{item.name}</span>
                        <Badge variant="outline">{item.value}</Badge>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min((item.value / (profiles?.totalLojistas || 1)) * 100 * 5, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                // Generic distribution array is an array of { name, value }
                profiles.byCity.map((item: any, idx: number) => (
                  <div key={item.name || idx} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-6 text-right font-bold">{idx + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{item.name}</span>
                        <Badge variant="outline">{item.value}</Badge>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min((item.value / (profiles?.total || 1)) * 100 * 5, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum perfil encontrado</p>
          )}
        </CardContent>
      </Card>

      {/* Bloco financeiro exclusivo para Motoboys */}
      {meta.profileKey === 'motoboy' && (
        <div className="space-y-6">
          <MotoboyFinanceStats />
        </div>
      )}

      {/* Bloco de Crescimento Exclusivo para Lojistas */}
      {meta.profileKey === 'merchant' && (
        <div className="space-y-6">
          <MerchantPackageStats />
          <MerchantCreditBuyers />
          <MerchantGrowth />
          <AdminMerchantInvoices />
        </div>
      )}

    </div>
  );
}
