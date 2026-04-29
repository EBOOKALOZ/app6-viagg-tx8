import { MerchantDeliveryHistory as DeliveryHistoryComponent } from '@/components/delivery/MerchantDeliveryHistory';
import { MerchantRecentEvents } from '@/components/merchant/MerchantRecentEvents';

/**
 * Página de histórico de entregas do comerciante
 * Usada dentro do MerchantLayout via Outlet
 */
export default function MerchantHistoryContent() {
  return (
    <div className="p-4 lg:px-10 xl:px-16 lg:py-8">
      <MerchantRecentEvents module="delivery" />
      <DeliveryHistoryComponent />
    </div>
  );
}
