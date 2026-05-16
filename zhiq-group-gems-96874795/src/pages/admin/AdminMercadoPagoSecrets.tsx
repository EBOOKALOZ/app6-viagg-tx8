/**
 * /secrets/mercadopago — gestão das credenciais do Mercado Pago.
 *
 * Lê/grava direto em payment_gateways (RLS admin-only) na linha
 * provider_code='mercadopago'. Botão "Testar conexão" chama a Edge Function
 * payments-gateway-test (ping server-side em /users/me — MP bloqueia CORS
 * no browser).
 *
 * Fluxo do webhook: o campo "Assinatura secreta" no painel do MP fica em
 * branco até você criar o webhook lá colando a URL exibida nesta tela; o MP
 * então gera o secret, que você cola aqui.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Copy, KeyRound, Loader2, PlugZap } from 'lucide-react';

const WEBHOOK_URL =
  'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/payments-webhook';

interface GatewayRow {
  id: string;
  provider_code: string;
  mode: 'sandbox' | 'production';
  is_active: boolean;
  credentials: {
    access_token?: string;
    public_key?: string;
    webhook_secret?: string;
  } | null;
  config: Record<string, unknown> | null;
}

export default function AdminMercadoPagoSecrets() {
  const [row, setRow] = useState<GatewayRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [mode, setMode] = useState<'sandbox' | 'production'>('sandbox');
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isActive, setIsActive] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.from('payment_gateways') as any)
      .select('id, provider_code, mode, is_active, credentials, config')
      .eq('provider_code', 'mercadopago')
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error('Falha ao carregar gateway', { description: error.message });
      setLoading(false);
      return;
    }
    if (data) {
      const g = data as unknown as GatewayRow;
      setRow(g);
      setMode(g.mode);
      setAccessToken(g.credentials?.access_token ?? '');
      setPublicKey(g.credentials?.public_key ?? '');
      setWebhookSecret(g.credentials?.webhook_secret ?? '');
      setIsActive(g.is_active);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!row) return;
    setSaving(true);
    const credentials = {
      access_token: accessToken.trim(),
      public_key: publicKey.trim(),
      webhook_secret: webhookSecret.trim(),
    };
    const config = {
      ...(row.config ?? {}),
      webhook_url: WEBHOOK_URL,
    };
    const { error } = await supabase
      .from('payment_gateways')
      .update({ credentials, config, mode, is_active: isActive })
      .eq('id', row.id);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar', { description: error.message });
      return;
    }
    toast.success('Credenciais salvas');
    load();
  }

  async function handleTest() {
    if (!row) return;
    setTesting(true);
    const { data, error } = await supabase.functions.invoke(
      'payments-gateway-test',
      { body: { gateway_id: row.id } },
    );
    setTesting(false);
    if (error) {
      toast.error('Falha no teste', { description: error.message });
      return;
    }
    if (data?.ok) {
      toast.success(`Conectado: ${data.nickname ?? 'conta MP'}`, {
        description: `Token ${data.token_kind} · ${data.site ?? ''} · modo ${data.mode}`,
      });
    } else {
      toast.error('Conexão falhou', {
        description: data?.warning ?? data?.error ?? 'erro desconhecido',
      });
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!row) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto mt-8">
        <AlertDescription>
          Nenhum gateway <strong>mercadopago</strong> em payment_gateways.
          Rode o seed da Fase 1 antes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
          <KeyRound className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black">Secrets · Mercado Pago</h1>
          <p className="text-xs text-muted-foreground">
            payment_gateways · {row.id.slice(0, 8)}…
          </p>
        </div>
      </div>

      {/* Webhook URL — cole isto no painel do MP */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            1. Configure o webhook no painel do Mercado Pago
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            No MP → <strong>Suas integrações → sua aplicação → Webhooks</strong>,
            cole esta URL e selecione o evento <strong>Pagamentos</strong>. O MP
            vai gerar a <strong>Assinatura secreta</strong> — copie e cole no
            campo abaixo.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy(WEBHOOK_URL, 'Webhook URL')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">2. Credenciais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ambiente</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as 'sandbox' | 'production')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (TEST-)</SelectItem>
                <SelectItem value="production">Produção (APP_USR-)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Access Token</Label>
            <Input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="TEST-... ou APP_USR-..."
              className="font-mono text-xs"
              type="password"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Public Key</Label>
            <Input
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="TEST-... (UUID)"
              className="font-mono text-xs"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Assinatura secreta (webhook)</Label>
            <Input
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="gerada pelo MP ao criar o webhook"
              className="font-mono text-xs"
              type="password"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Sem isto o webhook rejeita tudo (HMAC). Pegue no painel do MP
              após criar o webhook com a URL acima.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Gateway ativo</Label>
              <p className="text-[11px] text-muted-foreground">
                Liga o MP como gateway de pagamento da plataforma.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Salvar'
              )}
            </Button>
            <Button
              onClick={handleTest}
              disabled={testing}
              variant="outline"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <PlugZap className="h-4 w-4 mr-1.5" />
                  Testar conexão
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
