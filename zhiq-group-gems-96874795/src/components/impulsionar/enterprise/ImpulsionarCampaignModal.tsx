import React, { useState, useEffect } from 'react';
import {
  X, Sparkles, Megaphone, MapPin, Calendar, Clock,
  DollarSign, Users, Image as ImageIcon, Video,
  CheckCircle2, AlertCircle, Zap, ShieldCheck, ArrowRight, Sliders
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface CampaignFormData {
  title: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  category: string;
  city: string;
  state: string;
  neighborhood: string;
  radiusKm: number;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  budgetDaily: number;
  durationDays: number;
  priority: 'normal' | 'destaque' | 'urgente';
  targetAudience: string[];
}

interface ImpulsionarCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CampaignFormData) => void;
  initialData?: Partial<CampaignFormData>;
  userBalance?: number;
}

const CATEGORIES = [
  'Frete & Mudanças',
  'Corridas Urbanas (Moto Táxi)',
  'Entregas Rápidas (Motoboy)',
  'Oferta Lojista & Delivery',
  'Alimentação & Gastronomia',
  'Serviços & Autônomos',
  'Outros',
];

const DAYS = [
  { id: 'seg', label: 'Seg' },
  { id: 'ter', label: 'Ter' },
  { id: 'qua', label: 'Qua' },
  { id: 'qui', label: 'Qui' },
  { id: 'sex', label: 'Sex' },
  { id: 'sab', label: 'Sáb' },
  { id: 'dom', label: 'Dom' },
];

const AUDIENCES = [
  { id: 'passageiros', label: 'Passageiros & Clientes' },
  { id: 'motoristas', label: 'Motoristas (Carro)' },
  { id: 'mototaxi', label: 'Moto Táxi' },
  { id: 'motoboy', label: 'Motoboys & Entregadores' },
  { id: 'lojistas', label: 'Comerciantes & Lojistas' },
];

export function ImpulsionarCampaignModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  userBalance = 145.50,
}: ImpulsionarCampaignModalProps) {
  const [formData, setFormData] = useState<CampaignFormData>({
    title: '',
    description: '',
    imageUrl: '',
    videoUrl: '',
    category: 'Entregas Rápidas (Motoboy)',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Centro & Região',
    radiusKm: 15,
    daysOfWeek: ['seg', 'ter', 'qua', 'qui', 'sex'],
    startTime: '08:00',
    endTime: '22:00',
    budgetDaily: 25,
    durationDays: 7,
    priority: 'normal',
    targetAudience: ['passageiros', 'lojistas'],
  });

  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  if (!isOpen) return null;

  // Cálculo de alcance estimado dinâmico
  const baseReach = formData.radiusKm * 1800;
  const audienceMult = Math.max(formData.targetAudience.length, 1) * 0.6 + 0.4;
  const priorityMult = formData.priority === 'urgente' ? 2.0 : formData.priority === 'destaque' ? 1.4 : 1.0;
  const budgetMult = Math.sqrt(formData.budgetDaily / 10);
  const estimatedReach = Math.round(baseReach * audienceMult * priorityMult * budgetMult);

  const totalCost = formData.budgetDaily * formData.durationDays * (formData.priority === 'urgente' ? 1.5 : formData.priority === 'destaque' ? 1.2 : 1.0);
  const hasEnoughBalance = userBalance >= totalCost;

  const handleToggleDay = (dayId: string) => {
    setFormData((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(dayId)
        ? prev.daysOfWeek.filter((d) => d !== dayId)
        : [...prev.daysOfWeek, dayId],
    }));
  };

  const handleToggleAudience = (audId: string) => {
    setFormData((prev) => ({
      ...prev,
      targetAudience: prev.targetAudience.includes(audId)
        ? prev.targetAudience.filter((a) => a !== audId)
        : [...prev.targetAudience, audId],
    }));
  };

  // Mágicas de IA
  const runAIGenerateText = () => {
    setAiLoading('text');
    setTimeout(() => {
      setFormData((prev) => ({
        ...prev,
        title: prev.category.includes('Motoboy')
          ? '⚡ Entregas Express 15min — Prioridade Total na Sua Região!'
          : prev.category.includes('Lojista')
          ? '🔥 Promoção Exclusiva de Frete Grátis & Delivery Rápido!'
          : '🚀 Corridas e Fretes Rápidos — Atendimento 24h com Segurança!',
        description: 'Tenha seu pedido entregue com máxima agilidade e rastreamento em tempo real pela rede RIDV. Aproveite tarifas promocionais para sua cidade com atendimento de confiança e agilidade incomparável! #RIDV #EntregaRapida #Seguranca #Agilidade',
      }));
      setAiLoading(null);
    }, 800);
  };

  const runAIGenerateSchedule = () => {
    setAiLoading('schedule');
    setTimeout(() => {
      setFormData((prev) => ({
        ...prev,
        daysOfWeek: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'],
        startTime: '10:30',
        endTime: '23:30',
        budgetDaily: 35,
        priority: 'destaque',
      }));
      setAiLoading(null);
    }, 600);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-900 dark:text-white leading-tight">
                Criar Nova Campanha de Divulgação
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure alcance, público-alvo e impulsione seus serviços com IA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper / Indicador de passos */}
        <div className="flex items-center justify-between px-6 py-3 bg-zinc-100/50 dark:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800 text-xs font-semibold">
          <button
            onClick={() => setStep(1)}
            className={cn('flex items-center gap-2 transition-colors', step === 1 ? 'text-orange-500 font-black' : 'text-zinc-400')}
          >
            <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px]', step === 1 ? 'bg-orange-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500')}>1</span>
            Conteúdo & IA
          </button>
          <div className="h-px w-8 bg-zinc-200 dark:bg-zinc-700" />
          <button
            onClick={() => setStep(2)}
            className={cn('flex items-center gap-2 transition-colors', step === 2 ? 'text-orange-500 font-black' : 'text-zinc-400')}
          >
            <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px]', step === 2 ? 'bg-orange-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500')}>2</span>
            Público & Região
          </button>
          <div className="h-px w-8 bg-zinc-200 dark:bg-zinc-700" />
          <button
            onClick={() => setStep(3)}
            className={cn('flex items-center gap-2 transition-colors', step === 3 ? 'text-orange-500 font-black' : 'text-zinc-400')}
          >
            <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px]', step === 3 ? 'bg-orange-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500')}>3</span>
            Orçamento & Agenda
          </button>
        </div>

        {/* Corpo do formulário com rolagem */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* PASSO 1: CONTEÚDO & IA */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Botão Mágico IA */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-violet-500/10 border border-orange-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-center sm:text-left">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shrink-0 shadow-md">
                    <Sparkles className="h-5 w-5 animate-spin-slow" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                      Assistente de Criação RIDV
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Gere títulos persuasivos, descrições vendedoras e hashtags com Inteligência Artificial.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={runAIGenerateText}
                  disabled={aiLoading === 'text'}
                  size="sm"
                  className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-md shrink-0 w-full sm:w-auto"
                >
                  {aiLoading === 'text' ? '✨ Gerando com IA...' : '✨ IA: Gerar Título & Descrição'}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Categoria da Campanha
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    URL da Imagem / Banner (Opcional)
                  </label>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="https://exemplo.com/banner.jpg"
                      value={formData.imageUrl}
                      onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Título da Campanha <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Entregas Express com Desconto Especial!"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Descrição Completa & Benefícios <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Descreva os diferenciais do seu serviço ou promoção..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white font-medium leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  URL do Vídeo (YouTube / Reels - Opcional)
                </label>
                <div className="relative">
                  <Video className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="https://youtube.com/watch?v=..."
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2 text-xs text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: PÚBLICO & REGIÃO */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Cidade
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-9 pr-3 py-2 text-xs font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Estado (UF)
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-semibold uppercase text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Bairro / Região
                  </label>
                  <input
                    type="text"
                    value={formData.neighborhood}
                    onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Slider de Raio km */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/50 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-orange-500" />
                    Raio de Atuação Geográfica
                  </label>
                  <span className="text-sm font-black text-orange-500 bg-orange-500/10 px-2.5 py-0.5 rounded-full">
                    {formData.radiusKm} km
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={formData.radiusKm}
                  onChange={(e) => setFormData({ ...formData, radiusKm: parseInt(e.target.value) || 1 })}
                  className="w-full accent-orange-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-bold text-zinc-400">
                  <span>1 km (Bairro local)</span>
                  <span>25 km (Cidade)</span>
                  <span>50 km+ (Metropolitana)</span>
                </div>
              </div>

              {/* Público-alvo segmentado */}
              <div>
                <label className="block text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-orange-500" />
                  Segmentação de Público-Alvo (Quem verá sua campanha)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AUDIENCES.map((aud) => {
                    const selected = formData.targetAudience.includes(aud.id);
                    return (
                      <button
                        key={aud.id}
                        type="button"
                        onClick={() => handleToggleAudience(aud.id)}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-xl border text-left transition-all text-xs font-bold',
                          selected
                            ? 'bg-orange-500/10 border-orange-500 text-orange-600 dark:text-orange-400 shadow-sm'
                            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                        )}
                      >
                        <span>{aud.label}</span>
                        <CheckCircle2 className={cn('h-4 w-4', selected ? 'text-orange-500' : 'text-zinc-300 dark:text-zinc-700')} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* PASSO 3: ORÇAMENTO & AGENDA */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              
              {/* Recomendação IA */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Dica da IA: Horários de pico (10:30–23:30) geram +45% mais cliques na sua região.</span>
                </div>
                <Button
                  type="button"
                  onClick={runAIGenerateSchedule}
                  disabled={aiLoading === 'schedule'}
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] h-7 px-3 shrink-0"
                >
                  {aiLoading === 'schedule' ? 'Aplicando...' : 'Aplicar Dica IA'}
                </Button>
              </div>

              {/* Dias da semana */}
              <div>
                <label className="block text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-orange-500" />
                  Dias da Semana de Exibição
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const sel = formData.daysOfWeek.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleToggleDay(d.id)}
                        className={cn(
                          'px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border',
                          sel
                            ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/20'
                            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300'
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Horários */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" />
                    Horário Início
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" />
                    Horário Término
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Orçamento e Duração */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                    Orçamento Diário (R$)
                  </label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={formData.budgetDaily}
                    onChange={(e) => setFormData({ ...formData, budgetDaily: parseFloat(e.target.value) || 5 })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Duração da Campanha (Dias)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Prioridade */}
              <div>
                <label className="block text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider mb-2">
                  Nível de Prioridade & Impulsionamento
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'normal', label: 'Normal', desc: '1x Exibição', col: 'border-zinc-300 text-zinc-700' },
                    { id: 'destaque', label: 'Destaque 🔥', desc: '1.4x + Topo', col: 'border-orange-500 text-orange-600 bg-orange-500/10 font-black' },
                    { id: 'urgente', label: 'Urgente ⚡', desc: '2x + Push', col: 'border-purple-500 text-purple-600 bg-purple-500/10 font-black' },
                  ].map((p) => {
                    const sel = formData.priority === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: p.id as any })}
                        className={cn(
                          'p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center',
                          sel ? p.col + ' ring-2 ring-orange-500 shadow-sm' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 opacity-80'
                        )}
                      >
                        <span className="text-xs">{p.label}</span>
                        <span className="text-[9px] text-zinc-400 mt-0.5">{p.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SIMULADOR DE ALCANCE E CUSTO REAL */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Estimativa de Desempenho RIDV
                </span>
              </div>
              <span className="text-xs font-bold text-zinc-300">
                {formData.durationDays} {formData.durationDays === 1 ? 'dia' : 'dias'} de campanha
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center sm:text-left">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Alcance Potencial</span>
                <p className="text-lg font-black text-emerald-400">
                  ~{estimatedReach.toLocaleString('pt-BR')} <span className="text-xs font-normal text-zinc-300">pessoas</span>
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Investimento Total</span>
                <p className="text-lg font-black text-amber-400">
                  R$ {totalCost.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1 flex items-center justify-center sm:justify-end">
                {hasEnoughBalance ? (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" /> Saldo Garantido
                  </span>
                ) : (
                  <span className="text-xs font-bold text-rose-400 bg-rose-500/20 border border-rose-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 animate-bounce">
                    <AlertCircle className="h-3.5 w-3.5" /> Saldo Insuficiente
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Rodapé do Modal (Navegação & Ação) */}
        <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((prev) => (prev - 1) as any)}
              className="font-bold text-xs"
            >
              ← Voltar
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-700 font-bold text-xs"
            >
              Cancelar
            </Button>
          )}

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep((prev) => (prev + 1) as any)}
                className="bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900 text-white font-bold text-xs px-5 shadow-md flex items-center gap-1.5"
              >
                Próximo Passo <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!hasEnoughBalance || !formData.title}
                className={cn(
                  'font-extrabold text-xs px-6 shadow-lg flex items-center gap-2',
                  hasEnoughBalance
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-orange-500/25'
                    : 'bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                )}
              >
                <Megaphone className="h-4 w-4" />
                {hasEnoughBalance ? '🚀 Publicar e Impulsionar Agora' : '⚠️ Adquirir Créditos para Ativar'}
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
