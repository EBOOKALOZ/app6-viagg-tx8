import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subDays } from "date-fns";

export function useAdminFinancialStats() {
    return useQuery({
        queryKey: ["admin", "financial-stats"],
        queryFn: async () => {
            // Fonte da verdade = RPC admin_get_global_finances (pay_*).
            // A leitura legada em ledger_entries permanece como fallback abaixo.
            try {
                const { data: rpc } = await (supabase.rpc as any)("admin_get_global_finances");
                if (rpc?.stats) {
                    const s = rpc.stats;
                    return {
                        saldoPlataforma: Number(s.saldoPlataforma || 0),
                        transacionadoHoje: Number(s.transacionadoHoje || 0),
                        receitaPlataforma: Number(s.receitaPlataforma || 0),
                        saldoMotoboys: Number(s.saldoMotoboys || 0),
                        saldoLojistas: Number(s.saldoLojistas || 0),
                        saquesPendentesQtd: Number(s.saquesPendentesQtd || 0),
                        saquesPendentesValor: Number(s.saquesPendentesValor || 0),
                    };
                }
            } catch (e) {
                console.warn("[useAdminFinancialStats] RPC indisponível, caindo no legado", e);
            }

            // 1. & 4. & 5. Contas Financeiras (Agregado via ledger_entries)
            // @ts-ignore: bypass outdated types.ts missing direction and profile_type
            const { data: rawLedgers } = await (supabase.from("ledger_entries") as any)
                .select("amount_cents, direction, profile_type, source_type");

            let saldoPlataforma = 0;
            let saldoMotoboys = 0;
            let saldoLojistas = 0;

            rawLedgers?.forEach((entry: any) => {
                const isCredit = entry.direction === 'credit';
                const val = (Number(entry.amount_cents || 0) / 100) * (isCredit ? 1 : -1);

                if (!entry.profile_type || entry.profile_type === 'platform') {
                    saldoPlataforma += val;
                } else if (entry.profile_type === 'merchant' || entry.profile_type === 'lojista') {
                    saldoLojistas += val;
                } else if (entry.profile_type === 'motoboy' || entry.profile_type === 'driver') {
                    saldoMotoboys += val;
                }
            });

            // 2. Total Transacionado Hoje (ledger_entries where created_at = hoje)
            const todayStart = startOfDay(new Date()).toISOString();
            const todayEnd = endOfDay(new Date()).toISOString();

            const { data: todayLedgers } = await supabase
                .from("ledger_entries")
                .select("amount_cents")
                .gte("created_at", todayStart)
                .lte("created_at", todayEnd);

            const transacionadoHoje =
                (todayLedgers?.reduce((acc, curr) => acc + Number(curr.amount_cents || 0), 0) || 0) / 100;

            // 3. Receita da Plataforma (source_type = 'platform_fee')
            const { data: revenueData } = await supabase
                .from("ledger_entries")
                .select("amount_cents")
                .eq("source_type", "platform_fee");

            const receitaPlataforma =
                (revenueData?.reduce((acc, curr) => acc + Number(curr.amount_cents || 0), 0) || 0) / 100;

            // 6. Saques Pendentes
            const { data: pendingPayouts } = await supabase
                .from("payout_requests")
                .select("amount_cents")
                .eq("status", "pending");

            const saquesPendentesQtd = pendingPayouts?.length || 0;
            const saquesPendentesValor =
                (pendingPayouts?.reduce((acc, curr) => acc + Number(curr.amount_cents || 0), 0) || 0) / 100;

            // If platform account doesn't directly hold balance, fallback to sum of fees
            if (saldoPlataforma === 0 && receitaPlataforma > 0) {
                saldoPlataforma = receitaPlataforma;
            }

            return {
                saldoPlataforma,
                transacionadoHoje,
                receitaPlataforma,
                saldoMotoboys,
                saldoLojistas,
                saquesPendentesQtd,
                saquesPendentesValor
            };
        }
    });
}
