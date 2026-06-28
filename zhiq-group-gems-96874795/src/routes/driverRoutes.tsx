/**
 * driverRoutes — rotas do motorista, freteiro e passageiro.
 */
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DriverLayout } from "@/components/driver/DriverLayout";
import {
  AppLayout,
  DriverPanel,
  DriverCalls,
  DriverComissao,
  MotoboyGroupsContent,
  MotoboyHistoryContent,
  MotoboyWalletContent,
  VehicleProfileContent,
  MotoboyCampaignInbox,
  PostadorPremiumPanel,
  PostadorHub,
  PostadorDashboard,
  Wallet,
  FreteiroPanel,
  PassengerPanel,
  PassengerHistory,
} from "./lazyPages";

export const driverRoutes = (
  <>
    {/* ── Painel do Motorista ── */}
    <Route element={<ProtectedRoute requiredProfile="driver"><DriverLayout /></ProtectedRoute>}>
      <Route path="/driver" element={<DriverPanel />} />
      <Route path="/driver/calls" element={<DriverCalls />} />
      <Route path="/driver/groups" element={<MotoboyGroupsContent />} />
      <Route path="/driver/grupos" element={<MotoboyGroupsContent />} />
      <Route path="/driver/history" element={<MotoboyHistoryContent />} />
      <Route path="/driver/profile" element={<VehicleProfileContent />} />
      <Route path="/driver/campanhas" element={<MotoboyCampaignInbox />} />
      <Route path="/driver/wallet" element={<Wallet />} />
      <Route path="/driver/comissao" element={<DriverComissao />} />

      {/* ── Hub Postador driver (abas aninhadas) ── */}
      <Route path="/driver/postador" element={<PostadorHub />}>
        <Route index element={<PostadorDashboard />} />
        <Route path="postagens"  element={<PostadorPremiumPanel />} />
        <Route path="grupos"     element={<MotoboyGroupsContent />} />
        <Route path="carteira"   element={<MotoboyWalletContent />} />
        <Route path="historico"  element={<MotoboyHistoryContent />} />
        <Route path="comissao"   element={<DriverComissao />} />
        <Route path="campanhas"  element={<MotoboyCampaignInbox />} />
      </Route>
    </Route>

    {/* Freteiro */}
    <Route element={<ProtectedRoute requiredProfile="freteiro"><AppLayout /></ProtectedRoute>}>
      <Route path="/freteiro" element={<FreteiroPanel />} />
    </Route>

    {/* Passageiro */}
    <Route element={<ProtectedRoute requiredProfile="passenger"><AppLayout /></ProtectedRoute>}>
      <Route path="/passenger" element={<PassengerPanel />} />
      <Route path="/passenger/history" element={<PassengerHistory />} />
    </Route>
  </>
);
