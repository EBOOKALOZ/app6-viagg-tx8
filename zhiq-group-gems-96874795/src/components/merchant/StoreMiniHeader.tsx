import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface StoreMiniHeaderProps {
  storeName: string;
  logoUrl?: string | null;
  /** 'sm' = 24px (map/popup), 'md' = 32px (cards/lists) */
  size?: 'sm' | 'md';
  /** Show green border for verified stores */
  verified?: boolean;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function StoreMiniHeader({
  storeName,
  logoUrl,
  size = 'md',
  verified = false,
  className,
}: StoreMiniHeaderProps) {
  const sizeClass = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[11px]';

  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <Avatar
        className={cn(
          sizeClass,
          'shrink-0',
          verified
            ? 'ring-[1.5px] ring-emerald-500'
            : 'ring-1 ring-border'
        )}
      >
        {logoUrl && (
          <AvatarImage
            src={logoUrl}
            alt={storeName}
            className="object-cover"
          />
        )}
        <AvatarFallback
          className={cn(
            'bg-emerald-600 text-white font-bold',
            textSize
          )}
        >
          {getInitials(storeName || 'L')}
        </AvatarFallback>
      </Avatar>
      <span className="font-semibold truncate text-foreground">
        {storeName}
      </span>
    </div>
  );
}

export default StoreMiniHeader;
