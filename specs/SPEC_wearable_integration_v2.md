# IronZ Wearable Integration Spec v2 — Strava Push, Cross-Source Dedup, Garmin/Whoop

## Overview

This spec covers three features that build on the existing Strava pull integration (commits 712cd1c → dd9afa4):

1. **Push-to-Strava** — upload completed IronZ workouts to Strava with branding
2. **Cross-source deduplication** — prevent duplicate activities when multiple wearables sync the same workout
3. **Garmin + Whoop integration scaffolding** — same pull architecture as Strava, dedup-aware from day one

---

## 1. Push-to-Strava

### Scope

When a user completes a workout in IronZ (taps "Complete" or logs a session), the app offers to upload that activity to Strava. This is opt-in — not automatic.

### Strava API Requirements

- **New scope needed:** `activity:write` (in addition to existing `activity:read_all`)
- Update the OAuth flow in `strava-auth` Edge Function to request both scopes
- Users who already connected will need to re-authorize to grant the write scope
- Handle the case where a user has an existing connection with read-only scope — show a "Reconnect to enable uploads" prompt

### Upload Flow

1. User completes a workout in IronZ
2. A "Share to Strava" button appears on the completion screen (next to the existing share options)
3. On tap, the client calls a new `strava-upload` Edge Function with the workout data
4. The Edge Function calls Strava's `POST /api/v3/activities` with:
   - `name`: workout name from IronZ (e.g., "Upper Body Push + Core")
   - `type`: mapped IronZ type → Strava type (Strength → WeightTraining, Running → Run, etc.)
   - `start_date_local`: workout start time in ISO 8601
   - `elapsed_time`: total duration in seconds
   - `description`: formatted workout summary + branding line (see below)
   - `trainer`: true (marks it as an indoor/virtual activity when appropriate)
5. On success, the Edge Function then uploads a workout summary image via `POST /api/v3/uploads` (photo endpoint)
6. Client shows a success toast: "Posted to Strava!"
7. Fire analytics event: `strava_activity_uploaded`

### Activity Description Format

```
Upper Body Push + Core — Strength Training

Bench Press: 4 × 8 @ 185 lbs
Overhead Press: 4 × 10 @ 115 lbs
Incline DB Press: 3 × 12 @ 60 lbs
Lateral Raises: 3 × 15 @ 25 lbs
Tricep Pushdowns: 3 × 12 @ 50 lbs
Cable Crunches: 3 × 20 @ 70 lbs

52 min · 24 sets · 6 exercises

Built with IronZ — ironz.fit
```

For cardio workouts (Running, Cycling, Swimming), include distance, pace/speed, and zone data instead of exercises.

### Workout Summary Image

Generate a branded image card (PNG, 1080×1080 or 1080×1350) that gets uploaded as a photo on the Strava activity. This is the primary branding/marketing vehicle.

**Card design (approved mockup: strava-card-option-a.html):**
- Red gradient header bar with lightning bolt favicon (white, filled) + "IRONZ" text + date
- Workout name + type
- Stats row: Minutes, Sets, Exercises (3 boxes — no PRs, no volume/lbs)
- Exercise list with sets × reps @ weight
- Footer: "Built with IronZ" + "ironz.fit"
- Dark background (#1c1c1e → #2c2c2e gradient)

**Image generation approach:**
- Server-side: use the `strava-upload` Edge Function to render the HTML card to a PNG using a headless approach, or
- Client-side: use `html2canvas` or a `<canvas>` renderer to generate the image before uploading
- Recommended: client-side canvas generation (avoids server-side rendering complexity), then send the base64 PNG to the Edge Function which uploads it to Strava

**Card variants by workout type:**
- Strength: exercise list with sets/reps/weight (as in mockup)
- Running/Cycling/Swimming: segment list with distance, pace, zone
- HIIT: exercise list + HIIT meta pill (format, rounds, rest)
- Yoga/General: exercise/pose list with duration

### Strava Photo Upload

Strava's API allows photo uploads on activities via `POST /api/v3/uploads` or by attaching to an activity. Check current Strava API docs for the exact endpoint — it may be `POST /api/v3/activities/{id}/photos` or require using the upload endpoint. The image should appear as the activity's cover photo in the Strava feed.

**Note:** Strava's API photo upload may have restrictions. If direct photo upload isn't available via API, fall back to just the text description with branding. The description alone ("Built with IronZ — ironz.fit") still provides marketing value.

### Settings

Add a toggle in Settings → Connected Apps → Strava section:
- "Auto-share completed workouts to Strava" (default: off)
- When on, skip the manual "Share to Strava" button and upload automatically on workout completion

---

## 2. Cross-Source Deduplication

### Problem

A user with a Garmin watch connected to both Strava and IronZ would get duplicate activities:
- Garmin watch records a run → auto-uploads to Strava → IronZ pulls from Strava
- Same Garmin watch → IronZ pulls from Garmin
- Result: same run appears twice on the IronZ calendar

Similarly, if a user completes a workout in IronZ and pushes it to Strava, the next Strava sync would pull it back — creating a duplicate.

### Solution: Activity Fingerprinting

Every activity stored in `strava_activities` (and future `garmin_activities`, `whoop_activities`) gets a fingerprint based on:

```
fingerprint = hash(user_id + date(start_time, rounded to nearest 5min) + activity_type_normalized)
```

The dedup logic:
1. Before inserting any synced activity, compute its fingerprint
2. Check if an activity with the same fingerprint already exists in ANY source table
3. If match found: skip the insert (or update if the new source has richer data)
4. Priority order when both exist: IronZ manual > Strava > Garmin > Whoop

### IronZ-to-Strava Round-Trip Prevention

When IronZ pushes a workout to Strava (Section 1), store the resulting Strava activity ID in the local workout record:
```
workout.stravaUploadId = "12345678"
```

On the next Strava sync, if a pulled activity's ID matches any `stravaUploadId` in localStorage workouts, skip it. This is a precise dedup that doesn't rely on fingerprinting.

### Database Schema Addition

Add to `strava_activities` (and future source tables):
```sql
ALTER TABLE strava_activities ADD COLUMN fingerprint text;
CREATE INDEX idx_strava_activities_fingerprint ON strava_activities(fingerprint);
```

Add a cross-source dedup table:
```sql
CREATE TABLE activity_fingerprints (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  fingerprint text NOT NULL,
  source text NOT NULL,  -- 'ironz', 'strava', 'garmin', 'whoop'
  source_id text,        -- original ID from the source platform
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, fingerprint)
);
```

RLS: users can only read/write their own fingerprints.

### Client-Side Dedup (localStorage)

The `_mergeStravaIntoLocalWorkouts` function (and future Garmin/Whoop equivalents) should:
1. Before adding a synced activity, check if a workout with overlapping start_time (±5 min) and same normalized type already exists
2. If the existing workout has `source: "ironz"` (user-created), prefer it and skip the sync'd version
3. If the existing workout has a different external source, prefer the higher-priority source

### Settings: Primary Sync Source

Add to Settings → Connected Apps:
- "Primary activity source" dropdown: Auto (recommended), Strava, Garmin, Whoop
- Auto = use the priority order (IronZ > Strava > Garmin > Whoop)
- Manual override = always prefer the selected source when duplicates are detected

---

## 3. Garmin Integration (Scaffolding)

### Architecture

Identical pattern to Strava — three Edge Functions:

1. `garmin-auth` — initiates OAuth 1.0a flow (Garmin uses OAuth 1.0a, not 2.0)
2. `garmin-callback` — handles redirect, stores tokens
3. `garmin-sync` — pulls activities from Garmin Connect API

### Database Tables

```sql
CREATE TABLE garmin_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users,
  access_token text NOT NULL,
  token_secret text NOT NULL,
  last_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE garmin_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  garmin_id text NOT NULL,
  name text,
  activity_type text,
  distance_meters real,
  duration_seconds real,
  start_time timestamptz,
  average_hr real,
  max_hr real,
  calories real,
  fingerprint text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, garmin_id)
);
```

### Data Mapping

Garmin activity types → IronZ types:
- running, trail_running → Running
- cycling, mountain_biking → Cycling
- lap_swimming, open_water_swimming → Swimming
- strength_training → Strength
- hiit → HIIT
- yoga → Yoga
- rowing → Rowing
- Other → General

### Blocked

Garmin's developer program access request form is currently "Under Construction." Revisit when available. The schema and Edge Function stubs can be created now so the integration is ready to wire up once we have API keys.

---

## 4. Whoop Integration (Scaffolding)

### Architecture

Three Edge Functions (OAuth 2.0, same pattern as Strava):

1. `whoop-auth` — initiates OAuth flow
2. `whoop-callback` — handles redirect, stores tokens
3. `whoop-sync` — pulls recovery, strain, sleep, and workout data

### Unique Value

Whoop doesn't track individual exercises — it tracks biometric recovery data. The integration value is different:
- **Recovery score** → IronZ uses this to suggest workout intensity adjustments
- **Strain** → validates that the user's actual exertion matches the planned workout intensity
- **Sleep performance** → surfaces in the daily view as context for training readiness
- **HRV** → long-term trend tracking in Stats

### Database Tables

```sql
CREATE TABLE whoop_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  last_sync timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE whoop_recovery (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  whoop_cycle_id text NOT NULL,
  date date NOT NULL,
  recovery_score real,
  resting_hr real,
  hrv_rmssd real,
  spo2 real,
  skin_temp real,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, whoop_cycle_id)
);

CREATE TABLE whoop_sleep (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  whoop_sleep_id text NOT NULL,
  date date NOT NULL,
  score real,
  total_in_bed_minutes real,
  total_sleep_minutes real,
  rem_minutes real,
  deep_minutes real,
  light_minutes real,
  awake_minutes real,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, whoop_sleep_id)
);
```

### Whoop Scopes Needed

- `read:recovery`
- `read:sleep`
- `read:workout`
- `read:profile`

### Blocked

Waiting on Whoop developer program approval. Apply at developer.whoop.com.

---

## Implementation Order

1. **Push-to-Strava** (can build now — Strava is already connected)
   - Update OAuth scope to include `activity:write`
   - Build `strava-upload` Edge Function
   - Build client-side image generator
   - Add "Share to Strava" button on workout completion
   - Add auto-share toggle in settings

2. **Cross-source dedup** (build alongside push, needed before adding more sources)
   - Add fingerprint column + dedup table migration
   - IronZ-to-Strava round-trip prevention
   - Client-side dedup in merge function

3. **Garmin scaffolding** (build stubs now, wire up when API access granted)

4. **Whoop scaffolding** (build stubs now, wire up when developer access approved)

---

## Files to Create/Modify

- `supabase/functions/strava-upload/index.ts` — new Edge Function
- `supabase/functions/strava-auth/index.ts` — add `activity:write` scope
- `js/strava-integration.js` — add upload flow, dedup logic, image generation
- `js/ui/workout-complete.js` or equivalent — add "Share to Strava" button
- `wearable-dedup-migration.sql` — fingerprint columns + dedup table
- `garmin-migration.sql` — token + activity tables (stub)
- `whoop-migration.sql` — token + recovery + sleep tables (stub)
- `index.html` — Strava auto-share toggle in settings
- `style.css` — any new UI styles for the share button

---

## Approved Design Assets

- Strava workout summary card: `strava-card-option-a.html` in the Ironz folder
- Lightning bolt favicon: `favicon.svg` (white filled version on red header)
- Branding text: "Built with IronZ" + "ironz.fit"
