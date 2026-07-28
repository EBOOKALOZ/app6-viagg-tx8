import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Gavel, Trophy, Building2, Wrench, Plane, Truck, CarFront } from "lucide-react";

interface StatsProps {
  stats: {
    products: number;
    leiloes: number;
    arremates: number;
    vehicles: number;
    real_estate: number;
    services: number;
    travels: number;
    freights: number;
  };
}

export function CommercialStats({ stats }: StatsProps) {
  const items = [
    { label: "Produtos", value: stats.products, icon: <Package className="w-5 h-5 text-blue-500" /> },
    { label: "Leilões", value: stats.leiloes, icon: <Gavel className="w-5 h-5 text-orange-500" /> },
    { label: "Arremates", value: stats.arremates, icon: <Trophy className="w-5 h-5 text-green-500" /> },
    { label: "Veículos", value: stats.vehicles, icon: <CarFront className="w-5 h-5 text-red-500" /> },
    { label: "Imóveis", value: stats.real_estate, icon: <Building2 className="w-5 h-5 text-purple-500" /> },
    { label: "Serviços", value: stats.services, icon: <Wrench className="w-5 h-5 text-yellow-500" /> },
    { label: "Viagens", value: stats.travels, icon: <Plane className="w-5 h-5 text-sky-500" /> },
    { label: "Fretes", value: stats.freights, icon: <Truck className="w-5 h-5 text-indigo-500" /> },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item, idx) => (
        <Card key={idx}>
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted-foreground font-medium text-sm">
              {item.icon}
              {item.label}
            </div>
            <div className="text-2xl font-bold">{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
