import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DynamicCategoryConfig {
  id: string;
  category_name: string;
  is_active: boolean;
  fixed_image_url: string | null;
  current_dynamic_url: string | null;
}

export function useDynamicCategoryImages() {
  return useQuery({
    queryKey: ['dynamic-category-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_dynamic_category_config')
        .select('*');

      if (error) {
        if (error.code === '42P01') {
          // Relation does not exist yet (migration not applied on remote)
          return [];
        }
        console.error('Error fetching dynamic category images:', error);
        return [];
      }

      return data as DynamicCategoryConfig[];
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}
