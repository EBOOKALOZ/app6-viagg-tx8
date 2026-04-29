import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, Package, User, Phone, Bike, 
  CheckCircle, MapPin, Store, Navigation, Loader2, XCircle, AlertTriangle
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DeliveryTrackingCardProps {
  delivery: {
    id: string;
    status: string;
    destination: string;
    customer_name: string;
    created_at: string;
    delivery_code: string;
    pickup_code?: string | null;
    pickup_location?: string | null;
    order_description?: string | null;
    motoboy_name: string | null;
    motoboy_phone: string | null;
    motoboy_vehicle: string | null;
    motoboy_avatar: string | null;
    motivo_cancelamento?: string | null;
  };
  onCancelled?: () => void;
}

// Mapeamento de status para etapas do progresso
const STATUS_STEPS = [
  { key: 'pending', label: 'Aguardando motoboy', icon: Clock },
  { key: 'a_caminho', label: 'Motoboy a caminho da loja', icon: Bike },
  { key: 'buscando', label: 'Produto retirado na loja', icon: Store },
  { key: 'entregando', label: 'A caminho do destino', icon: Navigation },
  { key: 'delivered', label: 'Entregue', icon: CheckCircle },
];

function getStepIndex(status: string): number {
  switch (status) {
    case 'pending':
    case 'reserva':
      return 0;
    case 'a_caminho':
    case 'accepted':
      return 1;
    case 'in_progress':
    case 'buscando':
      return 2;
    case 'entregando':
    case 'em_andamento':
      return 3;
    case 'delivered':
    case 'completed':
    case 'finalizado':
      return 4;
    case 'cancelada_por_sistema':
    case 'cancelada_por_lojista':
    case 'cancelled':
      return -1; // Cancelada
    default:
      return 0;
  }
}

function isCancelledStatus(status: string): boolean {
  return ['cancelada_por_sistema', 'cancelada_por_lojista', 'cancelled'].includes(status);
}

function canBeCancelled(status: string): boolean {
  return ['pending', 'reserva'].includes(status);
}

export function DeliveryTrackingCard({ delivery, onCancelled }: DeliveryTrackingCardProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const currentStep = getStepIndex(delivery.status);
  const isAccepted = currentStep >= 1;
  const isCompleted = currentStep >= 4;
  const isCancelled = isCancelledStatus(delivery.status);
  const showCancelButton = canBeCancelled(delivery.status);

  const handleCancelDelivery = async () => {
    setIsCancelling(true);
    try {
      const { error } = await supabase.rpc('cancel_delivery_by_merchant', {
        _order_id: delivery.id
      });

      if (error) throw error;

      toast.success('Entrega cancelada com sucesso');
      onCancelled?.();
    } catch (error: any) {
      console.error('[DeliveryTrackingCard] Erro ao cancelar:', error);
      toast.error('Erro ao cancelar entrega', {
        description: error.message || 'Tente novamente'
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Mensagem para cancelamento automático
  const getCancellationMessage = () => {
    if (delivery.status === 'cancelada_por_sistema') {
      return {
        title: 'Entrega cancelada automaticamente',
        description: 'Nenhum entregador aceitou a entrega em até 3 horas. O valor foi estornado para sua carteira.'
      };
    }
    if (delivery.status === 'cancelada_por_lojista') {
      return {
        title: 'Entrega cancelada',
        description: 'Você cancelou esta entrega. O valor foi estornado para sua carteira.'
      };
    }
    return null;
  };

  const cancellationMessage = getCancellationMessage();

  // Card de entrega cancelada
  if (isCancelled) {
    return (
      <Card className="border-2 border-destructive/50 bg-destructive/5">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="font-semibold text-foreground">Entrega Cancelada</span>
            </div>
            <Badge variant="outline" className="border-destructive text-destructive bg-destructive/10">
              Cancelada
            </Badge>
          </div>

          {/* Mensagem de cancelamento */}
          {cancellationMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">{cancellationMessage.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{cancellationMessage.description}</p>
                </div>
              </div>
            </div>
          )}

          {/* Dados básicos */}
          <div className="space-y-2 opacity-75">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Destino</p>
                <p className="text-sm text-foreground">{delivery.destination}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">{delivery.customer_name}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-2 ${isCompleted ? 'border-green-500/50 bg-green-500/5' : isAccepted ? 'border-primary/50 bg-primary/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
      <CardContent className="p-4 space-y-4">
        {/* Header com código */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Entrega</span>
          </div>
          <Badge variant="outline" className={
            isCompleted 
              ? 'border-green-500 text-green-600 bg-green-500/10' 
              : isAccepted 
                ? 'border-primary text-primary bg-primary/10' 
                : 'border-amber-500 text-amber-600 bg-amber-500/10'
          }>
            {isCompleted ? 'Concluída' : isAccepted ? 'Em andamento' : 'Pendente'}
          </Badge>
        </div>

        {/* Percurso: Coleta → Destino (sempre visível até conclusão) */}
        <div className="space-y-2">
          {/* Local de coleta */}
          {delivery.pickup_location && (
            <div className="flex items-start gap-2">
              <Store className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Coleta</p>
                <p className="text-sm font-medium text-foreground">{delivery.pickup_location}</p>
              </div>
            </div>
          )}
          
          {/* Destino */}
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Destino</p>
              <p className="text-sm font-medium text-foreground">{delivery.destination}</p>
            </div>
          </div>
          
          {/* Cliente */}
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-muted-foreground">{delivery.customer_name}</p>
          </div>
          
          {/* Descrição do pedido */}
          {delivery.order_description && (
            <div className="flex items-start gap-2">
              <Package className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground">{delivery.order_description}</p>
            </div>
          )}
        </div>

        {/* Código de retirada - para a loja informar ao motoboy */}
        {delivery.pickup_code && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-muted-foreground mb-1 text-center">Código de retirada (informe ao motoboy)</p>
            <p className="text-2xl font-mono font-bold text-amber-600 tracking-[0.3em] text-center">
              {delivery.pickup_code}
            </p>
          </div>
        )}

        {/* Código de entrega */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-xs text-muted-foreground mb-1 text-center">Código de entrega (informe ao cliente)</p>
          <p className="text-2xl font-mono font-bold text-primary tracking-[0.3em] text-center">
            {delivery.delivery_code}
          </p>
        </div>

        {/* Progresso Visual */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Acompanhamento
          </p>
          
          <div className="space-y-0">
            {STATUS_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              const isCurrentStep = index === currentStep;
              const stepCompleted = index < currentStep;
              const isPending = index > currentStep;

              return (
                <div key={step.key} className="flex items-stretch">
                  {/* Linha vertical e círculo */}
                  <div className="flex flex-col items-center mr-3">
                    {/* Círculo do passo */}
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                      ${stepCompleted 
                        ? 'bg-green-500 text-white' 
                        : isCurrentStep 
                          ? 'bg-primary text-white ring-4 ring-primary/20' 
                          : 'bg-muted text-muted-foreground'}
                    `}>
                      {stepCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <StepIcon className="h-4 w-4" />
                      )}
                    </div>
                    
                    {/* Linha conectora (exceto no último) */}
                    {index < STATUS_STEPS.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[20px] ${
                        stepCompleted ? 'bg-green-500' : 'bg-muted'
                      }`} />
                    )}
                  </div>

                  {/* Conteúdo do passo */}
                  <div className={`pb-4 flex-1 ${isPending ? 'opacity-50' : ''}`}>
                    <p className={`text-sm font-medium ${
                      isCurrentStep ? 'text-primary' : stepCompleted ? 'text-green-600' : 'text-muted-foreground'
                    }`}>
                      {step.label}
                    </p>
                    {isCurrentStep && !stepCompleted && index === 0 && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Buscando entregador disponível...
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Botão de cancelar (apenas para entregas pendentes) */}
        {showCancelButton && (
          <div className="pt-3 border-t border-border">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full border-destructive text-destructive hover:bg-destructive/10"
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cancelando...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancelar Entrega
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar entrega?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. O valor da entrega será estornado para sua carteira.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelDelivery}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Confirmar cancelamento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Dados do Motoboy (quando aceito) */}
        {isAccepted && (
          <div className="pt-3 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Entregador
            </p>
            
            {delivery.motoboy_name ? (
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={delivery.motoboy_avatar || undefined} alt={delivery.motoboy_name} />
                    <AvatarFallback className="bg-primary/10">
                      <User className="h-6 w-6 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Bike className="h-4 w-4 text-primary" />
                      {delivery.motoboy_name}
                    </p>
                    {delivery.motoboy_vehicle && (
                      <p className="text-xs text-muted-foreground pl-6">
                        {delivery.motoboy_vehicle}
                      </p>
                    )}
                  </div>
                </div>
                {delivery.motoboy_phone && (
                  <a 
                    href={`tel:${delivery.motoboy_phone}`}
                    className="flex items-center justify-center h-10 w-10 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                    title="Ligar para entregador"
                  >
                    <Phone className="h-5 w-5" />
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground p-3 bg-muted/30 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando dados do entregador...</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
