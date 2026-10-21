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
--     AND usage is also above what a typical meter at that property uses
--   a meter with fewer than 3 usable months is never judged
--
-- That second condition matters. Some meters barely move — a vacant unit, or
-- one replaced partway through — and 20x almost nothing is still almost
-- nothing, so an ordinary month trips the test on its own. The first run of
-- this query flagged Unit 124 using 104 kWh because that meter's own usual
-- was 0.43 kWh. It was a perfectly normal month.
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
),
property_usual as (
  -- What a typical meter at this property uses in a month, per service.
  select
    m.property_id,
    m.service,
    percentile_disc(0.5) within group (order by s.usage) as median_usage,
    count(*) as usable_months
  from stepped s
  join meters m on m.id = s.meter_id
  where s.usage > 0
  group by m.property_id, m.service
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
  -- An extra digit typed in front leaves this_reading at ~10x the previous,
  -- which is the signature to look for when you open the photo.
  round((s.reading_value / nullif(s.previous_value, 0))::numeric, 2) as reading_ratio,
  mr.flag_status,
  mr.reviewed_at is not null                          as already_reviewed,
  mr.photo_url
from stepped s
join baseline   b  on b.meter_id = s.meter_id
join meter_readings mr on mr.id = s.id
join meters     m  on m.id  = s.meter_id
join properties p  on p.id  = m.property_id
join property_usual pu on pu.property_id = m.property_id and pu.service = m.service
left join units un on un.id = m.unit_id
where b.usable_months >= 3
  and b.median_usage  > 0
  and s.usage > b.median_usage * 20
  and s.usage > pu.median_usage
order by times_usual desc;
