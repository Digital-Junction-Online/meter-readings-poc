-- Correcting the mistyped readings, rather than hiding them.
--
-- The app leaves suspect readings out of client figures so nobody is shown an
-- impossible number. That is a guard, not a cure: the wrong number is still in
-- the database, and it is still wrong on the readings list, in the PDF, and in
-- anything billed off it. This script is the cure.
--
-- Usage is NOT stored — it is worked out as the step up from the previous
-- reading — so correcting reading_value fixes every total, chart and report
-- at once. Nothing else needs touching.
--
-- STEP 1 is read-only and safe to run as often as you like.
-- STEP 2 changes billing figures and is commented out on purpose. Only run it
-- on readings Wayne has confirmed against the photo.


-- =====================================================================
-- STEP 1 — the review sheet. Read-only.
-- =====================================================================
-- One row per suspect reading, with what it would become if the extra digit
-- were removed. Work down it with the photos open.
--
-- Read `verdict` as a hint, never as permission:
--   "fits"      - dividing by 10 lands the month near this meter's usual
--   "check"     - dividing by 10 does NOT explain it; a different mistake
--   "negative"  - the correction would read lower than the month before
--
-- Open photo_url for each one. The photo is the evidence; this is arithmetic.

with stepped as (
  select
    mr.id,
    mr.meter_id,
    mr.captured_at,
    mr.reading_value,
    mr.photo_url,
    lag(mr.reading_value) over (
      partition by mr.meter_id order by mr.captured_at
    ) as previous_value,
    lead(mr.reading_value) over (
      partition by mr.meter_id order by mr.captured_at
    ) as next_value
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
suspect as (
  select
    u.*,
    b.median_usage as meter_usual,
    round(u.reading_value / 10.0, 2)                as proposed_value,
    round(u.reading_value / 10.0 - u.previous_value, 2) as usage_if_fixed,
    round((u.reading_value / nullif(u.previous_value, 0))::numeric, 2) as reading_ratio
  from usable u
  join baseline b on b.meter_id = u.meter_id
  join meters   m on m.id = u.meter_id
  join property_usual pu
    on pu.property_id = m.property_id and pu.service = m.service
  where b.usable_months >= 3
    and b.median_usage > 0
    and u.usage > b.median_usage * 20
    and u.usage > pu.median_usage
)
select
  p.name                                   as property,
  coalesce(un.unit_number, m.label)        as unit,
  m.service,
  to_char(s.captured_at at time zone 'Africa/Johannesburg', 'YYYY-MM-DD') as captured,
  s.previous_value,
  s.reading_value                          as current_value,
  s.proposed_value,
  s.reading_ratio,
  round(s.usage, 2)                        as usage_now,
  s.usage_if_fixed,
  round(s.meter_usual, 2)                  as meter_usual,
  case
    when s.usage_if_fixed < 0 then 'negative'
    when s.usage_if_fixed <= s.meter_usual * 3 then 'fits'
    else 'check'
  end                                      as verdict,
  -- What the NEXT reading's month becomes once this one is corrected. It is
  -- measured against this reading, so correcting one fixes two months.
  round(s.next_value - s.proposed_value, 2) as next_month_if_fixed,
  s.id                                     as reading_id,
  s.photo_url
from suspect s
join meters     m  on m.id = s.meter_id
join properties p  on p.id = m.property_id
left join units un on un.id = m.unit_id
order by p.name, verdict, unit;


-- =====================================================================
-- STEP 2 — DO NOT RUN ON MOST ROWS. Read this first.
-- =====================================================================
-- Running this against Tarragon Two's real readings showed the assumption
-- underneath it is wrong for most of them.
--
-- It assumes each bad reading is a one-off typo. For 17 of 22 rows it is not:
-- the value jumps ten-fold ONCE and every later reading stays at the new
-- scale.
--
--     Unit 115 water:  24710.49  ->  247312.6  ->  247558.90
--
-- Dividing only the flagged reading by 10 leaves the NEXT month reading
-- 222,827 kL. The `next_month_if_fixed` column above is what catches this:
-- if it is wildly larger than meter_usual, this correction is the WRONG one
-- and will make the data worse.
--
-- Only four readings are genuine one-off typos, where both the month and the
-- month after it land near that meter's usual:
--     Unit 141 electricity 2026-04-13     Unit 135 water 2026-06-16
--     Unit 149 water       2026-04-13     Unit 119 water 2026-08-23
--
-- For everything else, run meter_scale_audit.sql instead. It shows each
-- meter's whole history and marks where the scale jumped, which is the
-- boundary the photos need to settle.
--
-- Uncomment and run ONLY after Wayne has opened each photo and confirmed it,
-- AND only for readings where next_month_if_fixed also looks right.
-- Paste in the reading_id values from STEP 1 — nothing is corrected wholesale,
-- and a reading whose photo was not checked does not belong in this list.
--
-- It runs inside a transaction so you can look before you commit.
--
-- begin;
--
-- update meter_readings
--    set reading_value = round(reading_value / 10.0, 2),
--        -- The old flag described the wrong number. Clear it and record that
--        -- a human looked, so it leaves the review queue honestly.
--        flag_status = 'ok',
--        reviewed_at = now(),
--        reviewed_by = (select id from auth.users where email = 'REPLACE@WITH.WAYNE')
--  where id in (
--    -- 'paste-reading_id-here',
--    -- 'paste-reading_id-here'
--  );
--
-- -- Re-run STEP 1 now, in the same transaction, and read the output.
-- -- Expect the corrected rows to be gone and no NEW rows to appear.
-- -- If it looks right:   commit;
-- -- If anything is off:  rollback;
--
-- rollback;
