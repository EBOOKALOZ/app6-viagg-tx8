import { MapPin, Navigation, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LocationPermissionCardProps {
  onRequestPermission: () => void;
  isLoading?: boolean;
  error?: string | null;
  permissionStatus?: 'prompt' | 'granted' | 'denied' | 'unknown';
  isTimedOut?: boolean;
}

export function LocationPermissionCard({
  onRequestPermission,
  isLoading = false,
  error,
  permissionStatus,
  isTimedOut,
}: LocationPermissionCardProps) {
  // GPS timeout - show warning with retry
  if (isTimedOut && permissionStatus !== 'denied') {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center bg-card/50 rounded-xl border border-border">
        <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4">
          <AlertTriangle className="h-6 w-6 text-yellow-500" />
        </div>
        <h3 className="font-semibold text-foreground mb-2">
          GPS não detectado
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Verifique se o GPS está ativado nas configurações do seu dispositivo.
        </p>
        {error && (
          <p className="text-xs text-muted-foreground/80 mb-4">{error}</p>
        )}
        <Button 
          onClick={onRequestPermission}
          disabled={isLoading}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Tentando...' : 'Tentar novamente'}
        </Button>
      </div>
    );
  }

  // Permission denied
  if (permissionStatus === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center bg-card/50 rounded-xl border border-border">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <MapPin className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="font-semibold text-foreground mb-2">
          Localização bloqueada
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Para usar o mapa, habilite a localização nas configurações do seu navegador.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center bg-card/50 rounded-xl border border-border">
        <div className="w-12 h-12 rounded-full bg-zhiq-teal/10 flex items-center justify-center mb-4">
          <Navigation className="h-6 w-6 text-zhiq-teal animate-pulse" />
        </div>
        <h3 className="font-semibold text-foreground mb-2">
          Obtendo localização...
        </h3>
        <p className="text-sm text-muted-foreground">
          Aguarde enquanto detectamos sua posição.
        </p>
      </div>
    );
  }

  // Default: request permission
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center bg-card/50 rounded-xl border border-border">
      <div className="w-12 h-12 rounded-full bg-zhiq-teal/10 flex items-center justify-center mb-4">
        <Navigation className="h-6 w-6 text-zhiq-teal" />
      </div>
      <h3 className="font-semibold text-foreground mb-2">
        Permitir localização
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Precisamos da sua localização para mostrar o mapa e conectar você a entregadores próximos.
      </p>
      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}
      <Button 
        onClick={onRequestPermission}
        disabled={isLoading}
        className="bg-zhiq-teal hover:bg-zhiq-teal/90"
      >
        Ativar localização
      </Button>
    </div>
  );
}
