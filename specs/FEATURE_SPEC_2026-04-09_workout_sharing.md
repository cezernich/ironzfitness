# Feature Spec: Workout Sharing & Personal Library

**Date:** 2026-04-09
**Type:** Feature Spec (not Philosophy Update)
**Status:** Ready for Claude Code execution
**Depends on:** PHILOSOPHY_UPDATE_2026-04-09_workout_diversification (variant libraries must exist)

---

## Summary

Add peer-to-peer workout sharing to IronZ. A user can share any library-variant workout to a friend via link. The receiver sees the workout rendered in their own zones (not the sender's), and can either save it to a personal library or add it directly to a chosen day. A new Inbox tab holds workouts shared with the user; a new Saved Library tab holds the user's personal collection of workouts they've tagged from the built-in library or received via sharing.

This is ~90% new feature surface. It reuses the existing variant libraries, zone calculation, and workout validator. It does not change how training plans are generated.

---

## Philosophy Addendum (Small)

Two rules are added to the IronZ training philosophy. Both are natural extensions of existing principles — they codify behavior the philosophy already implies but hasn't stated explicitly.

**Rule 1 — Library Provenance:** All workouts entering a user's plan must trace back to a canonical variant in the library. Regardless of source (deterministic rotation, AI variant selector, manual session picker, shared workout, or saved library entry), every workout on a user's schedule must have a `variant_id` that exists in the current library. Workouts without a valid `variant_id` are rejected at the validation layer and never reach the plan. This extends the "no invented workouts" rule to a new input path.

**Rule 2 — Zone Locality:** A shared workout is always rendered through the receiving user's zone table, never the sender's. Sender paces, watts, times, VDOT, FTP, CSS, and any health data never leave the sender's device. Only the workout's abstract structure — variant_id, interval counts, intensity labels — is transmitted. The receiver's client recomputes every concrete number locally using their own zones.

These rules apply to all modalities (run, bike, swim, strength, hybrid) and supersede any future feature that would move pace or health data between users.

---

## Architectural Overview

```
SENDER                                            RECEIVER
------                                            --------
Tap share on workout card                          Tap deep link
       ↓                                                  ↓
WorkoutSharingFlow.createShare()                  DeepLinkHandler.route()
       ↓                                                  ↓
WorkoutSharingPrivacy.scrub()                     WorkoutLinkService.fetch()
       ↓                                                  ↓
WorkoutLinkService.mintToken()                    WorkoutImportValidator.check()
       ↓                                                  ↓
Supabase insert → shared_workouts                 Show preview in receiver zones
       ↓                                                  ↓
Return share_url to UI                            User taps "Save" OR "Schedule"
                                                         ↓
                                                  SharedWorkoutsInbox (all received)
                                                  SavedWorkoutsLibrary (curated set)
                                                         ↓
                                                  On completion:
                                                  WorkoutCompletionNotification → sender
```

---

## Data Model

### Table: `shared_workouts`

The canonical record for a share. Created on sender tap-to-share.

```sql
CREATE TABLE shared_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text UNIQUE NOT NULL,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What's being shared (library references only, no actual paces)
  variant_id text NOT NULL,
  sport_id text NOT NULL CHECK (sport_id IN ('run', 'bike', 'swim', 'strength', 'hybrid')),
  session_type_id text NOT NULL,

  -- Optional sender note (free text, 280 char max, stripped of URLs)
  share_note text CHECK (length(share_note) <= 280),

  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz,

  -- Analytics counters (updated via triggers, not client writes)
  view_count int NOT NULL DEFAULT 0,
  import_count int NOT NULL DEFAULT 0,
  completion_count int NOT NULL DEFAULT 0
);

CREATE INDEX idx_shared_workouts_token ON shared_workouts(share_token);
CREATE INDEX idx_shared_workouts_sender ON shared_workouts(sender_user_id, created_at DESC);
CREATE INDEX idx_shared_workouts_expiry ON shared_workouts(expires_at) WHERE revoked_at IS NULL;
```

**RLS:**
- Anyone (authenticated or anon) can SELECT rows by `share_token` if `expires_at > now()` and `revoked_at IS NULL`. Row must return only public fields: `variant_id`, `sport_id`, `session_type_id`, `share_note`, `created_at`, sender display name/avatar via join.
- Only `sender_user_id` can UPDATE their own row (to set `revoked_at`).
- No DELETE from client — revoked rows stay for audit. Cleanup via server-side cron.

### Table: `workout_share_imports`

Records each time a receiver imports a shared workout.

```sql
CREATE TABLE workout_share_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token text NOT NULL REFERENCES shared_workouts(share_token),
  receiver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What the receiver chose
  action text NOT NULL CHECK (action IN ('saved_to_library', 'scheduled', 'dismissed')),
  scheduled_for_date date,
  saved_workout_id uuid REFERENCES saved_workouts(id),

  imported_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completion_delta_percent numeric
);

CREATE INDEX idx_share_imports_receiver ON workout_share_imports(receiver_user_id, imported_at DESC);
CREATE INDEX idx_share_imports_token ON workout_share_imports(share_token);
CREATE UNIQUE INDEX idx_share_imports_unique ON workout_share_imports(share_token, receiver_user_id)
  WHERE action != 'dismissed';
```

**RLS:**
- Only `receiver_user_id` can SELECT their own imports.
- Senders can SELECT aggregate counts only (join via share_token) — they never see which specific users imported.
- INSERT only by the receiver, validated via Supabase auth.

### Table: `saved_workouts`

User's personal library of workouts they want to reuse.

```sql
CREATE TABLE saved_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  variant_id text NOT NULL,
  sport_id text NOT NULL,
  session_type_id text NOT NULL,

  -- Provenance
  source text NOT NULL CHECK (source IN ('library', 'shared')),
  shared_from_user_id uuid REFERENCES auth.users(id),
  share_token text,

  custom_name text CHECK (length(custom_name) <= 80),
  saved_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX idx_saved_workouts_user ON saved_workouts(user_id, saved_at DESC);
CREATE UNIQUE INDEX idx_saved_workouts_unique ON saved_workouts(user_id, variant_id, source);
```

**RLS:** Only `user_id` can read/write their own rows. Full CRUD.

### Table: `pending_shares`

Holds share tokens for users who installed via a deep link but haven't finished onboarding.

```sql
CREATE TABLE pending_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint text NOT NULL,
  share_token text NOT NULL REFERENCES shared_workouts(share_token),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by_user_id uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_pending_shares_fingerprint ON pending_shares(device_fingerprint) WHERE claimed_at IS NULL;
```

Device fingerprint is a stable hash computed client-side on first launch (does not include PII). Pending shares auto-expire after 7 days if unclaimed.

### Migration File

`supabase/migrations/20260410_workout_sharing.sql` contains all four tables, RLS policies, indexes, and a cleanup cron.

---

## Module: `WORKOUT_SHARING_FLOW`

**File:** `js/workout-sharing-flow.js`

**Responsibility:** Orchestrate the sender side of the share flow.

**Public API:**

```js
async createShare({
  variantId,        // required, must match library
  sportId,          // required
  sessionTypeId,    // required
  note              // optional, max 280 chars
}) → { shareToken, shareUrl, expiresAt } | { error }
```

**Preconditions:**
1. User is authenticated.
2. `variantId` exists in the canonical variant library for `sportId` + `sessionTypeId`. Validated by reading from `js/variant-libraries/index.js`. If not found, return `{ error: 'INVALID_VARIANT' }` and surface to UI as "This workout can't be shared (legacy data)."
3. Rate limit check: max 20 shares per user per 24h rolling window. Beyond limit, return `{ error: 'RATE_LIMITED' }`.

**Side effects:**
1. Insert row into `shared_workouts` with privacy-scrubbed payload.
2. Mint token via `WorkoutLinkService.mintToken()`.
3. Emit analytics event `share_created` with `{ variant_id, sport_id, session_type_id }`.

**Never does:** Include sender's paces, zones, race history, health data, or completion splits in the payload. The table schema enforces this but the flow must also pass only whitelisted fields to the insert.

---

## Module: `WORKOUT_SHARING_PRIVACY`

**File:** `js/workout-sharing-privacy.js`

**Responsibility:** Single chokepoint that scrubs sender data before any share payload leaves the device. All share creation must pass through this module.

**Public API:**

```js
scrubForShare(workout) → PublicWorkoutPayload
```

**Whitelist (these fields are ALLOWED in the shared payload):**
- `variant_id`
- `sport_id`
- `session_type_id`
- `share_note` (sender-provided, max 280 chars, stripped of URLs and @mentions via regex)
- `sender_display_name` (added server-side via RLS join, not client-side)
- `sender_avatar_url` (ditto)

**Blacklist (these fields MUST be stripped if present):**
- Any VDOT, FTP, CSS, threshold pace, or zone table values
- Any actual paces, watts, heart rates, or cadences from the sender
- Any completion splits, actual times, or performance data
- Any race results or race goals
- Any health, weight, sleep, or wellness data
- Any user_data JSONB fields
- Any device identifiers or location data
- Sender's email, real name, or any PII beyond public display name/avatar

**Enforcement:** The function uses an explicit whitelist — any field not in the whitelist is dropped regardless of origin. There is no blacklist-based filtering. If a new field is added to workout objects later, it is dropped from shares by default unless explicitly added to the whitelist.

**Test:** Unit test verifies that passing a fully-populated workout object through `scrubForShare` produces a payload containing exactly the whitelist fields and nothing else.

---

## Module: `WORKOUT_LINK_SERVICE`

**File:** `js/workout-link-service.js`

**Responsibility:** Mint, resolve, and revoke share tokens.

**Public API:**

```js
async mintToken() → string                    // 12-char URL-safe
async resolveToken(token) → SharedWorkout | { error: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' }
async revokeToken(token, userId) → { ok: true } | { error }
async listSharesBy(userId) → SharedWorkout[]  // outbound list for "Shared by me" view
```

**Token format:**
- 12 characters, base62 (0-9 + a-z + A-Z)
- Generated via `crypto.randomUUID()` then compressed to 12 chars via base62 encoding
- Collision check on insert with retry up to 3 times
- Example: `xKj9mN4pQr2s`

**Share URL format:**
- Universal link: `https://ironz.app/w/{token}`
- Deep link: `ironz://share/{token}` (for in-app sharing between IronZ users)
- The universal link is what gets copied; iOS automatically resolves it to the deep link if IronZ is installed

**Expiration:** Default 30 days from `created_at`. Configurable per-share in future; hardcoded to 30 for v1.

**Revocation:** Sets `revoked_at = now()`. The row stays for audit. Subsequent `resolveToken` calls return `{ error: 'REVOKED' }`. Clients render this as "This link was revoked by the sender."

---

## Module: `WORKOUT_IMPORT_VALIDATOR`

**File:** `js/workout-import-validator.js`

**Responsibility:** Validate a shared workout before the receiver can schedule it. Reuses the exact same validator logic as the built-in plan generator and AI variant selector — no new rules, no exceptions.

**Public API:**

```js
async validateImport({
  sharedWorkout,    // resolved payload from WorkoutLinkService
  receiverPlan,     // current 4-week plan from user_data
  targetDate        // proposed schedule date, or null for "save only"
}) → {
  canImport: boolean,
  canSave: boolean,       // always true unless variant doesn't exist
  conflicts: Conflict[],
  suggestedDate: date,    // best day in next 14 days if canImport is true
  scaledWorkout: ScaledWorkout  // rendered in receiver's zones
}
```

**Validation checks (in order):**
1. Variant existence: `variant_id` must exist in the canonical library for the sport/session type. If not, `canSave = false` and hard reject with reason `'INVALID_VARIANT'`.
2. Session type fit: max 3 hard sessions per week rule. If adding this would exceed it, flag conflict `'WEEKLY_STRESS_LIMIT'`.
3. Back-to-back hard: no hard session immediately after another hard session. Conflict `'BACK_TO_BACK_HARD'`.
4. 24h-before-long-run: no hard session within 24h of a long run. Conflict `'PRE_LONG_RUN'`.
5. Duplicate check: same variant in user's plan or completed log within last 14 days. Conflict `'RECENTLY_DONE'` (warning, not hard block).
6. Long run cap: only one long run per week, no override. Conflict `'LONG_RUN_CAP'`.

**Important:** This module does NOT have its own copy of the rules. It imports from `js/workout-validator.js` (the existing module). If rules change in one place, they change everywhere.

**Zone translation:** Produces `scaledWorkout` by calling `js/zone-calculator.js` with the receiver's VDOT/FTP/CSS — never the sender's. The sender's paces are not transmitted and cannot be referenced here.

---

## Module: `SHARED_WORKOUTS_INBOX`

**File:** `js/shared-workouts-inbox.js`
**UI file:** `js/ui/inbox-tab-view.js`

**Responsibility:** Present workouts that have been shared with the current user.

**Public API:**

```js
async listInbox() → InboxEntry[]
async markAsRead(entryId) → void
async dismiss(entryId) → void
async getUnreadCount() → number
```

**InboxEntry shape:**
```
{
  shareToken,
  senderDisplayName,
  senderAvatarUrl,
  variantId,
  sportId,
  sessionTypeId,
  variantName,        // looked up from library
  shareNote,
  receivedAt,
  status: 'unread' | 'read' | 'saved' | 'scheduled' | 'dismissed'
}
```

**UI:**
- New tab in main nav with badge showing unread count
- Cards sorted by most recent first
- Each card: sender avatar + name, sport icon, variant name, share note (if any), received timestamp, two primary actions
- Two actions per card: **Save to Library** and **Schedule**
- Swipe-left to dismiss (soft delete — sets status to dismissed, stays for 30 days)
- Empty state: "No shared workouts yet. When a friend shares a workout with you, it'll show up here."

**Notification wiring:** Tapping a push notification for a newly received share opens this tab and highlights the specific entry.

---

## Module: `SAVED_WORKOUTS_LIBRARY`

**File:** `js/saved-workouts-library.js`
**UI file:** `js/ui/saved-library-tab-view.js`

**Responsibility:** Personal collection of workouts the user has chosen to save for reuse.

**Public API:**

```js
async listSaved({ sport?, sessionType?, source? }) → SavedWorkout[]
async saveFromLibrary(variantId, sportId, sessionTypeId) → SavedWorkout
async saveFromShare(shareToken) → SavedWorkout
async removeSaved(savedId) → void
async renameSaved(savedId, customName) → SavedWorkout
async scheduleFromSaved(savedId, targetDate) → void
```

**UI:**
- New tab in main nav (alongside Plan, Inbox, Profile)
- Filters at top: All, Run, Bike, Swim, Strength, Hybrid + "Shared with me" toggle
- Grid or list of cards, each showing variant name, sport icon, saved date, source indicator (library icon vs. share icon)
- Tap a card → preview modal with "Schedule" and "Remove" actions
- Empty state: "Save workouts from the library or from friends' shares to build your own collection."

**Save flows:**
1. From built-in library: tap the bookmark icon on any variant card in the main library browser. Saves with `source: 'library'`.
2. From Inbox: tap "Save to Library" on an inbox entry. Saves with `source: 'shared'` and records `shared_from_user_id` + `share_token`.
3. Duplicates: saving the same variant twice is a no-op (updates `saved_at` but doesn't create a new row). Unique index on `(user_id, variant_id, source)` enforces this.

**Scheduling from saved:** Calls the same `WorkoutImportValidator` as the inbox path. A saved workout is not exempt from conflict checks when scheduling.

---

## Module: `WORKOUT_COMPLETION_NOTIFICATION`

**File:** `js/workout-completion-notification.js`

**Responsibility:** When a receiver completes a workout they received via share, push a notification to the sender.

**Trigger:** Hook into the existing workout completion flow. On marking a workout complete, check if it has a `shared_from_token` field. If yes, enqueue a notification job.

**Notification payload:**
```
Title: "{ReceiverName} ran your shared workout"
Body: "{VariantName} · {Completion delta vs target}"
Example: "Sarah ran your Yasso 800s · 6×800 @ 3:27 (2s faster than target)"
Data: { shareToken, variantId, deltaPercent }
```

**Privacy:** The notification body contains ONLY the variant name, interval summary, and a single delta statistic. No splits, no heart rate, no cadence, no date of completion beyond "today/yesterday." The sender does not see the receiver's full workout data — just the fact of completion and a headline stat.

**Transport:** Supabase Edge Function `notify-share-completion` that takes `{ share_token, receiver_delta }`, looks up sender, and pushes via the existing notification service. No client-side sender-lookup (keeps receiver anonymous to client code).

**Rate limit:** Max one notification per share per receiver per 24 hours. Prevents notification spam if a receiver repeats the workout quickly.

---

## Module: `DEEP_LINK_HANDLER`

**File:** `js/deep-link-handler.js`

**Responsibility:** Route inbound share links into the right app state.

**Handled URLs:**
- `https://ironz.app/w/{token}` (universal link, works whether app is installed)
- `ironz://share/{token}` (custom scheme, only if app installed)

**Logic:**

```
1. Parse token from URL.
2. Check if user is authenticated.
   a. If yes: call WorkoutLinkService.resolveToken(token)
      - If resolved: route to SharedWorkoutPreviewModal with payload
      - If error (expired/revoked/not found): show appropriate error modal
   b. If no (guest on web): serve WEB_PREVIEW_PAGE
3. If user installs from web preview and launches app:
   - On first app launch, check pending_shares table by device_fingerprint
   - If a pending share exists, resolve it and route to the preview modal
     after onboarding completes (not before)
```

**Onboarding interaction:** The pending share is stashed in memory during onboarding and surfaced on the last step of onboarding ("Chase shared a workout with you — we'll add it after you set up your zones"). This becomes a concrete onboarding win state.

**Handoff to UI:** The deep link handler never renders UI itself. It routes to existing UI modules with the resolved payload.

---

## Module: `WEB_PREVIEW_PAGE`

**File:** Supabase Edge Function `supabase/functions/share-preview/index.ts`

**Responsibility:** Serve an HTML preview of a shared workout to non-users (or users not yet logged in on web).

**URL:** `https://ironz.app/w/{token}` resolves to this function.

**Output:** Static HTML with:
- Sender display name and avatar (from Supabase join)
- Variant name and generic structure (intervals, intensities as labels like "I-pace", not concrete paces)
- Share note if present
- App Store / Play Store badges
- Single CTA: "Install IronZ to run this in your zones"
- On install + onboarding completion, the app auto-resumes the share flow via `pending_shares` table

**Privacy:** The web preview does NOT compute or display any concrete paces. The workout shown is generic structure only. The sender's paces are not computable because the edge function has no access to sender VDOT — that data never left the sender's device.

**No-auth design:** The edge function uses the public anon key scoped to read `shared_workouts` via RLS. No user session required.

**SEO:** Add OpenGraph tags so shares in Messages/Slack render a rich preview card.

---

## UI Spec

Refer to the clickable prototype at `workout-sharing-prototype.html` in the Ironz folder for exact visual treatment. The prototype is canonical for layout, copy, and interaction.

**New screens to build:**

1. **Share sheet modal** (sender) — bottom sheet with privacy labels (INCLUDED/PRIVATE), note toggle, generate link button
2. **Link ready sheet** (sender) — link preview, share options row (Messages / Copy / Mail / More)
3. **Shared workout preview modal** (receiver) — sender attribution, workout structure, zone translation card with Chase/You side-by-side, Save + Schedule actions
4. **Schedule calendar modal** (receiver) — 7-day calendar with suggested/conflict/existing color coding
5. **Conflict resolution modal** (receiver) — warning box, concrete alternatives (Move / Swap / Override)
6. **Inbox tab** — card list with swipe-to-dismiss, unread badge on tab icon
7. **Saved Library tab** — filter chips + card grid, tap-to-preview
8. **Web preview page** — standalone HTML rendered by edge function, install CTA

**Copy:** Use the exact strings from the prototype. "Your paces stay on your phone" is not used — stick with the INCLUDED/PRIVATE labels per decision #1.

---

## Hard Constraints

These rules are non-negotiable. Violating any one is a P0 bug.

1. **No invented workouts.** Every shared workout must match a canonical library variant by `variant_id`. Unknown variants are rejected at share creation AND at import.

2. **Zone locality.** Sender paces, VDOT, FTP, CSS, and any health data NEVER appear in the shared payload. Enforced by `WORKOUT_SHARING_PRIVACY` whitelist.

3. **Validator reuse.** The import validator uses the exact same rule module as built-in plan generation. No duplicated or forked rules.

4. **Rate limits.** 20 shares/user/day, 50 imports/user/day. Enforced at Supabase level.

5. **Token security.** Tokens are cryptographically random, 12-char base62, with collision detection on insert. Not guessable.

6. **Revocation is irreversible.** Once a sender revokes a share, the token returns an error forever. Cannot be un-revoked. Sender can create a new share with a new token if needed.

7. **No free text beyond the sender note.** No replies, no comments, no DMs, no chat. The 280-char sender note is the only user-generated text anywhere in the sharing system.

8. **Inbox is object-centric.** Cards represent workouts, not messages. No conversation threads, no read receipts, no typing indicators.

9. **Saved library respects validation.** Scheduling from saved goes through the same validator as scheduling from inbox. Saved workouts are not exempt from conflict checks.

10. **Deep links work after install.** A user who installs IronZ from a web preview must land in the app with the shared workout available. `pending_shares` table is the mechanism.

11. **Completion notification is a single push.** Not an in-app feed, not an inbox entry. Fires once per share per receiver per 24h.

12. **No social feed, no likes, no follows.** Not in v1, not ever without a new philosophy discussion.

---

## Files to Create

**JS modules:**
- `js/workout-sharing-flow.js`
- `js/workout-sharing-privacy.js`
- `js/workout-link-service.js`
- `js/workout-import-validator.js`
- `js/shared-workouts-inbox.js`
- `js/saved-workouts-library.js`
- `js/workout-completion-notification.js`
- `js/deep-link-handler.js`

**UI modules:**
- `js/ui/share-sheet-modal.js`
- `js/ui/link-ready-sheet.js`
- `js/ui/shared-workout-preview-modal.js`
- `js/ui/schedule-calendar-modal.js`
- `js/ui/conflict-resolution-modal.js`
- `js/ui/inbox-tab-view.js`
- `js/ui/saved-library-tab-view.js`
- `js/ui/zone-translation-card.js`

**Supabase:**
- `supabase/migrations/20260410_workout_sharing.sql`
- `supabase/functions/share-preview/index.ts`
- `supabase/functions/notify-share-completion/index.ts`

**Navigation:**
- Update main nav to add Inbox and Saved tabs alongside existing Plan and Profile tabs

**Tests:**
- `tests/workout-sharing-privacy.test.js` — whitelist enforcement, field stripping
- `tests/workout-import-validator.test.js` — all conflict types, suggested date logic
- `tests/workout-link-service.test.js` — token uniqueness, expiration, revocation
- `tests/deep-link-handler.test.js` — routing logic, pending share flow

---

## Analytics Events

Emit these via the existing analytics module. All events are anonymized and aggregated.

```
share_created             { variant_id, sport_id, session_type_id, has_note }
share_link_opened         { share_token, is_installed_user, is_receiver }
share_preview_viewed      { share_token, variant_id }
share_imported            { share_token, action: 'saved' | 'scheduled', had_conflict }
share_conflict_resolved   { conflict_type, resolution: 'moved' | 'swapped' | 'overridden' }
share_completed           { share_token, delta_percent }
share_revoked             { share_token, days_since_created }
inbox_opened              { unread_count, total_count }
inbox_entry_dismissed     { share_token, status_at_dismiss }
saved_library_opened      { saved_count, by_sport }
saved_from_library        { variant_id, sport_id }
saved_from_share          { share_token }
saved_scheduled           { variant_id, days_until_scheduled }
```

---

## Golden Test Cases

Every one of these must pass before the feature is considered shipped.

1. **Happy path sender:** User on completed workout screen taps share, goes through share sheet, generates link, link copies to clipboard. Analytics: `share_created` emitted. DB: row in `shared_workouts`.

2. **Happy path receiver:** User taps deep link, sees preview with zone translation showing their paces (not sender's), taps Schedule, picks suggested day, workout added to plan. Analytics: `share_imported` with action `scheduled`. DB: row in `workout_share_imports`.

3. **Save to library path:** User taps deep link, sees preview, taps Save to Library. Workout appears in Saved Library tab with "Shared" source tag and sender attribution. DB: row in `saved_workouts` with source `shared`.

4. **Schedule from saved library:** User opens Saved tab, taps a saved workout, schedules it. Validator runs, no conflicts, added to plan. Last_used_at updated.

5. **Conflict detection:** User tries to schedule shared Yasso 800s on day before their long run. Conflict modal appears citing 24h rule. User taps "Move to Apr 14 (suggested)". Workout scheduled on Apr 14. Analytics: `share_conflict_resolved` with resolution `moved`.

6. **Conflict override:** Same as #5 but user taps "Override anyway." Workout scheduled despite conflict. Warning logged. Analytics: resolution `overridden`.

7. **Revoked link:** Sender revokes a share. Receiver taps the link. Error modal appears: "This link was revoked by the sender." No data leak. Analytics: `share_link_opened` with error flag.

8. **Expired link:** 31 days after creation, a receiver taps the link. Returns expired error. UI shows "This link has expired."

9. **Non-user web preview:** Non-user (no IronZ installed) taps link on iPhone. Safari opens `ironz.app/w/{token}`. Sees web preview with workout structure (no concrete paces), install CTA. Tapping CTA routes to App Store.

10. **Post-install resume:** Non-user installs IronZ from web preview, completes onboarding. On final onboarding step, app surfaces "Chase shared a workout with you." Workout is saved to their library (not auto-scheduled). DB: `pending_shares.claimed_at` set; row inserted in `saved_workouts`.

11. **Completion notification:** Receiver completes a shared workout. Sender gets push notification "Sarah ran your Yasso 800s · 2s faster than target." No splits, no health data. DB: `workout_share_imports.completed_at` set.

12. **Privacy whitelist:** Unit test passes a workout object containing sender VDOT, FTP, actual paces, and health data through `scrubForShare`. Output contains only whitelist fields. All blacklist fields are absent.

13. **Invalid variant reject:** Sender tries to share a legacy workout with `variant_id = null`. Share creation rejects with "This workout can't be shared (legacy data)." No row created.

14. **Rate limit:** Sender creates 20 shares in 24h. 21st share attempt returns `RATE_LIMITED` error. Message: "You've hit the daily share limit. Try again tomorrow."

15. **Duplicate save:** User saves same variant twice from library. Second save updates `saved_at` timestamp but does not create duplicate row. Unique index prevents it.

16. **Inbox unread badge:** Receiver has 3 unread shares in inbox. Tab icon shows badge "3". Tapping into inbox and viewing one card drops badge to "2". Dismissing a card does not change badge (unread != dismissed).

17. **Duplicate workout warning:** Receiver imports a shared Yasso 800s. They completed Yasso 800s 5 days ago. Warning shown: "You ran this on April 4. Add it anyway?" Not a hard block.

18. **Deep link with no variant in library:** Sender shared a variant that was removed from the library in a later update. Receiver taps link, sees "This workout is no longer available." No scheduling allowed.

---

## Claude Code Execution Prompt

---

Execute `Plan/FEATURE_SPEC_2026-04-09_workout_sharing.md`. This adds peer-to-peer workout sharing plus an Inbox and Saved Workouts library. It depends on the variant libraries from the workout diversification spec, which should already be in place.

**Build order — do not reorder:**

1. Run the Supabase migration `supabase/migrations/20260410_workout_sharing.sql`. Create all four tables (`shared_workouts`, `workout_share_imports`, `saved_workouts`, `pending_shares`) with RLS policies and indexes. Verify RLS by testing that an anonymous client can SELECT a row by share_token but cannot UPDATE.

2. Build `js/workout-sharing-privacy.js` first, before any other module. Write its unit tests immediately. This is the chokepoint — if it leaks sender data, the whole feature is compromised. Whitelist approach only, no blacklist. Every share payload in the codebase must pass through `scrubForShare()`.

3. Build `js/workout-link-service.js` (token mint, resolve, revoke). Verify token uniqueness with a 10,000-token generation test. No collisions expected.

4. Build `js/workout-sharing-flow.js` (sender orchestration). Wire into the existing workout card UI with a share action. Add rate limiting at the module level, not just the database level.

5. Build `js/workout-import-validator.js`. CRITICAL: this module must import rule logic from the existing `js/workout-validator.js` — do NOT copy-paste rules. If you can't cleanly import, stop and refactor `js/workout-validator.js` to expose a shared rule module first.

6. Build the UI modules in the order they appear in the prototype: share sheet → link ready → receiver preview → schedule calendar → conflict modal. Match the prototype exactly for copy and interaction.

7. Build `js/shared-workouts-inbox.js` and `js/ui/inbox-tab-view.js`. Add Inbox to main nav. Verify unread badge updates correctly.

8. Build `js/saved-workouts-library.js` and `js/ui/saved-library-tab-view.js`. Add Saved to main nav. Add bookmark icons to built-in library cards so users can save from the library directly.

9. Build `js/deep-link-handler.js`. Register universal link handler for `ironz.app/w/*` and custom scheme for `ironz://share/*`. Test the post-install resume path via the `pending_shares` table.

10. Deploy `supabase/functions/share-preview/index.ts` as an edge function. It takes a token from the URL path, looks up the share via RLS, and returns HTML. No concrete paces — generic structure only.

11. Deploy `supabase/functions/notify-share-completion/index.ts`. Triggered by the existing workout completion flow when `shared_from_token` is present. Pushes a notification to the sender with only the whitelisted stats.

12. Run the 18 golden test cases. Every single one must pass before declaring the feature shipped.

**Hard rules during execution:**

- No invented workouts. Every shared workout traces to a library variant.
- No sender data in shares except the whitelist. Test this with a unit test, not just visual inspection.
- No duplicated validator rules. Import from the existing module.
- No free text anywhere except the 280-char sender note.
- No DMs, no social feed, no likes, no reply buttons.
- The existing AI variant selector, threshold weeks, run session types, and workout diversification features must continue to work unchanged.

**Report back with:**

- Confirmation that the privacy whitelist test passes with a fully-populated sender workout object
- Grep output proving no `vdot`, `ftp`, `css`, `actual_pace`, or similar fields appear in any `shared_workouts` insert path outside of `workout-sharing-privacy.js`
- Confirmation that `workout-import-validator.js` imports rule logic from `workout-validator.js` rather than duplicating
- Screenshots or recorded flows of all 7 new UI screens matching the prototype
- Golden test case pass/fail summary (18/18 expected)
- A test of the post-install resume flow from `pending_shares`

---

## Notes for Future Self

- **v2 candidates (not in this spec):** group shares (one link, multiple recipients), workout pack sharing (share a week of workouts), public community library with moderation, coach-athlete assignment model, shared workout comments (requires moderation discussion first).

- **What not to add:** DMs, reply buttons, a social feed, likes, follows, public profiles, workout leaderboards. These would all pull IronZ toward Strava's model. If a future request asks for any of these, it needs its own philosophy discussion before the feature work.

- **The Inbox / Saved split:** Inbox is inbound, Saved is curated. A workout can be in Inbox without being Saved. Saving copies it to the Saved library and leaves it in Inbox with status `saved`. Dismissing it removes it from Inbox view but does not delete the underlying share (receiver can still find it by the link).

- **The Completion Notification loop:** This is the one social touch we kept. If future user research shows it drives unhealthy comparison or performance anxiety, consider making it opt-in or removing entirely. Revisit after 3 months of data.

- **Zone translation is the moat:** This feature only works cleanly because IronZ already stores workouts as intensity-relative (I-pace, T-pace, FTP%, CSS%). Strava can't build this cleanly because they don't have VDOT. TrainingPeaks can but it's locked behind coach features. Lean into this in marketing copy for the feature.

- **The web preview is a growth loop:** Every share is a free install CTA. Consider adding UTM params to track conversion rate from web preview to install.
