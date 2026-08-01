// Regras de negócio compartilhadas para cadastro de Grupos WhatsApp
// (Motoboy, Moto-Táxi e Motorista). Espelha o piso aplicado no banco
// pelo trigger enforce_group_validity() / enforce_group_validity_driver()
// (supabase/migrations/20260801_enforce_group_validity_min60.sql) — mudar
// aqui sem mudar lá (ou vice-versa) quebra a mensagem de erro exibida.

export const MIN_GROUP_MEMBERS = 60;

export function buildMinMembersError(membros: number): string {
  return `Grupo reprovado. Quantidade mínima exigida: ${MIN_GROUP_MEMBERS} membros (informado: ${membros}).`;
}

const VALIDATION_ERROR_PATTERN =
  /fora da sua área|já está ativo|60 membros|aguardando qualificação|mínimo/i;

/**
 * Reconhece se uma mensagem de erro vinda do backend (RAISE EXCEPTION dos
 * triggers de validação) é uma regra de negócio conhecida — para exibir o
 * texto real ao usuário em vez de um erro genérico.
 */
export function isKnownGroupValidationError(message: string | null | undefined): boolean {
  return !!message && VALIDATION_ERROR_PATTERN.test(message);
}

export function parseGroupValidationError(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null;
  if (error.code === '23505' || /duplicate key|unique/i.test(error.message || '')) {
    return 'Este grupo já está ativo com outro profissional. Ele só fica disponível se o profissional atual sair (desativar o grupo).';
  }
  if (isKnownGroupValidationError(error.message)) {
    return error.message as string;
  }
  return null;
}
