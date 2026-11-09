


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."_auto_create_invite_link"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.is_coach = TRUE
     AND (OLD.is_coach IS NULL OR OLD.is_coach = FALSE) THEN
    INSERT INTO public.coach_invite_links (coach_id, code)
    VALUES (NEW.id, public._gen_invite_code())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_auto_create_invite_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_coach_assignment_after_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_schedule JSONB;
  old_entry_id TEXT;
BEGIN
  old_entry_id := 'coach-' || OLD.id::text;

  SELECT data_value INTO current_schedule
    FROM public.user_data
    WHERE user_id = OLD.client_id AND data_key = 'workoutSchedule'
    FOR UPDATE;

  IF current_schedule IS NULL OR jsonb_typeof(current_schedule) <> 'array' THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO current_schedule
    FROM jsonb_array_elements(current_schedule) AS elem
    WHERE COALESCE(elem->>'id', '') <> old_entry_id;

  UPDATE public.user_data
    SET data_value     = current_schedule,
        last_edited_by = OLD.coach_id,
        last_edited_at = NOW(),
        updated_at     = NOW()
    WHERE user_id = OLD.client_id AND data_key = 'workoutSchedule';

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."_coach_assignment_after_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_coach_assignment_after_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_schedule JSONB;
  new_entry JSONB;
BEGIN
  new_entry := public._coach_assignment_to_schedule_entry(NEW);

  SELECT data_value INTO current_schedule
    FROM public.user_data
    WHERE user_id = NEW.client_id AND data_key = 'workoutSchedule'
    FOR UPDATE;

  IF current_schedule IS NULL OR jsonb_typeof(current_schedule) <> 'array' THEN
    current_schedule := '[]'::jsonb;
  END IF;

  IF NEW.conflict_mode = 'replace' THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO current_schedule
      FROM jsonb_array_elements(current_schedule) AS elem
      WHERE COALESCE(elem->>'date', '') <> NEW.date::text;
  END IF;

  IF NEW.conflict_mode = 'freeze' THEN
    INSERT INTO public.client_plan_freeze (client_id, frozen_by, frozen_at)
      VALUES (NEW.client_id, NEW.coach_id, NOW())
      ON CONFLICT (client_id) DO UPDATE
        SET frozen_by = EXCLUDED.frozen_by,
            frozen_at = EXCLUDED.frozen_at,
            unfrozen_at = NULL;
  END IF;

  current_schedule := current_schedule || jsonb_build_array(new_entry);

  INSERT INTO public.user_data
    (user_id, data_key, data_value, last_edited_by, last_edited_at, updated_at)
    VALUES (NEW.client_id, 'workoutSchedule', current_schedule,
            NEW.coach_id, NOW(), NOW())
    ON CONFLICT (user_id, data_key)
    DO UPDATE SET
      data_value     = EXCLUDED.data_value,
      last_edited_by = EXCLUDED.last_edited_by,
      last_edited_at = EXCLUDED.last_edited_at,
      updated_at     = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_coach_assignment_after_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_coach_assignment_after_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_schedule JSONB;
  new_entry JSONB;
  old_entry_id TEXT;
BEGIN
  -- Skip the schedule rewrite when only client-feedback columns changed.
  -- client_note / client_rating / client_responded_at don't surface in
  -- the schedule mirror, so feedback updates have nothing to mirror.
  IF OLD.date          IS NOT DISTINCT FROM NEW.date
     AND OLD.workout       IS NOT DISTINCT FROM NEW.workout
     AND OLD.coach_note    IS NOT DISTINCT FROM NEW.coach_note
     AND OLD.conflict_mode IS NOT DISTINCT FROM NEW.conflict_mode
     AND OLD.client_id     IS NOT DISTINCT FROM NEW.client_id
     AND OLD.coach_id      IS NOT DISTINCT FROM NEW.coach_id
  THEN
    RETURN NEW;
  END IF;

  new_entry := public._coach_assignment_to_schedule_entry(NEW);
  old_entry_id := 'coach-' || NEW.id::text;

  -- If the date changed, treat as delete-and-reinsert: strip the old
  -- entry from wherever it was, append the new one. If the date is
  -- the same, swap in place.
  SELECT data_value INTO current_schedule
    FROM public.user_data
    WHERE user_id = NEW.client_id AND data_key = 'workoutSchedule'
    FOR UPDATE;

  IF current_schedule IS NULL OR jsonb_typeof(current_schedule) <> 'array' THEN
    current_schedule := '[]'::jsonb;
  END IF;

  -- Strip the old version of THIS assignment (by synthetic id).
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO current_schedule
    FROM jsonb_array_elements(current_schedule) AS elem
    WHERE COALESCE(elem->>'id', '') <> old_entry_id;

  -- If conflict_mode flipped to 'replace' on the update, strip any
  -- other entries that share the new date too.
  IF NEW.conflict_mode = 'replace' THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      INTO current_schedule
      FROM jsonb_array_elements(current_schedule) AS elem
      WHERE COALESCE(elem->>'date', '') <> NEW.date::text;
  END IF;

  current_schedule := current_schedule || jsonb_build_array(new_entry);

  INSERT INTO public.user_data
    (user_id, data_key, data_value, last_edited_by, last_edited_at, updated_at)
    VALUES (NEW.client_id, 'workoutSchedule', current_schedule,
            NEW.coach_id, NOW(), NOW())
    ON CONFLICT (user_id, data_key)
    DO UPDATE SET
      data_value     = EXCLUDED.data_value,
      last_edited_by = EXCLUDED.last_edited_by,
      last_edited_at = EXCLUDED.last_edited_at,
      updated_at     = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_coach_assignment_after_update"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."coach_assigned_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "workout" "jsonb" NOT NULL,
    "conflict_mode" "text" NOT NULL,
    "coach_note" "text",
    "program_id" "uuid",
    "program_week" integer,
    "program_day" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_note" "text",
    "client_rating" integer,
    "client_responded_at" timestamp with time zone,
    CONSTRAINT "coach_assigned_workouts_client_rating_check" CHECK ((("client_rating" IS NULL) OR (("client_rating" >= 1) AND ("client_rating" <= 5)))),
    CONSTRAINT "coach_assigned_workouts_conflict_mode_check" CHECK (("conflict_mode" = ANY (ARRAY['replace'::"text", 'stack'::"text", 'freeze'::"text"])))
);


ALTER TABLE "public"."coach_assigned_workouts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_coach_assignment_to_schedule_entry"("assignment" "public"."coach_assigned_workouts") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT
    COALESCE(assignment.workout, '{}'::jsonb)
    || jsonb_build_object(
         'id',                'coach-' || assignment.id::text,
         'date',              assignment.date::text,
         'source',            'coach_assigned',
         'coachId',           assignment.coach_id::text,
         'coachAssignmentId', assignment.id::text,
         'coachNote',         assignment.coach_note,
         'assignedAt',        to_jsonb(assignment.created_at)
       );
$$;


ALTER FUNCTION "public"."_coach_assignment_to_schedule_entry"("assignment" "public"."coach_assigned_workouts") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_gen_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  alphabet TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result   TEXT := '';
  i        INT;
  attempt  INT := 0;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(alphabet, floor(random() * 32)::INT + 1, 1);
    END LOOP;
    PERFORM 1 FROM public.coach_invite_links WHERE code = result;
    IF NOT FOUND THEN
      RETURN result;
    END IF;
    attempt := attempt + 1;
    IF attempt > 10 THEN
      RAISE EXCEPTION 'Could not generate unique invite code after 10 attempts';
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."_gen_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_is_active_coach"("p_coach_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = p_coach_uid AND is_coach = TRUE
  );
$$;


ALTER FUNCTION "public"."_is_active_coach"("p_coach_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_subscriptions_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$                                                                                                                 
  begin                                            
    new.updated_at = now();              
    return new;
  end;
  $$;


ALTER FUNCTION "public"."_subscriptions_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_touch_challenge_participants_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_touch_challenge_participants_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_coach_assignment_notes"() RETURNS TABLE("updated" integer, "scanned" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  rec RECORD;
  -- program_day is 1-based (mon=1 .. sun=7) per the JS apply flow
  -- (d.offset + 1). PostgreSQL arrays are 1-indexed so day_keys[1]
  -- correctly resolves to 'mon' without an off-by-one.
  day_keys TEXT[] := ARRAY['mon','tue','wed','thu','fri','sat','sun'];
  slots JSONB;
  slot JSONB;
  slot_index INTEGER;
  lib_id UUID;
  lib_notes TEXT;
  cnt INTEGER := 0;
  total INTEGER := 0;
BEGIN
  FOR rec IN
    -- Multi-slot pairing: when a program day has more than one slot
    -- (rare, but the data model supports it), each slot becomes its
    -- own assignment row at apply time. Pair existing rows back to
    -- slots by created_at order so slot[0] aligns with the first row
    -- inserted, slot[1] with the second, etc. Mirrors the JS
    -- propagate-edits zip at coach-programs.js:494.
    SELECT
      caw.id,
      caw.program_id,
      caw.program_week,
      caw.program_day,
      caw.client_id,
      ROW_NUMBER() OVER (
        PARTITION BY caw.program_id, caw.program_week, caw.program_day, caw.client_id
        ORDER BY caw.created_at, caw.id
      )::INTEGER - 1 AS slot_idx
    FROM public.coach_assigned_workouts caw
    WHERE caw.coach_note IS NULL
      AND caw.program_id IS NOT NULL
      AND caw.program_day IS NOT NULL
      AND caw.program_day BETWEEN 1 AND 7
  LOOP
    total := total + 1;

    -- Pull the day's slot list off the program template.
    SELECT cp.weekly_template -> day_keys[rec.program_day]
      INTO slots
      FROM public.coach_programs cp
      WHERE cp.id = rec.program_id;

    IF slots IS NULL THEN CONTINUE; END IF;

    -- Backward-compat: legacy programs stored a single slot object
    -- per day instead of an array. Normalize to array so the index
    -- access below works either way (mirrors _slotsForDay in JS).
    IF jsonb_typeof(slots) <> 'array' THEN
      slots := jsonb_build_array(slots);
    END IF;

    IF jsonb_array_length(slots) = 0 THEN CONTINUE; END IF;

    -- Clamp slot index to array bounds — if more rows exist than
    -- slots (shouldn't happen but defensively), reuse the last slot.
    slot_index := LEAST(rec.slot_idx, jsonb_array_length(slots) - 1);
    slot := slots -> slot_index;

    IF slot IS NULL THEN CONTINUE; END IF;

    lib_id := NULLIF(slot ->> 'library_id', '')::UUID;
    IF lib_id IS NULL THEN CONTINUE; END IF;

    SELECT cwl.notes INTO lib_notes
      FROM public.coach_workout_library cwl
      WHERE cwl.id = lib_id;

    IF lib_notes IS NULL OR lib_notes = '' THEN CONTINUE; END IF;

    -- The AFTER UPDATE trigger on coach_assigned_workouts handles the
    -- user_data.workoutSchedule mirror automatically.
    UPDATE public.coach_assigned_workouts
      SET coach_note = lib_notes
      WHERE id = rec.id;

    cnt := cnt + 1;
  END LOOP;

  RETURN QUERY SELECT cnt, total;
END;
$$;


ALTER FUNCTION "public"."backfill_coach_assignment_notes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_profile_full_name_from_auth"() RETURNS TABLE("updated" integer, "scanned" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cnt INTEGER := 0;
  total INTEGER := 0;
BEGIN
  -- Count candidates first so we can return both numbers in one go.
  SELECT count(*) INTO total
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE COALESCE(p.full_name, '') = ''
      AND COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), '') <> '';

  UPDATE public.profiles p
    SET full_name = u.raw_user_meta_data ->> 'full_name'
    FROM auth.users u
    WHERE u.id = p.id
      AND COALESCE(p.full_name, '') = ''
      AND COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), '') <> '';

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt, total;
END;
$$;


ALTER FUNCTION "public"."backfill_profile_full_name_from_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_workout_sharing"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Drop expired/revoked shares older than 90 days (post-audit window)
  DELETE FROM shared_workouts
  WHERE (expires_at < now() - interval '60 days')
     OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '60 days');

  -- Drop unclaimed pending shares older than 7 days
  DELETE FROM pending_shares
  WHERE claimed_at IS NULL AND created_at < now() - interval '7 days';
END $$;


ALTER FUNCTION "public"."cleanup_workout_sharing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_delete_client_race"("p_client_id" "uuid", "p_race_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_coach_id uuid := auth.uid();
  v_now      timestamptz := now();
  v_race_events  jsonb;
  v_events       jsonb;
  v_training_plan jsonb;
  v_workout_schedule jsonb;
  v_race jsonb;
  v_filtered_race_events  jsonb;
  v_filtered_events       jsonb;
  v_filtered_plan         jsonb;
  v_filtered_schedule     jsonb;
  v_removed_plan      int := 0;
  v_removed_schedule  int := 0;
  v_audit_payload     jsonb;
begin
  if v_coach_id is null then
    raise exception 'unauthenticated';
  end if;
  if not public.is_coaching(v_coach_id, p_client_id) then
    raise exception 'not a coach for this client';
  end if;

  -- Load the four relevant user_data rows. Each may be missing for
  -- accounts that haven't built a plan; treat missing as empty array.
  select coalesce(data_value, '[]'::jsonb) into v_race_events
    from public.user_data where user_id = p_client_id and data_key = 'raceEvents';
  select coalesce(data_value, '[]'::jsonb) into v_events
    from public.user_data where user_id = p_client_id and data_key = 'events';
  select coalesce(data_value, '[]'::jsonb) into v_training_plan
    from public.user_data where user_id = p_client_id and data_key = 'trainingPlan';
  select coalesce(data_value, '[]'::jsonb) into v_workout_schedule
    from public.user_data where user_id = p_client_id and data_key = 'workoutSchedule';

  v_race_events    := coalesce(v_race_events, '[]'::jsonb);
  v_events         := coalesce(v_events, '[]'::jsonb);
  v_training_plan  := coalesce(v_training_plan, '[]'::jsonb);
  v_workout_schedule := coalesce(v_workout_schedule, '[]'::jsonb);

  -- Pull the race object out of whichever array it's in for the
  -- audit log payload. Race id is stored as text in the JSONB; cast
  -- both sides to text for the comparison.
  select x into v_race
    from jsonb_array_elements(v_race_events) x
    where x->>'id' = p_race_id
    limit 1;
  if v_race is null then
    select x into v_race
      from jsonb_array_elements(v_events) x
      where x->>'id' = p_race_id
      limit 1;
  end if;
  if v_race is null then
    raise exception 'race not found: %', p_race_id;
  end if;

  -- Filter the race out of both arrays — could legitimately exist in
  -- either, so always run both filters.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_race_events
    from jsonb_array_elements(v_race_events) x
    where x->>'id' is distinct from p_race_id;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_events
    from jsonb_array_elements(v_events) x
    where x->>'id' is distinct from p_race_id;

  -- Plan + schedule: drop entries tagged with this raceId. For
  -- workoutSchedule we additionally preserve any entry sourced from
  -- coach_assigned (the coach's deliberate assignments shouldn't
  -- vanish because their parent race went away — that's the user-
  -- confirmed scope rule).
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_plan
    from jsonb_array_elements(v_training_plan) x
    where x->>'raceId' is distinct from p_race_id;
  v_removed_plan := jsonb_array_length(v_training_plan) - jsonb_array_length(v_filtered_plan);

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_filtered_schedule
    from jsonb_array_elements(v_workout_schedule) x
    where (x->>'raceId' is distinct from p_race_id)
       or (x->>'source' = 'coach_assigned');
  v_removed_schedule := jsonb_array_length(v_workout_schedule) - jsonb_array_length(v_filtered_schedule);

  -- Write back the four filtered arrays. Each upsert stamps audit
  -- columns. Idempotent — re-running with the same race id finds
  -- nothing and is a no-op (raises 'race not found' instead).
  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'raceEvents', v_filtered_race_events, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'events', v_filtered_events, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'trainingPlan', v_filtered_plan, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, 'workoutSchedule', v_filtered_schedule, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  -- Audit log: store the race object + removal counts in before_value
  -- so a future undo can rebuild from this row (the race object holds
  -- the full configuration; the workouts can be regenerated).
  v_audit_payload := jsonb_build_object(
    'race', v_race,
    'removed_plan', v_removed_plan,
    'removed_schedule', v_removed_schedule
  );
  insert into public.coach_client_audit_log
    (client_id, coach_id, data_key, before_value, after_value, action)
  values
    (p_client_id, v_coach_id, 'race:' || p_race_id, v_audit_payload, null, 'delete');

  return v_audit_payload;
end;
$$;


ALTER FUNCTION "public"."coach_delete_client_race"("p_client_id" "uuid", "p_race_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coach_update_client_training_input"("p_client_id" "uuid", "p_data_key" "text", "p_data_value" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_coach_id uuid := auth.uid();
  v_before   jsonb;
  v_now      timestamptz := now();
  v_allowed_keys text[] := array[
    'selectedSports',
    'trainingGoals',
    'strengthRole',
    'strengthSetup',
    'longDays',
    'thresholds',
    'buildPlanTemplate',
    'raceEvents',
    'events'
  ];
begin
  if v_coach_id is null then
    raise exception 'unauthenticated';
  end if;

  -- Allowlist check — narrower than the SELECT allowlist by design.
  -- Coaches read more keys than they're allowed to write. New writable
  -- keys must be added here AND in the front-end's edit surface.
  if not (p_data_key = any(v_allowed_keys)) then
    raise exception 'data_key not writable by coach: %', p_data_key;
  end if;

  -- Pairing check — caller must be an active coach for this client.
  -- is_coaching() is the helper from 20260428_coaching_schema; covers
  -- both primary and sub-coach roles.
  if not public.is_coaching(v_coach_id, p_client_id) then
    raise exception 'not a coach for this client';
  end if;

  -- Snapshot the prior value (null if no row yet) for the audit log.
  select data_value into v_before
    from public.user_data
   where user_id = p_client_id and data_key = p_data_key;

  -- Upsert the new value with audit-trail columns. user_data has unique
  -- (user_id, data_key) per the existing migration.
  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (p_client_id, p_data_key, p_data_value, v_coach_id, v_now)
  on conflict (user_id, data_key) do update
    set data_value     = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;

  -- Audit log entry.
  insert into public.coach_client_audit_log
    (client_id, coach_id, data_key, before_value, after_value, action)
  values
    (p_client_id, v_coach_id, p_data_key, v_before, p_data_value, 'update');

  -- Stamp the pending-regenerate flag so the client's app re-runs the
  -- plan generator on next boot. Stored as user_data row so it syncs
  -- like everything else; client-side hook reads it, runs the generator
  -- locally, then clears it. Carries the timestamp + coach id so a
  -- future "Coach updated your plan at 3:42 PM" toast on client open
  -- can attribute the change.
  insert into public.user_data (user_id, data_key, data_value, last_edited_by, last_edited_at)
  values (
    p_client_id,
    'pendingPlanRegen',
    jsonb_build_object('since', v_now, 'triggeredBy', v_coach_id, 'reason', p_data_key),
    v_coach_id,
    v_now
  )
  on conflict (user_id, data_key) do update
    set data_value     = excluded.data_value,
        last_edited_by = excluded.last_edited_by,
        last_edited_at = excluded.last_edited_at;
end;
$$;


ALTER FUNCTION "public"."coach_update_client_training_input"("p_client_id" "uuid", "p_data_key" "text", "p_data_value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dismiss_invite"("p_invite_link_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_target_id  UUID;
  v_link_valid BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  -- Don't let callers pollute the table with synthetic rows for invite
  -- link UUIDs that don't exist (typo, garbage, malicious). The link
  -- doesn't have to be active — a coach may have rotated mid-flow and
  -- the user is dismissing the old link they originally clicked.
  SELECT EXISTS (
    SELECT 1 FROM public.coach_invite_links cil WHERE cil.id = p_invite_link_id
  ) INTO v_link_valid;
  IF NOT v_link_valid THEN
    RETURN;
  END IF;

  -- Stamp the most recent click row for this link with dismissed_at +
  -- the user id. If there's no matching click (the user pasted the URL
  -- straight into the SPA, an ad-blocker stripped the edge fetch, or
  -- the deep link bypassed c/index.html), we INSERT a synthetic dismiss
  -- row so the cross-device cooldown helper has a row to read.
  -- Without this fallback, invite_dismissed_recently returns FALSE
  -- for users whose dismiss happened on a clean device — cooldown
  -- would survive only as long as that device's localStorage cache.
  UPDATE public.coach_invite_clicks cic
     SET dismissed_at      = NOW(),
         signed_up_user_id = COALESCE(cic.signed_up_user_id, v_user_id),
         signed_up_at      = COALESCE(cic.signed_up_at, NOW())
   WHERE cic.id = (
     SELECT cic2.id FROM public.coach_invite_clicks cic2
      WHERE cic2.invite_link_id = p_invite_link_id
        AND cic2.dismissed_at IS NULL
        AND cic2.paired_assignment_id IS NULL
      ORDER BY cic2.clicked_at DESC
      LIMIT 1
   )
  RETURNING cic.id INTO v_target_id;

  -- No click row matched — insert a synthetic one stamped to this user.
  -- ip_hash + user_agent_hash stay NULL because we have no IP context
  -- here (this is a server-side authenticated call, not the edge
  -- function's anonymous click path).
  IF v_target_id IS NULL THEN
    INSERT INTO public.coach_invite_clicks (
      invite_link_id, ip_hash, user_agent_hash,
      signed_up_user_id, signed_up_at, dismissed_at
    ) VALUES (
      p_invite_link_id, NULL, NULL,
      v_user_id, NOW(), NOW()
    );
  END IF;

  -- Clear the pending invite — user explicitly said no for now.
  UPDATE public.profiles p
     SET pending_invite_link_id = NULL,
         pending_invite_set_at  = NULL
   WHERE p.id = v_user_id;
END;
$$;


ALTER FUNCTION "public"."dismiss_invite"("p_invite_link_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_funnel"("p_link_id" "uuid", "p_days" integer DEFAULT 30) RETURNS TABLE("clicks" integer, "signups" integer, "accepted" integer, "dismissed" integer, "active_clients" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_owner    UUID;
  v_is_admin BOOLEAN;
  v_since    TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT cil.coach_id INTO v_owner
    FROM public.coach_invite_links cil
   WHERE cil.id = p_link_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_caller AND p.role = 'admin'
  ) INTO v_is_admin;

  IF v_owner <> v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Window — NULL means all-time.
  v_since := CASE
    WHEN p_days IS NULL THEN '1970-01-01'::TIMESTAMPTZ
    ELSE NOW() - (p_days || ' days')::INTERVAL
  END;

  RETURN QUERY
  SELECT
    -- Clicks: every row in the click table within the window.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.clicked_at >= v_since),
    -- Signups: clicks where the user signed up (signed_up_user_id stamped).
    -- "Signed up" includes both new-account creations AND existing users
    -- who first authenticated via this link — the spec's funnel labels
    -- collapse the two intentionally.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.signed_up_user_id IS NOT NULL
         AND cic.clicked_at >= v_since),
    -- Accepted: user tapped Accept on the modal. Phase B funnel step.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.accepted_at IS NOT NULL
         AND cic.clicked_at >= v_since),
    -- Dismissed: user tapped Not now. We show the count for the 7-day
    -- cooldown window specifically, NOT p_days, so the panel's
    -- "in cooldown" subtitle is meaningful.
    (SELECT COUNT(*)::INT FROM public.coach_invite_clicks cic
       WHERE cic.invite_link_id = p_link_id
         AND cic.dismissed_at IS NOT NULL
         AND cic.dismissed_at > NOW() - INTERVAL '7 days'),
    -- Active clients: current snapshot, all-time (not windowed). Joined
    -- via the click row's paired_assignment_id so we count exactly the
    -- pairings that came through THIS link.
    (SELECT COUNT(*)::INT
       FROM public.coach_invite_clicks cic
       JOIN public.coaching_assignments ca ON ca.id = cic.paired_assignment_id
      WHERE cic.invite_link_id = p_link_id
        AND ca.active = TRUE);
END;
$$;


ALTER FUNCTION "public"."get_invite_funnel"("p_link_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_recent_activity"("p_link_id" "uuid", "p_limit" integer DEFAULT 10) RETURNS TABLE("occurred_at" timestamp with time zone, "kind" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_owner    UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT cil.coach_id INTO v_owner
    FROM public.coach_invite_links cil
   WHERE cil.id = p_link_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_caller AND p.role = 'admin'
  ) INTO v_is_admin;

  IF v_owner <> v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- For each click, emit ONE row representing the most-evolved state.
  -- "paired" (active pairing) > "accepted" > "signed up" > "dismissed"
  -- > "clicked". Older / less-meaningful states are subsumed.
  RETURN QUERY
  SELECT
    COALESCE(cic.paired_at, cic.accepted_at, cic.dismissed_at,
             cic.signed_up_at, cic.clicked_at) AS occurred_at,
    CASE
      WHEN cic.paired_assignment_id IS NOT NULL THEN 'paired'
      WHEN cic.accepted_at IS NOT NULL          THEN 'accepted'
      WHEN cic.dismissed_at IS NOT NULL         THEN 'dismissed'
      WHEN cic.signed_up_user_id IS NOT NULL    THEN 'signed_up'
      ELSE 'clicked'
    END AS kind
  FROM public.coach_invite_clicks cic
  WHERE cic.invite_link_id = p_link_id
  ORDER BY occurred_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
END;
$$;


ALTER FUNCTION "public"."get_invite_recent_activity"("p_link_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_dismissed_recently"("p_invite_link_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_invite_clicks cic
     WHERE cic.invite_link_id  = p_invite_link_id
       AND cic.signed_up_user_id = auth.uid()
       AND cic.dismissed_at IS NOT NULL
       AND cic.dismissed_at > NOW() - INTERVAL '7 days'
  );
$$;


ALTER FUNCTION "public"."invite_dismissed_recently"("p_invite_link_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$                                            
    SELECT EXISTS (                           
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    );
  $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_coaching"("coach_uid" "uuid", "client_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.coaching_assignments
    where coach_id = coach_uid
      and client_id = client_uid
      and active = true
  );
$$;


ALTER FUNCTION "public"."is_coaching"("coach_uid" "uuid", "client_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_feature_enabled"("uid" "uuid", "flag_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT
       CASE
         -- Explicit JSON null → treat as default-on. Matches the no-row
         -- case below; if the writer somehow stored null, the user
         -- never made an explicit choice.
         WHEN data_value IS NULL THEN TRUE
         WHEN jsonb_typeof(data_value) = 'null' THEN TRUE
         WHEN jsonb_typeof(data_value) = 'boolean' THEN data_value::TEXT::BOOLEAN
         WHEN jsonb_typeof(data_value) = 'number'  THEN (data_value::TEXT)::NUMERIC <> 0
         -- (data_value #>> '{}') returns the underlying scalar as TEXT.
         -- Fixes the spec's data_value->>0 typo (that's array-index
         -- access; returns NULL for string types and would have
         -- defaulted "0" to enabled).
         WHEN jsonb_typeof(data_value) = 'string'  THEN (data_value #>> '{}') NOT IN ('0', 'false', '')
         WHEN jsonb_typeof(data_value) = 'object'  THEN COALESCE((data_value->>'enabled')::BOOLEAN, TRUE)
         ELSE TRUE
       END
     FROM public.user_data
     WHERE user_id = uid AND data_key = flag_key
     LIMIT 1),
    TRUE  -- no row at all = default-on (IronZ convention; the writer
          -- only persists the flag when the user toggles, so the
          -- absence of a row means "still at default".)
  );
$$;


ALTER FUNCTION "public"."is_feature_enabled"("uid" "uuid", "flag_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."module_effectiveness_report"() RETURNS TABLE("module_id" "text", "plan_count" bigint, "avg_difficulty_score" numeric, "avg_completion_rate" numeric, "avg_energy" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    unnest(gp.philosophy_module_ids) AS module_id,
    COUNT(DISTINCT gp.id) AS plan_count,
    AVG(CASE uo.difficulty_rating
      WHEN 'too_easy' THEN 0.0
      WHEN 'just_right' THEN 0.5
      WHEN 'too_hard' THEN 1.0
    END) AS avg_difficulty_score,
    AVG(CASE WHEN uo.sessions_planned > 0
      THEN uo.sessions_completed::numeric / uo.sessions_planned
      ELSE NULL END) AS avg_completion_rate,
    AVG(CASE uo.energy_level
      WHEN 'low' THEN 0.0
      WHEN 'moderate' THEN 0.5
      WHEN 'high' THEN 1.0
    END) AS avg_energy
  FROM generated_plans gp
  JOIN user_outcomes uo ON uo.plan_id = gp.id
  GROUP BY unnest(gp.philosophy_module_ids);
END;
$$;


ALTER FUNCTION "public"."module_effectiveness_report"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pair_with_coach"("p_invite_link_id" "uuid") RETURNS TABLE("assignment_id" "uuid", "coach_id" "uuid", "history_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_link_id        UUID;
  v_coach_id       UUID;
  v_existing_pair  UUID;
  v_assignment_id  UUID;
  v_history_id     UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  -- Resolve the link. Aliased to satisfy the same RETURNS TABLE OUT
  -- shadow rule we hit in record_invite_click.
  SELECT cil.id, cil.coach_id INTO v_link_id, v_coach_id
    FROM public.coach_invite_links cil
   WHERE cil.id = p_invite_link_id
   LIMIT 1;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  IF NOT public._is_active_coach(v_coach_id) THEN
    RAISE EXCEPTION 'coach is no longer accepting clients' USING ERRCODE = 'IRO02';
  END IF;

  -- Same-coach dedup: idempotent — if the user already has an active
  -- primary assignment with this coach, just return it. The client
  -- handles IRO03 by clearing the pending invite and showing a toast.
  SELECT ca.id INTO v_existing_pair
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.coach_id  = v_coach_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;

  IF v_existing_pair IS NOT NULL THEN
    RAISE EXCEPTION 'already paired with this coach' USING ERRCODE = 'IRO03';
  END IF;

  -- Block if user has ANY active primary coach (different from this one) —
  -- caller should switch_coach() instead. Keeps pair_with_coach a
  -- pure first-time path and prevents accidental orphaning.
  PERFORM 1
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'user already has a primary coach — call switch_coach' USING ERRCODE = 'P0001';
  END IF;

  -- ── 4. Insert assignment ────────────────────────────────────────────
  INSERT INTO public.coaching_assignments (
    client_id, coach_id, role, assigned_by, active
  ) VALUES (
    v_user_id, v_coach_id, 'primary', v_user_id, TRUE
  )
  RETURNING id INTO v_assignment_id;

  -- ── 5. Stamp the most recent click row for THIS user + THIS link ───
  -- The edge function records anonymous clicks; we attach the user's
  -- identity now. Pick the most recent click on this link that doesn't
  -- already have a paired_assignment_id (so re-pairing after a previous
  -- switch / dismiss attaches to the right click row).
  UPDATE public.coach_invite_clicks cic
     SET signed_up_user_id    = COALESCE(cic.signed_up_user_id, v_user_id),
         signed_up_at         = COALESCE(cic.signed_up_at, NOW()),
         accepted_at          = NOW(),
         paired_assignment_id = v_assignment_id,
         paired_at            = NOW()
   WHERE cic.id = (
     SELECT cic2.id FROM public.coach_invite_clicks cic2
      WHERE cic2.invite_link_id = v_link_id
        AND cic2.paired_assignment_id IS NULL
      ORDER BY cic2.clicked_at DESC
      LIMIT 1
   );

  -- ── 6. History row ──────────────────────────────────────────────────
  INSERT INTO public.coaching_assignment_history (
    client_id, previous_coach_id, new_coach_id,
    change_type, source, invite_link_id, changed_by
  ) VALUES (
    v_user_id, NULL, v_coach_id,
    'created', 'invite_link', v_link_id, v_user_id
  )
  RETURNING id INTO v_history_id;

  -- ── 7. Clear pending invite on profile ──────────────────────────────
  UPDATE public.profiles p
     SET pending_invite_link_id = NULL,
         pending_invite_set_at  = NULL
   WHERE p.id = v_user_id;

  RETURN QUERY SELECT v_assignment_id, v_coach_id, v_history_id;
END;
$$;


ALTER FUNCTION "public"."pair_with_coach"("p_invite_link_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_invite_click"("p_code" "text", "p_ip_hash" "text", "p_ua_hash" "text") RETURNS TABLE("click_id" "uuid", "invite_link_id" "uuid", "coach_id" "uuid", "was_dedup" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_link_id    UUID;
  v_coach_id   UUID;
  v_existing   UUID;
  v_inserted   UUID;
  v_recent_cnt INT;
BEGIN
  -- IMPORTANT: every column reference is qualified through a table alias
  -- (`cil`, `cic`) because the RETURNS TABLE OUT params (`coach_id`,
  -- `invite_link_id`) shadow same-named columns. Same fix as Phase A;
  -- preserved here on the rewrite.

  SELECT cil.id, cil.coach_id INTO v_link_id, v_coach_id
    FROM public.coach_invite_links cil
   WHERE cil.code = upper(p_code) AND cil.active = TRUE
   LIMIT 1;

  IF v_link_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, FALSE;
    RETURN;
  END IF;

  -- ── Phase C rate limit: 10 inserts per ip_hash per 60s, GLOBAL across
  -- all links. Stops a scraper crawling every code from inflating every
  -- coach's funnel; doesn't punish a real user who just hit one link.
  -- Skipped when ip_hash is NULL (e.g., synthetic test invocations).
  IF p_ip_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_cnt
      FROM public.coach_invite_clicks cic
     WHERE cic.ip_hash    = p_ip_hash
       AND cic.clicked_at > NOW() - INTERVAL '60 seconds';
    IF v_recent_cnt >= 10 THEN
      -- Treat as a no-op for the caller — same shape as the dedup
      -- branch so the edge function's 302 path doesn't need to know
      -- the difference. click_id is NULL because we deliberately
      -- didn't insert.
      RETURN QUERY SELECT NULL::UUID, v_link_id, v_coach_id, TRUE;
      RETURN;
    END IF;
  END IF;

  -- ── 60s dedup per (link, ip_hash) — unchanged from Phase A.
  IF p_ip_hash IS NOT NULL THEN
    SELECT cic.id INTO v_existing
      FROM public.coach_invite_clicks cic
     WHERE cic.invite_link_id = v_link_id
       AND cic.ip_hash        = p_ip_hash
       AND cic.clicked_at     > NOW() - INTERVAL '60 seconds'
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_existing, v_link_id, v_coach_id, TRUE;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.coach_invite_clicks (invite_link_id, ip_hash, user_agent_hash)
  VALUES (v_link_id, p_ip_hash, p_ua_hash)
  RETURNING id INTO v_inserted;

  RETURN QUERY SELECT v_inserted, v_link_id, v_coach_id, FALSE;
END;
$$;


ALTER FUNCTION "public"."record_invite_click"("p_code" "text", "p_ip_hash" "text", "p_ua_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rotate_invite_link"() RETURNS TABLE("new_link_id" "uuid", "new_code" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_is_coach BOOLEAN;
  v_inserted UUID;
  v_code     TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT (p.is_coach = TRUE) INTO v_is_coach
    FROM public.profiles p
   WHERE p.id = v_caller;

  IF NOT COALESCE(v_is_coach, FALSE) THEN
    RAISE EXCEPTION 'caller is not a coach' USING ERRCODE = '42501';
  END IF;

  -- Deactivate the current active link (if any). The partial unique
  -- index `coach_invite_one_active` requires zero or one active row
  -- per coach, so we MUST flip the old row off before inserting the
  -- new one.
  UPDATE public.coach_invite_links cil
     SET active         = FALSE,
         deactivated_at = NOW()
   WHERE cil.coach_id = v_caller
     AND cil.active   = TRUE;

  v_code := public._gen_invite_code();

  INSERT INTO public.coach_invite_links (coach_id, code)
  VALUES (v_caller, v_code)
  RETURNING id INTO v_inserted;

  RETURN QUERY SELECT v_inserted, v_code;
END;
$$;


ALTER FUNCTION "public"."rotate_invite_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_workout_library_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_workout_library_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_assignment_feedback"("_assignment_id" "uuid", "_note" "text", "_rating" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF _rating IS NOT NULL AND (_rating < 1 OR _rating > 5) THEN
    RAISE EXCEPTION 'rating must be 1..5 or NULL';
  END IF;

  UPDATE public.coach_assigned_workouts
     SET client_note         = NULLIF(_note, ''),
         client_rating       = _rating,
         client_responded_at = NOW()
   WHERE id        = _assignment_id
     AND client_id = _uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found or not yours';
  END IF;
END;
$$;


ALTER FUNCTION "public"."submit_assignment_feedback"("_assignment_id" "uuid", "_note" "text", "_rating" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_coach"("p_invite_link_id" "uuid") RETURNS TABLE("assignment_id" "uuid", "coach_id" "uuid", "previous_coach_id" "uuid", "history_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id           UUID := auth.uid();
  v_link_id           UUID;
  v_coach_id          UUID;
  v_prev_coach_id     UUID;
  v_prev_assignment   UUID;
  v_assignment_id     UUID;
  v_history_id        UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT cil.id, cil.coach_id INTO v_link_id, v_coach_id
    FROM public.coach_invite_links cil
   WHERE cil.id = p_invite_link_id
   LIMIT 1;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'invite link not found' USING ERRCODE = 'IRO01';
  END IF;

  IF NOT public._is_active_coach(v_coach_id) THEN
    RAISE EXCEPTION 'coach is no longer accepting clients' USING ERRCODE = 'IRO02';
  END IF;

  -- Same-coach dedup: refuse switching to the coach you already have.
  SELECT ca.id INTO v_prev_assignment
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.coach_id  = v_coach_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;

  IF v_prev_assignment IS NOT NULL THEN
    RAISE EXCEPTION 'already paired with this coach' USING ERRCODE = 'IRO03';
  END IF;

  -- Find current primary (the one being switched out).
  SELECT ca.id, ca.coach_id INTO v_prev_assignment, v_prev_coach_id
    FROM public.coaching_assignments ca
   WHERE ca.client_id = v_user_id
     AND ca.role      = 'primary'
     AND ca.active    = TRUE
   LIMIT 1;

  IF v_prev_assignment IS NULL THEN
    -- Nothing to switch from — caller should have used pair_with_coach.
    RAISE EXCEPTION 'no existing primary coach to switch from' USING ERRCODE = 'IRO04';
  END IF;

  -- ── Deactivate previous primary ────────────────────────────────────
  UPDATE public.coaching_assignments ca
     SET active = FALSE,
         deactivated_at = NOW()
   WHERE ca.id = v_prev_assignment;

  -- ── Insert new primary ─────────────────────────────────────────────
  INSERT INTO public.coaching_assignments (
    client_id, coach_id, role, assigned_by, active
  ) VALUES (
    v_user_id, v_coach_id, 'primary', v_user_id, TRUE
  )
  RETURNING id INTO v_assignment_id;

  -- ── Stamp the click ────────────────────────────────────────────────
  UPDATE public.coach_invite_clicks cic
     SET signed_up_user_id    = COALESCE(cic.signed_up_user_id, v_user_id),
         signed_up_at         = COALESCE(cic.signed_up_at, NOW()),
         accepted_at          = NOW(),
         paired_assignment_id = v_assignment_id,
         paired_at            = NOW()
   WHERE cic.id = (
     SELECT cic2.id FROM public.coach_invite_clicks cic2
      WHERE cic2.invite_link_id = v_link_id
        AND cic2.paired_assignment_id IS NULL
      ORDER BY cic2.clicked_at DESC
      LIMIT 1
   );

  -- ── History rows: deactivated + switched ───────────────────────────
  -- Two rows so audit queries can distinguish "old coach lost client"
  -- from "new coach gained client" by change_type.
  INSERT INTO public.coaching_assignment_history (
    client_id, previous_coach_id, new_coach_id,
    change_type, source, invite_link_id, changed_by
  ) VALUES (
    v_user_id, v_prev_coach_id, NULL,
    'deactivated', 'invite_link', v_link_id, v_user_id
  );

  INSERT INTO public.coaching_assignment_history (
    client_id, previous_coach_id, new_coach_id,
    change_type, source, invite_link_id, changed_by
  ) VALUES (
    v_user_id, v_prev_coach_id, v_coach_id,
    'switched', 'invite_link', v_link_id, v_user_id
  )
  RETURNING id INTO v_history_id;

  -- ── Clear pending invite on profile ────────────────────────────────
  UPDATE public.profiles p
     SET pending_invite_link_id = NULL,
         pending_invite_set_at  = NULL
   WHERE p.id = v_user_id;

  RETURN QUERY SELECT v_assignment_id, v_coach_id, v_prev_coach_id, v_history_id;
END;
$$;


ALTER FUNCTION "public"."switch_coach"("p_invite_link_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "request_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "event_name" "text" NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "session_id" "uuid",
    "platform" "text" DEFAULT 'web'::"text"
);


ALTER TABLE "public"."analytics_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ask_ironz_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "category" "text" DEFAULT 'uncategorized'::"text",
    "subcategory" "text",
    "response_type" "text" DEFAULT 'pending'::"text" NOT NULL,
    "plan_id" "uuid",
    "tokens_used" integer,
    "response_time_ms" integer,
    "helpful" boolean,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_category" CHECK (("category" = ANY (ARRAY['training_plan'::"text", 'nutrition'::"text", 'hydration'::"text", 'injury'::"text", 'recovery'::"text", 'race_strategy'::"text", 'equipment'::"text", 'technique'::"text", 'general_fitness'::"text", 'app_help'::"text", 'uncategorized'::"text"]))),
    CONSTRAINT "valid_response_type" CHECK (("response_type" = ANY (ARRAY['plan_generated'::"text", 'faq_answer'::"text", 'coaching_tip'::"text", 'couldnt_help'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."ask_ironz_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."ask_ironz_logs" IS 'Tracks every Ask IronZ question for analytics, categorization, and improvement. Categories auto-classified at insert, user feedback via helpful column.';



CREATE TABLE IF NOT EXISTS "public"."challenge_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "challenge_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."challenge_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_plan_freeze" (
    "client_id" "uuid" NOT NULL,
    "frozen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "frozen_by" "uuid",
    "unfrozen_at" timestamp with time zone
);


ALTER TABLE "public"."client_plan_freeze" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_client_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_id" "text",
    "before" "jsonb",
    "after" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coach_client_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_digest_log" (
    "coach_id" "uuid" NOT NULL,
    "digest_date" "date" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "digest_body" "text"
);


ALTER TABLE "public"."coach_digest_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_invite_clicks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invite_link_id" "uuid" NOT NULL,
    "clicked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_hash" "text",
    "user_agent_hash" "text",
    "signed_up_user_id" "uuid",
    "signed_up_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "paired_assignment_id" "uuid",
    "paired_at" timestamp with time zone
);


ALTER TABLE "public"."coach_invite_clicks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_invite_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deactivated_at" timestamp with time zone,
    CONSTRAINT "coach_invite_links_code_check" CHECK (("char_length"("code") = 6)),
    CONSTRAINT "code_charset" CHECK (("code" ~ '^[2-9A-HJ-NP-Z]{6}$'::"text"))
);


ALTER TABLE "public"."coach_invite_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "duration_weeks" integer NOT NULL,
    "weekly_template" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_programs_duration_weeks_check" CHECK (("duration_weeks" > 0))
);


ALTER TABLE "public"."coach_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sport" "text" NOT NULL,
    "goal" "text" NOT NULL,
    "experience" "text" NOT NULL,
    "notes" "text",
    "premium_at_request" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "matched_coach_id" "uuid",
    "matched_at" timestamp with time zone,
    "archived_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coach_requests_experience_check" CHECK (("experience" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "coach_requests_goal_check" CHECK (("goal" = ANY (ARRAY['race'::"text", 'general_fitness'::"text", 'body_comp'::"text", 'performance'::"text", 'injury_return'::"text", 'other'::"text"]))),
    CONSTRAINT "coach_requests_sport_check" CHECK (("sport" = ANY (ARRAY['running'::"text", 'cycling'::"text", 'swimming'::"text", 'triathlon'::"text", 'strength'::"text", 'hyrox'::"text", 'general_fitness'::"text", 'other'::"text"]))),
    CONSTRAINT "coach_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'matched'::"text", 'declined'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."coach_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_sheet_import_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "import_id" "text" NOT NULL,
    "storage_path" "text",
    "filename" "text",
    "file_size_bytes" bigint,
    "selected_sheets" "text"[],
    "date_range_from" "date",
    "date_range_to" "date",
    "workouts_parsed" integer,
    "templates_parsed" integer,
    "llm_tokens_used" integer,
    "estimated_cost_usd" numeric(10,4),
    "status" "text" NOT NULL,
    "error_code" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_sheet_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_sheet_import_quotas" (
    "user_id" "uuid" NOT NULL,
    "month_yyyymm" "text" NOT NULL,
    "import_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_sheet_import_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_workout_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "workout" "jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coach_workout_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_assignment_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "previous_coach_id" "uuid",
    "new_coach_id" "uuid",
    "change_type" "text" NOT NULL,
    "source" "text",
    "invite_link_id" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "uuid",
    CONSTRAINT "coaching_assignment_history_change_type_check" CHECK (("change_type" = ANY (ARRAY['created'::"text", 'switched'::"text", 'deactivated'::"text", 'reactivated'::"text"]))),
    CONSTRAINT "coaching_assignment_history_source_check" CHECK (("source" = ANY (ARRAY['admin'::"text", 'invite_link'::"text", 'request_match'::"text", 'self_unfreeze'::"text"])))
);


ALTER TABLE "public"."coaching_assignment_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_by" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "deactivated_at" timestamp with time zone,
    CONSTRAINT "coaching_assignments_role_check" CHECK (("role" = ANY (ARRAY['primary'::"text", 'sub'::"text"]))),
    CONSTRAINT "coaching_no_self" CHECK (("client_id" <> "coach_id"))
);


ALTER TABLE "public"."coaching_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."community_workouts" (
    "id" "text" NOT NULL,
    "category" "text",
    "name" "text" NOT NULL,
    "author" "text",
    "difficulty" "text",
    "type" "text",
    "exercises" "jsonb",
    "segments" "jsonb",
    "hiit_meta" "jsonb",
    "hidden" boolean DEFAULT false NOT NULL,
    "is_official" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."community_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_library" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "movement_pattern" "text" NOT NULL,
    "muscle_groups" "text"[] NOT NULL,
    "equipment_required" "text"[] DEFAULT '{}'::"text"[],
    "difficulty" "text" NOT NULL,
    "tier" integer NOT NULL,
    "sport_relevance" "text"[] DEFAULT '{}'::"text"[],
    "contraindications" "text"[] DEFAULT '{}'::"text"[],
    "substitutions" "text"[] DEFAULT '{}'::"text"[],
    "default_rep_range" "text",
    "default_rest_seconds" integer,
    "instructions" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_data" "jsonb" NOT NULL,
    "philosophy_module_ids" "text"[] NOT NULL,
    "module_versions" "jsonb" NOT NULL,
    "generation_source" "text" NOT NULL,
    "plan_version" "text" DEFAULT '1.0'::"text",
    "assumptions" "text"[] DEFAULT '{}'::"text"[],
    "validation_flags" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true,
    "is_outdated" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."generated_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "target_value" numeric,
    "current_value" numeric,
    "unit" "text",
    "deadline" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_version_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module_id" "text" NOT NULL,
    "old_version" "text" NOT NULL,
    "new_version" "text" NOT NULL,
    "change_description" "text" NOT NULL,
    "changed_by" "text" DEFAULT 'manual'::"text",
    "changed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."module_version_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "workout_reminders" boolean DEFAULT true,
    "reminder_minutes_before" integer DEFAULT 30,
    "share_alerts" boolean DEFAULT true,
    "hydration_reminders" boolean DEFAULT true,
    "hydration_start_hour" integer DEFAULT 8,
    "hydration_end_hour" integer DEFAULT 22,
    "hydration_interval_hours" integer DEFAULT 2,
    "workout_reminder_time" time without time zone DEFAULT '07:00:00'::time without time zone
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


COMMENT ON COLUMN "public"."notification_preferences"."workout_reminder_time" IS 'Local time-of-day at which the user wants their daily workout reminder. Replaces the (broken) reminder_minutes_before design.';



CREATE TABLE IF NOT EXISTS "public"."pending_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_fingerprint" "text" NOT NULL,
    "share_token" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "claimed_by_user_id" "uuid"
);


ALTER TABLE "public"."pending_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."philosophy_gaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dimension" "text" NOT NULL,
    "value" "text" NOT NULL,
    "user_count" integer DEFAULT 1,
    "sample_user_profiles" "jsonb" DEFAULT '[]'::"jsonb",
    "resolution_status" "text" DEFAULT 'open'::"text",
    "resolution_notes" "text",
    "first_seen" timestamp with time zone DEFAULT "now"(),
    "last_seen" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."philosophy_gaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."philosophy_modules" (
    "id" "text" NOT NULL,
    "category" "text" NOT NULL,
    "title" "text" NOT NULL,
    "version" "text" DEFAULT '1.0'::"text" NOT NULL,
    "applies_when" "jsonb" NOT NULL,
    "principles" "text"[] DEFAULT '{}'::"text"[],
    "plan_rules" "text"[] DEFAULT '{}'::"text"[],
    "hard_constraints" "text"[] DEFAULT '{}'::"text"[],
    "nutrition_rules" "text"[] DEFAULT '{}'::"text"[],
    "training_adjustments" "text"[] DEFAULT '{}'::"text"[],
    "coaching_tone" "text",
    "evidence_sources" "text"[] DEFAULT '{}'::"text"[],
    "rationale" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "is_active" boolean DEFAULT true,
    "change_log" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."philosophy_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_adherence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text",
    "modification_notes" "text",
    "completed_workout_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plan_adherence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "subscription_status" "text" DEFAULT 'free'::"text",
    "role" "text" DEFAULT 'user'::"text",
    "age" integer,
    "weight_lbs" numeric,
    "height_inches" numeric,
    "gender" "text",
    "primary_goal" "text",
    "fitness_level" "text",
    "measurement_system" "text" DEFAULT 'imperial'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_type" "text",
    "last_workout_logged" timestamp with time zone,
    "last_workout_shared" timestamp with time zone,
    "last_active_at" timestamp with time zone,
    "onboarding_completed_at" timestamp with time zone,
    "feature_toggles" "jsonb" DEFAULT '{"planning": true, "hydration": true, "nutrition": true}'::"jsonb",
    "total_workouts_logged" integer DEFAULT 0,
    "total_workouts_shared" integer DEFAULT 0,
    "streak_current" integer DEFAULT 0,
    "streak_longest" integer DEFAULT 0,
    "is_coach" boolean DEFAULT false NOT NULL,
    "avatar_url" "text",
    "coach_bio" "text",
    "pending_invite_link_id" "uuid",
    "pending_invite_set_at" timestamp with time zone,
    "birthday" "text",
    "body_comp_goal" "text",
    CONSTRAINT "profiles_coach_bio_check" CHECK ((("coach_bio" IS NULL) OR ("char_length"("coach_bio") <= 500)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" DEFAULT 'ios'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."race_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "race_date" "date",
    "distance" numeric,
    "distance_unit" "text",
    "goal_time" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."race_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "variant_id" "text",
    "sport_id" "text",
    "session_type_id" "text",
    "source" "text" NOT NULL,
    "shared_from_user_id" "uuid",
    "share_token" "text",
    "custom_name" "text",
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "payload" "jsonb",
    "workout_kind" "text",
    CONSTRAINT "saved_workouts_custom_name_check" CHECK ((("custom_name" IS NULL) OR ("length"("custom_name") <= 80))),
    CONSTRAINT "saved_workouts_source_check" CHECK (("source" = ANY (ARRAY['library'::"text", 'shared'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."saved_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sent_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "reference_id" "text",
    "title" "text",
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sent_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shared_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_token" "text" NOT NULL,
    "sender_user_id" "uuid" NOT NULL,
    "variant_id" "text" NOT NULL,
    "sport_id" "text" NOT NULL,
    "session_type_id" "text" NOT NULL,
    "share_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "revoked_at" timestamp with time zone,
    "view_count" integer DEFAULT 0 NOT NULL,
    "import_count" integer DEFAULT 0 NOT NULL,
    "completion_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "shared_workouts_share_note_check" CHECK ((("share_note" IS NULL) OR ("length"("share_note") <= 280))),
    CONSTRAINT "shared_workouts_sport_id_check" CHECK (("sport_id" = ANY (ARRAY['run'::"text", 'bike'::"text", 'swim'::"text", 'strength'::"text", 'hybrid'::"text"])))
);


ALTER TABLE "public"."shared_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strava_activities" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text",
    "type" "text",
    "distance" numeric,
    "moving_time" integer,
    "elapsed_time" integer,
    "start_date" timestamp with time zone,
    "start_date_local" timestamp with time zone,
    "average_heartrate" numeric,
    "max_heartrate" numeric,
    "suffer_score" numeric,
    "total_elevation_gain" numeric,
    "map_summary_polyline" "text",
    "raw" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."strava_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strava_oauth_state" (
    "nonce" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."strava_oauth_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strava_tokens" (
    "user_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "athlete_id" bigint,
    "athlete_firstname" "text",
    "athlete_lastname" "text",
    "athlete_avatar" "text",
    "connected_at" timestamp with time zone DEFAULT "now"(),
    "last_sync_at" timestamp with time zone,
    "scope" "text"
);


ALTER TABLE "public"."strava_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "source" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_plan_check" CHECK (("plan" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "subscriptions_source_check" CHECK (("source" = ANY (ARRAY['stripe'::"text", 'apple'::"text", 'promo'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text",
    "type" "text" NOT NULL,
    "goal" "text",
    "fitness_level" "text",
    "start_date" "date",
    "end_date" "date",
    "weeks" integer,
    "days_per_week" integer,
    "split_type" "text",
    "is_active" boolean DEFAULT true,
    "source" "text" DEFAULT 'generated'::"text",
    "raw_plan" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."training_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "scheduled_date" "date",
    "week_number" integer,
    "day_of_week" integer,
    "session_type" "text",
    "session_name" "text",
    "description" "text",
    "exercises" "jsonb",
    "status" "text" DEFAULT 'scheduled'::"text",
    "completed_workout_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "data" "jsonb"
);


ALTER TABLE "public"."training_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "data_key" "text" NOT NULL,
    "data_value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_edited_by" "uuid",
    "last_edited_at" timestamp with time zone
);


ALTER TABLE "public"."user_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_id" "uuid",
    "week_number" integer,
    "sessions_planned" integer,
    "sessions_completed" integer,
    "difficulty_rating" "text",
    "energy_level" "text",
    "sleep_quality" "text",
    "soreness_level" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start_date" "date" NOT NULL,
    "energy_level" integer,
    "soreness_level" integer,
    "stress_level" integer,
    "sleep_quality" integer,
    "sessions_completed" integer,
    "sessions_planned" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "weekly_checkins_energy_level_check" CHECK ((("energy_level" >= 1) AND ("energy_level" <= 10))),
    CONSTRAINT "weekly_checkins_sleep_quality_check" CHECK ((("sleep_quality" >= 1) AND ("sleep_quality" <= 10))),
    CONSTRAINT "weekly_checkins_soreness_level_check" CHECK ((("soreness_level" >= 1) AND ("soreness_level" <= 10))),
    CONSTRAINT "weekly_checkins_stress_level_check" CHECK ((("stress_level" >= 1) AND ("stress_level" <= 10)))
);


ALTER TABLE "public"."weekly_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "exercise_name" "text" NOT NULL,
    "sets" integer,
    "reps" "text",
    "weight_lbs" numeric,
    "duration_seconds" integer,
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workout_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "workout_payload" "jsonb" NOT NULL,
    "workout_name" "text" NOT NULL,
    "workout_type" "text",
    "sender_display_name" "text",
    "message" "text",
    "status" "text" DEFAULT 'unread'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workout_inbox_status_check" CHECK (("status" = ANY (ARRAY['unread'::"text", 'read'::"text", 'accepted'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."workout_inbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sport" "text" NOT NULL,
    "session_type" "text" NOT NULL,
    "energy_system" "text" NOT NULL,
    "phases" "text"[] NOT NULL,
    "levels" "text"[] NOT NULL,
    "race_distances" "text"[],
    "race_goals" "text"[],
    "warmup" "jsonb" NOT NULL,
    "main_set" "jsonb" NOT NULL,
    "cooldown" "jsonb" NOT NULL,
    "volume_range" "jsonb" NOT NULL,
    "total_duration_range" integer[] NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workout_library_energy_system_check" CHECK (("energy_system" = ANY (ARRAY['aerobic'::"text", 'lactate_threshold'::"text", 'vo2max'::"text", 'neuromuscular'::"text", 'mixed'::"text", 'strength'::"text"]))),
    CONSTRAINT "workout_library_sport_check" CHECK (("sport" = ANY (ARRAY['swim'::"text", 'bike'::"text", 'run'::"text", 'strength'::"text", 'brick'::"text", 'cross_train'::"text"]))),
    CONSTRAINT "workout_library_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."workout_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "segment_type" "text",
    "distance" numeric,
    "distance_unit" "text" DEFAULT 'mi'::"text",
    "duration_minutes" numeric,
    "pace" "text",
    "intensity" "text",
    "notes" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workout_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_share_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_token" "text" NOT NULL,
    "receiver_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "scheduled_for_date" "date",
    "saved_workout_id" "uuid",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "completion_delta_percent" numeric,
    CONSTRAINT "workout_share_imports_action_check" CHECK (("action" = ANY (ARRAY['saved_to_library'::"text", 'scheduled'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."workout_share_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "name" "text",
    "type" "text" NOT NULL,
    "notes" "text",
    "duration_minutes" integer,
    "avg_watts" integer,
    "source" "text" DEFAULT 'manual'::"text",
    "plan_session_id" "uuid",
    "completed" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "data" "jsonb"
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_user_id_usage_date_key" UNIQUE ("user_id", "usage_date");



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ask_ironz_logs"
    ADD CONSTRAINT "ask_ironz_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."challenge_participants"
    ADD CONSTRAINT "challenge_participants_challenge_id_user_id_key" UNIQUE ("challenge_id", "user_id");



ALTER TABLE ONLY "public"."challenge_participants"
    ADD CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_plan_freeze"
    ADD CONSTRAINT "client_plan_freeze_pkey" PRIMARY KEY ("client_id");



ALTER TABLE ONLY "public"."coach_assigned_workouts"
    ADD CONSTRAINT "coach_assigned_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_client_audit_log"
    ADD CONSTRAINT "coach_client_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_digest_log"
    ADD CONSTRAINT "coach_digest_log_pkey" PRIMARY KEY ("coach_id", "digest_date");



ALTER TABLE ONLY "public"."coach_invite_clicks"
    ADD CONSTRAINT "coach_invite_clicks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_invite_links"
    ADD CONSTRAINT "coach_invite_links_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."coach_invite_links"
    ADD CONSTRAINT "coach_invite_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_programs"
    ADD CONSTRAINT "coach_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_requests"
    ADD CONSTRAINT "coach_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_sheet_import_logs"
    ADD CONSTRAINT "coach_sheet_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_sheet_import_quotas"
    ADD CONSTRAINT "coach_sheet_import_quotas_pkey" PRIMARY KEY ("user_id", "month_yyyymm");



ALTER TABLE ONLY "public"."coach_workout_library"
    ADD CONSTRAINT "coach_workout_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_assignment_history"
    ADD CONSTRAINT "coaching_assignment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_assignments"
    ADD CONSTRAINT "coaching_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."community_workouts"
    ADD CONSTRAINT "community_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_library"
    ADD CONSTRAINT "exercise_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_plans"
    ADD CONSTRAINT "generated_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."module_version_history"
    ADD CONSTRAINT "module_version_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."pending_shares"
    ADD CONSTRAINT "pending_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."philosophy_gaps"
    ADD CONSTRAINT "philosophy_gaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."philosophy_modules"
    ADD CONSTRAINT "philosophy_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_adherence"
    ADD CONSTRAINT "plan_adherence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."race_events"
    ADD CONSTRAINT "race_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_workouts"
    ADD CONSTRAINT "saved_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sent_notifications"
    ADD CONSTRAINT "sent_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_workouts"
    ADD CONSTRAINT "shared_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shared_workouts"
    ADD CONSTRAINT "shared_workouts_share_token_key" UNIQUE ("share_token");



ALTER TABLE ONLY "public"."strava_activities"
    ADD CONSTRAINT "strava_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."strava_oauth_state"
    ADD CONSTRAINT "strava_oauth_state_pkey" PRIMARY KEY ("nonce");



ALTER TABLE ONLY "public"."strava_tokens"
    ADD CONSTRAINT "strava_tokens_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_data"
    ADD CONSTRAINT "user_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_data"
    ADD CONSTRAINT "user_data_user_id_data_key_key" UNIQUE ("user_id", "data_key");



ALTER TABLE ONLY "public"."user_outcomes"
    ADD CONSTRAINT "user_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_user_id_week_start_date_key" UNIQUE ("user_id", "week_start_date");



ALTER TABLE ONLY "public"."workout_exercises"
    ADD CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_inbox"
    ADD CONSTRAINT "workout_inbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_library"
    ADD CONSTRAINT "workout_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_segments"
    ADD CONSTRAINT "workout_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_share_imports"
    ADD CONSTRAINT "workout_share_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE INDEX "challenge_participants_challenge_pct_idx" ON "public"."challenge_participants" USING "btree" ("challenge_id", "pct" DESC);



CREATE INDEX "coach_assigned_client_date_idx" ON "public"."coach_assigned_workouts" USING "btree" ("client_id", "date");



CREATE INDEX "coach_assigned_coach_date_idx" ON "public"."coach_assigned_workouts" USING "btree" ("coach_id", "date");



CREATE INDEX "coach_client_audit_log_client_idx" ON "public"."coach_client_audit_log" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "coach_client_audit_log_coach_idx" ON "public"."coach_client_audit_log" USING "btree" ("coach_id", "created_at" DESC);



CREATE INDEX "coach_invite_clicks_link_idx" ON "public"."coach_invite_clicks" USING "btree" ("invite_link_id", "clicked_at" DESC);



CREATE INDEX "coach_invite_clicks_signup_idx" ON "public"."coach_invite_clicks" USING "btree" ("signed_up_user_id") WHERE ("signed_up_user_id" IS NOT NULL);



CREATE INDEX "coach_invite_code_active_idx" ON "public"."coach_invite_links" USING "btree" ("code") WHERE ("active" = true);



CREATE UNIQUE INDEX "coach_invite_one_active" ON "public"."coach_invite_links" USING "btree" ("coach_id") WHERE ("active" = true);



CREATE INDEX "coach_requests_status_idx" ON "public"."coach_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "coach_requests_user_idx" ON "public"."coach_requests" USING "btree" ("user_id");



CREATE INDEX "coach_sheet_import_logs_import_id_idx" ON "public"."coach_sheet_import_logs" USING "btree" ("import_id");



CREATE INDEX "coach_sheet_import_logs_user_idx" ON "public"."coach_sheet_import_logs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "coaching_active_client_idx" ON "public"."coaching_assignments" USING "btree" ("client_id") WHERE ("active" = true);



CREATE INDEX "coaching_active_coach_idx" ON "public"."coaching_assignments" USING "btree" ("coach_id") WHERE ("active" = true);



CREATE INDEX "coaching_assignment_history_client_idx" ON "public"."coaching_assignment_history" USING "btree" ("client_id", "changed_at" DESC);



CREATE UNIQUE INDEX "coaching_one_primary_per_client" ON "public"."coaching_assignments" USING "btree" ("client_id") WHERE (("role" = 'primary'::"text") AND ("active" = true));



CREATE INDEX "community_workouts_is_official_idx" ON "public"."community_workouts" USING "btree" ("is_official") WHERE ("is_official" = true);



CREATE INDEX "idx_ask_ironz_category" ON "public"."ask_ironz_logs" USING "btree" ("category");



CREATE INDEX "idx_ask_ironz_created" ON "public"."ask_ironz_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ask_ironz_response_type" ON "public"."ask_ironz_logs" USING "btree" ("response_type");



CREATE INDEX "idx_ask_ironz_user" ON "public"."ask_ironz_logs" USING "btree" ("user_id");



CREATE INDEX "idx_exercise_library_equipment" ON "public"."exercise_library" USING "gin" ("equipment_required");



CREATE INDEX "idx_exercise_library_pattern" ON "public"."exercise_library" USING "btree" ("movement_pattern");



CREATE INDEX "idx_exercise_library_tier" ON "public"."exercise_library" USING "btree" ("tier");



CREATE INDEX "idx_generated_plans_active" ON "public"."generated_plans" USING "btree" ("user_id", "is_active");



CREATE INDEX "idx_generated_plans_user" ON "public"."generated_plans" USING "btree" ("user_id");



CREATE INDEX "idx_inbox_recipient" ON "public"."workout_inbox" USING "btree" ("recipient_id", "status");



CREATE INDEX "idx_inbox_sender" ON "public"."workout_inbox" USING "btree" ("sender_id");



CREATE INDEX "idx_pending_shares_fingerprint" ON "public"."pending_shares" USING "btree" ("device_fingerprint") WHERE ("claimed_at" IS NULL);



CREATE UNIQUE INDEX "idx_philosophy_gaps_unique" ON "public"."philosophy_gaps" USING "btree" ("dimension", "value");



CREATE INDEX "idx_philosophy_modules_applies_when" ON "public"."philosophy_modules" USING "gin" ("applies_when");



CREATE INDEX "idx_philosophy_modules_category" ON "public"."philosophy_modules" USING "btree" ("category");



CREATE UNIQUE INDEX "idx_saved_workouts_unique" ON "public"."saved_workouts" USING "btree" ("user_id", "variant_id", "source") WHERE ("source" <> 'custom'::"text");



CREATE INDEX "idx_saved_workouts_user" ON "public"."saved_workouts" USING "btree" ("user_id", "saved_at" DESC);



CREATE INDEX "idx_share_imports_receiver" ON "public"."workout_share_imports" USING "btree" ("receiver_user_id", "imported_at" DESC);



CREATE INDEX "idx_share_imports_token" ON "public"."workout_share_imports" USING "btree" ("share_token");



CREATE UNIQUE INDEX "idx_share_imports_unique" ON "public"."workout_share_imports" USING "btree" ("share_token", "receiver_user_id") WHERE ("action" <> 'dismissed'::"text");



CREATE INDEX "idx_shared_workouts_expiry" ON "public"."shared_workouts" USING "btree" ("expires_at") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_shared_workouts_sender" ON "public"."shared_workouts" USING "btree" ("sender_user_id", "created_at" DESC);



CREATE INDEX "idx_shared_workouts_token" ON "public"."shared_workouts" USING "btree" ("share_token");



CREATE INDEX "idx_strava_activities_user_date" ON "public"."strava_activities" USING "btree" ("user_id", "start_date" DESC);



CREATE INDEX "idx_subscriptions_stripe_subscription_id" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id");



CREATE INDEX "idx_subscriptions_user" ON "public"."subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_user_data_key" ON "public"."user_data" USING "btree" ("user_id", "data_key");



CREATE INDEX "idx_user_data_user" ON "public"."user_data" USING "btree" ("user_id");



CREATE INDEX "idx_user_outcomes_plan" ON "public"."user_outcomes" USING "btree" ("plan_id");



CREATE INDEX "idx_user_outcomes_user" ON "public"."user_outcomes" USING "btree" ("user_id");



CREATE INDEX "idx_workout_library_admin_coverage" ON "public"."workout_library" USING "btree" ("sport", "session_type", "status");



CREATE INDEX "idx_workout_library_query" ON "public"."workout_library" USING "btree" ("sport", "session_type", "status") WHERE ("status" = 'published'::"text");



CREATE UNIQUE INDEX "idx_workout_library_unique_name_sport" ON "public"."workout_library" USING "btree" ("name", "sport");



CREATE INDEX "profiles_is_coach_idx" ON "public"."profiles" USING "btree" ("is_coach") WHERE ("is_coach" = true);



CREATE OR REPLACE TRIGGER "_subscriptions_touch_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."_subscriptions_touch_updated_at"();



CREATE OR REPLACE TRIGGER "coach_assignment_mirror_delete" AFTER DELETE ON "public"."coach_assigned_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."_coach_assignment_after_delete"();



CREATE OR REPLACE TRIGGER "coach_assignment_mirror_insert" AFTER INSERT ON "public"."coach_assigned_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."_coach_assignment_after_insert"();



CREATE OR REPLACE TRIGGER "coach_assignment_mirror_update" AFTER UPDATE ON "public"."coach_assigned_workouts" FOR EACH ROW EXECUTE FUNCTION "public"."_coach_assignment_after_update"();



CREATE OR REPLACE TRIGGER "profiles_auto_invite_link" AFTER UPDATE OF "is_coach" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."_auto_create_invite_link"();



CREATE OR REPLACE TRIGGER "trg_touch_challenge_participants" BEFORE UPDATE ON "public"."challenge_participants" FOR EACH ROW EXECUTE FUNCTION "public"."_touch_challenge_participants_updated_at"();



CREATE OR REPLACE TRIGGER "trg_workout_library_updated_at" BEFORE UPDATE ON "public"."workout_library" FOR EACH ROW EXECUTE FUNCTION "public"."set_workout_library_updated_at"();



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ask_ironz_logs"
    ADD CONSTRAINT "ask_ironz_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."challenge_participants"
    ADD CONSTRAINT "challenge_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_plan_freeze"
    ADD CONSTRAINT "client_plan_freeze_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_plan_freeze"
    ADD CONSTRAINT "client_plan_freeze_frozen_by_fkey" FOREIGN KEY ("frozen_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coach_assigned_workouts"
    ADD CONSTRAINT "coach_assigned_workouts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_assigned_workouts"
    ADD CONSTRAINT "coach_assigned_workouts_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coach_assigned_workouts"
    ADD CONSTRAINT "coach_assigned_workouts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."coach_programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_digest_log"
    ADD CONSTRAINT "coach_digest_log_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_invite_clicks"
    ADD CONSTRAINT "coach_invite_clicks_invite_link_id_fkey" FOREIGN KEY ("invite_link_id") REFERENCES "public"."coach_invite_links"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_invite_clicks"
    ADD CONSTRAINT "coach_invite_clicks_paired_assignment_id_fkey" FOREIGN KEY ("paired_assignment_id") REFERENCES "public"."coaching_assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_invite_clicks"
    ADD CONSTRAINT "coach_invite_clicks_signed_up_user_id_fkey" FOREIGN KEY ("signed_up_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coach_invite_links"
    ADD CONSTRAINT "coach_invite_links_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_programs"
    ADD CONSTRAINT "coach_programs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_requests"
    ADD CONSTRAINT "coach_requests_matched_coach_id_fkey" FOREIGN KEY ("matched_coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coach_requests"
    ADD CONSTRAINT "coach_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_sheet_import_logs"
    ADD CONSTRAINT "coach_sheet_import_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_sheet_import_quotas"
    ADD CONSTRAINT "coach_sheet_import_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coach_workout_library"
    ADD CONSTRAINT "coach_workout_library_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_assignment_history"
    ADD CONSTRAINT "coaching_assignment_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coaching_assignment_history"
    ADD CONSTRAINT "coaching_assignment_history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_assignment_history"
    ADD CONSTRAINT "coaching_assignment_history_invite_link_id_fkey" FOREIGN KEY ("invite_link_id") REFERENCES "public"."coach_invite_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coaching_assignment_history"
    ADD CONSTRAINT "coaching_assignment_history_new_coach_id_fkey" FOREIGN KEY ("new_coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coaching_assignment_history"
    ADD CONSTRAINT "coaching_assignment_history_previous_coach_id_fkey" FOREIGN KEY ("previous_coach_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coaching_assignments"
    ADD CONSTRAINT "coaching_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."coaching_assignments"
    ADD CONSTRAINT "coaching_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coaching_assignments"
    ADD CONSTRAINT "coaching_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_plans"
    ADD CONSTRAINT "generated_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."module_version_history"
    ADD CONSTRAINT "module_version_history_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."philosophy_modules"("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_shares"
    ADD CONSTRAINT "pending_shares_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pending_shares"
    ADD CONSTRAINT "pending_shares_share_token_fkey" FOREIGN KEY ("share_token") REFERENCES "public"."shared_workouts"("share_token");



ALTER TABLE ONLY "public"."plan_adherence"
    ADD CONSTRAINT "plan_adherence_completed_workout_id_fkey" FOREIGN KEY ("completed_workout_id") REFERENCES "public"."workouts"("id");



ALTER TABLE ONLY "public"."plan_adherence"
    ADD CONSTRAINT "plan_adherence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_adherence"
    ADD CONSTRAINT "plan_adherence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pending_invite_link_id_fkey" FOREIGN KEY ("pending_invite_link_id") REFERENCES "public"."coach_invite_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_events"
    ADD CONSTRAINT "race_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_workouts"
    ADD CONSTRAINT "saved_workouts_shared_from_user_id_fkey" FOREIGN KEY ("shared_from_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."saved_workouts"
    ADD CONSTRAINT "saved_workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sent_notifications"
    ADD CONSTRAINT "sent_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shared_workouts"
    ADD CONSTRAINT "shared_workouts_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strava_activities"
    ADD CONSTRAINT "strava_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strava_oauth_state"
    ADD CONSTRAINT "strava_oauth_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."strava_tokens"
    ADD CONSTRAINT "strava_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_plans"
    ADD CONSTRAINT "training_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_completed_workout_id_fkey" FOREIGN KEY ("completed_workout_id") REFERENCES "public"."workouts"("id");



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."generated_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."training_sessions"
    ADD CONSTRAINT "training_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_data"
    ADD CONSTRAINT "user_data_last_edited_by_fkey" FOREIGN KEY ("last_edited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_data"
    ADD CONSTRAINT "user_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_outcomes"
    ADD CONSTRAINT "user_outcomes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."generated_plans"("id");



ALTER TABLE ONLY "public"."user_outcomes"
    ADD CONSTRAINT "user_outcomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."weekly_checkins"
    ADD CONSTRAINT "weekly_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_exercises"
    ADD CONSTRAINT "workout_exercises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_exercises"
    ADD CONSTRAINT "workout_exercises_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_inbox"
    ADD CONSTRAINT "workout_inbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workout_inbox"
    ADD CONSTRAINT "workout_inbox_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workout_library"
    ADD CONSTRAINT "workout_library_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workout_segments"
    ADD CONSTRAINT "workout_segments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_segments"
    ADD CONSTRAINT "workout_segments_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_share_imports"
    ADD CONSTRAINT "workout_share_imports_receiver_user_id_fkey" FOREIGN KEY ("receiver_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_share_imports"
    ADD CONSTRAINT "workout_share_imports_saved_workout_id_fkey" FOREIGN KEY ("saved_workout_id") REFERENCES "public"."saved_workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_share_imports"
    ADD CONSTRAINT "workout_share_imports_share_token_fkey" FOREIGN KEY ("share_token") REFERENCES "public"."shared_workouts"("share_token");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin full access" ON "public"."ask_ironz_logs" USING (((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text") OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Admins can delete exercise_library" ON "public"."exercise_library" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can delete philosophy_modules" ON "public"."philosophy_modules" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can insert exercise_library" ON "public"."exercise_library" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can insert philosophy_modules" ON "public"."philosophy_modules" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can insert version history" ON "public"."module_version_history" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can read all events" ON "public"."analytics_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read all profiles" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Admins can read gaps" ON "public"."philosophy_gaps" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can read version history" ON "public"."module_version_history" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Admins can update exercise_library" ON "public"."exercise_library" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update gaps" ON "public"."philosophy_gaps" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update philosophy_modules" ON "public"."philosophy_modules" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins delete workouts" ON "public"."workout_library" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins insert workouts" ON "public"."workout_library" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage all coach requests" ON "public"."coach_requests" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins manage coaching assignments" ON "public"."coaching_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins read all workouts" ON "public"."workout_library" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins see all assignment history" ON "public"."coaching_assignment_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins update workouts" ON "public"."workout_library" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins view all click data" ON "public"."coach_invite_clicks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins view all invite link data" ON "public"."coach_invite_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Anon can read training sessions referenced by active shares" ON "public"."training_sessions" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."shared_workouts" "sw"
  WHERE (("sw"."variant_id" = ("training_sessions"."id")::"text") AND ("sw"."revoked_at" IS NULL) AND ("sw"."expires_at" > "now"())))));



CREATE POLICY "Anyone can read active modules" ON "public"."philosophy_modules" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can read exercises" ON "public"."exercise_library" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can read live shares by token" ON "public"."shared_workouts" FOR SELECT USING ((("expires_at" > "now"()) AND ("revoked_at" IS NULL)));



CREATE POLICY "Anyone can read published workouts" ON "public"."workout_library" FOR SELECT USING (("status" = 'published'::"text"));



CREATE POLICY "Anyone can read shared workout sender profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."shared_workouts" "sw"
  WHERE (("sw"."sender_user_id" = "profiles"."id") AND ("sw"."expires_at" > "now"()) AND ("sw"."revoked_at" IS NULL)))));



CREATE POLICY "Anyone can stash a pending share" ON "public"."pending_shares" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can insert gaps" ON "public"."philosophy_gaps" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can look up others by email" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users claim pending shares" ON "public"."pending_shares" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users read pending shares" ON "public"."pending_shares" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Clients can view own audit log" ON "public"."coach_client_audit_log" FOR SELECT USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients see their own assignments" ON "public"."coaching_assignments" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients view their coach-assigned workouts" ON "public"."coach_assigned_workouts" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Coaches can insert permitted client settings" ON "public"."user_data" FOR INSERT WITH CHECK (("public"."is_coaching"("auth"."uid"(), "user_id") AND ((("data_key" = 'nutritionAdjustments'::"text") AND "public"."is_feature_enabled"("user_id", 'nutritionEnabled'::"text")) OR (("data_key" = ANY (ARRAY['hydrationSettings'::"text", 'hydrationDailyTargetOz'::"text"])) AND "public"."is_feature_enabled"("user_id", 'hydrationEnabled'::"text")) OR (("data_key" = 'fuelingPrefs'::"text") AND "public"."is_feature_enabled"("user_id", 'fuelingEnabled'::"text")))));



CREATE POLICY "Coaches can update permitted client settings" ON "public"."user_data" FOR UPDATE USING (("public"."is_coaching"("auth"."uid"(), "user_id") AND ((("data_key" = 'nutritionAdjustments'::"text") AND "public"."is_feature_enabled"("user_id", 'nutritionEnabled'::"text")) OR (("data_key" = ANY (ARRAY['hydrationSettings'::"text", 'hydrationDailyTargetOz'::"text"])) AND "public"."is_feature_enabled"("user_id", 'hydrationEnabled'::"text")) OR (("data_key" = 'fuelingPrefs'::"text") AND "public"."is_feature_enabled"("user_id", 'fuelingEnabled'::"text"))))) WITH CHECK (("public"."is_coaching"("auth"."uid"(), "user_id") AND ((("data_key" = 'nutritionAdjustments'::"text") AND "public"."is_feature_enabled"("user_id", 'nutritionEnabled'::"text")) OR (("data_key" = ANY (ARRAY['hydrationSettings'::"text", 'hydrationDailyTargetOz'::"text"])) AND "public"."is_feature_enabled"("user_id", 'hydrationEnabled'::"text")) OR (("data_key" = 'fuelingPrefs'::"text") AND "public"."is_feature_enabled"("user_id", 'fuelingEnabled'::"text")))));



CREATE POLICY "Coaches can view assigned clients' goals" ON "public"."goals" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "user_id"));



CREATE POLICY "Coaches can view assigned clients' plan_adherence" ON "public"."plan_adherence" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "user_id"));



CREATE POLICY "Coaches can view assigned clients' profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "id"));



CREATE POLICY "Coaches can view assigned clients' race_events" ON "public"."race_events" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "user_id"));



CREATE POLICY "Coaches can view assigned clients' training_plans" ON "public"."training_plans" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "user_id"));



CREATE POLICY "Coaches can view assigned clients' training_sessions" ON "public"."training_sessions" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "user_id"));



CREATE POLICY "Coaches can view assigned clients' workouts" ON "public"."workouts" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "user_id"));



CREATE POLICY "Coaches can view permitted client user_data" ON "public"."user_data" FOR SELECT USING (("public"."is_coaching"("auth"."uid"(), "user_id") AND (("data_key" = ANY (ARRAY['workouts'::"text", 'workoutSchedule'::"text", 'trainingPlan'::"text", 'completedSessions'::"text", 'workoutRatings'::"text", 'personalRecords'::"text", 'trainingZones'::"text", 'trainingZonesHistory'::"text", 'trainingPreferences'::"text", 'trainingNotes'::"text", 'dayRestrictions'::"text", 'equipmentRestrictions'::"text", 'equipmentProfile'::"text", 'events'::"text", 'raceEvents'::"text", 'thresholds'::"text", 'strengthSetup'::"text", 'strengthRole'::"text", 'buildPlanTemplate'::"text", 'longDays'::"text", 'workoutEffortFeedback'::"text", 'calibrationSignals'::"text", 'activePlan'::"text", 'activePlanAt'::"text", 'activePlanSource'::"text", 'activePlanId'::"text", 'currentRecoveryState'::"text", 'latestCheckIn'::"text", 'checkinHistory'::"text", 'userLevel'::"text", 'fitnessGoals'::"text", 'selectedSports'::"text", 'trainingGoals'::"text", 'gear_checklists_v1'::"text", 'completedChallenges'::"text", 'activeChallenges'::"text", 'importedPlans'::"text", 'gymStrengthEnabled'::"text", 'measurementSystem'::"text", 'injuries'::"text", 'pendingPlanRegen'::"text", 'nutritionEnabled'::"text", 'hydrationEnabled'::"text", 'fuelingEnabled'::"text"])) OR (("data_key" = 'nutritionAdjustments'::"text") AND "public"."is_feature_enabled"("user_id", 'nutritionEnabled'::"text")) OR (("data_key" = ANY (ARRAY['hydrationSettings'::"text", 'hydrationDailyTargetOz'::"text"])) AND "public"."is_feature_enabled"("user_id", 'hydrationEnabled'::"text")) OR (("data_key" = 'fuelingPrefs'::"text") AND "public"."is_feature_enabled"("user_id", 'fuelingEnabled'::"text")))));



CREATE POLICY "Coaches can view their own audit writes" ON "public"."coach_client_audit_log" FOR SELECT USING (("auth"."uid"() = "coach_id"));



CREATE POLICY "Coaches can view training keys in clients' user_data" ON "public"."user_data" FOR SELECT USING (("public"."is_coaching"("auth"."uid"(), "user_id") AND ("data_key" = ANY (ARRAY['workoutSchedule'::"text", 'workouts'::"text", 'trainingPlan'::"text", 'completedSessions'::"text", 'workoutRatings'::"text", 'personalRecords'::"text", 'trainingZones'::"text", 'trainingZonesHistory'::"text", 'workoutEffortFeedback'::"text", 'calibrationSignals'::"text", 'fitnessGoals'::"text", 'raceEvents'::"text", 'strengthSetup'::"text", 'injuries'::"text"]))));



CREATE POLICY "Coaches manage their own digest log" ON "public"."coach_digest_log" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage their own invite links" ON "public"."coach_invite_links" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage their own library" ON "public"."coach_workout_library" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage their own programs" ON "public"."coach_programs" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage their own workout assignments" ON "public"."coach_assigned_workouts" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches see their own assignments" ON "public"."coaching_assignments" FOR SELECT USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches view their assigned clients' freeze status" ON "public"."client_plan_freeze" FOR SELECT USING ("public"."is_coaching"("auth"."uid"(), "client_id"));



CREATE POLICY "Coaches view their own click data" ON "public"."coach_invite_clicks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."coach_invite_links"
  WHERE (("coach_invite_links"."id" = "coach_invite_clicks"."invite_link_id") AND ("coach_invite_links"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Public can look up active invite links" ON "public"."coach_invite_links" FOR SELECT USING (("active" = true));



CREATE POLICY "Receivers insert their own imports" ON "public"."workout_share_imports" FOR INSERT WITH CHECK (("auth"."uid"() = "receiver_user_id"));



CREATE POLICY "Receivers read their own imports" ON "public"."workout_share_imports" FOR SELECT USING (("auth"."uid"() = "receiver_user_id"));



CREATE POLICY "Receivers update their own imports" ON "public"."workout_share_imports" FOR UPDATE USING (("auth"."uid"() = "receiver_user_id"));



CREATE POLICY "Recipients can update status" ON "public"."workout_inbox" FOR UPDATE USING (("auth"."uid"() = "recipient_id")) WITH CHECK (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Senders insert their own shares" ON "public"."shared_workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_user_id"));



CREATE POLICY "Senders update their own shares" ON "public"."shared_workouts" FOR UPDATE USING (("auth"."uid"() = "sender_user_id"));



CREATE POLICY "Service role manages subscriptions" ON "public"."subscriptions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role only" ON "public"."sent_notifications" TO "service_role" USING (true);



CREATE POLICY "Users can delete own goals" ON "public"."goals" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own plan_adherence" ON "public"."plan_adherence" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own race_events" ON "public"."race_events" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own strava activities" ON "public"."strava_activities" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own strava tokens" ON "public"."strava_tokens" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own training_plans" ON "public"."training_plans" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own training_sessions" ON "public"."training_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own user_data" ON "public"."user_data" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own weekly_checkins" ON "public"."weekly_checkins" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own workout_exercises" ON "public"."workout_exercises" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own workout_segments" ON "public"."workout_segments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own workouts" ON "public"."workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own events" ON "public"."analytics_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own goals" ON "public"."goals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own outcomes" ON "public"."user_outcomes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own plan_adherence" ON "public"."plan_adherence" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own plans" ON "public"."generated_plans" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own race_events" ON "public"."race_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own training sessions" ON "public"."training_sessions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own training_plans" ON "public"."training_plans" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own training_sessions" ON "public"."training_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own user_data" ON "public"."user_data" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own weekly_checkins" ON "public"."weekly_checkins" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own workout_exercises" ON "public"."workout_exercises" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own workout_segments" ON "public"."workout_segments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own workouts" ON "public"."workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read items they sent" ON "public"."workout_inbox" FOR SELECT USING (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can read own events" ON "public"."analytics_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own outcomes" ON "public"."user_outcomes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own plans" ON "public"."generated_plans" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own strava activities" ON "public"."strava_activities" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own strava tokens" ON "public"."strava_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read their own inbox" ON "public"."workout_inbox" FOR SELECT USING (("auth"."uid"() = "recipient_id"));



CREATE POLICY "Users can send workouts" ON "public"."workout_inbox" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can update own goals" ON "public"."goals" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own plan_adherence" ON "public"."plan_adherence" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own plans" ON "public"."generated_plans" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own race_events" ON "public"."race_events" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own training_plans" ON "public"."training_plans" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own training_sessions" ON "public"."training_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own user_data" ON "public"."user_data" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own weekly_checkins" ON "public"."weekly_checkins" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own workout_exercises" ON "public"."workout_exercises" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own workout_segments" ON "public"."workout_segments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own workouts" ON "public"."workouts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own ai_usage" ON "public"."ai_usage" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own goals" ON "public"."goals" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own plan_adherence" ON "public"."plan_adherence" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile or admins view all" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Users can view own race_events" ON "public"."race_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own training_plans" ON "public"."training_plans" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own training_sessions" ON "public"."training_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own user_data" ON "public"."user_data" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own weekly_checkins" ON "public"."weekly_checkins" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own workout_exercises" ON "public"."workout_exercises" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own workout_segments" ON "public"."workout_segments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own workouts" ON "public"."workouts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users create their own coach request" ON "public"."coach_requests" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their own saved workouts" ON "public"."saved_workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own questions" ON "public"."ask_ironz_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert their own saved workouts" ON "public"."saved_workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own prefs" ON "public"."notification_preferences" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own tokens" ON "public"."push_tokens" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own questions" ON "public"."ask_ironz_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own subscription" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read their own saved workouts" ON "public"."saved_workouts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see their own assignment history" ON "public"."coaching_assignment_history" FOR SELECT USING ((("client_id" = "auth"."uid"()) OR ("new_coach_id" = "auth"."uid"()) OR ("previous_coach_id" = "auth"."uid"())));



CREATE POLICY "Users update own questions (feedback)" ON "public"."ask_ironz_logs" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users update their own saved workouts" ON "public"."saved_workouts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view their own coach requests" ON "public"."coach_requests" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users view their own freeze status" ON "public"."client_plan_freeze" FOR SELECT USING (("client_id" = "auth"."uid"()));



ALTER TABLE "public"."ai_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ask_ironz_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."challenge_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "challenge_participants_delete_own" ON "public"."challenge_participants" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "challenge_participants_insert_own" ON "public"."challenge_participants" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "challenge_participants_select" ON "public"."challenge_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "challenge_participants_update_own" ON "public"."challenge_participants" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."client_plan_freeze" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_assigned_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_client_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_digest_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_invite_clicks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_invite_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_sheet_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_sheet_import_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_workout_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_assignment_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."community_workouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "community_workouts_authored_write" ON "public"."community_workouts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'admin'::"text") OR ("p"."is_coach" = true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'admin'::"text") OR ("p"."is_coach" = true))))));



CREATE POLICY "community_workouts_select" ON "public"."community_workouts" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."exercise_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."module_version_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."philosophy_gaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."philosophy_modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_adherence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."race_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sent_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shared_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strava_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strava_oauth_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strava_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_outcomes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users read own logs" ON "public"."coach_sheet_import_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users read own quota" ON "public"."coach_sheet_import_quotas" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."weekly_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_inbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_share_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_auto_create_invite_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."_auto_create_invite_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_auto_create_invite_link"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_coach_assignment_after_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."_coach_assignment_after_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_coach_assignment_after_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_coach_assignment_after_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."_coach_assignment_after_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_coach_assignment_after_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_coach_assignment_after_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."_coach_assignment_after_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_coach_assignment_after_update"() TO "service_role";



GRANT ALL ON TABLE "public"."coach_assigned_workouts" TO "anon";
GRANT ALL ON TABLE "public"."coach_assigned_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_assigned_workouts" TO "service_role";



GRANT ALL ON FUNCTION "public"."_coach_assignment_to_schedule_entry"("assignment" "public"."coach_assigned_workouts") TO "anon";
GRANT ALL ON FUNCTION "public"."_coach_assignment_to_schedule_entry"("assignment" "public"."coach_assigned_workouts") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_coach_assignment_to_schedule_entry"("assignment" "public"."coach_assigned_workouts") TO "service_role";



GRANT ALL ON FUNCTION "public"."_gen_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."_gen_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_gen_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_is_active_coach"("p_coach_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."_is_active_coach"("p_coach_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_is_active_coach"("p_coach_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."_subscriptions_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."_subscriptions_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_subscriptions_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_touch_challenge_participants_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."_touch_challenge_participants_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_touch_challenge_participants_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_coach_assignment_notes"() TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_coach_assignment_notes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_coach_assignment_notes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_profile_full_name_from_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_profile_full_name_from_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_profile_full_name_from_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_workout_sharing"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_workout_sharing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_workout_sharing"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_delete_client_race"("p_client_id" "uuid", "p_race_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_delete_client_race"("p_client_id" "uuid", "p_race_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."coach_delete_client_race"("p_client_id" "uuid", "p_race_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_delete_client_race"("p_client_id" "uuid", "p_race_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."coach_update_client_training_input"("p_client_id" "uuid", "p_data_key" "text", "p_data_value" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coach_update_client_training_input"("p_client_id" "uuid", "p_data_key" "text", "p_data_value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."coach_update_client_training_input"("p_client_id" "uuid", "p_data_key" "text", "p_data_value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."coach_update_client_training_input"("p_client_id" "uuid", "p_data_key" "text", "p_data_value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."dismiss_invite"("p_invite_link_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dismiss_invite"("p_invite_link_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dismiss_invite"("p_invite_link_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_funnel"("p_link_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_funnel"("p_link_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_funnel"("p_link_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_recent_activity"("p_link_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_recent_activity"("p_link_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_recent_activity"("p_link_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_dismissed_recently"("p_invite_link_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_dismissed_recently"("p_invite_link_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_dismissed_recently"("p_invite_link_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_coaching"("coach_uid" "uuid", "client_uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_coaching"("coach_uid" "uuid", "client_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_coaching"("coach_uid" "uuid", "client_uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_feature_enabled"("uid" "uuid", "flag_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("uid" "uuid", "flag_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("uid" "uuid", "flag_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."module_effectiveness_report"() TO "anon";
GRANT ALL ON FUNCTION "public"."module_effectiveness_report"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."module_effectiveness_report"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pair_with_coach"("p_invite_link_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pair_with_coach"("p_invite_link_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pair_with_coach"("p_invite_link_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_invite_click"("p_code" "text", "p_ip_hash" "text", "p_ua_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_invite_click"("p_code" "text", "p_ip_hash" "text", "p_ua_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_invite_click"("p_code" "text", "p_ip_hash" "text", "p_ua_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rotate_invite_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."rotate_invite_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rotate_invite_link"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_workout_library_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_workout_library_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_workout_library_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_assignment_feedback"("_assignment_id" "uuid", "_note" "text", "_rating" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_assignment_feedback"("_assignment_id" "uuid", "_note" "text", "_rating" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."submit_assignment_feedback"("_assignment_id" "uuid", "_note" "text", "_rating" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_assignment_feedback"("_assignment_id" "uuid", "_note" "text", "_rating" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."switch_coach"("p_invite_link_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."switch_coach"("p_invite_link_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_coach"("p_invite_link_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_events" TO "anon";
GRANT ALL ON TABLE "public"."analytics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_events" TO "service_role";



GRANT ALL ON TABLE "public"."ask_ironz_logs" TO "anon";
GRANT ALL ON TABLE "public"."ask_ironz_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ask_ironz_logs" TO "service_role";



GRANT ALL ON TABLE "public"."challenge_participants" TO "anon";
GRANT ALL ON TABLE "public"."challenge_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."challenge_participants" TO "service_role";



GRANT ALL ON TABLE "public"."client_plan_freeze" TO "anon";
GRANT ALL ON TABLE "public"."client_plan_freeze" TO "authenticated";
GRANT ALL ON TABLE "public"."client_plan_freeze" TO "service_role";



GRANT ALL ON TABLE "public"."coach_client_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."coach_client_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_client_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."coach_digest_log" TO "anon";
GRANT ALL ON TABLE "public"."coach_digest_log" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_digest_log" TO "service_role";



GRANT ALL ON TABLE "public"."coach_invite_clicks" TO "anon";
GRANT ALL ON TABLE "public"."coach_invite_clicks" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_invite_clicks" TO "service_role";



GRANT ALL ON TABLE "public"."coach_invite_links" TO "anon";
GRANT ALL ON TABLE "public"."coach_invite_links" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_invite_links" TO "service_role";



GRANT ALL ON TABLE "public"."coach_programs" TO "anon";
GRANT ALL ON TABLE "public"."coach_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_programs" TO "service_role";



GRANT ALL ON TABLE "public"."coach_requests" TO "anon";
GRANT ALL ON TABLE "public"."coach_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_requests" TO "service_role";



GRANT ALL ON TABLE "public"."coach_sheet_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."coach_sheet_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_sheet_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."coach_sheet_import_quotas" TO "anon";
GRANT ALL ON TABLE "public"."coach_sheet_import_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_sheet_import_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."coach_workout_library" TO "anon";
GRANT ALL ON TABLE "public"."coach_workout_library" TO "authenticated";
GRANT ALL ON TABLE "public"."coach_workout_library" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_assignment_history" TO "anon";
GRANT ALL ON TABLE "public"."coaching_assignment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_assignment_history" TO "service_role";



GRANT ALL ON TABLE "public"."coaching_assignments" TO "anon";
GRANT ALL ON TABLE "public"."coaching_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."coaching_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."community_workouts" TO "anon";
GRANT ALL ON TABLE "public"."community_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."community_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_library" TO "anon";
GRANT ALL ON TABLE "public"."exercise_library" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_library" TO "service_role";



GRANT ALL ON TABLE "public"."generated_plans" TO "anon";
GRANT ALL ON TABLE "public"."generated_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_plans" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."module_version_history" TO "anon";
GRANT ALL ON TABLE "public"."module_version_history" TO "authenticated";
GRANT ALL ON TABLE "public"."module_version_history" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."pending_shares" TO "anon";
GRANT ALL ON TABLE "public"."pending_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_shares" TO "service_role";



GRANT ALL ON TABLE "public"."philosophy_gaps" TO "anon";
GRANT ALL ON TABLE "public"."philosophy_gaps" TO "authenticated";
GRANT ALL ON TABLE "public"."philosophy_gaps" TO "service_role";



GRANT ALL ON TABLE "public"."philosophy_modules" TO "anon";
GRANT ALL ON TABLE "public"."philosophy_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."philosophy_modules" TO "service_role";



GRANT ALL ON TABLE "public"."plan_adherence" TO "anon";
GRANT ALL ON TABLE "public"."plan_adherence" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_adherence" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."race_events" TO "anon";
GRANT ALL ON TABLE "public"."race_events" TO "authenticated";
GRANT ALL ON TABLE "public"."race_events" TO "service_role";



GRANT ALL ON TABLE "public"."saved_workouts" TO "anon";
GRANT ALL ON TABLE "public"."saved_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."sent_notifications" TO "anon";
GRANT ALL ON TABLE "public"."sent_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."sent_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."shared_workouts" TO "anon";
GRANT ALL ON TABLE "public"."shared_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."shared_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."strava_activities" TO "anon";
GRANT ALL ON TABLE "public"."strava_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."strava_activities" TO "service_role";



GRANT ALL ON TABLE "public"."strava_oauth_state" TO "anon";
GRANT ALL ON TABLE "public"."strava_oauth_state" TO "authenticated";
GRANT ALL ON TABLE "public"."strava_oauth_state" TO "service_role";



GRANT ALL ON TABLE "public"."strava_tokens" TO "anon";
GRANT ALL ON TABLE "public"."strava_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."strava_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."training_plans" TO "anon";
GRANT ALL ON TABLE "public"."training_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."training_plans" TO "service_role";



GRANT ALL ON TABLE "public"."training_sessions" TO "anon";
GRANT ALL ON TABLE "public"."training_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."training_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."user_data" TO "anon";
GRANT ALL ON TABLE "public"."user_data" TO "authenticated";
GRANT ALL ON TABLE "public"."user_data" TO "service_role";



GRANT ALL ON TABLE "public"."user_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."user_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_checkins" TO "anon";
GRANT ALL ON TABLE "public"."weekly_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."workout_exercises" TO "anon";
GRANT ALL ON TABLE "public"."workout_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."workout_inbox" TO "anon";
GRANT ALL ON TABLE "public"."workout_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_inbox" TO "service_role";



GRANT ALL ON TABLE "public"."workout_library" TO "anon";
GRANT ALL ON TABLE "public"."workout_library" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_library" TO "service_role";



GRANT ALL ON TABLE "public"."workout_segments" TO "anon";
GRANT ALL ON TABLE "public"."workout_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_segments" TO "service_role";



GRANT ALL ON TABLE "public"."workout_share_imports" TO "anon";
GRANT ALL ON TABLE "public"."workout_share_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_share_imports" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







