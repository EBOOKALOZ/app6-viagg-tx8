/**
 * CheckoutReturnPage — /checkout/retorno
 *
 * Tela para onde o Mercado Pago devolve o cliente após o pagamento (back_url +
 * auto_return). Confirma o pagamento chamando a edge function payments-reconcile
 * (consulta o status real no MP e credita via a MESMA RPC do webhook), sem
 * depender do webhook — que em sandbox costuma não disparar.
 *
 * order_id e returnTo vêm do localStorage (guardados por openCheckoutUrl antes do
 * redirect). O payment_id vem da URL de retorno do MP e é o caminho mais
 * confiável p/ a reconcile achar o pagamento (a busca por preference falha no
 * sandbox).
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPendingOrderId,
  getPendingReturnTo,
  clearPendingOrderId,
} from "@/lib/payments/openCheckout";

type Status = "checking" | "paid" | "pending" | "notfound";

export default function CheckoutReturnPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const returnTo = getPendingReturnTo() || "/anunciante/creditos";

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(location.search);
    const paymentId = params.get("payment_id") || params.get("collection_id") || undefined;

    async function resolveOrderId(): Promise<string | null> {
      const stored = getPendingOrderId();
      if (stored) return stored;
      // fallback: tenta achar pela preference/payment do MP (se RLS permitir).
      const ids = [
        params.get("preference_id"),
        params.get("preference-id"),
        params.get("payment_id"),
        params.get("collection_id"),
      ].filter(Boolean) as string[];
      for (const pid of ids) {
        const { data } = await (supabase.from("pay_payment_orders") as any)
          .select("id")
          .eq("provider_payment_id", pid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.id) return data.id as string;
      }
      return null;
    }

    (async () => {
      const orderId = await resolveOrderId();
      if (!orderId) {
        if (!cancelled) setStatus("notfound");
        return;
      }

      // Tenta reconciliar algumas vezes — o MP pode levar uns segundos.
      for (let i = 0; i < 5 && !cancelled; i++) {
        try {
          const { data, error } = await supabase.functions.invoke("payments-reconcile", {
            body: { order_id: orderId, payment_id: paymentId },
          });
          if (!error && (data as { status?: string })?.status === "paid") {
            if (!cancelled) {
              clearPendingOrderId();
              setStatus("paid");
            }
            return;
          }
        } catch {
          /* tenta de novo */
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (!cancelled) setStatus("pending");
    })();

    return () => { cancelled = true; };
  }, [location.search]);

  // Aprovado → leva pro destino certo (créditos/carteira) depois de avisar.
  useEffect(() => {
    if (status !== "paid") return;
    const t = setTimeout(() => navigate(returnTo), 2200);
    return () => clearTimeout(t);
  }, [status, returnTo, navigate]);

  const ui = {
    checking: {
      icon: <Loader2 className="w-14 h-14 text-orange-500 animate-spin" />,
      title: "Confirmando seu pagamento...",
      text: "Só um instante enquanto verificamos com o Mercado Pago.",
    },
    paid: {
      icon: <CheckCircle2 className="w-14 h-14 text-emerald-500" />,
      title: "Pagamento aprovado! 🎉",
      text: "Seus créditos já foram liberados. Levando você para o painel...",
    },
    pending: {
      icon: <Clock className="w-14 h-14 text-amber-500" />,
      title: "Pagamento em processamento",
      text: "Recebemos seu retorno, mas o Mercado Pago ainda está confirmando. Seus créditos aparecem assim que for aprovado — pode levar alguns minutos.",
    },
    notfound: {
      icon: <AlertCircle className="w-14 h-14 text-zinc-400" />,
      title: "Não encontramos o pedido",
      text: "Se você concluiu o pagamento, ele será confirmado em instantes. Confira no painel.",
    },
  }[status];

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-zinc-100 p-8 text-center">
        <div className="flex justify-center mb-5">{ui.icon}</div>
        <h1 className="text-xl font-black text-zinc-900 mb-2">{ui.title}</h1>
        <p className="text-sm text-zinc-500 leading-relaxed mb-7">{ui.text}</p>
        <div className="space-y-2">
          <Link
            to={returnTo}
            className="block w-full py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm transition-all"
          >
            Continuar para o painel
          </Link>
          <Link
            to="/mercado"
            className="block w-full py-3 text-zinc-400 hover:text-zinc-600 font-medium text-sm transition-all"
          >
            Voltar ao mercado
          </Link>
        </div>
      </div>
    </div>
  );
}
