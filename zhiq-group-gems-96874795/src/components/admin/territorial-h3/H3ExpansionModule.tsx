import { H3ExpansionStats } from './H3ExpansionStats';
import { H3ExpansionMap } from './H3ExpansionMap';
import { H3ExpansionTable } from './H3ExpansionTable';
import { Badge } from '@/components/ui/badge';
import { Hexagon } from 'lucide-react';

export function H3ExpansionModule() {
    return (
        <div className="space-y-6 animate-fade-in pb-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <Hexagon className="w-6 h-6 text-blue-500" />
                        Expansão Territorial H3
                    </h2>
                    <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20">
                        Sistema Inteligente
                    </Badge>
                </div>
            </div>

            <H3ExpansionStats />
            <H3ExpansionMap />
            <H3ExpansionTable />
        </div>
    );
}
