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
  AdvertiserImoveisPage,
  AdvertiserImoveisListingsPage,
  AdvertiserVeiculosPage,
  AdvertiserVeiculosListingsPage,
  AdvertiserServicesPage,
  AdvertiserServicesListingsPage,
  ServiceForm,
  AdvertiserSupportPage,
} from "./lazyPages";

export const advertiserRoutes = (
  <Route element={<AdvertiserProtectedRoute><AdvertiserPanelLayout><Outlet /></AdvertiserPanelLayout></AdvertiserProtectedRoute>}>
    <Route path="/anunciante/painel"          element={<Suspense fallback={<PageFallback />}><AdvertiserDashboard /></Suspense>} />
    <Route path="/anunciante/imoveis"         element={<Suspense fallback={<PageFallback />}><AdvertiserImoveisPage /></Suspense>} />
    {/* Sub-rotas do painel de IMÓVEIS (menu enxuto) — reusam as páginas do anunciante */}
    <Route path="/anunciante/imoveis/meus-anuncios"   element={<Suspense fallback={<PageFallback />}><AdvertiserImoveisListingsPage /></Suspense>} />
    <Route path="/anunciante/imoveis/divulgar-gratis" element={<Suspense fallback={<PageFallback />}><AdvertiserPromotionPage /></Suspense>} />
    <Route path="/anunciante/imoveis/mensagens"       element={<Suspense fallback={<PageFallback />}><AdvertiserMessagesPage /></Suspense>} />
    <Route path="/anunciante/imoveis/visitas"         element={<Suspense fallback={<PageFallback />}><AdvertiserVisitsPage /></Suspense>} />
    <Route path="/anunciante/imoveis/creditos"        element={<Suspense fallback={<PageFallback />}><AdvertiserCreditsPage /></Suspense>} />
    <Route path="/anunciante/imoveis/suporte"         element={<Suspense fallback={<PageFallback />}><AdvertiserSupportPage /></Suspense>} />
    {/* Form de imóvel SOB o prefixo /imoveis → mantém o menu lateral de imóveis */}
    <Route path="/anunciante/imoveis/anuncios/novo/imovel"             element={<Suspense fallback={<PageFallback />}><LazyPropertyForm /></Suspense>} />
    <Route path="/anunciante/imoveis/anuncios/editar/imovel/:listingId" element={<Suspense fallback={<PageFallback />}><LazyPropertyForm /></Suspense>} />
    {/* Sub-rotas do painel de VEÍCULOS (menu enxuto) — espelham o de imóveis */}
    <Route path="/anunciante/veiculos"         element={<Suspense fallback={<PageFallback />}><AdvertiserVeiculosPage /></Suspense>} />
    <Route path="/anunciante/veiculos/meus-anuncios"   element={<Suspense fallback={<PageFallback />}><AdvertiserVeiculosListingsPage /></Suspense>} />
    <Route path="/anunciante/veiculos/divulgar-gratis" element={<Suspense fallback={<PageFallback />}><AdvertiserPromotionPage /></Suspense>} />
    <Route path="/anunciante/veiculos/mensagens"       element={<Suspense fallback={<PageFallback />}><AdvertiserMessagesPage /></Suspense>} />
    <Route path="/anunciante/veiculos/creditos"        element={<Suspense fallback={<PageFallback />}><AdvertiserCreditsPage /></Suspense>} />
    <Route path="/anunciante/veiculos/suporte"         element={<Suspense fallback={<PageFallback />}><AdvertiserSupportPage /></Suspense>} />
    {/* Form de veículo SOB o prefixo /veiculos → mantém o menu lateral de veículos */}
    <Route path="/anunciante/veiculos/anuncios/novo/veiculo"             element={<Suspense fallback={<PageFallback />}><VehicleForm /></Suspense>} />
    <Route path="/anunciante/veiculos/anuncios/editar/veiculo/:listingId" element={<Suspense fallback={<PageFallback />}><VehicleForm /></Suspense>} />
    {/* Sub-rotas do painel de SERVIÇOS (menu enxuto) — espelham o de veículos */}
    <Route path="/anunciante/servicos"         element={<Suspense fallback={<PageFallback />}><AdvertiserServicesPage /></Suspense>} />
    <Route path="/anunciante/servicos/meus-anuncios"   element={<Suspense fallback={<PageFallback />}><AdvertiserServicesListingsPage /></Suspense>} />
    <Route path="/anunciante/servicos/divulgar-gratis" element={<Suspense fallback={<PageFallback />}><AdvertiserPromotionPage /></Suspense>} />
    <Route path="/anunciante/servicos/mensagens"       element={<Suspense fallback={<PageFallback />}><AdvertiserMessagesPage /></Suspense>} />
    <Route path="/anunciante/servicos/creditos"        element={<Suspense fallback={<PageFallback />}><AdvertiserCreditsPage /></Suspense>} />
    <Route path="/anunciante/servicos/suporte"         element={<Suspense fallback={<PageFallback />}><AdvertiserSupportPage /></Suspense>} />
    <Route path="/anunciante/servicos/anuncios/novo/servico"             element={<Suspense fallback={<PageFallback />}><ServiceForm /></Suspense>} />
    <Route path="/anunciante/servicos/anuncios/editar/servico/:listingId" element={<Suspense fallback={<PageFallback />}><ServiceForm /></Suspense>} />
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
    <Route path="/anunciante/suporte"        element={<Suspense fallback={<PageFallback />}><AdvertiserSupportPage /></Suspense>} />
  </Route>
);
