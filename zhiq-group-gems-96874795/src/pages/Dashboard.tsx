import { useAuth } from '@/contexts/AuthContext';
import { useMotoboyCommission } from '@/hooks/useMotoboyCommission';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { MessageSquare, TrendingDown, Plus, Info } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const { commissionRate: backendRate, activeGroups, isLoading } = useMotoboyCommission(user?.id);
  const commissionRate = backendRate ?? 25;
  const groupCount = activeGroups ?? 0;

  const getProgressToNextTier = () => {
    if (groupCount >= 3) return 100;
    if (groupCount === 2) return 66;
    if (groupCount === 1) return 33;
    return 0;
  };

  const getNextTierInfo = () => {
    if (groupCount >= 3) return null;
    if (groupCount === 2) return { groups: 1, rate: 6 };
    if (groupCount === 1) return { groups: 1, rate: 11 };
    return { groups: 1, rate: 18 };
  };

  const nextTier = getNextTierInfo();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Bem-vindo de volta! Gerencie seus grupos e acompanhe sua taxa.
          </p>
        </div>

        {/* Commission Rate Card */}
        <Card className="border-primary/30 bg-gradient-to-br from-card to-secondary overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingDown className="h-5 w-5 text-primary" />
              Sua Taxa de Serviço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-5xl font-bold gradient-zhiq-text">
                {commissionRate}%
              </span>
            </div>

            <Progress value={getProgressToNextTier()} className="h-2 mb-3" />

            {nextTier ? (
              <p className="text-sm text-muted-foreground">
                Adicione mais <span className="text-primary font-semibold">{nextTier.groups} grupo</span> para reduzir para{' '}
                <span className="text-primary font-semibold">{nextTier.rate}%</span>
              </p>
            ) : (
              <p className="text-sm text-success">
                Parabéns! Você está na menor taxa possível.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Grupos Registrados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{groupCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Info className="h-4 w-4" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold text-success">Ativo</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/groups" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Grupo
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/rates">Ver Faixas de Taxa</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Rate Explanation */}
        <Card className="bg-secondary/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Como Funciona a Taxa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">0 grupos</span>
                <span className="font-semibold">25%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">1 grupo</span>
                <span className="font-semibold">18%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">2 grupos</span>
                <span className="font-semibold">11%</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">3+ grupos</span>
                <span className="font-semibold text-primary">6%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
