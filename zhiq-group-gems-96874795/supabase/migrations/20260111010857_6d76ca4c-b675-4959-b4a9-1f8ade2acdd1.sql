-- Create table for motoboy WhatsApp groups (similar to driver_whatsapp_groups)
CREATE TABLE public.motoboy_whatsapp_groups (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    link text NOT NULL,
    cidade text NOT NULL,
    estado text NOT NULL,
    tipo text NOT NULL DEFAULT 'Geral'::text,
    status text NOT NULL DEFAULT 'em_analise'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.motoboy_whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own motoboy groups" 
ON public.motoboy_whatsapp_groups 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own motoboy groups" 
ON public.motoboy_whatsapp_groups 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own motoboy groups" 
ON public.motoboy_whatsapp_groups 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all motoboy groups" 
ON public.motoboy_whatsapp_groups 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all motoboy groups" 
ON public.motoboy_whatsapp_groups 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create motoboy profiles table
CREATE TABLE public.motoboy_profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE,
    cpf_cnpj text,
    estado text,
    cidade text,
    whatsapp text,
    veiculo_tipo text DEFAULT 'moto',
    veiculo_marca text,
    veiculo_modelo text,
    veiculo_placa text,
    veiculo_ano integer,
    cnh_numero text,
    cnh_categoria text DEFAULT 'A',
    cnh_validade date,
    is_online boolean DEFAULT false,
    is_approved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.motoboy_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for motoboy_profiles
CREATE POLICY "Users can view their own motoboy profile" 
ON public.motoboy_profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own motoboy profile" 
ON public.motoboy_profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own motoboy profile" 
ON public.motoboy_profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all motoboy profiles" 
ON public.motoboy_profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all motoboy profiles" 
ON public.motoboy_profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create motoboy free rides table
CREATE TABLE public.motoboy_free_rides (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    ride_id uuid,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.motoboy_free_rides ENABLE ROW LEVEL SECURITY;

-- Create policies for motoboy_free_rides
CREATE POLICY "Users can view their own motoboy free rides" 
ON public.motoboy_free_rides 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own motoboy free rides" 
ON public.motoboy_free_rides 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own motoboy free rides" 
ON public.motoboy_free_rides 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all motoboy free rides" 
ON public.motoboy_free_rides 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function to get motoboy incentives (similar to driver)
CREATE OR REPLACE FUNCTION public.get_motoboy_incentives(_user_id uuid)
RETURNS TABLE (
    active_groups_count bigint,
    profile_level text,
    total_free_rides bigint,
    used_free_rides bigint,
    available_free_rides bigint,
    groups_to_next_ride integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    active_count bigint;
    total_rides bigint;
    used_rides bigint;
    available_rides bigint;
    level_name text;
    groups_needed integer;
BEGIN
    -- Count active groups
    SELECT COUNT(*) INTO active_count
    FROM public.motoboy_whatsapp_groups
    WHERE user_id = _user_id AND status = 'ativo';

    -- Calculate free rides (1 per 5 active groups)
    total_rides := active_count / 5;
    
    -- Count used rides
    SELECT COUNT(*) INTO used_rides
    FROM public.motoboy_free_rides
    WHERE user_id = _user_id AND used_at IS NOT NULL;

    available_rides := GREATEST(0, total_rides - used_rides);

    -- Determine profile level
    IF active_count >= 10 THEN
        level_name := 'Ouro';
    ELSIF active_count >= 5 THEN
        level_name := 'Prata';
    ELSE
        level_name := 'Bronze';
    END IF;

    -- Calculate groups needed for next free ride
    groups_needed := 5 - (active_count % 5);
    IF groups_needed = 5 AND active_count > 0 THEN
        groups_needed := 0;
    END IF;

    RETURN QUERY SELECT 
        active_count,
        level_name,
        total_rides,
        used_rides,
        available_rides,
        groups_needed;
END;
$$;

-- Create function to get motoboy regional ranking
CREATE OR REPLACE FUNCTION public.get_motoboy_regional_ranking(
    _estado text,
    _cidade text DEFAULT NULL,
    _limit integer DEFAULT 10
)
RETURNS TABLE (
    rank_position bigint,
    user_id uuid,
    user_name text,
    active_groups bigint,
    cidade text,
    estado text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH ranked_motoboys AS (
        SELECT 
            mp.user_id,
            p.name as user_name,
            mp.cidade,
            mp.estado,
            COUNT(mg.id) FILTER (WHERE mg.status = 'ativo') as active_groups
        FROM public.motoboy_profiles mp
        LEFT JOIN public.motoboy_whatsapp_groups mg ON mp.user_id = mg.user_id
        LEFT JOIN public.profiles p ON mp.user_id = p.id
        WHERE mp.estado = _estado
        AND (_cidade IS NULL OR mp.cidade = _cidade)
        GROUP BY mp.user_id, p.name, mp.cidade, mp.estado
        HAVING COUNT(mg.id) FILTER (WHERE mg.status = 'ativo') > 0
    )
    SELECT 
        ROW_NUMBER() OVER (ORDER BY rm.active_groups DESC, rm.user_name) as rank_position,
        rm.user_id,
        rm.user_name,
        rm.active_groups,
        rm.cidade,
        rm.estado
    FROM ranked_motoboys rm
    ORDER BY rm.active_groups DESC, rm.user_name
    LIMIT _limit;
END;
$$;