import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, ArrowLeft, Plus, AlertTriangle } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/Footer';
import { PROFILE_TYPES, getProfileRoute, getProfileConfig } from '@/lib/profileTypes';
import { isProfileRegistrationComplete, getProfileSetupRoute } from '@/lib/profileValidation';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function ManageProfiles() {
  const { 
    user,
    isLoading, 
    availableProfiles, 
    activeProfile,
    setActiveProfile,
    enableProfile,
    refreshProfiles
  } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [enablingProfile, setEnablingProfile] = useState<string | null>(null);

  const handleActivateProfile = async (profileId: string) => {
    if (profileId === activeProfile || !user?.id) return;
    
    setSwitchingTo(profileId);
    try {
      // Verificar se cadastro está completo
      const { complete, missingFields } = await isProfileRegistrationComplete(user.id, profileId);
      
      if (!complete) {
        toast({
          title: 'Cadastro incompleto',
          description: `Complete os dados: ${missingFields.join(', ')}`,
          variant: 'destructive',
        });
        setSwitchingTo(null);
        navigate(getProfileSetupRoute(profileId));
        return;
      }

      await setActiveProfile(profileId);
      await refreshProfiles();
      
      toast({
        title: 'Perfil ativado',
        description: `Agora você está usando o perfil ${getProfileConfig(profileId)?.label}`,
      });
      
      const route = getProfileRoute(profileId);
      navigate(route);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível trocar o perfil.',
        variant: 'destructive',
      });
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleEnableProfile = async (profileId: string) => {
    setEnablingProfile(profileId);
    try {
      await enableProfile(profileId);
      await refreshProfiles();
      
      toast({
        title: 'Perfil habilitado',
        description: `O perfil ${getProfileConfig(profileId)?.label} foi adicionado à sua conta.`,
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível habilitar o perfil.',
        variant: 'destructive',
      });
    } finally {
      setEnablingProfile(null);
    }
  };

  const handleBack = () => {
    if (activeProfile) {
      const route = getProfileRoute(activeProfile);
      navigate(route);
    } else {
      navigate('/');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  const profileList = Object.values(PROFILE_TYPES);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-lg space-y-8">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Gerenciar Perfis</h1>
              <p className="text-sm text-muted-foreground">
                Habilite novos perfis ou troque o perfil ativo
              </p>
            </div>
          </div>

          {/* Profile Cards */}
          <div className="grid grid-cols-1 gap-4">
            {profileList.map((profile) => {
              const Icon = profile.icon;
              const isEnabled = availableProfiles.includes(profile.id);
              const isActive = activeProfile === profile.id;
              const isSwitching = switchingTo === profile.id;
              const isEnabling = enablingProfile === profile.id;
              const requiresSetup = profile.requiresVehicle;

              return (
                <div
                  key={profile.id}
                  className={cn(
                    'relative rounded-lg border-2 p-4 transition-all',
                    isEnabled 
                      ? 'border-border bg-card' 
                      : 'border-dashed border-border/50 bg-muted/10',
                    isActive && 'border-primary ring-2 ring-offset-2 ring-offset-background ring-primary'
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className={cn(
                      'rounded-full p-3',
                      isEnabled ? 'bg-primary/10' : 'bg-muted/30'
                    )}>
                      <Icon className={cn(
                        'h-6 w-6',
                        isEnabled ? 'text-primary' : 'text-muted-foreground'
                      )} />
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={cn(
                          'font-semibold',
                          isEnabled ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {profile.label}
                        </h3>
                        {isActive && (
                          <Badge variant="default" className="text-xs">
                            Ativo
                          </Badge>
                        )}
                        {isEnabled && !isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Habilitado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {profile.description}
                      </p>
                      {requiresSetup && isEnabled && !isActive && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Requer cadastro completo
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex-shrink-0">
                      {!isEnabled ? (
                        // Profile not enabled - show "Ativar perfil" button
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEnableProfile(profile.id)}
                          disabled={isEnabling}
                          className="gap-1"
                        >
                          {isEnabling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Ativar
                            </>
                          )}
                        </Button>
                      ) : isActive ? (
                        // Currently active profile
                        <Check className="h-5 w-5 text-primary" />
                      ) : (
                        // Enabled but not active - show "Trocar" button
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleActivateProfile(profile.id)}
                          disabled={isSwitching}
                        >
                          {isSwitching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Trocar'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Dica:</strong> Você pode habilitar vários perfis e alternar entre eles a qualquer momento. 
              Apenas um perfil fica ativo por vez.
            </p>
          </div>
        </div>
      </div>
      
      <div className="px-4 pb-8">
        <div className="max-w-lg mx-auto">
          <Footer />
        </div>
      </div>
    </div>
  );
}
