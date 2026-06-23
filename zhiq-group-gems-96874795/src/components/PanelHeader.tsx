import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import ProfileSwitcher from '@/components/ProfileSwitcher';
import { UserAvatar } from '@/components/UserAvatar';
import { LogOut, Loader2, Wallet, HelpCircle, FileText, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelHeaderProps {
  icon: LucideIcon;
  label: string;
  children?: React.ReactNode;
  className?: string;
}

export function PanelHeader({ icon: Icon, label, children, className }: PanelHeaderProps) {
  const { clearActiveProfile, activeProfile } = useAuth();
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  const handleExitProfile = async () => {
    setIsExiting(true);
    await clearActiveProfile();
    navigate('/select-profile');
  };

  // Merchant uses billing page instead of wallet
  const isMerchant = activeProfile === 'merchant' || activeProfile === 'comerciante';
  const isMotoboy = activeProfile === 'motoboy';

  const handleFinancialClick = () => {
    if (isMerchant) {
      navigate('/merchant/billing');
    } else {
      navigate('/wallet');
    }
  };

  // Estilo condicional para perfil Motoboy e Merchant
  const getHeaderStyle = () => {
    if (isMotoboy) {
      return "sticky top-0 z-50 border-b border-motoboy/30 bg-motoboy text-motoboy-foreground backdrop-blur";
    }
    if (isMerchant) {
      return "sticky top-0 z-50 border-b border-merchant/30 bg-merchant text-merchant-foreground backdrop-blur";
    }
    return "sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur";
  };

  const headerStyle = getHeaderStyle();

  return (
    <header className={cn(headerStyle, className)}>
      <div className="flex items-center justify-between px-3 py-1">
        <div className="flex items-center">
          <Logo size="xs" />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          {children}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleFinancialClick}
            title={isMerchant ? "Faturas" : "Carteira"}
          >
            {isMerchant ? (
              <FileText className="h-3 w-3" />
            ) : (
              <Wallet className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => navigate('/support')}
            title="Suporte"
          >
            <HelpCircle className="h-3 w-3" />
          </Button>
          <UserAvatar size="sm" />
          <ProfileSwitcher />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleExitProfile}
            disabled={isExiting}
            title="Sair do perfil"
          >
            {isExiting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
