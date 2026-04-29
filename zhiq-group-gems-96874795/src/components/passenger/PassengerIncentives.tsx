import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Users, Car, Share2, Copy, Check, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface PassengerIncentivesData {
  confirmed_referrals: number;
  pending_referrals: number;
  referrals_to_next_reward: number;
  paid_rides_count: number;
  rides_to_next_free: number;
  available_free_rides: number;
  used_free_rides: number;
  total_free_rides: number;
  active_referral_rewards: number;
  referral_code: string;
}

const MAX_FREE_RIDES_PER_MONTH = 3;
const MAX_RIDE_VALUE = 20;

const PassengerIncentives = () => {
  const { user } = useAuth();
  const [data, setData] = useState<PassengerIncentivesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user) {
      loadIncentives();
    }
  }, [user]);

  const loadIncentives = async () => {
    if (!user) return;

    try {
      const { data: incentives, error } = await supabase
        .rpc('get_passenger_incentives', { _user_id: user.id });

      if (error) throw error;

      if (incentives && incentives.length > 0) {
        setData(incentives[0] as PassengerIncentivesData);
      }
    } catch (error) {
      console.error('Error loading incentives:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!data?.referral_code) return;
    
    try {
      await navigator.clipboard.writeText(data.referral_code);
      setCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar código");
    }
  };

  const handleShare = async () => {
    if (!data?.referral_code) return;

    const shareText = `Use meu código ${data.referral_code} para se cadastrar no app e ganhe benefícios! 🚗`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Indique um amigo',
          text: shareText,
        });
      } catch (error) {
        // User cancelled or share failed
      }
    } else {
      handleCopyCode();
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const referralProgress = data ? ((data.confirmed_referrals % 3) / 3) * 100 : 0;
  const usageProgress = data ? ((data.paid_rides_count % 5) / 5) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Card: Corridas Grátis */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <CardHeader className="pb-2 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <Gift className="h-5 w-5" />
              </div>
              <CardTitle className="text-lg">Corridas Grátis</CardTitle>
            </div>
            <Badge variant="secondary" className="bg-white/20 text-white border-0 hover:bg-white/30">
              Máx. R${MAX_RIDE_VALUE}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="relative">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-5xl font-bold">{data?.available_free_rides || 0}</span>
            <span className="text-white/80">disponíveis</span>
          </div>
          
          <p className="text-sm text-white/90">
            <Sparkles className="inline h-4 w-4 mr-1" />
            Ganhe corridas grátis indicando amigos e usando o app.
          </p>
          
          {data && data.available_free_rides >= MAX_FREE_RIDES_PER_MONTH && (
            <div className="mt-3 p-2 bg-white/20 rounded-lg text-sm">
              ⚠️ Limite de {MAX_FREE_RIDES_PER_MONTH} corridas grátis/mês atingido
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card: Progresso de Benefícios */}
      <Card className="border shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Progresso de Benefícios</CardTitle>
              <CardDescription>Acompanhe suas conquistas</CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-5">
          {/* Progresso de Indicações */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Indicações Confirmadas</span>
              </div>
              <span className="text-muted-foreground">
                {data?.confirmed_referrals || 0} de 3
              </span>
            </div>
            <Progress value={referralProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {data?.referrals_to_next_reward === 0 ? (
                <span className="text-emerald-600 font-medium">
                  🎉 Parabéns! Você ganhou corridas grátis mensais!
                </span>
              ) : (
                <>
                  Falta{data?.referrals_to_next_reward === 1 ? '' : 'm'}{' '}
                  <strong>{data?.referrals_to_next_reward || 3}</strong> indicaç
                  {data?.referrals_to_next_reward === 1 ? 'ão' : 'ões'} para ganhar 
                  1 corrida grátis/mês por 6 meses
                </>
              )}
            </p>
            {(data?.pending_referrals || 0) > 0 && (
              <p className="text-xs text-amber-600">
                ⏳ {data?.pending_referrals} indicaç{data?.pending_referrals === 1 ? 'ão' : 'ões'} aguardando primeira corrida paga
              </p>
            )}
          </div>

          {/* Progresso de Uso */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Corridas Pagas</span>
              </div>
              <span className="text-muted-foreground">
                {data?.paid_rides_count || 0} de 5
              </span>
            </div>
            <Progress value={usageProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {data?.rides_to_next_free === 0 ? (
                <span className="text-emerald-600 font-medium">
                  🎉 Você ganhou 1 corrida grátis!
                </span>
              ) : (
                <>
                  Falta{data?.rides_to_next_free === 1 ? '' : 'm'}{' '}
                  <strong>{data?.rides_to_next_free || 5}</strong> corrida
                  {data?.rides_to_next_free === 1 ? '' : 's'} paga
                  {data?.rides_to_next_free === 1 ? '' : 's'} para ganhar 1 corrida grátis
                </>
              )}
            </p>
          </div>

          {/* Resumo */}
          <div className="pt-3 border-t grid grid-cols-2 gap-3 text-center">
            <div className="p-2 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{data?.total_free_rides || 0}</p>
              <p className="text-xs text-muted-foreground">Total ganhas</p>
            </div>
            <div className="p-2 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{data?.used_free_rides || 0}</p>
              <p className="text-xs text-muted-foreground">Utilizadas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card: Indicar Amigos */}
      <Card className="border shadow-md bg-gradient-to-br from-background to-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <Share2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-base">Indicar Amigos</CardTitle>
              <CardDescription>Compartilhe e ganhe benefícios</CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A cada <strong>3 amigos</strong> que criarem conta e realizarem a primeira corrida paga, 
            você ganha <strong>1 corrida grátis por mês durante 6 meses</strong>!
          </p>

          {/* Código de Indicação */}
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Seu código</p>
              <p className="font-mono font-bold text-lg tracking-wider">
                {data?.referral_code || '--------'}
              </p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyCode}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <Button onClick={handleShare} className="w-full gap-2">
            <Share2 className="h-4 w-4" />
            Compartilhar código
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Corridas grátis expiram em 12 meses e não geram novos bônus.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PassengerIncentives;
