/**
 * mercadopagoSdk — carrega o SDK v2 do Mercado Pago (https://sdk.mercadopago.com/js/v2)
 * uma única vez e devolve o construtor global `MercadoPago`.
 *
 * Usado pelos Bricks (checkout embutido e responsivo do MP), que renderizam o
 * formulário de cartão dentro do nosso próprio container — ideal para mobile.
 */

const SDK_SRC = "https://sdk.mercadopago.com/js/v2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MpConstructor = any;

let sdkPromise: Promise<MpConstructor> | null = null;

export function loadMercadoPagoSdk(): Promise<MpConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SDK do Mercado Pago indisponível fora do browser."));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.MercadoPago) return Promise.resolve(w.MercadoPago);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<MpConstructor>((resolve, reject) => {
    const finish = () =>
      w.MercadoPago
        ? resolve(w.MercadoPago)
        : reject(new Error("SDK do Mercado Pago carregou, mas `MercadoPago` não está definido."));

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar o SDK do Mercado Pago.")));
      if (w.MercadoPago) finish();
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error("Falha ao carregar o SDK do Mercado Pago."));
    document.head.appendChild(script);
  });

  return sdkPromise;
}
