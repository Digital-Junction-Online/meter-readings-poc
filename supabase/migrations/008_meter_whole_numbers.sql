-- Meters with no decimal point on the dial.
--
-- Some of Wayne's meters show whole units only (68705), others show a decimal
-- (94656.3). On a whole-number meter a typed decimal point is always a mistake:
-- 6870.5 for 68705 makes the next month read ten times too high. With this set,
-- the capture screen refuses a decimal point on that meter.
--
-- Off by default, so nothing changes until Wayne ticks it on a meter.
-- Safe to run more than once. Run this BEFORE deploying the matching app code.

alter table meters
  add column if not exists whole_numbers boolean not null default false;

comment on column meters.whole_numbers is
  'The dial has no decimal point: readings are whole units only.';
