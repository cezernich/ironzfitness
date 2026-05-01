-- 2026-04-30 — Add birthday + body_comp_goal columns to profiles
--
-- Two profile fields lived only in localStorage because the structured
-- profiles table never had columns for them:
--
--   birthday        — captured by the Athlete Profile Month/Day/Year
--                     picker (and by onboarding-v2 / onboarding-legacy).
--                     Used to derive `age` and to drive the birthday
--                     reminder banner.
--   body_comp_goal  — added 2026-04-30 as the first-class body-comp
--                     phase ("cut" | "lose" | "maintain" | "build" |
--                     "bulk"). Drives the calorie multiplier + protein
--                     floor in _nutritionGoalAdjustment().
--
-- Without these columns, every cross-device login or refreshAllKeys
-- race blew the local-only fields away — users reported "my birthday
-- doesn't stick no matter how many times I save it" and bodyCompGoal
-- silently reset to the migration default. A defensive workaround was
-- added in app.js (DB.syncKey('profile') now mirrors the full JSON to
-- the user_data table) but the structured columns are the right home.
--
-- birthday is stored as ISO YYYY-MM-DD text rather than a DATE type so
-- the round-trip with the localStorage string representation is lossless
-- and any "" empty-string assignments don't trip Postgres date parsing.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS body_comp_goal text;
