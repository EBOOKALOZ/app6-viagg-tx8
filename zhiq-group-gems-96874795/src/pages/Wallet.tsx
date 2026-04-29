import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Wallet as WalletIcon,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  Bike,
  Car,
  Truck,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Hourglass
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnifiedWalletViews, WalletStatement } from "@/hooks/useUnifiedWalletViews";

const PROFILE_ICONS: Record<string, React.ElementType> = {
  motoboy: Bike,
  merchant: Building2,
  driver: Car,
  freight: Truck,
  passenger: Users,
};

const PROFILE_LABELS: Record<string, string> = {
  motoboy: "Motoboy",
  merchant: "Lojista",
  driver: "Motorista",
  freight: "Freteiro",
  passenger: "Passageiro",
};

export default function Wallet() {
  const navigate = useNavigate();
  const {
    overview,
    statement,
    payouts,
    isLoading,
    error,
    filterProfile,
    setFilterProfile,
    fetchWalletData,
    metrics
  } = useUnifiedWalletViews();

  const [activeTab, setActiveTab] = useState<'statement' | 'payouts'>('statement');

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(cents / 100);
  };

  const formatDate = (isoString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(isoString));
  };

  const isCurrentlyLoading = isLoading && !overview;

  const renderStatementItem = (item: WalletStatement) => {
    const isCredit = item.direction === 'credit';
    const Icon = PROFILE_ICONS[item.profile_type] || WalletIcon;
    const profileName = PROFILE_LABELS[item.profile_type] || item.profile_type;

    let title = "";
    if (item.source_type === 'delivery') title = `Entrega #${item.source_id?.substring(0, 4) || '??'}`;
    else if (item.source_type === 'ride') title = `Corrida #${item.source_id?.substring(0, 4) || '??'}`;
    else if (item.source_type === 'payout') title = "Saque PIX";
    else if (item.source_type === 'deposit') title = "Depósito";
    else title = "Movimentação";

    return (
      <div key={item.id} className="flex items-center justify-between p-4 border-b border-border hover:bg-muted/50 transition-colors">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCredit ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {isCredit ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">{title}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <Icon className="h-3 w-3" />
              <span>{profileName}</span>
              <span className="mx-1">•</span>
              <span>{formatDate(item.created_at)}</span>
            </div>
          </div>
        </div>
        <div className={`font-bold tabular-nums ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
          {isCredit ? '+' : '-'}{formatCurrency(item.amount_cents)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between w-full px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold">Carteira Unificada</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchWalletData()}
            disabled={isLoading}
            className="flex gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar carteira
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="pt-20 pb-20 px-4 space-y-6 max-w-3xl mx-auto w-full">

        {error && (
          <Alert className="border-red-500/50 bg-red-950/30 text-red-400">
            <AlertCircle className="h-5 w-5 mb-1" />
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* 1. Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Available Balance */}
          <Card className="bg-primary text-primary-foreground border-0 shadow-md relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10"><WalletIcon className="h-24 w-24" /></div>
            <CardContent className="p-5 relative z-10">
              <p className="text-xs font-medium uppercase tracking-wide opacity-80 mb-1">Saldo Disponível</p>
              {isCurrentlyLoading ? (
                <Skeleton className="h-8 w-32 bg-white/20" />
              ) : (
                <p className="text-3xl font-black tabular-nums">
                  {formatCurrency(overview?.available_balance || 0)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Processing Balance */}
          <Card className="bg-emerald-50 text-emerald-900 border-emerald-100 shadow-sm relative overflow-hidden dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-900">
            <div className="absolute -right-4 -top-4 opacity-[0.05]"><Clock className="h-24 w-24" /></div>
            <CardContent className="p-5 relative z-10">
              <p className="text-xs font-medium uppercase tracking-wide opacity-80 mb-1">Em Processamento</p>
              {isCurrentlyLoading ? (
                <Skeleton className="h-8 w-32 bg-emerald-900/20 dark:bg-emerald-100/20" />
              ) : (
                <p className="text-2xl font-bold tabular-nums">
                  {formatCurrency(overview?.processing_balance || 0)}
                </p>
              )}
              <p className="text-[10px] opacity-70 mt-1">Entregas em andamento</p>
            </CardContent>
          </Card>

          {/* Total Balance */}
          <Card className="bg-slate-50 text-slate-900 border-slate-200 shadow-sm relative overflow-hidden dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800">
            <CardContent className="p-5 relative z-10">
              <p className="text-xs font-medium uppercase tracking-wide opacity-80 mb-1">Saldo Total</p>
              {isCurrentlyLoading ? (
                <Skeleton className="h-8 w-32 bg-slate-200 dark:bg-slate-800" />
              ) : (
                <p className="text-2xl font-bold tabular-nums">
                  {formatCurrency(overview?.total_balance || 0)}
                </p>
              )}
              <p className="text-[10px] opacity-70 mt-1">Soma geral da carteira</p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Top Indicators (Earnings) */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-background border border-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1 flex items-center justify-center gap-1">
              Hoje
            </p>
            {isCurrentlyLoading ? <Skeleton className="h-5 w-16 mx-auto" /> : (
              <p className="text-sm font-bold text-green-600 dark:text-green-500">{formatCurrency(metrics.earningsToday)}</p>
            )}
          </div>
          <div className="bg-background border border-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1 flex items-center justify-center gap-1">
              Semana
            </p>
            {isCurrentlyLoading ? <Skeleton className="h-5 w-16 mx-auto" /> : (
              <p className="text-sm font-bold text-green-600 dark:text-green-500">{formatCurrency(metrics.earningsWeek)}</p>
            )}
          </div>
          <div className="bg-background border border-border rounded-xl p-3 text-center shadow-sm">
            <p className="text-[10px] text-muted-foreground uppercase font-medium mb-1 flex items-center justify-center gap-1">
              Mês
            </p>
            {isCurrentlyLoading ? <Skeleton className="h-5 w-16 mx-auto" /> : (
              <p className="text-sm font-bold text-green-600 dark:text-green-500">{formatCurrency(metrics.earningsMonth)}</p>
            )}
          </div>
        </div>

        {/* 3. List Toggle & Filters */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant={activeTab === 'statement' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('statement')}
                className="rounded-full"
              >
                Extrato
              </Button>
              <Button
                variant={activeTab === 'payouts' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('payouts')}
                className="rounded-full"
              >
                Saques
              </Button>
            </div>

            {activeTab === 'statement' && (
              <Select value={filterProfile} onValueChange={setFilterProfile}>
                <SelectTrigger className="w-[140px] h-8 text-xs rounded-full">
                  <SelectValue placeholder="Filtrar perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="Motoboy">Motoboy</SelectItem>
                  <SelectItem value="Lojista">Lojista</SelectItem>
                  <SelectItem value="Motorista">Motorista</SelectItem>
                  <SelectItem value="Frete">Frete</SelectItem>
                  <SelectItem value="Passageiro">Passageiro</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            {activeTab === 'statement' && (
              <div className="flex flex-col">
                {isCurrentlyLoading ? (
                  <div className="p-8 flex justify-center"><Skeleton className="h-10 w-10 rounded-full" /></div>
                ) : statement.length === 0 ? (
                  <div className="p-12 flex flex-col items-center justify-center text-center text-muted-foreground">
                    <WalletIcon className="h-12 w-12 mb-4 opacity-20" />
                    <p className="font-semibold text-foreground">Nenhuma movimentação ainda.</p>
                    <p className="text-sm mt-1">Saldo {formatCurrency(0)}</p>
                  </div>
                ) : (
                  statement.map(renderStatementItem)
                )}
              </div>
            )}

            {activeTab === 'payouts' && (
              <div className="flex flex-col">
                {isCurrentlyLoading ? (
                  <div className="p-8 flex justify-center"><Skeleton className="h-10 w-10 rounded-full" /></div>
                ) : payouts.length === 0 ? (
                  <div className="p-12 flex flex-col items-center justify-center text-center text-muted-foreground">
                    <AlertCircle className="h-12 w-12 mb-4 opacity-20" />
                    <p className="font-semibold text-foreground">Nenhum saque solicitado.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 font-medium">Data</th>
                          <th className="px-4 py-3 font-medium">Valor</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payouts.map((p) => (
                          <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 text-xs whitespace-nowrap">{formatDate(p.created_at)}</td>
                            <td className="px-4 py-3 font-semibold tabular-nums">{formatCurrency(p.amount_cents)}</td>
                            <td className="px-4 py-3">
                              {p.status === 'completed' && <span className="inline-flex items-center gap-1 text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs font-medium"><CheckCircle2 className="h-3 w-3" /> Concluído</span>}
                              {p.status === 'pending' && <span className="inline-flex items-center gap-1 text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full text-xs font-medium"><Hourglass className="h-3 w-3" /> Pendente</span>}
                              {p.status === 'failed' && <span className="inline-flex items-center gap-1 text-red-600 bg-red-100 px-2 py-0.5 rounded-full text-xs font-medium"><XCircle className="h-3 w-3" /> Falhou</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
