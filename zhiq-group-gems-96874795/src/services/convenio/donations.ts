import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { assertStatusTransition } from "@/lib/convenio/statusTransitions";
import { DONATIONS_ACTIONS_ENABLED, DISABLED_ACTION_MESSAGE } from "@/lib/featureFlags";
import type { ConvenioDonation, ConvenioDonationInsert, ConvenioDonationStatus } from "./types";

export interface ConvenioDonationWithCampaign extends ConvenioDonation {
  campaign_title: string | null;
}

export const DONATIONS_PAGE_SIZE = 50;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DONOR_NAME_LENGTH = 200;
const MAX_AMOUNT = 1_000_000;

// Espelha as CHECK constraints da tabela convenio_donations (migration
// 20260801): status/source têm os mesmos valores permitidos no banco. O banco
// continua sendo a autoridade final (fail-closed); esta validação só existe
// para dar erro amigável antes do roundtrip e nunca aceitar um payload que o
// banco rejeitaria de qualquer forma.
const donationInsertSchema = z.object({
  donor_name: z
    .string()
    .trim()
    .min(1, "Nome do doador não pode ser vazio")
    .max(MAX_DONOR_NAME_LENGTH, `Nome do doador excede ${MAX_DONOR_NAME_LENGTH} caracteres`)
    .nullable()
    .optional(),
  is_anonymous: z.boolean().optional(),
  amount: z
    .number({ invalid_type_error: "Valor deve ser um número" })
    .finite("Valor deve ser um número finito")
    .positive("Valor deve ser maior que zero")
    .max(MAX_AMOUNT, `Valor excede o limite de R$ ${MAX_AMOUNT.toLocaleString("pt-BR")}`),
  campaign_id: z
    .string()
    .regex(UUID_REGEX, "ID de campanha inválido")
    .nullable()
    .optional(),
  status: z.enum(["registrada", "confirmada", "estornada"]).optional(),
  source: z.enum(["manual", "plataforma", "externa"]).optional(),
});

/**
 * Valida o payload de criação de doação contra as mesmas regras das CHECK
 * constraints do banco. Lança erro com mensagem amigável (primeira violação)
 * em vez de deixar o Postgres rejeitar o insert sem contexto para o usuário.
 */
export function validateDonationInput(input: ConvenioDonationInsert): ConvenioDonationInsert {
  const result = donationInsertSchema.safeParse(input);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(firstIssue?.message ?? "Dados da doação inválidos");
  }
  return input;
}

export interface DonationsPage {
  rows: ConvenioDonationWithCampaign[];
  hasMore: boolean;
}

export async function listDonations(page = 0): Promise<DonationsPage> {
  const from = page * DONATIONS_PAGE_SIZE;
  const to = from + DONATIONS_PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from("convenio_donations")
    .select("*, convenio_campaigns(title)")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`Falha ao carregar doações: ${error.message}`);

  const rows = (data ?? []).map((row) => {
    const { convenio_campaigns, ...rest } = row as ConvenioDonation & { convenio_campaigns: { title: string } | null };
    return { ...rest, campaign_title: convenio_campaigns?.title ?? null };
  });
  return { rows, hasMore: rows.length === DONATIONS_PAGE_SIZE };
}

/**
 * Todas as doações para exportação de relatório (PDF/Excel): varre o banco em
 * lotes de 1000 — não usa a página da tela nem trunca o relatório.
 */
export async function listAllDonationsForExport(): Promise<ConvenioDonationWithCampaign[]> {
  const BATCH = 1000;
  const all: ConvenioDonationWithCampaign[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from("convenio_donations")
      .select("*, convenio_campaigns(title)")
      .order("created_at", { ascending: false })
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`Falha ao exportar doações: ${error.message}`);
    const rows = (data ?? []).map((row) => {
      const { convenio_campaigns, ...rest } = row as ConvenioDonation & { convenio_campaigns: { title: string } | null };
      return { ...rest, campaign_title: convenio_campaigns?.title ?? null };
    });
    all.push(...rows);
    if (rows.length < BATCH) return all;
  }
}

export async function createDonation(input: ConvenioDonationInsert): Promise<ConvenioDonation> {
  if (!DONATIONS_ACTIONS_ENABLED) throw new Error(DISABLED_ACTION_MESSAGE);
  const validated = validateDonationInput(input);
  const { data, error } = await supabase
    .from("convenio_donations")
    .insert({ ...validated, source: validated.source ?? "manual" })
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao registrar doação: ${error.message}`);
  return data;
}

/**
 * Muda o status de uma doação respeitando a máquina de estados
 * (registrada → confirmada/estornada; confirmada → estornada; estornada é
 * terminal). A validação aqui gera erro amigável; o trigger
 * trg_convenio_status_transition no banco é a autoridade final e o trigger
 * trg_convenio_sync_campaign_raised ajusta raised_amount da campanha.
 */
export async function updateDonationStatus(params: {
  id: string;
  from: ConvenioDonationStatus;
  to: ConvenioDonationStatus;
}): Promise<ConvenioDonation> {
  if (!DONATIONS_ACTIONS_ENABLED) throw new Error(DISABLED_ACTION_MESSAGE);
  if (!UUID_REGEX.test(params.id)) throw new Error("ID de doação inválido");
  assertStatusTransition("donation", params.from, params.to);
  const { data, error } = await supabase
    .from("convenio_donations")
    .update({ status: params.to })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) throw new Error(`Falha ao mudar status da doação: ${error.message}`);
  return data;
}
