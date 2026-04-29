
DROP VIEW IF EXISTS public.admin_posting_numbers_dashboard;

CREATE VIEW public.admin_posting_numbers_dashboard AS
SELECT 
    id,
    phone_number,
    status,
    risk_score,
    health_score,
    total_groups,
    CASE
        WHEN health_score < 30 THEN 'CRITICO'
        WHEN health_score < 50 THEN 'ALTO'
        WHEN health_score < 75 THEN 'MODERADO'
        ELSE 'SAUDAVEL'
    END AS health_level,
    cooldown_until,
    (SELECT count(*) FROM number_activity_log l WHERE l.number_id = pn.id AND l.created_at >= (now() - interval '24 hours')) AS actions_24h,
    (SELECT count(*) FROM number_activity_log l WHERE l.number_id = pn.id AND l.created_at >= (now() - interval '7 days')) AS actions_7d,
    created_at,
    updated_at
FROM posting_numbers pn;
