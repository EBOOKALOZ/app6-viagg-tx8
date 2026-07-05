/**
 * useOperatorPromotion
 * Hook unificado de auto-promoção para Motorista, Moto Táxi e Motoboy.
 * Consome as RPCs do Motor Universal (Tier 2.2) sem duplicar lógica.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OperatorProfileType, OperatorSlot } from "@/lib/ai/postadorBridge";

export interface OperatorPromotionalSlot {
  id:                 string;
  user_id:            string;
  profile_type:       OperatorProfileType;
  service_type:       string;
  title:              string;
  description:        string | null;
  coverage_city:      string | null;
  coverage_state:     string | null;
  coverage_bairros:   string[];
  availability_days:  string[];
  availability_hours: Record<string, string>;
  price_from:         number | null;
  price_to:           number | null;
  whatsapp:           string | null;
  image_url:          string | null;
  position:           number;
  status:             "active" | "paused" | "finished" | "removed";
  post_count:         number;
  last_posted_at:     string | null;
  latest_campaign_id: string | null;
  created_at:         string;
  updated_at:         string;
}

export interface ServiceCategory {
  service_type: string;
  label:        string;
  description:  string | null;
  icon:         string | null;
  sort_order:   number;
}

export interface CreateSlotInput {
  profile_type:        OperatorProfileType;
  service_type:        string;
  title:               string;
  description?:        string;
  coverage_city?:      string;
  coverage_state?:     string;
  coverage_bairros?:   string[];
  availability_days?:  string[];
  availability_hours?: Record<string, string>;
  price_from?:         number;
  price_to?:           number;
  whatsapp?:           string;
  image_url?:          string;
}

export interface OperatorPromotionSummary {
  active_slots:        number;
  paused_slots:        number;
  finished_slots:      number;
  total_posts:         number;
  last_posted_at:      string | null;
  completed_campaigns: number;
  active_campaigns:    number;
}

export function useOperatorPromotion(profileType: OperatorProfileType) {
  const [slots, setSlots]             = useState<OperatorPromotionalSlot[]>([]);
  const [categories, setCategories]   = useState<ServiceCategory[]>([]);
  const [summary, setSummary]         = useState<OperatorPromotionSummary | null>(null);
  const [loading, setLoading]         = useState(false);
  const [posting, setPosting]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── Fetch slots do operador autenticado ──────────────────────────────────
  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("operator_promotional_slots" as any)
        .select("*")
        .eq("profile_type", profileType)
        .neq("status", "removed")
        .order("position", { ascending: true });

      if (err) throw new Error(err.message);
      setSlots((data ?? []) as OperatorPromotionalSlot[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [profileType]);

  // ── Fetch categorias de serviço do perfil ────────────────────────────────
  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from("operator_service_categories" as any)
      .select("service_type, label, description, icon, sort_order")
      .eq("profile_type", profileType)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    setCategories((data ?? []) as ServiceCategory[]);
  }, [profileType]);

  // ── Fetch summary (KPIs) ─────────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("operator_promotion_summary" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("profile_type", profileType)
      .single();
    if (data) setSummary(data as OperatorPromotionSummary);
  }, [profileType]);

  // ── Criar novo slot ──────────────────────────────────────────────────────
  const createSlot = useCallback(async (input: CreateSlotInput): Promise<{ ok: boolean; error?: string }> => {
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc(
        "create_operator_promotional_slot" as any,
        {
          p_profile_type:       input.profile_type,
          p_service_type:       input.service_type,
          p_title:              input.title,
          p_description:        input.description       ?? null,
          p_coverage_city:      input.coverage_city     ?? null,
          p_coverage_state:     input.coverage_state    ?? null,
          p_coverage_bairros:   input.coverage_bairros  ?? [],
          p_availability_days:  input.availability_days ?? [],
          p_availability_hours: input.availability_hours ?? {},
          p_price_from:         input.price_from        ?? null,
          p_price_to:           input.price_to          ?? null,
          p_whatsapp:           input.whatsapp          ?? null,
          p_image_url:          input.image_url         ?? null,
        },
      );
      if (err) throw new Error(err.message);
      const result = data as any;
      if (!result?.ok) throw new Error(result?.error ?? "Erro ao criar slot");
      await fetchSlots();
      await fetchSummary();
      return { ok: true };
    } catch (e: any) {
      setError(e.message);
      return { ok: false, error: e.message };
    }
  }, [fetchSlots, fetchSummary]);

  // ── Atualizar status do slot ─────────────────────────────────────────────
  const updateSlotStatus = useCallback(async (
    slotId: string,
    status: "active" | "paused" | "finished" | "removed",
    reason?: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data, error: err } = await supabase.rpc(
        "update_operator_slot_status" as any,
        { p_slot_id: slotId, p_status: status, p_reason: reason ?? null },
      );
      if (err) throw new Error(err.message);
      const result = data as any;
      if (!result?.ok) throw new Error(result?.error ?? "Erro ao atualizar status");
      await fetchSlots();
      await fetchSummary();
      return { ok: true };
    } catch (e: any) {
      setError(e.message);
      return { ok: false, error: e.message };
    }
  }, [fetchSlots, fetchSummary]);

  // ── Postar slots agora ───────────────────────────────────────────────────
  const postSlots = useCallback(async (
    slotIds: string[],
    groupId?: string,
    messageText?: string,
  ): Promise<{ ok: boolean; lotId?: string; error?: string }> => {
    setPosting(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc(
        "generate_operator_posting_lots" as any,
        {
          p_profile_type:  profileType,
          p_slot_ids:      slotIds,
          p_group_id:      groupId       ?? null,
          p_message_text:  messageText   ?? null,
          p_campaign_id:   null,
        },
      );
      if (err) throw new Error(err.message);
      const result = data as any;
      if (!result?.ok) throw new Error(result?.error ?? "Erro ao postar slots");
      await fetchSlots();
      await fetchSummary();
      return { ok: true, lotId: result.lot_id };
    } catch (e: any) {
      setError(e.message);
      return { ok: false, error: e.message };
    } finally {
      setPosting(false);
    }
  }, [profileType, fetchSlots, fetchSummary]);

  // ── Inicializar ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSlots();
    fetchCategories();
    fetchSummary();
  }, [fetchSlots, fetchCategories, fetchSummary]);

  return {
    slots,
    categories,
    summary,
    loading,
    posting,
    error,
    fetchSlots,
    createSlot,
    updateSlotStatus,
    postSlots,
  };
}
