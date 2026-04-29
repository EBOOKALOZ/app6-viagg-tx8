import { MapPin, Store } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface MerchantPanelHeaderProps {
  storeLogoUrl?: string;
  storeName?: string;
  storeCategory?: string;
  fullAddress?: string;
}

export function MerchantPanelHeader({
  storeLogoUrl,
  storeName = 'Minha Loja',
  storeCategory = 'Loja',
  fullAddress,
}: MerchantPanelHeaderProps) {
  const initials = storeName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="relative px-4 pt-6 pb-8 bg-[#0F3D2E] border-b border-white/10">
      <div className="flex items-center">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-white/20 shadow-lg">
            <AvatarImage src={storeLogoUrl} alt={storeName} />
            <AvatarFallback className="bg-gradient-to-br from-merchant to-merchant-hover text-white font-bold text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col">
            <span className="text-xs text-merchant-foreground/70 uppercase tracking-wider flex items-center gap-1">
              <Store className="h-3 w-3" />
              {storeCategory || 'Lojista'}
            </span>
            <span className="text-lg font-bold tracking-tight text-white">
              {storeName}
            </span>
            {fullAddress && (
              <div className="flex items-center gap-1 text-white/60 mt-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="text-xs font-medium leading-tight">
                  {fullAddress}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
