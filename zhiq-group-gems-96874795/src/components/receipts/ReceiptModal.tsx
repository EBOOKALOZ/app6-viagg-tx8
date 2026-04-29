import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Download, X } from 'lucide-react';
import { MotoboyPaymentReceipt, MotoboyPaymentReceiptData } from './MotoboyPaymentReceipt';
import { MerchantRechargeReceipt, MerchantRechargeReceiptData } from './MerchantRechargeReceipt';
import { DeliveryReceipt, DeliveryReceiptData } from '@/components/delivery/DeliveryReceipt';

type ReceiptType = 'delivery' | 'motoboy_payment' | 'merchant_recharge';

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  type: ReceiptType;
  data: DeliveryReceiptData | MotoboyPaymentReceiptData | MerchantRechargeReceiptData;
}

export function ReceiptModal({ open, onClose, type, data }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (receiptRef.current) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Comprovante</title>
              <style>
                body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
                @media print { body { padding: 0; } }
              </style>
            </head>
            <body>
              ${receiptRef.current.outerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      }
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'delivery': return 'Comprovante de Entrega';
      case 'motoboy_payment': return 'Comprovante de Pagamento';
      case 'merchant_recharge': return 'Comprovante de Recarga';
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          {type === 'delivery' && (
            <DeliveryReceipt ref={receiptRef} data={data as DeliveryReceiptData} showMap={false} />
          )}
          {type === 'motoboy_payment' && (
            <MotoboyPaymentReceipt ref={receiptRef} data={data as MotoboyPaymentReceiptData} />
          )}
          {type === 'merchant_recharge' && (
            <MerchantRechargeReceipt ref={receiptRef} data={data as MerchantRechargeReceiptData} />
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Fechar
          </Button>
          <Button onClick={handlePrint}>
            <Download className="h-4 w-4 mr-2" />
            Imprimir / Baixar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
