import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Phone, Clock, Package, Store, User, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import LoadingTransition from "@/pages/LoadingTransition";

interface PurchaseIntention {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_note: string | null;
  created_at: string;
  total_amount: number;
  items: Array<{
    listing_id: string;
    quantity: number;
    price: number;
    title?: string;
    image_url?: string;
  }>;
  store_id?: string;
}

export default function MerchantMessagesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [intentions, setIntentions] = useState<PurchaseIntention[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    async function fetchStoreAndIntentions() {
      try {
        // 1. Buscar loja do usuário
        const { data: store, error: storeErr } = await supabase
          .from("merchant_stores")
          .select("id, nome_loja")
          .eq("user_id", user.id)
          .maybeSingle();

        if (storeErr || !store) {
          setIsLoading(false);
          return;
        }

        // 2. Buscar purchase_intentions que pertencem a esta loja
        // As purchase_intentions têm store_id? Em alguns schemas sim. Se não, filtrar pelos listings da loja.
        const { data: allIntentions, error: piErr } = await supabase
          .from("purchase_intentions")
          .select("*")
          .order("created_at", { ascending: false });

        if (piErr) {
          console.error("Error fetching intentions:", piErr);
          setIsLoading(false);
          return;
        }

        // Se purchase_intentions.tem store_id, filtre direto
        let storeIntentions: PurchaseIntention[] = (allIntentions || []).filter(
          (pi: any) => pi.store_id === store.id
        );

        // Se não houver resultados com store_id, tente filtrar pelos listings da loja
        if (storeIntentions.length === 0) {
          // Buscar listings (advertiser_listings) da loja
          const { data: listings } = await supabase
            .from("advertiser_listings")
            .select("id")
            .eq("store_id", store.id);

          const listingIds = new Set(listings?.map(l => l.id) || []);

          if (listingIds.size > 0) {
            storeIntentions = (allIntentions || []).filter((pi: any) => {
              const items = pi.items as Array<{ listing_id: string }> || [];
              return items.some(item => listingIds.has(item.listing_id));
            });
          }
        }

        setIntentions(storeIntentions);
      } catch (error) {
        console.error("Unexpected error:", error);
        toast.error("Erro ao carregar mensagens.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchStoreAndIntentions();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Excluir esta mensagem?")) return;
    const { error } = await supabase.from("purchase_intentions").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      toast.success("Mensagem excluída.");
      setIntentions(prev => prev.filter(i => i.id !== id));
    }
  };

  if (isLoading) return <LoadingTransition />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#F5F7FA] flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-[#FF6A00]" />
            MENSAGENS DA LOJA
          </h1>
          <p className="text-sm font-medium text-[#A7B0BE] mt-2">
            Intenções de compra e contatos recebidos pelos seus produtos.
          </p>
        </div>
      </div>

      {intentions.length === 0 ? (
        <Card className="bg-[#1B1F24] border-[#2A3038] py-16 flex flex-col items-center text-center shadow-xl shadow-black/20">
          <div className="w-20 h-20 bg-[#14171B] border border-[#2A3038] rounded-full flex items-center justify-center mb-6">
            <MessageSquare className="w-8 h-8 text-[#A7B0BE]" />
          </div>
          <h3 className="text-xl font-black text-[#F5F7FA] uppercase">Nenhuma Mensagem Recebida</h3>
          <p className="text-[#A7B0BE] font-medium max-w-sm mt-3">
            Sua loja ainda não recebeu intenções de compra. Quando um cliente se interessar, aparecerá aqui.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {intentions.map((intention) => (
            <Card key={intention.id} className="bg-[#1B1F24] border-[#2A3038] shadow-lg overflow-hidden flex flex-col relative group">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#FF6A00] to-[#FF7A1A]" />

              <CardHeader className="p-5 pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
                    <MessageSquare className="w-3.5 h-3.5 text-[#FF6A00]" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#F5F7FA]">
                      NOVA MENSAGEM
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-zinc-600 hover:text-red-600 hover:bg-red-500/10 rounded-full transition-colors"
                    onClick={() => handleDelete(intention.id)}
                    title="Excluir mensagem"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-5 pt-2 flex flex-col flex-1 space-y-4">
                {/* Cliente */}
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#FF6A00]" />
                  <span className="text-sm font-bold text-[#F5F7FA]">{intention.customer_name || "Anônimo"}</span>
                </div>

                {/* Telefone */}
                {intention.customer_phone && (
                  <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 p-2 rounded-lg border border-emerald-400/20">
                    <Phone className="w-4 h-4" />
                    {intention.customer_phone}
                  </div>
                )}

                {/* Mensagem */}
                {intention.customer_note && (
                  <div className="text-sm text-[#A7B0BE] bg-[#14171B] p-3 rounded-lg border border-[#2A3038] italic">
                    "{intention.customer_note}"
                  </div>
                )}

                {/* Itens do pedido */}
                {intention.items && intention.items.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-400 uppercase tracking-wider">
                      <Package className="w-3.5 h-3.5" />
                      Itens do Pedido
                    </div>
                    {intention.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-[#A7B0BE] bg-zinc-900/50 p-2 rounded">
                        <span>{item.title || `Produto #${item.listing_id}`}</span>
                        <span className="font-bold text-[#F5F7FA]">{item.quantity}x</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-zinc-800">
                      <span className="text-sm font-bold text-[#A7B0BE]">Total</span>
                      <span className="text-sm font-black text-[#FF6A00]">
                        R$ {intention.total_amount?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Data */}
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono mt-auto pt-2 border-t border-zinc-800">
                  <Clock className="w-3 h-3" />
                  {new Date(intention.created_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
