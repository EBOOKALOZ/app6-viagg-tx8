/**
 * useFreightQuotes — dados do marketplace de cotações de frete.
 *
 * Cliente:      minhas solicitações + propostas recebidas (comparador).
 * Transportador: feed de solicitações COMPATÍVEIS com a frota anunciada
 *                (freight_listings do dono) + reações + minhas propostas.
 * Escrita só via RPCs (create/submit/react/accept/update) — padrão do projeto.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface QuoteRequestRow {
  id: string;
  client_user_id: string;
  status: string;
  cargo_type: string | null;
  category: string | null;
  weight_kg: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  volumes: number | null;
  cargo_value_brl: number | null;
  origin_cep: string | null;
  origin_address: string | null;
  origin_city: string | null;
  origin_state: string | null;
  dest_cep: string | null;
  dest_address: string | null;
  dest_city: string | null;
  dest_state: string | null;
  desired_date: string | null;
  desired_time: string | null;
  schedule_flexible: boolean;
  characteristics: string[];
  photos: string[];
  notes: string | null;
  allowed_vehicle_types: string[];
  orion_analysis: Record<string, unknown>;
  accepted_proposal_id: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface QuoteProposalRow {
  id: string;
  request_id: string;
  transporter_user_id: string;
  price_brl: number;
  pickup_eta: string | null;
  delivery_eta: string | null;
  vehicle_type: string | null;
  services: string[];
  has_insurance: boolean;
  notes: string | null;
  status: string;
  created_at: string;
  /** identidade pública do transportador (empresa_fretes) — enriquecida no hook */
  company?: { name: string; logoUrl: string | null; city: string | null; listings: number } | null;
}

const asArr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

function mapRequest(r: Record<string, unknown>): QuoteRequestRow {
  return {
    ...r,
    characteristics: asArr(r.characteristics),
    photos: asArr(r.photos),
    allowed_vehicle_types: asArr(r.allowed_vehicle_types),
  } as QuoteRequestRow;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  // @ts-expect-error - RPC dynamic call
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || `Erro em ${name}.`);
  if (!(data as Record<string, unknown>)?.success) {
    const code = (data as Record<string, unknown>)?.error || "erro_desconhecido";
    const friendly: Record<string, string> = {
      not_authenticated: "Sessão expirada — entre novamente.",
      request_closed: "Esta solicitação já foi encerrada.",
      own_request: "Você não pode enviar proposta para a própria solicitação.",
      invalid_price: "Informe um valor de frete válido.",
      not_owner: "Apenas o dono da solicitação pode fazer isso.",
      invalid_transition: "Ação não permitida para o status atual.",
      insufficient_credits: "Saldo insuficiente na carteira — recarregue seus créditos para abrir o contato.",
      not_unlocked: "Contato ainda não liberado — aceite o serviço para desbloquear.",
      request_not_found: "Solicitação não encontrada.",
    };
    throw new Error(friendly[code] || `Erro: ${code} (a migration foi aplicada?)`);
  }
  return data;
}

// ─── Ações (cliente e transportador) ────────────────────────

export const freightQuoteActions = {
  create: (payload: Record<string, unknown>) =>
    rpc("create_freight_quote_request", { p_payload: payload }),
  submitProposal: (requestId: string, payload: Record<string, unknown>) =>
    rpc("submit_freight_quote_proposal", { p_request_id: requestId, p_payload: payload }),
  react: (requestId: string, action: "recusada" | "ignorada" | "favorita" | "limpar") =>
    rpc("react_freight_quote", { p_request_id: requestId, p_action: action }),
  acceptProposal: (proposalId: string) =>
    rpc("accept_freight_quote_proposal", { p_proposal_id: proposalId }),
  setStatus: (requestId: string, status: "cancelada" | "finalizada") =>
    rpc("update_freight_quote_status", { p_request_id: requestId, p_status: status }),
  // ── V2: Aceitar Serviço direto + frota + rotas + comissão ──
  acceptOpportunity: (requestId: string, price: number | null) =>
    rpc("accept_freight_opportunity", { p_request_id: requestId, p_price: price }),
  upsertVehicle: (id: string | null, payload: Record<string, unknown>) =>
    rpc("upsert_fleet_vehicle", { p_id: id, p_payload: payload }),
  deleteVehicle: (id: string) => rpc("delete_fleet_vehicle", { p_id: id }),
  upsertRoute: (id: string | null, payload: Record<string, unknown>) =>
    rpc("upsert_freight_route", { p_id: id, p_payload: payload }),
  deleteRoute: (id: string) => rpc("delete_freight_route", { p_id: id }),
  adminSetCommission: (settings: Record<string, unknown>) =>
    rpc("admin_set_freight_commission", { p_settings: settings }),
  // ── V2.1: Aceitar Serviço e Abrir Contato ──
  /** Comissão que SERÁ cobrada (transparência antes do aceite). */
  commissionPreview: (price: number, category?: string | null) =>
    rpc("preview_freight_commission", { p_price: price, p_category: category ?? null }) as Promise<{
      enabled: boolean; percent: number; commission_brl: number;
    }>,
  /** Aceita o serviço, registra a comissão e libera o contato do cliente. */
  acceptAndUnlock: (requestId: string, price: number | null) =>
    rpc("accept_freight_opportunity_unlock", { p_request_id: requestId, p_price: price }) as Promise<{
      already_unlocked: boolean; contact: Record<string, unknown>; commission_brl?: number;
    }>,
  /** Contato já liberado (ou libera sem cobrança se o cliente aceitou minha proposta). */
  getUnlockedContact: (requestId: string) =>
    rpc("get_freight_quote_contact", { p_request_id: requestId }) as Promise<{ contact: Record<string, unknown> }>,
};

// ─── V2: Minha Frota + Minhas Rotas ─────────────────────────

export interface FleetVehicleRow {
  id: string;
  vehicle_type: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  max_weight_kg: number | null;
  max_volume_m3: number | null;
  length_m: number | null;
  height_m: number | null;
  width_m: number | null;
  axles: number | null;
  accepted_cargo: string[];
  is_active: boolean;
}

export interface FreightRouteRow {
  id: string;
  vehicle_id: string | null;
  origin_city: string | null;
  origin_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  radius_km: number | null;
  distance_km: number | null;
  suggested_price_brl: number | null;
  days_available: string[];
  times: string | null;
  frequency: string | null;
  availability_mode: string;
  capacity_kg_left: number | null;
  capacity_m3_left: number | null;
  is_active: boolean;
}

export function useFreightFleet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["freight-fleet", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // @ts-expect-error - Some schemas might not be fully typed yet
      const [{ data: vehicles }, { data: routes }] = await Promise.all([
        supabase.from("freight_fleet_vehicles")
          .select("*").eq("owner_user_id", user!.id).order("created_at", { ascending: false }),
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_routes")
          .select("*").eq("owner_user_id", user!.id).order("created_at", { ascending: false }),
      ]);
      return {
        vehicles: ((vehicles || []) as Record<string, unknown>[]).map((v) => ({ ...v, accepted_cargo: asArr(v.accepted_cargo) })) as FleetVehicleRow[],
        routes: ((routes || []) as Record<string, unknown>[]).map((r) => ({ ...r, days_available: asArr(r.days_available) })) as FreightRouteRow[],
      };
    },
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["freight-fleet"] });
    queryClient.invalidateQueries({ queryKey: ["transporter-freight-quotes"] });
  };
  return { ...query, invalidate };
}

// ─── Cliente: minhas solicitações + propostas ───────────────

export function useMyFreightQuotes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["my-freight-quotes", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000, // "notificação": novas propostas aparecem sozinhas
    queryFn: async () => {
      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data: reqs } = await supabase.from("freight_quote_requests")
        .select("*")
        .eq("client_user_id", user!.id)
        .order("created_at", { ascending: false });
      const requests: QuoteRequestRow[] = ((reqs || []) as Record<string, unknown>[]).map(mapRequest);
      if (requests.length === 0) return { requests, proposalsByRequest: {} as Record<string, QuoteProposalRow[]> };

      const ids = requests.map((r) => r.id);
      // @ts-expect-error - Some schemas might not be fully typed yet
      const { data: props } = await supabase.from("freight_quote_proposals")
        .select("*")
        .in("request_id", ids)
        .order("price_brl", { ascending: true });
      const proposals = ((props || []) as Record<string, unknown>[]).map((p) => ({ ...p, services: asArr(p.services) })) as QuoteProposalRow[];

      // Identidade pública dos transportadores (Minha Empresa — empresa_fretes)
      const uids = Array.from(new Set(proposals.map((p) => p.transporter_user_id)));
      const companies: Record<string, QuoteProposalRow["company"]> = {};
      if (uids.length) {
        // @ts-expect-error - Some schemas might not be fully typed yet
        const [{ data: mods }, { data: profs }, { data: counts }] = await Promise.all([
          supabase.from("advertiser_module_profiles")
            .select("user_id, display_name, logo_url, city")
            .eq("module_key", "empresa_fretes")
            .in("user_id", uids),
          // @ts-expect-error - Some schemas might not be fully typed yet
          supabase.from("profiles").select("id, full_name, name").in("id", uids),
          // @ts-expect-error - Some schemas might not be fully typed yet
          supabase.from("freight_listings").select("id, owner_user_id").in("owner_user_id", uids),
        ]);
        const listingCount: Record<string, number> = {};
        ((counts || []) as Record<string, unknown>[]).forEach((l) => {
          const ownerId = l.owner_user_id as string;
          listingCount[ownerId] = (listingCount[ownerId] || 0) + 1;
        });
        uids.forEach((uid) => {
          const mod = ((mods || []) as Record<string, unknown>[]).find((m) => m.user_id === uid);
          const prof = ((profs || []) as Record<string, unknown>[]).find((p) => p.id === uid);
          companies[uid] = {
            name: mod?.display_name || prof?.full_name || prof?.name || "Transportador parceiro",
            logoUrl: mod?.logo_url || null,
            city: mod?.city || null,
            listings: listingCount[uid] || 0,
          };
        });
      }
      proposals.forEach((p) => { p.company = companies[p.transporter_user_id] || null; });

      const proposalsByRequest: Record<string, QuoteProposalRow[]> = {};
      proposals.forEach((p) => {
        (proposalsByRequest[p.request_id] ||= []).push(p);
      });
      return { requests, proposalsByRequest };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["my-freight-quotes"] });
  return { ...query, invalidate };
}

// ─── Transportador: feed de solicitações compatíveis ────────

export interface TransporterQuoteFeed {
  compatible: QuoteRequestRow[];
  favorites: QuoteRequestRow[];
  answered: { request: QuoteRequestRow; proposal: QuoteProposalRow }[];
  dismissed: QuoteRequestRow[];
  fleetVehicleTypes: string[];
  /** dashboard do fretista */
  stats: {
    vehicles: number;
    routes: number;
    accepted: number;
    concluded: number;
    proposals: number;
    acceptRate: number | null;
    revenueBrl: number;
    commissionBrl: number;
  };
}

export function useTransporterFreightQuotes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<TransporterQuoteFeed>({
    queryKey: ["transporter-freight-quotes", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000, // "notificação": novas solicitações chegam sozinhas
    queryFn: async () => {
      const [{ data: open }, { data: listings }, { data: reactions }, { data: myProps },
             { data: fleetVs }, { data: routes }, { data: comms }] = await Promise.all([
        // Solicitações abertas — leitura direta protegida por RLS (policy
        // fqr_select_open: authenticated vê status aguardando/recebendo). PII
        // sensível (endereço completo/telefone/fotos) só é revelada ao abrir o
        // contato via get_freight_quote_contact (build_freight_quote_contact).
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_quote_requests")
          .select("*")
          .in("status", ["aguardando", "recebendo", "negociacao"])
          .gt("expires_at", new Date().toISOString())
          .neq("client_user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(100),
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_listings")
          .select("id, vehicle_type, city, state, coverage_routes")
          .eq("owner_user_id", user!.id),
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_quote_reactions")
          .select("*")
          .eq("transporter_user_id", user!.id),
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_quote_proposals")
          .select("*")
          .eq("transporter_user_id", user!.id)
          .order("created_at", { ascending: false }),
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_fleet_vehicles")
          .select("*").eq("owner_user_id", user!.id).eq("is_active", true),
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_routes")
          .select("*").eq("owner_user_id", user!.id).eq("is_active", true),
        // @ts-expect-error - Some schemas might not be fully typed yet
        supabase.from("freight_service_commissions")
          .select("commission_brl").eq("transporter_user_id", user!.id),
      ]);

      const fleetRows = (listings || []) as Record<string, unknown>[];
      const fleetVehicles = (fleetVs || []) as Record<string, unknown>[];       // V2: Minha Frota
      const fleetRoutes = (routes || []) as Record<string, unknown>[];          // V2: Minhas Rotas
      const fleetVehicleTypes = Array.from(new Set([
        ...fleetRows.map((f) => f.vehicle_type as string),
        ...fleetVehicles.map((v) => v.vehicle_type as string),
      ].filter(Boolean)));
      const fleetStates = new Set([
        ...fleetRows.map((f) => String(f.state || "").toUpperCase()),
        ...fleetRoutes.flatMap((r) => [String(r.origin_state || "").toUpperCase(), String(r.dest_state || "").toUpperCase()]),
      ].filter(Boolean));
      const fleetCities = new Set([
        ...fleetRows.map((f) => String(f.city || "").toLowerCase()),
        ...fleetRoutes.flatMap((r) => [String(r.origin_city || "").toLowerCase(), String(r.dest_city || "").toLowerCase()]),
      ].filter(Boolean));
      const coverageText = [
        fleetRows.map((f) => String(f.coverage_routes || "")).join(" · "),
        fleetRoutes.map((r) => JSON.stringify(r.waypoints || "")).join(" · "),
      ].join(" · ").toLowerCase();
      const maxFleetKg = Math.max(0, ...fleetVehicles.map((v) => Number(v.max_weight_kg) || 0));

      const reactionByReq: Record<string, string> = {};
      ((reactions || []) as Record<string, unknown>[]).forEach((r) => { reactionByReq[r.request_id as string] = r.action as string; });
      const myProposals = ((myProps || []) as Record<string, unknown>[]).map((p) => ({ ...p, services: asArr(p.services) })) as QuoteProposalRow[];
      const proposalByReq: Record<string, QuoteProposalRow> = {};
      myProposals.forEach((p) => { proposalByReq[p.request_id] = p; });

      const all = ((open || []) as Record<string, unknown>[]).map(mapRequest);

      // DISTRIBUIÇÃO AUTOMÁTICA (ORION): só solicitações compatíveis com a
      // frota anunciada — tipo de veículo permitido ∩ frota, e região (cidade/
      // UF do anúncio ou rotas de cobertura contendo origem/destino).
      const isCompatible = (r: QuoteRequestRow): boolean => {
        // Sem anúncio E sem frota cadastrada → sem feed
        if (fleetRows.length === 0 && fleetVehicles.length === 0) return false;
        const vehicleOk =
          r.allowed_vehicle_types.length === 0 ||
          r.allowed_vehicle_types.some((t) => fleetVehicleTypes.includes(t)) ||
          // V2: capacidade real da frota comporta o peso da carga
          (maxFleetKg > 0 && (r.weight_kg == null || r.weight_kg <= maxFleetKg));
        if (!vehicleOk) return false;
        const oCity = String(r.origin_city || "").toLowerCase();
        const dCity = String(r.dest_city || "").toLowerCase();
        const oUf = String(r.origin_state || "").toUpperCase();
        const dUf = String(r.dest_state || "").toUpperCase();
        const regionOk =
          (!oUf && !oCity) || // solicitação sem região → visível
          fleetStates.has(oUf) || fleetStates.has(dUf) ||
          fleetCities.has(oCity) || fleetCities.has(dCity) ||
          (oCity && coverageText.includes(oCity)) ||
          (dCity && coverageText.includes(dCity));
        return regionOk;
      };

      const answered = all
        .filter((r) => proposalByReq[r.id])
        .map((r) => ({ request: r, proposal: proposalByReq[r.id] }));
      // respondidas fora da lista aberta (aceitas/encerradas) também aparecem
      const openIds = new Set(all.map((r) => r.id));
      const closedAnsweredIds = myProposals.filter((p) => !openIds.has(p.request_id)).map((p) => p.request_id);
      if (closedAnsweredIds.length) {
        // Respondidas encerradas — RLS fqr_select_proposer libera a leitura
        // porque o transportador tem proposta nessas solicitações.
        // @ts-expect-error - Some schemas might not be fully typed yet
        const { data: closed } = await supabase.from("freight_quote_requests")
          .select("*")
          .in("id", closedAnsweredIds);
        ((closed || []) as Record<string, unknown>[]).map(mapRequest).forEach((r) => {
          answered.push({ request: r, proposal: proposalByReq[r.id] });
        });
      }

      const fresh = all.filter((r) => !proposalByReq[r.id]);

      // Dashboard do fretista
      const accepted = myProposals.filter((p) => p.status === "aceita");
      const concludedIds = new Set(
        answered.filter((a) => a.request.status === "finalizada").map((a) => a.request.id),
      );
      const stats = {
        vehicles: fleetVehicles.length,
        routes: fleetRoutes.length,
        accepted: accepted.length,
        concluded: concludedIds.size,
        proposals: myProposals.length,
        acceptRate: myProposals.length ? Math.round((100 * accepted.length) / myProposals.length) : null,
        revenueBrl: accepted.reduce((s, p) => s + (Number(p.price_brl) || 0), 0),
        commissionBrl: ((comms || []) as Record<string, unknown>[]).reduce((s, c) => s + (Number(c.commission_brl) || 0), 0),
      };

      return {
        compatible: fresh.filter((r) => isCompatible(r) && !reactionByReq[r.id]),
        favorites: fresh.filter((r) => reactionByReq[r.id] === "favorita"),
        dismissed: fresh.filter((r) => ["recusada", "ignorada"].includes(reactionByReq[r.id])),
        answered,
        fleetVehicleTypes,
        stats,
      };
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["transporter-freight-quotes"] });
  return { ...query, invalidate };
}
