import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { 
  ChevronDown, ChevronUp, MapPin, Navigation, 
  Clock, User, AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { broadcastRideAcceptedGlobal } from '@/lib/broadcastDeliveryAccepted';

export interface MissedCall {
  id: string;
  type: 'ride' | 'delivery';
  passenger_name?: string;
  passenger_avatar_url?: string;
  passenger_id?: string;
  customer_name?: string;
  pickup_location: string;
  destination: string;
  estimated_value: number;
  missed_at: string;
  created_at: string;
}

interface MissedCallsSectionProps {
  missedCalls: MissedCall[];
  onClear?: () => void;
  onRemoveCall?: (callId: string) => void;
  onAccepted?: (callId: string) => void;
}

export function MissedCallsSection({ 
  missedCalls, 
  onClear,
  onRemoveCall,
  onAccepted
}: MissedCallsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [validCalls, setValidCalls] = useState<MissedCall[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const { user } = useAuth();

  // Validar chamadas perdidas - remover as que já foram aceitas
  const validateCalls = useCallback(async () => {
    if (missedCalls.length === 0) {
      setValidCalls([]);
      return;
    }

    const rideIds = missedCalls.filter(c => c.type === 'ride').map(c => c.id);
    
    if (rideIds.length === 0) {
      setValidCalls(missedCalls);
      return;
    }

    // Buscar status atual das corridas na service_orders
    const { data: rides } = await supabase
      .from('service_orders')
      .select('id, status, motoboy_id')
      .eq('service_type', 'mototaxi')
      .in('id', rideIds);

    // Filtrar apenas corridas ainda disponíveis (status = aguardando AND motoboy_id IS NULL)
    const availableRideIds = new Set(
      rides?.filter(r => r.status === 'aguardando' && !r.motoboy_id)
        .map(r => r.id) || []
    );

    // Manter apenas chamadas válidas
    const valid = missedCalls.filter(call => {
      if (call.type === 'ride') {
        return availableRideIds.has(call.id);
      }
      return true; // deliveries são tratadas separadamente
    });

    setValidCalls(valid);
  }, [missedCalls]);

  // Validar ao montar e quando lista muda
  useEffect(() => {
    validateCalls();
  }, [validateCalls]);

  // Subscription realtime para remover corridas aceitas por outros
  useEffect(() => {
    if (validCalls.length === 0) return;

    const rideIds = validCalls.filter(c => c.type === 'ride').map(c => c.id);
    if (rideIds.length === 0) return;

    const channel = supabase.channel('missed-calls-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_orders',
        },
        (payload) => {
          const record = payload.new as any;
          
          // Só processar se é do tipo mototaxi
          if (record.service_type !== 'mototaxi') return;
          
          // Se status mudou de aguardando, remover da lista
          if (record.status !== 'aguardando' || record.motoboy_id) {
            console.log('[MissedCalls] Corrida não mais disponível:', record.id);
            setValidCalls(prev => prev.filter(c => c.id !== record.id));
            onRemoveCall?.(record.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [validCalls, onRemoveCall]);

  // Aceitar corrida perdida
  const handleAcceptRide = async (call: MissedCall) => {
    if (!user?.id || acceptingId) return;

    setAcceptingId(call.id);

    try {
      // UPDATE condicional atômico na service_orders
      const { data, error } = await supabase
        .from('service_orders')
        .update({
          status: 'accepted',
          motoboy_id: user.id,
          accepted_at: new Date().toISOString()
        })
        .eq('id', call.id)
        .eq('status', 'aguardando')
        .is('motoboy_id', null)
        .select('id');

      if (error) throw error;

      if (!data || data.length === 0) {
        // Corrida já foi aceita por outro
        console.log('[MissedCalls] Corrida já aceita por outro:', call.id);
        setValidCalls(prev => prev.filter(c => c.id !== call.id));
        toast.info('Esta corrida já foi aceita por outro moto-táxi', {
          icon: '🏍️',
        });
        return;
      }

      // Sucesso! Broadcast e notificar
      broadcastRideAcceptedGlobal(call.id, user.id);
      toast.success('Corrida aceita! 🏍️', {
        description: 'Vá até o passageiro',
      });

      // Remover da lista e notificar parent
      setValidCalls(prev => prev.filter(c => c.id !== call.id));
      onAccepted?.(call.id);

    } catch (error) {
      console.error('[MissedCalls] Erro ao aceitar:', error);
      toast.error('Erro ao aceitar corrida');
    } finally {
      setAcceptingId(null);
    }
  };

  if (validCalls.length === 0) return null;

  const displayCalls = isExpanded ? validCalls : validCalls.slice(0, 2);

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="font-medium text-sm">Chamadas Perdidas</h3>
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30">
              {validCalls.length}
            </Badge>
          </div>
          {onClear && validCalls.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar
            </Button>
          )}
        </div>

        {/* Missed Calls List */}
        <div className="space-y-2">
          {displayCalls.map((call) => (
            <MissedCallCard 
              key={call.id} 
              call={call}
              onAccept={() => handleAcceptRide(call)}
              isAccepting={acceptingId === call.id}
            />
          ))}
        </div>

        {/* Expand/Collapse Button */}
        {validCalls.length > 2 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Mostrar menos
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Ver mais {validCalls.length - 2} chamadas
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface MissedCallCardProps {
  call: MissedCall;
  onAccept: () => void;
  isAccepting: boolean;
}

function MissedCallCard({ call, onAccept, isAccepting }: MissedCallCardProps) {
  const [passengerData, setPassengerData] = useState<{
    name: string;
    avatar_url: string | null;
  } | null>(null);

  const isRide = call.type === 'ride';
  
  // Carregar dados do passageiro via join
  useEffect(() => {
    if (!isRide) return;

    const loadPassengerData = async () => {
      // Primeiro tentar usar dados já disponíveis
      if (call.passenger_name) {
        setPassengerData({
          name: call.passenger_name,
          avatar_url: call.passenger_avatar_url || null
        });
        return;
      }

      // Buscar dados do passageiro via service_orders
      const { data } = await supabase
        .from('service_orders')
        .select(`
          customer_id,
          profiles:customer_id (
            name,
            avatar_url
          )
        `)
        .eq('id', call.id)
        .single();

      if (data?.profiles) {
        const profile = data.profiles as any;
        setPassengerData({
          name: profile.name || 'Passageiro',
          avatar_url: profile.avatar_url
        });
      }
    };

    loadPassengerData();
  }, [call.id, call.passenger_name, call.passenger_avatar_url, isRide]);

  const displayName = isRide 
    ? (passengerData?.name || call.passenger_name || 'Passageiro')
    : call.customer_name;
  const avatarUrl = isRide 
    ? (passengerData?.avatar_url || call.passenger_avatar_url)
    : undefined;
  
  const missedTime = format(new Date(call.missed_at), "HH:mm", { locale: ptBR });
  const createdTime = format(new Date(call.created_at), "HH:mm", { locale: ptBR });

  return (
    <div className="p-3 rounded-lg bg-background border border-border/50 space-y-3">
      {/* Header with avatar and name */}
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0 border-2 border-primary/20">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={displayName || 'Usuário'} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
            {displayName?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{displayName}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Solicitado às {createdTime}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-700">
            Perdida
          </Badge>
          <p className="text-xs text-muted-foreground mt-1">{missedTime}</p>
        </div>
      </div>

      {/* Locations */}
      <div className="space-y-1.5 text-xs">
        <div className="flex items-start gap-2">
          <MapPin className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />
          <span className="text-muted-foreground line-clamp-1">{call.pickup_location}</span>
        </div>
        <div className="flex items-start gap-2">
          <Navigation className="h-3 w-3 text-red-600 mt-0.5 shrink-0" />
          <span className="text-muted-foreground line-clamp-1">{call.destination}</span>
        </div>
      </div>

      {/* Value and Accept Button */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div>
          <span className="text-xs text-muted-foreground">Valor estimado</span>
          <p className="text-sm font-bold text-foreground">
            R$ {call.estimated_value.toFixed(2).replace('.', ',')}
          </p>
        </div>
        
        {isRide && (
          <Button
            size="sm"
            onClick={onAccept}
            disabled={isAccepting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
          >
            {isAccepting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Realizando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Realizar Corrida
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export default MissedCallsSection;
