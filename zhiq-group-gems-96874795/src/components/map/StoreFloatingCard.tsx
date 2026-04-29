import React from 'react';
import './StoreFloatingCard.css';

interface StoreData {
    name: string;
    logo_url: string;
    distance_km: number;
    eta_min: number;
}

interface StoreFloatingCardProps {
    store?: StoreData | null;
}

export function StoreFloatingCard({ store }: StoreFloatingCardProps) {
    if (!store) return null;

    return (
        <div className="store-floating-card">
            <img
                src={store.logo_url}
                className="store-logo"
                alt={store.name}
            />
            <div className="store-info">
                <div className="store-name">
                    {store.name}
                </div>
                <div className="store-meta">
                    {store.distance_km} km • {store.eta_min} min
                </div>
                <div className="delivery-badge">
                    Entrega ativa
                </div>
            </div>
        </div>
    );
}
