import { forwardRef } from 'react';
import { Separator } from '@/components/ui/separator';
import { User, Calendar, DollarSign, CheckCircle, CreditCard, Wallet, Bike } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MotoboyPaymentReceiptData {
  id: string;
  receipt_hash: string;
  motoboy_name: string;
  motoboy_email?: string;
  amount: number;
  payment_method?: string;
  payment_date: string;
  paid_by_name?: string;
  period_start?: string;
  period_end?: string;
  details?: {
    pix_chave?: string;
    banco?: string;
    agencia?: string;
    conta?: string;
    deliveries_count?: number;
  };
}

interface MotoboyPaymentReceiptProps {
  data: MotoboyPaymentReceiptData;
}

export const MotoboyPaymentReceipt = forwardRef<HTMLDivElement, MotoboyPaymentReceiptProps>(
  ({ data }, ref) => {
    return (
      <div ref={ref} className="bg-white text-black p-6 max-w-md mx-auto print:shadow-none">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-3">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold">Comprovante de Pagamento</h1>
          <p className="text-sm font-medium text-green-600 flex items-center justify-center gap-1 mt-1">
            <Wallet className="h-4 w-4" />
            Pagamento ao Motoboy
          </p>
          <p className="text-xs text-gray-500 mt-2 font-mono">
            #{data.receipt_hash.slice(0, 12).toUpperCase()}
          </p>
        </div>

        <Separator className="my-4 bg-gray-200" />

        {/* Motoboy */}
        <div className="flex items-start gap-3 mb-4">
          <Bike className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-xs text-gray-500">Beneficiário</p>
            <p className="font-medium">{data.motoboy_name}</p>
            {data.motoboy_email && (
              <p className="text-sm text-gray-600">{data.motoboy_email}</p>
            )}
          </div>
        </div>

        {/* Período */}
        {(data.period_start || data.period_end) && (
          <div className="flex items-start gap-3 mb-4">
            <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Período</p>
              <p className="font-medium">
                {data.period_start && format(new Date(data.period_start), "dd/MM/yyyy", { locale: ptBR })}
                {data.period_start && data.period_end && " a "}
                {data.period_end && format(new Date(data.period_end), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
        )}

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
            <p className="font-medium">{data.payment_method || 'Não informado'}</p>
            {data.details?.pix_chave && (
              <p className="text-sm text-gray-600">PIX: {data.details.pix_chave}</p>
            )}
            {data.details?.banco && (
              <p className="text-sm text-gray-600">
                {data.details.banco} • Ag: {data.details.agencia} • Conta: {data.details.conta}
              </p>
            )}
          </div>
        </div>

        {/* Quantidade de Entregas */}
        {data.details?.deliveries_count && data.details.deliveries_count > 0 && (
          <div className="flex items-start gap-3 mb-4">
            <Bike className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Entregas no Período</p>
              <p className="font-medium">{data.details.deliveries_count} entregas</p>
            </div>
          </div>
        )}

        <Separator className="my-4 bg-gray-200" />

        {/* Valor */}
        <div className="bg-green-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">Valor Pago</span>
            </div>
            <span className="text-2xl font-bold text-green-600">
              R$ {data.amount.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        {/* Pago por */}
        {data.paid_by_name && (
          <div className="flex items-start gap-3 mb-4">
            <User className="h-5 w-5 text-gray-500 mt-0.5" />
            <div>
              <p className="text-xs text-gray-500">Pago por</p>
              <p className="font-medium">{data.paid_by_name}</p>
            </div>
          </div>
        )}

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

MotoboyPaymentReceipt.displayName = 'MotoboyPaymentReceipt';
