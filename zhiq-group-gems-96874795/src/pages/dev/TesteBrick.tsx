/**
 * TesteBrick — rota de diagnóstico do Payment Brick (SEM auth, SEM dialog).
 * Renderiza APENAS o nosso MercadoPagoBrickCheckout, para bissecar onde o
 * formulário trava: se aqui carrega e no diálogo não, o problema é o
 * contexto (Radix Dialog/overlay); se aqui também trava, é o componente.
 * Página de teste técnico — sem link em lugar nenhum do app.
 */
import { useEffect, useState } from "react";
import { MercadoPagoBrickCheckout } from "@/components/payments/MercadoPagoBrickCheckout";
import { mercadoPagoPublicKey } from "@/lib/payments/checkoutConfig";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TravelerWalletTopup } from "@/components/wallet/TravelerWalletTopup";
import { supabase } from "@/integrations/supabase/client";

export default function TesteBrick() {
  const pk = mercadoPagoPublicKey();
  // ?dialog=1 → reproduz o contexto do Radix Dialog da recarga
  // ?topup=1  → o componente REAL TravelerWalletTopup (login anônimo automático)
  const inDialog = new URLSearchParams(window.location.search).has("dialog");
  const inTopup = new URLSearchParams(window.location.search).has("topup");
  const [open, setOpen] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!inTopup) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) await supabase.auth.signInAnonymously();
      setAuthed(true);
    });
  }, [inTopup]);

  if (inTopup) {
    return (
      <div style={{ maxWidth: 480, margin: "24px auto", padding: 16 }}>
        <p data-testid="auth">{authed ? "sessão ok" : "autenticando…"}</p>
        {authed && <TravelerWalletTopup label="Adicionar saldo (teste)" />}
      </div>
    );
  }

  const brick = pk ? (
    <div style={{ background: "#fff", borderRadius: 10, padding: 8 }}>
      <MercadoPagoBrickCheckout
        publicKey={pk}
        amount={35}
        onSubmit={async (fd) => {
          console.log("teste onSubmit", fd);
        }}
      />
    </div>
  ) : (
    <p>Sem VITE_MERCADOPAGO_PUBLIC_KEY.</p>
  );

  if (inDialog) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-br from-[#FFE600] to-[#FFC400]">
          <DialogHeader>
            <DialogTitle>🧪 Brick dentro do Dialog (como na recarga)</DialogTitle>
          </DialogHeader>
          {brick}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "24px auto", padding: 16, background: "#FFE600", borderRadius: 12 }}>
      <h1 style={{ fontSize: 15, fontWeight: 800 }}>🧪 Teste do componente MercadoPagoBrickCheckout</h1>
      <p style={{ fontSize: 12 }} data-testid="pk">
        public key: {pk ? pk.slice(0, 14) + "…" : "AUSENTE"}
      </p>
      {brick}
    </div>
  );
}
