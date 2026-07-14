/**
 * driverRoutes — rotas do motorista, freteiro e passageiro.
 */
import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const DriverOperatorPromo = lazy(() =>
  import("@/pages/operator/OperatorPromotionPage").then(m => ({
    default: (props: object) => m.default({ ...props, profileType: "driver" } as any),
  }))
);
const RIDVCampanhasPage  = lazy(() => import("@/pages/ridv/RIDVCampanhasPage"));
const RIDVResultadosPage = lazy(() => import("@/pages/ridv/RIDVResultadosPage"));
const RIDVImpactoPage    = lazy(() => import("@/pages/ridv/RIDVImpactoPage"));
const RIDVAssistantPage  = lazy(() => import("@/pages/ridv/RIDVAssistantPage"));
const ImpulsionarCampaignManager     = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarCampaignManager })));
const ImpulsionarAnalytics          = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarAnalytics })));
const ImpulsionarCreditsManager      = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarCreditsManager })));
const ImpulsionarNotificationsCenter = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarNotificationsCenter })));
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
  MeuVeiculo,
  ProfessionalWizard,
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
      <Route path="/driver/profile" element={<ProfessionalWizard />} />
      <Route path="/driver/profile-classic" element={<VehicleProfileContent />} />
      <Route path="/driver/meu-veiculo" element={<MeuVeiculo />} />
      <Route path="/driver/campanhas" element={<MotoboyCampaignInbox />} />
      <Route path="/driver/wallet" element={<Wallet />} />
      <Route path="/driver/comissao" element={<DriverComissao />} />
      <Route path="/driver/finance" element={<DriverComissao />} />

      {/* ── Hub Impulsionar driver (abas aninhadas) ── */}
      <Route path="/driver/impulsionar" element={<PostadorHub />}>
        <Route index element={<PostadorDashboard />} />
        <Route path="divulgacoes"  element={<PostadorPremiumPanel />} />
        <Route path="promover"   element={<DriverOperatorPromo />} />
        <Route path="grupos"     element={<MotoboyGroupsContent />} />
        <Route path="carteira"   element={<MotoboyWalletContent />} />
        <Route path="historico"  element={<MotoboyHistoryContent />} />
        <Route path="comissao"   element={<DriverComissao />} />
        {/* RIDV tabs */}
        <Route path="campanhas"  element={<RIDVCampanhasPage />} />
        <Route path="resultados" element={<RIDVResultadosPage />} />
        <Route path="impacto"    element={<RIDVImpactoPage />} />
        <Route path="ia-ridv"    element={<RIDVAssistantPage />} />
        {/* Enterprise tabs */}
        <Route path="gerenciador"  element={<ImpulsionarCampaignManager />} />
        <Route path="analytics"    element={<ImpulsionarAnalytics />} />
        <Route path="creditos"     element={<ImpulsionarCreditsManager />} />
        <Route path="notificacoes" element={<ImpulsionarNotificationsCenter />} />
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
