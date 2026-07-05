/**
 * M58.0 · Notification Layer — infraestrutura SEM lógica de negócio.
 *
 * Barramento tipado de eventos da plataforma de dashboards + adaptador
 * de toast (usa o use-toast já existente no app — sem nova identidade).
 * O evento 'alert-center:update' fica reservado para os módulos visuais
 * ligarem o Alert Center à UI (M58.x); aqui só existe o canal.
 */

import { toast } from '@/hooks/use-toast';

export type DashboardEvent =
  | { type: 'toast'; level: 'info' | 'warning' | 'error' | 'success'; title: string; description?: string }
  | { type: 'dataset:refreshed'; dataset: string }
  | { type: 'dataset:error'; dataset: string; errorKind: string }
  | { type: 'alert-center:update'; activeCount: number };

type Listener = (e: DashboardEvent) => void;

class NotificationBus {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish(e: DashboardEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch {
        // listener com erro nunca derruba o barramento
      }
    }
    if (e.type === 'toast') {
      toast({
        title: e.title,
        description: e.description,
        variant: e.level === 'error' ? 'destructive' : 'default',
      });
    }
  }
}

export const notifications = new NotificationBus();
