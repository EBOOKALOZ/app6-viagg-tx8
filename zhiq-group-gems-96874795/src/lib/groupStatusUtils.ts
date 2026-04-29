/**
 * Utility to map between the visual/UI group status and the real
 * database columns on public.whatsapp_groups.
 *
 * Real columns:
 *   - validation_status: 'pending' | 'approved' | 'rejected' | 'inactive' | 'expired'
 *   - is_active: boolean
 *   - is_valid: boolean           (recalculated by RPC)
 *   - valid_for_commission: boolean (recalculated by RPC)
 *
 * Visual status used in the UI:
 *   'em_analise' | 'ativo' | 'bloqueado' | 'inativo' | 'expirado'
 */

// ─── Visual Status type ─────────────────────────────────────────
export type VisualGroupStatus = 'em_analise' | 'ativo' | 'bloqueado' | 'inativo' | 'expirado';

// ─── DB → Visual ────────────────────────────────────────────────
export function deriveVisualStatus(row: {
    validation_status?: string | null;
    is_active?: boolean | null;
}): VisualGroupStatus {
    const vs = row.validation_status ?? 'pending';
    const active = row.is_active ?? false;

    switch (vs) {
        case 'approved':
            return active ? 'ativo' : 'inativo';
        case 'rejected':
            return 'bloqueado';
        case 'inactive':
            return 'inativo';
        case 'expired':
            return 'expirado';
        case 'pending':
        default:
            return 'em_analise';
    }
}

// ─── Visual → DB fields ────────────────────────────────────────
export function visualStatusToDbFields(visual: VisualGroupStatus): {
    validation_status: string;
    is_active: boolean;
    is_valid: boolean;
    valid_for_commission: boolean;
} {
    switch (visual) {
        case 'em_analise':
            return { validation_status: 'pending', is_active: false, is_valid: false, valid_for_commission: false };
        case 'ativo':
            // valid_for_commission is computed by the backend trigger
            // based on members_count and last_posted_at — do NOT hardcode here.
            return { validation_status: 'approved', is_active: true, is_valid: true, valid_for_commission: true };
        case 'bloqueado':
            return { validation_status: 'rejected', is_active: false, is_valid: false, valid_for_commission: false };
        case 'inativo':
            return { validation_status: 'inactive', is_active: false, is_valid: false, valid_for_commission: false };
        case 'expirado':
            return { validation_status: 'expired', is_active: false, is_valid: false, valid_for_commission: false };
        default:
            return { validation_status: 'pending', is_active: false, is_valid: false, valid_for_commission: false };
    }
}
