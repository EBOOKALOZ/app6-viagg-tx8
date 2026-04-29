/**
 * ══════════════════════════════════════════════════════════
 * NÍVEL 2 — CAMADA ÚNICA DE SAVE: merchantStoreSave.ts
 * ══════════════════════════════════════════════════════════
 *
 * Função única e centralizada que salva dados da loja.
 * Usa o mapeador seguro (Nível 1) para montar o payload,
 * e delega ao RPC blindado (Nível 3) para persistir.
 *
 * O frontend NUNCA faz insert/update direto em merchant_stores.
 * ══════════════════════════════════════════════════════════
 */

import { supabase } from '@/integrations/supabase/client';
import { mapFormToStorePayload, MERCHANT_STORE_SELECT_COLUMNS } from './merchantStoreMapper';

export interface StoreSaveResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

/**
 * Salva dados da loja via RPC blindada `upsert_merchant_store_safe`.
 * 
 * 1. Valida nome_loja no frontend
 * 2. Monta payload seguro via mapper (Nível 1)
 * 3. Chama RPC backend (Nível 3)
 * 4. Retorna resultado com dados persistidos
 */
export async function saveMerchantStore(
  formData: Record<string, any>
): Promise<StoreSaveResult> {
  // ─── Autenticação ───
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    console.error('[merchantStoreSave] Usuário não autenticado:', authError);
    return { success: false, error: 'Sessão expirada. Faça login novamente.' };
  }
  const uid = authData.user.id;

  // ─── Validação frontend ───
  if (!formData.nome_loja || !String(formData.nome_loja).trim()) {
    return { success: false, error: 'Nome da loja é obrigatório' };
  }

  // ─── Nível 1: Mapeamento seguro ───
  const safePayload = mapFormToStorePayload(formData, uid);

  console.log('[merchantStoreSave] uid:', uid);
  console.log('[merchantStoreSave] Payload seguro:', JSON.stringify(safePayload, null, 2));

  // ─── Nível 3: RPC backend ───
  const rpcParams: Record<string, any> = {
    p_nome_loja:    safePayload.nome_loja,
    p_cnpj:         safePayload.cnpj,
    p_descricao:    safePayload.descricao,
    p_categoria_id: safePayload.categoria_id,
    p_telefone:     safePayload.telefone,
    p_email:        safePayload.email,
    p_street:       safePayload.street,
    p_number:       safePayload.number,
    p_neighborhood: safePayload.neighborhood,
    p_logo_url:     safePayload.logo_url,
  };

  // Só envia lat/lng se as colunas existirem no banco (migration rodada)
  if (safePayload.latitude != null) rpcParams.p_latitude = safePayload.latitude;
  if (safePayload.longitude != null) rpcParams.p_longitude = safePayload.longitude;

  console.log('[merchantStoreSave] Chamando RPC upsert_merchant_store_safe com:', JSON.stringify(rpcParams, null, 2));

  const { data, error, status, statusText } = await supabase.rpc('upsert_merchant_store_safe', rpcParams as any) as any;

  console.log('[merchantStoreSave] Response status:', status, statusText);
  console.log('[merchantStoreSave] Response data (raw):', data);
  console.log('[merchantStoreSave] Response error (raw):', error);

  if (error) {
    const errMsg = [
      error.message,
      (error as any).details,
      (error as any).hint,
      (error as any).error_description,
    ].filter(Boolean).join(' | ');

    console.error('[merchantStoreSave] ❌ ERRO COMPLETO:', {
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      code: (error as any).code,
      error_description: (error as any).error_description,
      status,
      statusText,
    });

    return { success: false, error: errMsg || 'Erro retornado pelo Supabase (sem mensagem)' };
  }

  // data pode ser null, um objeto com {success:true}, ou um row direto {id, nome_loja...}
  if (data === null || data === undefined) {
    console.error('[merchantStoreSave] ❌ RPC retornou null/undefined. A função pode não existir no banco.');
    return { success: false, error: 'RPC retornou vazio. Verifique se a função upsert_merchant_store_safe foi criada no Supabase.' };
  }

  const result = typeof data === 'object' ? data : (() => { try { return JSON.parse(data); } catch { return data; } })();

  // Formato 1: RPC retorna {success: true, ...}
  if (result?.success === true) {
    console.log('[merchantStoreSave] ✅ Loja salva (formato RPC):', result);
    return { success: true, data: result };
  }

  // Formato 2: RPC retorna {success: false, error: '...'}
  if (result?.success === false) {
    console.error('[merchantStoreSave] ❌ RPC retornou falha:', result.error);
    return { success: false, error: result.error };
  }

  // Formato 3: Resposta é uma row direta (tem id ou nome_loja) — significa sucesso
  if (result?.id || result?.nome_loja) {
    console.log('[merchantStoreSave] ✅ Loja salva (formato row):', result);
    return { success: true, data: result };
  }

  // Formato desconhecido — logar tudo
  console.warn('[merchantStoreSave] ⚠️ Formato de resposta inesperado:', result);
  return { success: true, data: result }; // assume sucesso se não houve error
}

/**
 * Carrega dados da loja do banco usando somente colunas seguras.
 * Resolve o nome da categoria via join leve.
 */
export async function loadMerchantStore(): Promise<{
  exists: boolean;
  data: Record<string, any> | null;
  error?: string;
}> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) return { exists: false, data: null, error: 'Não autenticado' };

  const { data, error } = await (supabase.from('merchant_stores') as any)
    .select(MERCHANT_STORE_SELECT_COLUMNS)
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (error) {
    console.error('[merchantStoreSave] Erro ao carregar:', error.message);
    return { exists: false, data: null, error: error.message };
  }

  if (data) {
    // Resolve o nome da categoria se existir categoria_id
    if (data.categoria_id) {
      try {
        const { data: cat } = await (supabase.from('categorias_loja') as any)
          .select('nome')
          .eq('id', data.categoria_id)
          .maybeSingle();
        if (cat?.nome) {
          data.categoria_nome = cat.nome;
        }
      } catch {
        console.warn('[merchantStoreSave] Não conseguiu resolver nome da categoria');
      }
    }

    console.log('[merchantStoreSave] Loja carregada:', data);
    return { exists: true, data };
  }

  return { exists: false, data: null };
}
