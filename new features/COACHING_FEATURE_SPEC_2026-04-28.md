# IronZ Coaching Feature — v1 Spec

**Author:** Spec written 2026-04-28 from a 12-question elicitation with Chase. Comprehensive build-out before any code starts.

**Goal:** Let a designated user (a "coach") manage other users' (their "clients") training. Coach sees the client's training stack, assigns workouts in any of the existing creation modes, gets a daily digest of client activity, and attaches one-way notes to assigned workouts. Coach is also still a regular IronZ athlete in their own right — they switch into a Coach Portal the same way admins switch into the Admin Portal.

---

## Decisions (locked in)

| Decision | Value |
|---|---|
| **Coach hierarchy** | One primary + optional sub-coaches. Sub-coaches have same access as primary except can't promote/remove other coaches. |
| **Data scope** | Training only — workouts, completions, feedback, RPE, plan, **PRs and strength benchmarks**. Excluded: nutrition, hydration, body comp, sleep, meal photos. |
| **Workout assignment** | Every existing creation method: build from scratch, pick from coach's library, edit AI-generated workouts, multi-week programs. |
| **Client onboarding to coaching** | Admin assigns directly. No client consent. Client is notified the relationship exists but doesn't have to accept. |
| **Conflict resolution** | When coach assigns a workout for a date that already has one, coach picks per-assignment: **Replace / Stack / Freeze AI plan**. |
| **Coach dashboard MVP** | Client list with at-a-glance status, today's assigned-workout queue, quick-assign tile, race-day banner. |
| **Communication** | Per-workout coach note, one-way, no client reply. |
| **Notifications** | Daily digest only (no per-event pings). |
| **Coach can be a client** | Yes — same user can coach others AND have their own coach. |
| **v1 scope** | MVP + notes + daily digest notifications. Sub-coaches included since they share the primary's permission model. |

---

## User stories (the four flows that matter)

### 1. Admin promotes Coach Mark and assigns him three clients
- Admin opens Admin Portal → new "Coaches" tab.
- Toggles `is_coach: true` on Mark's profile row.
- Mark immediately sees a "Coach Portal" card on his Profile screen, identical pattern to the existing Admin entry card.
- Admin then assigns Sarah, Jen, and David as Mark's clients (primary coach for all three).
- Each client sees a subtle line in their Profile screen: *"Coached by Mark Davis."* No accept flow. No popup. Just exists.

### 2. Coach Mark assigns Sarah a workout
- Mark opens Profile → Coach Portal → his dashboard.
- Sees Sarah's card in the client list. Taps in.
- Sarah's calendar is the focus. Mark scrolls to next Wednesday — sees an AI-generated Easy Run.
- Mark taps "Assign Workout" → picks "Edit existing" → modifies the run to add tempo intervals.
- Conflict resolution modal: *"Sarah has Easy Run on Wednesday. What should happen?"* — Mark picks **Replace**.
- Mark types a coach note: *"Focus on the second half — negative split."*
- Saves. Sarah gets the new workout in her calendar with Mark's name and note attached.

### 3. Sarah does the workout
- Wednesday morning, Sarah opens IronZ. Sees the workout card.
- Card shows coach attribution: *"From Mark"* + the note in muted text.
- Tap → live tracker. Standard flow.
- On completion, Sarah is asked the standard "How did that feel?" prompt.
- Result is logged. Mark's daily digest will pick it up tomorrow morning.

### 4. Mark's morning digest
- 7 AM Tuesday: Mark gets one push notification.
- Body: *"3 clients trained yesterday. Sarah crushed her tempo run, David missed Push Day, Jen logged 'just right' on Long Ride."*
- Tap → Coach Portal opens to a digest view summarizing all three.

---

## Data model

### New columns on existing tables

```sql
-- profiles table already has a `role` column (admin/user). Add coach flag.
alter table public.profiles
  add column if not exists is_coach boolean not null default false;

-- Index for the "find me all coaches" admin query
create index if not exists profiles_is_coach_idx
  on public.profiles (is_coach) where is_coach = true;
```

### New tables

```sql
-- Coaching relationships
create table public.coaching_assignments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references auth.users(id) on delete cascade,
  coach_id      uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('primary', 'sub')),
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references auth.users(id), -- admin who created the link
  active        boolean not null default true,
  deactivated_at timestamptz,

  constraint coaching_no_self check (client_id <> coach_id),
  constraint coaching_unique_active unique (client_id, coach_id, active)
);

create index coaching_active_client_idx on public.coaching_assignments (client_id) where active = true;
create index coaching_active_coach_idx on public.coaching_assignments (coach_id) where active = true;

-- A client can have AT MOST ONE primary coach at a time.
-- Enforced via partial unique index since constraints can't be partial.
create unique index coaching_one_primary_per_client
  on public.coaching_assignments (client_id)
  where role = 'primary' and active = true;

-- Coach-assigned workouts (separate table from the main workoutSchedule
-- so we can attribute and surface them without polluting the AI plan).
create table public.coach_assigned_workouts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references auth.users(id) on delete cascade,
  coach_id        uuid not null references auth.users(id),
  date            date not null,
  workout         jsonb not null,
  conflict_mode   text not null check (conflict_mode in ('replace', 'stack', 'freeze')),
  coach_note      text,
  program_id      uuid references public.coach_programs(id) on delete set null,
  program_week    int,
  program_day     int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index coach_assigned_client_date_idx on public.coach_assigned_workouts (client_id, date);
create index coach_assigned_coach_date_idx on public.coach_assigned_workouts (coach_id, date);

-- Coach's personal saved-workout library (separate from athlete savedWorkouts)
create table public.coach_workout_library (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  workout       jsonb not null,
  notes         text,
  created_at    timestamptz not null default now()
);

create index coach_library_owner_idx on public.coach_workout_library (coach_id);

-- Multi-week programs (a weekly template + duration that can be applied to a client)
create table public.coach_programs (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  duration_weeks  int not null check (duration_weeks > 0),
  weekly_template jsonb not null,  -- { mon: [...], tue: [...], ... }
  created_at      timestamptz not null default now()
);

-- Plan-freeze flag: when a coach uses "Freeze" conflict mode, AI plan
-- generation should stop adding new workouts to this client's calendar.
create table public.client_plan_freeze (
  client_id     uuid primary key references auth.users(id) on delete cascade,
  frozen_at     timestamptz not null default now(),
  frozen_by     uuid references auth.users(id),
  unfrozen_at   timestamptz
);

-- Daily digest log (so we don't double-send if cron retries)
create table public.coach_digest_log (
  coach_id      uuid not null references auth.users(id) on delete cascade,
  digest_date   date not null,
  sent_at       timestamptz not null default now(),
  digest_body   text,
  primary key (coach_id, digest_date)
);
```

### What lives where

- **`workoutSchedule`** (existing localStorage + Supabase) — still the source of truth for the client's calendar. Coach-assigned workouts get **mirrored** into this array with a `coachId` field so the existing render path picks them up. The `coach_assigned_workouts` table is the canonical record; `workoutSchedule` is the projection.
- **Why the duplication?** The client's app already reads `workoutSchedule` everywhere. Adding a second source would mean touching ~20 files. Mirroring is one cron/trigger that keeps both in sync.
- **`coach_assigned_workouts.workout` JSONB** has the same shape as a workoutSchedule entry. Add fields: `coachId`, `coachName`, `coachNote`, `assignedAt`.

---

## Row Level Security (RLS) policies

The trickiest part of the build. Get this right or coaches read data they shouldn't.

```sql
-- Helper function: is this coach actively assigned to this client?
create or replace function public.is_coaching(coach_uid uuid, client_uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.coaching_assignments
    where coach_id = coach_uid
      and client_id = client_uid
      and active = true
  );
$$;

-- profiles: coaches can read their clients' basic profile (name, email, age, gender)
create policy "Coaches can view assigned clients' profiles"
  on public.profiles
  for select
  using (
    public.is_coaching(auth.uid(), id)
  );

-- training data: workoutSchedule, completedWorkouts, feedback, prs, training_zones
-- (each on their own table — replicate this pattern per table)
create policy "Coaches can view assigned clients' training data"
  on public.workout_schedule  -- or whatever the table name actually is
  for select
  using (
    public.is_coaching(auth.uid(), user_id)
  );

-- Same pattern for: completed_workouts, feedback, prs, training_zones, races
-- (NOT for: meals, hydration_log, body_comp, sleep, photos)

-- coach_assigned_workouts: only the assigned coach (or primary coach) can read/write
create policy "Coaches can manage their own assignments"
  on public.coach_assigned_workouts
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- Clients can read coach-assigned workouts for themselves
create policy "Clients can view their own coach assignments"
  on public.coach_assigned_workouts
  for select
  using (client_id = auth.uid());

-- coach_workout_library: only the coach
create policy "Coaches manage their own library"
  on public.coach_workout_library
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- coach_programs: only the coach
create policy "Coaches manage their own programs"
  on public.coach_programs
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- coaching_assignments: only admins can write; coaches and clients can read their own rows
create policy "Admins manage coaching assignments"
  on public.coaching_assignments
  for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Coaches see their own assignments"
  on public.coaching_assignments
  for select
  using (coach_id = auth.uid());

create policy "Clients see their own assignments"
  on public.coaching_assignments
  for select
  using (client_id = auth.uid());
```

**Critical sanity check:** verify that `meals`, `hydration_log`, `body_comp_logs`, `sleep_logs`, `photos` tables have **no policy** allowing coach access. The default-deny posture protects these — but explicitly add a regression test that confirms `select * from meals where user_id = <client>` as the coach role returns zero rows.

---

## UI surfaces

### A. Admin Portal — new "Coaches" tab

Add a fourth tab to the existing Admin Panel (currently Users / Philosophy / Exercises / Workouts). Sits next to those, called **Coaches**.

```
┌─ Admin Panel ──────────────────────────────────────┐
│  Users  │  Philosophy  │  Exercises  │  Coaches   │
├────────────────────────────────────────────────────┤
│  TOTAL COACHES: 3      ACTIVE ASSIGNMENTS: 12     │
│                                                    │
│  [+ Promote user to coach]                         │
│                                                    │
│  ▾ Mark Davis (3 clients)                          │
│    ├─ Sarah Chen  (primary, since Apr 12)  [×]    │
│    ├─ David Park  (primary, since Apr 18)  [×]    │
│    └─ Jen Wu       (primary, since Apr 21)  [×]    │
│    [+ Assign client]                               │
│                                                    │
│  ▾ Coach Riley Quinn (1 client)                    │
│    └─ Sarah Chen   (sub, since Apr 22)     [×]    │
│    [+ Assign client]                               │
│                                                    │
│  ▾ Mark's clients without sub-coaches (6):         │
│    ...                                             │
└────────────────────────────────────────────────────┘
```

Components:
- **Promote-to-coach modal:** picks any user, toggles `is_coach: true`. Confirms.
- **Assign-client modal:** picks an active client (exclude users who are themselves coaches if Chase wants — though decision was coach-can-also-be-client, so allow). Picks role (primary or sub). Submits.
- **Remove-assignment button:** soft-deactivates the row (`active: false`, `deactivated_at: now()`). Does NOT delete coach-assigned workouts already on the calendar — those stay, marked "from former coach."

Files to touch:
- `js/admin.js` — add the Coaches tab logic.
- `index.html` — add the tab markup.
- `style.css` — reuse existing admin tab styles.

### B. Profile screen — Coach Portal entry card

Mirror the existing Admin entry card pattern. Show only when `_userRole === 'admin'` OR `_isCoach === true`. Both can show simultaneously for users who are both.

```
[ Profile screen ]
  ...
  ┌── Coach Portal ──────────────────────────┐
  │  3 clients · 12 workouts assigned this   │
  │  week                                     │
  │                                  [Open ›] │
  └──────────────────────────────────────────┘

  ┌── Admin Portal ──────────────────────────┐
  │  System administration                    │
  │                                  [Open ›] │
  └──────────────────────────────────────────┘
  ...
```

Files to touch:
- `js/admin.js` — already has `initAdminVisibility()`; add a parallel `initCoachVisibility()`.
- `index.html` — add `#section-coach-entry` element.

### C. Coach Portal — Dashboard (the landing screen)

```
[ Coach Portal · Mark Davis ]
                                                    [× Exit]
┌── TODAY'S QUEUE ─────────────────────────────────┐
│  3 workouts assigned · 2 completed · 1 pending   │
│                                                   │
│  ✓ Sarah · Long Run (90 min)                     │
│  ✓ David · Push Day (45 min)                     │
│  ⏳ Jen · Endurance Swim (60 min)                │
└───────────────────────────────────────────────────┘

┌── RACE DAYS ─────────────────────────────────────┐
│  Sarah · IM 70.3 Boulder · in 12 days            │
│  David · Spartan Race · in 38 days               │
└───────────────────────────────────────────────────┘

[ + Quick Assign Workout ]   ← prominent button

┌── CLIENTS ───────────────────────────────────────┐
│  Sarah Chen                                       │
│  Last: Long Run · 'just right' · yesterday        │
│  Completion: 92% (4 weeks)                        │
│                                          [Open ›] │
│  ─────────────────────────────────────────────   │
│  David Park                                       │
│  Last: Missed Push Day · 2 days ago      ⚠       │
│  Completion: 67% (4 weeks)                        │
│                                          [Open ›] │
│  ─────────────────────────────────────────────   │
│  Jen Wu                                           │
│  Last: Endurance Swim · 'just right' · today      │
│  Completion: 88% (4 weeks)                        │
│                                          [Open ›] │
└───────────────────────────────────────────────────┘
```

Stats shown per client card:
- Last completed workout (name + feedback emoji + when).
- 4-week completion percentage.
- Visual flag (⚠) when client has missed sessions or logged consecutive HARD/CRUSHED ME.

### D. Coach Portal — Client Detail

Tap a client card → drills into their training view.

```
[ Coach Portal · Sarah Chen ]
                                            [‹ Back]
┌── SARAH ── (since Apr 12, primary coach) ────────┐
│  Age 32 · Female · 145 lbs · IM 70.3 in 12 days  │
└───────────────────────────────────────────────────┘

[ Calendar ]  [ Benchmarks ]  [ Feedback ]
  ─────────────────────

  ◀ This week: Apr 28 – May 4 ▶                      [+ Assign]

  Mon · Push Day · 45 min            ✓ done · 'just right'
  Tue · Easy Run · 35 min            ✓ done · 'easy'
  Wed · CSS Swim · 60 min            (planned)
  Thu · Tempo Run · 50 min           (planned, FROM YOU · "negative split")
  Fri · Strength · 40 min            (planned)
  Sat · Long Run · 90 min            (planned)
  Sun · Rest

[ Tab: Benchmarks ]
  Bench: 185 · Squat: 245 · Deadlift: 295 · OHP: 95
  Run threshold pace: 6:40/mi
  Swim CSS: 1:32/100m

[ Tab: Feedback ]
  Past 14 days · timeline view of feedback emojis with notes
```

Workout cards in the calendar:
- AI-generated workouts: standard styling, no attribution.
- Coach-assigned workouts: show "FROM YOU" badge + the note inline.
- Completed: green checkmark + feedback emoji.

Tap any workout → full editor (the same Bug 9 single-row exercise component, set to write mode for the coach).

### E. Coach Portal — Workout Library

Coach's own saved workouts, separate from the athlete's saved library.

```
[ Coach Portal · Workout Library ]
                                     [+ New Workout]

  Push Day — 45 min                              [⋯]
  5 exercises · last assigned 3 days ago

  Pull Day — 50 min                              [⋯]
  6 exercises · last assigned 7 days ago

  Long Run Tempo Build — 90 min                  [⋯]
  WU + 4×8 min @ threshold + CD

  ...
```

Each workout has [⋯] menu: Edit, Duplicate, Assign to client(s), Delete.
**Bulk assign**: pick a workout → tap Assign → multi-select clients → pick date(s) → confirm.

### F. Coach Portal — Programs

Multi-week program templates. Apply to a client and the system bulk-creates `coach_assigned_workouts` rows for the duration.

```
[ Coach Portal · Programs ]
                                        [+ New Program]

  Hyrox 8-Week Build                              [⋯]
  8 weeks · 5 sessions/wk · 40 total workouts
  Applied to: 2 clients

  ...
```

Program editor: a weekly template builder (Mon/Tue/.../Sun rows; each row gets workouts). Mirrors the existing onboarding-v2 schedule builder pattern.

### G. Conflict resolution modal

When the coach assigns a workout for a date with existing content:

```
┌── Conflict ──────────────────────────────────────┐
│                                                   │
│  Sarah has Easy Run planned for Wednesday.        │
│  What should happen?                              │
│                                                   │
│  ◯ Replace                                        │
│    Your workout replaces the AI's.                │
│                                                   │
│  ◯ Stack                                          │
│    Both workouts on the same day.                 │
│    AM/PM split — make sure that's intended.       │
│                                                   │
│  ◯ Freeze AI plan from this date forward          │
│    AI stops generating future workouts.           │
│    You own the calendar from here.                │
│                                                   │
│                       [ Cancel ]    [ Confirm ]   │
└───────────────────────────────────────────────────┘
```

Implementation note: Replace/Stack are per-workout decisions. Freeze sets a row in `client_plan_freeze` and changes the AI generator's behavior globally for that client.

### H. Client experience — coach attribution on workouts

Client opens IronZ home. A coach-assigned workout looks like:

```
[ Workout card ]
  Long Run Tempo Build                    90 min
  Running

  ── FROM MARK ─────────────────
  Focus on the second half — negative split.
  ──────────────────────────────

  WARMUP   Z1 > 10:00/mi    10 min
  ...
```

Visual treatment: the "FROM MARK" badge is a soft-colored accent (using the brand red or a coaching-specific purple) above the workout content. Note text is in muted style.

In the Profile screen, add a line:
```
  Coached by Mark Davis
  ────────────────────────
```
Tappable to view the coach's name + when assigned. No editing — it's informational.

---

## Daily digest notification

### Cron job

Runs at 7 AM in each coach's local timezone (use the existing push notification scheduling infrastructure). For each coach with `is_coach = true` and at least one active assignment:

1. Pull the previous 24 hours of activity across all their clients:
   - Completed workouts (with feedback)
   - Missed workouts (planned + past + not completed)
   - Concerning feedback (HARD or CRUSHED ME)
   - New PRs
2. Rank by importance:
   - Concerning feedback (top)
   - Missed workouts (middle)
   - Completions and PRs (bottom)
3. Truncate to top ~5 items.
4. Format push body (180 char max for mobile preview).
5. Insert into `coach_digest_log` so we don't double-send.
6. Send via the existing push infrastructure.

### Body templates

```
"3 of 5 trained yesterday. Sarah crushed her tempo run. David missed Push Day. Jen logged 'crushed me' on Squats — check in?"
```

```
"5 of 5 trained yesterday. Sarah hit 95 lb OHP PR. David logged 'just right' on Long Run. Quiet day — keep it rolling."
```

```
"2 of 5 trained — slow day. Sarah: ✓. Jen: ✓ + 'crushed me'. David, Mark, Ben: nothing logged."
```

### Tap action

Tapping the notification opens the Coach Portal directly to a Digest View — a one-screen recap matching the body's content but with tap-through links to each client.

### Files involved

- New cron job: probably an edge function `supabase/functions/coach-daily-digest/`.
- `js/push-notifications.js` (existing) — extend with `sendCoachDigest(coachId, digestBody)`.
- New `coach_digest_log` table to dedup.

---

## Edge cases & error handling

| Scenario | Handling |
|---|---|
| Coach is removed (admin deactivates) | All `coaching_assignments.active` flip to false. Coach's view of clients goes empty. Coach-assigned future workouts on client calendars are kept but tagged "from former coach" — client can delete or keep. |
| Client deletes account | `coaching_assignments` cascade-deletes (client_id → on delete cascade). Coach's library and programs unaffected. Coach sees client disappear from their list. |
| Coach deletes account | `coaching_assignments` cascade-deletes. Clients lose coach attribution but keep workouts already on their calendar. Future-dated coach-assigned workouts: kept, tagged "from former coach." |
| Coach tries to access client data they're not assigned to | RLS blocks at DB level. App-side: client list never surfaces unassigned users. |
| Coach is also a client of another coach | Both relationships co-exist independently. Profile screen shows both "Coach Portal" entry AND "Coached by [name]" line. No conflict. |
| Sub-coach tries to remove primary coach or another sub | RLS blocks. UI hides the remove button. |
| Two sub-coaches simultaneously edit the same workout | Last write wins. Add `updated_at` timestamps; show a "[name] last edited [time]" line on coach-assigned workouts in the editor. Defer optimistic locking to v2. |
| Client's plan is frozen, then coach is removed | Plan stays frozen (the `client_plan_freeze` row is independent). Admin can unfreeze manually. UI flag for clients in this limbo state. |
| Coach assigns a multi-week program but client's race date is sooner than the program's duration | Program assignment cuts off at race date. Surface a warning at assignment time: *"Sarah's race is in 4 weeks — this 8-week program will be truncated."* |
| Coach sees PRs but the user wants them private | Document for v1: PRs are visible to coach, full stop. v2 might add a per-PR private flag if user demand surfaces. |

---

## Phasing & ship plan

The full feature is ~3 weeks of work. Break it into 5 phases. Each phase is a shippable milestone — Chase can validate before phase N+1 starts.

### Phase 1 — Foundation (4–6 days)
**Outcome:** Admin can promote coaches, assign clients, and review coach requests. Users can submit a coach request. No coach UI yet — admin does everything via the Admin Portal.

- Supabase migrations: profiles.is_coach, coaching_assignments, coach_requests, RLS policies, helper function.
- Email service integration (Resend recommended — see Request a Coach section).
- Admin Portal: Coaches tab with two sub-tabs:
  - **Roster** — promote-to-coach, assign-client, remove-assignment flows.
  - **Requests** — view pending requests, match-to-coach, archive.
- Profile screen: "Request a Coach" button + 4-question form modal.
- Edge function: `send-coach-request-email` — sends email to ironzsupport@gmail.com AND writes Supabase row.
- Smoke test: admin promotes user, assigns client, RLS query confirms coach can read client's training table. Submit a request as a non-coach user and verify the email arrives + the Supabase row appears in the admin Requests tab.

### Phase 2 — Coach Portal Read-Only (3–5 days)
**Outcome:** Coach sees clients but can't assign workouts yet.

- Profile screen Coach Portal entry card.
- Coach dashboard: client list, today's queue, race-day banner.
- Client detail page: read-only calendar, benchmarks tab, feedback timeline.
- No write actions.

### Phase 3 — Workout Assignment (5–7 days)
**Outcome:** Coach can write workouts onto a client's calendar.

- Coach-assigned workouts table + Supabase mirror to workoutSchedule.
- Build-from-scratch (reuses Bug 9's exercise row component).
- Pick from coach's library.
- Edit existing AI-generated workout.
- Conflict resolution modal (replace / stack / freeze).
- Per-workout coach note (one-way).
- Client side: workout card shows "FROM MARK" badge + note.

### Phase 4 — Library, Programs, Notifications (4–6 days)
**Outcome:** Coach has workflow tools and gets a daily digest.

- Coach workout library CRUD.
- Multi-week program editor + bulk-assign-to-client flow.
- Daily digest cron job + push notification.
- Coach digest log table.

### Phase 5 — Polish + Edge Cases (3–4 days)
**Outcome:** All edge cases from the table above are handled.

- Coach removal flow (deactivate, "from former coach" tagging).
- Sub-coach UI (assign sub-coach, sub-coach can't promote/remove).
- Plan-freeze flag wiring into AI plan generator.
- Coach-as-client polish (both entry cards visible).
- Regression testing on RLS — confirm coach can't see meals, hydration, body comp.

**Ship gates:**
- After Phase 1: I (Chase) can promote myself to coach via SQL and assign myself a test client. RLS works.
- After Phase 2: Coach can see a client's calendar end-to-end with no errors.
- After Phase 3: Coach can replace one workout. Client sees it. End-to-end happy path works.
- After Phase 4: Daily digest fires for at least one test coach.
- After Phase 5: Edge cases pass; ready for first real coach.

---

## "Request a Coach" — lead-gen entry point

Adds a button to the Profile / Settings screen that lets users request to be paired with a coach. Modeled on the existing **Get Support** button. Behavior: tap → 4-question form → submit → sends email to `ironzsupport@gmail.com` AND writes a row to a `coach_requests` table in Supabase (so you have a pending-requests view in the Admin Portal).

### Where it lives

Profile screen, **dedicated card** above the About section, styled like the Coach Portal entry card (purple `--color-coach` heading, primary CTA button). Sits in the same vertical group as Admin Portal entry → Coach Portal entry → Request a Coach → Athlete Profile.

```
[ Profile screen ]
  ┌── Admin Portal ──────────────────────────┐ (only if role=admin)
  └──────────────────────────────────────────┘
  ┌── Coach Portal ──────────────────────────┐ (only if is_coach=true)
  └──────────────────────────────────────────┘
  ┌── Want a coach? ─────────────────────────┐ (hidden when already coached)
  │  Get matched with an IronZ coach ...     │
  │  [ Request a Coach ]                     │
  └──────────────────────────────────────────┘
  ┌── Athlete Profile ───────────────────────┐
  ...
```

**Visibility rules** (initCoachVisibility() in js/coach-request-flow.js, fired after auth ready alongside initAdminVisibility):

- **Coach Portal card**: shown when `profiles.is_coach = true` for the current user. Phase 1 ships the markup; the Open button is wired in Phase 2.
- **Want a coach? card**: shown to all users EXCEPT those who already have an active coaching_assignments row as a client (`active=true AND client_id=auth.uid()`). A coached athlete doesn't need to ask for a coach again. The card stays hidden until the relationship is deactivated, at which point the next auth tick re-enables it.
- Both cards default to `display:none` in markup so a slow initCoachVisibility doesn't flash them in for the wrong user.

Visible to all eligible users (free + premium). Premium status surfaces in the email + DB row but doesn't gate access.

### The form (4 questions, ~30 seconds to fill)

```
┌── Request a Coach ──────────────────────────────┐
│                                                  │
│  Primary sport / focus                           │
│  ◯ Running                                       │
│  ◯ Cycling                                       │
│  ◯ Swimming                                      │
│  ◯ Triathlon                                     │
│  ◯ Strength training                             │
│  ◯ Hyrox                                         │
│  ◯ General fitness                               │
│  ◯ Other                                         │
│                                                  │
│  Primary goal                                    │
│  ◯ Train for a specific race                     │
│  ◯ Build general fitness                         │
│  ◯ Body composition (lose fat / gain muscle)     │
│  ◯ Performance / hit a benchmark                 │
│  ◯ Return from injury                            │
│  ◯ Other                                         │
│                                                  │
│  Experience level                                │
│  ◯ Beginner — getting started                    │
│  ◯ Intermediate — training consistently          │
│  ◯ Advanced — racing or peaking                  │
│                                                  │
│  Anything else? (optional, max 500 chars)        │
│  ┌──────────────────────────────────────┐       │
│  │ e.g. specific race date, equipment,  │       │
│  │ injury history, schedule constraints │       │
│  └──────────────────────────────────────┘       │
│                                                  │
│                              [ Cancel ]  [ Send ]│
└──────────────────────────────────────────────────┘
```

Validation: sport, goal, experience are required. Free-text is optional and capped at 500 chars.

### Confirmation after submit

```
✓ Request sent

We'll review your request and match you with a coach within
48 hours. You'll get an email at <user's email> when we have
someone for you.

                                              [ Done ]
```

### Email format (sent to ironzsupport@gmail.com)

```
From: noreply@ironz.app
To: ironzsupport@gmail.com
Subject: REQUEST COACH

New coach request from a user.

USER
  Name:           Sarah Chen
  Email:          sarah.chen@gmail.com
  Plan:           Premium     ← flagged per Chase's decision
  Account age:    37 days
  User ID:        abc-123-def

REQUEST
  Sport:          Running
  Goal:           Train for a specific race
  Experience:     Intermediate — training consistently
  Notes:
  "Marathon in October, training 5 days/week, never had a coach before.
   Current PR is 3:42, hoping for sub-3:30."

NEXT STEPS
  • Reply to this email or assign a coach via the Admin Portal:
    https://ironz.app/admin/coach-requests/req-uuid-here
```

Subject line `REQUEST COACH` (literal, all caps, no prefix) so you can filter / set up Gmail rules easily.

### Supabase table

```sql
create table public.coach_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  sport           text not null check (sport in ('running','cycling','swimming','triathlon','strength','hyrox','general_fitness','other')),
  goal            text not null check (goal in ('race','general_fitness','body_comp','performance','injury_return','other')),
  experience      text not null check (experience in ('beginner','intermediate','advanced')),
  notes           text,
  premium_at_request boolean not null default false,
  status          text not null default 'pending' check (status in ('pending', 'matched', 'declined', 'archived')),
  matched_coach_id uuid references auth.users(id),
  matched_at      timestamptz,
  archived_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index coach_requests_status_idx on public.coach_requests (status, created_at desc);
create index coach_requests_user_idx on public.coach_requests (user_id);

-- RLS
alter table public.coach_requests enable row level security;

create policy "Users can create their own request"
  on public.coach_requests
  for insert
  with check (user_id = auth.uid());

create policy "Users can view their own requests"
  on public.coach_requests
  for select
  using (user_id = auth.uid());

create policy "Admins can view all requests"
  on public.coach_requests
  for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
```

### Admin Portal — new "Coach Requests" sub-tab

Inside the Coaches tab (added in Phase 1), add a sub-section or tab:

```
[ Admin Panel · Coaches ]
  [ Roster ]   [ Requests (3) ]
                ─────────────

  PENDING (3)
  ─────────────────────────────
  Sarah Chen · Running / Race / Intermediate · 2 days ago
  "Marathon in October..."
  [ View ]  [ Match to coach ]  [ Archive ]

  Mark Davis · Strength / Body comp / Beginner · 4 days ago
  "Want to lose 20 lbs..."
  [ View ]  [ Match to coach ]  [ Archive ]

  ...

  MATCHED (12)  · view archive ·
```

Match action opens a modal: pick a coach (must have `is_coach: true`), write an optional intro note. Confirms → creates `coaching_assignments` row → marks request `status: 'matched'` → optionally sends a welcome email to client.

### Files involved

- New Supabase migration: `supabase/migrations/20260428_coach_requests.sql` (combine with the main coaching schema migration if you want one file).
- New edge function: `supabase/functions/send-coach-request-email/index.ts` — receives the form payload, sends email via SendGrid/Resend/etc., writes the Supabase row in the same transaction (or returns an error if either fails).
- `js/coach-request-flow.js` — new module for the modal form.
- `js/admin.js` — extend with the Requests sub-tab.
- `index.html` — add the "Request a Coach" button in Profile screen + the form modal markup.

### Phase placement

Goes in **Phase 1** of the coaching ship plan — it's standalone (doesn't depend on the coach portal existing), low risk, and gives you immediate signal on demand for the feature even before the rest is built.

Updated Phase 1 outcome: *"Admin can promote coaches and assign clients. Users can request a coach. No coach UI yet."*

### Email service

You'll need to pick one. Options:
- **Resend** (recommended) — 3K emails/mo free, dead-simple API, ~10 min to integrate.
- **SendGrid** — incumbent, more complex, free tier available.
- **Supabase + SMTP** — use a personal Gmail SMTP. Free but flaky and Gmail rate-limits aggressively.

Recommend Resend. Sign up, get an API key, add to Supabase secrets, the edge function calls `resend.emails.send(...)` and we're done.

---

## Out of scope for v1 (parking lot)

These came up but were intentionally cut. Document so we don't lose them:

- Threaded messaging (full chat) between coach and client.
- Real-time push when client completes a workout (we picked daily digest only).
- Coach-marketplace style discovery (clients browsing coaches).
- Per-PR or per-data-type privacy toggles.
- Negative-weight handling for assisted machines (already deferred from Bug 9).
- Coach billing / monetization — separate product question.
- Group coaching (one-to-many sessions, e.g. team workouts).
- Video upload / form review.
- Coach-to-coach handoff workflow.

---

## Open questions for Chase before kickoff

A few minor calls I'd like locked before Phase 1 starts:

1. **Time zone for daily digest:** Sent at 7 AM in the coach's local time, or all coaches at the same UTC moment? (Recommendation: coach's local time. Existing push notification infra likely supports this; verify.)
2. **Coach attribution color:** A coach-specific accent color (recommend a purple — distinct from brand red) for the "FROM MARK" badge and Coach Portal entry card. OK to introduce a new accent color?
3. **What happens when admin removes the LAST coach for a frozen client?** Currently: plan stays frozen until admin manually unfreezes. Alternative: auto-unfreeze on last-coach-removal. (Recommendation: auto-unfreeze.)
4. **First coach for testing:** Which user account becomes coach #1 for end-to-end testing? Recommend creating a `coach.test@ironz.app` test account separate from your Chase admin account so you can test the dual-account flow.
5. **Coach's client cap:** Soft cap on number of clients per coach? Most platforms cap at 50–100 to prevent runaway state. Recommend a soft warning at 50, hard cap at 200.

If those four are good answers from you in the morning, Phase 1 can start the same day.

---

## File-creation summary (for the coder)

New files:
- `supabase/migrations/20260428_coaching_schema.sql` — all the table + RLS work (coaching_assignments, coach_assigned_workouts, coach_workout_library, coach_programs, client_plan_freeze, coach_digest_log, coach_requests).
- `supabase/functions/coach-daily-digest/index.ts` — the cron-triggered edge function.
- `supabase/functions/send-coach-request-email/index.ts` — handles "Request a Coach" form submissions (email + DB row).
- `js/coach-portal.js` — main module.
- `js/coach-dashboard.js` — dashboard rendering.
- `js/coach-client-detail.js` — client detail page.
- `js/coach-library.js` — workout library.
- `js/coach-programs.js` — programs.
- `js/coach-assignment-flow.js` — the conflict-resolution flow + assignment UI.
- `js/coach-notifications.js` — digest dispatch on the client side (the cron is server-side).
- `js/coach-request-flow.js` — "Request a Coach" form modal.

Modified files:
- `js/admin.js` — Coaches tab logic.
- `index.html` — markup for new screens (Coaches tab, Coach Portal entry card, Coach Portal screens).
- `style.css` — coach-specific styles (purple accent, new badges).
- `js/push-notifications.js` — coach digest hook.
- `js/calendar.js` — render `coachAssigned` workouts with attribution.
- `js/onboarding-v2.js` plan generator — respect `client_plan_freeze` flag.

Tests (also separately deferred to fix the existing test harness gap):
- `tests/coaching-rls.test.js` — coach can read training data, cannot read meals/hydration/body comp.
- `tests/coach-conflict-resolution.test.js` — replace/stack/freeze produce expected calendar states.
- `tests/coach-digest-format.test.js` — body templates produce correct strings under each scenario.

---

That's the spec. Total scope ~3 weeks of careful work across 5 phases. Phase 1 is the highest-risk piece (RLS) but also the fastest to ship and validate. I'd start there and let me know what the Phase 1 demo looks like before phase 2 begins.
