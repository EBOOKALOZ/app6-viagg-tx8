import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { RefreshCw, Plus, Search, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface DynamicCategory {
  id: string;
  category_name: string;
  is_active: boolean;
  fixed_image_url: string | null;
  selection_criteria: string;
  rotation_frequency: string;
  current_dynamic_url: string | null;
  last_rotated_at: string | null;
}

export function AdminDynamicCategories() {
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_dynamic_category_config')
      .select('*')
      .order('category_name', { ascending: true });

    if (error) {
      // If table doesn't exist yet
      if (error.code !== '42P01') {
        toast.error('Erro ao buscar categorias dinâmicas');
        console.error(error);
      }
    } else {
      setCategories(data || []);
    }
    setLoading(false);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    const { error } = await supabase
      .from('admin_dynamic_category_config')
      .insert([{ category_name: newCategoryName.trim() }]);

    if (error) {
      toast.error('Erro ao adicionar categoria: ' + error.message);
    } else {
      toast.success('Categoria adicionada com sucesso');
      setNewCategoryName('');
      fetchCategories();
    }
  };

  const updateCategory = async (id: string, updates: Partial<DynamicCategory>) => {
    const { error } = await supabase
      .from('admin_dynamic_category_config')
      .update(updates)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar categoria');
      console.error(error);
    } else {
      toast.success('Categoria atualizada');
      fetchCategories();
    }
  };

  const handleRotateImages = async () => {
    setRotating(true);
    const { error } = await supabase.rpc('update_dynamic_category_images');
    
    if (error) {
      toast.error('Erro ao rotacionar imagens: ' + error.message);
      console.error(error);
    } else {
      toast.success('Imagens atualizadas com sucesso!');
      fetchCategories();
    }
    setRotating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias Dinâmicas (Premium)</h1>
          <p className="text-muted-foreground">
            Substitua ícones estáticos por imagens reais de produtos e anúncios (ORION-540).
          </p>
        </div>
        <Button 
          onClick={handleRotateImages} 
          disabled={rotating}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${rotating ? 'animate-spin' : ''}`} />
          Rotacionar Imagens Agora
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar Categoria</CardTitle>
          <CardDescription>
            Adicione o nome exato da categoria para habilitar imagens dinâmicas para ela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input 
              placeholder="Nome da Categoria (ex: Celulares e Smartphones)" 
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <Button onClick={handleAddCategory}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <p className="text-center text-muted-foreground p-8">Carregando categorias...</p>
        ) : categories.length === 0 ? (
          <p className="text-center text-muted-foreground p-8">Nenhuma categoria dinâmica configurada.</p>
        ) : (
          categories.map((cat) => (
            <Card key={cat.id}>
              <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
                
                <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  {cat.current_dynamic_url || cat.fixed_image_url ? (
                    <img 
                      src={cat.fixed_image_url || cat.current_dynamic_url || ''} 
                      alt={cat.category_name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-lg">{cat.category_name}</h3>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${cat.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                      {cat.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                    {cat.last_rotated_at && (
                      <span>Última rotação: {new Date(cat.last_rotated_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Status:</span>
                    <Switch 
                      checked={cat.is_active} 
                      onCheckedChange={(c) => updateCategory(cat.id, { is_active: c })} 
                    />
                  </div>
                  
                  <div className="w-40">
                    <Select 
                      value={cat.selection_criteria} 
                      onValueChange={(v) => updateCategory(cat.id, { selection_criteria: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Critério" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Mais Recente</SelectItem>
                        <SelectItem value="random">Aleatório</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-full md:w-64">
                    <Input 
                      placeholder="URL Fixa (Sobrescreve dinâmica)" 
                      value={cat.fixed_image_url || ''}
                      onChange={(e) => updateCategory(cat.id, { fixed_image_url: e.target.value || null })}
                    />
                  </div>
                </div>

              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
