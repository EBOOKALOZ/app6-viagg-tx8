import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MessageCircle, Send, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRequireAuth } from '@/hooks/useRequireAuth';

interface AuctionQuestion {
  id: string;
  question_text: string;
  answer_text: string | null;
  answered_at: string | null;
  created_at: string;
  user_id: string;
  // Apenas pro front saber se quem perguntou foi ele
}

export function AuctionQASection({ listingId }: { listingId: string }) {
  const queryClient = useQueryClient();
  const requireAuth = useRequireAuth();
  
  const [newQuestion, setNewQuestion] = useState("");

  const { data: questions = [], isLoading } = useQuery<AuctionQuestion[]>({
    queryKey: ['auction_questions', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auction_questions')
        .select('*')
        .eq('auction_listing_id', listingId)
        .eq('is_public', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!listingId,
  });

  const askMutation = useMutation({
    mutationFn: async (text: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from('auction_questions')
        .insert({
          auction_listing_id: listingId,
          user_id: user.id,
          question_text: text,
          is_public: true
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sua pergunta foi enviada ao vendedor!");
      setNewQuestion("");
      queryClient.invalidateQueries({ queryKey: ['auction_questions', listingId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao enviar pergunta");
    }
  });

  const handleAsk = () => {
    if (!newQuestion.trim()) return;
    requireAuth(() => {
      askMutation.mutate(newQuestion.trim());
    }, { kind: 'auction_qa', label: 'fazer uma pergunta ao vendedor' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageCircle className="w-6 h-6 text-[#FF7A00]" />
        <h3 className="text-xl font-black text-white">Perguntas e Respostas</h3>
      </div>

      {/* Input area */}
      <div className="bg-[#252B33] p-4 md:p-6 rounded-2xl border border-[#323A45] space-y-4">
        <h4 className="text-sm font-bold text-[#B8C2CC]">Tem dúvidas sobre o produto?</h4>
        <Textarea
          placeholder="Escreva sua pergunta aqui..."
          className="min-h-[100px] resize-none bg-[#1A1F24] border-[#323A45] text-white focus-visible:ring-[#FF7A00] placeholder:text-[#5C6670]"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#8E98A3] flex items-center gap-1">
            <Info className="w-3 h-3" /> Sua pergunta será pública
          </p>
          <Button 
            onClick={handleAsk}
            disabled={!newQuestion.trim() || askMutation.isPending}
            className="bg-[#FF6A00] hover:bg-[#E65C00] text-white rounded-full px-6 font-bold"
          >
            {askMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-[#FF7A00] animate-spin" />
          </div>
        ) : questions.length === 0 ? (
          <p className="text-center text-[#8E98A3] py-8 border border-dashed border-[#323A45] rounded-2xl">
            Nenhuma pergunta ainda. Seja o primeiro a perguntar!
          </p>
        ) : (
          questions.map((q) => (
            <div key={q.id} className="bg-[#1A1F24] border border-[#323A45] rounded-2xl p-4 md:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <MessageCircle className="w-5 h-5 text-[#8E98A3] shrink-0 mt-0.5" />
                <div>
                  <p className="text-white text-sm leading-relaxed">{q.question_text}</p>
                  <p className="text-[10px] text-[#5C6670] mt-1">
                    {new Date(q.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              
              {q.answer_text && (
                <div className="flex items-start gap-3 ml-4 md:ml-8 pl-4 border-l-2 border-[#FF7A00]/30">
                  <div>
                    <p className="text-[#00C58E] font-bold text-xs mb-1 uppercase tracking-wider">Vendedor</p>
                    <p className="text-[#B8C2CC] text-sm leading-relaxed">{q.answer_text}</p>
                    {q.answered_at && (
                      <p className="text-[10px] text-[#5C6670] mt-1">
                        Respondido em {new Date(q.answered_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
