/**
 * EntityReferralModal — "Indicar entidade" (Comando Convênio).
 * Formulário público da página /medprev para indicar entidades beneficentes.
 * Grava em convenio_entity_referrals (RLS: INSERT público, leitura restrita
 * ao Gestor); validação com zod + react-hook-form; a tela de sucesso só
 * aparece após o INSERT confirmado.
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCreateEntityReferral } from "@/hooks/convenio/useEntityReferral";

const referralSchema = z.object({
  nomeEntidade: z
    .string()
    .trim()
    .min(2, "Informe o nome da entidade")
    .max(150, "Máximo de 150 caracteres"),
  cidade: z
    .string()
    .trim()
    .min(2, "Informe a cidade")
    .max(100, "Máximo de 100 caracteres"),
  telefone: z
    .string()
    .trim()
    .refine((v) => {
      if (!v) return true;
      const digits = v.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 11;
    }, "Informe um telefone válido com DDD"),
  responsavel: z.string().trim().max(150, "Máximo de 150 caracteres"),
  motivo: z.string().trim().max(1000, "Máximo de 1000 caracteres"),
  consentimento: z
    .boolean()
    .refine((v) => v === true, { message: "É necessário concordar com o envio da indicação" }),
});

type ReferralFormValues = z.infer<typeof referralSchema>;

const DEFAULT_VALUES: ReferralFormValues = {
  nomeEntidade: "",
  cidade: "",
  telefone: "",
  responsavel: "",
  motivo: "",
  consentimento: false,
};

function formatPhone(value: string): string {
  let v = value.replace(/\D/g, "");
  if (v.length > 11) v = v.substring(0, 11);
  if (v.length > 2) v = `(${v.substring(0, 2)}) ${v.substring(2)}`;
  if (v.length > 9) v = `${v.substring(0, 10)}-${v.substring(10)}`;
  return v;
}

export function EntityReferralModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [success, setSuccess] = useState(false);
  const createReferral = useCreateEntityReferral();
  const loading = createReferral.isPending;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReferralFormValues>({
    resolver: zodResolver(referralSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: DEFAULT_VALUES,
  });

  const telefone = watch("telefone") ?? "";
  const consentimento = watch("consentimento") ?? false;

  useEffect(() => {
    if (!open) {
      setSuccess(false);
      reset(DEFAULT_VALUES);
      createReferral.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => onOpenChange(false), 3000);
    return () => clearTimeout(timer);
  }, [success, onOpenChange]);

  const onSubmit = async (values: ReferralFormValues) => {
    try {
      await createReferral.mutateAsync({
        nome_entidade: values.nomeEntidade,
        cidade: values.cidade,
        responsavel: values.responsavel || null,
        telefone: values.telefone || null,
        motivo: values.motivo || null,
      });
      setSuccess(true);
    } catch (err) {
      console.error("[EntityReferralModal] error:", err);
      toast.error("Não foi possível enviar a indicação. Verifique sua conexão e tente novamente.");
    }
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
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1">
                <Label htmlFor="nomeEntidade" className="text-xs font-bold text-slate-700 ml-1">
                  NOME DA ENTIDADE / INSTITUIÇÃO *
                </Label>
                <Input
                  id="nomeEntidade"
                  placeholder="Ex: Associação de Amparo XYZ"
                  maxLength={150}
                  className={cn(inputClass, errors.nomeEntidade && "border-red-400 focus:border-red-500")}
                  {...register("nomeEntidade")}
                />
                {errors.nomeEntidade && (
                  <p className="text-[11px] text-red-500 font-bold ml-1">{errors.nomeEntidade.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="cidade" className="text-xs font-bold text-slate-700 ml-1">
                    CIDADE *
                  </Label>
                  <Input
                    id="cidade"
                    placeholder="Cidade - UF"
                    maxLength={100}
                    className={cn(inputClass, errors.cidade && "border-red-400 focus:border-red-500")}
                    {...register("cidade")}
                  />
                  {errors.cidade && (
                    <p className="text-[11px] text-red-500 font-bold ml-1">{errors.cidade.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="telefone" className="text-xs font-bold text-slate-700 ml-1">
                    TELEFONE (OPCIONAL)
                  </Label>
                  <Input
                    id="telefone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    className={cn(inputClass, errors.telefone && "border-red-400 focus:border-red-500")}
                    value={telefone}
                    onChange={(e) => setValue("telefone", formatPhone(e.target.value), { shouldValidate: true })}
                  />
                  {errors.telefone && (
                    <p className="text-[11px] text-red-500 font-bold ml-1">{errors.telefone.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="responsavel" className="text-xs font-bold text-slate-700 ml-1">
                  NOME DE UM CONTATO (OPCIONAL)
                </Label>
                <Input
                  id="responsavel"
                  placeholder="Se conhecer alguém lá, informe"
                  maxLength={150}
                  className={cn(inputClass, errors.responsavel && "border-red-400 focus:border-red-500")}
                  {...register("responsavel")}
                />
                {errors.responsavel && (
                  <p className="text-[11px] text-red-500 font-bold ml-1">{errors.responsavel.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="motivo" className="text-xs font-bold text-slate-700 ml-1">
                  POR QUE INDICAR?
                </Label>
                <textarea
                  id="motivo"
                  rows={3}
                  maxLength={1000}
                  className={cn("w-full resize-none", inputClass, errors.motivo && "border-red-400 focus:border-red-500")}
                  placeholder="Conte um pouco sobre o trabalho incrível que eles fazem..."
                  {...register("motivo")}
                />
                {errors.motivo && (
                  <p className="text-[11px] text-red-500 font-bold ml-1">{errors.motivo.message}</p>
                )}
              </div>

              <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 flex gap-3 mt-4">
                <div className="pt-0.5">
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={consentimento}
                      onChange={(e) => setValue("consentimento", e.target.checked, { shouldValidate: true })}
                    />
                    <div className="w-5 h-5 rounded-md border-2 border-slate-300 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors shadow-sm bg-white" />
                    <CheckCircle className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none scale-50 peer-checked:scale-100 duration-200" strokeWidth={3} />
                  </label>
                </div>
                <Label
                  htmlFor="consentimento"
                  className="text-xs font-medium text-slate-600 leading-relaxed cursor-pointer select-none"
                  onClick={() => setValue("consentimento", !consentimento, { shouldValidate: true })}
                >
                  Concordo em enviar esta indicação para análise da equipe MedPrev, ciente de que o cadastro final depende de aprovação.
                </Label>
              </div>
              {errors.consentimento && (
                <p className="text-[11px] text-red-500 font-bold ml-1">{errors.consentimento.message}</p>
              )}

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
                    ) : createReferral.isError ? (
                      "Tentar novamente"
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
