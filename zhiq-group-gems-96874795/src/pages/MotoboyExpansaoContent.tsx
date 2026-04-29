import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useMotoboyExpansionData, 
  useMotoboyWhatsAppGroups, 
  useAddMotoboyGroup, 
  useRemoveMotoboyGroup, 
  useMonthlySavings,
  useCityRanking,
  useCityEconomicRadar,
  MotoboyWhatsAppGroup 
} from '@/hooks/useMotoboyExpansion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  MapPin, 
  TrendingDown, 
  MessageSquare, 
  Plus, 
  Trash2, 
  Loader2, 
  ExternalLink, 
  CheckCircle2,
  AlertCircle,
  Target,
  Wallet,
  Trophy,
  Activity,
  Users,
  BarChart3,
  DollarSign
} from 'lucide-react';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';

const GROUP_TYPES = ['Entregas', 'Comunidade', 'Comércio', 'Restaurantes', 'Geral'];

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo: { label: 'Ativo', variant: 'default' },
  em_analise: { label: 'Em análise', variant: 'secondary' },
  pendente: { label: 'Pendente', variant: 'secondary' },
  rejeitado: { label: 'Rejeitado', variant: 'destructive' },
  inativo: { label: 'Inativo', variant: 'outline' },
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export default function MotoboyExpansaoContent() {
  const { user } = useAuth();
  const { data: expansionData, isLoading: isLoadingExpansion } = useMotoboyExpansionData(user?.id);
  const { data: groups, isLoading: isLoadingGroups } = useMotoboyWhatsAppGroups(user?.id);
  const { data: savingsData, isLoading: isLoadingSavings } = useMonthlySavings(user?.id);
  const { data: rankingData, isLoading: isLoadingRanking } = useCityRanking(user?.id, expansionData?.cityId ?? undefined);
  const { data: radarData, isLoading: isLoadingRadar } = useCityEconomicRadar(expansionData?.cityId ?? undefined);
  
  const addGroupMutation = useAddMotoboyGroup();
  const removeGroupMutation = useRemoveMotoboyGroup();

  const [showForm, setShowForm] = useState(false);
  const [link, setLink] = useState('');
  const [tipo, setTipo] = useState('Geral');
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

  const commissionRate = expansionData?.percentualComissaoAtual;
  const activeGroups = expansionData?.quantidadeGruposAtivos ?? 0;
  const cidade = expansionData?.cidade;
  const estado = expansionData?.estado;
  const cityId = expansionData?.cityId;

  // Calculate savings (assuming max commission is 25% without groups)
  const maxCommission = 25;
  const savings = commissionRate !== null && commissionRate !== undefined 
    ? Math.max(0, maxCommission - commissionRate) 
    : 0;

  const progressPercent = Math.min((activeGroups / 6) * 100, 100);

  const validateLink = (url: string): boolean => {
    const whatsappPatterns = [
      /^https?:\/\/(chat\.whatsapp\.com|wa\.me)/i,
      /^https?:\/\/api\.whatsapp\.com/i,
    ];
    return whatsappPatterns.some(pattern => pattern.test(url.trim()));
  };

  const handleAddGroup = async () => {
    if (!user?.id || !cityId || !cidade || !estado) return;

    if (!link.trim()) {
      return;
    }

    if (!validateLink(link)) {
      return;
    }

    await addGroupMutation.mutateAsync({
      userId: user.id,
      link: link.trim(),
      cidade,
      estado,
      cityId,
      tipo,
    });

    setLink('');
    setTipo('Geral');
    setShowForm(false);
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete || !user?.id) return;

    await removeGroupMutation.mutateAsync({
      groupId: groupToDelete,
      userId: user.id,
    });

    setGroupToDelete(null);
  };

  const isLoading = isLoadingExpansion || isLoadingGroups;

  // Find current user position in ranking
  const currentUserRanking = rankingData?.find(r => r.isCurrentUser);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-motoboy" />
      </div>
    );
  }

  return (
    <MotoboyPageTemplate
      title="Minha Expansão Local"
      subtitle="Gerencie seu engajamento territorial"
      icon={Target}
    >

      {/* Card 1 - Comissão Atual */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-motoboy" />
              <CardTitle className="text-lg">Comissão Atual</CardTitle>
            </div>
            {commissionRate !== null && commissionRate !== undefined ? (
              <Badge className="bg-motoboy text-white text-lg px-3 py-1">
                {commissionRate}%
              </Badge>
            ) : (
              <Badge variant="destructive">Não definida</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Grupos Ativos</span>
              <span className="font-semibold">{activeGroups} / 6</span>
            </div>
            <Progress value={progressPercent} variant="motoboy" className="h-3" />
          </div>

          {savings > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Você está economizando <strong>{savings}%</strong> graças ao seu engajamento local.
                </span>
              </p>
            </div>
          )}

          {activeGroups === 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>
                  Adicione grupos da sua cidade para reduzir sua comissão.
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2 - Economia Mensal Estimada */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-motoboy" />
            <CardTitle className="text-lg">Economia Mensal</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSavings ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-motoboy" />
            </div>
          ) : savingsData && savingsData.savings > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(savingsData.savings)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    economizados este mês
                  </p>
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Você economizou <strong>{formatCurrency(savingsData.savings)}</strong> este mês 
                  por manter grupos ativos.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Wallet className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Ainda sem economia este mês.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Comece a rodar para economizar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 3 - Ranking da Cidade */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-motoboy" />
            <CardTitle className="text-lg">Ranking da Cidade</CardTitle>
          </div>
          <CardDescription>
            Top 10 motoboys mais engajados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRanking ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-motoboy" />
            </div>
          ) : rankingData && rankingData.length > 0 ? (
            <div className="space-y-2">
              {rankingData.map((entry) => (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    entry.isCurrentUser 
                      ? 'bg-motoboy/10 border border-motoboy' 
                      : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                      entry.position <= 3 
                        ? 'bg-yellow-500 text-white' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {entry.position}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${entry.isCurrentUser ? 'text-motoboy' : ''}`}>
                        {entry.isCurrentUser ? 'Você' : entry.nome}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.gruposAtivos} grupos • {entry.totalEntregas} entregas
                      </p>
                    </div>
                  </div>
                  {entry.isCurrentUser && (
                    <Badge className="bg-motoboy text-white text-xs">
                      #{entry.position}
                    </Badge>
                  )}
                </div>
              ))}
              {currentUserRanking && currentUserRanking.position > 10 && (
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Você está na posição #{currentUserRanking.position}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhum dado de ranking disponível.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 4 - Radar Econômico da Cidade */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-motoboy" />
            <CardTitle className="text-lg">Radar Econômico</CardTitle>
          </div>
          <CardDescription>
            Métricas da sua cidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRadar ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-motoboy" />
            </div>
          ) : radarData ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <Users className="h-5 w-5 text-motoboy mx-auto mb-1" />
                <p className="text-xl font-bold">{radarData.totalMotoboys}</p>
                <p className="text-xs text-muted-foreground">Motoboys</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <MessageSquare className="h-5 w-5 text-motoboy mx-auto mb-1" />
                <p className="text-xl font-bold">{radarData.avgGruposAtivos}</p>
                <p className="text-xs text-muted-foreground">Média grupos</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <TrendingDown className="h-5 w-5 text-motoboy mx-auto mb-1" />
                <p className="text-xl font-bold">{radarData.avgComissao}%</p>
                <p className="text-xs text-muted-foreground">Comissão média</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <BarChart3 className="h-5 w-5 text-motoboy mx-auto mb-1" />
                <p className="text-xl font-bold">{formatCurrency(radarData.volumeFinanceiro)}</p>
                <p className="text-xs text-muted-foreground">Volume mensal</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Dados não disponíveis.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 5 - Status Territorial */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-motoboy" />
            <CardTitle className="text-lg">Status Territorial</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <span className="text-sm text-muted-foreground">Sua cidade</span>
            <span className="font-semibold">
              {cidade && estado ? `${cidade}, ${estado}` : 'Não definida'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Somente grupos da sua cidade contam para redução da comissão.
          </p>
        </CardContent>
      </Card>

      {/* Card 6 - Lista de Grupos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-motoboy" />
              <CardTitle className="text-lg">Meus Grupos</CardTitle>
            </div>
            {groups && groups.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {groups.length} cadastrado{groups.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <CardDescription>
            Grupos WhatsApp cadastrados da sua região
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groups && groups.length > 0 ? (
            <div className="space-y-3">
              {groups.map((group: MotoboyWhatsAppGroup) => {
                const statusInfo = STATUS_CONFIG[group.status] || STATUS_CONFIG.em_analise;
                
                return (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={statusInfo.variant} className="text-xs flex items-center gap-1">
                          {group.status === 'ativo' && <CheckCircle2 className="h-3 w-3" />}
                          {group.status === 'rejeitado' && <AlertCircle className="h-3 w-3" />}
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {group.tipo}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {group.cidade}, {group.estado}
                      </p>
                      <a
                        href={group.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-motoboy hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver grupo
                      </a>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setGroupToDelete(group.id)}
                      disabled={removeGroupMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum grupo cadastrado ainda.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 4 - Adicionar Grupo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-motoboy" />
            <CardTitle className="text-lg">Adicionar Grupo</CardTitle>
          </div>
          <CardDescription>
            Adicione grupos WhatsApp da sua cidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!cidade || !estado || !cityId ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>
                  Configure sua cidade no perfil antes de adicionar grupos.
                </span>
              </p>
            </div>
          ) : showForm ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link">Link do grupo</Label>
                <Input
                  id="link"
                  placeholder="https://chat.whatsapp.com/..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo do grupo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  O grupo será automaticamente vinculado a <strong>{cidade}, {estado}</strong>.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAddGroup}
                  disabled={addGroupMutation.isPending || !link.trim()}
                  className="flex-1 bg-motoboy hover:bg-motoboy/90 text-white"
                >
                  {addGroupMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Adicionar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setLink('');
                    setTipo('Geral');
                  }}
                  disabled={addGroupMutation.isPending}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-motoboy text-motoboy hover:bg-motoboy/10 hover:text-motoboy"
              onClick={() => setShowForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar grupo WhatsApp
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      <AlertDialog open={!!groupToDelete} onOpenChange={(open) => !open && setGroupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover grupo</AlertDialogTitle>
            <AlertDialogDescription>
              Remover este grupo? Isso pode aumentar sua comissão se ele estava ativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeGroupMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
              disabled={removeGroupMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeGroupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MotoboyPageTemplate>
  );
}
