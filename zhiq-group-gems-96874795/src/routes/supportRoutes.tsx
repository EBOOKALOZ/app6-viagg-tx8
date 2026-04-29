/**
 * supportRoutes — rotas de suporte ao cliente (requer autenticação).
 */
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout, Support, ClientSupportTicketsPage, ClientTicketConversationPage } from "./lazyPages";

export const supportRoutes = (
  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
    <Route path="/support" element={<Support />} />
    <Route path="/suporte/novo" element={<Support />} />
    <Route path="/motoboy/support/novo" element={<Support />} />
    <Route path="/suporte" element={<ClientSupportTicketsPage />} />
    <Route path="/motoboy/support" element={<ClientSupportTicketsPage />} />
    <Route path="/suporte/ticket/:id" element={<ClientTicketConversationPage />} />
    <Route path="/motoboy/support/ticket/:id" element={<ClientTicketConversationPage />} />
  </Route>
);
