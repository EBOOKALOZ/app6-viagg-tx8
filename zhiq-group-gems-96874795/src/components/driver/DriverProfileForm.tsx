import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, User, CreditCard, Car, Power, Camera, CheckCircle } from 'lucide-react';
import { brazilianStates } from '@/lib/brazilianStates';
import DocumentUpload from './DocumentUpload';

const driverProfileSchema = z.object({
  cidade: z.string().min(2, 'Cidade é obrigatória'),
  estado: z.string().min(2, 'Estado é obrigatório'),
  cpf_cnpj: z.string().min(11, 'CPF/CNPJ inválido').max(18, 'CPF/CNPJ inválido'),
  whatsapp: z.string().min(10, 'WhatsApp inválido'),
  cnh_numero: z.string().min(9, 'Número da CNH inválido'),
  cnh_categoria: z.string().default('B'),
  cnh_validade: z.string().min(1, 'Data de validade é obrigatória'),
  veiculo_marca: z.string().min(2, 'Marca é obrigatória'),
  veiculo_modelo: z.string().min(2, 'Modelo é obrigatório'),
  veiculo_ano: z.coerce.number().min(1990, 'Ano inválido').max(new Date().getFullYear() + 1, 'Ano inválido'),
  veiculo_cor: z.string().min(2, 'Cor é obrigatória'),
  veiculo_placa: z.string().min(7, 'Placa inválida').max(8, 'Placa inválida'),
});

type DriverProfileFormData = z.infer<typeof driverProfileSchema>;

interface DriverProfile {
  id: string;
  user_id: string;
  cidade: string | null;
  estado: string | null;
  cpf_cnpj: string | null;
  whatsapp: string | null;
  selfie_url: string | null;
  selfie_status: string | null;
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  cnh_url: string | null;
  veiculo_marca: string | null;
  veiculo_modelo: string | null;
  veiculo_ano: number | null;
  veiculo_cor: string | null;
  veiculo_placa: string | null;
  is_online: boolean;
  is_approved: boolean;
}

export default function DriverProfileForm() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [cnhUrl, setCnhUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  const form = useForm<DriverProfileFormData>({
    resolver: zodResolver(driverProfileSchema),
    defaultValues: {
      cidade: '',
      estado: '',
      cpf_cnpj: '',
      whatsapp: '',
      cnh_numero: '',
      cnh_categoria: 'B',
      cnh_validade: '',
      veiculo_marca: '',
      veiculo_modelo: '',
      veiculo_ano: new Date().getFullYear(),
      veiculo_cor: '',
      veiculo_placa: '',
    },
  });

  useEffect(() => {
    if (user?.id) {
      loadDriverProfile();
    }
  }, [user?.id]);

  const loadDriverProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('driver_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setProfile(data as DriverProfile);
        setSelfieUrl(data.selfie_url);
        setCnhUrl(data.cnh_url);
        setIsOnline(data.is_online);
        
        form.reset({
          cidade: data.cidade || '',
          estado: data.estado || '',
          cpf_cnpj: data.cpf_cnpj || '',
          whatsapp: data.whatsapp || '',
          cnh_numero: data.cnh_numero || '',
          cnh_categoria: data.cnh_categoria || 'B',
          cnh_validade: data.cnh_validade || '',
          veiculo_marca: data.veiculo_marca || '',
          veiculo_modelo: data.veiculo_modelo || '',
          veiculo_ano: data.veiculo_ano || new Date().getFullYear(),
          veiculo_cor: data.veiculo_cor || '',
          veiculo_placa: data.veiculo_placa || '',
        });
      }
    } catch (error) {
      console.error('Error loading driver profile:', error);
      toast.error('Erro ao carregar perfil do motorista');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: DriverProfileFormData) => {
    if (!user?.id) return;

    setSaving(true);
    try {
      const profileData = {
        user_id: user.id,
        ...data,
        selfie_url: selfieUrl,
        selfie_status: selfieUrl ? 'approved' : 'pending',
        cnh_url: cnhUrl,
        is_approved: true, // Aprovação instantânea
      };

      if (profile) {
        const { error } = await supabase
          .from('driver_profiles')
          .update(profileData)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('driver_profiles')
          .insert(profileData);

        if (error) throw error;
      }

      toast.success('Perfil salvo com sucesso! Motorista ativo.');
      loadDriverProfile();
    } catch (error) {
      console.error('Error saving driver profile:', error);
      toast.error('Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleOnlineToggle = async (online: boolean) => {
    if (!profile?.is_approved) {
      toast.error('Complete seu cadastro para ficar online');
      return;
    }

    try {
      const { error } = await supabase
        .from('driver_profiles')
        .update({ is_online: online })
        .eq('user_id', user!.id);

      if (error) throw error;

      setIsOnline(online);
      toast.success(online ? 'Você está online!' : 'Você está offline');
    } catch (error) {
      console.error('Error toggling online status:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const isProfileComplete = profile?.is_approved && selfieUrl && cnhUrl;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Status Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
              <div>
                <p className="font-medium">{isOnline ? 'Online' : 'Offline'}</p>
                <p className="text-sm text-muted-foreground">
                  {profile?.is_approved ? 'Motorista ativo' : 'Complete o cadastro'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {profile?.is_approved && (
                <Badge variant="default" className="bg-green-500">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Aprovado
                </Badge>
              )}
              <Switch
                checked={isOnline}
                onCheckedChange={handleOnlineToggle}
                disabled={!isProfileComplete}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Location */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-primary" />
                Localização
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input placeholder="Sua cidade" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado (UF)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o estado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {brazilianStates.map((state) => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Personal Data */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5 text-primary" />
                Dados Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="cpf_cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF ou CNPJ</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl>
                      <Input placeholder="(00) 00000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Identity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera className="h-5 w-5 text-primary" />
                Identidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentUpload
                userId={user!.id}
                documentType="selfie"
                currentUrl={selfieUrl}
                onUploadComplete={(url) => setSelfieUrl(url)}
                label="Foto de Perfil (Selfie)"
                accept="image/*"
              />
            </CardContent>
          </Card>

          {/* CNH */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5 text-primary" />
                CNH
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="cnh_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número da CNH</FormLabel>
                    <FormControl>
                      <Input placeholder="00000000000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cnh_categoria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="A">A</SelectItem>
                        <SelectItem value="B">B</SelectItem>
                        <SelectItem value="AB">AB</SelectItem>
                        <SelectItem value="C">C</SelectItem>
                        <SelectItem value="D">D</SelectItem>
                        <SelectItem value="E">E</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cnh_validade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Validade</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DocumentUpload
                userId={user!.id}
                documentType="cnh"
                currentUrl={cnhUrl}
                onUploadComplete={(url) => setCnhUrl(url)}
                label="Upload da CNH"
                accept="image/*"
              />
            </CardContent>
          </Card>

          {/* Vehicle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Car className="h-5 w-5 text-primary" />
                Dados do Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="veiculo_marca"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marca</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Toyota" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="veiculo_modelo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modelo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Corolla" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="veiculo_ano"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ano</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="2024" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="veiculo_cor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cor</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Prata" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="veiculo_placa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Placa</FormLabel>
                    <FormControl>
                      <Input placeholder="ABC1D23" {...field} className="uppercase" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <Button type="submit" className="w-full" size="lg" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar e Ativar Motorista'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
