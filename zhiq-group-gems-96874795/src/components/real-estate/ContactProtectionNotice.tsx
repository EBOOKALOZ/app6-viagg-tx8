import React from 'react';
import { ShieldCheck, EyeOff, Lock, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const ContactProtectionNotice = () => {
  return (
    <div className="space-y-4">
      <Alert className="bg-blue-50 border-blue-200 shadow-sm">
        <ShieldCheck className="h-5 w-5 text-blue-600" />
        <AlertTitle className="text-blue-800 font-bold">Privacidade e Segurança Viagg-TX8</AlertTitle>
        <AlertDescription className="text-blue-700 text-sm">
          Sua tranquilidade é nossa prioridade. Implementamos camadas automáticas de proteção em cada anúncio.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
          <div className="shrink-0">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <EyeOff className="w-5 h-5 text-zinc-600" />
            </div>
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-zinc-900 text-sm">Contato Oculto</h4>
            <p className="text-zinc-600 text-xs leading-relaxed">
              Seu WhatsApp e telefone <strong>não são exibidos publicamente</strong>. Os interessados devem solicitar a liberação via plataforma.
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
          <div className="shrink-0">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Lock className="w-5 h-5 text-zinc-600" />
            </div>
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-zinc-900 text-sm">Imagens Protegidas</h4>
            <p className="text-zinc-600 text-xs leading-relaxed">
              Nossa IA detecta e <strong>mascara automaticamente</strong> contatos em placas, banners ou marcas d'água nas suas fotos.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex gap-3 items-start">
        <Info className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
        <p className="text-orange-800 text-xs font-medium leading-relaxed">
          A plataforma protege seu anúncio e sua monetização, impedindo a desintermediação e garantindo que você tenha o controle total sobre quem acessa seus dados.
        </p>
      </div>
    </div>
  );
};
