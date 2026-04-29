import { TerritorialStats } from './TerritorialStats';
import { TerritorialTable } from './TerritorialTable';
import { Badge } from '@/components/ui/badge';
import { Map } from 'lucide-react';

export function TerritorialExpansionModule() {
    return (
        <div className="space-y-6 animate-fade-in pb-8">
            <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Map className="w-6 h-6 text-primary" />
                    Expansão Territorial
                </h2>
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                    Santa Catarina
                </Badge>
                <Badge variant="outline" className="bg-background">
                    295 Municípios
                </Badge>
            </div>

            <TerritorialStats />
            <TerritorialTable />
        </div>
    );
}
