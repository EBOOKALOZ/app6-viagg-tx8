import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, Crown, Medal, Star, Plus, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MotoboyIncentivesData {
  active_groups_count: number;
  profile_level: string;
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

// Commission rules based on active groups
const COMMISSION_RULES = [
  { groups: 0, percentage: 25 },
  { groups: 1, percentage: 18 },
  { groups: 2, percentage: 11 },
  { groups: 3, percentage: 6 },
];

const getCommissionPercentage = (groupCount: number): number => {
  const rule = COMMISSION_RULES.find(r => r.groups === Math.min(groupCount, 3));
  return rule?.percentage ?? 25;
};

const getEducationalMessage = (groupCount: number, percentage: number): string => {
  if (groupCount === 0) {
    return `Você está pagando ${percentage}% porque não possui grupos ativos.`;
  }
  if (groupCount >= 3) {
    return `Parabéns! Você está pagando a menor taxa: ${percentage}%.`;
  }
  return `Com ${groupCount} grupo${groupCount !== 1 ? 's' : ''} ativo${groupCount !== 1 ? 's' : ''} sua taxa caiu para ${percentage}%.`;
};

export default function MotoboyIncentives() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incentives, setIncentives] = useState<MotoboyIncentivesData | null>(null);
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
        .from('motoboy_profiles')
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
      const { data, error } = await supabase.rpc('get_motoboy_incentives', {
        _user_id: user.id
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setIncentives(data[0] as MotoboyIncentivesData);
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
      const { data, error } = await supabase.rpc('get_motoboy_regional_ranking', {
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
  const currentCommission = getCommissionPercentage(incentives.active_groups_count);
  const educationalMessage = getEducationalMessage(incentives.active_groups_count, currentCommission);
  const canReduceMore = incentives.active_groups_count < 6;

  return (
    <div className="space-y-4 mt-6">
      {/* Active Groups & Commission Card */}
      <Card className="border-2 border-motoboy/30 bg-gradient-to-br from-motoboy-light to-background">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-motoboy" />
              <CardTitle className="text-lg">Taxa Atual</CardTitle>
            </div>
            <Badge 
              variant="outline" 
              className={`text-lg font-bold px-3 py-1 ${
                currentCommission <= 6 
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400' 
                  : currentCommission >= 25 
                    ? 'bg-destructive/10 text-destructive border-destructive/30' 
                    : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              {currentCommission}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Groups Counter */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-background/80 border">
            <span className="text-sm font-medium">Grupos ativos</span>
            <span className="text-lg font-bold text-motoboy">
              {incentives.active_groups_count}/6
            </span>
          </div>

          {/* Educational Message */}
          <p className={`text-sm p-3 rounded-lg ${
            incentives.active_groups_count >= 6
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
              : incentives.active_groups_count === 0
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
          }`}>
            {educationalMessage}
          </p>

          {/* CTA Button */}
          {canReduceMore && (
            <Button 
              onClick={() => navigate('/groups')}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              size="lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar grupos para reduzir sua taxa
            </Button>
          )}
        </CardContent>
      </Card>

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
                        {isCurrentUser ? 'Você' : (entry.user_name || 'Motoboy')}
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
