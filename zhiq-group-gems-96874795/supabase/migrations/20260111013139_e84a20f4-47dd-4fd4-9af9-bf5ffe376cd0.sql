-- Add transport capacity fields to motoboy_profiles
ALTER TABLE public.motoboy_profiles
ADD COLUMN tipo_transporte text CHECK (tipo_transporte IN ('bag', 'garupa', 'bag_garupa')),
ADD COLUMN capacidade_bag text CHECK (capacidade_bag IN ('pequeno', 'medio', 'grande')),
ADD COLUMN capacidade_garupa text CHECK (capacidade_garupa IN ('pequeno', 'medio', 'grande'));