import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Users, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PassengerToggleProps {
  acceptsPassengers: boolean;
  canAcceptPassengers: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}

export default function PassengerToggle({ 
  acceptsPassengers, 
  canAcceptPassengers, 
  onToggle,
  disabled = false 
}: PassengerToggleProps) {
  if (!canAcceptPassengers) {
    return (
      <Alert variant="default" className="bg-muted/50 border-muted">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Para aceitar passageiros, configure "Garupa" como tipo de transporte.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full ${acceptsPassengers ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted'}`}>
          <Users className={`h-5 w-5 ${acceptsPassengers ? 'text-blue-600' : 'text-muted-foreground'}`} />
        </div>
        <div>
          <Label htmlFor="passenger-toggle" className="font-medium cursor-pointer">
            Aceitar passageiros
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {acceptsPassengers 
              ? 'Você receberá corridas de passageiro' 
              : 'Apenas entregas de produtos'}
          </p>
        </div>
      </div>
      <Switch
        id="passenger-toggle"
        checked={acceptsPassengers}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
    </div>
  );
}
