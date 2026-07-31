/**
 * adminRoutes — rotas do painel administrativo.
 */
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";

const PostingEngineAdmin = lazy(() => import("@/pages/admin/PostingEngineAdmin"));
const AdminMotorDashboard = lazy(() => import("@/pages/admin/AdminMotorDashboard"));
const ExecutiveDashboard = lazy(() => import("@/dashboards/pages/executive/ExecutiveDashboard"));
const OperationsDashboard = lazy(() => import("@/dashboards/pages/operational/OperationsDashboard"));
const GovernanceDashboard = lazy(() => import("@/dashboards/pages/governance/GovernanceDashboard"));
const DashboardShell = lazy(() => import("@/dashboards/shell/DashboardShell"));
// COMANDO LEILÃO — Auction Command Center (lazy local p/ não colidir com lazyPages)
const AdminComandoLeilao = lazy(() => import("@/pages/admin/AdminComandoLeilao"));
// ORION Auction Intelligence — consolida AI-65/67/71/73 (lazy local)
const AdminAuctionIntelligence = lazy(() => import("@/pages/admin/AdminAuctionIntelligence"));
// Marketplace de cotações de frete — métricas + comissão configurável (lazy local)
const AdminFreightQuotes = lazy(() => import("@/pages/admin/AdminFreightQuotes"));
// Gestão transacional de leilões (encerrar/cancelar/moderar/invalidar) — lazy local
const AdminAuctionManagement = lazy(() => import("@/pages/admin/AdminAuctionManagement"));
// Painel Administrativo de IA e Antifraude (Enterprise)
const AuctionFraudDashboard = lazy(() => import("@/pages/admin/AuctionFraudDashboard"));
// Painel de Notificações Administrativas
const AdminNotificationsDashboard = lazy(() => import("@/pages/admin/AdminNotificationsDashboard"));
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
  MotoboyTestPanel,
  AdminIncentives,
  AdminGroupFinder,
  AdminLegalDocuments,
  AdminCompliance,
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
  AdminTravelModeration,
  AdminTravelImageModeration,
  AdminMarketplaceCommerce,
  AdminPaymentGateways,
  AdminPaymentDemo,
  AdminFase1Sim,
  AdminMercadoPagoSecrets,
  AdminMercadoPagoConfig,
  AdminAutoPoster,
  AdminPromotionPackagesPage,
  AdminAIAnalytics,
  AdminAICommandCenter,
  AdminAIHistoryPage,
  AdminAIConfigPage,
  AdminPostingAuditPage,
  AdminMotoboyPricing,
  AdminPostPreviewCenter,
  AdminRealtimeDashboard,
  AdminMapDashboard,
  AdminPostingQueuePage,
  AdminFilaDivulgacoes,
  AdminOrion,
  AdminOrionMobility,
  AdminOrionOS,
  AdminOrionPublisher,
  AdminRidv,
  AdminOrionAi,
  AdminOrionPackage,
  AdminOrionFinance,
  AdminOrionCampaign,
  AdminOrionDispatcher,
  AdminOrionGrowth,
  AdminOrionPerformance,
  AdminOrionHealth,
  AdminOrionCommand,
  AdminOrionOperations,
  AdminOrionStrategy,
  AdminOrionConversion,
  AdminOrionExecution,
  AdminOrionSupport,
  AdminOrionMarketplace,
  AdminOrionPersonalization,
  AdminOrionTrust,
  AdminOrionAutomation,
  AdminOrionBusinessIntelligence,
  AdminOrionMarketing,
  AdminOrionSecurity,
  AdminOrionCyberDefense,
  AdminOrionDataShield,
  AdminOrionSecurityAudit,
  AdminOrionIncidentResponse,
  AdminOrionCompliance,
  AdminOrionCertification,
  AdminOrionSales,
  AdminOrionCustomerSuccess,
  AdminOrionLogistics,
  AdminOrionSustainability,
  AdminOrionInnovation,
  AdminOrionExecutive,
  AdminOrionSearchDiscovery,
  AdminOrionGeo,
  AdminOrionKnowledgeGraph,
  AdminOrionRecommendations,
  AdminOrionAiVisibility,
  AdminOrionAiCenter,
  AdminOrionAiGovernance,
  AdminOrionVisitors,
  AdminOrionAuctionIntelligence,
  AdminOrionKnowledgeLearning,
  AdminOrionFraud,
  AdminOrionIdentity,
  AdminOrionThreat,
  AdminOrionZeroTrust,
  AdminOrionIam,
  AdminOrionBackup,
  AdminOrionSoc,
  AdminOrionObservability,
  AdminOrionCostOptimization,
  AdminOrionBi,
  AdminOrionPredictive,
  AdminOrionDigitalTwin,
  AdminOrionGovernance,
  AdminOrionSmartTemplate,
  AdminOrionAiops,
  AdminOrionKgraph,
  AdminOrionBrand,
  AdminOrionBackground,
  AdminOrionAuctionGrowth,
  AdminOrionAutonomousOps,
  AdminOrionExecutiveStrategy,
  AdminOrionCreativeLayout,
  AdminOrionAuctionOrchestrator,
  AdminOrionTrustCenter,
  AdminOrionAudio,
  AdminMultimidia,
  AdminOrionPricing,
  AdminOrionForecast,
  AdminAuditoriaCategorias,
  AdminCommissionIntelligence,
  AdminRadarIA,
  AdminGruposAprovados,
  AdminModeracaoIA,
  AdminProfessionalsHub,
  AdminProfessionalIndividualPage,
  AdminMotoboyFinanceiro,
  AdminMotoTaxiFinanceiro,
  AdminMotoristaFinanceiro,
  AdminSHCCentral,
  AdminSHCOverview,
  AdminSHCResults,
  AdminSHCCorrections,
  AdminSHCHistory,
  AdminSHCAudit,
  AdminSHCCertification,
  AdminSHCCertificationTab,
  AdminSHCEvolution
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
      <Route path="/admin/fretes/cotacoes" element={<AdminFreightQuotes />} />
      <Route path="/admin/viagens" element={<AdminViagemOverview />} />
      <Route path="/admin/viagens/moderacao" element={<AdminTravelModeration />} />
      <Route path="/admin/viagens/aprovacao-imagens" element={<AdminTravelImageModeration />} />
      <Route path="/admin/promotion-packages" element={<AdminPromotionPackagesPage />} />
      <Route path="/admin/comando-leilao" element={<AdminComandoLeilao />} />
      <Route path="/admin/auction-intelligence" element={<AdminAuctionIntelligence />} />
      <Route path="/admin/leiloes/gestao" element={<AdminAuctionManagement />} />
      <Route path="/admin/leiloes/antifraude" element={<AuctionFraudDashboard />} />
      <Route path="/admin/notificacoes" element={<AdminNotificationsDashboard />} />
      <Route path="/admin/marketplace/comercio" element={<AdminMarketplaceCommerce />} />
      <Route path="/admin/moderacao-imagens" element={<AdminImageModeration />} />
      <Route path="/admin/expansao" element={<AdminExpansao />} />
      <Route path="/admin/financeiro" element={<AdminFinanceiro />}>
        <Route path="ajustes" element={<AdminFinanceAdjustments />} />
      </Route>
      <Route path="/admin/finance-reports" element={<AdminFinanceReports />} />
      <Route path="/admin/motoboy-payments" element={<AdminMotoboyPayments />} />
      <Route path="/admin/motoboy-test" element={<MotoboyTestPanel />} />
      <Route path="/admin/incentives" element={<AdminIncentives />} />
      <Route path="/admin/group-finder" element={<AdminGroupFinder />} />
      <Route path="/admin/group-settings" element={<AdminGroupSettings />} />
      <Route path="/admin/legal-documents" element={<AdminLegalDocuments />} />
      <Route path="/admin/compliance" element={<AdminCompliance />} />
      <Route path="/admin/footer-contents" element={<AdminFooterContents />} />
      <Route path="/admin/support" element={<AdminSupportTicketsPage />} />
      <Route path="/admin/support/ticket/:id" element={<AdminTicketDetailPage />} />
      <Route path="/admin/support/stats" element={<AdminSupportStatsPage />} />
      <Route path="/admin/supervisor" element={<AdminAISupervisorPage />} />
      <Route path="/admin/posting" element={<AdminPosting />} />
      <Route path="/admin/impulsionar-central" element={<AdminPostadorCentral />} />
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
      <Route path="/admin/comissao-inteligente" element={<AdminCommissionIntelligence />} />
      <Route path="/admin/radar-ia" element={<AdminRadarIA />} />
      <Route path="/admin/grupos-aprovados" element={<AdminGruposAprovados />} />
      <Route path="/admin/moderacao-ia" element={<AdminModeracaoIA />} />
      <Route path="/admin/motoboy-financeiro" element={<AdminMotoboyFinanceiro />} />
      <Route path="/admin/moto-taxi-financeiro" element={<AdminMotoTaxiFinanceiro />} />
      <Route path="/admin/motorista-financeiro" element={<AdminMotoristaFinanceiro />} />
      <Route path="/admin/profissionais-hub" element={<AdminProfessionalsHub />} />
      <Route path="/admin/profissionais" element={<AdminProfessionalsHub />} />
      <Route path="/admin/profissionais/:profileSlug/:id" element={<AdminProfessionalIndividualPage />} />
      <Route path="/admin/profissionais/:id" element={<AdminProfessionalIndividualPage />} />
      <Route path="/admin/pay" element={<AdminPayDashboard />} />
      <Route path="/admin/pay/wallets" element={<AdminPayWallets />} />
      <Route path="/admin/pay/ledger" element={<AdminPayLedger />} />
      <Route path="/admin/pay/courier-wallets" element={<AdminCourierWallets />} />
      <Route path="/admin/pay/premium" element={<PayAdminPremium />} />
      <Route path="/admin/pagamentos/gateways" element={<AdminPaymentGateways />} />
      <Route path="/admin/pagamentos/demo" element={<AdminPaymentDemo />} />
      <Route path="/admin/pagamentos/simular" element={<AdminFase1Sim />} />
      <Route path="/secrets/mercadopago" element={<AdminMercadoPagoSecrets />} />
      <Route path="/admin/pagamentos/mercadopago" element={<AdminMercadoPagoConfig />} />
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
      {/* Novas URLs canônicas */}
      <Route path="/admin/ai-analytics" element={<AdminAIAnalytics />} />
      <Route path="/admin/ai" element={<AdminAICommandCenter />} />
      <Route path="/admin/ai-historico" element={<AdminAIHistoryPage />} />
      <Route path="/admin/ai-config" element={<AdminAIConfigPage />} />
      {/* Aliases legados — redirect para novos URLs */}
      <Route path="/admin/glm-analytics" element={<Navigate to="/admin/ai-analytics" replace />} />
      <Route path="/admin/glm" element={<Navigate to="/admin/ai" replace />} />
      <Route path="/admin/glm-historico" element={<Navigate to="/admin/ai-historico" replace />} />
      <Route path="/admin/auditoria-postagens" element={<AdminPostingAuditPage />} />
      <Route path="/admin/pre-visualizacao" element={<AdminPostPreviewCenter />} />
      <Route path="/admin/motoboy-pricing" element={<AdminMotoboyPricing />} />
      {/* Central de Eventos + Mapa */}
      <Route path="/admin/eventos" element={<AdminRealtimeDashboard />} />
      <Route path="/admin/mapa"    element={<AdminMapDashboard />} />
      {/* Tier 2.2: Motor Universal de Postagens — Centro de Controle */}
      <Route path="/admin/motor"             element={<PostingEngineAdmin />} />
      <Route path="/admin/motor-central"     element={<AdminMotorDashboard />} />
      {/* M58.1: Executive Dashboard (CEO Cockpit) — Programa CIO */}
      <Route path="/admin/executivo"         element={<ExecutiveDashboard />} />
      {/* M58.2: Enterprise Operations Dashboard (NOC) — Programa CIO */}
      <Route path="/admin/operacional"       element={<OperationsDashboard />} />
      {/* M58.4: Enterprise Governance Dashboard — Programa CIO */}
      <Route path="/admin/governanca"        element={<GovernanceDashboard />} />
      {/* M58.5: Shell DEFINITIVA do Painel Executivo (rota canônica) */}
      <Route path="/dashboards/*"            element={<DashboardShell />} />
      {/* M49: Monitor & Fila do Impulsionamento */}
      <Route path="/admin/fila-impulsionar" element={<AdminPostingQueuePage />} />
      {/* Fila Inteligente de Divulgações — transparência total (admin) */}
      <Route path="/admin/fila-divulgacoes" element={<AdminFilaDivulgacoes />} />
      <Route path="/admin/orion" element={<AdminOrion />} />
      <Route path="/admin/orion-mobility" element={<AdminOrionMobility />} />
      <Route path="/admin/orion-os" element={<AdminOrionOS />} />
      <Route path="/admin/orion-publisher" element={<AdminOrionPublisher />} />
      <Route path="/admin/ridv" element={<AdminRidv />} />
      <Route path="/admin/orion-ai" element={<AdminOrionAi />} />
      <Route path="/admin/orion-package" element={<AdminOrionPackage />} />
      <Route path="/admin/orion-finance" element={<AdminOrionFinance />} />
      <Route path="/admin/orion-campaign" element={<AdminOrionCampaign />} />
      <Route path="/admin/orion-dispatcher" element={<AdminOrionDispatcher />} />
      <Route path="/admin/orion-growth" element={<AdminOrionGrowth />} />
      <Route path="/admin/orion-performance" element={<AdminOrionPerformance />} />
      <Route path="/admin/orion-health" element={<AdminOrionHealth />} />
      <Route path="/admin/orion-command" element={<AdminOrionCommand />} />
      <Route path="/admin/orion-operations" element={<AdminOrionOperations />} />
      <Route path="/admin/orion-strategy" element={<AdminOrionStrategy />} />
      <Route path="/admin/orion-conversion" element={<AdminOrionConversion />} />
      <Route path="/admin/orion-execution" element={<AdminOrionExecution />} />
      <Route path="/admin/orion-support" element={<AdminOrionSupport />} />
      <Route path="/admin/orion-marketplace" element={<AdminOrionMarketplace />} />
      <Route path="/admin/orion-personalization" element={<AdminOrionPersonalization />} />
      <Route path="/admin/orion-trust" element={<AdminOrionTrust />} />
      <Route path="/admin/orion-automation" element={<AdminOrionAutomation />} />
      <Route path="/admin/orion-business-intelligence" element={<AdminOrionBusinessIntelligence />} />
      <Route path="/admin/orion-marketing" element={<AdminOrionMarketing />} />
      <Route path="/admin/orion-security" element={<AdminOrionSecurity />} />
      <Route path="/admin/orion-cyber-defense" element={<AdminOrionCyberDefense />} />
      <Route path="/admin/orion-data-shield" element={<AdminOrionDataShield />} />
      <Route path="/admin/orion-security-audit" element={<AdminOrionSecurityAudit />} />
      <Route path="/admin/orion-incident-response" element={<AdminOrionIncidentResponse />} />
      <Route path="/admin/orion-compliance" element={<AdminOrionCompliance />} />
      <Route path="/admin/orion-certification" element={<AdminOrionCertification />} />
      <Route path="/admin/orion-sales" element={<AdminOrionSales />} />
      <Route path="/admin/orion-customer-success" element={<AdminOrionCustomerSuccess />} />
      <Route path="/admin/orion-logistics" element={<AdminOrionLogistics />} />
      <Route path="/admin/orion-sustainability" element={<AdminOrionSustainability />} />
      <Route path="/admin/orion-innovation" element={<AdminOrionInnovation />} />
      <Route path="/admin/orion-executive" element={<AdminOrionExecutive />} />
      <Route path="/admin/orion-search-discovery" element={<AdminOrionSearchDiscovery />} />
      <Route path="/admin/orion-geo" element={<AdminOrionGeo />} />
      <Route path="/admin/orion-knowledge-graph" element={<AdminOrionKnowledgeGraph />} />
      <Route path="/admin/orion-recommendations" element={<AdminOrionRecommendations />} />
      <Route path="/admin/orion-ai-visibility" element={<AdminOrionAiVisibility />} />
      <Route path="/admin/orion-ai-center" element={<AdminOrionAiCenter />} />
      <Route path="/admin/orion-ai-governance" element={<AdminOrionAiGovernance />} />
      <Route path="/admin/orion-visitors" element={<AdminOrionVisitors />} />
      <Route path="/admin/orion-auction-intelligence" element={<AdminOrionAuctionIntelligence />} />
      <Route path="/admin/orion-knowledge-learning" element={<AdminOrionKnowledgeLearning />} />
      <Route path="/admin/orion-fraud" element={<AdminOrionFraud />} />
      <Route path="/admin/orion-identity" element={<AdminOrionIdentity />} />
      <Route path="/admin/orion-threat-intelligence" element={<AdminOrionThreat />} />
      <Route path="/admin/orion-zero-trust" element={<AdminOrionZeroTrust />} />
      <Route path="/admin/orion-iam" element={<AdminOrionIam />} />
      <Route path="/admin/orion-backup-recovery" element={<AdminOrionBackup />} />
      <Route path="/admin/orion-soc" element={<AdminOrionSoc />} />
      <Route path="/admin/orion-observability" element={<AdminOrionObservability />} />
      <Route path="/admin/orion-cost-optimization" element={<AdminOrionCostOptimization />} />
      <Route path="/admin/orion-bi" element={<AdminOrionBi />} />
      <Route path="/admin/orion-predictive" element={<AdminOrionPredictive />} />
      <Route path="/admin/orion-digital-twin" element={<AdminOrionDigitalTwin />} />
      <Route path="/admin/orion-governance" element={<AdminOrionGovernance />} />
      <Route path="/admin/orion-smart-template" element={<AdminOrionSmartTemplate />} />
      <Route path="/admin/orion-aiops" element={<AdminOrionAiops />} />
      <Route path="/admin/orion-kgraph" element={<AdminOrionKgraph />} />
      <Route path="/admin/orion-brand" element={<AdminOrionBrand />} />
      <Route path="/admin/orion-background" element={<AdminOrionBackground />} />
      <Route path="/admin/orion-auction-growth" element={<AdminOrionAuctionGrowth />} />
      <Route path="/admin/orion-autonomous-ops" element={<AdminOrionAutonomousOps />} />
      <Route path="/admin/orion-executive-strategy" element={<AdminOrionExecutiveStrategy />} />
      <Route path="/admin/orion-creative-layout" element={<AdminOrionCreativeLayout />} />
      <Route path="/admin/orion-auction-orchestrator" element={<AdminOrionAuctionOrchestrator />} />
      <Route path="/admin/orion-trust-center" element={<AdminOrionTrustCenter />} />
      <Route path="/admin/orion-audio" element={<AdminOrionAudio />} />
      <Route path="/admin/multimidia" element={<AdminMultimidia />} />
      <Route path="/admin/orion-pricing" element={<AdminOrionPricing />} />
      <Route path="/admin/orion-forecast" element={<AdminOrionForecast />} />
      {/* Auditoria de Categorias — segmentação por módulo */}
      <Route path="/admin/auditoria-categorias" element={<AdminAuditoriaCategorias />} />
      {/* Redirect legado */}
      <Route path="/admin/fila-postador" element={<Navigate to="/admin/fila-impulsionar" replace />} />
      <Route path="/admin/postador-central" element={<Navigate to="/admin/impulsionar-central" replace />} />
      
      {/* SHC */}
      <Route path="/admin/shc" element={<AdminSHCCentral />} />
      <Route path="/admin/shc/:moduleId" element={<AdminSHCOverview />} />
      <Route path="/admin/shc/:moduleId/resultados/:id" element={<AdminSHCResults />} />
      <Route path="/admin/shc/:moduleId/correcoes" element={<AdminSHCCorrections />} />
      <Route path="/admin/shc/:moduleId/historico" element={<AdminSHCHistory />} />
      <Route path="/admin/shc/:moduleId/auditoria" element={<AdminSHCAudit />} />
      <Route path="/admin/shc/:moduleId/certificacao" element={<AdminSHCCertificationTab />} />
      <Route path="/admin/shc/:moduleId/evolucao" element={<AdminSHCEvolution />} />
      <Route path="/admin/shc/:moduleId/certificacao/:id" element={<AdminSHCCertification />} />
      <Route path="/admin/leiloes-shc" element={<Navigate to="/admin/shc/leiloes" replace />} />
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
