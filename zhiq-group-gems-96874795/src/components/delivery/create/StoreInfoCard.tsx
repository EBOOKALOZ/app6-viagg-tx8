import { Card, CardContent } from "@/components/ui/card";
import { Store } from "lucide-react";

interface StoreData {
  nome_loja: string;
  logo_url: string | null;
  endereco_formatado: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
}

export function buildAddress(s: StoreData) {
  return (
    [s.rua, s.numero && `nº ${s.numero}`, s.bairro, s.cidade, s.estado]
      .filter(Boolean)
      .join(", ") ||
    s.endereco_formatado ||
    ""
  );
}

interface StoreInfoCardProps {
  store: StoreData;
}

export function StoreInfoCard({ store }: StoreInfoCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        {store.logo_url ? (
          <img
            src={store.logo_url}
            alt={store.nome_loja}
            className="w-10 h-10 rounded-full object-cover border border-border"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Store className="h-5 w-5 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{store.nome_loja}</p>
          <p className="text-xs text-muted-foreground truncate">{buildAddress(store)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
