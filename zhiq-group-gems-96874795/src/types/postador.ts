// ═══════════════════════════════════════
// MÓDULO POSTADOR — Tipos Compartilhados
// Baseado no esquema validado do Supabase (public.*)
// ═══════════════════════════════════════

// public.whatsapp_groups — esquema real
export type WhatsAppGroupItem = {
    id: string;
    group_name: string;
    group_link: string;
    neighborhood: string | null;
    city_name: string | null;
    state_code: string | null;
    members_count: number | null;
    is_active: boolean;
    is_valid: boolean;
    validation_status: string;
    invalid_reason: string | null;
    last_posted_at: string | null;
    valid_for_commission: boolean;
    created_at: string;
    updated_at: string;
};

// public.campaign_queue — esquema real
export type CampaignQueueItem = {
    id: string;
    created_by_user_id: string | null;
    merchant_store_id: string | null;
    product_id: string | null;
    campaign_type: string | null;
    title: string | null;
    message_text: string | null;
    media_url: string | null;
    target_city: string | null;
    target_region: string | null;
    status: string;
    scheduled_for: string | null;
    available_from: string | null;
    available_until: string | null;
    created_at: string;
};

// public.group_posting_runtime — esquema real
export type GroupRuntime = {
    id: string;
    whatsapp_group_id: string;
    last_posted_at: string | null;
    cooldown_until: string | null;
    next_allowed_at: string | null;
    total_posts: number;
    created_at: string;
    updated_at: string;
};

// public.posting_history — esquema real
export type PostingHistoryEntry = {
    id: string;
    campaign_queue_id: string | null;
    whatsapp_group_id: string | null;
    operator_user_id: string | null;
    final_status: string;
    template_hash: string | null;
    message_text: string | null;
    execution_notes: string | null;
    posted_at: string;
    // Campos de Prova — adicionados em 11-03-2026
    proof_url: string | null;
    proof_type: string | null; // 'none' | 'file' | 'link' | 'text'
    proof_uploaded_at: string | null;
    proof_storage_path: string | null;
};

// KPIs calculados para o painel do Postador
export type PostadorKPIs = {
    totalGroups: number;
    groupsInCooldown: number;
    totalPostings: number;
    nextRelease: string | null;
};

// Status visual para um grupo no contexto de postagem
export type GroupPostingStatus =
    | "eligible"   // liberado para postar
    | "cooldown"   // em cooldown ativo
    | "posted"     // já postado recentemente
    | "inactive"   // grupo inativo
    | "invalid";   // grupo inválido / rejeitado

// Alias para clareza — mesmo que GroupRuntime
export type GroupPostingRuntimeItem = GroupRuntime;

// Alias para clareza — mesmo que PostingHistoryEntry
export type PostingHistoryItem = PostingHistoryEntry;

// Dados compostos do card: campanha × grupo × runtime para a UI
export type PostingCardItem = {
    campaign: CampaignQueueItem;
    group: WhatsAppGroupItem;
    runtime: GroupRuntime | null;
    groupStatus: GroupPostingStatus;
    operator_user_id: string;
    template_hash: string | null;
};

// Retorno RPC: check_group_posting_eligibility
export type PostingEligibilityResult = {
    ok: boolean;
    reason?: string;
    error?: string;
    next_allowed_at?: string;
    cooldown_remaining_seconds?: number;
};

// Retorno RPC: confirm_posting_with_cooldown
export type ConfirmPostingResult = {
    ok: boolean;
    reason?: string;
    error?: string;
    posting_id?: string;
    cooldown_until?: string;
    next_allowed_at?: string;
};

// ═══════════════════════════════════════
// PAINEL PREMIUM — Tipos de View Oficiais
// ═══════════════════════════════════════

// public.postador_queue_cards_view
export type PendingQueueItem = {
    id: string;
    store_name: string | null;
    product_name: string | null;
    product_image_url: string | null;
    campaign_title: string | null;
    campaign_description: string | null;
    target_city: string | null;
    target_region: string | null;
    neighborhood: string | null;
    priority: number | null;
    created_at: string;
    title: string | null;
    message_text: string | null;
    media_url: string | null;
    status: string | null;
};

// public.postador_kpis_view
export type PostadorKPIsView = {
    pending_count: number;
    posted_count: number;
    cancelled_count: number;
    last_posted_at: string | null;
};

// public.postador_operator_kpis_view
export type PostadorOperatorKPIsView = {
    operator_user_id: string;
    my_posted_count: number;
    my_last_posted_at: string | null;
};

// public.postador_history_view
export type PostadorHistoryViewItem = {
    id: string;
    store_name: string | null;
    product_name: string | null;
    campaign_title: string | null;
    posted_at: string | null;
    operator_name: string | null;
    execution_notes: string | null;
    final_status: string;
    operator_user_id: string | null;
};

// public.postador_history_by_operator_view
export type PostadorMyHistoryItem = {
    id: string;
    store_name: string | null;
    product_name: string | null;
    campaign_title: string | null;
    posted_at: string | null;
    execution_notes: string | null;
    final_status: string;
};

// public.group_posting_runtime_view
export type GroupRuntimeView = {
    id: string;
    whatsapp_group_id: string;
    group_name: string | null;
    city_name: string | null;
    neighborhood: string | null;
    last_posted_at: string | null;
    cooldown_until: string | null;
    next_allowed_at: string | null;
    total_posts: number;
    is_in_cooldown: boolean;
};

// ═══════════════════════════════════════
// POSTADOR 2 — View do Board Operacional
// public.postador_operacional_board
// target_id é a chave primária de toda operação
// ═══════════════════════════════════════

export type PostadorOperacionalBoardItem = {
    target_id: string;
    campaign_queue_id: string;
    whatsapp_group_id: string | null;
    operator_user_id: string | null;
    target_status: string; // 'pending' | 'available' | 'claimed' | 'posted' | 'failed' | 'cancelled'
    claimed_at: string | null;
    claimed_until: string | null; // Timestamp de expiração do claim (janela de 30 min)
    posted_at: string | null;
    proof_type: string | null;
    proof_url: string | null;
    proof_text: string | null;
    posted_message: string | null;
    notes: string | null;
    target_created_at: string;
    target_updated_at: string;
    // Dados da Campanha
    campaign_title: string | null;
    campaign_message: string | null;
    campaign_media_url: string | null;
    campaign_type: string | null;
    source_type: string | null;
    source_id: string | null;
    target_city: string | null;
    target_region: string | null;
    target_bairro: string | null;
    campaign_status: string | null;
    scheduled_for: string | null;
    available_from: string | null;
    available_until: string | null;
    campaign_created_at: string | null;
    // Loja e Produto
    store_name: string | null;
    product_name: string | null;
    product_price: number | null;
    product_image: string | null;
    // Grupo
    whatsapp_group_name: string | null;
    group_city: string | null;
    group_neighborhood: string | null;
    has_media: boolean;
};

// Retorno RPC: can_group_post_now
export type CanGroupPostResult = {
    allowed: boolean;
    reason?: string;
    cooldown_until?: string;
    next_allowed_at?: string;
};

// ═══════════════════════════════════════
// POSTADOR 2 — Tipos da Camada Operacional
// ═══════════════════════════════════════

// public.posting_proofs
export type PostingProof = {
    id: string;
    posting_history_id: string | null;
    campaign_queue_id: string | null;
    whatsapp_group_id: string | null;
    operator_user_id: string | null;
    proof_type: string; // 'screenshot' | 'link' | 'text'
    proof_url: string | null;
    proof_text: string | null;
    created_at: string;
};

export type ClaimTargetResult = {
    ok: boolean;
    reason?: string;
    target_id: string;
    claimed_at?: string;
    claimed_until?: string;
    extended?: boolean;
    active_claims?: number;
    max_claims?: number;
};

// Retorno RPC: confirm_campaign_posting
export type ConfirmWithProofResult = {
    ok: boolean;
    reason?: string;
    target_id?: string;
    posted_at?: string;
    campaign_queue_id?: string;
    whatsapp_group_id?: string;
};

// ═══════════════════════════════════════
// POSTADOR 3 — Tipos de Lote/Batch
// Lotes de 3 produtos por loja
// ═══════════════════════════════════════

export type PostingLotItem = {
    id: string;
    product_id: string | null;
    product_name: string;
    product_price: number | null;
    product_image_url: string | null;
    product_description: string | null;
    position: number;
};

export type PostingLot = {
    lot_id: string;
    store_user_id: string;
    store_name: string | null;
    store_logo_url: string | null;
    target_city: string | null;
    target_region: string | null;
    target_bairro: string | null;
    lot_status: string; // 'available' | 'claimed' | 'posted' | 'cooldown' | 'expired' | 'cancelled'
    operator_user_id: string | null;
    claimed_at: string | null;
    claimed_until: string | null;
    posted_at: string | null;
    cooldown_until: string | null;
    proof_type: string | null;
    proof_url: string | null;
    notes: string | null;
    items_count: number;
    lot_number: number;
    lot_created_at: string;
    lot_updated_at: string;
    items: PostingLotItem[];
    operator_name: string | null;
    tracking_token: string | null;
    click_count: number;
    first_clicked_at: string | null;
};

export type PostingLotEvent = {
    id: string;
    lot_id: string;
    event_type: string;
    user_id: string | null;
    metadata: Record<string, any>;
    created_at: string;
};

export type LotKPIs = {
    ok: boolean;
    posted_count: number;
    claimed_count: number;
    cooldown_count: number;
    last_posted_at: string | null;
    next_available_at: string | null;
};

export type ClaimLotResult = {
    ok: boolean;
    reason?: string;
    lot_id?: string;
    claimed_at?: string;
    claimed_until?: string;
    extended?: boolean;
    active_claims?: number;
};

export type ConfirmLotResult = {
    ok: boolean;
    reason?: string;
    lot_id?: string;
    posted_at?: string;
    cooldown_until?: string;
    store_name?: string;
    items_count?: number;
};

// ═══════════════════════════════════════
// ALIASES — NOVA NOMENCLATURA IMPULSIONAR
// Mantém retrocompatibilidade com código legado
// ═══════════════════════════════════════
export type ImpulsionarQueueItem = CampaignQueueItem;
export type ImpulsionarHistoryEntry = PostingHistoryEntry;
export type ImpulsionarCardView = PostadorCardView;
export type ImpulsionarQueueCard = PostadorQueueCard;
export type ImpulsionarLot = PostingLot;
export type ImpulsionarLotItem = PostingLotItem;
export type ImpulsionarLotView = PostingLotView;
export type ImpulsionarKPIs = LotKPIs;

