# IronZ Coach Invite Link — v1 Spec

**Author:** Spec written 2026-04-29 from a 4-question elicitation with Chase. Pre-build design doc; no code starts until Chase signs off.

**Goal:** Let a coach share a unique short URL (e.g., `ironz.app/c/x7q2k9`) with prospective clients. The link handles two paths cleanly: existing IronZ users get auto-paired with the coach on click + sign-in; new users sign up via the link and get auto-paired on signup completion. Coaches see a funnel (clicks → signups → active clients) in their Coach Portal.

This complements the existing **Request a Coach** feature: that one is inbound (user requests → admin matches). Invite links are outbound (coach acquires their own client).

---

## Decisions (locked in)

| Decision | Value |
|---|---|
| **Link format** | Random 6-character code per coach. URL: `https://ironz.app/c/<code>`. No custom slugs in v1 (avoids reserved-word collisions and uniqueness UX). |
| **Approval model** | **Explicit Accept step** after signup or sign-in. Click → land on coach page → sign up/in → see "Accept coaching from [Coach]?" modal → tap **Accept** to pair, or **Not now** to dismiss. The Accept modal is intentionally the spot where payment will live in v2 — building it now means subscription plumbing slots in cleanly later. |
| **Payment future-proofing** | Today: Accept = free pairing. Future: Accept = "Continue to checkout" → Stripe → subscription → pairing. The Accept modal's UI shape anticipates this: includes "What you get" with the coach + a "Free for now — paid coaching coming soon" disclaimer so users aren't surprised when pricing rolls out. |
| **Already-coached conflict** | Show "You're already coached by [X]. Switch to [Y]?" Atomic switch — old assignment deactivates, new one activates in one transaction. User can also choose to keep existing coach, in which case the link click is a no-op. |
| **Tracking** | Funnel: clicks → signups → active clients. Visible to the coach in their Invite Link panel inside Coach Portal. |
| **Default link state** | Each coach gets exactly ONE active link. They can rotate it (deactivates old + generates new) but only one is active at a time. Simplifies UI and prevents fragmented attribution. |
| **Coach must be promoted first** | Only users with `is_coach = true` can have an invite link. Admin promotes them via existing flow; once promoted, link is auto-generated. |

---

## Future state (v2 payment integration — important context for v1 design)

The Accept modal in v1 will become the entry to a paid flow in v2. Building it now with that future state in mind means we don't have to rewrite the UX shape later.

**v1 Accept modal:**
```
Accept coaching from Mark Davis?
[Coach photo + bio]
What you get:
 • Custom training plans
 • Daily check-ins
 • In-app messaging (coming soon)
Free for now — paid coaching coming in 2026.
[Accept]  [Not now]
```

**v2 Accept modal (anticipated):**
```
Coaching from Mark Davis — $99/month
[Coach photo + bio]
What you get:
 • Custom training plans
 • Daily check-ins
 • In-app messaging
First 14 days free, cancel anytime.
[Continue to checkout]  [Not now]
```

The data model is already future-proofed: `coach_invite_clicks.accepted_at` is the conversion event today AND the "user agreed to be charged" event tomorrow. The handler logic stays the same; we just insert a Stripe checkout step between Accept and `pairWithCoach()` in v2.

Coaches' `coach_profile` table (proposed v2) will hold pricing tiers. Out of scope for v1 entirely — don't build pricing fields yet.

---

## User flows (the four that matter)

### 1. Existing IronZ user clicks the link, has no coach

- User taps `https://ironz.app/c/x7q2k9` from a coach's text/email.
- Lands on a public coach landing page: coach photo, name, bio, **Sign in** + **Sign up** buttons.
- User taps **Sign in** (they have an account already).
- After auth: app loads, sees the pending invite, opens the **Accept Coaching** modal:
  - "Accept coaching from **Mark Davis**?"
  - Coach photo + bio.
  - "What you get" — a few bullets (workout plans tailored by your coach, in-app messages, daily check-ins, etc.).
  - Disclaimer: *"Free for now — paid coaching coming in 2026."*
  - Buttons: **[Accept]** primary / **[Not now]** secondary.
- If **Accept**: creates `coaching_assignments` row, marks the click as accepted in `coach_invite_clicks`, sends Mark a push: "Sarah Chen joined your roster."
- If **Not now**: dismisses, no pairing. Re-prompts on next sign-in for 7 days. After 7 days, the pending invite expires.

### 2. Existing user clicks the link, ALREADY has a primary coach

- User taps the link, lands on Mark's coach page, taps **Sign in**.
- Auth completes. App detects existing primary coach (e.g., Coach Riley).
- **Accept Coaching modal opens with conflict context inline:**
  - "Accept coaching from **Mark Davis**?"
  - "This will replace your current coach, **Riley Quinn**."
  - Coach photo + bio.
  - Buttons: **[Switch to Mark]** primary / **[Keep Riley]** secondary.
- If **Switch to Mark**: atomic transaction — Riley's `coaching_assignments` row goes `active=false`, new row inserted for Mark. History logged.
- If **Keep Riley**: dismiss. No changes. 7-day re-prompt cooldown applies.

### 3. New user clicks the link, signs up

- User taps the link, lands on Mark's coach page, taps **Sign up**.
- Signup flow with `coach_invite_link_id` carried through.
- User completes email/password + onboarding (sport, goals, etc.).
- At end of onboarding (instead of going to home), the **Accept Coaching modal** opens:
  - Same shape as Flow 1 — coach name, photo, bio, what-you-get, free-for-now disclaimer.
  - Buttons: **[Accept]** / **[Not now]**.
- If **Accept**: pairing created, redirected to home with welcome banner.
- If **Not now**: redirected to home as a normal new user. Re-prompted on next sign-in for 7 days. After 7 days, expires.

### 4. Coach views their funnel

- Mark opens Coach Portal → new **Invite Link** tab.
- Sees:
  - Current short URL (large, copyable, with QR code).
  - Funnel: **47 clicks · 12 signed up · 8 active clients** (last 30 days).
  - Recent activity: "Someone clicked 2 hours ago." "Someone signed up 1 day ago." (Anonymous — privacy-respecting.)
  - **Rotate code** button (deactivates current, generates new).
- Mark copies the URL or shows the QR code in person.

---

## Data model

### New tables

```sql
-- One link per coach (active at a time). Inactive rows preserved for analytics.
create table public.coach_invite_links (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references auth.users(id) on delete cascade,
  code            text not null unique check (char_length(code) = 6),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  deactivated_at  timestamptz,

  -- Codes use a URL-safe alphabet, no ambiguous chars (no 0/O/1/l/I).
  constraint code_charset check (code ~ '^[2-9A-HJ-NP-Z]{6}$')
);

-- Only ONE active link per coach. Inactive rows are unconstrained.
create unique index coach_invite_one_active
  on public.coach_invite_links (coach_id)
  where active = true;

-- Fast lookup by code (for the public landing page)
create index coach_invite_code_active_idx
  on public.coach_invite_links (code)
  where active = true;

-- Per-click tracking. Anonymous (no raw IP/UA), counts the funnel.
create table public.coach_invite_clicks (
  id                uuid primary key default gen_random_uuid(),
  invite_link_id    uuid not null references coach_invite_links(id) on delete cascade,
  clicked_at        timestamptz not null default now(),
  ip_hash           text,           -- sha256 of (ip + daily_salt) for dedup-only, not reversible
  user_agent_hash   text,           -- same — fingerprinting prevention
  -- Populated when the click results in an account creation.
  signed_up_user_id uuid references auth.users(id) on delete set null,
  signed_up_at      timestamptz,
  -- Populated when the user explicitly tapped Accept on the modal.
  -- This is the funnel step that becomes "Continue to checkout" in v2 paid flow.
  accepted_at       timestamptz,
  -- Populated when the user dismissed (Not now). Resets if they re-click the link.
  dismissed_at      timestamptz,
  -- Populated when the user becomes an active client (assignment row created).
  paired_assignment_id uuid references coaching_assignments(id) on delete set null,
  paired_at         timestamptz
);

create index coach_invite_clicks_link_idx on public.coach_invite_clicks (invite_link_id, clicked_at desc);
create index coach_invite_clicks_signup_idx on public.coach_invite_clicks (signed_up_user_id) where signed_up_user_id is not null;

-- Optional: history of coaching_assignments transitions, for audit + analytics.
-- Lightweight; just records when a user switched coaches.
create table public.coaching_assignment_history (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references auth.users(id) on delete cascade,
  previous_coach_id   uuid references auth.users(id),
  new_coach_id        uuid references auth.users(id),
  change_type         text not null check (change_type in ('created', 'switched', 'deactivated', 'reactivated')),
  source              text check (source in ('admin', 'invite_link', 'request_match', 'self_unfreeze')),
  invite_link_id      uuid references coach_invite_links(id) on delete set null,
  changed_at          timestamptz not null default now(),
  changed_by          uuid references auth.users(id)
);
```

### Auto-generation when a coach is promoted

When `profiles.is_coach` flips to `true`, automatically create an active invite link:

```sql
create or replace function public._auto_create_invite_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_coach = true and (old.is_coach is null or old.is_coach = false) then
    insert into public.coach_invite_links (coach_id, code)
    values (new.id, public._gen_invite_code())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger profiles_auto_invite_link
  after update of is_coach on public.profiles
  for each row execute function public._auto_create_invite_link();
```

The `_gen_invite_code()` helper generates a 6-char code using the unambiguous alphabet:

```sql
create or replace function public._gen_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  -- 32 chars, no 0/1/I/O
  result text := '';
  i int;
  attempt int := 0;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(alphabet, floor(random() * 32)::int + 1, 1);
    end loop;
    -- Check uniqueness
    perform 1 from public.coach_invite_links where code = result;
    if not found then
      return result;
    end if;
    attempt := attempt + 1;
    if attempt > 10 then
      raise exception 'Could not generate unique invite code after 10 attempts';
    end if;
  end loop;
end;
$$;
```

32^6 = ~1 billion possible codes. Collision probability is vanishingly small until you have ~32k coaches. Plenty of headroom.

### RLS policies

```sql
alter table public.coach_invite_links enable row level security;
alter table public.coach_invite_clicks enable row level security;
alter table public.coaching_assignment_history enable row level security;

-- Public read of ACTIVE invite links by code (powers the landing page lookup).
-- Returns coach_id and code only; no internal fields.
create policy "Public can look up active invite links"
  on public.coach_invite_links
  for select
  using (active = true);

-- Coaches manage their own links
create policy "Coaches manage their own invite links"
  on public.coach_invite_links
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- Anonymous click recording (no auth required)
create policy "Anyone can record an invite click"
  on public.coach_invite_clicks
  for insert
  with check (true);

-- Coaches can read clicks for their own links
create policy "Coaches view their own click data"
  on public.coach_invite_clicks
  for select
  using (
    exists (
      select 1 from public.coach_invite_links
      where id = invite_link_id and coach_id = auth.uid()
    )
  );

-- Admins can see everything
create policy "Admins view all invite link data"
  on public.coach_invite_links
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admins view all click data"
  on public.coach_invite_clicks
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Assignment history: client + coach + admin can read
create policy "Users see their own assignment history"
  on public.coaching_assignment_history
  for select
  using (client_id = auth.uid() or new_coach_id = auth.uid() or previous_coach_id = auth.uid());

create policy "Admins see all assignment history"
  on public.coaching_assignment_history
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
```

---

## Public landing page (`/c/<code>`)

Route handled by an edge function (since the existing app is a Capacitor SPA, the public landing needs to live on the server side OR be a separate static page).

**Recommended: edge function** at `https://dagdpdcwqdlibxbitdgr.supabase.co/functions/v1/coach-invite/<code>` that returns HTML. Then a simple redirect on `ironz.app/c/<code>` → that edge function.

Or: a public route in the existing web app at `/c/<code>` that the Capacitor build also serves. Whichever the coder prefers.

Page contents:

```
┌──────────────────────────────────────────────────┐
│                                                   │
│            [ Coach Photo Circle ]                 │
│                                                   │
│              MARK DAVIS                           │
│         IronZ Triathlon Coach                     │
│                                                   │
│    "I help endurance athletes hit their first     │
│     70.3 with structure and accountability."      │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │            [  Sign in  ]                    │  │
│  │                                              │  │
│  │  New to IronZ?  [  Sign up + connect  ]    │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│       Powered by IronZ — your training stack     │
│                                                   │
└──────────────────────────────────────────────────┘
```

Mobile-first design. Page logic:

1. On page load, edge function:
   - Looks up the link by `code`. If not found or inactive → returns "This invite link is no longer active" page with "Find a coach" CTA.
   - Loads coach's profile (name, photo from `profiles.avatar_url` if exists, bio from new `profiles.coach_bio` field).
   - Records a click in `coach_invite_clicks` (with hashed IP + UA).
   - Sets a cookie/sessionStorage flag `pending_invite_link_id=<uuid>` so the signup/signin flow downstream can pick it up.
   - Renders the page.

2. **Sign in** button → existing auth flow with `?invite=<code>` query param.
3. **Sign up + connect** button → existing signup flow with `?invite=<code>` query param.

Both downstream flows read the param/cookie and persist the `invite_link_id` so the auto-pair step at the end of auth/signup knows what to do.

### New profile fields

```sql
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists coach_bio text check (char_length(coach_bio) <= 500);
```

`avatar_url` is generic (eventually useful for all users); `coach_bio` is coach-specific.

Coaches edit their bio + photo in their Coach Portal Settings tab (small UX add).

---

## Auth flow integration

### Sign in path (existing user)

After successful auth, the app checks for `pending_invite_link_id` in storage. If present AND not declined-within-cooldown:

```js
if (pending_invite_link_id && !isInviteDismissedRecently(pending_invite_link_id)) {
  const link = await fetchInviteLink(pending_invite_link_id);
  const existingCoach = await getActivePrimaryCoach(currentUserId);

  // Already coached by THIS coach — silently clear, no modal
  if (existingCoach && existingCoach.id === link.coach_id) {
    clearPendingInvite();
    showToast(`You're already coached by ${link.coach.full_name}.`);
    return;
  }

  // Show the Accept modal — content varies by conflict state
  showAcceptCoachingModal({
    coach: link.coach,
    existingCoach,        // null if no current coach; populated if conflict
    onAccept: async () => {
      if (existingCoach) {
        await switchCoach(link);   // deactivate old, create new
      } else {
        await pairWithCoach(link); // simple insert
      }
      clearPendingInvite();
    },
    onNotNow: () => {
      markInviteDismissed(pending_invite_link_id);  // 7-day cooldown
    }
  });
}
```

`pairWithCoach(link)` does:
- Insert into `coaching_assignments` (client = currentUser, coach = link.coach_id, role='primary', source='invite_link').
- Update `coach_invite_clicks`: set `signed_up_user_id` (or `paired_user_id` if existing user), `paired_assignment_id`, AND `accepted_at` (new field — see below).
- Insert into `coaching_assignment_history` (change_type='created', source='invite_link', invite_link_id=link.id).

`switchCoach(link)` is the same wrapped in a transaction:
- `update coaching_assignments set active=false, deactivated_at=now() where client_id=current and active=true and role='primary'`.
- Insert new row.
- Insert history row with change_type='switched'.

### Sign up path (new user)

Signup flow reads `?invite` from the URL, stores it. After onboarding completes, BEFORE redirecting to home:

```js
if (storedInviteLinkId) {
  const link = await fetchInviteLink(storedInviteLinkId);
  showAcceptCoachingModal({
    coach: link.coach,
    existingCoach: null,  // new user, no conflict possible
    onAccept: async () => {
      await pairWithCoach(link);
      redirectToHome({ withWelcomeBanner: true });
    },
    onNotNow: () => {
      markInviteDismissed(storedInviteLinkId);
      redirectToHome();
    }
  });
} else {
  redirectToHome();
}
```

### "Not now" / cooldown semantics

- Tapping **Not now** sets a localStorage entry `dismissed_invite_<link_id>=<timestamp>`.
- On every subsequent sign-in for 7 days, the modal re-appears (gives the user time to think it over).
- After 7 days, the `pending_invite_link_id` expires naturally and the modal stops appearing.
- If the user wants to accept after dismissing, they can re-click the original link — it sets a fresh `pending_invite_link_id` and the modal opens immediately.
- Future v2: explicit "Don't ask again" button that sets a permanent decline flag. v1 just uses the 7-day cooldown.

---

## Coach Portal — Invite Link tab

New tab in Coach Portal, alongside Calendar/Benchmarks/Feedback/Nutrition (or as a sibling page accessed from the dashboard).

```
[ Coach Portal · Mark Davis · Invite Link ]                  [‹ Back]

┌── YOUR LINK ───────────────────────────────────┐
│                                                 │
│   ironz.app/c/X7Q2K9                            │
│                                  [📋 Copy]      │
│                                                 │
│              [QR code 200×200]                  │
│                                                 │
│          [ Share link ]   [ Rotate code ]       │
└─────────────────────────────────────────────────┘

┌── FUNNEL (last 30 days) ───────────────────────┐
│                                                 │
│   47 clicks                                     │
│   ████████████████████████████  47              │
│                                                 │
│   12 signed up                                  │
│   ███████████                   12              │
│                                                 │
│   9 accepted                                    │
│   █████████                      9              │
│                                                 │
│   8 active                                      │
│   ████████                       8              │
│                                                 │
│   3 dismissed (in 7-day cooldown)               │
└─────────────────────────────────────────────────┘

┌── RECENT ACTIVITY ─────────────────────────────┐
│  • Someone signed up · 4 hours ago              │
│  • Someone clicked · 7 hours ago                │
│  • Someone signed up · 2 days ago               │
│  • Someone clicked · 3 days ago                 │
│                                                 │
│  All activity is anonymized for client privacy. │
└─────────────────────────────────────────────────┘
```

**Rotate code** does:
- Mark current link `active=false, deactivated_at=now()`.
- Insert new link with new code, `active=true`.
- Old links continue to work? **No.** Once rotated, the old code returns the "inactive link" page. Coach is responsible for sharing the new URL.

**Share link** triggers the OS share sheet on mobile (`navigator.share()`) with prefilled text: *"Join my IronZ coaching: https://ironz.app/c/X7Q2K9"*.

---

## Edge cases & error handling

| Scenario | Handling |
|---|---|
| Non-existent or inactive code | Edge function returns 200 with a friendly "This invite link is no longer active" page + "Find a coach" CTA → routes to Request a Coach. |
| Coach is deactivated (is_coach=false) after generating link | Link returns "This coach is no longer accepting clients." Don't reveal coach was deactivated specifically. |
| Bot clicks / scraping | Rate-limit click insertion to 10/min/IP-hash. Spammers can still flood but quality is preserved by `signed_up_user_id` filter on the funnel. |
| User clicks link, doesn't sign up, comes back later | The `pending_invite_link_id` cookie persists for 30 days. If they sign up within that window via any path, still auto-pair. After 30 days, expire. |
| User signs up via link but disables nutrition/training features | Pair anyway. Coaching is independent of feature toggles. |
| Coach rotates code while a user is mid-signup | The user's `pending_invite_link_id` references the OLD link UUID, which is still in the table (just inactive). Auto-pair completes against that link. The signup attribution stays with the original click. |
| Two coaches send links to the same user | First click + signup wins. If user clicks second link AFTER having a coach, conflict modal fires. Standard switch flow. |
| User clicks link, signs in, is already coached by THE SAME coach | No-op + toast: "You're already coached by Mark Davis." Don't double-create the row. |
| Invite link exists but coach is in `is_coach=false` state with active assignments | Treat as if link is inactive. Render "no longer accepting clients." |
| Click happens, signup happens, but coaching_assignments insert fails (DB error) | Atomic transaction — fail the whole thing, surface error to user, retry. Don't leave half-paired state. |
| Coach is suspended / banned | Admin tooling: deactivate `is_coach`, deactivate `coach_invite_links.active`, all existing relationships unchanged but new pairings blocked. |

---

## Phasing & ship plan

3 phases, each shippable independently.

### Phase A — Schema + landing page (3-4 days)
**Outcome:** A coach can have an invite link generated. The public landing page works. Click tracking records.

- Migration: all 3 tables, RLS, helper functions, auto-create trigger.
- Edge function: `coach-invite` — handles `/c/<code>` lookup + click recording + HTML rendering.
- Coach Portal: minimal Invite Link panel showing the URL (no funnel stats yet).
- Demo gate: promote a test user to coach → confirm a row was auto-created in `coach_invite_links` → visit `/c/<their-code>` in a browser → see the landing page with their name/bio → confirm a row appeared in `coach_invite_clicks`.

### Phase B — Auto-pair flow + conflict modal (3-4 days)
**Outcome:** Clicking the link → signing in / up → being auto-paired works end-to-end.

- Auth flow integration: signup + sign-in both honor the `pending_invite_link_id`.
- Pair / switch logic: `pairWithCoach()`, `switchCoach()`, conflict modal.
- `coaching_assignment_history` writes on every transition.
- Demo gate: full Flow 1 (existing user, no coach) end-to-end. Then Flow 3 (new user signs up via link). Then Flow 2 (existing user with conflicting coach, both paths — switch and keep).

### Phase C — Funnel + rotate + polish (2-3 days)
**Outcome:** Coach sees their funnel, can rotate codes, can share link cleanly.

- Coach Portal Invite Link panel: full funnel view, recent activity, rotate, QR code, share button.
- Coach bio + avatar editing in Coach Portal Settings.
- Anonymous activity feed.
- Rate limiting on the click endpoint.
- Demo gate: coach sees their funnel after a few real clicks/signups, rotates code, confirms old code returns inactive page.

**Total scope: 8-11 days** of focused work.

---

## Out of scope for v1 (parking lot)

- **Custom slugs.** Defer until v2. Random codes are simpler and avoid reserved-word/typo issues.
- **Per-link UTM tags.** If a coach wants to track which channel converts (Instagram vs email vs in-person), they can rotate codes per channel for now. Real UTM support is v2.
- **Scheduled deactivation.** No "expires in 7 days" — coaches manage manually via rotate.
- **Invite link analytics dashboard for admin.** Admin can see all clicks via direct DB queries; dedicated UI is v2.
- **Multi-coach invite (one link → multiple coaches).** Out of scope. Each coach has their own link.
- **Branded landing page customization.** Coach can set bio + photo. Custom CTAs, colors, marketing copy = v2.
- **Email capture before signup.** Some marketing tools capture email on landing then nurture. Not v1; the existing signup flow is the conversion event.

---

## File-creation summary (for the coder)

New files:
- `supabase/migrations/20260430_coach_invite_links.sql` — all 3 tables + RLS + helper functions + trigger.
- `supabase/functions/coach-invite/index.ts` — edge function for `/c/<code>` landing.
- `js/coach-invite-flow.js` — client-side logic for handling `pending_invite_link_id` post-auth.
- `js/coach-invite-panel.js` — Coach Portal Invite Link tab.

Modified files:
- `js/onboarding-v2.js` — read `?invite` query param at signup start, store in session, auto-pair at end.
- `js/auth.js` (or wherever sign-in handler lives) — same param handling on sign-in path.
- `js/coach-portal.js` — add Invite Link as a navigation entry.
- `index.html` — Coach Portal Invite Link tab markup; Coach Portal Settings (bio + avatar) markup.

Test files:
- `tests/coach-invite-rls.test.js` — public can look up active links, can't read inactive, can't write.
- `tests/coach-invite-pair-flow.test.js` — pair / switch / no-op / conflict-modal scenarios.

---

## Pre-kickoff fixes (from spec review 2026-04-29)

These were flagged in pre-build review and need to be addressed during Phase A. Spec author owns; raising explicitly so the coder doesn't have to re-discover them mid-build.

### Click double-record race condition (P0)

Spec says "records a click" on landing page load. Without dedup, refreshing the landing page or clicking the link twice double-counts.

**Fix:** When recording in `coach_invite_clicks`, check for an existing row with the same `ip_hash` AND `invite_link_id` within the last 60 seconds. If found, skip the insert. This is a soft dedup — distinct intent within the same minute is rare; accidental re-loads are common.

```sql
insert into public.coach_invite_clicks (invite_link_id, ip_hash, user_agent_hash)
select '<link_id>', '<ip_hash>', '<ua_hash>'
where not exists (
  select 1 from public.coach_invite_clicks
  where invite_link_id = '<link_id>'
    and ip_hash = '<ip_hash>'
    and clicked_at > now() - interval '60 seconds'
);
```

### Transaction atomicity for pair / switch (P0)

`pairWithCoach()` and `switchCoach()` each touch 3 tables (`coaching_assignments`, `coach_invite_clicks`, `coaching_assignment_history`). Spec hand-waved "atomic transaction." Make it explicit:

**Fix:** Wrap each function body in a single `BEGIN; ... COMMIT;` block. If any insert/update fails, the entire flow rolls back. Failure surface to user: a generic "Couldn't connect with coach — try again" toast, with a retry button. No half-paired state ever persists.

For the SQL helper — strongly prefer running these as a Postgres function (`security definer`) so the atomicity is enforced server-side, not just trusted client-side. Coder's call: SQL function vs. client-side transaction wrapping.

### `pending_invite_link_id` cookie shared-device leak (P0)

Spec stored `pending_invite_link_id` in localStorage with 30-day expiry. If User A clicks a link on a shared computer, signs out, User B signs in — User B inherits A's pending invite. Clear privacy + data-correctness issue.

**Fix:**
- Reduce localStorage expiry from 30 days to **24 hours**.
- After successful auth, immediately move the pending invite from localStorage into the authenticated user's row (`profiles.pending_invite_link_id` column — new field). At that point it's tied to the user, not the device.
- Once paired/dismissed, clear both the localStorage AND the profile field.
- Other users on the same device never see User A's pending invite because each user's profile.pending_invite_link_id is per-user.

Schema patch:

```sql
alter table public.profiles
  add column if not exists pending_invite_link_id uuid references public.coach_invite_links(id) on delete set null,
  add column if not exists pending_invite_set_at timestamptz;
```

### Sign-up hook is underspecified (P1)

Spec says "After onboarding completes" but doesn't name the actual entry point in `js/onboarding-v2.js`. The codebase has multiple completion paths.

**Fix:** Coder verifies the exact post-onboarding hook before Phase B. Recommend instrumenting both `_writeScheduleSessions()` exit and the goTo("home") call so whichever fires first triggers the Accept modal. Document the chosen hook in the Phase B PR description.

### 7-day cooldown localStorage-only (P1)

If user clears browser cache, the cooldown evaporates and they get re-prompted immediately. Annoying but not a security issue.

**Fix:** Use the existing `coach_invite_clicks.dismissed_at` column as source of truth. Client-side check both localStorage (fast, current session) AND the most recent click row's `dismissed_at` (durable, cross-session). LocalStorage stays as the perf optimization; DB is canonical.

### Coach deactivation mid-flow (P1)

If coach gets deactivated AFTER the user clicks but BEFORE they tap Accept, the pair insert could succeed against a deactivated coach.

**Fix:** `pairWithCoach()` first checks `profiles.is_coach = true` for the target coach. If false, fail with a clear toast: "This coach is no longer accepting clients. We've saved your account — find another coach in the [Request a Coach] flow."

### Same-coach dedup check placement (P1)

Spec checks "already coached by THIS coach" inside the Accept modal handler. Better to check earlier — on the landing page itself if user is already authed.

**Fix:** On landing page render, if user is signed in AND already has active assignment to this coach, skip the modal entirely and redirect home with a toast: "You're already coached by [name]."

---

## Deferred (P2) — not blocking kickoff but track for Phase C polish

- Rotate-during-signup attribution (does old code count toward funnel after rotation? Spec ambiguous — clarify when funnel is built).
- Indexes may need tuning after real funnel queries are in production.
- Landing page SEO/accessibility — Lighthouse score ≥90 before Phase A ships.
- Funnel field naming clarity (`signed_up_user_id` vs `first_signup_user_id` for new-user-only signups).
- Rate limiting enforcement point (DB trigger vs edge function vs app-side).

---

## Open questions before kickoff

A few small calls to confirm:

1. **Where does the public landing page actually live?** I assumed an edge function returning HTML. Alternative: a public route in the SPA at `/c/<code>`. Coder's call — both work. Edge function is more independent (works even if the SPA has issues); SPA route is simpler to deploy.

2. **`coach_bio` length cap.** Set to 500 chars. Reasonable for a one-paragraph blurb. Adjust if you want longer.

3. **Avatar storage.** Coach uploads a photo — does it go to Supabase Storage? Existing infra? For v1, we can defer photo upload entirely and just show a generic avatar icon if none is set.

4. **Rotate-on-suspicion.** If a coach reports their link is being abused (someone shared it inappropriately), should there be a one-tap "rotate now" emergency button, or is the regular rotate flow enough? Probably enough for v1.

5. **What's a coach's "active client count" in the funnel — current snapshot or 30-day window?** Recommend current snapshot ("8 active clients right now") — simpler mental model than "8 active in the last 30 days." Different from clicks/signups which are window-based.

If those four are good, Phase A can start.
