/**
 * advertiserRoutes — rotas do painel anunciante.
 */
import { Suspense } from "react";
import { Route, Outlet } from "react-router-dom";
import { AdvertiserPanelLayout } from "@/components/advertiser/AdvertiserPanelLayout";
import { AdvertiserProtectedRoute } from "@/components/advertiser/AdvertiserProtectedRoute";
import PageFallback from "@/components/PageFallback";
import {
  AdvertiserDashboard,
  MerchantMyStorePage,
  AdvertiserListingsPage,
  MerchantAuctions,
  MerchantArremate,
  MerchantConversions,
  AdvertiserNewListingPage,
  LazyPropertyForm,
  VehicleForm,
  ProductForm,
  AdvertiserAccountPage,
  AdvertiserCreditsPage,
  AdvertiserNewDelivery,
  AdvertiserDeliveriesPage,
  MerchantDeliveryView,
  AdvertiserCheckoutPage,
  AdvertiserLeadsPage,
  AdvertiserOffersPage,
  AdvertiserVisitsPage,
  AdvertiserMessagesPage,
  AdvertiserPromotionPage,
  AdvertiserWalletPage,
  StoreOrdersPage,
} from "./lazyPages";

export const advertiserRoutes = (
  <Route element={<AdvertiserProtectedRoute><AdvertiserPanelLayout><Outlet /></AdvertiserPanelLayout></AdvertiserProtectedRoute>}>
    <Route path="/anunciante/painel"          element={<Suspense fallback={<PageFallback />}><AdvertiserDashboard /></Suspense>} />
    <Route path="/anunciante/minha-loja"      element={<Suspense fallback={<PageFallback />}><MerchantMyStorePage /></Suspense>} />
    <Route path="/anunciante/meus-anuncios"   element={<Suspense fallback={<PageFallback />}><AdvertiserListingsPage /></Suspense>} />
    <Route path="/anunciante/leiloes"         element={<MerchantAuctions />} />
    <Route path="/anunciante/arremates"       element={<MerchantArremate />} />
    <Route path="/anunciante/conversoes"      element={<MerchantConversions />} />
    <Route path="/anunciante/anuncios/novo"   element={<Suspense fallback={<PageFallback />}><AdvertiserNewListingPage /></Suspense>} />
    <Route path="/anunciante/anuncios/novo/imovel"  element={<Suspense fallback={<PageFallback />}><LazyPropertyForm /></Suspense>} />
    <Route path="/anunciante/anuncios/novo/veiculo" element={<Suspense fallback={<PageFallback />}><VehicleForm /></Suspense>} />
    <Route path="/anunciante/anuncios/novo/produto" element={<Suspense fallback={<PageFallback />}><ProductForm /></Suspense>} />
    <Route path="/anunciante/anuncios/editar/imovel/:listingId"  element={<Suspense fallback={<PageFallback />}><LazyPropertyForm /></Suspense>} />
    <Route path="/anunciante/anuncios/editar/veiculo/:listingId" element={<Suspense fallback={<PageFallback />}><VehicleForm /></Suspense>} />
    <Route path="/anunciante/anuncios/editar/produto/:listingId" element={<Suspense fallback={<PageFallback />}><ProductForm /></Suspense>} />
    <Route path="/anunciante/conta"           element={<Suspense fallback={<PageFallback />}><AdvertiserAccountPage /></Suspense>} />
    <Route path="/anunciante/creditos"        element={<Suspense fallback={<PageFallback />}><AdvertiserCreditsPage /></Suspense>} />
    <Route path="/anunciante/entrega/nova"    element={<Suspense fallback={<PageFallback />}><AdvertiserNewDelivery /></Suspense>} />
    <Route path="/anunciante/entregas"        element={<Suspense fallback={<PageFallback />}><AdvertiserDeliveriesPage /></Suspense>} />
    <Route path="/anunciante/entregas/nova"   element={<Suspense fallback={<PageFallback />}><AdvertiserNewDelivery /></Suspense>} />
    <Route path="/anunciante/entregas/:orderId" element={<Suspense fallback={<PageFallback />}><MerchantDeliveryView /></Suspense>} />
    <Route path="/anunciante/checkout/:listingId" element={<Suspense fallback={<PageFallback />}><AdvertiserCheckoutPage /></Suspense>} />
    <Route path="/anunciante/mensagens"       element={<Suspense fallback={<PageFallback />}><AdvertiserMessagesPage /></Suspense>} />
    <Route path="/anunciante/mensagens/legado" element={<Suspense fallback={<PageFallback />}><AdvertiserLeadsPage /></Suspense>} />
    <Route path="/anunciante/ofertas-recebidas" element={<Suspense fallback={<PageFallback />}><AdvertiserOffersPage /></Suspense>} />
    <Route path="/anunciante/pedidos"          element={<Suspense fallback={<PageFallback />}><StoreOrdersPage /></Suspense>} />
    <Route path="/anunciante/visitas"          element={<Suspense fallback={<PageFallback />}><AdvertiserVisitsPage /></Suspense>} />
    <Route path="/anunciante/divulgar-gratis" element={<Suspense fallback={<PageFallback />}><AdvertiserPromotionPage /></Suspense>} />
    <Route path="/anunciante/carteira"        element={<Suspense fallback={<PageFallback />}><AdvertiserWalletPage /></Suspense>} />
  </Route>
);
