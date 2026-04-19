-- Extends workout_library.sport to allow 'hyrox' and 'circuit'.
--
-- The initial 20260419_workout_library.sql only listed
-- swim/bike/run/strength/brick/cross_train. Hyrox athletes and circuit/HIIT
-- programs need their own sport buckets in the admin portal. This follow-up
-- drops the old CHECK constraint and adds the two new values.
--
-- Safe to run on any workout_library instance — no data rewrites, only the
-- constraint changes. Requires no index rebuilds.

alter table public.workout_library
  drop constraint if exists workout_library_sport_check;

alter table public.workout_library
  add constraint workout_library_sport_check
  check (sport in ('swim','bike','run','strength','brick','cross_train','hyrox','circuit'));
