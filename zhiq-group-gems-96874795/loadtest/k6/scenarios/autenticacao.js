// Cenário: autenticação — login de usuário sintético via GoTrue REST
// (signInWithPassword). Ver docs/CHECKLIST_STAGING.md para provisionamento
// do pool de usuários de teste.

import { sleep, group } from 'k6';
import { loginSyntheticUser } from '../lib/auth.js';

export function autenticacaoScenario(vuId) {
  let session = null;
  group('autenticacao', () => {
    session = loginSyntheticUser(vuId);
    sleep(Math.random() * 1 + 0.5);
  });
  return session;
}
