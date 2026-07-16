import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Car, Bike } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { FooterNeutral } from '@/components/FooterNeutral';
import { supabase } from '@/integrations/supabase/client';
import { getProfileRoute } from '@/lib/profileTypes';
import { z } from 'zod';

// Tipos de prestador disponíveis por perfil
const MOTOBOY_ROLES = [
  { value: 'motoboy', label: '🛵 Motoboy', icon: Bike, description: 'Entregas de moto' },
  { value: 'mototaxi', label: '🏍️ Moto-táxi', icon: Bike, description: 'Corridas de moto' },
] as const;

const DRIVER_ROLES = [
  { value: 'motorista', label: '🚗 Motorista', icon: Car, description: 'Corridas de carro' },
] as const;

const profileSchema = z.object({
  nome_exibicao: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome deve ter menos de 100 caracteres'),
  telefone: z.string().optional().transform(val => val?.trim() || null),
});

export default function CompleteProfile() {
  const { user, isLoading, activeProfile, refreshProfiles } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [nomeExibicao, setNomeExibicao] = useState('');
  const [telefone, setTelefone] = useState('');
  const [providerRole, setProviderRole] = useState<string>('motoboy');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ nome_exibicao?: string }>({});
  
  // Verificar se o perfil ativo é de prestador (driver ou motoboy)
  const isProvider = activeProfile === 'driver' || activeProfile === 'motoboy';

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  // Pre-fill with Google name if available
  useEffect(() => {
    if (user?.user_metadata?.name && !nomeExibicao) {
      setNomeExibicao(user.user_metadata.name);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Validate input
    const validation = profileSchema.safeParse({
      nome_exibicao: nomeExibicao,
      telefone: telefone,
    });

    if (!validation.success) {
      const fieldErrors: { nome_exibicao?: string } = {};
      validation.error.errors.forEach(err => {
        if (err.path[0] === 'nome_exibicao') {
          fieldErrors.nome_exibicao = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    if (!user?.id) return;

    setIsSaving(true);

    try {
      const updateData: Record<string, unknown> = {
        name: validation.data.nome_exibicao,
        telefone: validation.data.telefone,
        profile_complete: true,
      };
      
      // Salvar provider_role apenas para prestadores
      if (isProvider) {
        updateData.provider_role = providerRole;
      }
      
      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfiles();

      toast({
        title: 'Perfil salvo!',
        description: 'Seu perfil foi atualizado com sucesso.',
      });

      // Navigate to the active profile's dashboard
      if (activeProfile) {
        navigate(getProfileRoute(activeProfile));
      } else {
        navigate('/select-profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar seu perfil. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center space-y-4">
          <Logo size="md" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Complete seu perfil</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Como você gostaria de ser chamado no app?
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="nome_exibicao">Nome de exibição *</Label>
            <Input
              id="nome_exibicao"
              type="text"
              placeholder="Como você gostaria de ser chamado?"
              value={nomeExibicao}
              onChange={(e) => setNomeExibicao(e.target.value)}
              className={errors.nome_exibicao ? 'border-destructive' : ''}
              maxLength={100}
            />
            {errors.nome_exibicao && (
              <p className="text-sm text-destructive">{errors.nome_exibicao}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone (opcional)</Label>
            <Input
              id="telefone"
              type="tel"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              maxLength={20}
            />
          </div>

          {/* Seletor de tipo de prestador - apenas para driver/motoboy */}
          {isProvider && (
            <div className="space-y-3">
              <Label>Tipo de prestador *</Label>
              <RadioGroup
                value={providerRole}
                onValueChange={setProviderRole}
                className="grid gap-3"
              >
                {(activeProfile === 'motoboy' ? MOTOBOY_ROLES : DRIVER_ROLES).map((role) => {
                  const Icon = role.icon;
                  return (
                    <div
                      key={role.value}
                      className={`flex items-center space-x-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                        providerRole === role.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                      onClick={() => setProviderRole(role.value)}
                    >
                      <RadioGroupItem value={role.value} id={role.value} />
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <Label htmlFor={role.value} className="cursor-pointer font-medium">
                          {role.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-12"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar e continuar'
            )}
          </Button>
        </form>

        {/* Helper text */}
        <p className="text-center text-xs text-muted-foreground">
          Você pode alterar essas informações a qualquer momento nas configurações
        </p>
      </div>
      <FooterNeutral />
    </div>
  );
}

