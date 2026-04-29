import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, Plus, Trash2, Search, Minus } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DeliveryProduct {
  product_id?: string;
  nome: string;
  quantidade: number;
  unit_price?: number;
  imagem_url?: string;
}

const MAX_PRODUCTS = 9;

interface ProductsSectionProps {
  storeId?: string;
  products: DeliveryProduct[];
  onProductsChange: (p: DeliveryProduct[]) => void;
}

interface MerchantProduct {
  id: string;
  nome: string;
  preco: number;
  imagem_url: string | null;
}

export function ProductsSection({ storeId, products, onProductsChange }: ProductsSectionProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [storeProducts, setStoreProducts] = useState<MerchantProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Quantity selector state
  const [selectedProduct, setSelectedProduct] = useState<MerchantProduct | null>(null);
  const [newQty, setNewQty] = useState(1);

  // Fetch products when modal opens
  useEffect(() => {
    if (!showAdd || !storeId) return;

    const fetchProducts = async () => {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, nome, preco, imagem_url')
        .eq('store_id', storeId)
        .order('nome', { ascending: true });

      if (!error && data) {
        setStoreProducts(data as MerchantProduct[]);
      }
      setLoadingProducts(false);
    };
    fetchProducts();
  }, [showAdd, storeId]);

  const handleSelectProduct = (p: MerchantProduct) => {
    setSelectedProduct(p);
    setNewQty(1);
  };

  const addProduct = () => {
    if (!selectedProduct) return;
    const remainingSlots = MAX_PRODUCTS - products.length;
    if (remainingSlots <= 0) return;

    onProductsChange([
      ...products,
      {
        product_id: selectedProduct.id,
        nome: selectedProduct.nome,
        quantidade: newQty,
        unit_price: selectedProduct.preco,
        imagem_url: selectedProduct.imagem_url || undefined,
      }
    ]);
    setSelectedProduct(null);
    setSearchTerm("");
    setShowAdd(false);
  };

  const removeProduct = (idx: number) => {
    onProductsChange(products.filter((_, i) => i !== idx));
  };

  const filteredProducts = storeProducts.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValue = products.reduce((acc, curr) => acc + (curr.unit_price || 0) * curr.quantidade, 0);

  return (
    <>
      <Card className="border-0 shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold flex items-center gap-2 text-slate-800 uppercase tracking-tight">
                <Package className="h-4 w-4 text-orange-500" />
                Produtos ({products.length}/{MAX_PRODUCTS})
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">Itens desta entrega</p>
            </div>
            {products.length < MAX_PRODUCTS && (
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="h-8 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-orange-600 transition-colors">
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            )}
          </div>

          <div className="p-4">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <Search className="h-6 w-6 text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-500">Nenhum produto adicionado</p>
                <p className="text-[10px] text-slate-400 max-w-[200px] mt-1">Busque produtos do seu catálogo para enviar para este cliente.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {products.map((p, i) => (
                  <li key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-50/80 border border-slate-100 hover:border-orange-200 transition-colors group">
                    <div className="flex items-center gap-3 w-full min-w-0">
                      {p.imagem_url ? (
                        <img src={p.imagem_url} alt={p.nome} className="w-10 h-10 rounded-lg object-cover border border-slate-200 shadow-sm shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-200/50 flex items-center justify-center border border-slate-200 shrink-0">
                          <Package className="h-5 w-5 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate pr-2">{p.quantidade}x {p.nome}</p>
                        {p.unit_price && (
                          <p className="text-xs font-medium text-orange-600">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.unit_price * p.quantidade)}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 focus:bg-red-50 hover:bg-red-50 shrink-0" onClick={() => removeProduct(i)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {products.length > 0 && totalValue > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Subtotal dos itens</span>
                <span className="text-sm font-bold text-slate-800">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={(val) => {
        setShowAdd(val);
        if (!val) {
          setSelectedProduct(null);
          setSearchTerm("");
        }
      }}>
        <DialogContent className="max-w-[600px] h-[70vh] p-0 overflow-hidden bg-slate-50 border-0 shadow-2xl flex flex-col">
          <DialogHeader className="p-4 bg-white border-b border-slate-100 shrink-0">
            <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {selectedProduct ? 'Quantidade' : 'Adicionar produto'}
            </DialogTitle>
          </DialogHeader>

          {!selectedProduct ? (
            <>
              <div className="p-4 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar produto da loja"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-11 bg-white border-slate-200 focus-visible:ring-orange-500 rounded-xl"
                  />
                </div>
              </div>

              <div className="px-4 pb-4 overflow-y-auto flex-1 w-full">
                {loadingProducts ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <Package className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600">Nenhum produto encontrado</p>
                    {searchTerm && <p className="text-xs text-slate-400 mt-1">Tente buscar com outras palavras.</p>}
                  </div>
                ) : (
                  <div className="space-y-1.5 px-2">
                    {filteredProducts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        className="flex items-center gap-3 p-2 rounded-xl border border-transparent bg-white shadow-sm hover:border-orange-200 hover:shadow-md cursor-pointer transition-all active:scale-[0.98]"
                      >
                        {p.imagem_url ? (
                          <img src={p.imagem_url} alt={p.nome} className="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-200" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200">
                            <Package className="h-5 w-5 text-slate-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{p.nome}</p>
                          <p className="text-xs font-bold text-slate-600 mt-0.5">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-8 px-3 text-xs font-semibold text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectProduct(p);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> adicionar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-6">
              <div className="flex items-center gap-4 mb-8 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                {selectedProduct.imagem_url ? (
                  <img src={selectedProduct.imagem_url} alt={selectedProduct.nome} className="w-16 h-16 rounded-lg object-cover shadow-sm bg-slate-100" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                    <Package className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                <div>
                  <h4 className="font-bold text-slate-800 text-base">{selectedProduct.nome}</h4>
                  <p className="text-sm font-semibold text-orange-600 mt-1">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedProduct.preco)} un.
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center space-y-4 mb-8">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Unidades</span>
                <div className="flex items-center gap-6 bg-white border border-slate-200 rounded-full p-2 shadow-sm">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setNewQty(Math.max(1, newQty - 1))}
                    disabled={newQty <= 1}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-2xl font-black text-slate-800 w-10 text-center">{newQty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-full border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                    onClick={() => setNewQty(Math.min(99, newQty + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12 bg-white" onClick={() => setSelectedProduct(null)}>
                  Voltar
                </Button>
                <Button className="flex-1 h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold" onClick={addProduct}>
                  Confirmar {newQty}x
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
