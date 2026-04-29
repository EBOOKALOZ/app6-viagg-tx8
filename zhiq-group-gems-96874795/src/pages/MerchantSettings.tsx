import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PROFILE_TYPES } from '@/lib/profileTypes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useStoreCategories } from '@/hooks/useStoreCategories';
import { Logo } from '@/components/Logo';
import { ArrowLeft, Store, Loader2, Upload, Save, Camera, Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { brazilianStates } from '@/lib/brazilianStates';
import { StoreLocationPicker } from '@/components/merchant/StoreLocationPicker';
import { cn } from '@/lib/utils';
import { saveMerchantStore, loadMerchantStore } from '@/lib/merchantStoreSave';


function CategoryCombobox({ value, onChange, categories, isLoading }: {
  value: string;
  onChange: (v: string) => void;
  categories: { id: string; slug: string; nome: string }[];
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selectedLabel = categories.find(c => c.slug === value)?.nome || value || '';

  return (
    <div className="space-y-2">
      <Label htmlFor="categoria">Categoria</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isLoading}
            className="w-full justify-between font-normal h-10"
          >
            <span className="truncate">
              {isLoading ? 'Carregando categorias...' : selectedLabel || 'Selecione ou digite uma categoria'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar categoria..." />
            <CommandList>
              <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
              <CommandGroup>
                {categories.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={cat.nome}
                    onSelect={() => {
                      onChange(cat.slug);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === cat.slug ? "opacity-100" : "opacity-0")} />
                    {cat.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface MerchantStoreData {
  id?: string;
  user_id: string;
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

// Categories are now loaded dynamically from the database via useStoreCategories hook

export default function MerchantSettings() {
  const { user, availableProfiles, enableProfile, refreshProfiles } = useAuth();
  const navigate = useNavigate();
  const { categories, isLoading: categoriesLoading } = useStoreCategories();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [storeData, setStoreData] = useState<MerchantStoreData>({
    user_id: user?.id || '',
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
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadStoreData();
    }
  }, [user?.id]);

  const loadStoreData = async () => {
    setIsLoading(true);
    try {
      const { exists, data, error } = await loadMerchantStore();

      if (error) {
        console.error("[MerchantSettings] Erro ao carregar dados:", error);
        toast.error('Erro ao carregar dados da loja');
        return;
      }

      if (exists && data) {
        setExistingId(data.id || user?.id || null);
        setStoreData({
          user_id: user?.id || '',
          logo_url: data.logo_url || '',
          nome_loja: data.nome_loja || '',
          cpf_cnpj: data.cnpj || data.cpf_cnpj || '',
          categoria: data.categoria_id || data.categoria || '',
          cep: data.cep || '',
          rua: data.street || data.rua || '',
          numero: data.number || data.numero || '',
          bairro: data.neighborhood || data.bairro || '',
          cidade: data.cidade || '',
          estado: data.estado || '',
          latitude: data.latitude ? Number(data.latitude) : null,
          longitude: data.longitude ? Number(data.longitude) : null,
          endereco_formatado: data.endereco_formatado || null,
        });
      }
    } catch (error) {
      console.error('Error loading store data:', error);
      toast.error('Erro ao carregar dados da loja');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem válida');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    setIsUploading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error('Usuário não autenticado ou sessão expirada.');
      }

      const userId = authData.user.id;
      const fileExt = file.name.split('.').pop() || 'png';
      const timestamp = Date.now();
      const fileName = `logos/${userId}/logo-${timestamp}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('logos_lojas')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        console.error('[Upload Logo] Supabase Storage Error:', uploadError.message, uploadError);
        throw new Error(uploadError.message || 'Falha no upload da logo');
      }

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

      setStoreData(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo enviada e salva com sucesso!');
    } catch (error: any) {
      console.error('[Upload Logo] Exception:', error);
      toast.error(error.message || 'Erro ao enviar logo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCepBlur = async () => {
    const cep = storeData.cep?.replace(/\D/g, '');
    if (!cep || cep.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast.error('CEP não encontrado');
        return;
      }

      setStoreData(prev => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        estado: data.uf || prev.estado
      }));
    } catch (error) {
      console.error('Error fetching CEP:', error);
    }
  };

  const formatCPFCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      return numbers
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
  };

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    return numbers.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  };

  // Handler para atualizar localização e auto-preencher endereço (Reverse Geocoding)
  const handleLocationChange = (lat: number, lng: number, endereco: string, details?: { cep?: string; rua?: string; numero?: string; bairro?: string; cidade?: string; estado?: string; }) => {
    setStoreData(prev => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      endereco_formatado: endereco,
      // Se vier o detalhe estruturado do Mapbox, injetamos no form mantendo os valores de fallback originais se falsy
      cep: details?.cep ? formatCEP(details.cep) : prev.cep,
      rua: details?.rua || prev.rua,
      numero: details?.numero || prev.numero,
      bairro: details?.bairro || prev.bairro,
      cidade: details?.cidade || prev.cidade,
      estado: details?.estado || prev.estado,
    }));
  };

  const handleSave = async () => {
    if (!storeData.nome_loja.trim()) {
      toast.error('Nome da loja é obrigatório');
      return;
    }

    if (!storeData.cpf_cnpj.trim()) {
      toast.error('CPF ou CNPJ é obrigatório');
      return;
    }

    // CRÍTICO: Validar localização obrigatória
    if (storeData.latitude === null || storeData.longitude === null) {
      toast.error('Defina a localização da loja no mapa para continuar.');
      return;
    }

    setIsSaving(true);
    const isFirstSave = !existingId;

    // --- DIAGNÓSTICO TEMPORÁRIO SUPABASE (Pedido User) ---
    console.warn("=== INFO DE CONEXÃO SUPABASE (DIAGNÓSTICO) ===");
    console.log("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL);
    console.log("Supabase Client URL:", supabase['supabaseUrl']); // Se acessível
    console.warn("===============================================");

    try {
      // 1) Prepara payload para o mapper
      const payload = {
        ...storeData,
        cnpj: storeData.cpf_cnpj, // Mapper espera cnpj
        street: storeData.rua,     // Mapper espera street
        number: storeData.numero,   // Mapper espera number
        neighborhood: storeData.bairro, // Mapper espera neighborhood
        categoria_id: storeData.categoria, // Mapper espera categoria_id
      };

      // 2) Salva via RPC blindada (Nível 2)
      const result = await saveMerchantStore(payload);

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar loja');
      }

      // Auto-activate merchant profile on first save
      if (isFirstSave && !availableProfiles.includes('merchant')) {
        try {
          await enableProfile('merchant');
          await refreshProfiles();
          toast.success('Loja cadastrada e perfil Lojista ativado!', { duration: 4000 });
        } catch (profileError) {
          console.error('Error activating merchant profile:', profileError);
          toast.success('Dados da loja salvos com sucesso! (Erro ao ativar perfil)', { duration: 4000 });
        }
      } else {
        toast.success('Dados da loja salvos com sucesso!', { duration: 4000 });
      }

      // Dispara evento global para o Header e o Clima recarregarem
      window.dispatchEvent(new CustomEvent('merchantProfileUpdated'));

    } catch (error: any) {
      console.error('Error saving store data detalhado:', error);
      toast.error(`Falha ao salvar: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/merchant')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1">
            <Store className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Configurações</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 space-y-6 max-w-2xl mx-auto w-full">
        {/* Logo Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              Logo da Loja
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-24 w-24 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
                {storeData.logo_url ? (
                  <img
                    src={storeData.logo_url}
                    alt="Logo da loja"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Store className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-xl">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </div>
            <Label htmlFor="logo-upload" className="cursor-pointer">
              <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Upload className="h-4 w-4" />
                {storeData.logo_url ? 'Alterar logo' : 'Enviar logo'}
              </div>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                disabled={isUploading}
              />
            </Label>
            <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP. Máximo 2MB.</p>
          </CardContent>
        </Card>

        {/* Store Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              Dados da Loja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome_loja">Nome da Loja *</Label>
              <Input
                id="nome_loja"
                placeholder="Ex: Pizzaria do João"
                value={storeData.nome_loja}
                onChange={(e) => setStoreData(prev => ({ ...prev, nome_loja: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf_cnpj">CPF ou CNPJ *</Label>
              <Input
                id="cpf_cnpj"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                value={storeData.cpf_cnpj}
                onChange={(e) => setStoreData(prev => ({ ...prev, cpf_cnpj: formatCPFCNPJ(e.target.value) }))}
                maxLength={18}
              />
            </div>

            <CategoryCombobox
              value={storeData.categoria || ''}
              onChange={(value) => setStoreData(prev => ({ ...prev, categoria: value }))}
              categories={categories}
              isLoading={categoriesLoading}
            />
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  placeholder="00000-000"
                  value={storeData.cep || ''}
                  onChange={(e) => setStoreData(prev => ({ ...prev, cep: formatCEP(e.target.value) }))}
                  onBlur={handleCepBlur}
                  maxLength={9}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  placeholder="123"
                  value={storeData.numero || ''}
                  onChange={(e) => setStoreData(prev => ({ ...prev, numero: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rua">Rua</Label>
              <Input
                id="rua"
                placeholder="Nome da rua"
                value={storeData.rua || ''}
                onChange={(e) => setStoreData(prev => ({ ...prev, rua: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input
                id="bairro"
                placeholder="Nome do bairro"
                value={storeData.bairro || ''}
                onChange={(e) => setStoreData(prev => ({ ...prev, bairro: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  placeholder="Nome da cidade"
                  value={storeData.cidade || ''}
                  onChange={(e) => setStoreData(prev => ({ ...prev, cidade: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Select
                  value={storeData.estado || ''}
                  onValueChange={(value) => setStoreData(prev => ({ ...prev, estado: value }))}
                >
                  <SelectTrigger id="estado">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {brazilianStates.map((state) => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Localização da Loja - OBRIGATÓRIO */}
        <StoreLocationPicker
          latitude={storeData.latitude}
          longitude={storeData.longitude}
          endereco_formatado={storeData.endereco_formatado}
          onLocationChange={handleLocationChange}
        />

        {/* Save Button - dentro do fluxo, antes do footer */}
        <div className="pt-4 pb-6">
          <Button
            onClick={handleSave}
            className="w-full"
            size="lg"
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Save className="h-5 w-5 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </main>
    </div>
  );
}
