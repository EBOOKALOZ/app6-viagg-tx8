/**
 * ══════════════════════════════════════════════════════════
 * NÍVEL 1 — MAPEADOR SEGURO: merchantStoreMapper.ts
 * ══════════════════════════════════════════════════════════
 *
 * Whitelist explícita de colunas reais de merchant_stores.
 * Qualquer campo não listado aqui é DESCARTADO silenciosamente.
 *
 * Colunas REAIS confirmadas na tabela (live DB):
 *   nome_loja, cnpj, descricao, categoria_id (uuid),
 *   telefone, email, street, number, neighborhood, logo_url
 *
 * NUNCA editar este arquivo sem confirmar no schema real do Supabase.
 * ══════════════════════════════════════════════════════════
 */

/** Colunas reais confirmadas da tabela public.merchant_stores */
export const MERCHANT_STORE_ALLOWED_COLUMNS = [
  'user_id',
  'nome_loja',
  'cnpj',
  'descricao',
  'categoria_id',
  'telefone',
  'email',
  'street',
  'number',
  'neighborhood',
  'logo_url',
  'cep',
  'cidade',
  'estado',
  'latitude',
  'longitude',
] as const;

/** Tipo derivado das colunas permitidas */
export type MerchantStoreColumn = (typeof MERCHANT_STORE_ALLOWED_COLUMNS)[number];

/** Payload seguro para merchant_stores */
export type SafeMerchantStorePayload = Partial<Record<MerchantStoreColumn, string | number | null>>;

/** Colunas usadas no SELECT (somente as permitidas) */
export const MERCHANT_STORE_SELECT_COLUMNS = MERCHANT_STORE_ALLOWED_COLUMNS.join(', ');

/**
 * Recebe qualquer objeto do formulário e retorna APENAS as colunas
 * que realmente existem em merchant_stores, com sanitização básica.
 *
 * Campos desconhecidos são descartados e logados no console.
 */
export function mapFormToStorePayload(
  formData: Record<string, any>,
  userId: string
): SafeMerchantStorePayload {
  const allowedSet = new Set<string>(MERCHANT_STORE_ALLOWED_COLUMNS);

  // Detectar campos desconhecidos
  const unknownKeys = Object.keys(formData).filter(
    (k) => !allowedSet.has(k) && k !== 'categoria_nome'
      && k !== 'endereco_formatado' && k !== 'latitude' && k !== 'longitude'
  );

  if (unknownKeys.length > 0) {
    console.warn(
      '[merchantStoreMapper] ⚠️ Campos DESCARTADOS (não existem em merchant_stores):',
      unknownKeys
    );
  }

  const payload: SafeMerchantStorePayload = {
    user_id: userId,
    nome_loja: sanitize(formData.nome_loja),
    cnpj: sanitize(formData.cnpj),
    descricao: sanitize(formData.descricao),
    categoria_id: sanitize(formData.categoria_id),
    telefone: sanitizePhone(formData.telefone),
    email: sanitize(formData.email),
    street: sanitize(formData.street),
    number: sanitize(formData.number),
    neighborhood: sanitize(formData.neighborhood),
    logo_url: sanitize(formData.logo_url),
    cep: sanitize(formData.cep),
    cidade: sanitize(formData.cidade),
    estado: sanitize(formData.estado),
    latitude: formData.latitude != null ? Number(formData.latitude) : null,
    longitude: formData.longitude != null ? Number(formData.longitude) : null,
  };

  console.log('[merchantStoreMapper] ✅ Payload seguro montado:', payload);

  return payload;
}

/* ─── Helpers ─── */

function sanitize(value: any): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim();
}

function sanitizePhone(value: any): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}
