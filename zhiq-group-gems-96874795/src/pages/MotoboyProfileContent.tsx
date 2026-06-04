import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MotoboyPageTemplate } from '@/components/motoboy/MotoboyPageTemplate';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { CreditCard, Calendar, User as UserIcon, Check, Phone, Bike, MapPin } from 'lucide-react';
import { brazilianStates } from '@/lib/brazilianStates';
import { isProfileRegistrationComplete } from '@/lib/profileValidation';
import { MathCaptchaDialog } from '@/components/ui/math-captcha-dialog';

const CAPACITY_OPTIONS = [
  { value: 'pequeno', label: 'Pequena (até 35L)' },
  { value: 'medio', label: 'Média (35-55L)' },
  { value: 'grande', label: 'Grande (55-80L)' },
  { value: 'extra_grande', label: 'Extra Grande (80L+)' },
] as const;

type CanonicalCapacity = typeof CAPACITY_OPTIONS[number]['value'] | '';

function normalizeCapacity(raw: string | null | undefined): CanonicalCapacity {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  if (CAPACITY_OPTIONS.some(o => o.value === lower)) return lower as CanonicalCapacity;
  if (lower.includes('extra') || lower.includes('80')) return 'extra_grande';
  if (lower.includes('grande') || lower.includes('55')) return 'grande';
  if (lower.includes('méd') || lower.includes('med') || lower.includes('35-55') || lower.includes('media')) return 'medio';
  if (lower.includes('peq') || lower.includes('35l')) return 'pequeno';
  return '';
}

const COLOR_OPTIONS = [
  { value: 'Preto', label: 'Preto' },
  { value: 'Branco', label: 'Branco' },
  { value: 'Prata', label: 'Prata' },
  { value: 'Vermelho', label: 'Vermelho' },
  { value: 'Azul', label: 'Azul' },
  { value: 'Verde', label: 'Verde' },
  { value: 'Amarelo', label: 'Amarelo' },
  { value: 'Outra', label: 'Outra' },
] as const;

interface MotoboyProfileData {
  whatsapp: string;
  cpf_cnpj: string;
  cidade: string;
  estado: string;
  bairro: string;
  veiculo_placa: string;
  veiculo_marca: string;
  veiculo_modelo: string;
  veiculo_ano: string;
  veiculo_cor: string;
  capacidade_bag: CanonicalCapacity;
  capacidade_garupa: CanonicalCapacity;
  // Dados Pessoais (de profiles)
  name: string;
  cpf: string;
  data_nascimento: string;
  avatar_url: string;
}

/**
 * Motoboy Profile Content — apenas dados operacionais e veículo.
 * Dados pessoais (nome, e-mail, avatar, CPF) ficam no Perfil Base (/profile).
 */
export default function MotoboyProfileContent() {
  const { user, activeProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);

  const [motoboyData, setMotoboyData] = useState<MotoboyProfileData>({
    whatsapp: '',
    cpf_cnpj: '',
    cidade: '',
    estado: '',
    bairro: '',
    veiculo_placa: '',
    veiculo_marca: '',
    veiculo_modelo: '',
    veiculo_ano: '',
    veiculo_cor: '',
    capacidade_bag: '',
    capacidade_garupa: '',
    name: '',
    cpf: '',
    data_nascimento: '',
    avatar_url: '',
  });

  const hydrateMotoboyData = (motoboy: any, profile?: any) => {
    if (!motoboy) return;
    setMotoboyData({
      whatsapp: motoboy.whatsapp || '',
      cpf_cnpj: motoboy.cpf_cnpj || '',
      cidade: motoboy.cidade || '',
      estado: motoboy.estado || '',
      bairro: motoboy.bairro || '',
      veiculo_placa: motoboy.veiculo_placa || '',
      veiculo_marca: motoboy.veiculo_marca || '',
      veiculo_modelo: motoboy.veiculo_modelo || '',
      veiculo_ano: motoboy.veiculo_ano?.toString() || '',
      veiculo_cor: motoboy.veiculo_cor || '',
      capacidade_bag: normalizeCapacity(motoboy.capacidade_bag),
      capacidade_garupa: normalizeCapacity(motoboy.capacidade_garupa),
      // Perfil (se disponível)
      name: profile?.name || '',
      cpf: profile?.cpf || '',
      data_nascimento: profile?.data_nascimento || '',
      avatar_url: profile?.avatar_url || '',
    });
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: motoboy } = await supabase
          .from('motoboy_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;
        hydrateMotoboyData(motoboy, profile);
      } catch (error) {
        console.error('Error fetching profile:', error);
        if (!cancelled) toast.error('Erro ao carregar perfil');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      const motoboyFields = {
        whatsapp: motoboyData.whatsapp,
        cpf_cnpj: motoboyData.cpf_cnpj,
        cidade: motoboyData.cidade,
        estado: motoboyData.estado,
        bairro: motoboyData.bairro || null,
        veiculo_placa: motoboyData.veiculo_placa,
        veiculo_marca: motoboyData.veiculo_marca,
        veiculo_modelo: motoboyData.veiculo_modelo,
        veiculo_ano: motoboyData.veiculo_ano ? parseInt(motoboyData.veiculo_ano) : null,
        veiculo_cor: motoboyData.veiculo_cor || null,
        capacidade_bag: normalizeCapacity(motoboyData.capacidade_bag) || null,
        capacidade_garupa: normalizeCapacity(motoboyData.capacidade_garupa) || null,
      };

      // 1. Atualizar Perfil Pessoal via RPC (para evitar RLS issues) ou direto
      const { error: profileError } = await supabase.rpc('update_user_profile', {
        p_name: motoboyData.name,
        p_cpf: motoboyData.cpf.replace(/\D/g, ''),
        p_data_nascimento: motoboyData.data_nascimento || null,
        p_avatar_url: motoboyData.avatar_url,
      });

      if (profileError) throw profileError;

      // 2. Atualizar Perfil Operacional
      const { data: existingRow } = await supabase
        .from('motoboy_profiles')
        .select('id, region_id')
        .eq('user_id', user.id)
        .maybeSingle();

      let savedMotoboy: any = null;
      if (existingRow) {
        const { data, error } = await supabase
          .from('motoboy_profiles')
          .update(motoboyFields)
          .eq('user_id', user.id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        savedMotoboy = data;
      } else {
        const regionId = 'fe784974-f428-45a0-8d67-c09bdb33c5ca';
        const { data, error } = await supabase
          .from('motoboy_profiles')
          .insert({ ...motoboyFields, user_id: user.id, region_id: regionId })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        savedMotoboy = data;
      }

      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      hydrateMotoboyData(savedMotoboy, updatedProfile);
      toast.success('Perfil operacional e pessoal atualizados!');

      // Após salvar, marcar onboarding como concluído se completo
      const profileType = activeProfile || 'motoboy';
      const { complete } = await isProfileRegistrationComplete(user.id, profileType);
      if (complete) {
        await supabase.rpc('complete_profile_onboarding' as any, {
          p_profile_type: profileType,
        });

        const basePath = profileType === 'mototaxi' ? '/mototaxi' : '/motoboy';
        navigate(basePath, { replace: true });
        return;
      }
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(`Erro ao salvar: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-motoboy border-t-transparent" />
      </div>
    );
  }

  return (
    <MotoboyPageTemplate title="Perfil Operacional" icon={Bike}>

      {/* Perfil Pessoal */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-motoboy" />
            Perfil Pessoal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center pb-2">
            <AvatarUpload
              userId={user.id}
              currentAvatarUrl={motoboyData.avatar_url}
              userName={motoboyData.name}
              onUploadComplete={(url) => setMotoboyData({ ...motoboyData, avatar_url: url })}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Nome Completo</Label>
              <Input
                value={motoboyData.name}
                onChange={(e) => setMotoboyData({ ...motoboyData, name: e.target.value })}
                placeholder="Seu nome"
                className="mt-1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CPF</Label>
              <Input
                value={motoboyData.cpf}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11);
                  let formatted = cleaned;
                  if (cleaned.length > 3) formatted = `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
                  if (cleaned.length > 6) formatted = `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
                  if (cleaned.length > 9) formatted = `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
                  setMotoboyData({ ...motoboyData, cpf: formatted });
                }}
                placeholder="000.000.000-00"
                className="mt-1"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Data de Nascimento</Label>
            <Input
              type="date"
              value={motoboyData.data_nascimento}
              onChange={(e) => setMotoboyData({ ...motoboyData, data_nascimento: e.target.value })}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Dados Operacionais */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-motoboy" />
            Dados Operacionais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">WhatsApp</Label>
            <Input
              value={motoboyData.whatsapp}
              onChange={(e) => setMotoboyData({ ...motoboyData, whatsapp: e.target.value })}
              placeholder="(00) 00000-0000"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Estado de Atuação</Label>
              <Select
                value={motoboyData.estado}
                onValueChange={(v) => setMotoboyData({ ...motoboyData, estado: v })}
              >
                <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  {brazilianStates.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-foreground">{s.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cidade de Atuação</Label>
              <Input
                value={motoboyData.cidade}
                onChange={(e) => setMotoboyData({ ...motoboyData, cidade: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Bairro de Atuação</Label>
            <Input
              value={motoboyData.bairro}
              onChange={(e) => setMotoboyData({ ...motoboyData, bairro: e.target.value })}
              placeholder="Ex: Centro, Jardim América..."
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Localização Parcial (baseada no cadastro) */}
      {(motoboyData.cidade || motoboyData.estado || motoboyData.bairro) && (
        <Card className="bg-white border-l-4 border-l-green-500">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">Localização de Atuação</p>
                <p className="text-sm font-bold text-foreground truncate">
                  {[motoboyData.bairro, motoboyData.cidade, motoboyData.estado].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vehicle Info */}
      <Card className="bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bike className="h-4 w-4 text-motoboy" />
            Veículo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Placa</Label>
              <Input
                value={motoboyData.veiculo_placa}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_placa: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Ano</Label>
              <Input
                value={motoboyData.veiculo_ano}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_ano: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Marca</Label>
              <Input
                value={motoboyData.veiculo_marca}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_marca: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Modelo</Label>
              <Input
                value={motoboyData.veiculo_modelo}
                onChange={(e) => setMotoboyData({ ...motoboyData, veiculo_modelo: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Cor da Moto *</Label>
            <Select 
              value={motoboyData.veiculo_cor} 
              onValueChange={(v) => setMotoboyData({ ...motoboyData, veiculo_cor: v })}
            >
              <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                <SelectValue placeholder="Selecione a cor" />
              </SelectTrigger>
              <SelectContent className="bg-background text-foreground border-border">
                {COLOR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-foreground">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Capacidade da Bag</Label>
              <Select 
                value={motoboyData.capacidade_bag} 
                onValueChange={(v) => setMotoboyData({ ...motoboyData, capacidade_bag: v as CanonicalCapacity })}
              >
                <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  {CAPACITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-foreground">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Capacidade da Garupa</Label>
              <Select 
                value={motoboyData.capacidade_garupa} 
                onValueChange={(v) => setMotoboyData({ ...motoboyData, capacidade_garupa: v as CanonicalCapacity })}
              >
                <SelectTrigger className="mt-1 text-foreground bg-background border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-background text-foreground border-border">
                  {CAPACITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-foreground">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={() => setCaptchaOpen(true)}
        disabled={isSaving}
        className="w-full bg-motoboy hover:bg-motoboy-hover text-white"
      >
        <Check className="h-4 w-4 mr-2" />
        {isSaving ? 'Salvando...' : 'Salvar Perfil Operacional'}
      </Button>

      <MathCaptchaDialog
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onConfirmed={handleSave}
        title="Confirme para salvar seu perfil"
        description="Por segurança, resolva a soma abaixo antes de alterar seus dados pessoais."
      />
    </MotoboyPageTemplate>
  );
}
