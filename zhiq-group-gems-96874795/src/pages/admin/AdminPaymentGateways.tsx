/**
 * AdminPaymentGateways — Painel para configurar provedores de pagamento.
 *
 * Lista todos os drivers disponíveis no registry, permite cadastrar
 * credenciais, marcar um como ativo, testar conexão, e oferece um
 * "Console Mock" para forçar cenários de falha/atraso em desenvolvimento.
 *
 * FASE 1: backed por localStorage (gatewayStorage). Quando o schema
 *         payment_gateways for criado, troca-se o adapter e essa página
 *         passa a operar sobre o banco — sem mudar nada aqui.
 */

import { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Settings2,
  Beaker,
  AlertTriangle,
  Plug,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import { usePaymentGateways } from '@/hooks/usePaymentGateways';
import { DRIVER_CATALOG, listAllDriverCodes } from '@/lib/payments/registry';
import type { StoredGateway } from '@/lib/payments/storage';
import type {
  GatewayMode,
  GatewayCredentials,
  GatewayConfig,
} from '@/lib/payments';

/* ────────────────────────────────────────────────────────── */

export default function AdminPaymentGateways() {
  const {
    gateways,
    activeGateway,
    isLoading,
    upsertGateway,
    removeGateway,
    setActive,
    testConnection,
    isMutating,
  } = usePaymentGateways();

  const [editing, setEditing] = useState<StoredGateway | null>(null);
  const [creatingProvider, setCreatingProvider] = useState<string | null>(null);

  const handleSetActive = async (gw: StoredGateway) => {
    try {
      await setActive(gw.id);
      toast.success(`Gateway ativo: ${gw.display_name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ativar gateway');
    }
  };

  const handleTest = async (gw: StoredGateway) => {
    toast.loading('Testando conexão…', { id: `test-${gw.id}` });
    const res = await testConnection(gw);
    toast.dismiss(`test-${gw.id}`);
    if (res.ok) {
      toast.success(`${gw.display_name}: conexão OK${res.error ? ` (${res.error})` : ''}`);
    } else {
      toast.error(`${gw.display_name}: ${res.error ?? 'falhou'}`);
    }
  };

  const handleRemove = async (gw: StoredGateway) => {
    if (gw.is_active) {
      toast.error('Não pode remover o gateway ativo. Ative outro primeiro.');
      return;
    }
    if (!confirm(`Remover "${gw.display_name}"?`)) return;
    await removeGateway(gw.id);
    toast.success('Gateway removido');
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* ═══════════════════════════════ HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20 ring-2 ring-purple-400/20">
            <Plug className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Gateways de Pagamento</h1>
              <div className="h-6 w-px bg-border mx-1" />
              <span className="text-base font-light text-muted-foreground">
                Configuração de Provedores
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">
              Pluggable · Driver Pattern · Mock-first · Backend-driven
            </p>
          </div>
        </div>

        {activeGateway && (
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-3.5 py-1.5 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wider">
              ATIVO: {activeGateway.display_name}
            </span>
          </div>
        )}
      </div>

      {/* Aviso Fase 1 */}
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-xs">
          <strong>Fase 1 — armazenamento local.</strong> Credenciais estão em{' '}
          <code className="text-[11px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">localStorage</code>{' '}
          para desenvolvimento. Na Fase 1-DB, serão movidas para a tabela{' '}
          <code className="text-[11px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">payment_gateways</code>{' '}
          com encriptação. <strong>NÃO insira chaves de produção aqui ainda.</strong>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="configured" className="w-full">
        <TabsList className="h-11 bg-transparent rounded-none p-0 gap-0 w-full justify-start border-b">
          <TabsTrigger value="configured" className="text-xs">
            <Settings2 className="h-4 w-4 mr-2" /> Configurados ({gateways.length})
          </TabsTrigger>
          <TabsTrigger value="catalog" className="text-xs">
            <CreditCard className="h-4 w-4 mr-2" /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="mock-console" className="text-xs">
            <Beaker className="h-4 w-4 mr-2" /> Console Mock
          </TabsTrigger>
        </TabsList>

        {/* ═════════════ TAB: CONFIGURADOS */}
        <TabsContent value="configured" className="pt-4 space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && gateways.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum gateway configurado. Vá ao Catálogo para adicionar.
            </p>
          )}
          {gateways.map((gw) => (
            <GatewayCard
              key={gw.id}
              gateway={gw}
              onEdit={() => setEditing(gw)}
              onTest={() => handleTest(gw)}
              onSetActive={() => handleSetActive(gw)}
              onRemove={() => handleRemove(gw)}
              busy={isMutating}
            />
          ))}
        </TabsContent>

        {/* ═════════════ TAB: CATÁLOGO */}
        <TabsContent value="catalog" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listAllDriverCodes().map((code) => {
              const meta = DRIVER_CATALOG[code];
              const alreadyConfigured = gateways.some((g) => g.provider_code === code);
              return (
                <Card key={code} className="border-2 hover:border-purple-300 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{meta.display_name}</CardTitle>
                      <ImplementationBadge status={meta.implementation_status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {meta.features.pix_in && (
                        <Badge variant="outline" className="text-[10px]">PIX in</Badge>
                      )}
                      {meta.features.pix_out && (
                        <Badge variant="outline" className="text-[10px]">PIX out</Badge>
                      )}
                      {meta.features.credit_card && (
                        <Badge variant="outline" className="text-[10px]">Cartão</Badge>
                      )}
                      {meta.features.boleto && (
                        <Badge variant="outline" className="text-[10px]">Boleto</Badge>
                      )}
                      {meta.features.subscriptions && (
                        <Badge variant="outline" className="text-[10px]">Assinatura</Badge>
                      )}
                    </div>
                    {meta.notes && (
                      <p className="text-[10px] text-muted-foreground/70 italic">{meta.notes}</p>
                    )}
                    <Button
                      size="sm"
                      variant={alreadyConfigured ? 'outline' : 'default'}
                      className="w-full"
                      onClick={() => setCreatingProvider(code)}
                      disabled={meta.implementation_status === 'planned'}
                    >
                      {alreadyConfigured ? 'Adicionar outra config' : 'Configurar'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═════════════ TAB: CONSOLE MOCK */}
        <TabsContent value="mock-console" className="pt-4">
          <MockConsole gateways={gateways} onUpsert={upsertGateway} />
        </TabsContent>
      </Tabs>

      {/* Dialog: editar gateway existente */}
      {editing && (
        <GatewayEditDialog
          mode="edit"
          gateway={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await upsertGateway(input);
            toast.success('Gateway atualizado');
            setEditing(null);
          }}
        />
      )}

      {/* Dialog: criar gateway a partir do catálogo */}
      {creatingProvider && (
        <GatewayEditDialog
          mode="create"
          presetProvider={creatingProvider as never}
          onClose={() => setCreatingProvider(null)}
          onSave={async (input) => {
            await upsertGateway(input);
            toast.success('Gateway criado');
            setCreatingProvider(null);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────────── SUB: badge implementation */

function ImplementationBadge({
  status,
}: {
  status: 'ready' | 'skeleton' | 'planned';
}) {
  if (status === 'ready') {
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-[10px]">Pronto</Badge>;
  }
  if (status === 'skeleton') {
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 text-[10px]">Skeleton (Fase 2)</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">Planejado</Badge>;
}

/* ───────────────────────────────── SUB: card de gateway */

function GatewayCard({
  gateway,
  onEdit,
  onTest,
  onSetActive,
  onRemove,
  busy,
}: {
  gateway: StoredGateway;
  onEdit: () => void;
  onTest: () => void;
  onSetActive: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const meta = DRIVER_CATALOG[gateway.provider_code];
  return (
    <Card className={gateway.is_active ? 'border-emerald-400 border-2' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                gateway.is_active
                  ? 'bg-emerald-100 dark:bg-emerald-900/40'
                  : 'bg-muted'
              }`}
            >
              <CreditCard
                className={`h-5 w-5 ${
                  gateway.is_active ? 'text-emerald-600' : 'text-muted-foreground'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{gateway.display_name}</h3>
                {gateway.is_active && (
                  <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px]">
                    ATIVO
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {gateway.mode === 'production' ? 'PROD' : 'SANDBOX'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{meta?.display_name ?? gateway.provider_code}</p>
              <div className="flex items-center gap-2 mt-1">
                {gateway.config_preview.has_access_token ? (
                  <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Token configurado
                  </span>
                ) : gateway.provider_code !== 'mock' ? (
                  <span className="text-[10px] text-amber-600 flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Sem token
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!gateway.is_active && (
              <Button size="sm" variant="default" onClick={onSetActive} disabled={busy}>
                Ativar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onTest} disabled={busy}>
              Testar
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onRemove}
              disabled={busy || gateway.is_active}
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────────── SUB: dialog editar/criar */

function GatewayEditDialog({
  mode,
  gateway,
  presetProvider,
  onClose,
  onSave,
}: {
  mode: 'edit' | 'create';
  gateway?: StoredGateway;
  presetProvider?: StoredGateway['provider_code'];
  onClose: () => void;
  onSave: (input: {
    id?: string;
    provider_code: StoredGateway['provider_code'];
    display_name: string;
    mode: GatewayMode;
    credentials: GatewayCredentials;
    config: GatewayConfig;
  }) => Promise<void>;
}) {
  const provider = gateway?.provider_code ?? presetProvider!;
  const meta = DRIVER_CATALOG[provider];

  const [displayName, setDisplayName] = useState(
    gateway?.display_name ?? `${meta.display_name} (Sandbox)`,
  );
  const [gwMode, setGwMode] = useState<GatewayMode>(gateway?.mode ?? 'sandbox');
  const [publicKey, setPublicKey] = useState(gateway?.credentials.public_key ?? '');
  const [accessToken, setAccessToken] = useState(gateway?.credentials.access_token ?? '');
  const [webhookSecret, setWebhookSecret] = useState(
    gateway?.credentials.webhook_secret ?? '',
  );
  const [autoConfirm, setAutoConfirm] = useState(
    gateway?.config.mock_auto_confirm_seconds ?? 0,
  );
  const [forceFailure, setForceFailure] = useState(
    gateway?.config.mock_force_failure ?? false,
  );
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  const isMock = provider === 'mock';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        id: gateway?.id,
        provider_code: provider,
        display_name: displayName,
        mode: gwMode,
        credentials: {
          public_key: publicKey || undefined,
          access_token: accessToken || undefined,
          webhook_secret: webhookSecret || undefined,
        },
        config: {
          mock_auto_confirm_seconds: isMock ? autoConfirm : undefined,
          mock_force_failure: isMock ? forceFailure : undefined,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Editar' : 'Configurar'} — {meta.display_name}
          </DialogTitle>
          <DialogDescription>
            {meta.description}
            {meta.implementation_status === 'skeleton' && (
              <span className="block mt-1 text-amber-600 text-xs">
                Driver em skeleton — integração real será feita na Fase 2.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome de exibição</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={gwMode} onValueChange={(v) => setGwMode(v as GatewayMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                <SelectItem value="production" disabled={isMock}>
                  Produção {isMock && '(bloqueado para Mock)'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isMock && (
            <>
              <Separator />
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Credenciais
              </p>

              <div className="space-y-2">
                <Label>Public Key</Label>
                <Input
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="TEST-... ou APP_USR-..."
                />
              </div>

              <div className="space-y-2">
                <Label>Access Token (secret)</Label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="absolute right-1 top-1 h-7 w-7 p-0"
                    onClick={() => setShowToken((v) => !v)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Nunca commitamos este valor. Em produção fica encriptado no banco.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Webhook Secret (HMAC)</Label>
                <Input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                />
              </div>
            </>
          )}

          {isMock && (
            <>
              <Separator />
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Configurações do Mock
              </p>

              <div className="space-y-2">
                <Label>Auto-confirm após (segundos)</Label>
                <Input
                  type="number"
                  min={0}
                  max={300}
                  value={autoConfirm}
                  onChange={(e) => setAutoConfirm(Number(e.target.value))}
                />
                <p className="text-[10px] text-muted-foreground">
                  0 = instantâneo. Maior que 0 = simula PIX aguardando, útil para testar loading.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm">Forçar falha</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Toda cobrança/saque falha. Use para testar UI de erro.
                  </p>
                </div>
                <Switch checked={forceFailure} onCheckedChange={setForceFailure} />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────────── SUB: console Mock */

function MockConsole({
  gateways,
  onUpsert,
}: {
  gateways: StoredGateway[];
  onUpsert: (input: {
    id?: string;
    provider_code: StoredGateway['provider_code'];
    display_name: string;
    mode: GatewayMode;
    credentials: GatewayCredentials;
    config: GatewayConfig;
  }) => Promise<StoredGateway>;
}) {
  const mockGw = gateways.find((g) => g.provider_code === 'mock');

  if (!mockGw) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Nenhum gateway Mock configurado. Vá ao Catálogo e adicione um.
        </AlertDescription>
      </Alert>
    );
  }

  const toggleFailure = async () => {
    await onUpsert({
      id: mockGw.id,
      provider_code: 'mock',
      display_name: mockGw.display_name,
      mode: mockGw.mode,
      credentials: mockGw.credentials,
      config: {
        ...mockGw.config,
        mock_force_failure: !mockGw.config.mock_force_failure,
      },
    });
    toast.success(
      `Mock: ${!mockGw.config.mock_force_failure ? 'Falhas ativadas' : 'Falhas desativadas'}`,
    );
  };

  const setDelay = async (seconds: number) => {
    await onUpsert({
      id: mockGw.id,
      provider_code: 'mock',
      display_name: mockGw.display_name,
      mode: mockGw.mode,
      credentials: mockGw.credentials,
      config: {
        ...mockGw.config,
        mock_auto_confirm_seconds: seconds,
      },
    });
    toast.success(`Mock: auto-confirm em ${seconds}s`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Beaker className="h-4 w-4" /> Estado atual do Mock
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Auto-confirm:</span>
            <span className="font-mono">
              {mockGw.config.mock_auto_confirm_seconds ?? 0}s
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Forçar falha:</span>
            <Badge variant={mockGw.config.mock_force_failure ? 'destructive' : 'outline'}>
              {mockGw.config.mock_force_failure ? 'ATIVADO' : 'desativado'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ativo:</span>
            <Badge variant={mockGw.is_active ? 'default' : 'outline'}>
              {mockGw.is_active ? 'SIM' : 'não'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ações rápidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Velocidade de confirmação</Label>
            <div className="flex gap-2 mt-1">
              <Button size="sm" variant="outline" onClick={() => setDelay(0)}>
                Instantâneo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDelay(3)}>
                3 seg
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDelay(10)}>
                10 seg
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDelay(30)}>
                30 seg
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">Simular falhas</Label>
            <div className="flex gap-2 mt-1">
              <Button
                size="sm"
                variant={mockGw.config.mock_force_failure ? 'destructive' : 'outline'}
                onClick={toggleFailure}
              >
                {mockGw.config.mock_force_failure ? 'Desativar falhas' : 'Ativar falhas'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Beaker className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Disparar webhook simulado e visualizar logs do gateway estarão disponíveis quando
          o módulo de banco da Fase 1 (tabela <code>pay_webhook_raw</code>) estiver deployado.
        </AlertDescription>
      </Alert>
    </div>
  );
}
