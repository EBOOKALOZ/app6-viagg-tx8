/**
 * AdvertiserSupportPage — Página de suporte dentro do painel do anunciante.
 * Reutiliza o componente existente ClientSupportTicketsPage.
 */
import React, { Suspense } from "react";
import PageFallback from "@/components/PageFallback";

const ClientSupportTicketsPage = React.lazy(
  () => import("@/pages/support/ClientSupportTicketsPage")
);

export default function AdvertiserSupportPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <ClientSupportTicketsPage />
    </Suspense>
  );
}
