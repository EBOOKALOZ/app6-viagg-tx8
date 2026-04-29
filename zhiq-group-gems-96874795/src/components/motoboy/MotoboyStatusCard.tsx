import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bike, Package, MapPin, Backpack, Edit2, Check, X, Car, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
interface MotoboyProfile {
  cidade: string | null;
  estado: string | null;
  is_online: boolean;
  is_approved: boolean;
  tipo_transporte: string | null;
  capacidade_bag: string | null;
  capacidade_garupa: string | null;
  veiculo_modelo: string | null;
  veiculo_cor: string | null;
  veiculo_placa: string | null;
  veiculo_ano: number | null;
}

interface CommissionInfo {
  activeGroups: number;
  taxaPercentual: number;
}

// Opções de capacidade de carga APENAS para motoboy (valores válidos no banco)
const CAPACIDADE_BAG_OPTIONS = [
  { value: 'bag', label: '🎒 Bag' },
  { value: 'garupa', label: '🏍️ Garupa (carga pequena)' },
  { value: 'bag_garupa', label: '🎒🏍️ Bag + Garupa' },
];

const CAPACIDADE_LABELS: Record<string, string> = {
  bag: 'Bag',
  garupa: 'Garupa',
  bag_garupa: 'Bag + Garupa',
};

export default function MotoboyStatusCard() {
  const { user, displayName, providerRole, activeProfile } = useAuth();
  const [profile, setProfile] = useState<MotoboyProfile | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [commissionInfo, setCommissionInfo] = useState<CommissionInfo>({ activeGroups: 0, taxaPercentual: 25 });
  
  // ISOLAMENTO: Determinar perfil ativo para condicionar UI
  const isMotoboy = activeProfile === 'motoboy';
  const isMototaxi = activeProfile === 'mototaxi';
  
  // Edit form state
  const [tipoTransporte, setTipoTransporte] = useState<string>('');
  const [veiculoModelo, setVeiculoModelo] = useState<string>('');
  const [veiculoCor, setVeiculoCor] = useState<string>('');
  const [veiculoPlaca, setVeiculoPlaca] = useState<string>('');
  const [veiculoAno, setVeiculoAno] = useState<string>('');

  useEffect(() => {
    if (user) {
      loadProfile();
      loadCommissionInfo();
    }
  }, [user]);

  // ISOLAMENTO: Comissão só é relevante para motoboy (grupos de entrega)
  const loadCommissionInfo = async () => {
    if (!user || !isMotoboy) return;
    try {
      // Buscar grupos ativos
      const { count } = await supabase
        .from('motoboy_whatsapp_groups')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'ativo');
      
      const activeGroups = count || 0;
      
      // Calcular taxa de comissão com base em grupos ativos (COMANDO 17)
      const { calculateCommissionRate } = await import('@/lib/api');
      const taxaPercentual = calculateCommissionRate(activeGroups);
      
      setCommissionInfo({ activeGroups, taxaPercentual });
    } catch (err) {
      console.error('Erro ao carregar info de comissão:', err);
    }
  };

  const loadProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('motoboy_profiles')
        .select('cidade, estado, is_online, is_approved, tipo_transporte, capacidade_bag, capacidade_garupa, veiculo_modelo, veiculo_cor, veiculo_placa, veiculo_ano')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setProfile(data);
        
        setTipoTransporte(data.tipo_transporte || '');
        setVeiculoModelo(data.veiculo_modelo || '');
        setVeiculoCor(data.veiculo_cor || '');
        setVeiculoPlaca(data.veiculo_placa || '');
        setVeiculoAno(data.veiculo_ano?.toString() || '');
      } else {
        // Create profile if it doesn't exist
        const { error: insertError } = await supabase
          .from('motoboy_profiles')
          .insert([{ user_id: user.id }] as any);
        
        if (!insertError) {
          setProfile({ 
            cidade: null, 
            estado: null, 
            is_online: false, 
            is_approved: false,
            tipo_transporte: null,
            capacidade_bag: null,
            capacidade_garupa: null,
            veiculo_modelo: null,
            veiculo_cor: null,
            veiculo_placa: null,
            veiculo_ano: null
          });
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Status é implícito: logado = disponível (backend-driven)

  const handleSaveCapacity = async () => {
    if (!user) return;
    
    // Validação simples - apenas verifica se selecionou um tipo
    if (!tipoTransporte) {
      toast.error('Selecione a capacidade de transporte');
      return;
    }

    setIsSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        tipo_transporte: tipoTransporte,
        veiculo_modelo: veiculoModelo || null,
        veiculo_cor: veiculoCor || null,
        veiculo_placa: veiculoPlaca || null,
        veiculo_ano: veiculoAno ? parseInt(veiculoAno, 10) : null,
      };

      const { error } = await supabase
        .from('motoboy_profiles')
        .update(updateData)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setProfile(prev => prev ? { 
        ...prev, 
        tipo_transporte: tipoTransporte,
        veiculo_modelo: veiculoModelo || null,
        veiculo_cor: veiculoCor || null,
        veiculo_placa: veiculoPlaca || null,
        veiculo_ano: veiculoAno ? parseInt(veiculoAno, 10) : null,
      } : null);
      setIsEditing(false);
      toast.success('Dados da moto atualizados!');
    } catch (error) {
      console.error('Error saving capacity:', error);
      toast.error('Erro ao salvar dados');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setTipoTransporte(profile?.tipo_transporte || '');
    setVeiculoModelo(profile?.veiculo_modelo || '');
    setVeiculoCor(profile?.veiculo_cor || '');
    setVeiculoPlaca(profile?.veiculo_placa || '');
    setVeiculoAno(profile?.veiculo_ano?.toString() || '');
    setIsEditing(false);
  };

  const toggleOnline = async () => {
    if (!user || !profile) return;
    
    const newStatus = !profile.is_online;
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('motoboy_profiles')
        .update({ is_online: newStatus })
        .eq('user_id', user.id);

      if (error) throw error;
      
      setProfile(prev => prev ? { ...prev, is_online: newStatus } : null);
      toast.success(newStatus ? 'Você está ONLINE! 🛵' : 'Você está OFFLINE.');
    } catch (err) {
      console.error('Error toggling online status:', err);
      toast.error('Erro ao mudar status');
    } finally {
      setIsSaving(false);
    }
  };

  const roleLabel = isMototaxi ? 'Moto-táxi' : isMotoboy ? 'Motoboy' : providerRole === 'motorista' ? 'Motorista' : 'Motoboy';
  const firstName = displayName?.split(' ')[0] || roleLabel;
  
  // Capacidade de carga só é relevante para motoboy (não mototaxi/motorista)
  const capacidadeOptions = CAPACIDADE_BAG_OPTIONS;
  
  // Verifica se o cadastro da moto está completo
  const isRegistrationComplete = isMotoboy 
    ? !!(profile?.veiculo_modelo && profile?.veiculo_cor && profile?.veiculo_placa && profile?.veiculo_ano && profile?.tipo_transporte)
    : !!(profile?.veiculo_modelo && profile?.veiculo_cor && profile?.veiculo_placa && profile?.veiculo_ano);
  
  const getVehicleDisplay = () => {
    const parts = [];
    if (profile?.veiculo_modelo) parts.push(profile.veiculo_modelo);
    if (profile?.veiculo_cor) parts.push(profile.veiculo_cor);
    if (profile?.veiculo_ano) parts.push(profile.veiculo_ano);
    return parts.length > 0 ? parts.join(' • ') : null;
  };

  const RoleIcon = isMototaxi ? Bike : isMotoboy ? Bike : providerRole === 'motorista' ? Car : Bike;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-motoboy-light">
              <RoleIcon className="h-7 w-7 text-motoboy" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Olá, {firstName}!</h2>
              {profile?.cidade && profile?.estado && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3" />
                  {profile.cidade}, {profile.estado}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={profile?.is_online ? "default" : "secondary"} className={`text-xs ${profile?.is_online ? 'bg-green-500 hover:bg-green-600' : ''}`}>
                  {profile?.is_online ? 'Disponível' : 'Offline'}
                </Badge>
                {isRegistrationComplete ? (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                    Cadastro OK
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
                    Pendente
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Button 
            variant={profile?.is_online ? "destructive" : "default"}
            className={profile?.is_online ? "" : "bg-green-600 hover:bg-green-700"}
            onClick={toggleOnline}
            disabled={isSaving || !profile}
          >
            {profile?.is_online ? 'Ficar Offline' : 'Ficar Online'}
          </Button>
        </div>

        {/* Moto + Capacidade Section - APENAS para motoboy */}
        {isMotoboy && (
          <div className="mt-6 p-4 rounded-lg border bg-motoboy-light">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bike className="h-4 w-4 text-motoboy" />
                <span className="font-medium text-sm">Minha Moto</span>
              </div>
              {!isEditing && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsEditing(true)}
                  className="h-7 px-2"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Editar
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Modelo</Label>
                    <Input 
                      value={veiculoModelo} 
                      onChange={(e) => setVeiculoModelo(e.target.value)}
                      placeholder="Ex: CG 160"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cor</Label>
                    <Input 
                      value={veiculoCor} 
                      onChange={(e) => setVeiculoCor(e.target.value)}
                      placeholder="Ex: Preta"
                      className="h-9"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Placa</Label>
                    <Input 
                      value={veiculoPlaca} 
                      onChange={(e) => setVeiculoPlaca(e.target.value.toUpperCase())}
                      placeholder="ABC1D23"
                      className="h-9"
                      maxLength={7}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ano</Label>
                    <Input 
                      value={veiculoAno} 
                      onChange={(e) => setVeiculoAno(e.target.value.replace(/\D/g, ''))}
                      placeholder="2020"
                      className="h-9"
                      maxLength={4}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Capacidade de Transporte *</Label>
                  <Select value={tipoTransporte} onValueChange={setTipoTransporte}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {capacidadeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleSaveCapacity}
                    disabled={isSaving}
                    className="flex-1"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Salvar
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {getVehicleDisplay() && (
                  <p className="text-sm text-foreground">
                    🏍️ {getVehicleDisplay()}
                    {profile?.veiculo_placa && <span className="ml-2 font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{profile.veiculo_placa}</span>}
                  </p>
                )}
                {profile?.tipo_transporte ? (
                  <div className="flex items-center gap-2">
                    <Backpack className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs">
                      {CAPACIDADE_LABELS[profile.tipo_transporte] || profile.tipo_transporte}
                    </Badge>
                  </div>
                ) : null}
                {!profile?.tipo_transporte && !getVehicleDisplay() && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    ⚠️ Configure sua moto para receber chamadas de entrega
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick Stats - diferente por perfil */}
        {isMotoboy ? (
          // MOTOBOY: Stats de entrega + grupos + comissão
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold text-foreground">0</p>
                <p className="text-xs text-muted-foreground">Entregas</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Bike className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold text-foreground">R$ 0</p>
                <p className="text-xs text-muted-foreground">Bruto</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold text-foreground">{commissionInfo.activeGroups}/6</p>
                <p className="text-xs text-muted-foreground">Grupos ativos</p>
              </div>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${commissionInfo.taxaPercentual <= 10 ? 'bg-green-500/10 border-green-500/30' : 'bg-primary/10 border-primary/20'}`}>
              <div className={`flex h-5 w-5 items-center justify-center font-bold text-xs ${commissionInfo.taxaPercentual <= 10 ? 'text-green-500' : 'text-primary'}`}>%</div>
              <div>
                <p className={`text-lg font-bold ${commissionInfo.taxaPercentual <= 10 ? 'text-green-500' : 'text-primary'}`}>{commissionInfo.taxaPercentual}%</p>
                <p className="text-xs text-muted-foreground">Taxa Viagg-TX8</p>
              </div>
            </div>
          </div>
        ) : (
          // MOTOTAXI: Stats de corridas apenas
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold text-foreground">0</p>
                <p className="text-xs text-muted-foreground">Corridas</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Bike className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold text-foreground">R$ 0</p>
                <p className="text-xs text-muted-foreground">Ganhos</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
