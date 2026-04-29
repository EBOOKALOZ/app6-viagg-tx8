import DeliveryOfferCard from '@/components/motoboy/DeliveryOfferCard';
import type { DeliveryOffer } from '@/components/motoboy/DeliveryOfferCard';

/** DEV-ONLY: Preview page to visualize the DeliveryOfferCard */
const mockOffer: DeliveryOffer = {
  id: 'preview-001',
  regiao: 'Centro - Zona Sul',
  distancia_km: 4.2,
  tempo_estimado_min: 12,
  valor: 18.50,
  comissao_percent: 25,
  grupos_ativos: 1,
  loja_nome: 'Padaria Estrela',
  loja_categoria: 'Alimentação',
  loja_endereco: 'Rua das Flores, 123',
  loja_bairro: 'Centro',
  loja_cidade: 'Curitiba',
  loja_estado: 'PR',
  loja_telefone: '(41) 99999-0000',
  distancia_ate_loja_km: 1.3,
  distancia_loja_cliente_km: 2.9,
  timer_seconds: 60,
  pickup_lat: -25.4284,
  pickup_lng: -49.2733,
  dropoff_lat: -25.4350,
  dropoff_lng: -49.2700,
};

export default function MotoboyOfferPreview() {
  return (
    <DeliveryOfferCard
      offer={mockOffer}
      onAccept={(id) => alert(`Aceito: ${id}`)}
      onDismiss={(id) => alert(`Ignorado: ${id}`)}
    />
  );
}
