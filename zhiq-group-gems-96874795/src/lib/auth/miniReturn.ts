/**
 * Login da mini-conta — usuário viajante / anônimo que paga as corridas.
 *
 * Ao entrar por um ponto do fluxo de corridas (carteira, conta, meus dados),
 * marcamos pra onde voltar DEPOIS do login. O AuthCallback (magic link) e o
 * LoadingTransition (login por senha) leem essa marca e levam o usuário DIRETO
 * ao painel mini — pulando o /select-profile, que é destinado a quem tem perfil
 * profissional (lojista, motoboy, motorista...).
 *
 * A chave é a MESMA já consumida em AuthCallback.tsx (viagg_mini_return_to) e
 * já usada em SolicitarCorrida.tsx — aqui apenas centralizamos o SET.
 */
export const MINI_RETURN_KEY = "viagg_mini_return_to";

/**
 * Marca o retorno pós-login e manda pro /auth.
 * @param navigate  useNavigate() do react-router.
 * @param returnTo  rota (com query, se houver) pra voltar após autenticar.
 */
export function goToMiniLogin(
  navigate: (to: string) => void,
  returnTo: string,
): void {
  try {
    localStorage.setItem(MINI_RETURN_KEY, returnTo);
  } catch {
    /* ignore (modo privado / storage indisponível) */
  }
  navigate("/auth");
}
