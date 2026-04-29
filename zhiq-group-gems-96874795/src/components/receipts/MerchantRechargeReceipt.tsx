import { forwardRef } from 'react';
import { Separator } from '@/components/ui/separator';
import { Store, Calendar, DollarSign, CheckCircle, CreditCard, Wallet, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MerchantRechargeReceiptData {
  id: string;
  receipt_hash: string;
  store_name: string;
  store_email?: string;
  amount: number;
  payment_method?: string;
  payment_date: string;
  paid_by_name?: string;
  details?: {
    pix_chave?: string;
    observation?: string;
    new_balance?: number;
  };
}

interface MerchantRechargeReceiptProps {
  data: MerchantRechargeReceiptData;
}

export const MerchantRechargeReceipt = forwardRef<HTMLDivElement, MerchantRechargeReceiptProps>(
  ({ data }, ref) => {
    return (
      <div ref={ref} className="bg-white text-black p-6 max-w-md mx-auto print:shadow-none">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-3">
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold">Comprovante de Recarga</h1>
          <p className="text-sm font-medium text-green-600 flex items-center justify-center gap-1 mt-1">
            <Wallet className="h-4 w-4" />
            Crédito Adicionado
          </p>
          <p className="text-xs text-gray-500 mt-2 font-mono">
            #{data.receipt_hash.slice(0, 12).toUpperCase()}
          </p>
        </div>

        <Separator className="my-4 bg-gray-200" />

        {/* Loja */}
        <div className="flex items-start gap-3 mb-4">
          <Store className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Estabelecimento</p>
            <p className="font-medium">{data.store_name}</p>
            {data.store_email && (
              <p className="text-sm text-gray-600">{data.store_email}</p>
            )}
          </div>
        </div>

        {/* Data do Pagamento */}
        <div className="flex items-start gap-3 mb-4">
          <Calendar className="h-5 w-5 text-gray-500 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Data do Pagamento</p>
            <p className="font-medium">
              {format(new Date(data.payment_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>

        <Separator className="my-4 bg-gray-200" />

        {/* Método de Pagamento */}
        <div className="flex items-start gap-3 mb-4">
          <CreditCard className="h-5 w-5 text-purple-600 mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Método de Pagamento</p>
            <p className="font-medium">{data.payment_method || 'PIX / Transferência'}</p>
            {data.details?.pix_chave && (
              <p className="text-sm text-gray-600">PIX: {data.details.pix_chave}</p>
            )}
          </div>
        </div>

        {/* Observação */}
        {data.details?.observation && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-500 mb-1">Observação</p>
            <p className="text-sm">{data.details.observation}</p>
          </div>
        )}

        <Separator className="my-4 bg-gray-200" />

        {/* Valor */}
        <div className="bg-green-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">Valor da Recarga</span>
            </div>
            <span className="text-2xl font-bold text-green-600">
              R$ {data.amount.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        {/* Novo Saldo */}
        {data.details?.new_balance !== undefined && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-800">Novo Saldo</span>
              </div>
              <span className="text-xl font-bold text-blue-600">
                R$ {data.details.new_balance.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center justify-center gap-2 text-green-600 font-medium mb-4">
          <CheckCircle className="h-5 w-5" />
          <span>Pagamento Confirmado</span>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            Comprovante gerado automaticamente
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Viagg Entregas • {format(new Date(), 'yyyy')}
          </p>
        </div>
      </div>
    );
  }
);

MerchantRechargeReceipt.displayName = 'MerchantRechargeReceipt';
