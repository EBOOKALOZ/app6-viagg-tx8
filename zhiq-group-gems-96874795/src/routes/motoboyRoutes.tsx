/**
 * motoboyRoutes — rotas do painel motoboy e mototáxi.
 */
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  MotoboyLayout,
  MotoboyPanelContent,
  MotoboyRidesContent,
  MotoboyHistoryContent,
  MotoboyHistoricoContent,
  MotoboyFinanceContent,
  MotoboyGroupsContent,
  MotoboyExpansaoContent,
  MotoboyProfileContent,
  MotoboyDashboardPremium,
  MotoboyCentralGrupos,
  DeliveryCalls,
  MotoboyGruposRegras,
  Wallet,
  MotoboyPayPremium,
  MotoboyArchivedRidesContent,
  MotoboyCorridasEmEspera,
  MotoboyLGPDPage,
  MotoboyCampaignInbox,
  PostadorPremiumPanel,
  MotoboyRides,
  MotoboyOfferPreview,
  LegalPage,
  MotoboyAwaitingRide,
  MototaxiHistory,
} from "./lazyPages";

export const motoboyRoutes = (
  <>
    {/* ── Painel principal motoboy ── */}
    <Route element={<ProtectedRoute requiredProfile="motoboy"><MotoboyLayout /></ProtectedRoute>}>
      <Route path="/motoboy" element={<MotoboyPanelContent />} />
      <Route path="/motoboy/rides" element={<MotoboyRidesContent />} />
      <Route path="/motoboy/history" element={<MotoboyHistoryContent />} />
      <Route path="/motoboy/historico" element={<MotoboyHistoricoContent />} />
      <Route path="/motoboy/finance" element={<MotoboyFinanceContent />} />
      <Route path="/motoboy/groups" element={<MotoboyGroupsContent />} />
      <Route path="/motoboy/grupos" element={<MotoboyGroupsContent />} />
      <Route path="/motoboy/expansao" element={<MotoboyExpansaoContent />} />
      <Route path="/motoboy/profile" element={<MotoboyProfileContent />} />
      <Route path="/motoboy/premium" element={<MotoboyDashboardPremium />} />
      <Route path="/motoboy/central-grupos" element={<MotoboyCentralGrupos />} />
      <Route path="/motoboy/delivery-calls" element={<DeliveryCalls />} />
      <Route path="/motoboy/grupos-regras" element={<MotoboyGruposRegras />} />
      <Route path="/motoboy/wallet" element={<Wallet />} />
      <Route path="/motoboy/pay" element={<MotoboyPayPremium />} />
      <Route path="/motoboy/archived" element={<MotoboyArchivedRidesContent />} />
      <Route path="/motoboy/corridas" element={<MotoboyCorridasEmEspera />} />
      <Route path="/motoboy/lgpd" element={<MotoboyLGPDPage />} />
      <Route path="/motoboy/campanhas" element={<MotoboyCampaignInbox />} />
      <Route path="/motoboy/postador" element={<PostadorPremiumPanel />} />
    </Route>

    {/* Motoboy Awaiting — standalone, sem shell de layout */}
    <Route
      path="/motoboy/awaiting"
      element={<ProtectedRoute requiredProfile="motoboy"><MotoboyAwaitingRide /></ProtectedRoute>}
    />

    {/* Rotas adicionais motoboy */}
    <Route element={<ProtectedRoute requiredProfile="motoboy"><MotoboyLayout /></ProtectedRoute>}>
      <Route path="/motoboy/rides" element={<MotoboyRides />} />
      <Route path="/motoboy/offer-preview" element={<MotoboyOfferPreview />} />
      <Route path="/motoboy/legal/:type" element={<LegalPage />} />
    </Route>

    {/* ── Mototáxi ── */}
    <Route element={<ProtectedRoute requiredProfile="mototaxi"><MotoboyLayout /></ProtectedRoute>}>
      <Route path="/mototaxi" element={<MotoboyRidesContent />} />
      <Route path="/mototaxi/history" element={<MototaxiHistory />} />
      <Route path="/mototaxi/wallet" element={<Wallet />} />
      <Route path="/mototaxi/profile" element={<MotoboyProfileContent />} />
      <Route path="/mototaxi/groups" element={<MotoboyGroupsContent />} />
      <Route path="/mototaxi/grupos" element={<MotoboyGroupsContent />} />
    </Route>
  </>
);
