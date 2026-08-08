import { useEffect, useRef, useState } from "react";

/* ================================================================
   Anti-brute-force de login por senha — MITIGAÇÃO CLIENT-SIDE APENAS.
   ================================================================
   IMPORTANTE (limitação honesta): tudo abaixo roda no browser do
   usuário (localStorage + setTimeout). Um atacante que fala direto
   com a API do Supabase (curl/script/Burp) NÃO passa por este código
   e portanto NÃO é desacelerado nem bloqueado por ele — localStorage
   e o cooldown em memória são triviais de ignorar fora do browser
   (aba anônima, limpar localStorage, trocar de IP). Isto é fricção de
   UX para o navegador comum, não uma defesa de backend.

   Rate limiting/CAPTCHA real (que vale para qualquer client, incluindo
   scripts) depende de configuração no lado do servidor. O Supabase Auth
   já possui rate limits nativos por padrão (ex.: e-mails/hora, tentativas
   por IP em endpoints de auth — ver Dashboard do projeto em
   Authentication → Rate Limits), mas esses limites são amplos/globais e
   não são um substituto para um controle de tentativas por-conta.
   Para uma defesa robusta e válida contra scripts, o caminho correto é
   uma camada server-side dedicada (ex.: tabela de tentativas + RPC/edge
   function que valida e incrementa antes de repassar ao Supabase Auth,
   ou habilitar Bot & Abuse Protection/Captcha — Turnstile/hCaptcha — no
   dashboard do Supabase). Isso está fora do escopo desta correção
   client-side e é recomendado como trabalho futuro.

   Este hook centraliza a lógica para reuso em todos os pontos de
   entrada de login por senha do app (Auth.tsx, RealEstateAuthCard,
   GestorLoginPage, ...), evitando que cada tela reimplemente (e
   diverja) a mesma política.
================================================================= */

const LOGIN_ATTEMPTS_KEY = "viagg_login_attempts_v1";
export const CAPTCHA_THRESHOLD = 3; // a partir da 3ª falha seguida, exige captcha matemático
const BACKOFF_SECONDS = [0, 0, 2, 5, 15, 30, 60, 60] as const; // por nº de falhas seguidas (index = count), capado em 60s
const MAX_BACKOFF_SECONDS = 60;

interface LoginAttemptsState {
  email: string;
  failCount: number;
  cooldownUntil: number; // epoch ms
}

const normalizeEmailKey = (email: string) => email.trim().toLowerCase();

const readLoginAttempts = (email: string): LoginAttemptsState => {
  const empty: LoginAttemptsState = { email: normalizeEmailKey(email), failCount: 0, cooldownUntil: 0 };
  try {
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as LoginAttemptsState;
    if (!parsed || parsed.email !== normalizeEmailKey(email)) return empty;
    return parsed;
  } catch {
    return empty;
  }
};

const writeLoginAttempts = (state: LoginAttemptsState) => {
  try {
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    // localStorage indisponível (modo privado etc.) — degrada para sem persistência,
    // não bloqueia o login.
  }
};

const clearLoginAttempts = () => {
  try {
    localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
  } catch {
    /* noop */
  }
};

const backoffSecondsForCount = (failCount: number): number => {
  if (failCount < BACKOFF_SECONDS.length) return BACKOFF_SECONDS[failCount];
  return MAX_BACKOFF_SECONDS;
};

export interface LoginBruteForceGuard {
  /** Segundos restantes de backoff progressivo (0 = pode tentar). */
  loginCooldown: number;
  /** Verifica se o e-mail atual está em cooldown; se sim, já atualiza o estado e retorna os segundos restantes. */
  checkCooldown: (email: string) => number;
  /** Verifica se o e-mail atual já atingiu o limiar que exige captcha antes da próxima tentativa. */
  needsCaptcha: (email: string) => boolean;
  /** Registra uma falha de login para o e-mail e calcula/persiste o próximo cooldown. Retorna o novo failCount. */
  registerFailedAttempt: (email: string) => number;
  /** Limpa o histórico de falhas (chamar em login bem-sucedido). */
  registerSuccessfulLogin: () => void;
}

/**
 * Hook de anti-brute-force client-side para telas de login por senha.
 * Ver nota de limitação honesta no topo do arquivo.
 */
export function useLoginBruteForceGuard(email: string): LoginBruteForceGuard {
  const [loginCooldown, setLoginCooldown] = useState(0);

  // Re-hidrata o cooldown sempre que o e-mail muda (ex.: usuário troca de conta)
  useEffect(() => {
    if (!email) {
      setLoginCooldown(0);
      return;
    }
    const attempts = readLoginAttempts(email);
    const remaining = Math.ceil((attempts.cooldownUntil - Date.now()) / 1000);
    setLoginCooldown(remaining > 0 ? remaining : 0);
  }, [email]);

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const t = setTimeout(() => setLoginCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [loginCooldown]);

  const checkCooldown = (targetEmail: string): number => {
    const attempts = readLoginAttempts(targetEmail);
    const remaining = Math.ceil((attempts.cooldownUntil - Date.now()) / 1000);
    if (remaining > 0) setLoginCooldown(remaining);
    return remaining > 0 ? remaining : 0;
  };

  const needsCaptcha = (targetEmail: string): boolean => {
    const attempts = readLoginAttempts(targetEmail);
    return attempts.failCount >= CAPTCHA_THRESHOLD;
  };

  const registerFailedAttempt = (targetEmail: string): number => {
    const prev = readLoginAttempts(targetEmail);
    const failCount = prev.failCount + 1;
    const seconds = backoffSecondsForCount(failCount);
    const cooldownUntil = seconds > 0 ? Date.now() + seconds * 1000 : 0;
    writeLoginAttempts({ email: normalizeEmailKey(targetEmail), failCount, cooldownUntil });
    setLoginCooldown(seconds);
    return failCount;
  };

  const registerSuccessfulLogin = () => {
    clearLoginAttempts();
    setLoginCooldown(0);
  };

  return { loginCooldown, checkCooldown, needsCaptcha, registerFailedAttempt, registerSuccessfulLogin };
}

/** Ref auxiliar simples para telas que precisam lembrar "captcha pendente para reenvio". */
export function usePendingCaptchaSubmitRef() {
  return useRef(false);
}
