/**
 * merchantRoutes — rotas do painel lojista e loja unificada premium.
 */
import { Suspense } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StoreAppLayout } from "@/components/store/StoreAppLayout";
import PageFallback from "@/components/PageFallback";
import {
  MerchantLayout,
  MerchantDashboardPage,
  MerchantHistoryContent,
  MerchantBillingContent,
  MerchantSettingsContent,
  MerchantProfileContent,
  CreateDelivery,
  LojistaAguardando,
  MerchantCampaigns,
  MerchantM1Panel,
  MerchantPaymentSettings,
  MerchantCredits,
  MerchantPayPremium,
  LazyPropertyForm,
  MerchantDeliveryView,
  StoreMinhaLojaPage,
  StoreOrdersPage,
  MerchantMessagesPage,
} from "./lazyPages";

export const merchantRoutes = (
  <>
    {/* Redirecionamentos merchant → anunciante */}
    <Route path="/merchant" element={<Navigate to="/anunciante/painel" replace />} />
    <Route path="/merchant/leiloes" element={<Navigate to="/anunciante/leiloes" replace />} />
    <Route path="/merchant/arremates" element={<Navigate to="/anunciante/arremates" replace />} />
    <Route path="/merchant/conversoes" element={<Navigate to="/anunciante/conversoes" replace />} />

    {/* Painel do lojista */}
    <Route element={<ProtectedRoute requiredProfile="merchant"><MerchantLayout /></ProtectedRoute>}>
      <Route path="/merchant/dashboard" element={<MerchantDashboardPage />} />
      <Route path="/merchant/mensagens" element={<MerchantMessagesPage />} />
      <Route path="/merchant/history" element={<MerchantHistoryContent />} />
      <Route path="/merchant/billing" element={<MerchantBillingContent />} />
      <Route path="/merchant/settings" element={<MerchantSettingsContent />} />
      <Route path="/merchant/profile" element={<MerchantProfileContent />} />
      <Route path="/merchant/create-delivery" element={<CreateDelivery />} />
      <Route path="/merchant/entrega/:orderId" element={<MerchantDeliveryView />} />
      <Route path="/merchant/campanhas" element={<MerchantCampaigns />} />
      <Route path="/merchant/m1" element={<MerchantM1Panel />} />
      <Route path="/merchant/pedidos" element={<Navigate to="/loja/pedidos" replace />} />
      <Route path="/merchant/pagamentos" element={<MerchantPaymentSettings />} />
      <Route path="/merchant/creditos" element={<MerchantCredits />} />
      <Route path="/merchant/financeiro" element={<MerchantPayPremium />} />
      <Route path="/merchant/imoveis/novo" element={<LazyPropertyForm />} />
      <Route path="/lojista/aguardando" element={<LojistaAguardando />} />
    </Route>

    {/* Loja Unificada (Premium) */}
    <Route element={<StoreAppLayout />}>
      <Route path="/loja/minha-loja" element={<Suspense fallback={<PageFallback />}><StoreMinhaLojaPage /></Suspense>} />
      <Route path="/loja/pedidos" element={<Suspense fallback={<PageFallback />}><StoreOrdersPage /></Suspense>} />
    </Route>
  </>
);
