# Coaching Feature — Real-World Testing Checklist

## How to use this

You'll switch between three accounts (admin, test coach, test client) across one or two devices. For each item, perform the exact action listed, observe what happens, and record any gaps or bugs in the Issue Capture section at the end. Mark severity: P0 (feature broken), P1 (core flow blocked), P2 (visual/UX), P3 (polish). Work through phases sequentially — don't skip ahead. Aim to complete a phase per session so you can validate each milestone before starting the next.

---

## Pre-test setup

- [ ] Create or identify three accounts: **admin** (your main account), **coach-test** (separate account to test Coach Portal), **client-test** (athlete to receive coaching).
- [ ] Both `is_coach` and `coaching_assignments` feature toggles are enabled in the app and database.
- [ ] Log into Supabase: verify all new tables exist (`coaching_assignments`, `coach_assigned_workouts`, `coach_workout_library`, `coach_programs`, `client_plan_freeze`, `coach_digest_log`).
- [ ] Test credentials are saved: you'll switch accounts multiple times. Have passwords or SSO ready.
- [ ] Optional: open browser Dev Tools Console before each phase to catch any JS errors.

---

## Test as: Admin

- [ ] Open Admin Portal → confirm new **Coaches** tab exists (should be fourth tab next to Users/Philosophy/Exercises/Workouts).
- [ ] Coaches tab shows header: "TOTAL COACHES: X ACTIVE ASSIGNMENTS: Y".
- [ ] Click **[+ Promote user to coach]** → modal appears. Pick a non-admin user, click promote → that user now appears in the Coaches list with `is_coach: true`.
- [ ] Tap the newly promoted coach → roster expands. Confirm it shows section "▾ [Coach Name] (0 clients)" with [+ Assign client] button below.
- [ ] Click [+ Assign client] → modal opens. Pick an athlete (not another coach). Confirm role dropdown shows "primary" and "sub" options. Select "primary", then Confirm.
- [ ] Verify the athlete now appears under that coach in the roster: "[Athlete Name] (primary, since [date])".
- [ ] Tap the athlete row → verify a remove (×) button appears. Click it. Confirm athlete disappears from roster and a "deactivated_at" timestamp is set in database.
- [ ] Assign the same athlete as "sub-coach" to a different coach. Verify the athlete can appear under two coaches (primary + sub relationship).
- [ ] Navigate to Admin Portal → Users tab. Find the newly promoted coach. Confirm a "Coach" badge or tag appears next to their name (or note if missing — known polish item).
- [ ] Switch to **Coach Portal view** (still logged in as admin). Verify you can see Coach Portal entry card on Profile screen alongside Admin Portal card.

---

## Test as: Coach

**Account: coach-test. Pre-requisite: Admin has already assigned coach-test two test athletes.**

- [ ] Log in as coach-test. Navigate to Profile → confirm Coach Portal entry card appears and says "X clients" in the summary.
- [ ] Click Coach Portal entry card → Coach Portal dashboard loads. Verify header shows "Coach Portal · [Coach Name]" with Exit button.
- [ ] Verify three sections render: **TODAY'S QUEUE** (workouts assigned for today), **RACE DAYS** (upcoming race events), **CLIENTS** (list of assigned athletes).
- [ ] TODAY'S QUEUE shows "X workouts assigned · Y completed · Z pending" counter at the top.
- [ ] Scroll down to CLIENTS section. Verify both test athletes appear as cards. Each card shows: name, last completed workout + feedback emoji, 4-week completion %, [Open ›] button.
- [ ] Tap a client card → Client Detail page loads. Confirm header shows client name, "since [date]", and "primary coach" label.
- [ ] Client Detail shows tabs: **Calendar**, **Benchmarks**, **Feedback**. Click each tab to confirm they load without errors.
- [ ] Click Calendar tab. Verify a week-view calendar renders with Mon–Sun. Show left/right arrows to navigate weeks. Confirm [+ Assign] button exists on the calendar view.
- [ ] On calendar, verify AI-generated workouts show with standard styling (no coach badge). Scroll to see multiple days of workouts.
- [ ] Click Benchmarks tab. Verify a list of PRs appears (e.g., "Bench: 185", "Run Threshold Pace: 6:40/mi"). Confirm it's read-only (no edit mode in Phase 2).
- [ ] Click Feedback tab. Verify a timeline of past feedback (effort emojis + notes) appears. Confirm it shows recent entries only (past 14 days by default).
- [ ] Return to Coach Dashboard. Click **[+ Quick Assign Workout]** button → assignment flow modal opens.
- [ ] In the assignment flow, confirm a client dropdown appears. Select a client.
- [ ] Confirm a date picker appears. Select a date that currently has NO workout. Click Next.
- [ ] Confirm you can "Build from scratch" → a blank exercise row appears (reuses existing Bug 9 exercise component).
- [ ] Add a sample exercise (e.g., "Run 30 min @ easy pace"). Confirm you can set duration, zone, etc.
- [ ] Confirm a "Coach note" text field appears below the workout details. Type a test note: "Push the pace on the second half."
- [ ] Click Confirm → workout is assigned. Client Detail calendar updates to show the new workout with "FROM [Coach Name]" badge and the note visible.
- [ ] Verify the assigned workout card shows: exercise name, duration, your badge, note text. Tap it to view full details.
- [ ] Return to Coach Dashboard. Verify the assigned workout now appears in TODAY'S QUEUE if the date was today, or in the client's calendar for future dates.
- [ ] Assign a second workout to a date that ALREADY has one → conflict resolution modal appears.
- [ ] Confirm modal text: "Client has [existing workout name] planned for [date]. What should happen?"
- [ ] Verify three options: **Replace** ("Your workout replaces the AI's"), **Stack** ("Both workouts on the same day"), **Freeze AI plan from this date forward**.
- [ ] Select **Replace** → confirm the new workout replaces the existing one in the calendar.
- [ ] Assign a third workout to another existing-workout date. This time select **Stack** → confirm both workouts appear on the same day.
- [ ] Assign a fourth workout and select **Freeze AI plan from this date forward** → confirm UI shows a freeze indicator on the client's profile (e.g., "Plan frozen since [date]").
- [ ] Verify that after freeze, AI-generated workouts no longer appear on this client's calendar (they stop generating).
- [ ] Return to Coach Dashboard. Verify Coach Dashboard stats update (e.g., "X workouts assigned this week").
- [ ] Log out. Re-log in as coach-test. Verify Coach Portal state persists (clients and workouts still visible, no data loss).

---

## Test as: Client

**Account: client-test. Pre-requisite: coach-test has assigned at least two workouts.**

- [ ] Log in as client-test. Navigate to Profile → confirm a line appears: "Coached by [coach name]". This is read-only (no tapping/editing).
- [ ] Go to Home/Calendar view. Confirm you see your AI-generated workouts AND coach-assigned workouts mixed on the calendar.
- [ ] Find a coach-assigned workout. Confirm it shows: **"FROM [Coach Name]"** badge above the workout title, followed by the coach's note in muted text.
- [ ] Tap the coach-assigned workout → live tracker / full details view loads. Confirm the badge and note are still visible. Workout is otherwise editable as normal.
- [ ] Complete the workout (go through the standard completion flow). Log effort feedback (e.g., "just right").
- [ ] Confirm the completed workout shows a green checkmark on the calendar. Coach badge + note remain visible.
- [ ] Navigate back to Profile → "Coached by [coach name]" line. Tap it (or confirm it's informational, not a link in Phase 2).
- [ ] Verify you CANNOT see: coach's name elsewhere on the app, list of other clients, coach's settings, coach's library.
- [ ] Verify you CAN see: workouts assigned to you, the coach's note on each, your own completion data, your own benchmarks.
- [ ] Return to home screen. Verify nutrition settings, hydration data, meal logs are NOT visible to the coach (if you scroll Profile, you should see these remain private).
- [ ] Log out. Re-log in. Verify coach attribution and assigned workouts persist.

---

## Cross-role / data integrity tests

- [ ] **Deactivate coach mid-session:** Log in as admin. Remove coach-test from client-test's coaching relationship (click [×] on the roster). Log in as coach-test → Client Detail page fails to load or shows "You no longer coach this client."
- [ ] **Verify RLS boundary — nutrition data:** Temporarily promote admin account to coach role. Try to access another user's `meals` data via Supabase SQL Editor. Query should return 0 rows (RLS blocks). Then try a `workoutSchedule` query — should return rows if the user has any.
- [ ] **Verify RLS boundary — personal records:** Coach can read client's `personalRecords`. Confirm in Supabase: `select * from user_data where user_id = '<client-uuid>' and data_key = 'personalRecords'` returns rows. Same query with `data_key = 'meals'` returns 0 rows.
- [ ] **Data consistency across devices:** Assign a workout on desktop (as coach). Switch to mobile browser (stay logged in as coach). Refresh. Confirm the new workout appears immediately.
- [ ] **Plan freeze persists:** Assign a workout with "Freeze" conflict mode as coach. Log out as coach, log in as client. Verify AI plan no longer generates new workouts beyond the freeze date. Switch back to coach account — freeze is still active.

---

## Known polish items (already flagged — don't re-report)

- [ ] Users tab missing Coach badge next to coach's name (admin Portal). Noted for Phase 5 UI polish.
- [ ] Coach requests feature not yet built — "Request a Coach" button not on Profile (Phase 1 feature, may ship separately).
- [ ] Coach Portal sub-tabs (Workout Library, Programs) not yet implemented. (Phase 4 feature.)
- [ ] Daily digest notification won't fire until Phase 4 cron is deployed.
- [ ] Coach Portal Nutrition & Hydration tab read-only in Phase 2, write-mode edit buttons come in Phase 3.
- [ ] Sub-coach UI doesn't prevent sub-coach from viewing primary-coach removal button (fine for Phase 2, enforced in Phase 3).

---

## Issue Capture Template

For each bug or unexpected behavior, log it here or in a separate file with this format:

```
ISSUE #[N]
Severity: [P0 / P1 / P2 / P3]
Area: [Admin Portal | Coach Portal | Client Experience | RLS/Data | Cross-role]
Title: [One-line summary]

Steps to reproduce:
1. [Action]
2. [Action]
3. [Observed result]

Expected:
[What should happen]

Actual:
[What happened instead]

Screenshot path (if applicable):
[/path/to/screenshot.png]

Notes:
[Additional context, browser/device, etc.]
```

**Example:**

```
ISSUE #1
Severity: P1
Area: Coach Portal
Title: Client Detail Calendar doesn't load after tapping second client

Steps to reproduce:
1. Coach Portal → tap Client A
2. Client A detail page loads
3. Tap back, tap Client B
4. Client B detail page fails to load, shows blank screen

Expected:
Client B's calendar loads in <1 second

Actual:
Page is blank, browser console shows "Cannot read property 'workoutSchedule' of undefined"

Screenshot path:
/Users/chasezernich/Desktop/bug-client-b-detail.png

Notes:
Happens only on second client. First client loads fine. Chrome 125, macOS 15.
```

---

## Completion Checklist

- [ ] All Admin tests passed (10 items).
- [ ] All Coach tests passed (22 items).
- [ ] All Client tests passed (10 items).
- [ ] All Cross-role tests passed (5 items).
- [ ] No P0 or P1 severity bugs open (P2/P3 OK for follow-up sprint).
- [ ] **Phase milestone:** Coaching feature is ready for soft-launch to one real coach + one real client.
