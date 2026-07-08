// ── VIAGG-TX8™ — Mapa Inteligente — tipos ────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapAddress {
  street?:      string;
  number?:      string;
  neighborhood?: string;
  city?:        string;
  state?:       string;
  zipCode?:     string;
  country?:     string;
  formattedAddress: string;
  latLng:       LatLng;
}

export type RouteType =
  | "fastest"
  | "cheapest"
  | "safest"
  | "panoramic"
  | "no_toll"
  | "less_traffic"
  | "moto"
  | "car"
  | "delivery";

export interface RouteOption {
  type:          RouteType;
  label:         string;
  distanceKm:    number;
  durationMin:   number;
  tollCost:      number;
  trafficLevel:  "free" | "moderate" | "heavy";
  waypoints:     LatLng[];
  color:         string;
}

export interface PricePrediction {
  min:           number;
  avg:           number;
  max:           number;
  isDynamic:     boolean;
  surgeMultiplier: number;
  discount?:     number;
  cashback?:     number;
  estimatedKm:   number;
  estimatedMin:  number;
}

export interface DriverMarker {
  id:            string;
  name:          string;
  type:          "mototaxi" | "motoboy" | "motorista" | "taxi";
  latLng:        LatLng;
  heading:       number;         // direção em graus
  rating:        number;
  trips:         number;
  distanceKm:    number;
  etaMin:        number;
  vehicle:       string;
  plate:         string;
  avatarUrl?:    string;
  isOnline:      boolean;
  /** Status de presença ao vivo (professional_presence). Default implícito: 'online'. */
  status?:       "online" | "in_delivery" | "offline";
}

export interface HeatmapPoint {
  latLng: LatLng;
  weight: number;
}

export type MapProvider = "leaflet" | "mapbox" | "google" | "here";

export interface AIMapInsight {
  type:     "demand_spike" | "supply_shortage" | "event" | "recommendation";
  message:  string;
  severity: "info" | "warning" | "alert";
  latLng?:  LatLng;
  area?:    string;
}
