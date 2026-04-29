import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Car, Users, Megaphone, Gift, AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DriverIncentives {
  groups_per_free_ride: number;
  max_free_rides_per_month: number;
  enabled: boolean;
}

interface PassengerIncentives {
  referrals_for_benefit: number;
  benefit_duration_months: number;
  max_free_rides_per_month: number;
  max_ride_value: number;
  enabled: boolean;
}

interface Campaigns {
  enabled: boolean;
  bonus_multiplier: number;
  start_date: string | null;
  end_date: string | null;
}

interface GroupStats {
  total_active: number;
  total_rejected: number;
  total_pending: number;
}

const AdminIncentives = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  
  const [driverIncentives, setDriverIncentives] = useState<DriverIncentives>({
    groups_per_free_ride: 5,
    max_free_rides_per_month: 3,
    enabled: true,
  });
  
  const [passengerIncentives, setPassengerIncentives] = useState<PassengerIncentives>({
    referrals_for_benefit: 3,
    benefit_duration_months: 6,
    max_free_rides_per_month: 3,
    max_ride_value: 20,
    enabled: true,
  });
  
  const [campaigns, setCampaigns] = useState<Campaigns>({
    enabled: false,
    bonus_multiplier: 1,
    start_date: null,
    end_date: null,
  });

  const [groupStats, setGroupStats] = useState<GroupStats>({
    total_active: 0,
    total_rejected: 0,
    total_pending: 0,
  });

  useEffect(() => {
    loadSettings();
    loadGroupStats();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("incentive_settings")
        .select("*");

      if (error) throw error;

      data?.forEach((setting) => {
        const value = setting.setting_value as Record<string, unknown>;
        switch (setting.setting_key) {
          case "driver_incentives":
            setDriverIncentives(value as unknown as DriverIncentives);
            break;
          case "passenger_incentives":
            setPassengerIncentives(value as unknown as PassengerIncentives);
            break;
          case "campaigns":
            setCampaigns(value as unknown as Campaigns);
            break;
        }
      });
    } catch (error) {
      console.error("Error loading settings:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const loadGroupStats = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_whatsapp_groups")
        .select("status");

      if (error) throw error;

      const stats = {
        total_active: data?.filter((g) => g.status === "ativo").length || 0,
        total_rejected: data?.filter((g) => g.status === "rejeitado").length || 0,
        total_pending: data?.filter((g) => g.status === "em_analise").length || 0,
      };
      
      setGroupStats(stats);
    } catch (error) {
      console.error("Error loading group stats:", error);
    }
  };

  const saveSetting = async (key: string, value: DriverIncentives | PassengerIncentives | Campaigns) => {
    setSaving(key);
    try {
      const { error } = await supabase
        .from("incentive_settings")
        .update({ 
          setting_value: JSON.parse(JSON.stringify(value)),
          updated_at: new Date().toISOString()
        })
        .eq("setting_key", key);

      if (error) throw error;
      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Incentivos e Regras</h1>
          <p className="text-muted-foreground">Gerencie as configurações de incentivos</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Incentivos e Regras</h1>
        <p className="text-muted-foreground">Gerencie as configurações de incentivos do sistema</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Driver Incentives Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5 text-primary" />
              Incentivos do Motorista
            </CardTitle>
            <CardDescription>Configure as regras de benefícios para motoristas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="driver-enabled" className="flex flex-col gap-1">
                <span>Ativar corridas grátis</span>
                <span className="font-normal text-muted-foreground text-sm">
                  Habilita o sistema de corridas grátis para motoristas
                </span>
              </Label>
              <Switch
                id="driver-enabled"
                checked={driverIncentives.enabled}
                onCheckedChange={(checked) =>
                  setDriverIncentives({ ...driverIncentives, enabled: checked })
                }
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="groups-per-ride">Grupos necessários por corrida grátis</Label>
                <Input
                  id="groups-per-ride"
                  type="number"
                  min={1}
                  value={driverIncentives.groups_per_free_ride}
                  onChange={(e) =>
                    setDriverIncentives({
                      ...driverIncentives,
                      groups_per_free_ride: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-max-rides">Máximo de corridas grátis por mês</Label>
                <Input
                  id="driver-max-rides"
                  type="number"
                  min={1}
                  value={driverIncentives.max_free_rides_per_month}
                  onChange={(e) =>
                    setDriverIncentives({
                      ...driverIncentives,
                      max_free_rides_per_month: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                />
              </div>
            </div>

            <Separator />

            {/* Group Statistics */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Estatísticas de Grupos</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                      {groupStats.total_active}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500">Ativos</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <div>
                    <p className="text-lg font-semibold text-yellow-700 dark:text-yellow-400">
                      {groupStats.total_pending}
                    </p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">Em análise</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <div>
                    <p className="text-lg font-semibold text-red-700 dark:text-red-400">
                      {groupStats.total_rejected}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-500">Rejeitados</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Grupos rejeitados: participação não confirmada pelo usuário
              </p>
            </div>

            <Button
              className="w-full"
              onClick={() => saveSetting("driver_incentives", driverIncentives)}
              disabled={saving === "driver_incentives"}
            >
              {saving === "driver_incentives" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Configurações"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Passenger Incentives Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Incentivos do Passageiro
            </CardTitle>
            <CardDescription>Configure as regras de indicação e benefícios</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="passenger-enabled" className="flex flex-col gap-1">
                <span>Ativar incentivos de indicação</span>
                <span className="font-normal text-muted-foreground text-sm">
                  Habilita o sistema de indicação e corridas grátis
                </span>
              </Label>
              <Switch
                id="passenger-enabled"
                checked={passengerIncentives.enabled}
                onCheckedChange={(checked) =>
                  setPassengerIncentives({ ...passengerIncentives, enabled: checked })
                }
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referrals-for-benefit">Indicações necessárias para benefício</Label>
                <Input
                  id="referrals-for-benefit"
                  type="number"
                  min={1}
                  value={passengerIncentives.referrals_for_benefit}
                  onChange={(e) =>
                    setPassengerIncentives({
                      ...passengerIncentives,
                      referrals_for_benefit: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="benefit-duration">Duração do benefício (meses)</Label>
                <Input
                  id="benefit-duration"
                  type="number"
                  min={1}
                  value={passengerIncentives.benefit_duration_months}
                  onChange={(e) =>
                    setPassengerIncentives({
                      ...passengerIncentives,
                      benefit_duration_months: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="passenger-max-rides">Limite de corridas grátis por mês</Label>
                <Input
                  id="passenger-max-rides"
                  type="number"
                  min={1}
                  value={passengerIncentives.max_free_rides_per_month}
                  onChange={(e) =>
                    setPassengerIncentives({
                      ...passengerIncentives,
                      max_free_rides_per_month: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-ride-value">Valor máximo por corrida grátis (R$)</Label>
                <Input
                  id="max-ride-value"
                  type="number"
                  min={1}
                  step="0.01"
                  value={passengerIncentives.max_ride_value}
                  onChange={(e) =>
                    setPassengerIncentives({
                      ...passengerIncentives,
                      max_ride_value: Math.max(1, parseFloat(e.target.value) || 1),
                    })
                  }
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => saveSetting("passenger_incentives", passengerIncentives)}
              disabled={saving === "passenger_incentives"}
            >
              {saving === "passenger_incentives" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Configurações"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Campaigns Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              Campanhas Temporárias
            </CardTitle>
            <CardDescription>Configure campanhas promocionais com multiplicadores de bônus</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="campaigns-enabled" className="flex flex-col gap-1">
                <span>Ativar campanhas promocionais</span>
                <span className="font-normal text-muted-foreground text-sm">
                  Habilita multiplicadores de bônus temporários
                </span>
              </Label>
              <Switch
                id="campaigns-enabled"
                checked={campaigns.enabled}
                onCheckedChange={(checked) =>
                  setCampaigns({ ...campaigns, enabled: checked })
                }
              />
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="bonus-multiplier">Multiplicador de bônus</Label>
                <Input
                  id="bonus-multiplier"
                  type="number"
                  min={1}
                  step="0.5"
                  value={campaigns.bonus_multiplier}
                  onChange={(e) =>
                    setCampaigns({
                      ...campaigns,
                      bonus_multiplier: Math.max(1, parseFloat(e.target.value) || 1),
                    })
                  }
                  disabled={!campaigns.enabled}
                />
                <p className="text-xs text-muted-foreground">Ex: 2x = indicações contam em dobro</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-date">Data de início (opcional)</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={campaigns.start_date || ""}
                  onChange={(e) =>
                    setCampaigns({
                      ...campaigns,
                      start_date: e.target.value || null,
                    })
                  }
                  disabled={!campaigns.enabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">Data de fim (opcional)</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={campaigns.end_date || ""}
                  onChange={(e) =>
                    setCampaigns({
                      ...campaigns,
                      end_date: e.target.value || null,
                    })
                  }
                  disabled={!campaigns.enabled}
                />
              </div>
            </div>

            <Button
              className="w-full md:w-auto"
              onClick={() => saveSetting("campaigns", campaigns)}
              disabled={saving === "campaigns"}
            >
              {saving === "campaigns" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Configurações de Campanha"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminIncentives;
