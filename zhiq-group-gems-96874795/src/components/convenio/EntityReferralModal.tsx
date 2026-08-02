import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { HeartHandshake, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function EntityReferralModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    nomeEntidade: "",
    cidade: "",
    responsavel: "",
    telefone: "",
    motivo: "",
    consentimento: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simula envio
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
        setFormData({
          nomeEntidade: "",
          cidade: "",
          responsavel: "",
          telefone: "",
          motivo: "",
          consentimento: false,
        });
      }, 3000);
    }, 1200);
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
    }
  };

  const inputClass = "h-12 bg-white/60 backdrop-blur-md border-emerald-200/50 rounded-2xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all shadow-inner";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[480px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50/95 backdrop-blur-2xl border border-white/40 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.2)] rounded-3xl [&>button]:hidden"
        onEscapeKeyDown={(e) => { if (loading) e.preventDefault(); }}
        onInteractOutside={(e) => { if (loading) e.preventDefault(); }}
      >
        {/* Glowing orb background effect */}
        <div className="absolute top-[-20%] left-[-10%] w-[140%] h-[140%] bg-gradient-to-br from-blue-100/40 via-transparent to-emerald-100/40 pointer-events-none -z-10 blur-3xl" />

        {/* Cabeçalho */}
        <div className="shrink-0 relative bg-gradient-to-br from-blue-600 via-blue-600 to-emerald-500 px-5 pt-5 pb-4">
          <DialogClose asChild>
            <button
              onClick={handleClose}
              aria-label="Fechar"
              className="absolute right-4 top-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white/90 backdrop-blur-md transition-all hover:bg-white/25 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
          <div className="flex items-center gap-3 pr-10 relative z-10">
            <div className="flex items-center justify-center shrink-0 overflow-hidden rounded-xl bg-white/90 p-1 shadow-md ring-1 ring-white/40 h-10 w-10">
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-full w-full object-contain rounded-lg" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">MedPrev</p>
              <DialogTitle className="text-white font-black text-lg leading-tight">
                Indicar entidade
              </DialogTitle>
              <p className="text-white/85 text-xs font-semibold leading-snug mt-0.5">
                Ajude a ampliar nossa rede de solidariedade
              </p>
            </div>
          </div>
        </div>

        {/* Corpo scrollável */}
        <div className="overflow-y-auto max-h-[70vh] p-6 relative custom-scrollbar">
          {success ? (
            <div className="flex flex-col items-center justify-center py-10 text-center animate-in fade-in zoom-in duration-500">
              <div className="h-20 w-20 bg-emerald-100 rounded-full flex items-center justify-center mb-5 ring-8 ring-emerald-50">
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">Indicação enviada!</h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-[80%] mx-auto">
                Muito obrigado por indicar esta entidade. Nossa equipe entrará em contato com ela em breve.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="nomeEntidade" className="text-xs font-bold text-slate-700 ml-1">
                  NOME DA ENTIDADE / INSTITUIÇÃO *
                </Label>
                <Input
                  id="nomeEntidade"
                  required
                  placeholder="Ex: Associação de Amparo XYZ"
                  className={inputClass}
                  value={formData.nomeEntidade}
                  onChange={(e) => setFormData({ ...formData, nomeEntidade: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="cidade" className="text-xs font-bold text-slate-700 ml-1">
                    CIDADE *
                  </Label>
                  <Input
                    id="cidade"
                    required
                    placeholder="Cidade - UF"
                    className={inputClass}
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="telefone" className="text-xs font-bold text-slate-700 ml-1">
                    TELEFONE (OPCIONAL)
                  </Label>
                  <Input
                    id="telefone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    className={inputClass}
                    value={formData.telefone}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, "");
                      if (v.length > 11) v = v.substring(0, 11);
                      if (v.length > 2) v = `(${v.substring(0, 2)}) ${v.substring(2)}`;
                      if (v.length > 9) v = `${v.substring(0, 10)}-${v.substring(10)}`;
                      setFormData({ ...formData, telefone: v });
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="responsavel" className="text-xs font-bold text-slate-700 ml-1">
                  NOME DE UM CONTATO (OPCIONAL)
                </Label>
                <Input
                  id="responsavel"
                  placeholder="Se conhecer alguém lá, informe"
                  className={inputClass}
                  value={formData.responsavel}
                  onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="motivo" className="text-xs font-bold text-slate-700 ml-1">
                  POR QUE INDICAR?
                </Label>
                <textarea
                  id="motivo"
                  rows={3}
                  className={cn("w-full resize-none", inputClass)}
                  placeholder="Conte um pouco sobre o trabalho incrível que eles fazem..."
                  value={formData.motivo}
                  onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                />
              </div>

              <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex gap-3 mt-4">
                <div className="pt-0.5">
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="peer sr-only" 
                      checked={formData.consentimento}
                      onChange={(e) => setFormData({ ...formData, consentimento: e.target.checked })}
                      required
                    />
                    <div className="w-5 h-5 rounded-md border-2 border-slate-300 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors shadow-sm bg-white" />
                    <CheckCircle className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none scale-50 peer-checked:scale-100 duration-200" strokeWidth={3} />
                  </label>
                </div>
                <Label
                  htmlFor="consentimento"
                  className="text-xs font-medium text-slate-600 leading-relaxed cursor-pointer select-none"
                  onClick={() => setFormData(prev => ({ ...prev, consentimento: !prev.consentimento }))}
                >
                  Concordo em enviar esta indicação para análise da equipe MedPrev, ciente de que o cadastro final depende de aprovação.
                </Label>
              </div>

              <div className="pt-4 pb-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 text-white rounded-2xl font-black text-base shadow-[0_8px_32px_-10px_rgba(5,150,105,0.4)] hover:shadow-[0_12px_40px_-10px_rgba(5,150,105,0.6)] hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
                        Enviando indicação...
                      </>
                    ) : (
                      "Enviar Indicação"
                    )}
                  </span>
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
