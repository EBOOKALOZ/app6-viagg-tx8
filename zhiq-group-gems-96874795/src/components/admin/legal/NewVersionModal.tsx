import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  FileText, 
  Settings, 
  Edit3, 
  Eye,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface NewVersionData {
  code: string;
  profile_scope: string;
  title: string;
  language: string;
  jurisdiction: string;
  effective_at: string;
  content: string;
}

interface NewVersionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: number;
  setStep: (step: number) => void;
  data: NewVersionData;
  setData: (data: NewVersionData) => void;
  confirmImmutability: boolean;
  setConfirmImmutability: (confirm: boolean) => void;
  publishing: boolean;
  onPublish: () => void;
}

const PROFILE_OPTIONS = [
  { value: "all", label: "Todos os Perfis" },
  { value: "passenger", label: "Passageiro" },
  { value: "driver", label: "Motorista" },
  { value: "motoboy", label: "Motoboy" },
  { value: "mototaxi", label: "Mototáxi" },
  { value: "merchant", label: "Comerciante" },
  { value: "freteiro", label: "Freteiro" },
];

export function NewVersionModal({
  open,
  onOpenChange,
  step,
  setStep,
  data,
  setData,
  confirmImmutability,
  setConfirmImmutability,
  publishing,
  onPublish,
}: NewVersionModalProps) {
  const steps = [
    { number: 1, title: "Configuração", icon: Settings },
    { number: 2, title: "Conteúdo", icon: Edit3 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header institucional */}
        <div className="bg-gradient-to-r from-[#0F3D2E] to-[#1a5a42] px-6 py-5">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg font-semibold">
                  Nova Versão de Documento
                </DialogTitle>
                <p className="text-white/70 text-sm">
                  Crie uma nova versão imutável do documento legal
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-2 mt-5">
            {steps.map((s, i) => (
              <div key={s.number} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    step === s.number
                      ? "bg-white text-[#0F3D2E]"
                      : step > s.number
                      ? "bg-white/30 text-white"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  <s.icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{s.title}</span>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-white/40 mx-2" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    Código do Documento
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Obrigatório
                    </Badge>
                  </Label>
                  <Input
                    placeholder="terms, privacy, lgpd..."
                    value={data.code}
                    onChange={(e) => setData({ ...data, code: e.target.value })}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Identificador único do tipo de documento
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Escopo de Perfil</Label>
                  <Select
                    value={data.profile_scope}
                    onValueChange={(v) => setData({ ...data, profile_scope: v })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFILE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A quais perfis este documento se aplica
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Título do Documento
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    Obrigatório
                  </Badge>
                </Label>
                <Input
                  placeholder="Ex: Termos de Uso da Plataforma"
                  value={data.title}
                  onChange={(e) => setData({ ...data, title: e.target.value })}
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Idioma</Label>
                  <Input
                    placeholder="pt-BR"
                    value={data.language}
                    onChange={(e) => setData({ ...data, language: e.target.value })}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Jurisdição</Label>
                  <Input
                    placeholder="BR"
                    value={data.jurisdiction}
                    onChange={(e) => setData({ ...data, jurisdiction: e.target.value })}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Data de Vigência</Label>
                  <Input
                    type="date"
                    value={data.effective_at}
                    onChange={(e) => setData({ ...data, effective_at: e.target.value })}
                    className="h-11"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Tabs defaultValue="editor" className="w-full">
                <TabsList className="w-full justify-start bg-muted/50 p-1">
                  <TabsTrigger value="editor" className="gap-2">
                    <Edit3 className="h-4 w-4" />
                    Editor
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-2">
                    <Eye className="h-4 w-4" />
                    Pré-visualização
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="editor" className="mt-4">
                  <Textarea
                    placeholder="Digite o conteúdo do documento... (suporta HTML)"
                    value={data.content}
                    onChange={(e) => setData({ ...data, content: e.target.value })}
                    className="min-h-[320px] font-mono text-sm resize-none"
                  />
                </TabsContent>

                <TabsContent value="preview" className="mt-4">
                  <div className="p-6 border rounded-lg bg-muted/20 min-h-[320px] max-h-[400px] overflow-y-auto">
                    {data.content ? (
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(data.content),
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <FileText className="h-12 w-12 mb-3 opacity-30" />
                        <p>Nenhum conteúdo para pré-visualizar</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Aviso de imutabilidade */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      Documento Imutável
                    </span>
                  </div>
                  <p className="text-sm text-amber-700/80 dark:text-amber-400/80">
                    Após a publicação, esta versão não poderá ser editada ou excluída. 
                    Todas as alterações futuras exigirão a criação de uma nova versão.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      id="immutability"
                      checked={confirmImmutability}
                      onCheckedChange={(checked) => setConfirmImmutability(checked as boolean)}
                    />
                    <Label 
                      htmlFor="immutability" 
                      className="text-sm font-medium text-amber-700 dark:text-amber-400 cursor-pointer"
                    >
                      Confirmo que entendo e aceito a imutabilidade
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 bg-muted/30 border-t">
          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              disabled={!data.code || !data.title}
              className="gap-2"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex gap-3 w-full justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button
                onClick={onPublish}
                disabled={publishing || !confirmImmutability || !data.content}
                className="gap-2 bg-[#0F3D2E] hover:bg-[#0F3D2E]/90"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publicando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Publicar Nova Versão
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
