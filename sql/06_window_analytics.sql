-- Workflow 2: 7-day moving average revenue per freelancer + DENSE_RANK.
-- A2 change: revenue is counted on the day the contract was COMPLETED (completed_at),
-- not the day it was created, because that is when the freelancer actually earns it.
-- The API uses this same query (api/src/queries/analytics.js) in two forms:
--   * ranking  : this file as-is (latest moving average per freelancer, ranked)
--   * series   : the `moving` CTE filtered to one freelancer, for the chart
WITH daily_revenue AS (
 SELECT freelancer_id, completed_at::date AS revenue_day, SUM(budget) AS daily_revenue
 FROM contracts WHERE status='COMPLETED' AND completed_at IS NOT NULL
 GROUP BY freelancer_id, completed_at::date
), moving AS (
 SELECT freelancer_id,revenue_day,daily_revenue,
 AVG(daily_revenue) OVER(
   PARTITION BY freelancer_id ORDER BY revenue_day
   RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
 ) AS moving_avg_7d
 FROM daily_revenue
), latest AS (
 SELECT *,ROW_NUMBER() OVER(PARTITION BY freelancer_id ORDER BY revenue_day DESC) rn
 FROM moving
)
SELECT freelancer_id,revenue_day,ROUND(moving_avg_7d,2) AS moving_average_7d,
 DENSE_RANK() OVER(ORDER BY ROUND(moving_avg_7d,2) DESC) AS freelancer_rank
FROM latest WHERE rn=1 ORDER BY freelancer_rank,freelancer_id;
