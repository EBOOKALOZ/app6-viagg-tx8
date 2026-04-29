import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, Settings, Check, HelpCircle, User } from 'lucide-react';
import { PROFILE_TYPES, getProfileRoute, getProfileConfig } from '@/lib/profileTypes';
import { isProfileRegistrationComplete, getProfileSetupRoute } from '@/lib/profileValidation';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function ProfileSwitcher() {
  const { user, availableProfiles, activeProfile, setActiveProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const currentProfile = activeProfile ? getProfileConfig(activeProfile) : null;

  const handleSwitchProfile = async (profileId: string) => {
    if (profileId === activeProfile || !user?.id) return;
    
    // Verificar se cadastro está completo
    const { complete, missingFields } = await isProfileRegistrationComplete(user.id, profileId);
    
    if (!complete) {
      toast({
        title: 'Cadastro incompleto',
        description: `Complete os dados: ${missingFields.join(', ')}`,
        variant: 'destructive',
      });
      navigate(getProfileSetupRoute(profileId));
      return;
    }
    
    await setActiveProfile(profileId);
    const route = getProfileRoute(profileId);
    navigate(route);
  };

  const handleManageProfiles = () => {
    navigate('/manage-profiles');
  };

  const handleMyProfile = () => {
    navigate('/profile');
  };

  const handleSupport = () => {
    navigate('/support');
  };

  if (!currentProfile) return null;

  const CurrentIcon = currentProfile.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <CurrentIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{currentProfile.label}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Trocar perfil</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {availableProfiles.map((profileId) => {
          const profile = getProfileConfig(profileId);
          if (!profile) return null;
          
          const Icon = profile.icon;
          const isActive = profileId === activeProfile;

          return (
            <DropdownMenuItem
              key={profileId}
              onClick={() => handleSwitchProfile(profileId)}
              className={cn('gap-3', isActive && 'bg-accent')}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{profile.label}</span>
              {isActive && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleManageProfiles} className="gap-3">
          <Settings className="h-4 w-4" />
          <span>Gerenciar perfis</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMyProfile} className="gap-3">
          <User className="h-4 w-4" />
          <span>Meu Perfil</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSupport} className="gap-3">
          <HelpCircle className="h-4 w-4" />
          <span>Suporte</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
