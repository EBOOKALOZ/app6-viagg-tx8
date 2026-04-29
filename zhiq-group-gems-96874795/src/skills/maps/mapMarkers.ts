import mapboxgl from "mapbox-gl";
import { PremiumMapMarker } from "@/components/map/MapboxPremiumMap";

/**
 * Cria ou injeta um elemento customizado para a Loja com imagem HTML (Uber/Ifood style)
 */
export function createStoreMarkerEl(slogan?: string, markerData?: PremiumMapMarker): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mapbox-premium-marker store-marker';

  const logoUrl = markerData?.logo_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=50&q=80';
  const name = markerData?.label || 'Loja';

  el.innerHTML = ``;
  el.style.cssText = 'width: 0px; height: 0px; opacity: 0; pointer-events: none;';
  return el;
}

/**
 * Elemento Animado do Motoboy
 */
export function createMotoboyMarkerEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mapbox-premium-marker motoboy-marker';
  el.innerHTML = `
    <div class="premium-marker-shadow motoboy-shadow"></div>
    <div class="motoboy-ring"></div>
    <div style="
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(145deg, #fb923c, #ea580c);
      border: 3px solid rgba(255,255,255,0.95);
      box-shadow: 0 0 0 5px rgba(249,115,22,0.2), 0 8px 28px rgba(249,115,22,0.45), inset 0 1px 0 rgba(255,255,255,0.3);
      display: flex; align-items: center; justify-content: center;
      animation: motoboy-pulse 2.5s cubic-bezier(.4,0,.6,1) infinite;
      position: relative; z-index: 2;
    ">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="15" cy="5" r="1"/>
        <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
      </svg>
    </div>
  `;
  el.style.cssText = 'display: flex; flex-direction: column; align-items: center; cursor: pointer; position: relative;';
  return el;
}

/**
 * Elemento Verde do Cliente (Destino)
 */
export function createCustomerMarkerEl(draggable = false): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mapbox-premium-marker customer-marker';
  el.innerHTML = `
    <div style="
      width: 18px; height: 18px; border-radius: 50%;
      background: #2ecc71;
      border: 3px solid #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: ${draggable ? 'grab' : 'pointer'};
      transition: transform 0.2s ease;
    "></div>
  `;
  el.style.cssText = 'display: flex; align-items: center; justify-content: center;';
  el.onmouseenter = () => { const inner = el.children[0] as HTMLElement; if (inner) inner.style.transform = 'scale(1.2)'; };
  el.onmouseleave = () => { const inner = el.children[0] as HTMLElement; if (inner) inner.style.transform = 'scale(1)'; };
  return el;
}

export function createMarkerElement(markerData: PremiumMapMarker): HTMLElement {
  switch (markerData.type) {
    case 'store':
    case 'origin':
      return createStoreMarkerEl(markerData.slogan, markerData);
    case 'motoboy':
      return createMotoboyMarkerEl();
    case 'customer':
    case 'destination':
      return createCustomerMarkerEl(markerData.draggable);
    default:
      return createCustomerMarkerEl(markerData.draggable);
  }
}
