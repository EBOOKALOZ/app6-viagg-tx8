-- ═══════════════════════════════════════════════════════════════
-- Remove a notificação por e-mail baseada no LEDGER de créditos
-- Viagg-TX8 Platform
--
-- Motivo: o trigger em advertiser_credit_ledger disparava e-mail em TODO
-- movimento de crédito — incluindo visualizações (clique em produto) e
-- ações do próprio lojista (desbloquear WhatsApp, aceitar oferta, etc.).
-- Por decisão de produto, o lojista NÃO deve receber e-mail de visualização.
--
-- A notificação por e-mail passa a vir apenas das tabelas de domínio:
--   - advertiser_contact_intentions  → perguntas / mensagens (source = 'lead')
--   - purchase_intentions            → pedidos              (source = 'order')
--
-- A função notify_advertiser_on_ledger() é mantida (sem trigger) caso se
-- queira reativar e filtrar por reason_code no futuro.
-- ═══════════════════════════════════════════════════════════════

drop trigger if exists trg_notify_advertiser_on_ledger on public.advertiser_credit_ledger;
