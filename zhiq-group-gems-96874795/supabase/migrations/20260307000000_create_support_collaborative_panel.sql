-- Migration: Create Collaborative Support Panel (VIAGG-TX8 MEGA SKILL)
-- Description: Adds 'support_agents' table, new ticket tracking fields, and Collaborative RLS.

-- 1. Create support_agents table
CREATE TABLE IF NOT EXISTS public.support_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('supervisor', 'agent')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for support_agents
ALTER TABLE public.support_agents ENABLE ROW LEVEL SECURITY;

-- Agents can read other agents profiles (useful for assignment dropdowns)
CREATE POLICY "Agents can view all agents"
ON public.support_agents
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR EXISTS (SELECT 1 FROM public.support_agents WHERE auth_user_id = auth.uid() AND is_active = true)
);

-- Only Admin or Supervisors can insert/update agents
CREATE POLICY "Supervisors and Admins can manage agents"
ON public.support_agents
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR EXISTS (SELECT 1 FROM public.support_agents WHERE auth_user_id = auth.uid() AND role = 'supervisor' AND is_active = true)
);

-- 2. Add Collaboration Columns to support_tickets
ALTER TABLE public.support_tickets
ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_response_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Update Support Ticket RLS for Agents
-- Assuming "Admins can manage all tickets" already exists by previous migration.
-- Let's add specific policies for Support Agents to view and manage tickets.

CREATE POLICY "Support Agents can manage all tickets"
ON public.support_tickets
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.support_agents WHERE auth_user_id = auth.uid() AND is_active = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.support_agents WHERE auth_user_id = auth.uid() AND is_active = true)
);

-- Ensure Realtime is enabled for support_agents so UI updates correctly if someone's role changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'support_agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_agents;
  END IF;
END $$;
