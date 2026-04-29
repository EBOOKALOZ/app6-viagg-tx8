import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getPlatformStats } from '@/lib/api';
import { BarChart3, Users, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalGroups: number;
  usersWithZeroGroups: number;
  usersWithThreePlusGroups: number;
}

export default function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const data = await getPlatformStats();
      setStats(data);
      setIsLoading(false);
    }

    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  const avgGroups = stats?.totalUsers ? stats.totalGroups / stats.totalUsers : 0;
  const minRatePercent = stats?.totalUsers
    ? Math.round((stats.usersWithThreePlusGroups / stats.totalUsers) * 100)
    : 0;
  const maxRatePercent = stats?.totalUsers
    ? Math.round((stats.usersWithZeroGroups / stats.totalUsers) * 100)
    : 0;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estatísticas</h1>
          <p className="text-muted-foreground">
            Análise detalhada da plataforma
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Usuários
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalUsers || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Grupos
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalGroups || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Média Grupos/Usuário
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{avgGroups.toFixed(1)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Taxa Média Estimada
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {stats?.totalUsers
                  ? Math.round(
                      (stats.usersWithZeroGroups * 30 +
                        stats.usersWithThreePlusGroups * 6 +
                        (stats.totalUsers - stats.usersWithZeroGroups - stats.usersWithThreePlusGroups) * 16) /
                        stats.totalUsers
                    )
                  : 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Distribution */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Distribuição por Taxa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 30% Rate */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Taxa 30% (0 grupos)</span>
                  <span className="text-sm font-semibold">{stats?.usersWithZeroGroups || 0}</span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full transition-all"
                    style={{ width: `${maxRatePercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{maxRatePercent}% dos usuários</p>
              </div>

              {/* 6% Rate */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Taxa 6% (3+ grupos)</span>
                  <span className="text-sm font-semibold">{stats?.usersWithThreePlusGroups || 0}</span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${minRatePercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{minRatePercent}% dos usuários</p>
              </div>

              {/* Middle Rates */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Taxas intermediárias</span>
                  <span className="text-sm font-semibold">
                    {(stats?.totalUsers || 0) -
                      (stats?.usersWithZeroGroups || 0) -
                      (stats?.usersWithThreePlusGroups || 0)}
                  </span>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{
                      width: `${100 - maxRatePercent - minRatePercent}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {100 - maxRatePercent - minRatePercent}% dos usuários
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" />
                Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Engajamento</p>
                <p className="font-semibold">
                  {minRatePercent >= 50
                    ? 'Excelente! Maioria na taxa mínima.'
                    : minRatePercent >= 25
                    ? 'Bom engajamento com grupos.'
                    : 'Oportunidade de incentivar cadastro de grupos.'}
                </p>
              </div>

              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Usuários sem grupos</p>
                <p className="font-semibold">
                  {maxRatePercent > 50
                    ? 'Atenção: Muitos usuários sem grupos.'
                    : maxRatePercent > 25
                    ? 'Alguns usuários podem ser incentivados.'
                    : 'Poucos usuários na taxa máxima.'}
                </p>
              </div>

              <div className="p-4 bg-primary/10 rounded-lg border border-primary/30">
                <p className="text-sm text-muted-foreground mb-1">Recomendação</p>
                <p className="font-semibold text-primary">
                  {avgGroups < 1
                    ? 'Incentivar cadastro de grupos'
                    : avgGroups < 2
                    ? 'Mostrar benefícios de mais grupos'
                    : 'Excelente média de grupos!'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
