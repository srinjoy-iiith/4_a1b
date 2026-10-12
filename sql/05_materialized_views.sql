DROP MATERIALIZED VIEW IF EXISTS freelancer_lifetime_stats;
CREATE MATERIALIZED VIEW freelancer_lifetime_stats AS
SELECT f.id AS freelancer_id, f.name,
 COUNT(c.id) FILTER (WHERE c.status='COMPLETED') AS completed_contracts,
 COALESCE(SUM(c.budget) FILTER (WHERE c.status='COMPLETED'),0)::DECIMAL(14,2) AS total_earnings
FROM freelancers f LEFT JOIN contracts c ON c.freelancer_id=f.id
GROUP BY f.id,f.name;

CREATE UNIQUE INDEX idx_freelancer_lifetime_stats_pk
ON freelancer_lifetime_stats(freelancer_id);

-- A2 addition: Postgres does not record when a materialized view was refreshed,
-- so the refresh procedure writes a row here. The Analytics screen shows the latest one.
CREATE TABLE IF NOT EXISTS mv_refresh_log (
 id BIGSERIAL PRIMARY KEY,
 view_name TEXT NOT NULL,
 refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO mv_refresh_log(view_name) VALUES ('freelancer_lifetime_stats');

CREATE OR REPLACE PROCEDURE refresh_freelancer_lifetime_stats()
LANGUAGE plpgsql AS $$
BEGIN
 REFRESH MATERIALIZED VIEW CONCURRENTLY freelancer_lifetime_stats;
 INSERT INTO mv_refresh_log(view_name) VALUES ('freelancer_lifetime_stats');
END; $$;
-- CALL refresh_freelancer_lifetime_stats();
