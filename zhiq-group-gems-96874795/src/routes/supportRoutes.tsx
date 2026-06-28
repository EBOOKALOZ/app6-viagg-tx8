/**
 * supportRoutes — rotas de suporte ao cliente (requer autenticação).
 *
 * /suporte e /motoboy/support são standalone (sem AppLayout) pois
 * ClientSupportTicketsPage gerencia seu próprio header e bottom nav.
 */
import { Suspense } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout, Support, ClientSupportTicketsPage, ClientTicketConversationPage } from "./lazyPages";
import PageFallback from "@/components/PageFallback";

export const supportRoutes = (
  <>
    {/* Formulário de novo chamado — usa AppLayout */}
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="/support"               element={<Support />} />
      <Route path="/suporte/novo"          element={<Support />} />
      <Route path="/motoboy/support/novo"  element={<Support />} />
    </Route>

    {/* Lista de tickets — standalone: já tem header e bottom nav próprios por perfil */}
    <Route
      path="/suporte"
      element={
        <ProtectedRoute>
          <Suspense fallback={<PageFallback />}>
            <ClientSupportTicketsPage />
          </Suspense>
        </ProtectedRoute>
      }
    />
    <Route
      path="/motoboy/support"
      element={
        <ProtectedRoute>
          <Suspense fallback={<PageFallback />}>
            <ClientSupportTicketsPage />
          </Suspense>
        </ProtectedRoute>
      }
    />

    {/* Conversa do ticket — standalone */}
    <Route
      path="/suporte/ticket/:id"
      element={
        <ProtectedRoute>
          <Suspense fallback={<PageFallback />}>
            <ClientTicketConversationPage />
          </Suspense>
        </ProtectedRoute>
      }
    />
    <Route
      path="/motoboy/support/ticket/:id"
      element={
        <ProtectedRoute>
          <Suspense fallback={<PageFallback />}>
            <ClientTicketConversationPage />
          </Suspense>
        </ProtectedRoute>
      }
    />
  </>
);
