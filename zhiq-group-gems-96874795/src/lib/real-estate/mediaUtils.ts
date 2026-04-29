import { supabase } from "@/integrations/supabase/client";

/**
 * Utility to generate a consistent public URL for Real Estate media.
 * Implements fallback logic between the 'public' processed bucket and the 'original' source bucket.
 */
export const getListingImageUrl = (
  path: string | null, 
  type: 'thumb' | 'public' | 'original' = 'public',
  t?: number
) => {
  if (!path) return null;

  const timestamp = t || Date.now();
  
  // Rule: Exhibition usually goes to public bucket
  let bucket = 'real-estate-public';
  
  // If we explicitly want the original, or if the path looks like an original path
  if (type === 'original') {
    bucket = 'real-estate-original';
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  // Return the public URL with cache-busting timestamp
  return `${data.publicUrl}${data.publicUrl.includes('?') ? '&' : '?'}t=${timestamp}`;
};

/**
 * Returns a fallback URL if the primary rendering fails.
 * Useful for <img> onError events.
 */
export const getMediaFallbackUrl = (currentUrl: string | undefined) => {
  if (!currentUrl) return undefined;
  
  // If it was trying to read from public, try original
  if (currentUrl.includes('real-estate-public')) {
    const freshTimestamp = Date.now();
    const fallback = currentUrl
      .replace('real-estate-public', 'real-estate-original')
      .split('?')[0]; // Remove old params
      
    return `${fallback}?t=${freshTimestamp}`;
  }
  
  return undefined;
};
