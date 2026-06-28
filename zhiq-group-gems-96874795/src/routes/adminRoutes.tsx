/**
 * adminRoutes — rotas do painel administrativo.
 */
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  AdminLayout,
  AdminDashboard,
  AdminUsers,
  AdminUserDetails,
  AdminStats,
  AdminStores,
  AdminStoreDetail,
  AdminExpansao,
  AdminFinanceiro,
  AdminFinanceAdjustments,
  AdminFinanceReports,
  AdminMotoboyPayments,
  AdminIncentives,
  AdminGroupFinder,
  AdminLegalDocuments,
  AdminFooterContents,
  AdminGroupSettings,
  AdminPosting,
  AdminPostadorCentral,
  AdminCampaignQueue,
  AdminCampaignDispatchPanel,
  AdminDashboardNacional,
  AdminCoberturaNacional,
  AdminMarketplaceOverview,
  AdminMarketplaceProducts,
  AdminImageModeration,
  AdminSupportTicketsPage,
  AdminTicketDetailPage,
  AdminSupportStatsPage,
  AdminAISupervisorPage,
  AdminRegioesAtivas,
  AdminFilaExpansao,
  AdminMetasRegionais,
  AdminMotorTerritorial,
  AdminCentroCrescimento,
  AdminWarRoom,
  AdminCreditsModule,
  AdminMultiPerfil,
  AdminDashboardMultiPerfil,
  AdminPayDashboard,
  AdminPayWallets,
  AdminPayLedger,
  AdminCourierWallets,
  PayAdminPremium,
  AdminRealEstateOverview,
  AdminRealEstatePackages,
  AdminRealEstateModeration,
  AdminRealEstateImageModeration,
  AdminMarketingPostagens,
  AdminMarketingBiblioteca,
  AdminMarketingControle,
  AdminMarketingHistorico,
  AdminMarketingImpacto,
  AdminMarketingFilaGrupos,
  AdminMarketingRadar,
  AdminCreditGrants,
  AdminVehicleOverview,
  AdminServiceOverview,
  AdminFreightOverview,
  AdminViagemOverview,
  AdminMarketplaceCommerce,
  AdminPaymentGateways,
  AdminPaymentDemo,
  AdminFase1Sim,
  AdminMercadoPagoSecrets,
  AdminAutoPoster,
  AdminPromotionPackagesPage,
  AdminGLMAnalytics,
  AdminMotoboyPricing,
} from "./lazyPages";

export const adminRoutes = (
  <>
    {/* ── Painel Admin principal ── */}
    <Route element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/users/:id" element={<AdminUserDetails />} />
      <Route path="/admin/stats" element={<AdminStats />} />
      <Route path="/admin/lojas" element={<AdminStores />} />
      <Route path="/admin/lojas/:id" element={<AdminStoreDetail />} />
      <Route path="/admin/marketplace" element={<AdminMarketplaceOverview />} />
      <Route path="/admin/marketplace/products" element={<AdminMarketplaceProducts />} />
      <Route path="/admin/vehicles" element={<AdminVehicleOverview />} />
      <Route path="/admin/servicos" element={<AdminServiceOverview />} />
      <Route path="/admin/fretes" element={<AdminFreightOverview />} />
      <Route path="/admin/viagens" element={<AdminViagemOverview />} />
      <Route path="/admin/promotion-packages" element={<AdminPromotionPackagesPage />} />
      <Route path="/admin/marketplace/comercio" element={<AdminMarketplaceCommerce />} />
      <Route path="/admin/moderacao-imagens" element={<AdminImageModeration />} />
      <Route path="/admin/expansao" element={<AdminExpansao />} />
      <Route path="/admin/financeiro" element={<AdminFinanceiro />}>
        <Route path="ajustes" element={<AdminFinanceAdjustments />} />
      </Route>
      <Route path="/admin/finance-reports" element={<AdminFinanceReports />} />
      <Route path="/admin/motoboy-payments" element={<AdminMotoboyPayments />} />
      <Route path="/admin/incentives" element={<AdminIncentives />} />
      <Route path="/admin/group-finder" element={<AdminGroupFinder />} />
      <Route path="/admin/group-settings" element={<AdminGroupSettings />} />
      <Route path="/admin/legal-documents" element={<AdminLegalDocuments />} />
      <Route path="/admin/footer-contents" element={<AdminFooterContents />} />
      <Route path="/admin/support" element={<AdminSupportTicketsPage />} />
      <Route path="/admin/support/ticket/:id" element={<AdminTicketDetailPage />} />
      <Route path="/admin/support/stats" element={<AdminSupportStatsPage />} />
      <Route path="/admin/supervisor" element={<AdminAISupervisorPage />} />
      <Route path="/admin/posting" element={<AdminPosting />} />
      <Route path="/admin/postador-central" element={<AdminPostadorCentral />} />
      <Route path="/admin/auto-poster" element={<AdminAutoPoster />} />
      <Route path="/admin/campaign-queue" element={<AdminCampaignQueue />} />
      <Route path="/admin/campaign-dispatch" element={<AdminCampaignDispatchPanel />} />
      <Route path="/admin/nacional" element={<AdminDashboardNacional />} />
      <Route path="/admin/cobertura-nacional" element={<AdminCoberturaNacional />} />
      <Route path="/admin/regioes-ativas" element={<AdminRegioesAtivas />} />
      <Route path="/admin/fila-expansao" element={<AdminFilaExpansao />} />
      <Route path="/admin/metas-regionais" element={<AdminMetasRegionais />} />
      <Route path="/admin/motor-territorial" element={<AdminMotorTerritorial />} />
      <Route path="/admin/centro-crescimento" element={<AdminCentroCrescimento />} />
      <Route path="/admin/war-room" element={<AdminWarRoom />} />
      <Route path="/admin/creditos" element={<AdminCreditsModule />} />
      <Route path="/admin/pay" element={<AdminPayDashboard />} />
      <Route path="/admin/pay/wallets" element={<AdminPayWallets />} />
      <Route path="/admin/pay/ledger" element={<AdminPayLedger />} />
      <Route path="/admin/pay/courier-wallets" element={<AdminCourierWallets />} />
      <Route path="/admin/pay/premium" element={<PayAdminPremium />} />
      <Route path="/admin/pagamentos/gateways" element={<AdminPaymentGateways />} />
      <Route path="/admin/pagamentos/demo" element={<AdminPaymentDemo />} />
      <Route path="/admin/pagamentos/simular" element={<AdminFase1Sim />} />
      <Route path="/secrets/mercadopago" element={<AdminMercadoPagoSecrets />} />
      <Route path="/admin/perfis/dashboard" element={<AdminDashboardMultiPerfil />} />
      <Route path="/admin/perfis/:profileType" element={<AdminMultiPerfil />} />
      {/* Marketing */}
      <Route path="/admin/marketing/postagens" element={<AdminMarketingPostagens />} />
      <Route path="/admin/marketing/biblioteca" element={<AdminMarketingBiblioteca />} />
      <Route path="/admin/marketing/controle" element={<AdminMarketingControle />} />
      <Route path="/admin/marketing/historico" element={<AdminMarketingHistorico />} />
      <Route path="/admin/marketing/impacto" element={<AdminMarketingImpacto />} />
      <Route path="/admin/marketing/fila-grupos" element={<AdminMarketingFilaGrupos />} />
      <Route path="/admin/marketing/radar" element={<AdminMarketingRadar />} />
      {/* Imóveis admin */}
      <Route path="/admin/imoveis" element={<AdminRealEstateOverview />} />
      <Route path="/admin/imoveis/pacotes" element={<AdminRealEstatePackages />} />
      <Route path="/admin/imoveis/moderacao" element={<AdminRealEstateModeration />} />
      <Route path="/admin/imoveis/aprovacao-imagens" element={<AdminRealEstateImageModeration />} />
      <Route path="/admin/creditos-teste" element={<AdminCreditGrants />} />
      <Route path="/admin/glm-analytics" element={<AdminGLMAnalytics />} />
      <Route path="/admin/motoboy-pricing" element={<AdminMotoboyPricing />} />
    </Route>

    {/* ── Alias /administrador ── */}
    <Route element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
      <Route path="/administrador" element={<AdminDashboard />} />
      <Route path="/administrador/financeiro" element={<AdminFinanceiro />}>
        <Route path="ajustes" element={<AdminFinanceAdjustments />} />
        <Route path="relatorios" element={<AdminFinanceReports />} />
      </Route>
      <Route path="/administrador/*" element={<Navigate to="/admin" replace />} />
    </Route>
  </>
);
