import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useExpansionSettings, useUpdateExpansionSettings, useRecalculateCommissions } from "@/hooks/useExpansionData";
import { useAuth } from "@/contexts/AuthContext";
import { Save, Settings2, RefreshCw, Activity, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ExpansionConfigCard() {
  const { user } = useAuth();
  const { data: settings, isLoading } = useExpansionSettings();
  const updateSettings = useUpdateExpansionSettings();
  const recalculate = useRecalculateCommissions();
  
  const [baseCommission, setBaseCommission] = useState(25);
  const [minCommission, setMinCommission] = useState(6);
  const [maxGroups, setMaxGroups] = useState(6);
  const [aggressiveExpansion, setAggressiveExpansion] = useState(false);
  const [autoValidation, setAutoValidation] = useState(false);

  useEffect(() => {
    if (settings) {
      setBaseCommission(settings.baseCommission);
      setMinCommission(settings.minCommission);
      setMaxGroups(settings.maxGroups);
      setAggressiveExpansion(settings.aggressiveExpansion);
      setAutoValidation(settings.autoValidation);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings?.id || !user?.id) {
      toast({
        title: "Erro",
        description: "Configurações não carregadas ou usuário não autenticado.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateSettings.mutateAsync({
        id: settings.id,
        baseCommission,
        minCommission,
        maxGroups,
        aggressiveExpansion,
        autoValidation,
        userId: user.id,
      });

      toast({
        title: "Configurações salvas",
        description: "As configurações de expansão foram atualizadas com sucesso.",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleRecalculate = async () => {
    try {
      await recalculate.mutateAsync();
      toast({
        title: "Recálculo concluído",
        description: "Todas as comissões de usuários foram recalculadas com sucesso.",
      });
    } catch (error) {
      console.error('Error recalculating:', error);
      toast({
        title: "Erro ao recalcular",
        description: "Não foi possível recalcular as comissões. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-6 w-6" />
              Configuração de Regras
            </CardTitle>
            <CardDescription>
              Painel administrativo para ajuste de parâmetros do sistema de expansão
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* Last Update Timestamp */}
            {settings?.updatedAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
                <Clock className="h-4 w-4" />
                <span>
                  Último recálculo: {format(new Date(settings.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            )}
            
            {/* Motor Status Badge */}
            {settings?.autoValidation && (
              <Badge variant="default" className="bg-primary hover:bg-primary/90">
                <Activity className="h-3 w-3 mr-1 animate-pulse" />
                Motor Ativo
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Base Commission */}
          <div className="space-y-2">
            <Label htmlFor="baseCommission">Comissão Base Padrão (%)</Label>
            <Input
              id="baseCommission"
              type="number"
              min={0}
              max={100}
              value={baseCommission}
              onChange={(e) => setBaseCommission(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Taxa aplicada para usuários sem grupos ativos
            </p>
          </div>

          {/* Min Commission */}
          <div className="space-y-2">
            <Label htmlFor="minCommission">Comissão Mínima (%)</Label>
            <Input
              id="minCommission"
              type="number"
              min={0}
              max={100}
              value={minCommission}
              onChange={(e) => setMinCommission(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Taxa mínima alcançável com máximo de grupos
            </p>
          </div>

          {/* Max Groups */}
          <div className="space-y-2">
            <Label htmlFor="maxGroups">Número Máximo de Grupos</Label>
            <Input
              id="maxGroups"
              type="number"
              min={1}
              max={20}
              value={maxGroups}
              onChange={(e) => setMaxGroups(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Limite de grupos por usuário para cálculo de comissão
            </p>
          </div>

          {/* Aggressive Expansion Toggle */}
          <div className="space-y-2">
            <Label>Modo Expansão Agressiva</Label>
            <div className="flex items-center space-x-2">
              <Switch
                id="aggressiveExpansion"
                checked={aggressiveExpansion}
                onCheckedChange={setAggressiveExpansion}
              />
              <Label htmlFor="aggressiveExpansion" className="font-normal">
                {aggressiveExpansion ? "Ativado" : "Desativado"}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Prioriza crescimento territorial sobre rentabilidade
            </p>
          </div>

          {/* Auto Validation Toggle */}
          <div className="space-y-2">
            <Label>Validação Automática Futura</Label>
            <div className="flex items-center space-x-2">
              <Switch
                id="autoValidation"
                checked={autoValidation}
                onCheckedChange={setAutoValidation}
              />
              <Label htmlFor="autoValidation" className="font-normal">
                {autoValidation ? "Ativado" : "Desativado"}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Habilita validação automática de novos grupos
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-end gap-3 flex-wrap">
          <Button 
            variant="outline" 
            onClick={handleRecalculate} 
            disabled={recalculate.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${recalculate.isPending ? 'animate-spin' : ''}`} />
            {recalculate.isPending ? "Recalculando..." : "Recalcular Agora"}
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending} size="lg">
            <Save className="h-4 w-4 mr-2" />
            {updateSettings.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
