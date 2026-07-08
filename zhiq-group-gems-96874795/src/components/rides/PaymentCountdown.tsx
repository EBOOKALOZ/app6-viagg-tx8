// ── PaymentCountdown ─────────────────────────────────────────────────────────
// Contador de 3 min pós-aceite. Igual para motoboy / moto-táxi / carro.
//
// Fonte da verdade = service_orders (driver_status / payment_status /
// payment_deadline), sincronizada via Supabase Realtime. O contador é só
// visual; quem decide é o banco:
//   • payment_status='paid'  → ✅ confirmado, libera o profissional
//   • driver_status='payment_timeout' (ou prazo vencido) → expirou
//   • driver_status='cancelled' → cancelado
//
// Uso:
//   <PaymentCountdown orderId={id} role="professional" category="motoboy"
//       onStartNavigation={...} onTimeout={...} onCancelled={...} />
//   <PaymentCountdown orderId={id} role="client" />

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";

type Role = "professional" | "client";
type Category = "motoboy" | "mototaxi" | "driver";

interface RideState {
  driver_status: string | null;
  payment_status: string | null;
  payment_deadline: string | null;
}

interface PaymentCountdownProps {
  orderId: string;
  role: Role;
  category?: Category;
  /** Tabela da corrida: 'service_orders' (motoboy/moto-táxi) ou
   *  'motorista_corridas' (carro). Default service_orders. */
  table?: string;
  /** Profissional: liberar navegação após confirmação. */
  onStartNavigation?: () => void;
  onPaid?: () => void;
  onTimeout?: () => void;
  onCancelled?: () => void;
  className?: string;
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PaymentCountdown({
  orderId, role, category = "motoboy", table = "service_orders",
  onStartNavigation, onPaid, onTimeout, onCancelled, className = "",
}: PaymentCountdownProps) {
  const [state, setState] = useState<RideState | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const firedRef = useRef<string | null>(null);

  // Estado derivado
  const paid = state?.payment_status === "paid"
    || ["driver_on_the_way", "arrived", "in_progress", "completed"].includes(state?.driver_status ?? "");
  const cancelled = state?.driver_status === "cancelled";
  const serverTimeout = state?.driver_status === "payment_timeout";
  const localExpired = remaining === 0 && !paid && !cancelled;
  const timedOut = serverTimeout || localExpired;
  const waiting = !paid && !cancelled && !timedOut;

  // Carrega estado inicial
  useEffect(() => {
    let alive = true;
    supabase
      .from(table)
      .select("driver_status,payment_status,payment_deadline")
      .eq("id", orderId)
      .single()
      .then(({ data }) => { if (alive && data) setState(data as RideState); });
    return () => { alive = false; };
  }, [orderId, table]);

  // Realtime: qualquer UPDATE na linha atualiza o estado (aceite/pagamento/timeout)
  useEffect(() => {
    const channel = supabase
      .channel(`ride-countdown-${table}-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: `id=eq.${orderId}` },
        (payload) => setState(payload.new as RideState),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, table]);

  // Tick do contador (só enquanto aguardando)
  useEffect(() => {
    if (!state?.payment_deadline || paid || cancelled || serverTimeout) return;
    const deadline = new Date(state.payment_deadline).getTime();
    const tick = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [state?.payment_deadline, paid, cancelled, serverTimeout]);

  // Dispara callbacks de transição uma única vez
  useEffect(() => {
    const key = paid ? "paid" : cancelled ? "cancelled" : timedOut ? "timeout" : "waiting";
    if (firedRef.current === key || key === "waiting") return;
    firedRef.current = key;
    if (key === "paid") onPaid?.();
    else if (key === "cancelled") onCancelled?.();
    else if (key === "timeout") onTimeout?.();
  }, [paid, cancelled, timedOut, onPaid, onCancelled, onTimeout]);

  const startLabel = useMemo(
    () => (category === "motoboy" ? "Seguir para a coleta" : "Iniciar Navegação"),
    [category],
  );

  const handleStart = useCallback(() => onStartNavigation?.(), [onStartNavigation]);

  // ── PAGO ────────────────────────────────────────────────────────────────
  if (paid) {
    return (
      <div className={`rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 p-5 text-center ${className}`}>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 animate-[pulse_1.2s_ease-in-out_infinite]">
          <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
        </div>
        <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">Pagamento confirmado!</p>
        {role === "professional" ? (
          <>
            <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">
              O pagamento foi confirmado. Você já pode seguir para o local do usuário.
            </p>
            {onStartNavigation && (
              <button
                onClick={handleStart}
                className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-95"
              >
                {startLabel}
              </button>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-300/80">
            Pagamento realizado com sucesso. Seu profissional já foi avisado e está a caminho.
          </p>
        )}
      </div>
    );
  }

  // ── CANCELADO ───────────────────────────────────────────────────────────
  if (cancelled) {
    return (
      <div className={`rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-5 text-center ${className}`}>
        <XCircle className="mx-auto mb-2 h-9 w-9 text-zinc-500" />
        <p className="text-base font-bold text-zinc-700 dark:text-zinc-300">
          {role === "professional" ? "O usuário cancelou a solicitação." : "Corrida cancelada."}
        </p>
      </div>
    );
  }

  // ── EXPIRADO ────────────────────────────────────────────────────────────
  if (timedOut) {
    return (
      <div className={`rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 p-5 text-center ${className}`}>
        <Clock className="mx-auto mb-2 h-9 w-9 text-amber-600 dark:text-amber-400" />
        <p className="text-base font-bold text-amber-700 dark:text-amber-300">
          {role === "professional" ? "O tempo para pagamento expirou." : "O tempo para realizar o pagamento expirou."}
        </p>
        <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-300/80">
          {role === "professional"
            ? "Você já está liberado para novas solicitações."
            : "Solicite uma nova corrida."}
        </p>
      </div>
    );
  }

  // ── AGUARDANDO PAGAMENTO (contador) ───────────────────────────────────────
  return (
    <div className={`rounded-2xl border border-orange-500/30 bg-orange-50 dark:bg-orange-950/40 p-5 text-center ${className}`}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/15">
        <Loader2 className="h-6 w-6 animate-spin text-orange-600 dark:text-orange-400" />
      </div>
      {role === "professional" ? (
        <>
          <p className="text-base font-bold text-orange-800 dark:text-orange-200">Solicitação aceita com sucesso.</p>
          <p className="mt-1 text-sm text-orange-700/80 dark:text-orange-300/80">
            O usuário está preparando o pagamento. Aguarde a confirmação.
          </p>
        </>
      ) : (
        <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
          Finalize o pagamento para o profissional seguir até você.
        </p>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600/70 dark:text-orange-400/70">
          Tempo restante
        </p>
        <p className="font-mono text-4xl font-black tabular-nums text-orange-700 dark:text-orange-300">
          {remaining == null ? "03:00" : fmt(remaining)}
        </p>
      </div>

      {role === "professional" && (
        <p className="mt-3 text-xs font-medium text-orange-700/70 dark:text-orange-300/70">
          Aguardando confirmação do pagamento.
        </p>
      )}
    </div>
  );
}

export default PaymentCountdown;
