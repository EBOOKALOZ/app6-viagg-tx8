import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { User, Mail, MapPin, Calendar, Building, Check, CreditCard, Phone, Truck, Bike, Store, Camera, Upload, Loader2, ChevronsUpDown } from 'lucide-react';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { brazilianStates } from '@/lib/brazilianStates';
import { getProfileConfig } from '@/lib/profileTypes';
import { SoundtrackToggle } from '@/components/SoundtrackToggle';
import { useStoreCategories } from '@/hooks/useStoreCategories';
import { StoreLocationPicker } from '@/components/merchant/StoreLocationPicker';
import { cn } from '@/lib/utils';
import type { CategoryGroup } from '@/hooks/useStoreCategories';

interface BaseProfileData {
  name: string;
  email: string;
  data_nascimento: string;
  cidade: string;
  estado: string;
  avatar_url: string;
  cpf: string;
}

interface DriverProfileData {
  whatsapp: string;
  cpf_cnpj: string;
  cidade: string;
  estado: string;
  veiculo_placa: string;
  veiculo_marca: string;
  veiculo_modelo: string;
  veiculo_cor: string;
  veiculo_ano: string;
}

interface MotoboyProfileData {
  whatsapp: string;
  cpf_cnpj: string;
  cidade: string;
  estado: string;
  veiculo_placa: string;
  veiculo_marca: string;
  veiculo_modelo: string;
  veiculo_ano: string;
  capacidade_bag: string;
}

interface MerchantStoreData {
  id?: string;
  nome_loja: string;
  logo_url: string | null;
  cpf_cnpj: string;
  categoria: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  endereco_formatado: string | null;
}

function CategoryCombobox({ value, onChange, groupedCategories, isLoading }: {
  value: string;
  onChange: (v: string) => void;
  groupedCategories: CategoryGroup[];
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const allItems = useMemo(() =>
    groupedCategories.flatMap(g => g.children.map(c => ({ slug: c.slug, nome: c.nome }))),
    [groupedCategories]
  );
  const selectedLabel = allItems.find(i => i.slug === value)?.nome || value || '';
  return (
    <div className="space-y-2">
      <Label>Categoria</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} disabled={isLoading} className="w-full justify-between font-normal h-10">
            <span className="truncate">{isLoading ? 'Carregando...' : selectedLabel || 'Selecione uma categoria'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar categoria..." />
            <CommandList>
              <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
              {groupedCategories.map((group) => (
                <CommandGroup key={group.parent.id} heading={group.parent.nome}>
                  {group.children.map((cat) => (
                    <CommandItem key={cat.id} value={cat.nome} onSelect={() => { onChange(cat.slug); setOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", value === cat.slug ? "opacity-100" : "opacity-0")} />
                      {cat.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}


const formatCPF = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCEP = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export default function Profile() {
  const { user, activeProfile, availableProfiles, enableProfile, refreshProfiles } = useAuth();
  const { groupedCategories, isLoading: categoriesLoading } = useStoreCategories();

  const [baseData, setBaseData] = useState<BaseProfileData>({
    name: '',
    email: '',
    data_nascimento: '',
    cidade: '',
    estado: '',
    avatar_url: '',
    cpf: '',
  });

  const [driverData, setDriverData] = useState<DriverProfileData>({
    whatsapp: '',
    cpf_cnpj: '',
    cidade: '',
    estado: '',
    veiculo_placa: '',
    veiculo_marca: '',
    veiculo_modelo: '',
    veiculo_cor: '',
    veiculo_ano: '',
  });

  const [motoboyData, setMotoboyData] = useState<MotoboyProfileData>({
    whatsapp: '',
    cpf_cnpj: '',
    cidade: '',
    estado: '',
    veiculo_placa: '',
    veiculo_marca: '',
    veiculo_modelo: '',
    veiculo_ano: '',
    capacidade_bag: '',
  });

  const [merchantData, setMerchantData] = useState<MerchantStoreData>({
    nome_loja: '',
    logo_url: null,
    cpf_cnpj: '',
    categoria: null,
    cep: null,
    rua: null,
    numero: null,
    bairro: null,
    cidade: null,
    estado: null,
    latitude: null,
    longitude: null,
    endereco_formatado: null,
  });
  const [merchantExistingId, setMerchantExistingId] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingMerchant, setIsSavingMerchant] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profileRecordId, setProfileRecordId] = useState<string | null>(null);

  const profileConfig = activeProfile ? getProfileConfig(activeProfile) : null;

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;

      setIsLoading(true);

      // Always fetch base profile data
      const { data: baseProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (baseProfile) {
        const profile = baseProfile as Record<string, unknown>;
        setBaseData({
          name: (profile.name as string) || '',
          email: (profile.email as string) || user.email || '',
          data_nascimento: (profile.data_nascimento as string) || '',
          cidade: (profile.cidade as string) || '',
          estado: (profile.estado as string) || '',
          avatar_url: (profile.avatar_url as string) || '',
          cpf: (profile.cpf as string) || '',
        });
      } else {
        setBaseData(prev => ({
          ...prev,
          email: user.email || '',
        }));
      }

      // Fetch specific profile data based on activeProfile
      if (activeProfile === 'driver') {
        const { data } = await supabase
          .from('driver_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          setProfileRecordId(data.id);
          setDriverData({
            whatsapp: data.whatsapp || '',
            cpf_cnpj: data.cpf_cnpj || '',
            cidade: data.cidade || '',
            estado: data.estado || '',
            veiculo_placa: data.veiculo_placa || '',
            veiculo_marca: data.veiculo_marca || '',
            veiculo_modelo: data.veiculo_modelo || '',
            veiculo_cor: data.veiculo_cor || '',
            veiculo_ano: data.veiculo_ano?.toString() || '',
          });
        }
      } else if (activeProfile === 'motoboy') {
        const { data } = await supabase
          .from('motoboy_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          setProfileRecordId(data.id);
          setMotoboyData({
            whatsapp: data.whatsapp || '',
            cpf_cnpj: data.cpf_cnpj || '',
            cidade: data.cidade || '',
            estado: data.estado || '',
            veiculo_placa: data.veiculo_placa || '',
            veiculo_marca: data.veiculo_marca || '',
            veiculo_modelo: data.veiculo_modelo || '',
            veiculo_ano: data.veiculo_ano?.toString() || '',
            capacidade_bag: data.capacidade_bag || '',
          });
        }
      } else if (activeProfile === 'merchant') {
        const { data: profileData, error: profileError } = await (supabase.from('profiles') as any)
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Erro CRÍTICO ao buscar profiles em Profile:", profileError.message);
        } else if (profileData) {
          console.log("SUCESSO: Dados brutos resgatados da profiles (Profile):", profileData);
        }

        const getSafeCoord = (profVal: any) => {
          if (profVal !== undefined && profVal !== null) return Number(profVal);
          return null;
        };

        if (profileData) {
          setMerchantExistingId(user.id);
          setMerchantData(prev => ({
            ...prev,
            id: user.id,
            logo_url: profileData.logo_url || '',
            nome_loja: profileData.nome_loja || profileData.name || '',
            cpf_cnpj: profileData.cpf_cnpj || profileData.cnpj || profileData.cpf || '',
            categoria: profileData.categoria || '',
            cep: profileData.cep || '',
            rua: profileData.rua || '',
            numero: profileData.numero || '',
            bairro: profileData.bairro || '',
            cidade: profileData.cidade || '',
            estado: profileData.estado || '',
            latitude: getSafeCoord(profileData.store_latitude),
            longitude: getSafeCoord(profileData.store_longitude),
            endereco_formatado: profileData.store_address || null,
          }));
        }
      }

      setIsLoading(false);
    }

    fetchProfile();
  }, [user, activeProfile]);

  const handleBaseChange = (field: keyof BaseProfileData, value: string) => {
    setBaseData(prev => ({ ...prev, [field]: value }));
  };

  const handleDriverChange = (field: keyof DriverProfileData, value: string) => {
    setDriverData(prev => ({ ...prev, [field]: value }));
  };

  const handleMotoboyChange = (field: keyof MotoboyProfileData, value: string) => {
    setMotoboyData(prev => ({ ...prev, [field]: value }));
  };

  const handleMerchantChange = (field: keyof MerchantStoreData, value: string | number | null) => {
    setMerchantData(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem válida'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('A imagem deve ter no máximo 2MB'); return; }

    setIsUploadingLogo(true);
    try {
      // 1. Garantir que o upload só ocorra após confirmar que o usuário está autenticado
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error('Usuário não autenticado ou sessão expirada.');
      }

      const userId = authData.user.id;
      const fileExt = file.name.split('.').pop() || 'png';
      const timestamp = Date.now();

      // 2. Usar um path válido no formato: logos/{user.id}/logo-{timestamp}.png
      const fileName = `logos/${userId}/logo-${timestamp}.${fileExt}`;

      // 3. Fazer upload para o bucket logos_lojas com upsert: true
      const { error: uploadError } = await supabase.storage
        .from('logos_lojas')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error('[Upload Logo] Supabase Storage Error:', uploadError.message, uploadError);
        throw new Error(uploadError.message || 'Falha no upload da logo');
      }

      // 4. Gerar a URL pública e exibir a imagem
      const { data: { publicUrl } } = supabase.storage
        .from('logos_lojas')
        .getPublicUrl(fileName);

      const { error: updateError } = await (supabase.from('profiles') as any)
        .update({ logo_url: publicUrl })
        .eq('id', userId);

      if (updateError) {
        console.error('[Upload Logo] Falha ao salvar URL no profile:', updateError);
        throw new Error('Upload concluído, mas falha ao vincular logo à loja.');
      }

      setMerchantData(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo enviada e salva com sucesso!');
    } catch (error: any) {
      console.error('[Upload Logo] Exception:', error);
      toast.error(error.message || 'Erro ao enviar logo da loja');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleCepBlur = async () => {
    const cep = merchantData.cep?.replace(/\D/g, '');
    if (!cep || cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setMerchantData(prev => ({
          ...prev,
          rua: data.logradouro || prev.rua,
          bairro: data.bairro || prev.bairro,
          cidade: data.localidade || prev.cidade,
          estado: data.uf || prev.estado,
        }));
      }
    } catch { }
  };

  const formatCPFCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return numbers.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const handleSaveMerchant = async () => {
    if (!merchantData.nome_loja.trim()) { toast.error('Nome da loja é obrigatório'); return; }
    if (!merchantData.cpf_cnpj.trim()) { toast.error('CPF ou CNPJ é obrigatório'); return; }
    if (merchantData.latitude === null || merchantData.longitude === null) {
      toast.error('Defina a localização da loja no mapa para continuar.');
      return;
    }
    setIsSavingMerchant(true);
    const isFirstSave = !merchantExistingId;

    // --- DIAGNÓSTICO TEMPORÁRIO SUPABASE (Pedido User) ---
    console.warn("=== INFO DE CONEXÃO SUPABASE (DIAGNÓSTICO) ===");
    console.log("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL);
    console.log("Supabase Client URL:", supabase['supabaseUrl']);
    console.warn("===============================================");

    try {
      const dataToSave = {
        store_latitude: merchantData.latitude,
        store_longitude: merchantData.longitude,
        store_address: merchantData.endereco_formatado,
        nome_loja: merchantData.nome_loja,
        cpf_cnpj: merchantData.cpf_cnpj,
        categoria: merchantData.categoria,
        cep: merchantData.cep,
        rua: merchantData.rua,
        numero: merchantData.numero,
        bairro: merchantData.bairro,
        cidade: merchantData.cidade,
        estado: merchantData.estado
      };

      let saveError;

      const { error } = await (supabase.from('profiles') as any).update(dataToSave).eq('id', user!.id);
      saveError = error;

      if (saveError) throw saveError;

      if (isFirstSave && !availableProfiles.includes('merchant')) {
        await enableProfile('merchant');
        await refreshProfiles();
        toast.success('Loja cadastrada e perfil Lojista ativado!', { duration: 4000 });
      } else {
        toast.success('Dados da loja salvos com sucesso!', { duration: 4000 });
      }
    } catch (error: any) {
      console.error('Error saving store data:', error);
      toast.error(`Falha no banco de dados: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setIsSavingMerchant(false);
    }
  };

  const handleAvatarUpload = (url: string) => {
    setBaseData(prev => ({ ...prev, avatar_url: url }));
  };

  const validateBirthDate = (dateStr: string): boolean => {
    if (!dateStr) return true;
    const date = new Date(dateStr);
    const today = new Date();
    return date <= today;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!validateBirthDate(baseData.data_nascimento)) {
      toast.error('A data de nascimento não pode ser uma data futura');
      return;
    }

    setIsSaving(true);

    try {
      const baseUpdateData: Record<string, unknown> = {
        name: baseData.name || null,
        cidade: baseData.cidade || null,
        estado: baseData.estado || null,
        avatar_url: baseData.avatar_url || null,
        cpf: baseData.cpf.replace(/\D/g, '') || null,
        updated_at: new Date().toISOString(),
      };

      if (baseData.data_nascimento) {
        baseUpdateData.data_nascimento = baseData.data_nascimento;
      }

      const { error: baseError } = await supabase
        .from('profiles')
        .update(baseUpdateData)
        .eq('id', user.id);

      if (baseError) throw baseError;

      if (activeProfile === 'driver') {
        const driverUpdateData = {
          whatsapp: driverData.whatsapp.replace(/\D/g, '') || null,
          cpf_cnpj: driverData.cpf_cnpj.replace(/\D/g, '') || null,
          cidade: driverData.cidade || null,
          estado: driverData.estado || null,
          veiculo_placa: driverData.veiculo_placa || null,
          veiculo_marca: driverData.veiculo_marca || null,
          veiculo_modelo: driverData.veiculo_modelo || null,
          veiculo_cor: driverData.veiculo_cor || null,
          veiculo_ano: driverData.veiculo_ano ? parseInt(driverData.veiculo_ano) : null,
          updated_at: new Date().toISOString(),
        };

        if (profileRecordId) {
          const { error } = await supabase.from('driver_profiles').update(driverUpdateData).eq('id', profileRecordId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('driver_profiles').insert({ ...driverUpdateData, user_id: user.id });
          if (error) throw error;
        }
      } else if (activeProfile === 'motoboy') {
        const motoboyUpdateData = {
          whatsapp: motoboyData.whatsapp.replace(/\D/g, '') || null,
          cpf_cnpj: motoboyData.cpf_cnpj.replace(/\D/g, '') || null,
          cidade: motoboyData.cidade || null,
          estado: motoboyData.estado || null,
          veiculo_placa: motoboyData.veiculo_placa || null,
          veiculo_marca: motoboyData.veiculo_marca || null,
          veiculo_modelo: motoboyData.veiculo_modelo || null,
          veiculo_ano: motoboyData.veiculo_ano ? parseInt(motoboyData.veiculo_ano) : null,
          capacidade_bag: motoboyData.capacidade_bag || null,
          updated_at: new Date().toISOString(),
        };

        if (profileRecordId) {
          const { error } = await supabase.from('motoboy_profiles').update(motoboyUpdateData).eq('id', profileRecordId);
          if (error) throw error;
        } else {
          const { error } = await (supabase.from('motoboy_profiles').insert([{ ...motoboyUpdateData, user_id: user.id, region_id: motoboyData.estado || 'BR' }]) as any);
          if (error) throw error;
        }
      }

      toast.success('Perfil atualizado com sucesso!');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Erro ao salvar perfil');
    }

    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  const ProfileIcon = profileConfig?.icon || User;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ProfileIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {profileConfig ? `Perfil ${profileConfig.label}` : 'Meu Perfil'}
            </h1>
            <p className="text-muted-foreground">
              {activeProfile
                ? `Editando dados do perfil ${profileConfig?.label?.toLowerCase()}`
                : 'Gerencie suas informações pessoais'
              }
            </p>
          </div>
        </div>

        {/* Avatar Section */}
        <Card>
          <CardContent className="pt-6">
            <AvatarUpload
              userId={user?.id || ''}
              currentAvatarUrl={baseData.avatar_url}
              userName={baseData.name}
              onUploadComplete={handleAvatarUpload}
            />
          </CardContent>
        </Card>

        {/* Base Profile Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              {/* Email - Read Only */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  E-mail
                </Label>
                <Input
                  id="email"
                  value={baseData.email}
                  disabled
                  className="bg-muted"
                />
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Nome Completo
                </Label>
                <Input
                  id="name"
                  value={baseData.name}
                  onChange={(e) => handleBaseChange('name', e.target.value)}
                  placeholder="Seu nome completo"
                  maxLength={100}
                />
              </div>

              {/* CPF */}
              <div className="space-y-2">
                <Label htmlFor="cpf" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  CPF
                </Label>
                <Input
                  id="cpf"
                  value={formatCPF(baseData.cpf)}
                  onChange={(e) => handleBaseChange('cpf', e.target.value.replace(/\D/g, ''))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>

              {/* Birth Date */}
              <div className="space-y-2">
                <Label htmlFor="data_nascimento" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data de Nascimento
                </Label>
                <Input
                  id="data_nascimento"
                  type="date"
                  value={baseData.data_nascimento}
                  onChange={(e) => handleBaseChange('data_nascimento', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* City - Base */}
              <div className="space-y-2">
                <Label htmlFor="cidade" className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Cidade
                </Label>
                <Input
                  id="cidade"
                  value={baseData.cidade}
                  onChange={(e) => handleBaseChange('cidade', e.target.value)}
                  placeholder="Sua cidade"
                  maxLength={100}
                />
              </div>

              {/* State - Base */}
              <div className="space-y-2">
                <Label htmlFor="estado" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Estado
                </Label>
                <Select
                  value={baseData.estado}
                  onValueChange={(value) => handleBaseChange('estado', value)}
                >
                  <SelectTrigger id="estado">
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {brazilianStates.map((state) => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Driver-specific fields */}
              {activeProfile === 'driver' && (
                <>
                  <div className="border-t pt-5 mt-5">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground mb-4">
                      <Truck className="h-5 w-5 text-primary" />
                      Dados do Motorista
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="whatsapp" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </Label>
                    <Input
                      id="whatsapp"
                      value={formatPhone(driverData.whatsapp)}
                      onChange={(e) => handleDriverChange('whatsapp', e.target.value)}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="driver_cidade">Cidade de Atuação</Label>
                    <Input
                      id="driver_cidade"
                      value={driverData.cidade}
                      onChange={(e) => handleDriverChange('cidade', e.target.value)}
                      placeholder="Cidade onde trabalha"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="driver_estado">Estado de Atuação</Label>
                    <Select
                      value={driverData.estado}
                      onValueChange={(value) => handleDriverChange('estado', value)}
                    >
                      <SelectTrigger id="driver_estado">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_marca">Marca do Veículo</Label>
                      <Input
                        id="veiculo_marca"
                        value={driverData.veiculo_marca}
                        onChange={(e) => handleDriverChange('veiculo_marca', e.target.value)}
                        placeholder="Ex: Fiat"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_modelo">Modelo</Label>
                      <Input
                        id="veiculo_modelo"
                        value={driverData.veiculo_modelo}
                        onChange={(e) => handleDriverChange('veiculo_modelo', e.target.value)}
                        placeholder="Ex: Uno"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_cor">Cor</Label>
                      <Input
                        id="veiculo_cor"
                        value={driverData.veiculo_cor}
                        onChange={(e) => handleDriverChange('veiculo_cor', e.target.value)}
                        placeholder="Ex: Prata"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="veiculo_ano">Ano</Label>
                      <Input
                        id="veiculo_ano"
                        value={driverData.veiculo_ano}
                        onChange={(e) => handleDriverChange('veiculo_ano', e.target.value)}
                        placeholder="Ex: 2020"
                        maxLength={4}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="veiculo_placa">Placa do Veículo</Label>
                    <Input
                      id="veiculo_placa"
                      value={driverData.veiculo_placa}
                      onChange={(e) => handleDriverChange('veiculo_placa', e.target.value.toUpperCase())}
                      placeholder="ABC-1234"
                      maxLength={8}
                    />
                  </div>
                </>
              )}

              {/* Motoboy-specific fields */}
              {activeProfile === 'motoboy' && (
                <>
                  <div className="border-t pt-5 mt-5">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground mb-4">
                      <Bike className="h-5 w-5 text-primary" />
                      Dados do Motoboy
                    </h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="motoboy_whatsapp" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </Label>
                    <Input
                      id="motoboy_whatsapp"
                      value={formatPhone(motoboyData.whatsapp)}
                      onChange={(e) => handleMotoboyChange('whatsapp', e.target.value)}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="motoboy_cidade">Cidade de Atuação</Label>
                    <Input
                      id="motoboy_cidade"
                      value={motoboyData.cidade}
                      onChange={(e) => handleMotoboyChange('cidade', e.target.value)}
                      placeholder="Cidade onde trabalha"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="motoboy_estado">Estado de Atuação</Label>
                    <Select
                      value={motoboyData.estado}
                      onValueChange={(value) => handleMotoboyChange('estado', value)}
                    >
                      <SelectTrigger id="motoboy_estado">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="moto_marca">Marca da Moto</Label>
                      <Input
                        id="moto_marca"
                        value={motoboyData.veiculo_marca}
                        onChange={(e) => handleMotoboyChange('veiculo_marca', e.target.value)}
                        placeholder="Ex: Honda"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="moto_modelo">Modelo</Label>
                      <Input
                        id="moto_modelo"
                        value={motoboyData.veiculo_modelo}
                        onChange={(e) => handleMotoboyChange('veiculo_modelo', e.target.value)}
                        placeholder="Ex: CG 160"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="moto_ano">Ano</Label>
                      <Input
                        id="moto_ano"
                        value={motoboyData.veiculo_ano}
                        onChange={(e) => handleMotoboyChange('veiculo_ano', e.target.value)}
                        placeholder="Ex: 2022"
                        maxLength={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="moto_placa">Placa</Label>
                      <Input
                        id="moto_placa"
                        value={motoboyData.veiculo_placa}
                        onChange={(e) => handleMotoboyChange('veiculo_placa', e.target.value.toUpperCase())}
                        placeholder="ABC-1234"
                        maxLength={8}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="capacidade_bag">Capacidade do Bag</Label>
                    <Select
                      value={motoboyData.capacidade_bag}
                      onValueChange={(value) => handleMotoboyChange('capacidade_bag', value)}
                    >
                      <SelectTrigger id="capacidade_bag">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pequeno">Pequeno (até 35L)</SelectItem>
                        <SelectItem value="medio">Médio (35-55L)</SelectItem>
                        <SelectItem value="grande">Grande (55L+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Save Button - personal data (not for merchant, which has its own save) */}
              {activeProfile !== 'merchant' && (
                <Button
                  type="submit"
                  disabled={isSaving}
                  className={`w-full text-white ${activeProfile === 'motoboy' || activeProfile === 'mototaxi'
                    ? 'bg-motoboy hover:bg-motoboy-hover'
                    : 'bg-primary hover:bg-primary/90'
                    }`}
                >
                  <Check className="h-4 w-4 mr-2" />
                  {isSaving ? 'Salvando...' : 'Salvar Perfil'}
                </Button>
              )}

              {activeProfile === 'merchant' && (
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-merchant hover:bg-merchant-hover text-white"
                >
                  <Check className="h-4 w-4 mr-2" />
                  {isSaving ? 'Salvando...' : 'Salvar Dados Pessoais'}
                </Button>
              )}

              {/* Rodapé Motoboy */}
              {activeProfile === 'motoboy' && (
                <div className="mt-10 pt-6 border-t text-center text-xs text-muted-foreground">
                  <div className="flex justify-center gap-6 font-medium">
                    <a href="/legal-required" className="hover:text-primary transition-colors">Termos de Uso</a>
                    <a href="/legal-required" className="hover:text-primary transition-colors">Política de Privacidade</a>
                    <a href="/support" className="hover:text-primary transition-colors">Suporte</a>
                  </div>
                  <p className="mt-3 opacity-70">Plataforma Motoboy • {motoboyData.cidade || 'Blumenau'}</p>
                  <p className="text-[11px] opacity-60 mt-1">© {new Date().getFullYear()} • Todos os direitos reservados</p>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Merchant Store Data — only when activeProfile === merchant */}
        {activeProfile === 'merchant' && (
          <>
            {/* Logo da Loja */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="h-5 w-5 text-merchant" />
                  Logo da Loja
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="h-24 w-24 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                    {merchantData.logo_url ? (
                      <img src={merchantData.logo_url} alt="Logo da loja" className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  {isUploadingLogo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl">
                      <Loader2 className="h-6 w-6 animate-spin text-merchant" />
                    </div>
                  )}
                </div>
                <Label htmlFor="logo-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 text-sm text-merchant hover:underline">
                    <Upload className="h-4 w-4" />
                    {merchantData.logo_url ? 'Alterar logo' : 'Enviar logo'}
                  </div>
                  <input id="logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={isUploadingLogo} />
                </Label>
                <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP. Máximo 2MB.</p>
              </CardContent>
            </Card>

            {/* Dados da Loja - Debug visual removido já que o fluxo unificado está validado */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Store className="h-5 w-5 text-merchant" />
                  Dados da Loja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome_loja">Nome da Loja *</Label>
                  <Input
                    id="nome_loja"
                    placeholder="Ex: Pizzaria do João"
                    value={merchantData.nome_loja}
                    onChange={(e) => handleMerchantChange('nome_loja', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja_cpf_cnpj">CPF ou CNPJ *</Label>
                  <Input
                    id="loja_cpf_cnpj"
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={merchantData.cpf_cnpj}
                    onChange={(e) => handleMerchantChange('cpf_cnpj', formatCPFCNPJ(e.target.value))}
                    maxLength={18}
                  />
                </div>
                <CategoryCombobox
                  value={merchantData.categoria || ''}
                  onChange={(value) => handleMerchantChange('categoria', value)}
                  groupedCategories={groupedCategories}
                  isLoading={categoriesLoading}
                />
              </CardContent>
            </Card>

            {/* Endereço da Loja */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Endereço da Loja</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loja_cep">CEP</Label>
                    <Input
                      id="loja_cep"
                      placeholder="00000-000"
                      value={merchantData.cep || ''}
                      onChange={(e) => handleMerchantChange('cep', formatCEP(e.target.value))}
                      onBlur={handleCepBlur}
                      maxLength={9}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loja_numero">Número</Label>
                    <Input
                      id="loja_numero"
                      placeholder="123"
                      value={merchantData.numero || ''}
                      onChange={(e) => handleMerchantChange('numero', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja_rua">Rua</Label>
                  <Input id="loja_rua" placeholder="Nome da rua" value={merchantData.rua || ''} onChange={(e) => handleMerchantChange('rua', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loja_bairro">Bairro</Label>
                  <Input id="loja_bairro" placeholder="Nome do bairro" value={merchantData.bairro || ''} onChange={(e) => handleMerchantChange('bairro', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loja_cidade">Cidade</Label>
                    <Input id="loja_cidade" placeholder="Nome da cidade" value={merchantData.cidade || ''} onChange={(e) => handleMerchantChange('cidade', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loja_estado">Estado</Label>
                    <Select value={merchantData.estado || ''} onValueChange={(value) => handleMerchantChange('estado', value)}>
                      <SelectTrigger id="loja_estado">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state.value} value={state.value}>{state.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Localização no Mapa */}
            <StoreLocationPicker
              latitude={merchantData.latitude}
              longitude={merchantData.longitude}
              endereco_formatado={merchantData.endereco_formatado}
              onLocationChange={(lat, lng, endereco, details) => {
                setMerchantData(prev => ({
                  ...prev,
                  latitude: lat,
                  longitude: lng,
                  endereco_formatado: endereco,
                  cep: details?.cep ? formatCEP(details.cep) : prev.cep,
                  rua: details?.rua || prev.rua,
                  numero: details?.numero || prev.numero,
                  bairro: details?.bairro || prev.bairro,
                  cidade: details?.cidade || prev.cidade,
                  estado: details?.estado || prev.estado,
                }));
              }}
            />

            {/* Salvar Loja */}
            <div className="pb-6">
              <Button
                onClick={handleSaveMerchant}
                className="w-full bg-merchant hover:bg-merchant-hover text-white"
                size="lg"
                disabled={isSavingMerchant}
              >
                {isSavingMerchant ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Check className="h-5 w-5 mr-2" />}
                Salvar Configurações da Loja
              </Button>
            </div>
          </>
        )}

        {/* Account Info */}
        <Card className="bg-secondary/50">
          <CardHeader>
            <CardTitle className="text-lg">Informações da Conta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID do Usuário</span>
              <span className="font-mono text-xs">{user?.id.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Perfil Ativo</span>
              <span>{profileConfig?.label || 'Nenhum'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Membro desde</span>
              <span>{user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '-'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
