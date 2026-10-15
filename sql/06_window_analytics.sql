-- Workflow 2: 7-day moving average revenue per freelancer + DENSE_RANK.
-- A2 change: revenue is counted on the day the contract was COMPLETED (completed_at),
-- not the day it was created, because that is when the freelancer actually earns it.
-- A2 fix: the 7-day moving average is the window's total revenue divided by 7 days.
-- The A1 query used AVG() over the rows in the window, but there is only a row for days
-- WITH revenue, so a freelancer who earned 5,000 on one day of the week showed 5,000
-- instead of 714 (5,000 / 7). Days without revenue now count as zero.
-- The API uses this same query (api/src/routes/analytics.js) in two forms:
--   * ranking  : this file as-is (latest moving average per freelancer, ranked)
--   * series   : the `moving` CTE filtered to one freelancer, for the chart
WITH daily_revenue AS (
 SELECT freelancer_id, completed_at::date AS revenue_day, SUM(budget) AS daily_revenue
 FROM contracts WHERE status='COMPLETED' AND completed_at IS NOT NULL
 GROUP BY freelancer_id, completed_at::date
), moving AS (
 SELECT freelancer_id,revenue_day,daily_revenue,
 SUM(daily_revenue) OVER(
   PARTITION BY freelancer_id ORDER BY revenue_day
   RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
 ) / 7.0 AS moving_avg_7d
 FROM daily_revenue
), latest AS (
 SELECT *,ROW_NUMBER() OVER(PARTITION BY freelancer_id ORDER BY revenue_day DESC) rn
 FROM moving
)
SELECT freelancer_id,revenue_day,ROUND(moving_avg_7d,2) AS moving_average_7d,
 DENSE_RANK() OVER(ORDER BY ROUND(moving_avg_7d,2) DESC) AS freelancer_rank
FROM latest WHERE rn=1 ORDER BY freelancer_rank,freelancer_id;
