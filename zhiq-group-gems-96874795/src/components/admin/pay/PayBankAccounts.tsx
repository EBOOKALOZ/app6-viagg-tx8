/**
 * PayBankAccounts — Premium bank accounts management with CRUD
 */
import { useState } from "react";
import {
  Building2, User, Star, CreditCard, Plus, Eye,
  Edit, Power, PowerOff, CheckCircle, Shield,
  Key, Hash, Loader2, Copy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  usePayPlatformBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useSetDefaultBankAccount,
  useToggleBankAccountActive,
} from "@/hooks/useAdminPayBankAccounts";
import { truncateId } from "@/skills/pay/payUtils";
import type { PlatformBankAccount } from "@/skills/pay/payTypes";

const PIX_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
];

function maskDocument(doc: string | null): string {
  if (!doc) return "—";
  if (doc.length === 11) return `${doc.slice(0, 3)}.***.*${doc.slice(-2)}`;
  if (doc.length === 14) return `${doc.slice(0, 2)}.***.***/***${doc.slice(-2)}`;
  return `${doc.slice(0, 4)}...${doc.slice(-3)}`;
}

export default function PayBankAccounts() {
  const { toast } = useToast();
  const { data: accounts, isLoading } = usePayPlatformBankAccounts();
  const createMutation = useCreateBankAccount();
  const updateMutation = useUpdateBankAccount();
  const setDefaultMutation = useSetDefaultBankAccount();
  const toggleActiveMutation = useToggleBankAccountActive();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlatformBankAccount | null>(null);
  const [selected, setSelected] = useState<PlatformBankAccount | null>(null);
  const [form, setForm] = useState<Partial<PlatformBankAccount>>({});

  const all = accounts || [];
  const active = all.filter(a => a.is_active);
  const inactive = all.filter(a => !a.is_active);
  const defaultAccount = all.find(a => a.is_default);
  const business = all.filter(a => a.account_type === "business");
  const personal = all.filter(a => a.account_type === "personal");

  const openCreate = () => { setEditing(null); setForm({ account_type: "personal", is_default: false }); setShowForm(true); };
  const openEdit = (a: PlatformBankAccount) => { setEditing(a); setForm({ ...a }); setShowForm(true); };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...form });
        toast({ title: "Conta atualizada" });
      } else {
        await createMutation.mutateAsync(form);
        toast({ title: "Conta criada" });
      }
      setShowForm(false);
      setForm({});
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    }
  };

  const summaryCards = [
    { label: "Ativas", value: active.length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Conta Padrão", value: defaultAccount?.account_label || defaultAccount?.bank_name || "Não definida", icon: Star, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", isText: true },
    { label: "Empresariais", value: business.length, icon: Building2, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
    { label: "Pessoais", value: personal.length, icon: User, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Inativas", value: inactive.length, icon: PowerOff, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-950/30" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md">
            <CreditCard className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight">Contas Bancárias da Plataforma</h3>
            <p className="text-[10px] text-muted-foreground">Contas de destino autorizadas para tesouraria</p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 shadow-md">
          <Plus className="h-3.5 w-3.5" /> Nova Conta
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {summaryCards.map(c => (
          <Card key={c.label} className="border shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                <span className="text-[8px] text-muted-foreground font-extrabold uppercase tracking-[0.15em]">{c.label}</span>
              </div>
              <p className={`font-black tabular-nums ${c.color} ${(c as any).isText ? "text-sm truncate" : "text-lg"}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Accounts Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-[200px] rounded-2xl" />)}
        </div>
      ) : all.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm font-bold text-muted-foreground">Nenhuma conta cadastrada</p>
            <p className="text-xs text-muted-foreground mt-1">Cadastre a primeira conta bancária da plataforma</p>
            <Button size="sm" onClick={openCreate} className="mt-4 gap-1.5"><Plus className="h-3 w-3" /> Criar Conta</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {all.map(account => {
            const isBusiness = account.account_type === "business";
            return (
              <Card key={account.id} className={`relative overflow-hidden border shadow-md transition-all hover:shadow-lg ${
                account.is_default ? "ring-2 ring-emerald-400 shadow-emerald-100" : ""
              } ${!account.is_active ? "opacity-60" : ""}`}>
                {/* Top gradient bar */}
                <div className={`h-1.5 ${isBusiness ? "bg-gradient-to-r from-indigo-500 to-blue-500" : "bg-gradient-to-r from-sky-400 to-cyan-500"}`} />

                {account.is_default && (
                  <div className="absolute top-3 right-3">
                    <Badge className="text-[8px] bg-emerald-500 text-white font-bold gap-1 px-2">
                      <Star className="h-2.5 w-2.5" /> PADRÃO
                    </Badge>
                  </div>
                )}

                <CardContent className="p-4 space-y-3">
                  {/* Account header */}
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isBusiness ? "bg-indigo-100 dark:bg-indigo-950" : "bg-sky-100 dark:bg-sky-950"
                    }`}>
                      {isBusiness ? <Building2 className="h-5 w-5 text-indigo-600" /> : <User className="h-5 w-5 text-sky-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{account.account_label || account.bank_name || "Sem nome"}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge className={`text-[7px] ${isBusiness ? "bg-indigo-100 text-indigo-700" : "bg-sky-100 text-sky-700"}`}>
                          {isBusiness ? "EMPRESARIAL" : "PESSOAL"}
                        </Badge>
                        <Badge className={`text-[7px] ${account.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {account.is_active ? "ATIVA" : "INATIVA"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Account details */}
                  <div className="space-y-1.5 text-[11px]">
                    {account.holder_name && (
                      <div className="flex items-center gap-2">
                        <Shield className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Favorecido:</span>
                        <span className="font-bold truncate">{account.holder_name}</span>
                      </div>
                    )}
                    {account.holder_document && (
                      <div className="flex items-center gap-2">
                        <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Documento:</span>
                        <span className="font-mono">{maskDocument(account.holder_document)}</span>
                      </div>
                    )}
                    {account.bank_name && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Banco:</span>
                        <span className="font-bold">{account.bank_name} {account.bank_code ? `(${account.bank_code})` : ""}</span>
                      </div>
                    )}
                    {(account.branch || account.account_number) && (
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Ag/Cc:</span>
                        <span className="font-mono">{account.branch || "—"} / {account.account_number}{account.account_digit ? `-${account.account_digit}` : ""}</span>
                      </div>
                    )}
                    {account.pix_key && (
                      <div className="flex items-center gap-2">
                        <Key className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="text-muted-foreground">PIX:</span>
                        <span className="font-mono text-[10px] truncate">{account.pix_key}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pt-1.5 border-t">
                    {!account.is_default && account.is_active && (
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-amber-600 hover:bg-amber-50" onClick={() => setDefaultMutation.mutate(account.id)}>
                        <Star className="h-3 w-3" /> Tornar Padrão
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => openEdit(account)}>
                      <Edit className="h-3 w-3" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => toggleActiveMutation.mutate({ id: account.id, is_active: !account.is_active })}>
                      {account.is_active ? <PowerOff className="h-3 w-3 text-red-400" /> : <Power className="h-3 w-3 text-emerald-500" />}
                      {account.is_active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 ml-auto" onClick={() => setSelected(account)}>
                      <Eye className="h-3 w-3" /> Ver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-indigo-600" /> {editing ? "Editar Conta" : "Nova Conta Bancária"}</DialogTitle>
            <DialogDescription>Conta de destino autorizada para saques da plataforma</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-[11px] font-bold">Nome da Conta</Label>
                <Input value={form.account_label || ""} onChange={e => setForm(p => ({ ...p, account_label: e.target.value }))} placeholder="Ex: Conta Principal" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[11px] font-bold">Tipo</Label>
                <Select value={form.account_type || "personal"} onValueChange={v => setForm(p => ({ ...p, account_type: v as any }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="personal">Pessoal</SelectItem><SelectItem value="business">Empresarial</SelectItem></SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-[11px] font-bold">Favorecido</Label>
                <Input value={form.holder_name || ""} onChange={e => setForm(p => ({ ...p, holder_name: e.target.value }))} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[11px] font-bold">Documento</Label>
                <Input value={form.holder_document || ""} onChange={e => setForm(p => ({ ...p, holder_document: e.target.value }))} placeholder="CPF ou CNPJ" className="h-8 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-[11px] font-bold">Banco</Label>
                <Input value={form.bank_name || ""} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[11px] font-bold">Código</Label>
                <Input value={form.bank_code || ""} onChange={e => setForm(p => ({ ...p, bank_code: e.target.value }))} placeholder="001" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[11px] font-bold">Agência</Label>
                <Input value={form.branch || ""} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} className="h-8 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-[11px] font-bold">Conta</Label>
                <Input value={form.account_number || ""} onChange={e => setForm(p => ({ ...p, account_number: e.target.value }))} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-[11px] font-bold">Dígito</Label>
                <Input value={form.account_digit || ""} onChange={e => setForm(p => ({ ...p, account_digit: e.target.value }))} className="h-8 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-[11px] font-bold">Tipo PIX</Label>
                <Select value={form.pix_key_type || ""} onValueChange={v => setForm(p => ({ ...p, pix_key_type: v }))}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>{PIX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="text-[11px] font-bold">Chave PIX</Label>
                <Input value={form.pix_key || ""} onChange={e => setForm(p => ({ ...p, pix_key: e.target.value }))} className="h-8 text-sm" /></div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch checked={form.is_default || false} onCheckedChange={v => setForm(p => ({ ...p, is_default: v }))} />
              <Label className="text-[11px] font-bold">Definir como conta padrão</Label>
            </div>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-blue-600 mt-2">
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {editing ? "Salvar Alterações" : "Criar Conta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Drawer */}
      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Detalhes da Conta</SheetTitle>
            <SheetDescription>Informações completas da conta bancária</SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 mt-4">
              <div className={`rounded-xl p-4 ${selected.account_type === "business" ? "bg-indigo-50 dark:bg-indigo-950/30" : "bg-sky-50 dark:bg-sky-950/30"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {selected.account_type === "business" ? <Building2 className="h-5 w-5 text-indigo-600" /> : <User className="h-5 w-5 text-sky-600" />}
                  <p className="text-base font-black">{selected.account_label || selected.bank_name}</p>
                </div>
                <div className="flex gap-2">
                  <Badge className={selected.account_type === "business" ? "bg-indigo-200 text-indigo-800 text-[8px]" : "bg-sky-200 text-sky-800 text-[8px]"}>
                    {selected.account_type === "business" ? "EMPRESARIAL" : "PESSOAL"}
                  </Badge>
                  {selected.is_default && <Badge className="bg-emerald-200 text-emerald-800 text-[8px]">PADRÃO</Badge>}
                  <Badge className={selected.is_active ? "bg-emerald-200 text-emerald-800 text-[8px]" : "bg-gray-200 text-gray-600 text-[8px]"}>
                    {selected.is_active ? "ATIVA" : "INATIVA"}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  ["ID", selected.id],
                  ["Favorecido", selected.holder_name],
                  ["Documento", selected.holder_document],
                  ["Banco", `${selected.bank_name || "—"} (${selected.bank_code || "—"})`],
                  ["Agência", selected.branch],
                  ["Conta", `${selected.account_number || "—"}${selected.account_digit ? `-${selected.account_digit}` : ""}`],
                  ["Tipo PIX", selected.pix_key_type],
                  ["Chave PIX", selected.pix_key],
                  ["Criada em", selected.created_at],
                  ["Atualizada em", selected.updated_at],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-start gap-2 text-[11px] py-1.5 border-b border-border/40">
                    <span className="font-bold text-muted-foreground min-w-[100px] shrink-0">{label}</span>
                    <span className="font-mono text-[10px] break-all">{value || "—"}</span>
                  </div>
                ))}
              </div>
              {selected.metadata && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground mb-1">Metadata</p>
                  <pre className="bg-gray-900 text-green-400 rounded-lg p-2 text-[9px] overflow-x-auto max-h-32">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
