import React, { useState, useEffect } from 'react';
import { useMerchantDispatch } from '@/hooks/useMerchantDispatch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, Send, Bike, CheckCircle, XCircle, Truck, Zap, Map as MapIcon, Clock, Wallet, MapPin, Package, Key } from 'lucide-react';
import { MapboxPremiumMap, PremiumMapMarker } from '@/components/map/MapboxPremiumMap';
import { calculateRoute } from '@/skills/maps/routeService';
import { supabase } from '@/integrations/supabase/client';

interface MerchantDispatchPanelProps {
    storeProfile: {
        nome: string;
        bairro: string;
        cidade: string;
        estado: string;
        latitude: number | null;
        longitude: number | null;
        region_id: string | null;
        city_id: string | null;
    } | null;
    merchantId: string;
}

export function MerchantDispatchPanel({ storeProfile, merchantId }: MerchantDispatchPanelProps) {
    const {
        activeOrderId,
        activeOrder,
        offers,
        loading,
        error,
        previewRouteAndPrice,
        createAndDispatchOrder,
        forceDispatchCycle,
    } = useMerchantDispatch();

    // Campos de Destino
    const [destLat, setDestLat] = useState<string>('');
    const [destLng, setDestLng] = useState<string>('');
    const [serviceLevel, setServiceLevel] = useState<'standard' | 'express'>('standard');

    // Preview State
    const [previewStandard, setPreviewStandard] = useState<any>(null);
    const [previewExpress, setPreviewExpress] = useState<any>(null);
    const [previewMapboxRoute, setPreviewMapboxRoute] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPreview = async () => {
            if (!storeProfile?.latitude || !storeProfile?.longitude) return;
            const dLat = parseFloat(destLat);
            const dLng = parseFloat(destLng);
            if (isNaN(dLat) || isNaN(dLng)) {
                setPreviewStandard(null);
                setPreviewExpress(null);
                setPreviewError(null);
                return;
            }

            setPreviewLoading(true);
            setPreviewError(null);
            try {
                // Fetch both Standard and Express previews in parallel + Mapbox Driving Route for UI
                const [standardData, expressData, mapboxRoute] = await Promise.all([
                    previewRouteAndPrice(storeProfile.latitude, storeProfile.longitude, dLat, dLng, 'standard'),
                    previewRouteAndPrice(storeProfile.latitude, storeProfile.longitude, dLat, dLng, 'express'),
                    calculateRoute(
                        { lat: storeProfile.latitude, lng: storeProfile.longitude },
                        { lat: dLat, lng: dLng }
                    )
                ]);

                setPreviewStandard(standardData);
                setPreviewExpress(expressData);
                setPreviewMapboxRoute(mapboxRoute);
            } catch (err: any) {
                setPreviewError(err.message || 'Erro ao calcular estimativa.');
                setPreviewStandard(null);
                setPreviewExpress(null);
                setPreviewMapboxRoute(null);
            } finally {
                setPreviewLoading(false);
            }
        };

        const timer = setTimeout(() => {
            fetchPreview();
        }, 800);

        return () => clearTimeout(timer);
    }, [destLat, destLng, storeProfile?.latitude, storeProfile?.longitude, previewRouteAndPrice]);

    const handleDispatch = async () => {
        if (!storeProfile?.region_id || (!storeProfile?.city_id && !storeProfile?.region_id)) {
            alert("Sua loja precisa de Region ID e City ID configurados para solicitar entregas inteligentes.");
            return;
        }
        if (!storeProfile?.latitude || !storeProfile?.longitude) {
            alert("A localização da Loja (Latitude/Longitude) não está configurada no Perfil.");
            return;
        }
        const dLat = parseFloat(destLat);
        const dLng = parseFloat(destLng);

        if (isNaN(dLat) || isNaN(dLng)) {
            alert("Coordenadas de destino inválidas.");
            return;
        }

        if (previewError || !previewStandard || !previewExpress) {
            alert("Verifique os erros na estimativa antes de solicitar.");
            return;
        }

        const selectedPreview = serviceLevel === 'express' ? previewExpress : previewStandard;

        // Extract driving route geometry if available, otherwise fallback straight line
        const route_polyline = previewMapboxRoute?.geometry
            ? JSON.stringify(previewMapboxRoute.geometry)
            : selectedPreview.route_polyline;

        await createAndDispatchOrder({
            region_id: storeProfile.region_id,
            city_id: storeProfile.city_id || null, // fallback in caso the interface relies entirely on region
            pickup_lat: storeProfile.latitude,
            pickup_lng: storeProfile.longitude,
            destination_lat: dLat,
            destination_lng: dLng,
            merchant_id: merchantId,
            distance_km: selectedPreview.distance_km,
            estimated_minutes: selectedPreview.eta_minutes,
            service_level: serviceLevel,
            base_fee: selectedPreview.base_fee,
            km_fee: selectedPreview.km_fee,
            priority_fee: selectedPreview.priority_fee,
            total_price: selectedPreview.total_price,
            route_polyline: route_polyline
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'awaiting_professional':
            case 'open':
            case 'pending':
                return (
                    <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full font-medium text-sm border border-blue-200 shadow-sm animate-pulse w-fit">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Procurando motoboy próximo...</span>
                    </div>
                );
            case 'in_progress':
            case 'accepted':
            case 'picked_up':
                return (
                    <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full font-medium text-sm border border-orange-200 shadow-sm w-fit">
                        <Bike className="w-4 h-4" />
                        <span>Motoboy a caminho</span>
                    </div>
                );
            case 'delivered':
            case 'completed':
                return (
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full font-medium text-sm border border-green-200 shadow-sm w-fit">
                        <CheckCircle className="w-4 h-4" />
                        <span>Entregue</span>
                    </div>
                );
            case 'cancelled':
                return (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-full font-medium text-sm border border-red-200 shadow-sm w-fit">
                        <XCircle className="w-4 h-4" />
                        <span>Cancelado</span>
                    </div>
                );
            default:
                return (
                    <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full font-medium text-sm border border-gray-200 shadow-sm w-fit">
                        <span>{status}</span>
                    </div>
                );
        }
    };

    // View: Pedido em Andamento
    if (activeOrderId && activeOrder) {
        const pendingOffers = offers.filter(o => o.offer_status === 'pending');
        const bestOffer = pendingOffers.length > 0
            ? pendingOffers.reduce((prev, curr) =>
                (curr.distance_km ?? 9999) < (prev.distance_km ?? 9999) ? curr : prev
            )
            : null;

        return (
            <div className="p-5 border rounded-2xl bg-white shadow-sm space-y-5">
                <h3 className="text-lg font-bold text-slate-800 border-b pb-3">Status do Dispatch</h3>

                {getStatusBadge(activeOrder.status)}

                <div className="flex items-center gap-4 py-2 border-y border-slate-50">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Distância Total</span>
                        <span className="text-lg font-bold text-slate-700">
                            {(() => {
                                const rawDistance = activeOrder.distance_km ?? activeOrder.estimated_distance_km ?? (activeOrder as any).metadata?.distance_km ?? null;
                                return rawDistance !== null && rawDistance !== undefined
                                    ? `${Number(rawDistance).toFixed(1).replace('.', ',')} km`
                                    : '--';
                            })()}
                        </span>
                    </div>
                </div>

                {(activeOrder.status === 'awaiting_professional' || activeOrder.status === 'pending') && (
                    <div className="space-y-4">
                        <div className="text-sm text-slate-600">
                            <p>O robô despachante está rodando. Aguarde o aceite de um profissional em sua região.</p>
                            <p className="mt-1">
                                <strong>Rodada atual:</strong> Ofertas pendentes ({pendingOffers.length})
                            </p>
                        </div>

                        {bestOffer && (
                            <div className="p-3 bg-slate-50 border rounded-xl flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Melhor Motoboy no Radar</p>
                                    <p className="text-sm font-bold text-slate-800">
                                        {bestOffer.motoboy?.nome_completo || 'Motoboy Parceiro'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded-md text-xs">
                                        {bestOffer.distance_km?.toFixed(1) || '--'} km
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Listagem Geral de Ofertas Realtime */}
                        {offers.length > 0 && (
                            <div className="flex flex-col gap-2 mt-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase">Ofertas ativas geradas no banco:</p>
                                <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                                    {offers.map(offer => (
                                        <div key={offer.id} className="text-xs p-2 border rounded-lg bg-white flex justify-between items-center">
                                            <span className="truncate w-32">{offer.motoboy?.nome_completo || offer.motoboy_id}</span>
                                            <span className="text-slate-500">{(offer.distance_km)?.toFixed(2) || '?'} km</span>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${offer.offer_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                offer.offer_status === 'accepted' ? 'bg-green-100 text-green-700' :
                                                    offer.offer_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-700'
                                                }`}>
                                                {offer.offer_status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <Button
                            variant="outline"
                            onClick={forceDispatchCycle}
                            className="w-full gap-2 border-slate-300 text-slate-600 hover:bg-slate-50"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Forçar Rodada de Bipagem
                        </Button>
                    </div>
                )}

                {(activeOrder.status === 'in_progress' || activeOrder.status === 'accepted') && (
                    <PickupCodeDisplay orderId={activeOrderId!} />
                )}

            </div>
        );
    }

    // View: Solicitação
    const selectedPreview = serviceLevel === 'express' ? previewExpress : previewStandard;

    return (
        <div className="p-6 border border-slate-200 rounded-3xl bg-white shadow-sm space-y-5">
            <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Motoboy Express</h2>
                <p className="text-sm text-slate-500 mt-1">Acione nossa frota imediatamente para a sua loja enviando os dados de rota. O sistema buscará o motoboy mais próximo via satélite.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Standard Card */}
                <div
                    onClick={() => setServiceLevel('standard')}
                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${serviceLevel === 'standard'
                        ? 'border-slate-800 bg-slate-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${serviceLevel === 'standard' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                <Truck className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">Entrega Padrão</h3>
                                <p className="text-xs text-slate-500">Entrega em até 25 minutos</p>
                            </div>
                        </div>
                        {serviceLevel === 'standard' && <CheckCircle className="w-5 h-5 text-slate-800" />}
                    </div>
                    <div className="mt-3">
                        <p className="text-xs font-medium text-slate-600">Base: R$ 9,00 + R$ 1,60/km</p>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
                            Mais econômica
                        </span>
                    </div>
                </div>

                {/* Express Card */}
                <div
                    onClick={() => setServiceLevel('express')}
                    className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${serviceLevel === 'express'
                        ? 'border-orange-500 bg-orange-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${serviceLevel === 'express' ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-600'}`}>
                                <Zap className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">Motoboy Express</h3>
                                <p className="text-xs text-slate-500 truncate max-w-[150px]">Entrega com motoboy mais próximo</p>
                            </div>
                        </div>
                        {serviceLevel === 'express' && <CheckCircle className="w-5 h-5 text-orange-500" />}
                    </div>
                    <div className="mt-3">
                        <p className="text-xs font-medium text-slate-600">Base: R$ 12,00 + R$ 1,60/km</p>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center w-fit gap-1">
                            <Zap className="w-3 h-3 fill-current" /> Prioridade na fila
                        </span>
                    </div>
                </div>
            </div>

            {
                previewStandard && previewExpress && (
                    <div className="grid grid-cols-4 gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 p-full bg-slate-200 h-full"></div>
                        <div className="text-center col-span-1 border-r border-slate-200 border-dashed">
                            <p className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">Distância</p>
                            <p className="text-sm font-bold text-slate-700">{previewStandard.distance_km} km</p>
                        </div>
                        <div className="text-center col-span-1 border-r border-slate-200 border-dashed">
                            <p className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">ETA</p>
                            <p className="text-sm font-bold text-slate-700">~{previewStandard.eta_minutes} min</p>
                        </div>
                        <div className="text-center col-span-1 border-r border-slate-200">
                            <p className="text-[10px] uppercase text-slate-400 font-bold tracking-wider mb-1">Padrão</p>
                            <p className={`text-sm font-bold ${serviceLevel === 'standard' ? 'text-green-600 text-base scale-110 transition-transform' : 'text-slate-500'}`}>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(previewStandard.total_price)}
                            </p>
                        </div>
                        <div className="text-center col-span-1 relative bg-orange-50/50 -m-1 p-1 rounded-r-lg">
                            <p className="text-[10px] uppercase text-orange-400 font-bold tracking-wider mb-1 flex items-center justify-center gap-1">
                                <Zap className="w-3 h-3" /> Express
                            </p>
                            <p className={`text-sm font-bold ${serviceLevel === 'express' ? 'text-orange-600 text-base scale-110 transition-transform' : 'text-slate-500'}`}>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(previewExpress.total_price)}
                            </p>
                        </div>
                    </div>
                )
            }

            {
                previewLoading && (
                    <div className="text-xs text-slate-500 flex items-center">
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" /> Calculando rota...
                    </div>
                )
            }

            {
                previewError && (
                    <div className="text-xs text-red-500 bg-red-50 p-2 rounded">
                        {previewError}
                    </div>
                )
            }

            {/* MAP SECTION DYNAMIC RENDER */}
            {(previewStandard || previewExpress) && storeProfile?.latitude && storeProfile?.longitude && !isNaN(parseFloat(destLat)) && !isNaN(parseFloat(destLng)) && (
                <div className="w-full h-48 md:h-64 rounded-xl overflow-hidden border border-slate-200 mt-4 relative">
                    <MapboxPremiumMap
                        markers={[
                            {
                                id: 'store-origin',
                                lat: storeProfile.latitude,
                                lng: storeProfile.longitude,
                                type: 'store',
                                label: 'Sua Loja',
                                autoPopup: true,
                                popupHtml: `<div style="font-family: 'Inter', sans-serif; padding: 4px;">
                                                <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Loja</div>
                                                <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${storeProfile?.nome || 'Sem Nome'}</div>
                                            </div>`
                            },
                            {
                                id: 'destination-drop',
                                lat: parseFloat(destLat),
                                lng: parseFloat(destLng),
                                type: 'destination',
                                label: 'Destino',
                                autoPopup: true,
                                popupHtml: `<div style="font-family: 'Inter', sans-serif; padding: 4px;">
                                                <div style="font-size: 13px; font-weight: 700; color: #ea580c;">📍 Destino</div>
                                                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Ponto de entrega</div>
                                            </div>`
                            }
                        ]}
                        showRoute={true}
                        routePolyline={
                            previewMapboxRoute?.geometry?.coordinates
                                ? previewMapboxRoute.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]) // GeoJSON is [lng, lat], map component expects [lat, lng]
                                : [
                                    [storeProfile.latitude, storeProfile.longitude],
                                    [parseFloat(destLat), parseFloat(destLng)]
                                ]
                        }
                        className="w-full h-full"
                    />
                    <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-medium text-slate-600 border border-slate-200 shadow-sm flex items-center gap-1 z-10">
                        <MapIcon className="w-3 h-3" /> Zoom automático
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 border-r border-slate-100 pr-4">
                    <Label className="uppercase text-[10px] text-slate-400 font-bold tracking-wider">Ponto de Coleta</Label>
                    <div className="space-y-2">
                        <div className="text-sm font-semibold text-slate-700 truncate w-full" title={storeProfile?.nome}>
                            ✓ Loja: {storeProfile?.nome || '--'}
                        </div>
                        <div className="text-xs text-slate-500 font-mono bg-slate-50 p-1.5 rounded border border-slate-100">
                            Lat: {storeProfile?.latitude || '----'}<br />
                            Lng: {storeProfile?.longitude || '----'}
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <Label className="uppercase text-[10px] text-orange-500 font-bold tracking-wider">Destino Exato</Label>
                    <div className="space-y-2">
                        <Input
                            type="text"
                            placeholder="Latitude Cliente"
                            value={destLat}
                            onChange={e => setDestLat(e.target.value)}
                            className="h-9 focus-visible:ring-orange-500 text-sm"
                        />
                        <Input
                            type="text"
                            placeholder="Longitude Cliente"
                            value={destLng}
                            onChange={e => setDestLng(e.target.value)}
                            className="h-9 focus-visible:ring-orange-500 text-sm"
                        />
                    </div>
                </div>
            </div>

            {
                error && (
                    <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-medium">
                        {error}
                    </div>
                )
            }

            {selectedPreview && !previewLoading && !previewError && (
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm mt-4 space-y-4">
                    <h4 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <MapIcon className="w-5 h-5 text-orange-500" />
                        Resumo da rota
                    </h4>

                    <div className="space-y-1">
                        {/* Origem */}
                        <div className="flex items-start gap-3">
                            <div className="bg-slate-100 p-1.5 rounded-full mt-0.5">
                                <MapPin className="w-4 h-4 text-slate-600" />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Origem da entrega</div>
                                <div className="text-sm font-semibold text-slate-800">{storeProfile?.nome || 'Minha Loja'}</div>
                                <div className="text-[10px] font-mono text-slate-500 mt-1">
                                    Lat: {storeProfile?.latitude || '--'}<br />
                                    Lng: {storeProfile?.longitude || '--'}
                                </div>
                            </div>
                        </div>

                        {/* Route Line indicator */}
                        <div className="ml-3.5 w-0.5 h-6 bg-slate-200" />

                        {/* Destino */}
                        <div className="flex items-start gap-3">
                            <div className="bg-orange-100 p-1.5 rounded-full mt-0.5">
                                <Package className="w-4 h-4 text-orange-600" />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">Destino da entrega</div>
                                <div className="text-sm font-semibold text-slate-800">Coordenadas do cliente</div>
                                <div className="text-[10px] font-mono text-slate-500 mt-1">
                                    Lat: {destLat || '--'}<br />
                                    Lng: {destLng || '--'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 mt-2 border-t border-slate-100 space-y-3">
                        <div className="flex justify-between items-center text-sm font-medium">
                            <span className="text-slate-500 flex items-center gap-2">
                                <Truck className="w-4 h-4 text-slate-400" />
                                Distância da entrega
                            </span>
                            <span className="text-slate-800 font-bold">
                                {selectedPreview.distance_km?.toFixed(1) || '--'} km
                            </span>
                        </div>
                        <div className="flex justify-between items-start text-sm font-medium pt-1">
                            <div className="flex flex-col">
                                <span className="text-slate-500 flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-slate-400" />
                                    Valor estimado da entrega
                                </span>
                                <span className="text-[10px] text-slate-400 ml-6 mt-0.5">Base + cálculo por km conforme plano selecionado</span>
                            </div>
                            <span className="text-slate-900 font-bold text-lg">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedPreview.total_price || 0)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            <Button
                onClick={handleDispatch}
                disabled={loading || previewLoading || !!previewError || (!previewStandard && !previewExpress)}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold tracking-wide h-12 rounded-xl shadow-lg shadow-orange-500/20"
            >
                {loading ? (
                    <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        GERANDO ORDEM...
                    </>
                ) : (
                    <>
                        <Send className="w-4 h-4 mr-2" />
                        SOLICITAR MOTOBOY AGORA
                    </>
                )}
            </Button>
        </div >
    );
}

// ── Componente auxiliar: exibe o código de retirada ──────────────────
function PickupCodeDisplay({ orderId }: { orderId: string }) {
    const [code, setCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orderId) return;
        const fetchCode = async () => {
            setLoading(true);
            try {
                // Buscar diretamente da tabela (merchant é dono, RLS permite)
                const { data } = await supabase
                    .from('service_orders')
                    .select('pickup_code')
                    .eq('id', orderId)
                    .maybeSingle();
                if (data?.pickup_code) setCode(data.pickup_code);
            } catch (e) {
                console.error('[PickupCodeDisplay]', e);
            } finally {
                setLoading(false);
            }
        };
        fetchCode();
    }, [orderId]);

    return (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
            <p className="text-sm text-orange-800 font-medium">
                ✅ Motoboy a caminho! Informe o código abaixo quando ele chegar.
            </p>

            <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2 text-xs text-orange-600 font-bold uppercase tracking-wider">
                    <Key className="w-3.5 h-3.5" />
                    Código de Retirada
                </div>

                {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-orange-400 mt-1" />
                ) : code ? (
                    <div className="flex gap-2 mt-1">
                        {code.split('').map((digit, i) => (
                            <div
                                key={i}
                                className="w-12 h-14 rounded-xl bg-orange-500 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-orange-200"
                            >
                                {digit}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-orange-500 mt-1">Código indisponível</p>
                )}

                <p className="text-[10px] text-orange-600/60 text-center mt-1">
                    Mostre este código ao motoboy quando ele chegar na loja.
                </p>
            </div>
        </div>
    );
}
