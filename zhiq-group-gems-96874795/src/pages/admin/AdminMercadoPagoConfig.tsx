/**
 * /admin/pagamentos/mercadopago — Configuração Mercado Pago (FASE 1).
 *
 * Central única de gateway com ambientes separados:
 *  - Sandbox (testes, dinheiro fictício) e Produção (cobranças reais)
 *  - credenciais criptografadas no Supabase Vault (via RPC mp_set_credential);
 *    o navegador só vê a máscara ••••XXXX
 *  - alternância de ambiente ativo (mp_set_active_environment)
 *  - teste de conexão detalhado (edge function payments-gateway-test)
 *  - auditoria de toda alteração (mp_gateway_audit_log)
 *
 * Requer a migration 20260705_fase1_mp_gateway_environments.sql aplicada.
 * A tela antiga /secrets/mercadopago (payment_gateways) segue funcionando
 * como legado até a virada completa para esta config.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FlaskConical,
  KeyRound,
  Loader2,
  PlugZap,
  Rocket,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

type MpEnv = 'sandbox' | 'production';

const WEBHOOK_URL_DEFAULT =
  'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/payments-webhook';

const CREDENTIAL_FIELDS: Array<{
  key: string;
  label: string;
  secret: boolean;
  hint?: string;
}> = [
  { key: 'public_key', label: 'Public Key', secret: false, hint: 'Chave pública (checkout no navegador)' },
  { key: 'access_token', label: 'Access Token', secret: true, hint: 'TEST-… (sandbox) ou APP_USR-… (produção)' },
  { key: 'client_id', label: 'Client ID', secret: false },
  { key: 'client_secret', label: 'Client Secret', secret: true },
  { key: 'webhook_secret', label: 'Webhook Secret', secret: true, hint: 'Assinatura secreta gerada pelo MP ao criar o webhook' },
  { key: 'user_id', label: 'User ID', secret: false, hint: 'ID numérico da conta MP' },
  { key: 'application_id', label: 'Application ID', secret: false },
];

interface EnvOverview {
  webhook_url: string | null;
  fields: Record<string, { masked: string; updated_at: string }>;
}

interface Overview {
  active_environment: MpEnv;
  environments: Record<string, EnvOverview>;
}

interface TestCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface TestReport {
  ok: boolean;
  environment: MpEnv;
  source?: string;
  nickname?: string | null;
  site?: string | null;
  token_kind?: string;
  checks: TestCheck[];
  tested_at?: string;
  error?: string;
}

interface AuditRow {
  id: number;
  occurred_at: string;
  actor_email: string | null;
  action: string;
  environment: string | null;
  field_name: string | null;
  masked_value: string | null;
  success: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  set_credential: 'Credencial alterada',
  clear_credential: 'Credencial removida',
  set_webhook_url: 'Webhook URL alterada',
  switch_environment: 'Ambiente alternado',
  connection_test: 'Teste de conexão',
};

function EnvBadge({ env }: { env: MpEnv }) {
  return env === 'production' ? (
    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
      <Rocket className="h-3 w-3" /> Produção
    </Badge>
  ) : (
    <Badge className="bg-amber-500 hover:bg-amber-500 text-black gap-1">
      <FlaskConical className="h-3 w-3" /> Sandbox
    </Badge>
  );
}

export default function AdminMercadoPagoConfig() {
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [switching, setSwitching] = useState(false);

  // valores digitados (só enviados se preenchidos); por ambiente
  const [drafts, setDrafts] = useState<Record<MpEnv, Record<string, string>>>({
    sandbox: {},
    production: {},
  });
  const [webhookDrafts, setWebhookDrafts] = useState<Record<MpEnv, string>>({
    sandbox: '',
    production: '',
  });
  const [saving, setSaving] = useState<MpEnv | null>(null);
  const [testing, setTesting] = useState<MpEnv | null>(null);
  const [reports, setReports] = useState<Partial<Record<MpEnv, TestReport>>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)('mp_get_admin_overview');
    if (error) {
      // 42883 = função inexistente → migration ainda não aplicada
      if (/mp_get_admin_overview|does not exist|not find/i.test(error.message)) {
        setMigrationMissing(true);
      } else {
        toast.error('Falha ao carregar configuração', { description: error.message });
      }
      setLoading(false);
      return;
    }
    const ov = data as Overview;
    setOverview(ov);
    setWebhookDrafts({
      sandbox: ov.environments?.sandbox?.webhook_url ?? '',
      production: ov.environments?.production?.webhook_url ?? '',
    });
    const { data: auditRows } = await (supabase.from('mp_gateway_audit_log' as any) as any)
      .select('id, occurred_at, actor_email, action, environment, field_name, masked_value, success')
      .order('occurred_at', { ascending: false })
      .limit(30);
    setAudit((auditRows as AuditRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSwitchEnv(env: MpEnv) {
    if (!overview || overview.active_environment === env) return;
    const msg = env === 'production'
      ? 'ATENÇÃO: alternar para PRODUÇÃO fará a plataforma usar credenciais reais (cobranças reais). Confirmar?'
      : 'Alternar para SANDBOX (apenas testes, sem dinheiro real)?';
    if (!window.confirm(msg)) return;
    setSwitching(true);
    const { error } = await (supabase.rpc as any)('mp_set_active_environment', {
      p_environment: env,
    });
    setSwitching(false);
    if (error) {
      toast.error('Falha ao alternar ambiente', { description: error.message });
      return;
    }
    toast.success(`Ambiente ativo: ${env === 'production' ? 'Produção' : 'Sandbox'}`);
    load();
  }

  async function handleSave(env: MpEnv) {
    setSaving(env);
    const draft = drafts[env];
    let savedAny = false;
    try {
      for (const f of CREDENTIAL_FIELDS) {
        const value = draft[f.key];
        if (value === undefined || value.trim() === '') continue;
        const { error } = await (supabase.rpc as any)('mp_set_credential', {
          p_environment: env,
          p_field: f.key,
          p_value: value.trim(),
        });
        if (error) throw new Error(`${f.label}: ${error.message}`);
        savedAny = true;
      }
      const wh = webhookDrafts[env]?.trim() ?? '';
      const current = overview?.environments?.[env]?.webhook_url ?? '';
      if (wh !== current) {
        const { error } = await (supabase.rpc as any)('mp_set_webhook_url', {
          p_environment: env,
          p_url: wh,
        });
        if (error) throw new Error(`Webhook URL: ${error.message}`);
        savedAny = true;
      }
      if (savedAny) {
        toast.success('Configuração salva (criptografada no Vault)');
        setDrafts((d) => ({ ...d, [env]: {} }));
        load();
      } else {
        toast.info('Nada para salvar — preencha os campos que deseja alterar');
      }
    } catch (e) {
      toast.error('Erro ao salvar', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(null);
    }
  }

  async function handleTest(env: MpEnv) {
    setTesting(env);
    const { data, error } = await supabase.functions.invoke('payments-gateway-test', {
      body: { environment: env },
    });
    setTesting(null);
    if (error) {
      toast.error('Falha no teste', { description: error.message });
      return;
    }
    const report = data as TestReport;
    setReports((r) => ({ ...r, [env]: report }));
    if (report.ok) {
      toast.success(`Conectado: ${report.nickname ?? 'conta MP'}`, {
        description: `Token ${report.token_kind} · ${report.site ?? ''} · ${env}`,
      });
    } else {
      toast.error('Teste com falhas', { description: report.error ?? 'ver relatório' });
    }
    load(); // atualiza auditoria
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

  if (migrationMissing) {
    return (
      <Alert variant="destructive" className="max-w-3xl mx-auto mt-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          A infraestrutura da Configuração Mercado Pago ainda não existe neste banco.
          Rode a migration <strong>20260705_fase1_mp_gateway_environments.sql</strong> no
          SQL Editor do Supabase e recarregue esta página. Enquanto isso, o fluxo
          de pagamentos continua no legado (payment_gateways / tela Secrets).
        </AlertDescription>
      </Alert>
    );
  }

  const active = overview?.active_environment ?? 'sandbox';

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black">Configuração Mercado Pago</h1>
            <p className="text-xs text-muted-foreground">
              Gateway financeiro central · credenciais criptografadas (Vault) · auditoria completa
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ambiente ativo:</span>
          <EnvBadge env={active} />
        </div>
      </div>

      {/* Seletor de ambiente ativo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Ambiente ativo da plataforma
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['sandbox', 'production'] as MpEnv[]).map((env) => (
            <button
              key={env}
              type="button"
              disabled={switching}
              onClick={() => handleSwitchEnv(env)}
              className={`rounded-xl border p-4 text-left transition-all ${
                active === env
                  ? env === 'production'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-500'
                    : 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-500'
                  : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <span
                  className={`h-3 w-3 rounded-full border-2 ${
                    active === env
                      ? env === 'production'
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'bg-amber-500 border-amber-500'
                      : 'border-muted-foreground'
                  }`}
                />
                {env === 'production' ? '◉ Produção' : '◉ Sandbox'}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {env === 'production'
                  ? 'Cobranças reais: PIX, cartão, assinaturas, split e saques reais.'
                  : 'Exclusivo para testes: PIX/cartão de teste, webhooks, reembolsos, simulações. Jamais dinheiro real.'}
              </p>
            </button>
          ))}
          <p className="sm:col-span-2 text-[11px] text-muted-foreground">
            Toda a plataforma (checkouts, webhooks, reconciliação) usa automaticamente as
            credenciais do ambiente ativo — sem alteração de código.
          </p>
        </CardContent>
      </Card>

      {/* Credenciais por ambiente */}
      <Tabs defaultValue={active}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sandbox" className="gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" /> Sandbox
          </TabsTrigger>
          <TabsTrigger value="production" className="gap-1.5">
            <Rocket className="h-3.5 w-3.5" /> Produção
          </TabsTrigger>
        </TabsList>

        {(['sandbox', 'production'] as MpEnv[]).map((env) => {
          const envOv = overview?.environments?.[env];
          const report = reports[env];
          return (
            <TabsContent key={env} value={env} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Credenciais — {env === 'production' ? 'Produção' : 'Sandbox'}</span>
                    <EnvBadge env={env} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {env === 'production' && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Credenciais de produção movimentam dinheiro real. Use tokens
                        <strong> APP_USR-</strong> da aplicação oficial da RIDV.
                      </AlertDescription>
                    </Alert>
                  )}
                  {CREDENTIAL_FIELDS.map((f) => {
                    const saved = envOv?.fields?.[f.key];
                    return (
                      <div key={f.key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label>{f.label}</Label>
                          {saved ? (
                            <span className="text-[10px] font-mono text-emerald-600">
                              salvo: {saved.masked}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">não configurado</span>
                          )}
                        </div>
                        <Input
                          type={f.secret ? 'password' : 'text'}
                          autoComplete="off"
                          className="font-mono text-xs"
                          placeholder={saved ? `manter atual (${saved.masked})` : f.hint ?? f.label}
                          value={drafts[env][f.key] ?? ''}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [env]: { ...d[env], [f.key]: e.target.value },
                            }))
                          }
                        />
                      </div>
                    );
                  })}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Webhook URL</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => copy(webhookDrafts[env] || WEBHOOK_URL_DEFAULT, 'Webhook URL')}
                      >
                        <Copy className="h-3 w-3 mr-1" /> copiar
                      </Button>
                    </div>
                    <Input
                      className="font-mono text-xs"
                      placeholder={WEBHOOK_URL_DEFAULT}
                      value={webhookDrafts[env]}
                      onChange={(e) =>
                        setWebhookDrafts((w) => ({ ...w, [env]: e.target.value }))
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Cole esta URL no painel do MP (Suas integrações → Webhooks) e traga a
                      assinatura secreta gerada para o campo Webhook Secret.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleSave(env)}
                      disabled={saving === env}
                      className="flex-1"
                    >
                      {saving === env ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Salvar credenciais'
                      )}
                    </Button>
                    <Button
                      onClick={() => handleTest(env)}
                      disabled={testing === env}
                      variant="outline"
                    >
                      {testing === env ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <PlugZap className="h-4 w-4 mr-1.5" /> Testar Conexão
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Os valores são gravados criptografados no Supabase Vault e nunca voltam
                    completos para o navegador — apenas a máscara ••••XXXX.
                  </p>
                </CardContent>
              </Card>

              {/* Relatório do teste de conexão */}
              {report && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      {report.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      Relatório do teste — {report.ok ? 'conectado' : 'com falhas'}
                      {report.nickname && (
                        <span className="text-xs text-muted-foreground font-normal">
                          · {report.nickname} ({report.site})
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(report.checks ?? []).map((c) => (
                      <div key={c.id} className="flex items-start gap-2 text-xs">
                        {c.status === 'pass' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : c.status === 'warn' ? (
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="font-semibold">{c.label}:</span>{' '}
                          <span className="text-muted-foreground">{c.detail}</span>
                        </div>
                      </div>
                    ))}
                    {report.error && (
                      <p className="text-xs text-destructive">{report.error}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Auditoria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Auditoria (últimas 30 operações)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma operação registrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3">Data/Hora</th>
                    <th className="py-1.5 pr-3">Operação</th>
                    <th className="py-1.5 pr-3">Ambiente</th>
                    <th className="py-1.5 pr-3">Campo</th>
                    <th className="py-1.5 pr-3">Valor</th>
                    <th className="py-1.5 pr-3">Por</th>
                    <th className="py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {new Date(row.occurred_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-1.5 pr-3">{ACTION_LABEL[row.action] ?? row.action}</td>
                      <td className="py-1.5 pr-3">{row.environment ?? '—'}</td>
                      <td className="py-1.5 pr-3 font-mono">{row.field_name ?? '—'}</td>
                      <td className="py-1.5 pr-3 font-mono">{row.masked_value ?? '—'}</td>
                      <td className="py-1.5 pr-3">{row.actor_email ?? 'sistema'}</td>
                      <td className="py-1.5">
                        {row.success ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
