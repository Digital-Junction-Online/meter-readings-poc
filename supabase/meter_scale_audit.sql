-- The full reading history of every meter that has a suspect reading.
--
-- Read-only. Run it in Studio (wayne-studio.djbase.co.za -> SQL Editor).
--
-- WHY THIS EXISTS
-- ---------------
-- The first pass assumed each bad reading was a one-off typo, fixable by
-- removing the extra digit. The real readings say otherwise. For most meters
-- the value jumps ten-fold ONCE and then stays there:
--
--     Unit 115 water:  24710.49  ->  247312.6  ->  247558.90
--                                    ^ jumps x10        ^ stays at the new scale
--
-- So it is not one wrong number — it is a change of scale, and every reading
-- after the jump is at the new scale. Correcting only the flagged reading
-- would leave the NEXT month reading 222,827 kL. That would make the data
-- worse, not better.
--
-- WHAT TO LOOK FOR
-- ----------------
-- `ratio_to_previous` is this reading divided by the one before it.
--   ~1.0   normal: the meter crept up
--   ~10    the scale jumped UP here
--   ~0.1   the scale dropped BACK here
-- Each jump is a boundary. Open the photos either side of it: the dial tells
-- you which scale is the true one, and the readings on the wrong side of the
-- boundary are the ones to restate.
--
-- `usage` is the step up from the previous reading. Across a boundary it is
-- meaningless; within one scale it should look like an ordinary month.
--
-- DO NOT correct anything from this sheet alone. It shows the shape of the
-- problem; the photo decides the answer.

with stepped as (
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
usable as (
  select s.*, s.reading_value - s.previous_value as usage
  from stepped s
  where s.previous_value is not null
),
baseline as (
  select
    meter_id,
    percentile_disc(0.5) within group (order by usage) as median_usage,
    count(*) as usable_months
  from usable
  where usage > 0
  group by meter_id
),
property_usual as (
  select
    m.property_id,
    m.service,
    percentile_disc(0.5) within group (order by u.usage) as median_usage
  from usable u
  join meters m on m.id = u.meter_id
  where u.usage > 0
  group by m.property_id, m.service
),
affected as (
  -- Meters with at least one reading the app currently refuses to count.
  select distinct u.meter_id
  from usable u
  join baseline b  on b.meter_id = u.meter_id
  join meters   m  on m.id = u.meter_id
  join property_usual pu
    on pu.property_id = m.property_id and pu.service = m.service
  where b.usable_months >= 3
    and b.median_usage > 0
    and u.usage > b.median_usage * 20
    and u.usage > pu.median_usage
)
select
  p.name                                as property,
  coalesce(un.unit_number, m.label)     as unit,
  m.service,
  to_char(mr.captured_at at time zone 'Africa/Johannesburg', 'YYYY-MM-DD') as captured,
  mr.reading_value,
  round((mr.reading_value / nullif(lag(mr.reading_value) over w, 0))::numeric, 3)
                                        as ratio_to_previous,
  round((mr.reading_value - lag(mr.reading_value) over w)::numeric, 2)
                                        as usage,
  case
    when lag(mr.reading_value) over w is null then 'first reading'
    when mr.reading_value / nullif(lag(mr.reading_value) over w, 0) between 8 and 12
      then '<<< SCALE JUMPED UP x10'
    when mr.reading_value / nullif(lag(mr.reading_value) over w, 0) between 0.08 and 0.12
      then '<<< SCALE DROPPED BACK'
    else ''
  end                                   as boundary,
  mr.flag_status,
  mr.id                                 as reading_id,
  mr.photo_url
from meter_readings mr
join affected   a  on a.meter_id = mr.meter_id
join meters     m  on m.id = mr.meter_id
join properties p  on p.id = m.property_id
left join units un on un.id = m.unit_id
window w as (partition by mr.meter_id order by mr.captured_at)
order by p.name, m.service, unit, mr.captured_at;
