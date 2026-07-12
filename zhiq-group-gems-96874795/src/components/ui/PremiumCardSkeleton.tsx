import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface PremiumCardSkeletonProps {
  className?: string;
  aspectRatio?: 'video' | 'square' | 'portrait';
  featuresCount?: number;
}

export const PremiumCardSkeleton: React.FC<PremiumCardSkeletonProps> = ({
  className,
  aspectRatio = 'video',
  featuresCount = 3
}) => {
  const aspectClass = {
    'video': 'aspect-video',
    'square': 'aspect-square',
    'portrait': 'aspect-[3/4]'
  }[aspectRatio];

  return (
    <div 
      className={cn(
        "flex flex-col w-full bg-white rounded-3xl overflow-hidden border border-zinc-100/50 shadow-sm",
        className
      )}
    >
      {/* Image Skeleton */}
      <div className={cn("relative w-full overflow-hidden", aspectClass)}>
        <Skeleton className="w-full h-full rounded-none" />
        
        {/* Badges Skeleton */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          <Skeleton className="h-5 w-20 rounded-lg" />
          <Skeleton className="h-5 w-16 rounded-lg" />
        </div>
        
        {/* Favorite Skeleton */}
        <div className="absolute top-3 right-3">
          <Skeleton className="w-10 h-10 rounded-full" />
        </div>
      </div>

      {/* Content Body Skeleton */}
      <div className="flex flex-col flex-1 p-5 lg:p-6 space-y-4">
        
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4 rounded-md" />
          <Skeleton className="h-6 w-1/2 rounded-md" />
          
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="w-4 h-4 rounded-full" />
            <Skeleton className="h-3 w-1/3 rounded-md" />
          </div>
        </div>

        {/* Features Skeleton */}
        {featuresCount > 0 && (
          <div className="flex items-center flex-wrap gap-3 py-2">
            {Array.from({ length: featuresCount }).map((_, idx) => (
              <Skeleton key={idx} className="h-6 w-20 rounded-lg" />
            ))}
          </div>
        )}

        <div className="flex-1" />
        
        <div className="h-px w-full bg-zinc-100" />

        {/* Footer Skeleton */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-16 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
};
