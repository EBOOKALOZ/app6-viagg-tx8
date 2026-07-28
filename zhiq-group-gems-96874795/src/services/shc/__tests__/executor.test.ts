import { describe, it, expect, beforeEach, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { runModuleAudit } from '../executor';

describe('runModuleAudit (cliente do executor oficial ASHC)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('encaminha slug e evidência para a Edge Function shc-executor', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, decision: 'APPROVED', score: 100, run_id: 'r1' },
      error: null,
    });

    const evidence = {
      tables: ['shc_runs'],
      checks: [{ name: 'build', status: 'passed' as const, evidence: 'vite build exit 0' }],
    };
    const result = await runModuleAudit('leiloes', evidence);

    expect(invokeMock).toHaveBeenCalledWith('shc-executor', {
      body: { slug: 'leiloes', evidence },
    });
    expect(result.ok).toBe(true);
    expect(result.decision).toBe('APPROVED');
    expect(result.score).toBe(100);
  });

  it('extrai a mensagem real do body quando a função responde erro HTTP', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(
          JSON.stringify({ ok: false, error: 'permissão negada (requer shc:run ou admin)' }),
        ),
      },
    });

    const result = await runModuleAudit('leiloes');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('permissão negada (requer shc:run ou admin)');
  });

  it('mantém a mensagem original quando o body do erro não é JSON', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Failed to send a request to the Edge Function',
        context: new Response('gateway indisponível'),
      },
    });

    const result = await runModuleAudit('leiloes');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Failed to send a request to the Edge Function');
  });

  it('repassa fail-closed do motor (module_not_found) sem mascarar', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: false, error: 'module_not_found: nao-existe' },
      error: null,
    });

    const result = await runModuleAudit('nao-existe');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('module_not_found');
  });
});
