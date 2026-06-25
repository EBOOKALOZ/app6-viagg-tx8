import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay } from "date-fns";

/** Comissão padrão da plataforma sobre entregas (motoboy fica com o restante). */
const DELIVERY_COMMISSION_RATE = 0.25;

export interface AdminFinancialStats {
    saldoPlataforma: number;
    transacionadoHoje: number;
    receitaPlataforma: number;
    saldoMotoboys: number;
    saldoLojistas: number;
    saquesPendentesQtd: number;
    saquesPendentesValor: number;
    /** Quantidade de lojas cadastradas (subtítulo do card Total Lojistas). */
    totalLojas: number;
    /** Saldo disponível dos lojistas para chamar motoboy (recargas − gasto em entregas). */
    saldoChamarMotoboy: number;
    /** Total pago em pacotes de créditos + recargas (compras confirmadas). */
    creditosAdquiridos: number;
    /** Entrada de compras de pacotes de LOJISTAS/anunciante (credit_package + advertiser_credits). */
    pacotesLojistas: number;
    /** Qtd de compras de pacotes de lojistas/marketplace. */
    pacotesLojistasQtd: number;
    /** Entrada de compras de pacotes de IMÓVEIS (real_estate_credits). */
    pacotesImoveis: number;
    /** Qtd de compras de pacotes de imóveis. */
    pacotesImoveisQtd: number;
    /** Entrada de compras de pacotes de VEÍCULOS (vehicle_credits). */
    pacotesVeiculos: number;
    /** Qtd de compras de pacotes de veículos. */
    pacotesVeiculosQtd: number;
    /** Entrada de compras de pacotes de SERVIÇOS (service_credits). */
    pacotesServicos: number;
    /** Qtd de compras de pacotes de serviços. */
    pacotesServicosQtd: number;
    /** Entrada de compras de pacotes de FRETES (freight_credits). */
    pacotesFretes: number;
    /** Qtd de compras de pacotes de fretes. */
    pacotesFretesQtd: number;
    /** Entrada de compras de pacotes de VIAGENS (travel_credits). */
    pacotesViagens: number;
    /** Qtd de compras de pacotes de viagens. */
    pacotesViagensQtd: number;
}

export function useAdminFinancialStats() {
    return useQuery<AdminFinancialStats>({
        queryKey: ["admin", "financial-stats"],
        queryFn: async () => {
            const sum = (arr: any[], f: (x: any) => any) =>
                (arr || []).reduce((s, x) => s + Number(f(x) || 0), 0);

            const todayStart = startOfDay(new Date());
            const isToday = (d: string | null | undefined) => !!d && new Date(d) >= todayStart;

            // Contagem de lojas (subtítulo do card Total Lojistas).
            const { count: lojasCount } = await (supabase
                .from("merchant_stores") as any)
                .select("id", { count: "exact", head: true });
            const totalLojas = Number(lojasCount || 0);

            // ── 1. Compras de crédito / recargas de saldo PAGAS (pay_payment_orders) ──
            const { data: paidOrders } = await (supabase.from("pay_payment_orders") as any)
                .select("amount, product_type, paid_at, payer_owner_type, product_snapshot")
                .eq("status", "paid");
            const creditOrders = (paidOrders || []).filter(
                (o: any) => o.product_type === "credit_package" || o.product_type === "advertiser_credits"
            );
            const creditRevenue = sum(creditOrders, (o) => o.amount);
            const creditHoje = sum(creditOrders.filter((o: any) => isToday(o.paid_at)), (o) => o.amount);
            const saldoLojistas = creditRevenue;

            // ── Separação por segmento (cards dedicados no painel) ──
            // Lojistas/anunciante = credit_package + advertiser_credits (mesmo conjunto acima).
            const pacotesLojistas = creditRevenue;
            const pacotesLojistasQtd = creditOrders.length;
            // Imóveis = compras de pacotes imobiliários (product_type 'real_estate_credits').
            const imovelOrders = (paidOrders || []).filter(
                (o: any) => o.product_type === "real_estate_credits"
            );
            const pacotesImoveis = sum(imovelOrders, (o) => o.amount);
            const pacotesImoveisQtd = imovelOrders.length;
            // Veículos = compras de pacotes de veículos (product_type 'vehicle_credits').
            const veiculoOrders = (paidOrders || []).filter(
                (o: any) => o.product_type === "vehicle_credits"
            );
            const pacotesVeiculos = sum(veiculoOrders, (o) => o.amount);
            const pacotesVeiculosQtd = veiculoOrders.length;
            // Serviços = compras de pacotes de serviços (product_type 'service_credits').
            const servicoOrders = (paidOrders || []).filter(
                (o: any) => o.product_type === "service_credits"
            );
            const pacotesServicos = sum(servicoOrders, (o) => o.amount);
            const pacotesServicosQtd = servicoOrders.length;
            // Fretes = compras de pacotes de fretes (product_type 'freight_credits').
            const freteOrders = (paidOrders || []).filter(
                (o: any) => o.product_type === "freight_credits"
            );
            const pacotesFretes = sum(freteOrders, (o) => o.amount);
            const pacotesFretesQtd = freteOrders.length;
            // Viagens = compras de pacotes de viagens (product_type 'travel_credits').
            const viagemOrders = (paidOrders || []).filter(
                (o: any) => o.product_type === "travel_credits"
            );
            const pacotesViagens = sum(viagemOrders, (o) => o.amount);
            const pacotesViagensQtd = viagemOrders.length;

            // Recargas de saldo: o dinheiro carregado especificamente p/ chamar motoboy.
            const recargasSaldo = sum(
                creditOrders.filter((o: any) =>
                    o.product_type === "credit_package" &&
                    /recarga/i.test(String(o.product_snapshot?.package_name || ""))
                ),
                (o) => o.amount
            );

            // ── 2. Entregas concluídas (comissão, ganho do motoboy, gasto total) ──
            const { data: orders } = await (supabase.from("service_orders") as any)
                .select("status, total_price, completed_at, created_at");
            const delivered = (orders || []).filter(
                (o: any) => String(o.status || "").toLowerCase() === "delivered"
            );
            const deliveredGMV = sum(delivered, (o) => o.total_price);
            const deliveredHojeGMV = sum(
                delivered.filter((o: any) => isToday(o.completed_at || o.created_at)),
                (o) => o.total_price
            );

            // Comissão: usa o split real (payment_splits) se houver; senão estima pela taxa.
            let deliveryCommission = deliveredGMV * DELIVERY_COMMISSION_RATE;
            let motoboyEarnings = deliveredGMV - deliveryCommission;
            let deliveryHoje = deliveredHojeGMV;
            try {
                const { data: splits } = await (supabase.from("payment_splits") as any)
                    .select("professional_amount_cents, platform_fee_cents, created_at");
                if (splits && splits.length > 0) {
                    deliveryCommission = sum(splits, (s) => s.platform_fee_cents) / 100;
                    motoboyEarnings = sum(splits, (s) => s.professional_amount_cents) / 100;
                    deliveryHoje = sum(
                        splits.filter((s: any) => isToday(s.created_at)),
                        (s) => Number(s.platform_fee_cents || 0) + Number(s.professional_amount_cents || 0)
                    ) / 100;
                }
            } catch { /* tabela pode não existir */ }

            // Saldo disponível p/ chamar motoboy = recargas carregadas − gasto em entregas.
            const saldoChamarMotoboy = Math.max(0, recargasSaldo - deliveredGMV);

            // ── 3. Saques pendentes ──
            let saquesPendentesQtd = 0;
            let saquesPendentesValor = 0;
            try {
                const { data: pendingPayouts } = await (supabase.from("payout_requests") as any)
                    .select("amount_cents").eq("status", "pending");
                saquesPendentesQtd = pendingPayouts?.length || 0;
                saquesPendentesValor = sum(pendingPayouts, (p) => p.amount_cents) / 100;
            } catch { /* noop */ }

            // ── RPC preferencial (sobrescreve os agregados se trouxer valor) ──
            try {
                const { data: rpc } = await (supabase.rpc as any)("admin_get_global_finances");
                if (rpc?.stats) {
                    const s = rpc.stats;
                    const total =
                        Number(s.saldoPlataforma || 0) + Number(s.receitaPlataforma || 0) +
                        Number(s.saldoLojistas || 0) + Number(s.transacionadoHoje || 0);
                    if (total > 0) {
                        return {
                            saldoPlataforma: Number(s.saldoPlataforma || 0),
                            transacionadoHoje: Number(s.transacionadoHoje || 0),
                            receitaPlataforma: Number(s.receitaPlataforma || 0),
                            saldoMotoboys: Number(s.saldoMotoboys || 0),
                            saldoLojistas: Number(s.saldoLojistas || 0),
                            saquesPendentesQtd: Number(s.saquesPendentesQtd || 0),
                            saquesPendentesValor: Number(s.saquesPendentesValor || 0),
                            totalLojas,
                            saldoChamarMotoboy,
                            creditosAdquiridos: creditRevenue,
                            pacotesLojistas,
                            pacotesLojistasQtd,
                            pacotesImoveis,
                            pacotesImoveisQtd,
                            pacotesVeiculos,
                            pacotesVeiculosQtd,
                            pacotesServicos,
                            pacotesServicosQtd,
                            pacotesFretes,
                            pacotesFretesQtd,
                            pacotesViagens,
                            pacotesViagensQtd,
                        };
                    }
                }
            } catch (e) {
                console.warn("[useAdminFinancialStats] RPC indisponível, usando agregados", e);
            }

            const receitaPlataforma = creditRevenue + deliveryCommission;

            return {
                saldoPlataforma: receitaPlataforma,
                transacionadoHoje: creditHoje + deliveryHoje,
                receitaPlataforma,
                saldoMotoboys: motoboyEarnings,
                saldoLojistas,
                saquesPendentesQtd,
                saquesPendentesValor,
                totalLojas,
                saldoChamarMotoboy,
                creditosAdquiridos: creditRevenue,
                pacotesLojistas,
                pacotesLojistasQtd,
                pacotesImoveis,
                pacotesImoveisQtd,
                pacotesVeiculos,
                pacotesVeiculosQtd,
                pacotesServicos,
                pacotesServicosQtd,
                pacotesFretes,
                pacotesFretesQtd,
                pacotesViagens,
                pacotesViagensQtd,
            };
        },
    });
}
