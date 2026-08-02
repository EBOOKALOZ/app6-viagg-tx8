import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type ConvenioEntity = Tables["convenio_entities"]["Row"];
export type ConvenioEntityInsert = Tables["convenio_entities"]["Insert"];
export type ConvenioEntityUpdate = Tables["convenio_entities"]["Update"];

export type ConvenioAgreement = Tables["convenio_agreements"]["Row"];
export type ConvenioAgreementInsert = Tables["convenio_agreements"]["Insert"];
export type ConvenioAgreementUpdate = Tables["convenio_agreements"]["Update"];
export type ConvenioAgreementHistory = Tables["convenio_agreement_history"]["Row"];

export type ConvenioCampaign = Tables["convenio_campaigns"]["Row"];
export type ConvenioCampaignInsert = Tables["convenio_campaigns"]["Insert"];
export type ConvenioCampaignUpdate = Tables["convenio_campaigns"]["Update"];

export type ConvenioDonation = Tables["convenio_donations"]["Row"];
export type ConvenioDonationInsert = Tables["convenio_donations"]["Insert"];

export type ConvenioAccountability = Tables["convenio_accountability"]["Row"];
export type ConvenioAccountabilityInsert = Tables["convenio_accountability"]["Insert"];
export type ConvenioAccountabilityUpdate = Tables["convenio_accountability"]["Update"];

export type ConvenioAuditLog = Tables["convenio_audit_log"]["Row"];

export type ConvenioMessage = Tables["convenio_messages"]["Row"];
export type ConvenioMessageInsert = Tables["convenio_messages"]["Insert"];

export type ConvenioSettings = Tables["convenio_settings"]["Row"];
export type ConvenioSettingsUpdate = Tables["convenio_settings"]["Update"];

export type ConvenioDashboardStats = Database["public"]["Views"]["convenio_dashboard_stats"]["Row"];

export type ConvenioEntityCategory =
  | "clinica"
  | "laboratorio"
  | "farmacia"
  | "hospital"
  | "instituicao"
  | "parceiro"
  | "prestador";

export type ConvenioEntityStatus = "em_analise" | "ativo" | "suspenso" | "encerrado" | "reprovado";
export type ConvenioAgreementStatus = "rascunho" | "em_aprovacao" | "ativo" | "suspenso" | "encerrado";
export type ConvenioCampaignStatus = "planejada" | "ativa" | "pausada" | "encerrada";
export type ConvenioDonationStatus = "registrada" | "confirmada" | "estornada";
export type ConvenioAccountabilityStatus = "rascunho" | "publicada" | "arquivada";

export interface ConvenioGestor {
  user_id: string;
  email: string;
  assigned_at: string;
}
