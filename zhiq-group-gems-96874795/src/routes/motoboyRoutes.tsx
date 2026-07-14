/**
 * motoboyRoutes — rotas do painel motoboy e mototáxi.
 */
import { lazy } from "react";
import { Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const MotoboyOperatorPromo  = lazy(() => import("@/pages/operator/OperatorPromotionPage").then(m => ({ default: (props: any) => m.default({ ...props, profileType: "motoboy"   }) })));
const MototaxiOperatorPromo = lazy(() => import("@/pages/operator/OperatorPromotionPage").then(m => ({ default: (props: any) => m.default({ ...props, profileType: "mototaxi"  }) })));
const RIDVCampanhasPage  = lazy(() => import("@/pages/ridv/RIDVCampanhasPage"));
const RIDVResultadosPage = lazy(() => import("@/pages/ridv/RIDVResultadosPage"));
const RIDVImpactoPage    = lazy(() => import("@/pages/ridv/RIDVImpactoPage"));
const RIDVAssistantPage  = lazy(() => import("@/pages/ridv/RIDVAssistantPage"));
const ImpulsionarCampaignManager     = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarCampaignManager })));
const ImpulsionarAnalytics          = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarAnalytics })));
const ImpulsionarCreditsManager      = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarCreditsManager })));
const ImpulsionarNotificationsCenter = lazy(() => import("@/components/impulsionar").then(m => ({ default: m.ImpulsionarNotificationsCenter })));
import {
  MotoboyLayout,
  MototaxiLayout,
  MotoboyPanelContent,
  MotoboyRidesContent,
  MotoboyHistoryContent,
  MotoboyHistoricoContent,
  MotoboyFinanceContent,
  MotoboyGroupsContent,
  MotoboyExpansaoContent,
  MotoboyProfileContent,
  VehicleProfileContent,
  MeuVeiculo,
  ProfessionalWizard,
  MotoboyDashboardPremium,
  MotoboyCentralGrupos,
  DeliveryCalls,
  MotoboyGruposRegras,
  Wallet,
  MotoboyWalletContent,
  MotoboyPayPremium,
  MotoboyArchivedRidesContent,
  MotoboyCorridasEmEspera,
  MotoboyLGPDPage,
  MotoboyCampaignInbox,
  PostadorPremiumPanel,
  PostadorHub,
  PostadorDashboard,
  MotoboyRides,
  MotoboyOfferPreview,
  LegalPage,
  MotoboyAwaitingRide,
  MototaxiHistory,
  PublicRideDetailPage,
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
      <Route path="/motoboy/comissao" element={<MotoboyFinanceContent />} />
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

      {/* ── Hub Impulsionar (abas aninhadas) ── */}
      <Route path="/motoboy/impulsionar" element={<PostadorHub />}>
        <Route index element={<PostadorDashboard />} />
        <Route path="divulgacoes"  element={<PostadorPremiumPanel />} />
        <Route path="promover"   element={<MotoboyOperatorPromo />} />
        <Route path="grupos"     element={<MotoboyGroupsContent />} />
        <Route path="carteira"   element={<MotoboyWalletContent />} />
        <Route path="historico"  element={<MotoboyHistoricoContent />} />
        <Route path="comissao"   element={<MotoboyFinanceContent />} />
        {/* RIDV tabs */}
        <Route path="campanhas"  element={<RIDVCampanhasPage />} />
        <Route path="resultados" element={<RIDVResultadosPage />} />
        <Route path="impacto"    element={<RIDVImpactoPage />} />
        <Route path="ia-ridv"   element={<RIDVAssistantPage />} />
        {/* Enterprise tabs */}
        <Route path="gerenciador"  element={<ImpulsionarCampaignManager />} />
        <Route path="analytics"    element={<ImpulsionarAnalytics />} />
        <Route path="creditos"     element={<ImpulsionarCreditsManager />} />
        <Route path="notificacoes" element={<ImpulsionarNotificationsCenter />} />
      </Route>
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
      <Route path="/motoboy/corrida-publica/:id" element={<PublicRideDetailPage />} />
    </Route>

    {/* ── Mototáxi ── */}
    <Route element={<ProtectedRoute requiredProfile="mototaxi"><MototaxiLayout /></ProtectedRoute>}>
      <Route path="/mototaxi" element={<MotoboyPanelContent />} />
      <Route path="/mototaxi/history" element={<MototaxiHistory />} />
      <Route path="/mototaxi/wallet" element={<Wallet />} />
      <Route path="/mototaxi/comissao" element={<MotoboyFinanceContent />} />
      <Route path="/mototaxi/finance" element={<MotoboyFinanceContent />} />
      <Route path="/mototaxi/profile" element={<ProfessionalWizard />} />
      <Route path="/mototaxi/profile-classic" element={<VehicleProfileContent />} />
      <Route path="/mototaxi/meu-veiculo" element={<MeuVeiculo />} />
      <Route path="/mototaxi/groups" element={<MotoboyGroupsContent />} />
      <Route path="/mototaxi/grupos" element={<MotoboyGroupsContent />} />
      <Route path="/mototaxi/campanhas" element={<MotoboyCampaignInbox />} />

      {/* ── Hub Impulsionar mototaxi ── */}
      <Route path="/mototaxi/impulsionar" element={<PostadorHub />}>
        <Route index element={<PostadorDashboard />} />
        <Route path="divulgacoes"  element={<PostadorPremiumPanel />} />
        <Route path="promover"   element={<MototaxiOperatorPromo />} />
        <Route path="grupos"     element={<MotoboyGroupsContent />} />
        <Route path="carteira"   element={<MotoboyWalletContent />} />
        <Route path="historico"  element={<MototaxiHistory />} />
        <Route path="comissao"   element={<MotoboyFinanceContent />} />
        {/* RIDV tabs */}
        <Route path="campanhas"  element={<RIDVCampanhasPage />} />
        <Route path="resultados" element={<RIDVResultadosPage />} />
        <Route path="impacto"    element={<RIDVImpactoPage />} />
        <Route path="ia-ridv"   element={<RIDVAssistantPage />} />
        {/* Enterprise tabs */}
        <Route path="gerenciador"  element={<ImpulsionarCampaignManager />} />
        <Route path="analytics"    element={<ImpulsionarAnalytics />} />
        <Route path="creditos"     element={<ImpulsionarCreditsManager />} />
        <Route path="notificacoes" element={<ImpulsionarNotificationsCenter />} />
      </Route>
    </Route>
  </>
);
