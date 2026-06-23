/**
 * ProductInquiryModal — "Saber mais" sobre um produto do /mercado.
 *
 * Caixa pequena pra visitante (anônimo ou logado) perguntar sobre um produto:
 * nome + WhatsApp + e-mail opcional + mensagem. Mostra a foto do produto pra
 * contextualizar o vendedor quando o lead chegar.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { User, Phone, Mail, MessageSquare, Loader2, CheckCircle2, Send, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ProductInquiryModalProps {
  open: boolean;
  onClose: () => void;
  product: {
    id: string;
    title: string;
    image_url?: string | null;
    price_label?: string | null;
    store_name?: string | null;
    city?: string | null;
  } | null;
}

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function ProductInquiryModal({ open, onClose, product }: ProductInquiryModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setName(''); setPhone(''); setEmail(''); setMessage(''); setSubmitted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    if (!name.trim()) { toast.error('Digite seu nome.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { toast.error('WhatsApp inválido. Inclua o DDD.'); return; }
    if (!message.trim()) { toast.error('Escreva sua pergunta.'); return; }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('register_product_inquiry' as any, {
        p_product_id: product.id,
        p_visitor_name: name.trim(),
        p_visitor_phone: phone,
        p_visitor_email: email.trim() || null,
        p_visitor_message: message.trim(),
        p_city: product.city || null,
      });

      const result = data as { success?: boolean; error?: string; intention_id?: string } | null;
      if (error || !result?.success) {
        const errMsg = result?.error || error?.message || 'erro desconhecido';
        toast.error(`Não foi possível enviar: ${errMsg}`);
        return;
      }
      setSubmitted(true);
      toast.success('Pergunta enviada! O vendedor vai te responder em breve.');

      // Dispara e-mail ao lojista + confirmação ao visitante (sem depender do trigger)
      supabase.functions.invoke('swift-action', {
        body: {
          source: 'lead',
          lead_intention_id: result.intention_id || null,
          visitor_email: email.trim() || null,
          visitor_name: name.trim(),
          visitor_phone: phone.replace(/\D/g, ''),
          visitor_message: message.trim(),
          city: product.city || null,
        },
      }).catch((e) => console.warn('[email lead]', e));
    } catch (err: any) {
      toast.error(`Erro inesperado: ${err?.message || 'tente novamente'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        {/* Header com foto do produto */}
        <div className="relative bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 border-b border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-white shadow-sm border border-emerald-100 overflow-hidden shrink-0 flex items-center justify-center">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <ImageIcon className="w-7 h-7 text-emerald-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Sua pergunta sobre</p>
              <h3 className="text-sm font-black text-zinc-900 leading-tight truncate">{product.title}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                {product.price_label && (
                  <span className="text-[11px] font-bold text-emerald-700">R$ {product.price_label}</span>
                )}
                {product.store_name && (
                  <span className="text-[10px] text-zinc-500 truncate">· {product.store_name}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle className="text-base font-black text-zinc-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            Falar com o vendedor
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="px-5 pb-6 pt-2 space-y-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-sm font-bold text-zinc-900">Pergunta enviada com sucesso!</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              O vendedor recebeu sua mensagem com a foto do produto e vai entrar em contato pelo WhatsApp.
            </p>
            <Button onClick={handleClose} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-2">
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 pb-5 pt-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="inq-name" className="text-xs font-bold flex items-center gap-1.5 text-zinc-700">
                <User className="w-3 h-3" /> Seu nome *
              </Label>
              <Input
                id="inq-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como você se chama?"
                className="h-10"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inq-phone" className="text-xs font-bold flex items-center gap-1.5 text-zinc-700">
                <Phone className="w-3 h-3" /> WhatsApp *
              </Label>
              <Input
                id="inq-phone"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inq-email" className="text-xs font-bold flex items-center gap-1.5 text-zinc-700">
                <Mail className="w-3 h-3" /> E-mail (opcional)
              </Label>
              <Input
                id="inq-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inq-message" className="text-xs font-bold flex items-center gap-1.5 text-zinc-700">
                <MessageSquare className="w-3 h-3" /> Sua pergunta *
              </Label>
              <Textarea
                id="inq-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex: Tem entrega na minha região? Está disponível em outra cor?"
                rows={3}
                className="resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs tracking-widest gap-2 mt-1"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar pergunta
            </Button>
            <p className="text-[10px] text-center text-zinc-400 leading-relaxed">
              Sua mensagem vai direto para o painel do vendedor.
              A foto do produto vai junto.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
