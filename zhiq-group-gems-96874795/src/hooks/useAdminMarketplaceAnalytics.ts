import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePackageSalesDaily() {
  return useQuery({
    queryKey: ["package-sales-daily"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("v_package_sales_daily")
          .select("*")
          .order("sale_date", { ascending: false })
          .limit(30);
        if (error) {
          console.warn("View v_package_sales_daily not ready:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}

export function usePackageSalesSummary() {
  return useQuery({
    queryKey: ["package-sales-summary"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("v_package_sales_summary")
          .select("*")
          .order("total_sales", { ascending: false });
        if (error) {
          console.warn("View v_package_sales_summary not ready:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}

export function useStoreCreditUsage() {
  return useQuery({
    queryKey: ["store-credit-usage"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("v_store_credit_usage")
          .select("*")
          .order("total_credits_used", { ascending: false })
          .limit(100);
        if (error) {
          console.warn("View v_store_credit_usage not ready:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}

export function useHourlyCreditUsage() {
  return useQuery({
    queryKey: ["hourly-credit-usage"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("v_hourly_credit_usage")
          .select("*")
          .order("hour_of_day");
        if (error) {
          console.warn("View v_hourly_credit_usage not ready:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}

export function useTopStoresCreditUsage() {
  return useQuery({
    queryKey: ["top-stores-credit-usage"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("v_top_stores_by_credit_usage")
          .select("*");
        if (error) {
          console.warn("View v_top_stores_by_credit_usage not ready:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}

export function useCategoryCreditUsage() {
  return useQuery({
    queryKey: ["category-credit-usage"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("v_category_credit_usage")
          .select("*")
          .order("credits_consumed", { ascending: false });
        if (error) {
          console.warn("View v_category_credit_usage not ready:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}

export function useWeekdaySales() {
  return useQuery({
    queryKey: ["weekday-sales"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("v_weekday_sales")
          .select("*")
          .order("day_of_week");
        if (error) {
          console.warn("View v_weekday_sales not ready:", error.message);
          return [];
        }
        return data || [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    refetchInterval: 60_000,
  });
}
