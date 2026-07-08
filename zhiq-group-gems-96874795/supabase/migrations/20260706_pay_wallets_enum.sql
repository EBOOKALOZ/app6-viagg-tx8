-- ============================================================
-- CARTEIRAS PRÉ-PAGAS — 3 PERFIS + CLIENTE — parte 1/2 (ENUM)
--
-- Adiciona os tipos de dono e de conta para o modelo "carteira
-- pré-paga" do fluxo "cliente chama profissional" nos 3 perfis:
--
--   pay_owner_type   += customer, mototaxi_profile, driver_profile
--   pay_account_type += customer_wallet, mototaxi_wallet, driver_wallet
--
-- Saldos 100% independentes por perfil (regra de arquitetura):
--   · cliente que chama .......... customer / customer_wallet
--   · motoboy (entrega) .......... motoboy_profile / motoboy_wallet (já existia)
--   · moto-táxi .................. mototaxi_profile / mototaxi_wallet
--   · carro/motorista ............ driver_profile / driver_wallet
--
-- ⚠️ RODAR ESTE ARQUIVO SOZINHO, ANTES do parte 2/2.
-- Postgres não permite USAR um valor de enum recém-criado na MESMA
-- transação em que ele é adicionado. As RPCs (parte 2) referenciam
-- estes literais, então precisam de um COMMIT no meio.
--
-- Idempotente (ADD VALUE IF NOT EXISTS). SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

ALTER TYPE public.pay_owner_type   ADD VALUE IF NOT EXISTS 'customer';
ALTER TYPE public.pay_owner_type   ADD VALUE IF NOT EXISTS 'mototaxi_profile';
ALTER TYPE public.pay_owner_type   ADD VALUE IF NOT EXISTS 'driver_profile';

ALTER TYPE public.pay_account_type ADD VALUE IF NOT EXISTS 'customer_wallet';
ALTER TYPE public.pay_account_type ADD VALUE IF NOT EXISTS 'mototaxi_wallet';
ALTER TYPE public.pay_account_type ADD VALUE IF NOT EXISTS 'driver_wallet';
