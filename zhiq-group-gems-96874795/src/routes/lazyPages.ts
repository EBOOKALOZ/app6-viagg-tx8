/**
 * lazyPages.ts — centraliza todos os imports lazy de páginas.
 * Garante identidade única de componente em toda a aplicação.
 * Cada módulo de rotas importa daqui ao invés de declarar lazy() separadamente.
 */
import { lazy } from "react";

/* ── Layouts (lazy) ── */
export const AppLayout = lazy(() => import("@/components/AppLayout").then(m => ({ default: m.AppLayout })));
export const AdminLayout = lazy(() => import("@/components/admin/AdminLayout").then(m => ({ default: m.AdminLayout })));
export const AdminPaymentGateways = lazy(() => import("@/pages/admin/AdminPaymentGateways"));
export const AdminPaymentDemo = lazy(() => import("@/pages/admin/AdminPaymentDemo"));
export const AdminFase1Sim = lazy(() => import("@/pages/admin/AdminFase1Sim"));
export const AdminMercadoPagoSecrets = lazy(() => import("@/pages/admin/AdminMercadoPagoSecrets"));
export const AdminMercadoPagoConfig = lazy(() => import("@/pages/admin/AdminMercadoPagoConfig"));
export const AdminAutoPoster = lazy(() => import("@/pages/admin/AdminAutoPoster"));
// Novos nomes canônicos
export const AdminAIAnalytics      = lazy(() => import("@/pages/admin/AdminGLMAnalytics"));
export const AdminAICommandCenter  = lazy(() => import("@/pages/admin/AdminGLMCommandCenter"));
export const AdminAIHistoryPage    = lazy(() => import("@/pages/admin/AdminGLMHistoryPage"));
export const AdminAIConfigPage     = lazy(() => import("@/pages/admin/AdminAIConfigPage"));
// Aliases legados (mantidos para qualquer import direto existente)
export const AdminGLMAnalytics     = AdminAIAnalytics;
export const AdminGLMCommandCenter = AdminAICommandCenter;
export const AdminGLMHistoryPage   = AdminAIHistoryPage;
export const AdminPostingAuditPage = lazy(() => import("@/pages/admin/AdminPostingAuditPage"));
export const AdminProfessionalsHub = lazy(() => import("@/pages/admin/AdminProfessionalsHub").then(m => ({ default: m.AdminProfessionalsHub })));
export const AdminProfessionalIndividualPage = lazy(() => import("@/pages/admin/AdminProfessionalIndividualPage").then(m => ({ default: m.AdminProfessionalIndividualPage })));
export const AdminMotoboyPricing = lazy(() => import("@/pages/admin/AdminMotoboyPricing"));
export const AdminPostPreviewCenter = lazy(() => import("@/pages/admin/AdminPostPreviewCenter"));
export const MerchantLayout = lazy(() => import("@/components/merchant/MerchantLayout").then(m => ({ default: m.MerchantLayout })));
export const MotoboyLayout = lazy(() => import("@/components/motoboy/MotoboyLayout").then(m => ({ default: m.MotoboyLayout })));
export const MototaxiLayout = lazy(() => import("@/components/motoboy/MototaxiLayout").then(m => ({ default: m.MototaxiLayout })));
export const DriverLayout = lazy(() => import("@/components/driver/DriverLayout").then(m => ({ default: m.DriverLayout })));
export const MotoboyOnboardingLayout = lazy(() => import("@/components/motoboy/MotoboyOnboardingLayout").then(m => ({ default: m.MotoboyOnboardingLayout })));
export const OperadorLayout = lazy(() => import("@/components/operador/OperadorLayout").then(m => ({ default: m.OperadorLayout })));
export const InstitutionalLayout = lazy(() => import("@/components/InstitutionalLayout").then(m => ({ default: m.InstitutionalLayout })));
export const ProfileInstitutionalLayout = lazy(() => import("@/components/ProfileInstitutionalLayout").then(m => ({ default: m.ProfileInstitutionalLayout })));
export const LoadingScreenPremium = lazy(() => import("@/components/LoadingScreenPremium"));

/* ── Auth / Geral ── */
export const AdminEmergency = lazy(() => import("@/pages/AdminEmergency"));
export const Auth = lazy(() => import("@/pages/Auth"));
export const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
export const SelectProfile = lazy(() => import("@/pages/SelectProfile"));
export const RedirectByProfile = lazy(() => import("@/pages/RedirectByProfile"));
export const SyncProfile = lazy(() => import("@/pages/SyncProfile"));
export const CompleteProfile = lazy(() => import("@/pages/CompleteProfile"));
export const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
export const UpdatePassword = lazy(() => import("@/pages/UpdatePassword"));
export const MotoboyOnboarding = lazy(() => import("@/pages/onboarding/MotoboyOnboarding"));
export const MerchantOnboarding = lazy(() => import("@/pages/onboarding/MerchantOnboarding"));
export const WelcomePage = lazy(() => import("@/pages/WelcomePage"));
export const PublicHome = lazy(() => import("@/pages/PublicHome"));
export const Index = lazy(() => import("@/pages/Index"));
export const NotFound = lazy(() => import("@/pages/NotFound"));
export const ChooseProfile = lazy(() => import("@/pages/ChooseProfile"));
export const ManageProfiles = lazy(() => import("@/pages/ManageProfiles"));
export const Profile = lazy(() => import("@/pages/Profile"));
export const MinhaConta = lazy(() => import("@/pages/MinhaConta"));
export const Dashboard = lazy(() => import("@/pages/Dashboard"));
export const Groups = lazy(() => import("@/pages/Groups"));
export const GroupsPage = lazy(() => import("@/pages/GroupsPage"));
export const Wallet = lazy(() => import("@/pages/Wallet"));
export const Support = lazy(() => import("@/pages/Support"));
export const Rates = lazy(() => import("@/pages/Rates"));
export const ReferFriends = lazy(() => import("@/pages/ReferFriends"));
export const LegalPage = lazy(() => import("@/pages/LegalPage"));
export const AceitePage = lazy(() => import("@/pages/AceitePage"));

/* ── Merchant ── */
export const MerchantPanel = lazy(() => import("@/pages/MerchantPanel"));
export const MerchantPanelContent = lazy(() => import("@/pages/MerchantPanelContent"));
export const MerchantDashboardPage = lazy(() => import("@/pages/merchant/MerchantDashboard"));
export const MerchantMessagesPage = lazy(() => import("@/pages/merchant/MerchantMessagesPage"));
export const MerchantHistoryContent = lazy(() => import("@/pages/MerchantHistoryContent"));
export const MerchantBillingContent = lazy(() => import("@/pages/MerchantBilling"));
export const MerchantSettingsContent = lazy(() => import("@/pages/MerchantSettingsContent"));
export const MerchantProfileContent = lazy(() => import("@/pages/merchant/MerchantProfileContent"));
export const CreateDelivery = lazy(() => import("@/pages/CreateDelivery"));
export const LojistaAguardando = lazy(() => import("@/pages/LojistaAguardando"));
export const MerchantDashboard = lazy(() => import("@/pages/MerchantDashboard"));
export const MerchantCampaigns = lazy(() => import("@/pages/merchant/MerchantCampaigns"));
export const MerchantM1Panel = lazy(() => import("@/pages/merchant/MerchantM1Panel"));
export const MerchantOrders = lazy(() => import("@/pages/merchant/MerchantOrders"));
export const MerchantPaymentSettings = lazy(() => import("@/pages/merchant/MerchantPaymentSettings"));
export const MerchantCredits = lazy(() => import("@/pages/merchant/MerchantCredits"));
export const MerchantAuctions = lazy(() => import("@/pages/merchant/MerchantAuctions"));
export const MerchantArremate = lazy(() => import("@/pages/merchant/MerchantArremate"));
export const MerchantPayPremium = lazy(() => import("@/pages/merchant/MerchantPayPremium"));
export const MerchantConversions = lazy(() => import("@/pages/merchant/MerchantConversions"));

/* ── Público ── */
export const ProductLandingPage = lazy(() => import("@/pages/public/ProductLandingPage"));
export const ProductRedirectPage = lazy(() => import("@/pages/public/ProductRedirectPage"));
export const MercadoLocalViagg = lazy(() => import("@/pages/public/MercadoLocalViagg"));
export const ProductPublicPage = lazy(() => import("@/pages/public/ProductPublicPage"));
export const ProductCheckoutPage = lazy(() => import("@/pages/public/ProductCheckoutPage"));
export const CheckoutCartaoPage = lazy(() => import("@/pages/public/CheckoutCartaoPage"));
export const MyDigitalLibrary = lazy(() => import("@/pages/public/MyDigitalLibrary"));
export const DigitalDeliveryGateway = lazy(() => import("@/pages/public/DigitalDeliveryGateway"));
export const StorePublicPage = lazy(() => import("@/pages/public/StorePublicPage"));
export const AuctionListPage = lazy(() => import("@/pages/public/AuctionListPage"));
export const AuctionPublicPage = lazy(() => import("@/pages/public/AuctionPublicPage"));
export const ArrematePublicPage = lazy(() => import("@/pages/public/ArrematePublicPage"));
export const PublicMotoboyRequest = lazy(() => import("@/pages/public/PublicMotoboyRequest"));
export const MotoboyInicio = lazy(() => import("@/pages/public/MotoboyInicio"));
export const CorridasInicio   = lazy(() => import("@/pages/public/CorridasInicio"));
export const SolicitarCorrida = lazy(() => import("@/pages/public/SolicitarCorrida"));
export const PublicRideTracking = lazy(() => import("@/pages/public/PublicRideTracking"));
export const MinhasOfertas = lazy(() => import("@/pages/public/MinhasOfertas"));
export const VenderImovelPage = lazy(() => import("@/pages/public/VenderImovelPage"));
export const RealEstateCheckoutPage = lazy(() => import("@/pages/public/RealEstateCheckoutPage"));
export const VehicleDetailPage = lazy(() => import("@/pages/public/VehicleDetailPage"));
export const AllVehiclesPage = lazy(() => import("@/pages/public/AllVehiclesPage"));
export const PublicServicesHome = lazy(() => import("@/pages/public/PublicServicesHome"));
export const ServiceDetailPage = lazy(() => import("@/pages/public/ServiceDetailPage"));
export const PublicFreightHome = lazy(() => import("@/pages/public/PublicFreightHome"));
export const FreightDetailPage = lazy(() => import("@/pages/public/FreightDetailPage"));
export const PublicTravelHome = lazy(() => import("@/pages/public/PublicTravelHome"));
export const TravelDetailPage = lazy(() => import("@/pages/public/TravelDetailPage"));
export const TravelAccountPage = lazy(() => import("@/pages/public/TravelAccountPage"));
export const AllAuctionsPage = lazy(() => import("@/pages/public/AllAuctionsPage"));
export const AuctionMarketDetailPage = lazy(() => import("@/pages/public/AuctionMarketDetailPage"));
export const CampaignSharePage = lazy(() => import("@/pages/public/CampaignSharePage"));
export const TrackingRedirectPage = lazy(() => import("@/pages/public/TrackingRedirectPage"));

/* ── Motoboy ── */
export const MotoboyPanel = lazy(() => import("@/pages/MotoboyPanel"));
export const MotoboyPanelContent = lazy(() => import("@/pages/MotoboyPanelContent"));
export const MotoboyRidesContent = lazy(() => import("@/pages/MotoboyRidesContent"));
export const MotoboyHistoryContent = lazy(() => import("@/pages/MotoboyHistoryContent"));
export const MotoboyHistoricoContent = lazy(() => import("@/pages/MotoboyHistoricoContent"));
export const MotoboyFinanceContent = lazy(() => import("@/pages/MotoboyFinanceContent"));
export const MotoboyGroupsContent = lazy(() => import("@/pages/MotoboyGroupsContent"));
export const MotoboyExpansaoContent = lazy(() => import("@/pages/MotoboyExpansaoContent"));
export const MotoboyProfileContent = lazy(() => import("@/pages/MotoboyProfileContent"));
export const VehicleProfileContent = lazy(() => import("@/pages/VehicleProfileContent"));
export const MeuVeiculo = lazy(() => import("@/pages/MeuVeiculo"));
export const ProfessionalWizard = lazy(() => import("@/pages/ProfessionalWizard"));
export const MinhaCarteira = lazy(() => import("@/pages/public/MinhaCarteira"));
export const MeusDados = lazy(() => import("@/pages/public/MeusDados"));
export const ContaViajante = lazy(() => import("@/pages/public/MinhaConta"));
export const MotoboyDashboardPremium = lazy(() => import("@/pages/MotoboyDashboardPremium"));
export const MotoboyRides = lazy(() => import("@/pages/MotoboyRides"));
export const MotoboyCentralGrupos = lazy(() => import("@/pages/MotoboyCentralGrupos"));
export const MototaxiHistory = lazy(() => import("@/pages/MototaxiHistory"));
export const MotoboyGruposRegras = lazy(() => import("@/pages/MotoboyGruposRegras"));
export const DeliveryCalls = lazy(() => import("@/pages/DeliveryCalls"));
export const MotoboyWalletPage = lazy(() => import("@/pages/MotoboyWalletPage"));
export const MotoboyWalletContent = lazy(() => import("@/pages/MotoboyWalletContent"));
export const MotoboyPayPremium = lazy(() => import("@/pages/motoboy/MotoboyPayPremium"));
export const MotoboyArchivedRidesContent = lazy(() => import("@/pages/MotoboyArchivedRidesContent"));
export const MotoboyAwaitingRide = lazy(() => import("@/pages/MotoboyAwaitingRide"));
export const MotoboyOfferPreview = lazy(() => import("@/pages/MotoboyOfferPreview"));
export const MotoboyCorridasEmEspera = lazy(() => import("@/pages/MotoboyCorridasEmEspera"));
export const PostadorPremiumPanel = lazy(() => import("@/pages/PostadorPremiumPanel"));
export const MotoboyLGPDPage = lazy(() => import("@/pages/motoboy/MotoboyLGPDPage"));
export const PublicRideDetailPage = lazy(() => import("@/pages/motoboy/PublicRideDetailPage"));
export const MotoboyCampaignInbox = lazy(() => import("@/pages/motoboy/MotoboyCampaignInbox"));

/* ── Driver / Freteiro / Passageiro ── */
export const DriverPanel = lazy(() => import("@/pages/DriverPanel"));
export const DriverCalls = lazy(() => import("@/pages/DriverCalls"));
export const FreteiroPanel = lazy(() => import("@/pages/FreteiroPanel"));
export const PassengerPanel = lazy(() => import("@/pages/PassengerPanel"));
export const PassengerHistory = lazy(() => import("@/pages/PassengerHistory"));

/* ── Anunciante ── */
export const AdvertiserDashboard = lazy(() => import("@/pages/advertiser/AdvertiserDashboard"));
export const MerchantMyStorePage = lazy(() => import("@/pages/merchant/MerchantMyStorePage"));
export const AdvertiserListingsPage = lazy(() => import("@/pages/advertiser/AdvertiserListingsPage"));
export const AdvertiserNewListingPage = lazy(() => import("@/pages/advertiser/AdvertiserNewListingPage"));
export const AdvertiserAccountPage = lazy(() => import("@/pages/advertiser/AdvertiserAccountPage"));
export const AdvertiserCreditsPage = lazy(() => import("@/pages/advertiser/AdvertiserCreditsPage"));
export const AdvertiserCheckoutPage = lazy(() => import("@/pages/advertiser/AdvertiserCheckoutPage"));
export const AdvertiserNewDelivery = lazy(() => import("@/pages/advertiser/AdvertiserNewDelivery"));
export const VehicleForm = lazy(() => import("@/pages/advertiser/VehicleForm"));
export const ProductForm = lazy(() => import("@/pages/advertiser/ProductForm"));
export const AdvertiserLeadsPage = lazy(() => import("@/pages/advertiser/AdvertiserLeadsPage"));
export const AdvertiserOffersPage = lazy(() => import("@/pages/advertiser/AdvertiserOffersPage"));
export const AdvertiserVisitsPage = lazy(() => import("@/pages/advertiser/AdvertiserVisitsPage"));
export const AdvertiserMessagesPage = lazy(() => import("@/pages/advertiser/AdvertiserMessagesPage"));
export const AdvertiserDeliveriesPage = lazy(() => import("@/pages/advertiser/AdvertiserDeliveriesPage"));
export const AdvertiserPromotionPage = lazy(() => import("@/pages/advertiser/AdvertiserPromotionPage"));
export const AdvertiserWalletPage = lazy(() => import("@/pages/advertiser/AdvertiserWalletPage"));
export const AdvertiserImoveisPage = lazy(() => import("@/pages/advertiser/AdvertiserImoveisPage"));
export const AdvertiserImoveisListingsPage = lazy(() => import("@/pages/advertiser/AdvertiserImoveisListingsPage"));
export const AdvertiserVeiculosPage = lazy(() => import("@/pages/advertiser/AdvertiserVeiculosPage"));
export const AdvertiserVeiculosListingsPage = lazy(() => import("@/pages/advertiser/AdvertiserVeiculosListingsPage"));
export const AdvertiserServicesPage = lazy(() => import("@/pages/advertiser/AdvertiserServicesPage"));
export const AdvertiserServicesListingsPage = lazy(() => import("@/pages/advertiser/AdvertiserServicesListingsPage"));
export const ServiceForm = lazy(() => import("@/pages/advertiser/ServiceForm"));
export const AdvertiserFretesPage = lazy(() => import("@/pages/advertiser/AdvertiserFretesPage"));
export const AdvertiserFretesListingsPage = lazy(() => import("@/pages/advertiser/AdvertiserFretesListingsPage"));
export const FreightForm = lazy(() => import("@/pages/advertiser/FreightForm"));
export const AdvertiserViagemPage = lazy(() => import("@/pages/advertiser/AdvertiserViagemPage"));
export const AdvertiserViagemListingsPage = lazy(() => import("@/pages/advertiser/AdvertiserViagemListingsPage"));
export const ViagemForm = lazy(() => import("@/pages/advertiser/ViagemForm"));
export const AdvertiserSupportPage = lazy(() => import("@/pages/advertiser/AdvertiserSupportPage"));

/* ── Loja Unificada ── */
export const MerchantDeliveryView = lazy(() => import("@/pages/merchant/MerchantDeliveryView"));
export const StoreMinhaLojaPage = lazy(() => import("@/pages/store/StoreMinhaLojaPage"));
export const StoreOrdersPage = lazy(() => import("@/pages/store/StoreOrdersPage"));

/* ── Imóveis ── */
export const LazyPropertyForm = lazy(() => import("@/pages/real-estate/PropertyForm"));
export const PublicRealEstateHome = lazy(() => import("@/pages/real-estate/PublicRealEstateHome"));
export const RealEstateDashboard = lazy(() => import("@/pages/real-estate/RealEstateDashboard"));
export const RealEstateDetailPage = lazy(() => import("@/pages/real-estate/RealEstateDetailPage"));

/* ── Admin ── */
export const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
export const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
export const AdminUserDetails = lazy(() => import("@/pages/admin/AdminUserDetails"));
export const AdminStats = lazy(() => import("@/pages/admin/AdminStats"));
export const AdminStores = lazy(() => import("@/pages/admin/AdminStores"));
export const AdminStoreDetail = lazy(() => import("@/pages/admin/AdminStoreDetail"));
export const AdminExpansao = lazy(() => import("@/pages/admin/AdminExpansao"));
export const AdminFinanceiro = lazy(() => import("@/pages/admin/AdminFinanceiro"));
export const AdminFinanceAdjustments = lazy(() => import("@/pages/admin/AdminFinanceAdjustments"));
export const AdminFinanceReports = lazy(() => import("@/pages/admin/AdminFinanceReports"));
export const AdminMotoboyPayments = lazy(() => import("@/pages/admin/AdminMotoboyPayments"));
export const AdminMerchantInvoices = lazy(() => import("@/pages/admin/AdminMerchantInvoices"));
export const AdminIncentives = lazy(() => import("@/pages/admin/AdminIncentives"));
export const AdminGroupFinder = lazy(() => import("@/pages/admin/AdminGroupFinder"));
export const AdminLegalDocuments = lazy(() => import("@/pages/admin/AdminLegalDocuments"));
export const AdminFooterContents = lazy(() => import("@/pages/admin/AdminFooterContents"));
export const AdminGroupSettings = lazy(() => import("@/pages/admin/AdminGroupSettings"));
export const AdminPosting = lazy(() => import("@/pages/admin/AdminPosting"));
export const AdminPostadorCentral = lazy(() => import("@/pages/admin/AdminPostadorCentral"));
export const AdminCampaignQueue = lazy(() => import("@/pages/admin/AdminCampaignQueue"));
export const AdminCampaignDispatchPanel = lazy(() => import("@/pages/admin/AdminCampaignDispatchPanel"));
export const AdminDashboardNacional = lazy(() => import("@/pages/admin/AdminDashboardNacional"));
export const AdminCoberturaNacional = lazy(() => import("@/pages/admin/AdminCoberturaNacional"));
export const AdminMarketplaceOverview = lazy(() => import("@/pages/admin/AdminMarketplaceOverview"));
export const AdminMarketplaceProducts = lazy(() => import("@/pages/admin/AdminMarketplaceProducts"));
export const AdminImageModeration = lazy(() => import("@/pages/admin/AdminImageModeration"));
export const AdminSupportTicketsPage = lazy(() => import("@/pages/admin/support/AdminSupportTicketsPage"));
export const AdminTicketDetailPage = lazy(() => import("@/pages/admin/support/AdminTicketDetailPage"));
export const AdminSupportStatsPage = lazy(() => import("@/pages/admin/support/AdminSupportStatsPage"));
export const AdminRegioesAtivas = lazy(() => import("@/pages/admin/AdminRegioesAtivas"));
export const AdminFilaExpansao = lazy(() => import("@/pages/admin/AdminFilaExpansao"));
export const AdminMetasRegionais = lazy(() => import("@/pages/admin/AdminMetasRegionais"));
export const AdminMotorTerritorial = lazy(() => import("@/pages/admin/AdminMotorTerritorial"));
export const AdminCentroCrescimento = lazy(() => import("@/pages/admin/AdminCentroCrescimento"));
export const AdminWarRoom = lazy(() => import("@/pages/admin/AdminWarRoom"));
export const AdminCreditsModule = lazy(() => import("@/pages/admin/AdminCreditsModule"));
export const AdminMultiPerfil = lazy(() => import("@/pages/admin/AdminMultiPerfil"));
export const AdminDashboardMultiPerfil = lazy(() => import("@/pages/admin/AdminDashboardMultiPerfil"));
export const AdminPayDashboard = lazy(() => import("@/pages/admin/AdminPayDashboard"));
export const AdminPayWallets = lazy(() => import("@/pages/admin/AdminPayWallets"));
export const AdminPayLedger = lazy(() => import("@/pages/admin/AdminPayLedger"));
export const AdminCourierWallets = lazy(() => import("@/pages/admin/AdminCourierWallets"));
export const PayAdminPremium = lazy(() => import("@/pages/admin/PayAdminPremium"));
export const AdminRealEstateOverview = lazy(() => import("@/pages/admin/AdminRealEstateOverview"));
export const AdminRealEstatePackages = lazy(() => import("@/pages/admin/AdminRealEstatePackages"));
export const AdminRealEstateModeration = lazy(() => import("@/pages/admin/AdminRealEstateModeration"));
export const AdminRealEstateImageModeration = lazy(() => import("@/pages/admin/AdminRealEstateImageModeration"));
export const AdminCreditGrants = lazy(() => import("@/pages/admin/AdminCreditGrants"));
export const AdminVehicleOverview = lazy(() => import("@/pages/admin/AdminVehicleOverview"));
export const AdminServiceOverview = lazy(() => import("@/pages/admin/AdminServiceOverview"));
export const AdminFreightOverview = lazy(() => import("@/pages/admin/AdminFreightOverview"));
export const AdminViagemOverview = lazy(() => import("@/pages/admin/AdminViagemOverview"));
export const AdminMarketplaceCommerce = lazy(() => import("@/pages/admin/AdminMarketplaceCommerce"));
export const AdminPromotionPackagesPage = lazy(() => import("@/pages/admin/AdminPromotionPackagesPage"));
export const MotoboyTestPanel = lazy(() => import("@/pages/admin/MotoboyTestPanel"));
export const DriverComissao = lazy(() => import("@/pages/driver/DriverComissao"));
export const PostadorHub = lazy(() => import("@/pages/PostadorHub"));
export const PostadorDashboard = lazy(() => import("@/pages/PostadorDashboard"));

/* ── Admin Marketing ── */
export const AdminMarketingPostagens = lazy(() => import("@/pages/admin/marketing/AdminMarketingPostagens"));
export const AdminMarketingBiblioteca = lazy(() => import("@/pages/admin/marketing/AdminMarketingBiblioteca"));
export const AdminMarketingControle = lazy(() => import("@/pages/admin/marketing/AdminMarketingControle"));
export const AdminMarketingHistorico = lazy(() => import("@/pages/admin/marketing/AdminMarketingHistorico"));
export const AdminMarketingImpacto = lazy(() => import("@/pages/admin/marketing/AdminMarketingImpacto"));
export const AdminMarketingFilaGrupos = lazy(() => import("@/pages/admin/marketing/AdminMarketingFilaGrupos"));
export const AdminMarketingRadar = lazy(() => import("@/pages/admin/marketing/AdminMarketingRadar"));

/* ── Suporte ao Cliente ── */
export const AdminAISupervisorPage = lazy(() => import("@/pages/admin/support/AdminAISupervisorPage"));
export const ClientSupportTicketsPage = lazy(() => import("@/pages/support/ClientSupportTicketsPage"));
export const ClientTicketConversationPage = lazy(() => import("@/pages/support/ClientTicketConversationPage"));

/* ── Central de Eventos (EDA) + Mapa Inteligente ── */
export const AdminRealtimeDashboard = lazy(() => import("@/pages/admin/AdminRealtimeDashboard"));
export const AdminMapDashboard      = lazy(() => import("@/pages/admin/AdminMapDashboard"));

/* ── Monitor de Divulgação (M49) ── */
export const AdvertiserPostingMonitorPage = lazy(() => import("@/pages/advertiser/AdvertiserPostingMonitorPage"));
export const AdminPostingQueuePage        = lazy(() => import("@/pages/admin/AdminPostingQueuePage"));

/* ── Comissão Inteligente (auditoria admin) ── */
export const AdminCommissionIntelligence = lazy(() => import("@/pages/admin/AdminCommissionIntelligence"));

/* ── RADAR IA (centro de inteligência de grupos) ── */
export const AdminRadarIA = lazy(() => import("@/pages/admin/AdminRadarIA"));
export const AdminGruposAprovados = lazy(() => import("@/pages/admin/AdminGruposAprovados"));

/* ── Moderação IA de Imagens do Marketplace ── */
export const AdminModeracaoIA = lazy(() => import("@/pages/admin/AdminModeracaoIA"));

/* ── Fila Inteligente de Divulgações (visão admin transparente) ── */
export const AdminFilaDivulgacoes = lazy(() => import("@/pages/admin/AdminFilaDivulgacoes"));
export const AdminOrion = lazy(() => import("@/pages/admin/AdminOrion"));
export const AdminOrionMobility = lazy(() => import("@/pages/admin/AdminOrionMobility"));
export const AdminOrionOS = lazy(() => import("@/pages/admin/AdminOrionOS"));
export const AdminOrionPublisher = lazy(() => import("@/pages/admin/AdminOrionPublisher"));
export const AdminRidv = lazy(() => import("@/pages/admin/AdminRidv"));
export const AdminOrionAi = lazy(() => import("@/pages/admin/AdminOrionAi"));
export const AdminOrionPackage = lazy(() => import("@/pages/admin/AdminOrionPackage"));
export const AdminOrionFinance = lazy(() => import("@/pages/admin/AdminOrionFinance"));
export const AdminOrionCampaign = lazy(() => import("@/pages/admin/AdminOrionCampaign"));
export const AdminOrionDispatcher = lazy(() => import("@/pages/admin/AdminOrionDispatcher"));
export const AdminOrionGrowth = lazy(() => import("@/pages/admin/AdminOrionGrowth"));
export const AdminOrionPerformance = lazy(() => import("@/pages/admin/AdminOrionPerformance"));
export const AdminOrionHealth = lazy(() => import("@/pages/admin/AdminOrionHealth"));
export const AdminOrionCommand = lazy(() => import("@/pages/admin/AdminOrionCommand"));
export const AdminOrionOperations = lazy(() => import("@/pages/admin/AdminOrionOperations"));
export const AdminOrionStrategy = lazy(() => import("@/pages/admin/AdminOrionStrategy"));
export const AdminOrionConversion = lazy(() => import("@/pages/admin/AdminOrionConversion"));
export const AdminOrionExecution = lazy(() => import("@/pages/admin/AdminOrionExecution"));
export const AdminOrionPricing = lazy(() => import("@/pages/admin/AdminOrionPricing"));
export const AdminOrionForecast = lazy(() => import("@/pages/admin/AdminOrionForecast"));

/* ── Auditoria de Categorias (segmentação por módulo) ── */
export const AdminAuditoriaCategorias = lazy(() => import("@/pages/admin/AdminAuditoriaCategorias"));

/* ── Análises Financeiras por Perfil Operacional ── */
export const AdminMotoboyFinanceiro = lazy(() => import("@/pages/admin/AdminMotoboyFinanceiro"));
export const AdminMotoTaxiFinanceiro = lazy(() => import("@/pages/admin/AdminMotoTaxiFinanceiro"));
export const AdminMotoristaFinanceiro = lazy(() => import("@/pages/admin/AdminMotoristaFinanceiro"));

