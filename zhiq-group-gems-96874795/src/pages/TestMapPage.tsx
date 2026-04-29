import { SimpleMap } from '@/components/map/SimpleMap';
import type { MapMarker } from '@/components/map/SimpleMap';

/**
 * Página de teste pública para verificar se a polyline do mapa funciona.
 * Acesse: /test-map
 * REMOVER após testes confirmarem que funciona.
 */
export default function TestMapPage() {
  // Coordenadas fixas: Blumenau (loja) → Gaspar (cliente)
  const markers: MapMarker[] = [
    {
      id: 'origin',
      lat: -26.9194,
      lng: -49.0661,
      type: 'origin',
      label: 'Loja - Blumenau',
    },
    {
      id: 'destination',
      lat: -26.9314,
      lng: -49.1156,
      type: 'destination',
      label: 'Cliente - Gaspar',
    },
  ];

  const polyline: [number, number][] = [
    [-26.9194, -49.0661],
    [-26.9314, -49.1156],
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 9999, background: 'lime', color: 'black', padding: '8px 16px', fontWeight: 'bold', borderRadius: 8 }}>
        TESTE DE MAPA - Rota Blumenau → Gaspar
      </div>
      <SimpleMap
        markers={markers}
        showRoute={true}
        useRealRoute={false}
        preCalculatedPolyline={polyline}
        className="w-full h-full"
      />
    </div>
  );
}
