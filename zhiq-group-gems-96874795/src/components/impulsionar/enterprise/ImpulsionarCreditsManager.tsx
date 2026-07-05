import React, { useState } from 'react';
import {
  Sparkles, CreditCard, Wallet, ArrowUpRight, ArrowDownRight,
  ShieldCheck, CheckCircle2, QrCode, Zap, AlertCircle, RefreshCw,
  History, Gift, Award, DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ImpulsionarCreditsManager() {
  const [credits, setCredits] = useState(350);
  const [usedCredits, setUsedCredits] = useState(1250);
  const [selectedPkg, setSelectedPkg] = useState<number | null>(1);
  const [isSimulatingPix, setIsSimulatingPix] = useState(false);
  const [pixSuccess, setPixSuccess] = useState(false);

  const packages = [
    {
      id: 0,
      name: 'Pacote Básico',
      credits: 100,
      price: 20.00,
      discount: 'Sem desconto',
      popular: false,
      color: 'border-zinc-200 dark:border-zinc-800',
    },
    {
      id: 1,
      name: 'Pacote Empreendedor',
      credits: 350,
      price: 60.00,
      discount: '15% OFF · Economize R$ 10',
      popular: true,
      color: 'border-orange-500 bg-orange-500/5 ring-2 ring-orange-500',
    },
    {
      id: 2,
      name: 'Pacote Enterprise VIP',
      credits: 1000,
      price: 150.00,
      discount: '25% OFF · Economize R$ 50',
      popular: false,
      color: 'border-purple-500 bg-purple-500/5',
    },
    {
      id: 3,
      name: 'Pacote Master Rede',
      credits: 5000,
      price: 650.00,
      discount: '40% OFF · Economize R$ 350',
      popular: false,
      color: 'border-emerald-500 bg-emerald-500/5',
    },
  ];

  const handleSimulatePix = () => {
    if (selectedPkg === null) return;
    setIsSimulatingPix(true);
    setPixSuccess(false);

    setTimeout(() => {
      const pkg = packages[selectedPkg];
      setCredits((prev) => prev + pkg.credits);
      setIsSimulatingPix(false);
      setPixSuccess(true);
      setTimeout(() => setPixSuccess(false), 5000);
    }, 2000);
  };

  const transactions = [
    { id: 'tx-1', type: 'use', desc: 'Consumo Campanha: Entregas Express', val: -45, date: 'Hoje, 11:30' },
    { id: 'tx-2', type: 'add', desc: 'Recarga Pix — Pacote Empreendedor', val: '+350', date: 'Ontem, 16:15' },
    { id: 'tx-3', type: 'use', desc: 'Consumo Campanha: Promoção Lojista', val: -80, date: '03 Jul, 19:40' },
    { id: 'tx-4', type: 'use', desc: 'Consumo Campanha: Coruja 24h', val: -60, date: '01 Jul, 02:15' },
    { id: 'tx-5', type: 'add', desc: 'Bônus de Indicação de Grupo RIDV', val: '+50', date: '28 Jun, 14:00' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Alerta de Sucesso de Aquisição */}
      {pixSuccess && (
        <div className="p-4 rounded-3xl bg-emerald-500 text-white font-bold text-sm shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-6 w-6 shrink-0 animate-bounce" />
            <div>
              <div>🎉 Recarga Pix Aprovada Instantaneamente!</div>
              <div className="text-xs font-normal text-emerald-100">
                Seu novo saldo de créditos já está disponível para impulsionar suas campanhas.
              </div>
            </div>
          </div>
          <span className="text-lg font-black bg-white/20 px-3 py-1 rounded-2xl">{credits} Créditos</span>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent border border-amber-500/20">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-zinc-900 dark:text-white tracking-tight leading-none">
              Sistema de Créditos de Impulsionamento
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Gerencie seus créditos RIDV para exibir campanhas e conquistar clientes com máxima prioridade.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-500 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-2xl flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Pix 100% Automatizado
          </span>
        </div>
      </div>

      {/* 4 Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Créditos Disponíveis',
            value: credits.toLocaleString('pt-BR'),
            sub: 'Saldo ativo',
            icon: Sparkles,
            col: 'text-amber-500',
            bg: 'bg-amber-500/10',
          },
          {
            label: 'Créditos Consumidos',
            value: usedCredits.toLocaleString('pt-BR'),
            sub: 'Desde o início',
            icon: CreditCard,
            col: 'text-sky-500',
            bg: 'bg-sky-500/10',
          },
          {
            label: 'Previsão de Consumo',
            value: '~45 / dia',
            sub: '3 campanhas ativas',
            icon: Zap,
            col: 'text-purple-500',
            bg: 'bg-purple-500/10',
          },
          {
            label: 'Validade dos Créditos',
            value: 'Vitalício',
            sub: 'Nunca expiram',
            icon: ShieldCheck,
            col: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
          },
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="rounded-2xl p-4 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{card.label}</span>
                <div className={cn('p-2 rounded-xl shrink-0', card.bg)}>
                  <Icon className={cn('h-4 w-4', card.col)} />
                </div>
              </div>
              <div>
                <div className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">{card.value}</div>
                <div className="text-[11px] font-bold text-zinc-400 mt-1">{card.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Loja de Recarga com Simulação Pix */}
      <div className="rounded-3xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div>
            <h3 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Gift className="h-5 w-5 text-orange-500" />
              Pacotes de Recarga de Créditos RIDV
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Escolha um pacote abaixo e realize a ativação imediata via Pix instantâneo.
            </p>
          </div>
          <span className="text-[11px] font-extrabold text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full self-start sm:self-auto">
            ⚡ Ativação em 5 segundos
          </span>
        </div>

        {/* Grid de Pacotes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg) => {
            const isSelected = selectedPkg === pkg.id;
            return (
              <div
                key={pkg.id}
                onClick={() => setSelectedPkg(pkg.id)}
                className={cn(
                  'relative rounded-3xl p-5 border transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4',
                  pkg.color,
                  isSelected
                    ? 'shadow-lg shadow-orange-500/10 bg-gradient-to-b from-orange-500/10 to-transparent'
                    : 'bg-white dark:bg-zinc-900/90 hover:border-zinc-300 dark:hover:border-zinc-700'
                )}
              >
                {pkg.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full shadow-md">
                    Mais Escolhido 🔥
                  </span>
                )}

                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-extrabold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    {pkg.name}
                  </span>
                  <div className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-1">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    {pkg.credits.toLocaleString('pt-BR')} <span className="text-xs font-bold text-zinc-400">créditos</span>
                  </div>
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {pkg.discount}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Preço único</span>
                    <span className="text-lg font-black text-zinc-900 dark:text-white">
                      R$ {pkg.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center border transition-colors',
                      isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-zinc-300 dark:border-zinc-700'
                    )}
                  >
                    {isSelected && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Caixa de Ação do Pix */}
        <div className="p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 text-center sm:text-left">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
              <QrCode className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-black text-zinc-900 dark:text-white">
                {selectedPkg !== null ? `Recarga de ${packages[selectedPkg].credits} Créditos RIDV` : 'Selecione um Pacote'}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {selectedPkg !== null
                  ? `Valor: R$ ${packages[selectedPkg].price.toFixed(2).replace('.', ',')} via Pix Copia e Cola ou QR Code.`
                  : 'Clique em um dos cards acima para continuar.'}
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleSimulatePix}
            disabled={selectedPkg === null || isSimulatingPix}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-6 h-11 rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 shrink-0 w-full sm:w-auto"
          >
            {isSimulatingPix ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Processando Pix...
              </>
            ) : (
              <>
                <QrCode className="h-4 w-4" />
                Gerar Pix Instantâneo
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Histórico de Transações */}
      <div className="rounded-3xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-4">
        <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <History className="h-4 w-4 text-orange-500" />
          Extrato e Histórico de Uso de Créditos
        </h3>

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {transactions.map((tx) => (
            <div key={tx.id} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'p-2 rounded-xl shrink-0',
                    tx.type === 'add' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                  )}
                >
                  {tx.type === 'add' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">{tx.desc}</h4>
                  <span className="text-[11px] text-zinc-400">{tx.date}</span>
                </div>
              </div>

              <span
                className={cn(
                  'text-xs font-black px-2.5 py-1 rounded-full',
                  tx.type === 'add' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                )}
              >
                {tx.val} {tx.type === 'add' ? 'Créditos' : 'Créditos'}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
