-- Which readings does the app leave out of client figures, and why?
--
-- Read-only. Run it in Studio (wayne-studio.djbase.co.za -> SQL Editor).
-- It changes nothing; it just shows you the same decision the app makes, so
-- you can open each one against its meter photo and confirm it really is a
-- mistyped reading rather than real consumption.
--
-- The rule, matching src/lib/clientReport.ts exactly:
--   usage  = this reading - the meter's previous reading
--   median = that meter's own middle usage, over its positive months
--   a reading is suspect when usage > 20x that median
--   a meter with fewer than 3 usable months is never judged
--
-- Expect ZERO rows on clean data. Every row is a reading Wayne should open
-- in Review and either correct or accept.

with usage as (
  select
    mr.id,
    mr.meter_id,
    mr.captured_at,
    mr.reading_value,
    lag(mr.reading_value) over (
      partition by mr.meter_id order by mr.captured_at
    ) as previous_value
  from meter_readings mr
),
stepped as (
  select u.*, u.reading_value - u.previous_value as usage
  from usage u
  where u.previous_value is not null
),
baseline as (
  select
    meter_id,
    -- percentile_disc picks a real reading rather than interpolating, which
    -- is what the app's lower-median does.
    percentile_disc(0.5) within group (order by usage) as median_usage,
    count(*) as usable_months
  from stepped
  where usage > 0
  group by meter_id
)
select
  p.name                                              as property,
  coalesce(un.unit_number, m.label)                   as unit,
  m.service,
  to_char(s.captured_at at time zone 'Africa/Johannesburg',
          'YYYY-MM-DD')                               as captured,
  s.previous_value                                    as previous_reading,
  s.reading_value                                     as this_reading,
  s.usage                                             as implied_usage,
  b.median_usage                                      as meter_usual,
  round(s.usage / nullif(b.median_usage, 0))          as times_usual,
  b.usable_months,
  mr.flag_status,
  mr.reviewed_at is not null                          as already_reviewed,
  mr.photo_url
from stepped s
join baseline   b  on b.meter_id = s.meter_id
join meter_readings mr on mr.id = s.id
join meters     m  on m.id  = s.meter_id
join properties p  on p.id  = m.property_id
left join units un on un.id = m.unit_id
where b.usable_months >= 3
  and b.median_usage  > 0
  and s.usage > b.median_usage * 20
order by times_usual desc;
