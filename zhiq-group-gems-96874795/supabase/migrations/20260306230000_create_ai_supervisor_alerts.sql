-- Create table for AI Supervisor Alerts
CREATE TABLE IF NOT EXISTS public.ai_supervisor_alerts (
    id uuid primary key default gen_random_uuid(),
    alert_type text not null,
    severity text not null default 'medium',
    entity_type text,
    entity_id uuid,
    related_user_id uuid,
    title text not null,
    description text not null,
    detected_by text default 'ai_supervisor',
    status text default 'open',
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now(),
    resolved_at timestamptz,
    CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    CONSTRAINT valid_status CHECK (status IN ('open', 'resolved', 'false_positive', 'escalated'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_supervisor_alerts_status ON public.ai_supervisor_alerts(status, severity, created_at desc);
CREATE INDEX IF NOT EXISTS idx_ai_supervisor_alerts_user ON public.ai_supervisor_alerts(related_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_supervisor_alerts_type ON public.ai_supervisor_alerts(alert_type);

-- Enable RLS
ALTER TABLE public.ai_supervisor_alerts ENABLE ROW LEVEL SECURITY;

-- Policies: Admin can manage all alerts
CREATE POLICY "Admins can manage all AI supervisor alerts"
ON public.ai_supervisor_alerts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_supervisor_alerts;
