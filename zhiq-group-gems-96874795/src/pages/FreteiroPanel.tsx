import { useState } from 'react';
import { Truck, Power, MapPin, Package } from 'lucide-react';
import freiteiroHero from '@/assets/freteiro-hero.png';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PanelHeader } from '@/components/PanelHeader';
import { FreteRequestModal } from '@/components/frete/FreteRequestModal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function FreteiroPanel() {
  const [isOnline, setIsOnline] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [activeSolicitacaoId, setActiveSolicitacaoId] = useState<string | null>(null);

  const handleToggleOnline = () => {
    setIsOnline(!isOnline);
  };

  const handleSolicitacaoSuccess = (id: string) => {
    setActiveSolicitacaoId(id);
    toast.success('Solicitação criada!', {
      description: 'Aguardando motorista aceitar seu frete',
    });
  };

  return (
    <div className="flex flex-col flex-1">
      <PanelHeader icon={Truck} label="Fretes" />

      <main className="flex-1 container max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Status Card */}
        <Card className={cn(
          'border-2 transition-all duration-300',
          isOnline 
            ? 'border-primary bg-primary/5' 
            : 'border-muted'
        )}>
          <CardContent className="p-6 text-center space-y-4">
            <div className={cn(
              'mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden',
              isOnline 
                ? 'bg-primary' 
                : 'bg-muted'
            )}>
              <img 
                src={freiteiroHero} 
                alt="Freteiro" 
                className="w-[80%] h-[80%] object-cover rounded-full"
              />
            </div>
            
            <div>
              <h2 className="text-xl font-bold">
                {isOnline ? 'Você está online' : 'Você está offline'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isOnline 
                  ? 'Aguardando solicitações de frete...' 
                  : 'Fique online para receber solicitações'}
              </p>
            </div>

            <Button
              size="lg"
              className={cn(
                'w-full h-14 text-lg font-semibold transition-all',
                isOnline 
                  ? 'bg-destructive hover:bg-destructive/90' 
                  : 'bg-primary hover:bg-primary/90'
              )}
              onClick={handleToggleOnline}
            >
              <Power className="mr-2 h-5 w-5" />
              {isOnline ? 'Ficar Offline' : 'Ficar Online'}
            </Button>
          </CardContent>
        </Card>

        {/* Solicitar Frete Card */}
        <Card className="border-2 border-dashed border-primary/30 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setShowRequestModal(true)}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Solicitar Frete</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Precisa transportar algo? Clique aqui para criar uma solicitação.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Solicitação Ativa */}
        {activeSolicitacaoId && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="animate-pulse rounded-full bg-primary/20 p-2">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Aguardando motorista</h3>
                  <p className="text-sm text-muted-foreground">
                    Sua solicitação está sendo enviada para freteiros da região...
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Receba solicitações de frete</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Cargas leves, mudanças e transporte em caminhões.
                  Fique online para começar a receber chamados.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Placeholder for future features */}
        {isOnline && !activeSolicitacaoId && (
          <Card className="border-dashed border-2 border-muted">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground text-sm">
                Nenhuma solicitação no momento.
                <br />
                Aguardando novos fretes...
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Modal de Solicitação */}
      <FreteRequestModal
        open={showRequestModal}
        onOpenChange={setShowRequestModal}
        onSuccess={handleSolicitacaoSuccess}
      />
    </div>
  );
}
