/**
 * postingAudit.ts — Auditoria Operacional das Postagens
 *
 * Registra automaticamente o resultado de cada postagem nos módulos:
 * Postador, Motoboy, Moto-Táxi, Motorista e futuros módulos.
 *
 * Uso:
 *   // Antes de postar:
 *   const auditId = await startAuditEntry({ operatorId, profileType: 'motoboy', groupName: 'Grupo SP' })
 *
 *   // Após sucesso:
 *   await finishAuditEntry(auditId, { success: true, apiIdentifier: msgId })
 *
 *   // Após erro:
 *   await finishAuditEntry(auditId, { success: false, errorMessage: 'Rate limit', errorCode: '429' })
 *
 * Também expõe addTimelineEvent() para registros granulares na posting_timeline_events.
 */
import { supabase } from "@/integrations/supabase/client";

// ── Tipos ─────────────────────────────────────────────────────────

export type AuditProfileType = "postador" | "motoboy" | "mototaxi" | "driver" | "system";
export type AuditPlatform    = "whatsapp" | "telegram" | "facebook" | "instagram";
export type AuditStatus      = "sent" | "posted" | "confirmed" | "failed" | "error" | "cancelled" | "pending";

export type TimelineEventType =
  | "queued"
  | "processing"
  | "group_selected"
  | "sent"
  | "confirmed"
  | "error"
  | "retry"
  | "cancelled"
  | "completed";

export interface StartAuditParams {
  /** UUID do usuário operador (auth.uid()) */
  operatorId: string;
  /** Perfil que está realizando a postagem */
  profileType: AuditProfileType;
  /** Plataforma de destino (padrão: whatsapp) */
  platform?: AuditPlatform;
  /** UUID da campanha relacionada (campaign_queue.id) */
  campaignQueueId?: string;
  /** UUID do grupo WhatsApp / destino */
  groupId?: string;
  /** Nome do grupo (desnormalizado para consultas rápidas) */
  groupName?: string;
  /** Título da campanha */
  campaignTitle?: string;
  /** Texto da mensagem postada */
  messageText?: string;
  /** Hash do template usado */
  templateHash?: string;
}

export interface FinishAuditParams {
  /** true = postagem bem-sucedida, false = falha */
  success: boolean;
  /** Identificador da mensagem retornado pela API (ex: WAPI message id) */
  apiIdentifier?: string;
  /** Código de erro (ex: '429', 'BLOCKED', 'TIMEOUT') */
  errorCode?: string;
  /** Mensagem de erro completa */
  errorMessage?: string;
  /** Notas de execução */
  executionNotes?: string;
  /** URL da prova de postagem */
  proofUrl?: string;
  /** Tipo de prova */
  proofType?: string;
}

export interface AddTimelineEventParams {
  postingHistoryId?: string;
  postingLotId?: string;
  eventType: TimelineEventType;
  eventLabel: string;
  eventDetail?: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string;
  actorProfile?: AuditProfileType | "system" | "glm";
}

// ── Utilitário: silencia erros de rede ───────────────────────────

async function trySilent<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn("[postingAudit]", err);
    return null;
  }
}

// ── API pública ───────────────────────────────────────────────────

/**
 * Cria um registro de auditoria no início de uma tentativa de postagem.
 * Retorna o UUID do registro (posting_history.id) para ser usado em finishAuditEntry().
 * Se falhar silenciosamente, retorna null — não deve bloquear o fluxo principal.
 */
export async function startAuditEntry(params: StartAuditParams): Promise<string | null> {
  return trySilent(async () => {
    const now = new Date().toISOString();
    // @ts-expect-error - table might not be in DB types
    const { data, error } = await supabase.from("posting_history")
      .insert({
        operator_user_id:  params.operatorId,
        profile_type:      params.profileType,
        platform:          params.platform ?? "whatsapp",
        campaign_queue_id: params.campaignQueueId ?? null,
        whatsapp_group_id: params.groupId ?? null,
        group_name:        params.groupName ?? null,
        title:             params.campaignTitle ?? null,
        message_text:      params.messageText ?? null,
        template_hash:     params.templateHash ?? null,
        final_status:      "pending",
        started_at:        now,
        posted_at:         now,
        attempt_count:     1,
      })
      .select("id")
      .single();

    if (error) {
      console.warn("[postingAudit] startAuditEntry:", error.message);
      return null;
    }
    return (data as { id: string }).id ?? null;
  });
}

/**
 * Finaliza um registro de auditoria com o resultado da operação.
 * Calcula elapsed_ms automaticamente a partir de started_at.
 */
export async function finishAuditEntry(
  auditId: string,
  params: FinishAuditParams,
): Promise<void> {
  await trySilent(async () => {
    const now = new Date().toISOString();
    const status: AuditStatus = params.success ? "sent" : "error";

    // @ts-expect-error - table might not be in DB types
    const { error } = await supabase.from("posting_history")
      .update({
        final_status:      status,
        posted_at:         now,
        error_message:     params.errorMessage ?? null,
        error_code:        params.errorCode ?? null,
        execution_notes:   params.executionNotes ?? null,
        proof_url:         params.proofUrl ?? null,
        proof_type:        params.proofType ?? null,
      })
      .eq("id", auditId);

    if (error) {
      console.warn("[postingAudit] finishAuditEntry:", error.message);
    }
  });
}

/**
 * Adiciona um evento à linha do tempo de uma postagem.
 * Chamado em pontos-chave do fluxo (opcional — não bloqueia).
 */
export async function addTimelineEvent(params: AddTimelineEventParams): Promise<void> {
  await trySilent(async () => {
    // @ts-expect-error - table might not be in DB types
    const { error } = await supabase.from("posting_timeline_events").insert({
      posting_history_id: params.postingHistoryId ?? null,
      posting_lot_id:     params.postingLotId ?? null,
      event_type:         params.eventType,
      event_label:        params.eventLabel,
      event_detail:       params.eventDetail ?? null,
      metadata:           params.metadata ?? {},
      actor_user_id:      params.actorUserId ?? null,
      actor_profile:      params.actorProfile ?? "system",
    });
    if (error) console.warn("[postingAudit] addTimelineEvent:", error.message);
  });
}

/**
 * Atalho: registra início + success em uma chamada única.
 * Útil quando não há necessidade de rastrear o estado intermediário.
 */
export async function logSuccessfulPosting(
  params: StartAuditParams & { apiIdentifier?: string },
): Promise<string | null> {
  const id = await startAuditEntry(params);
  if (id) {
    await finishAuditEntry(id, { success: true, apiIdentifier: params.apiIdentifier });
    await addTimelineEvent({
      postingHistoryId: id,
      eventType:        "completed",
      eventLabel:       "Postagem concluída",
      actorUserId:      params.operatorId,
      actorProfile:     params.profileType,
    });
  }
  return id;
}

/**
 * Atalho: registra início + failure em uma chamada única.
 */
export async function logFailedPosting(
  params: StartAuditParams & { errorMessage: string; errorCode?: string },
): Promise<string | null> {
  const id = await startAuditEntry(params);
  if (id) {
    await finishAuditEntry(id, {
      success:      false,
      errorMessage: params.errorMessage,
      errorCode:    params.errorCode,
    });
    await addTimelineEvent({
      postingHistoryId: id,
      eventType:        "error",
      eventLabel:       "Falha na postagem",
      eventDetail:      params.errorMessage,
      actorUserId:      params.operatorId,
      actorProfile:     params.profileType,
    });
  }
  return id;
}

/**
 * Atualiza o profile_type de um registro já existente (posting_history).
 * Usado quando o registro foi criado pelo RPC confirm_campaign_posting
 * e queremos adicionar informações de perfil retroativamente.
 */
export async function patchAuditProfile(
  campaignQueueId: string,
  profileType: AuditProfileType,
  groupName?: string,
): Promise<void> {
  await trySilent(async () => {
    // @ts-expect-error - table might not be in DB types
    const { error } = await supabase.from("posting_history")
      .update({
        profile_type: profileType,
        ...(groupName ? { group_name: groupName } : {}),
      })
      .eq("campaign_queue_id", campaignQueueId)
      .is("profile_type", null) // só atualiza se ainda não definido
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) console.warn("[postingAudit] patchAuditProfile:", error.message);
  });
}
