import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import { UserAvatar } from "@/components/UserAvatar";
import NotificationCenter from "@/components/NotificationCenter";

interface PassengerHeaderProps {
  passengerName: string;
}

const PassengerHeader = ({ passengerName }: PassengerHeaderProps) => {
  const { clearActiveProfile } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleExitProfile = async () => {
    setIsLoggingOut(true);
    await clearActiveProfile();
    navigate('/select-profile');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-[100] bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
      <div className="flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <UserAvatar size="md" />
          <div>
            <p className="text-xs text-muted-foreground">Olá,</p>
            <p className="font-semibold text-foreground">{passengerName}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <NotificationCenter className="relative" />
          <ProfileSwitcher />
          <Button variant="ghost" size="icon" onClick={handleExitProfile} disabled={isLoggingOut}>
            {isLoggingOut ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <LogOut className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default PassengerHeader;
