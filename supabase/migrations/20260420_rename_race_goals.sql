-- 20260420_rename_race_goals.sql
--
-- PLAN_GENERATOR_MASTER_SPEC.md v2.4 — CHANGE 1 renames race.goal enum values:
--   just_finish → finish
--   time_goal   → get_faster
--   pr_podium   → pr
--
-- Also absorbs two older UI-only values that shipped in an earlier
-- onboarding chip picker:
--   time   → get_faster
--   podium → pr
--
-- Affects workout_library.race_goals (text[] column). No schema change,
-- only value rewrites. Idempotent — running twice is a no-op.

begin;

-- 1. workout_library.race_goals — array column. array_replace() operates
--    on one value at a time, so we chain the three alias fixes.
update workout_library
set race_goals = array_replace(
                   array_replace(
                     array_replace(
                       array_replace(
                         array_replace(race_goals, 'just_finish', 'finish'),
                         'time_goal', 'get_faster'
                       ),
                       'pr_podium', 'pr'
                     ),
                     'time', 'get_faster'
                   ),
                   'podium', 'pr'
                 )
where race_goals && array['just_finish', 'time_goal', 'pr_podium', 'time', 'podium']::text[];

-- 2. If the app later persists race.goal on an events table in Supabase,
--    migrate those rows too. At time of writing the events are stored
--    in user localStorage (mirrored client-side by DB.syncEvents), but
--    future schema might add an events table with a goal column. The
--    DO block no-ops cleanly when the column doesn't exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'goal'
  ) then
    execute $q$
      update events set goal =
        case goal
          when 'just_finish' then 'finish'
          when 'time_goal'   then 'get_faster'
          when 'pr_podium'   then 'pr'
          when 'time'        then 'get_faster'
          when 'podium'      then 'pr'
          else goal
        end
      where goal in ('just_finish','time_goal','pr_podium','time','podium');
    $q$;
  end if;
end $$;

commit;
