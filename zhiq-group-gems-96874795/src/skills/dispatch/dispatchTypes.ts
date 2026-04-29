export type ServiceType = 'delivery' | 'ride' | 'mototaxi' | 'freight';

export interface DispatchRequest {
    id: string; // The order or ride ID
    service_type: ServiceType;
    pickup_lat: number;
    pickup_lng: number;
    dest_lat: number;
    dest_lng: number;
    price: number;
}

export interface ProfessionalLocation {
    id: string; // the location record id
    professional_id: string; // the actual motoboy/driver id
    lat: number;
    lng: number;
    status: string;
}

export interface RankedProfessional extends ProfessionalLocation {
    distance: number;
    duration: number;
}
