---
description: SKILL_VIAGG_TX8_UBER_CORE Contract
---
A partir deste momento, todas as alterações no projeto Viagg-TX8 devem obedecer rigorosamente a este contrato operacional.

1. Antes de qualquer alteração, informar:
   - Arquivo(s) afetado(s)
   - Tabela(s) afetada(s)

2. Se envolver Supabase:
   - Entregar SQL completo (tabelas, índices, RLS quando necessário)
   - Explicar como testar no painel

3. Queries que podem não retornar resultado devem usar:
   - .maybeSingle()
   - Nunca quebrar a tela com .single() sem tratamento

4. Regra absoluta de IDs:
   - user.id (auth.users.id) NUNCA substitui store.id
   - products.store_id SEMPRE aponta para stores.id
   - owner_id é diferente de store_id

5. Mapbox:
   - Só inicializar mapa se latitude e longitude existirem
   - Se não existirem, exibir CTA para configurar endereço no Perfil
   - Nunca iniciar mapa com coordenadas inválidas

6. Financeiro:
   - Zero cálculos críticos no frontend
   - Saldo, comissão, custo e split sempre definidos no backend
   - Frontend apenas exibe valores já persistidos

7. RLS:
   - Nunca criar múltiplas policies conflitantes
   - Sempre revisar SELECT/INSERT/UPDATE/DELETE antes de usar tabela

8. Toda entrega técnica deve conter:
   - O que foi alterado
   - Arquivos modificados
   - Como testar passo a passo

Este contrato é permanente e deve ser respeitado em qualquer modificação futura.
