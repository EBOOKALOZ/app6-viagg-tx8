import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, XCircle } from "lucide-react";

interface MathCaptchaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user gets the answer right. */
  onConfirmed: () => void | Promise<void>;
  /** Optional. Defaults to "Confirme para salvar". */
  title?: string;
  /** Optional. Defaults to "Para sua segurança, resolva a soma abaixo antes de salvar." */
  description?: string;
}

function generateChallenge() {
  const x = 1 + Math.floor(Math.random() * 9);
  const y = 1 + Math.floor(Math.random() * 9);
  return { x, y, answer: x + y };
}

export function MathCaptchaDialog({
  open,
  onOpenChange,
  onConfirmed,
  title = "Confirme para salvar",
  description = "Para sua segurança, resolva a soma abaixo antes de salvar.",
}: MathCaptchaDialogProps) {
  const [challenge, setChallenge] = useState(() => generateChallenge());
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setChallenge(generateChallenge());
      setValue("");
      setError(false);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed) || parsed !== challenge.answer) {
      setError(true);
      setChallenge(generateChallenge());
      setValue("");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirmed();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="text-center">
            <span className="text-4xl font-black tracking-tight">
              {challenge.x} + {challenge.y} = ?
            </span>
          </div>
          <Input
            type="number"
            inputMode="numeric"
            autoFocus
            placeholder="Digite o resultado"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="text-center text-lg font-bold"
            disabled={submitting}
          />
          {error && (
            <p className="flex items-center justify-center gap-2 text-sm font-medium text-red-500">
              <XCircle className="h-4 w-4" />
              Resposta incorreta. Tente novamente.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || value.trim().length === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {submitting ? "Salvando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
