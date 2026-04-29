import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Share2, Copy, Check, Users, Sparkles, TicketCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const ReferFriends = () => {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [confirmedReferrals, setConfirmedReferrals] = useState(0);
  const [pendingReferrals, setPendingReferrals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // State for applying referral code
  const [inputCode, setInputCode] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const [hasExistingReferral, setHasExistingReferral] = useState(false);

  useEffect(() => {
    if (user) {
      loadReferralData();
      checkExistingReferral();
    }
  }, [user]);

  const loadReferralData = async () => {
    if (!user) return;

    try {
      const { data: incentives, error } = await supabase
        .rpc('get_passenger_incentives', { _user_id: user.id });

      if (error) throw error;

      if (incentives && incentives.length > 0) {
        const data = incentives[0];
        setReferralCode(data.referral_code);
        setConfirmedReferrals(data.confirmed_referrals || 0);
        setPendingReferrals(data.pending_referrals || 0);
      }
    } catch (error) {
      console.error('Error loading referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingReferral = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('passenger_referrals')
        .select('id')
        .eq('referred_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setHasExistingReferral(true);
      }
    } catch (error) {
      console.error('Error checking existing referral:', error);
    }
  };

  const handleCopyCode = async () => {
    if (!referralCode) return;
    
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar código");
    }
  };

  const handleShare = async () => {
    if (!referralCode) return;

    const shareText = `Use meu código ${referralCode} para se cadastrar no app e ganhe benefícios! 🚗`;
    
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

  const handleApplyCode = async () => {
    if (!user || !inputCode.trim()) return;

    const normalizedCode = inputCode.trim().toUpperCase();

    // Validate: cannot apply own code
    if (normalizedCode === referralCode) {
      toast.error("Você não pode usar seu próprio código");
      return;
    }

    // Validate: code format (8 alphanumeric chars)
    if (!/^[A-Z0-9]{8}$/.test(normalizedCode)) {
      toast.error("Código inválido. O código deve ter 8 caracteres.");
      return;
    }

    setApplyingCode(true);

    try {
      // Check if user already has a referral
      const { data: existingRef } = await supabase
        .from('passenger_referrals')
        .select('id')
        .eq('referred_id', user.id)
        .maybeSingle();

      if (existingRef) {
        toast.error("Você já utilizou um código de indicação");
        setHasExistingReferral(true);
        return;
      }

      // Find referrer by code (code = first 8 chars of user_id)
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .ilike('id', `${normalizedCode}%`)
        .limit(1);

      if (profileError || !profiles || profiles.length === 0) {
        toast.error("Código inválido ou não encontrado");
        return;
      }

      const referrerId = profiles[0].id;

      // Cannot refer yourself
      if (referrerId === user.id) {
        toast.error("Você não pode usar seu próprio código");
        return;
      }

      // Create referral record
      const { error: insertError } = await supabase
        .from('passenger_referrals')
        .insert({
          referrer_id: referrerId,
          referred_id: user.id,
          referred_email: user.email,
          status: 'pending'
        });

      if (insertError) {
        if (insertError.code === '23505') {
          toast.error("Você já utilizou um código de indicação");
        } else {
          throw insertError;
        }
        return;
      }

      toast.success("Código aplicado com sucesso! Complete sua primeira corrida paga para confirmar.");
      setHasExistingReferral(true);
      setInputCode("");

    } catch (error) {
      console.error('Error applying referral code:', error);
      toast.error("Erro ao aplicar código. Tente novamente.");
    } finally {
      setApplyingCode(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6 animate-fade-in">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Indicar Amigos</h1>
          <p className="text-muted-foreground">
            Convide amigos e ganhe benefícios exclusivos
          </p>
        </div>

        {/* Hero Card */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <CardHeader className="pb-2 relative">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-lg">
                <Gift className="h-6 w-6" />
              </div>
              <CardTitle className="text-xl">Indique amigos e ganhe benefícios</CardTitle>
            </div>
          </CardHeader>
          
          <CardContent className="relative space-y-4">
            <p className="text-white/90">
              <Sparkles className="inline h-4 w-4 mr-1" />
              A cada <strong>3 amigos</strong> que criarem conta e realizarem a primeira corrida paga, 
              você ganha <strong>1 corrida grátis por mês durante 6 meses</strong>!
            </p>
            
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-white/20 rounded-lg text-center">
                <p className="text-3xl font-bold">{confirmedReferrals}</p>
                <p className="text-sm text-white/80">Confirmados</p>
              </div>
              <div className="p-3 bg-white/20 rounded-lg text-center">
                <p className="text-3xl font-bold">{pendingReferrals}</p>
                <p className="text-sm text-white/80">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referral Code Card */}
        <Card className="border shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Share2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Seu Código de Indicação</CardTitle>
                <CardDescription>Compartilhe com seus amigos</CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Código de Indicação */}
            <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Seu código</p>
                <p className="font-mono font-bold text-2xl tracking-wider">
                  {referralCode || '--------'}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyCode}
                className="shrink-0 h-12 w-12"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
              </Button>
            </div>

            <Button onClick={handleShare} className="w-full gap-2" size="lg">
              <Share2 className="h-5 w-5" />
              Compartilhar código
            </Button>
          </CardContent>
        </Card>

        {/* Apply Referral Code Card */}
        <Card className="border shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <TicketCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base">Inserir Código de Indicação</CardTitle>
                <CardDescription>Recebeu um código de um amigo?</CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {hasExistingReferral ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-5 w-5" />
                  <p className="font-medium">Código de indicação já aplicado!</p>
                </div>
                <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
                  Complete sua primeira corrida paga para confirmar a indicação.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Se você recebeu um código de indicação de um amigo, cole aqui para vincular sua conta.
                </p>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Cole o código de indicação"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    className="font-mono uppercase tracking-wider"
                    disabled={applyingCode}
                  />
                  <Button 
                    onClick={handleApplyCode}
                    disabled={!inputCode.trim() || applyingCode}
                    className="shrink-0"
                  >
                    {applyingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Aplicar"
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Você pode aplicar apenas 1 código de indicação por conta.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="border shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Como funciona</CardTitle>
                <CardDescription>É simples e fácil</CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  1
                </span>
                <p className="text-sm text-muted-foreground">
                  Compartilhe seu código de indicação com amigos e família
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  2
                </span>
                <p className="text-sm text-muted-foreground">
                  Seus amigos se cadastram usando seu código
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                  3
                </span>
                <p className="text-sm text-muted-foreground">
                  Quando completarem a primeira corrida paga, a indicação é confirmada
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-sm font-bold shrink-0">
                  ✓
                </span>
                <p className="text-sm text-muted-foreground">
                  A cada 3 indicações confirmadas, você ganha 1 corrida grátis/mês por 6 meses!
                </p>
              </li>
            </ol>

            <p className="text-xs text-muted-foreground text-center mt-4 pt-4 border-t">
              Corridas grátis têm valor máximo de R$20 e expiram em 12 meses.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ReferFriends;
