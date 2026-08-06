/**
 * ORION-QA Fase 2 — arquitetura plugável de notificações.
 *
 * NENHUMA integração é feita nesta fase (Sentry/Slack/Discord/Teams/Email/
 * WhatsApp ficam para a Fase 3). Este módulo define o CONTRATO: canais se
 * registram via `registerQaNotificationChannel` e passam a receber todos os
 * eventos emitidos pelas mutações do módulo. Falha de canal nunca quebra a
 * operação de origem (fire-and-forget com isolamento de erro).
 */

export const QA_NOTIFICATION_EVENTS = [
  "novo_problema",
  "mudanca_status",
  "reabertura",
  "comentario",
  "anexo",
  "responsavel_alterado",
] as const;
export type QaNotificationEventType = (typeof QA_NOTIFICATION_EVENTS)[number];

export interface QaNotificationEvent {
  type: QaNotificationEventType;
  issueId: string;
  issueNumber: number | null;
  title: string;
  occurredAt: string; // ISO
  /** Dados específicos do evento (ex.: status antigo/novo, nome do anexo). */
  payload: Record<string, string | number | null>;
}

export interface QaNotificationChannel {
  /** Identificador único (ex.: "slack", "email", "sentry"). */
  name: string;
  /** Eventos que o canal quer receber; omitido = todos. */
  events?: QaNotificationEventType[];
  send(event: QaNotificationEvent): Promise<void>;
}

const channels = new Map<string, QaNotificationChannel>();

export function registerQaNotificationChannel(channel: QaNotificationChannel): void {
  channels.set(channel.name, channel);
}

export function unregisterQaNotificationChannel(name: string): void {
  channels.delete(name);
}

export function listQaNotificationChannels(): string[] {
  return [...channels.keys()];
}

/** Emite o evento para todos os canais inscritos. Nunca lança: notificação é
 *  efeito colateral — a operação principal (criar/atualizar/comentar) não pode
 *  falhar por causa de um canal quebrado. */
export function emitQaNotification(event: QaNotificationEvent): void {
  for (const channel of channels.values()) {
    if (channel.events && !channel.events.includes(event.type)) continue;
    void channel.send(event).catch((err) => {
      console.warn(`[ORION-QA] canal de notificação "${channel.name}" falhou:`, err);
    });
  }
}

/** Açúcar para montar eventos com timestamp automático. */
export function buildQaEvent(
  type: QaNotificationEventType,
  issue: { id: string; issue_number: number | null; title: string },
  payload: Record<string, string | number | null> = {},
): QaNotificationEvent {
  return {
    type,
    issueId: issue.id,
    issueNumber: issue.issue_number,
    title: issue.title,
    occurredAt: new Date().toISOString(),
    payload,
  };
}
