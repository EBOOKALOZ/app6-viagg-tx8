import { Truck, Zap, CheckCircle, Wallet, MapPin, Package, Clock } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";

interface ServiceSelectionCardProps {
    serviceLevel: 'standard' | 'express';
    onSelectService: (service: 'standard' | 'express') => void;
}

export function ServiceSelectionCard({ serviceLevel, onSelectService }: ServiceSelectionCardProps) {
    return (
        <div className="space-y-4 pt-4 border-t border-border">
            <div>
                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">Motoboy Express</h3>
                <p className="text-xs text-slate-500 mt-1">
                    Selecione o tipo de serviço. O motoboy mais próximo será acionado.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {/* Standard Card */}
                <div
                    onClick={() => onSelectService('standard')}
                    className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer ${serviceLevel === 'standard'
                        ? 'border-slate-800 bg-slate-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${serviceLevel === 'standard' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                <Truck className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm">Entrega Padrão</h4>
                                <p className="text-xs text-slate-500">Base: R$ 9,00 + R$ 1,60/km</p>
                            </div>
                        </div>
                        {serviceLevel === 'standard' && <CheckCircle className="w-5 h-5 text-slate-800" />}
                    </div>
                </div>

                {/* Express Card */}
                <div
                    onClick={() => onSelectService('express')}
                    className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer ${serviceLevel === 'express'
                        ? 'border-orange-500 bg-orange-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${serviceLevel === 'express' ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-600'}`}>
                                <Zap className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm">Motoboy Express</h4>
                                <p className="text-xs text-slate-500">Base: R$ 12,00 + R$ 1,60/km</p>
                            </div>
                        </div>
                        {serviceLevel === 'express' && <CheckCircle className="w-5 h-5 text-orange-500" />}
                    </div>
                </div>
            </div>
        </div>
    );
}
