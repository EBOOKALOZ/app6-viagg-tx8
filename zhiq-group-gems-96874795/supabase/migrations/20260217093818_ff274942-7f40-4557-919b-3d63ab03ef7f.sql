-- Update all profiles with 35% commission (0 groups) to the correct 30%
UPDATE public.profiles
SET percentual_comissao_atual = 30
WHERE quantidade_grupos_ativos = 0
  AND percentual_comissao_atual = 35;

-- Update the expansion_settings base commission to 30
UPDATE public.expansion_settings
SET base_commission_percent = 30
WHERE base_commission_percent = 35;