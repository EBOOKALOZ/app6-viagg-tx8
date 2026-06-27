/**
 * publicRoutes — rotas públicas, autenticação, legal e páginas abertas.
 */
import { Suspense } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoadingTransition from "@/pages/LoadingTransition";
import PageFallback from "@/components/PageFallback";
import CheckoutReturnPage from "@/pages/public/CheckoutReturnPage";
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
  ProductPublicPage,
  ProductCheckoutPage,
  CheckoutCartaoPage,
  MyDigitalLibrary,
  DigitalDeliveryGateway,
  AllVehiclesPage,
  AllAuctionsPage,
  AuctionMarketDetailPage,
  PublicServicesHome,
  ServiceDetailPage,
  PublicFreightHome,
  FreightDetailPage,
  PublicTravelHome,
  TravelDetailPage,
  TravelAccountPage,
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
    <Route path="/produto/:id" element={<ProductLandingPage />} />
    <Route path="/p/:slug" element={<ProductRedirectPage />} />
    <Route path="/mercado" element={<MercadoLocalViagg />} />
    <Route path="/mercado/quero-vender" element={<Navigate to="/auth" replace />} />
    <Route path="/mercado/meus-anuncios" element={<ProtectedRoute><RealEstateDashboard /></ProtectedRoute>} />
    <Route path="/vender-imovel" element={<Navigate to="/auth" replace />} />
    <Route path="/real-estate/checkout/:listingId" element={<RealEstateCheckoutPage />} />
    <Route path="/loja/:storeId" element={<StorePublicPage />} />
    <Route path="/leiloes" element={<AuctionListPage />} />
    <Route path="/leilao/:id" element={<AuctionPublicPage />} />
    <Route path="/arremate/:id" element={<ArrematePublicPage />} />
    <Route path="/imoveis" element={<PublicRealEstateHome />} />
    <Route path="/imoveis/:id" element={<RealEstateDetailPage />} />
    <Route path="/imoveis/novo" element={<ProtectedRoute><LazyPropertyForm /></ProtectedRoute>} />
    <Route path="/imoveis/editar/:listingId" element={<ProtectedRoute><LazyPropertyForm /></ProtectedRoute>} />
    <Route path="/veiculos/:id" element={<VehicleDetailPage />} />
    <Route path="/automoveis" element={<AllVehiclesPage />} />
    <Route path="/servicos" element={<PublicServicesHome />} />
    <Route path="/servicos/:id" element={<ServiceDetailPage />} />
    <Route path="/fretes" element={<PublicFreightHome />} />
    <Route path="/fretes/:id" element={<FreightDetailPage />} />
    <Route path="/viagens" element={<PublicTravelHome />} />
    <Route path="/viagens/:id" element={<TravelDetailPage />} />
    <Route path="/viagens/minha-conta" element={<ProtectedRoute><TravelAccountPage /></ProtectedRoute>} />
    <Route path="/mercado/leiloes" element={<AllAuctionsPage />} />
    <Route path="/mercado/leiloes/:id" element={<AuctionMarketDetailPage />} />
    <Route path="/divulgar/:campaignId" element={<CampaignSharePage />} />
    <Route path="/c/:token" element={<TrackingRedirectPage />} />
    <Route path="/minhas-ofertas" element={<ProtectedRoute><MinhasOfertas /></ProtectedRoute>} />
    <Route path="/rates" element={<Rates />} />

    {/* ── Páginas de produto/biblioteca (public) ── */}
    <Route path="/produto/:productId" element={<Suspense fallback={<PageFallback />}><ProductPublicPage /></Suspense>} />
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
