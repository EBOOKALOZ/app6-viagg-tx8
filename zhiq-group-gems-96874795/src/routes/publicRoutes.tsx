/**
 * publicRoutes — rotas públicas, autenticação, legal e páginas abertas.
 */
import { Suspense, lazy } from "react";
import { Route, Navigate } from "react-router-dom";

// Rota de diagnóstico do Payment Brick (teste técnico, sem link no app).
const TesteBrick = lazy(() => import("@/pages/dev/TesteBrick"));
// Painel do Comprador — Meus Lances (lazy local p/ não colidir com lazyPages)
const MeusLances = lazy(() => import("@/pages/public/MeusLances"));
// Painel "Meu Arremate" (FASE C — comunicação/confirmação P2P; serve comprador e vendedor)
const MeuArremate = lazy(() => import("@/pages/public/MeuArremate"));
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoadingTransition from "@/pages/LoadingTransition";
import PageFallback from "@/components/PageFallback";
import CheckoutReturnPage from "@/pages/public/CheckoutReturnPage";
import { GlobalSearchPage } from "@/pages/public/GlobalSearchPage";
import {
  InstitutionalLayout,
  LoadingScreenPremium,
  AdminEmergency,
  Auth,
  ResetPassword,
  UpdatePassword,
  AuthCallback,
  RedirectByProfile,
  SyncProfile,
  SelectProfile,
  CompleteProfile,
  MotoboyOnboarding,
  MerchantOnboarding,
  WelcomePage,
  PublicHome,
  AceitePage,
  ProductLandingPage,
  ProductRedirectPage,
  MercadoLocalViagg,
  RealEstateCheckoutPage,
  StorePublicPage,
  AuctionListPage,
  AuctionPublicPage,
  ArrematePublicPage,
  PublicRealEstateHome,
  RealEstateDetailPage,
  LazyPropertyForm,
  RealEstateDashboard,
  VehicleDetailPage,
  CampaignSharePage,
  TrackingRedirectPage,
  MinhasOfertas,
  Rates,
  LegalPage,
  ProductCheckoutPage,
  CheckoutCartaoPage,
  MyDigitalLibrary,
  DigitalDeliveryGateway,
  AllVehiclesPage,
  AllAuctionsPage,
  AuctionMarketDetailPage,
  PublicServicesHome,
  ServiceDetailPage,
  FretesInicio,
  PublicFreightHome,
  FreightDetailPage,
  ViagensInicio,
  PublicTravelHome,
  TravelDetailPage,
  TravelAccountPage,
  PublicMotoboyRequest,
  PublicRideTracking,
  MotoboyInicio,
  CorridasInicio,
  SolicitarCorrida,
  MinhaCarteira,
  MeusDados,
  ContaViajante,
} from "./lazyPages";

export const publicRoutes = (
  <>
    {/* ── Auth ── */}
    <Route path="/admin-emergencia" element={<AdminEmergency />} />
    <Route path="/auth" element={<Auth />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/update-password" element={<UpdatePassword />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/loading" element={<LoadingTransition />} />
    <Route path="/anunciante" element={<Navigate to="/anunciante/painel" replace />} />
    <Route path="/anunciante/anuncios" element={<Navigate to="/anunciante/meus-anuncios" replace />} />
    <Route path="/loading-premium" element={<LoadingScreenPremium />} />
    <Route path="/redirect-by-profile" element={<RedirectByProfile />} />
    <Route path="/sync-profile" element={<SyncProfile />} />
    <Route path="/select-profile" element={<SelectProfile />} />
    <Route path="/complete-profile" element={<CompleteProfile />} />
    <Route path="/complete-profile/:profile" element={<CompleteProfile />} />
    <Route path="/motoboy/completar" element={<MotoboyOnboarding />} />
    <Route path="/merchant/completar" element={<MerchantOnboarding />} />
    <Route path="/welcome" element={<WelcomePage />} />
    <Route path="/home" element={<PublicHome />} />
    <Route path="/aceite" element={<AceitePage />} />

    {/* ── Páginas públicas ── */}
    <Route path="/busca" element={<GlobalSearchPage />} />
    <Route path="/produto/:id" element={<Suspense fallback={<PageFallback />}><ProductLandingPage /></Suspense>} />
    <Route path="/p/:slug" element={<ProductRedirectPage />} />
    <Route path="/mercado" element={<MercadoLocalViagg />} />
    <Route path="/mercado/quero-vender" element={<Navigate to="/auth" replace />} />
    <Route path="/mercado/meus-anuncios" element={<ProtectedRoute><RealEstateDashboard /></ProtectedRoute>} />
    <Route path="/vender-imovel" element={<Navigate to="/auth" replace />} />
    <Route path="/real-estate/checkout/:listingId" element={<RealEstateCheckoutPage />} />
    <Route path="/loja/:storeId" element={<StorePublicPage />} />
    <Route path="/leiloes" element={<AuctionListPage />} />
    <Route path="/meus-lances" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><MeusLances /></Suspense></ProtectedRoute>} />
    <Route path="/leilao/:id" element={<AuctionPublicPage />} />
    <Route path="/arremate/:id" element={<ArrematePublicPage />} />
    <Route path="/meu-arremate/:id" element={<ProtectedRoute><Suspense fallback={<PageFallback />}><MeuArremate /></Suspense></ProtectedRoute>} />
    <Route path="/imoveis" element={<PublicRealEstateHome />} />
    <Route path="/imoveis/:id" element={<RealEstateDetailPage />} />
    <Route path="/imoveis/novo" element={<ProtectedRoute><LazyPropertyForm /></ProtectedRoute>} />
    <Route path="/imoveis/editar/:listingId" element={<ProtectedRoute><LazyPropertyForm /></ProtectedRoute>} />
    <Route path="/veiculos/:id" element={<VehicleDetailPage />} />
    <Route path="/automoveis" element={<AllVehiclesPage />} />
    <Route path="/servicos" element={<PublicServicesHome />} />
    <Route path="/servicos/:id" element={<ServiceDetailPage />} />
    <Route path="/fretes-inicio" element={<Suspense fallback={<PageFallback />}><FretesInicio /></Suspense>} />
    <Route path="/fretes" element={<Suspense fallback={<PageFallback />}><FretesInicio /></Suspense>} />
    <Route path="/fretes/anuncios" element={<PublicFreightHome />} />
    <Route path="/fretes/lista" element={<PublicFreightHome />} />
    <Route path="/fretes/:id" element={<FreightDetailPage />} />
    <Route path="/viagens-inicio" element={<Suspense fallback={<PageFallback />}><ViagensInicio /></Suspense>} />
    {/* /viagens = VITRINE de anúncios (padrão marketplace: ofertas primeiro).
        A antiga tela de seleção de modalidade continua em /viagens-inicio. */}
    <Route path="/viagens" element={<PublicTravelHome />} />
    <Route path="/viagens/anuncios" element={<PublicTravelHome />} />
    <Route path="/viagens/lista" element={<PublicTravelHome />} />
    <Route path="/viagens/:id" element={<TravelDetailPage />} />
    <Route path="/viagens/minha-conta" element={<ProtectedRoute><TravelAccountPage /></ProtectedRoute>} />

    {/* ── Módulo Motoboy Público (sem auth) ── */}
    <Route path="/motoboy-inicio" element={<Suspense fallback={<PageFallback />}><MotoboyInicio /></Suspense>} />
    <Route path="/corridas-inicio" element={<Suspense fallback={<PageFallback />}><CorridasInicio /></Suspense>} />
    <Route path="/corridas"        element={<Suspense fallback={<PageFallback />}><CorridasInicio /></Suspense>} />
    <Route path="/solicitar-corrida" element={<Suspense fallback={<PageFallback />}><SolicitarCorrida /></Suspense>} />
    <Route path="/minha-carteira" element={<Suspense fallback={<PageFallback />}><MinhaCarteira /></Suspense>} />
    <Route path="/meus-dados" element={<Suspense fallback={<PageFallback />}><MeusDados /></Suspense>} />
    <Route path="/conta" element={<Suspense fallback={<PageFallback />}><ContaViajante /></Suspense>} />
    <Route path="/teste-brick" element={<Suspense fallback={<PageFallback />}><TesteBrick /></Suspense>} />
    {/* Duplicata unificada: /chamar-motoboy reusa o MAPA OFICIAL (não duplicar). */}
    <Route path="/chamar-motoboy" element={<Navigate to="/solicitar-corrida?service=motoboy" replace />} />
    <Route path="/corrida/:trackingCode" element={<Suspense fallback={<PageFallback />}><PublicRideTracking /></Suspense>} />
    <Route path="/mercado/leiloes" element={<AllAuctionsPage />} />
    <Route path="/mercado/leiloes/:id" element={<AuctionMarketDetailPage />} />
    <Route path="/divulgar/:campaignId" element={<CampaignSharePage />} />
    <Route path="/c/:token" element={<TrackingRedirectPage />} />
    <Route path="/minhas-ofertas" element={<ProtectedRoute><MinhasOfertas /></ProtectedRoute>} />
    <Route path="/rates" element={<Rates />} />

    {/* ── Páginas de produto/biblioteca (public) ── */}
    {/* NOTA: /produto/:id (ProductLandingPage) é declarado acima e vence a rota;
        a antiga /produto/:productId (ProductPublicPage) colidia e nunca era alcançada
        → removida (o link real dos anúncios aponta p/ ProductLandingPage). */}
    <Route path="/checkout/produto/:productId" element={<Suspense fallback={<PageFallback />}><ProductCheckoutPage /></Suspense>} />
    <Route path="/pagamento/cartao" element={<Suspense fallback={<PageFallback />}><CheckoutCartaoPage /></Suspense>} />
    <Route path="/checkout/retorno" element={<CheckoutReturnPage />} />
    <Route path="/minha-biblioteca" element={<Suspense fallback={<PageFallback />}><MyDigitalLibrary /></Suspense>} />
    <Route path="/entrega/digital/:itemId" element={<Suspense fallback={<PageFallback />}><DigitalDeliveryGateway /></Suspense>} />

    {/* ── Legal / Institucional ── */}
    <Route element={<InstitutionalLayout />}>
      <Route path="/legal/:type" element={<LegalPage />} />
      <Route path="/terms" element={<LegalPage />} />
      <Route path="/privacidade" element={<LegalPage />} />
    </Route>
  </>
);
