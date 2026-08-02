/**
 * ProductInquiryModal — "Tenho Interesse" / "Saber mais" sobre um produto.
 *
 * Formulário premium futurista para visitante (anônimo ou logado) perguntar
 * sobre um produto: nome + WhatsApp + e-mail + bairro + cidade + mensagem.
 * Mostra a foto do produto pra contextualizar o vendedor quando o lead chegar.
 */

import { useState, useEffect } from 'react';
import { FormDisclaimerStrip } from "@/components/public/FormDisclaimerStrip";
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
import {
  User, Phone, Mail, MessageSquare, Loader2, CheckCircle2, Send,
  ImageIcon, MapPin, Building2, Sparkles, Star, Shield, Zap,
} from 'lucide-react';
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
  const [bairro, setBairro] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Pre-fill city from product
  useEffect(() => {
    if (product?.city && !city) setCity(product.city);
  }, [product?.city]);

  const reset = () => {
    setName(''); setPhone(''); setEmail(''); setBairro(''); setCity(''); setMessage(''); setSubmitted(false);
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
    if (!message.trim()) { toast.error('Escreva sua pergunta ou interesse.'); return; }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('register_product_inquiry' as any, {
        p_product_id: product.id,
        p_visitor_name: name.trim(),
        p_visitor_phone: phone,
        p_visitor_email: email.trim() || null,
        p_visitor_message: `${message.trim()}${bairro.trim() ? `\n📍 Bairro: ${bairro.trim()}` : ''}${city.trim() ? `\n🏙️ Cidade: ${city.trim()}` : ''}`,
        p_city: city.trim() || product.city || null,
      });

      const result = data as { success?: boolean; error?: string; intention_id?: string } | null;
      if (error || !result?.success) {
        const errMsg = result?.error || error?.message || 'erro desconhecido';
        toast.error(`Não foi possível enviar: ${errMsg}`);
        return;
      }
      setSubmitted(true);
      toast.success('Interesse enviado! O vendedor vai te responder em breve.');

      // Dispara e-mail ao lojista + confirmação ao visitante
      supabase.functions.invoke('swift-action', {
        body: {
          source: 'lead',
          lead_intention_id: result.intention_id || null,
          listing_id: product.id,
          listing_module: 'product',
          visitor_email: email.trim() || null,
          visitor_name: name.trim(),
          visitor_phone: phone.replace(/\D/g, ''),
          visitor_message: message.trim(),
          city: city.trim() || product.city || null,
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
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0 border-0 bg-[#F5E62B] shadow-[0_0_60px_rgba(245,230,43,0.4)] max-h-[90vh] overflow-y-auto">

        {/* ═══ HEADER PREMIUM COM FOTO DO PRODUTO ═══ */}
        <div className="relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-white/10" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/40 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#FF6A00]/10 rounded-full blur-2xl" />

          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-center gap-4">
              {/* Foto do produto com borda glow */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#FF6A00] to-emerald-500 rounded-2xl opacity-60 blur-sm group-hover:opacity-80 transition-opacity" />
                <div className="relative w-20 h-20 rounded-xl bg-white border border-zinc-900/10 overflow-hidden flex items-center justify-center">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-zinc-400" />
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3 h-3 text-[#E65C00]" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#E65C00]">
                    Demonstrar interesse
                  </span>
                </div>
                <h3 className="text-base font-black text-zinc-900 leading-tight line-clamp-2">{product.title}</h3>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {product.price_label && (
                    <span className="text-sm font-black text-emerald-800 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/30">
                      R$ {product.price_label}
                    </span>
                  )}
                  {product.store_name && (
                    <span className="text-[10px] text-zinc-700 font-bold flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> {product.store_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Divider gradient */}
          <div className="h-px bg-gradient-to-r from-transparent via-zinc-900/10 to-transparent" />
        </div>

        <DialogHeader className="px-5 pt-4 pb-1">
          <DialogTitle className="text-sm font-black text-zinc-900 flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#FF6A00] to-[#FF8C00] flex items-center justify-center shadow-sm">
              <MessageSquare className="w-3.5 h-3.5 text-white" />
            </div>
            Falar com o vendedor
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          /* ═══ TELA DE SUCESSO ═══ */
          <div className="px-5 pb-6 pt-4 space-y-4 text-center">
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
            </div>
            <div>
              <p className="text-lg font-black text-zinc-900">Interesse enviado! 🎉</p>
              <p className="text-xs text-zinc-700 leading-relaxed mt-1">
                O vendedor recebeu sua mensagem com a foto do produto e vai entrar em contato pelo WhatsApp.
              </p>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-3 pt-1">
              <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-700">
                <Shield className="w-3 h-3" /> Seguro
              </div>
              <div className="flex items-center gap-1 text-[9px] font-bold text-[#E65C00]">
                <Zap className="w-3 h-3" /> Resposta rápida
              </div>
              <div className="flex items-center gap-1 text-[9px] font-bold text-amber-700">
                <Star className="w-3 h-3" /> Verificado
              </div>
            </div>

            <Button onClick={handleClose} className="w-full h-11 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-black uppercase text-xs tracking-widest border-0 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              Fechar
            </Button>
          </div>
        ) : (
          /* ═══ FORMULÁRIO ═══ */
          <form onSubmit={handleSubmit} className="px-5 pb-5 pt-2 space-y-3">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="inq-name" className="text-[11px] font-bold flex items-center gap-1.5 text-zinc-700">
                <User className="w-3 h-3 text-[#E65C00]" /> Seu nome <span className="text-red-600">*</span>
              </Label>
              <Input
                id="inq-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como você se chama?"
                className="h-10 bg-white/60 border-zinc-900/10 text-zinc-900 placeholder:text-zinc-500 focus:border-[#FF6A00]/50 focus:ring-[#FF6A00]/20 rounded-xl"
                autoFocus
              />
            </div>

            {/* WhatsApp + E-mail (lado a lado) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="inq-phone" className="text-[11px] font-bold flex items-center gap-1.5 text-zinc-700">
                  <Phone className="w-3 h-3 text-emerald-600" /> WhatsApp <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="inq-phone"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  className="h-10 bg-white/60 border-zinc-900/10 text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inq-email" className="text-[11px] font-bold flex items-center gap-1.5 text-zinc-700">
                  <Mail className="w-3 h-3 text-blue-600" /> E-mail
                </Label>
                <Input
                  id="inq-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="h-10 bg-white/60 border-zinc-900/10 text-zinc-900 placeholder:text-zinc-500 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                />
              </div>
            </div>

            {/* Bairro + Cidade (lado a lado) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="inq-bairro" className="text-[11px] font-bold flex items-center gap-1.5 text-zinc-700">
                  <MapPin className="w-3 h-3 text-violet-600" /> Bairro
                </Label>
                <Input
                  id="inq-bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  placeholder="Seu bairro"
                  className="h-10 bg-white/60 border-zinc-900/10 text-zinc-900 placeholder:text-zinc-500 focus:border-violet-500/50 focus:ring-violet-500/20 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inq-city" className="text-[11px] font-bold flex items-center gap-1.5 text-zinc-700">
                  <Building2 className="w-3 h-3 text-cyan-700" /> Cidade
                </Label>
                <Input
                  id="inq-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Sua cidade"
                  className="h-10 bg-white/60 border-zinc-900/10 text-zinc-900 placeholder:text-zinc-500 focus:border-cyan-500/50 focus:ring-cyan-500/20 rounded-xl"
                />
              </div>
            </div>

            {/* Mensagem */}
            <div className="space-y-1.5">
              <Label htmlFor="inq-message" className="text-[11px] font-bold flex items-center gap-1.5 text-zinc-700">
                <MessageSquare className="w-3 h-3 text-[#E65C00]" /> Sua mensagem <span className="text-red-600">*</span>
              </Label>
              <Textarea
                id="inq-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex: Tem entrega na minha região? Está disponível em outra cor? Aceita parcelamento?"
                rows={3}
                className="resize-none bg-white/60 border-zinc-900/10 text-zinc-900 placeholder:text-zinc-500 focus:border-[#FF6A00]/50 focus:ring-[#FF6A00]/20 rounded-xl"
              />
            </div>

            <FormDisclaimerStrip />

            {/* Botão de envio */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] hover:from-[#FF7A1A] hover:to-[#FF9C1A] text-white font-black uppercase text-xs tracking-[0.15em] gap-2 mt-1 border-0 rounded-xl shadow-[0_0_24px_rgba(255,106,0,0.35)] hover:shadow-[0_0_32px_rgba(255,106,0,0.5)] transition-all duration-300"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar Interesse
            </Button>

            {/* Footer info */}
            <div className="flex items-center justify-center gap-4 pt-1">
              <span className="flex items-center gap-1 text-[9px] text-zinc-600 font-bold">
                <Shield className="w-3 h-3 text-emerald-600" /> Dados protegidos
              </span>
              <span className="flex items-center gap-1 text-[9px] text-zinc-600 font-bold">
                <Zap className="w-3 h-3 text-[#E65C00]" /> Resposta rápida
              </span>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
