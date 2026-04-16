# Calendar Redesign — Implementation Guide

## What's in this folder

| File | What it does |
|------|-------------|
| `01-index-html-replace.html` | New HTML for the calendar `<section>` — replace lines ~699-714 in `index.html` |
| `02-calendar-styles.css` | All new CSS classes — append to `style.css` (remove old `.calendar-header`, `.cal-nav-btn`, `.cal-zoom-btn`, `.cal-add-header-btn`, `.cal-this-week-btn` rules first) |
| `03-calendar.js` | Full `calendar.js` — drop into repo root alongside `index.html` |

## Steps to implement

### 1. Replace the HTML (index.html, lines ~699-714)

Delete the old calendar `<section>` block (from `<section class="card" style="position:relative">` through its closing `</section>`) and paste in the contents of `01-index-html-replace.html`.

**Leave these sections alone** — they stay as-is:
- `#nl-input-container` (line ~717)
- `#day-detail-card` (lines ~720-722) — calendar.js populates `#day-detail-content` dynamically

### 2. Update CSS (style.css)

- **Remove** any existing rules for: `.calendar-header`, `.calendar-grid`, `.cal-nav-btn`, `.cal-zoom-btn`, `.cal-this-week-btn`, `.cal-add-header-btn`, `.calendar-month-label`
- **Append** the entire contents of `02-calendar-styles.css` to the end of `style.css`
- Make sure these CSS vars exist in your `:root` (add if missing):
  ```css
  --dark: #1a1a2e;
  --red: #e63946;
  --green: #2ecc71;
  ```

### 3. Drop in calendar.js

Copy `03-calendar.js` to the repo root as `calendar.js`. It's already referenced in index.html at line 1965.

### 4. Verify

- `calendar.js` exports these globals that other scripts may call:
  - `renderCalendar()` — re-render (app.js can call this after plan changes)
  - `initCalendar()` — one-time setup (auto-called on DOMContentLoaded)
  - `selectedDate` — currently highlighted date
  - `DISCIPLINE_COLORS` — color map used by planner.js if needed
  - `_resolveDiscipline(disc)` — resolve a discipline string to color/icon info

- The day-detail card (`#day-detail-content`) is rendered by calendar.js and supports:
  - Expand/collapse per workout (tap to toggle)
  - Exercise breakdown list when workout has `.exercises[]`
  - "Start" button linking to `openLiveTracker()` if available

## Data sources

calendar.js reads from these localStorage keys:
- `trainingPlan` — array of `{date, discipline, intensity, durationMin, name, exercises[], ...}`
- `workoutSchedule` — array of scheduled workouts
- `events` — calendar events (filters out `type: 'restriction'`)
- `workoutLog` — array of `{date, completed}` for checkmark display

## Features

- **Week view**: Horizontal carousel with today as the expanded center card, other days as compact side cards with colored intensity dots and completion checkmarks
- **Month view**: 7-column grid with colored dots, today highlighted in dark, selected day with red ring, REST labels, completion checkmarks
- **Toggle**: Button in header switches between views; month view shows active toggle state
- **"Today" button**: Appears when you navigate away from the current week/month, snaps back
- **Day detail**: Shows below calendar for any selected date with expand/collapse workout breakdown
- **Swipe**: Month view supports left/right swipe to change months
