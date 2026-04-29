import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, Car, Target, Award, TrendingUp, Gift, Crown, Medal, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DriverIncentivesData {
  active_groups_count: number;
  profile_level: string;
  total_free_rides: number;
  used_free_rides: number;
  available_free_rides: number;
  groups_to_next_ride: number;
}

interface RankingEntry {
  rank_position: number;
  user_id: string;
  user_name: string;
  active_groups: number;
  cidade: string;
  estado: string;
}

const LEVEL_CONFIG = {
  Bronze: {
    icon: Medal,
    color: 'text-amber-700',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-300 dark:border-amber-700',
    range: '0–4 grupos'
  },
  Prata: {
    icon: Star,
    color: 'text-slate-500',
    bgColor: 'bg-slate-100 dark:bg-slate-800/50',
    borderColor: 'border-slate-300 dark:border-slate-600',
    range: '5–9 grupos'
  },
  Ouro: {
    icon: Crown,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-400 dark:border-yellow-600',
    range: '10+ grupos'
  }
};

export default function DriverIncentives() {
  const { user } = useAuth();
  const [incentives, setIncentives] = useState<DriverIncentivesData | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [userRank, setUserRank] = useState<RankingEntry | null>(null);
  const [userEstado, setUserEstado] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadIncentives();
      loadUserProfile();
    }
  }, [user]);

  useEffect(() => {
    if (userEstado) {
      loadRanking();
    }
  }, [userEstado]);

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('driver_profiles')
        .select('estado')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!error && data?.estado) {
        setUserEstado(data.estado);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadIncentives = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_driver_incentives', {
        _user_id: user.id
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setIncentives(data[0] as DriverIncentivesData);
      }
    } catch (error) {
      console.error('Error loading incentives:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRanking = async () => {
    if (!userEstado) return;
    
    try {
      const { data, error } = await supabase.rpc('get_regional_ranking', {
        _estado: userEstado,
        _limit: 10
      });

      if (error) throw error;
      
      if (data) {
        setRanking(data as RankingEntry[]);
        const currentUserRank = (data as RankingEntry[]).find(r => r.user_id === user?.id);
        setUserRank(currentUserRank || null);
      }
    } catch (error) {
      console.error('Error loading ranking:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!incentives) return null;

  const levelConfig = LEVEL_CONFIG[incentives.profile_level as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.Bronze;
  const LevelIcon = levelConfig.icon;
  
  const progressToNextRide = incentives.groups_to_next_ride > 0 
    ? ((5 - incentives.groups_to_next_ride) / 5) * 100 
    : 100;

  return (
    <div className="space-y-4 mt-6">
      {/* Profile Level Badge */}
      <Card className={`${levelConfig.bgColor} ${levelConfig.borderColor} border-2`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LevelIcon className={`h-6 w-6 ${levelConfig.color}`} />
              <CardTitle className="text-lg">Nível do Perfil</CardTitle>
            </div>
            <Badge variant="outline" className={`${levelConfig.color} ${levelConfig.borderColor} text-sm font-bold px-3 py-1`}>
              {incentives.profile_level}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{levelConfig.range}</span>
            <span className={`font-medium ${levelConfig.color}`}>
              {incentives.active_groups_count} grupo{incentives.active_groups_count !== 1 ? 's' : ''} ativo{incentives.active_groups_count !== 1 ? 's' : ''}
            </span>
          </div>
          {incentives.profile_level !== 'Ouro' && (
            <p className="text-xs text-muted-foreground mt-2">
              {incentives.profile_level === 'Bronze' 
                ? `Faltam ${5 - incentives.active_groups_count} grupos para o nível Prata`
                : `Faltam ${10 - incentives.active_groups_count} grupos para o nível Ouro`
              }
            </p>
          )}
        </CardContent>
      </Card>

      {/* Free Rides Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Corridas Grátis</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
                <Gift className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{incentives.available_free_rides}</p>
                <p className="text-xs text-muted-foreground">Disponíveis</p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">Total ganho: <span className="font-medium text-foreground">{incentives.total_free_rides}</span></p>
              <p className="text-muted-foreground">Utilizadas: <span className="font-medium text-foreground">{incentives.used_free_rides}</span></p>
            </div>
          </div>

          {/* Progress to next free ride */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso para próxima corrida</span>
              <span className="font-medium">{5 - incentives.groups_to_next_ride}/5 grupos</span>
            </div>
            <Progress value={progressToNextRide} className="h-2" />
            {incentives.groups_to_next_ride > 0 ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Adicione mais {incentives.groups_to_next_ride} grupo{incentives.groups_to_next_ride !== 1 ? 's' : ''} ativo{incentives.groups_to_next_ride !== 1 ? 's' : ''} para ganhar +1 corrida grátis!
              </p>
            ) : (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                🎉 Você completou a meta! Corrida grátis disponível.
              </p>
            )}
          </div>

          {/* How it works */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Como funciona?</p>
            <p>A cada 5 grupos ativos aprovados, você ganha 1 corrida sem cobrança de comissão. O passageiro paga normalmente e você recebe 100% do valor.</p>
          </div>
        </CardContent>
      </Card>

      {/* Missions Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Missões</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Standard Mission */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30">
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-sm">Missão Padrão</p>
                <p className="text-xs text-muted-foreground">Adicione 5 grupos ativos</p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="text-xs">
                {Math.min(incentives.active_groups_count % 5 || (incentives.active_groups_count > 0 ? 5 : 0), 5)}/5
              </Badge>
              <p className="text-xs text-green-600 mt-1">+1 corrida grátis</p>
            </div>
          </div>

          {/* Level up mission */}
          {incentives.profile_level !== 'Ouro' && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Trophy className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Subir de Nível</p>
                  <p className="text-xs text-muted-foreground">
                    {incentives.profile_level === 'Bronze' 
                      ? 'Alcance 5 grupos ativos' 
                      : 'Alcance 10 grupos ativos'
                    }
                  </p>
                </div>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs">
                  {incentives.active_groups_count}/{incentives.profile_level === 'Bronze' ? 5 : 10}
                </Badge>
                <p className="text-xs text-amber-600 mt-1">
                  Nível {incentives.profile_level === 'Bronze' ? 'Prata' : 'Ouro'}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Regional Ranking */}
      {userEstado && ranking.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Ranking Regional</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">{userEstado}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranking.slice(0, 5).map((entry) => {
              const isCurrentUser = entry.user_id === user?.id;
              const isTop3 = entry.rank_position <= 3;
              
              return (
                <div
                  key={entry.user_id}
                  className={`flex items-center justify-between p-2 rounded-lg ${
                    isCurrentUser 
                      ? 'bg-primary/10 border border-primary/30' 
                      : isTop3 
                        ? 'bg-amber-50 dark:bg-amber-900/20' 
                        : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center h-8 w-8 rounded-full ${
                      entry.rank_position === 1 
                        ? 'bg-yellow-400 text-yellow-900' 
                        : entry.rank_position === 2 
                          ? 'bg-slate-300 text-slate-700' 
                          : entry.rank_position === 3 
                            ? 'bg-amber-600 text-amber-100'
                            : 'bg-muted text-muted-foreground'
                    } text-sm font-bold`}>
                      {entry.rank_position}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isCurrentUser ? 'text-primary' : ''}`}>
                        {isCurrentUser ? 'Você' : (entry.user_name || 'Motorista')}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.cidade}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {entry.active_groups} grupo{entry.active_groups !== 1 ? 's' : ''}
                  </Badge>
                </div>
              );
            })}

            {/* Show user position if not in top 5 */}
            {userRank && userRank.rank_position > 5 && (
              <>
                <div className="text-center text-xs text-muted-foreground py-1">...</div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground text-sm font-bold">
                      {userRank.rank_position}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary">Você</p>
                      <p className="text-xs text-muted-foreground">{userRank.cidade}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {userRank.active_groups} grupo{userRank.active_groups !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </>
            )}

            {!userRank && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Adicione grupos ativos para aparecer no ranking!
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}