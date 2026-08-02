import { supabase } from "@/integrations/supabase/client";
import type { ConvenioDashboardStats } from "./types";

export async function getDashboardStats(): Promise<ConvenioDashboardStats> {
  const { data, error } = await supabase.from("convenio_dashboard_stats").select("*").single();
  if (error) throw error;
  return data;
}

export interface MonthlyEvolutionPoint {
  month: string;
  arrecadado: number;
  destinado: number;
}

export async function getMonthlyEvolution(months = 6): Promise<MonthlyEvolutionPoint[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [{ data: donations, error: donationsError }, { data: campaigns, error: campaignsError }] = await Promise.all([
    supabase
      .from("convenio_donations")
      .select("amount, created_at")
      .eq("status", "confirmada")
      .gte("created_at", since.toISOString()),
    supabase
      .from("convenio_campaigns")
      .select("raised_amount, updated_at")
      .gte("updated_at", since.toISOString()),
  ]);
  if (donationsError) throw donationsError;
  if (campaignsError) throw campaignsError;

  const buckets = new Map<string, { arrecadado: number; destinado: number }>();
  const cursor = new Date(since);
  for (let i = 0; i < months; i++) {
    const key = cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    buckets.set(key, { arrecadado: 0, destinado: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const d of donations ?? []) {
    const key = new Date(d.created_at).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const bucket = buckets.get(key);
    if (bucket) bucket.arrecadado += Number(d.amount);
  }
  for (const c of campaigns ?? []) {
    const key = new Date(c.updated_at).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    const bucket = buckets.get(key);
    if (bucket) bucket.destinado += Number(c.raised_amount);
  }

  return Array.from(buckets.entries()).map(([month, values]) => ({ month, ...values }));
}
