# Exercise Name Autocomplete — Manual Workout Input

## Problem

Manual workout users have to type out full exercise names every time they log a workout. This is slow, error-prone, and leads to inconsistent naming (e.g., "bench press" vs "Bench Press" vs "BP"). Since IronZ already has a database of exercises, we should surface those as suggestions to speed up input.

## Feature

Add typeahead/autocomplete to the exercise name input field in the manual workout builder. After a user types 2+ characters, show a dropdown of matching exercises from the IronZ exercise database. Users are **not required** to select from the dropdown — they can type any custom exercise name. This is a suggestion tool, not a validation gate.

## UX Behavior

1. User taps the exercise name input field and starts typing
2. After **2 characters** are entered, a dropdown appears below the input field
3. The dropdown shows up to **8 matching exercises**, sorted by relevance (prefix matches first, then "contains" matches)
4. Each suggestion shows the exercise name and optionally the muscle group tag (e.g., "Bench Press · Chest")
5. User can:
   - **Tap a suggestion** to auto-fill the input field with that exercise name
   - **Keep typing** to narrow results — the dropdown filters in real-time
   - **Ignore the dropdown** entirely and type a custom exercise name — no validation error
   - **Dismiss the dropdown** by tapping outside or pressing Escape
6. On selecting a suggestion, the cursor moves to the next field (sets, reps, or weight) for fast tabbing
7. If there are no matches for the typed text, the dropdown disappears (no "no results" message needed — the user is just typing a custom name)

## Matching Logic

- **Case-insensitive** matching
- **Prefix match first**: exercises that START with the typed text appear at the top (e.g., "Be" → "Bench Press" before "Bent-Over Row")
- **Contains match second**: exercises that contain the typed text anywhere appear below prefix matches (e.g., "curl" → "Barbell Curl", "Dumbbell Curl", "Cable Curl", "Hammer Curl")
- **Fuzzy tolerance**: minor typos shouldn't break it — if a user types "benchpress" (no space), "Bench Press" should still match. Simple approach: strip spaces and special characters before comparing.
- **Recently used exercises** could optionally appear first (future enhancement, not required for v1)

## Exercise Database Source

Use whatever exercise list IronZ already has in its workout generation logic. This likely lives in a JS module that maps exercises to muscle groups, types, and metadata. The autocomplete should pull from the same source so it stays consistent with AI-generated workouts.

If the exercise list is currently embedded in workout generation code, consider extracting it to a shared `js/data/exercises.js` module that both the workout generator and the autocomplete can import.

**Data shape needed per exercise:**
```js
{
  name: "Bench Press",
  muscleGroup: "Chest",       // optional, for display in dropdown
  aliases: ["flat bench"]     // optional, for matching alternative names
}
```

## Implementation Notes

### Dropdown Component
- Position: absolutely positioned below the input field
- Width: matches the input field width
- Max height: ~300px with scroll if more than 8 results
- Z-index: above other workout card elements
- Mobile-friendly: large enough tap targets (min 44px row height)
- Keyboard support: arrow keys to navigate, Enter to select, Escape to dismiss

### Performance
- The exercise database will be small enough (a few hundred exercises) to filter client-side — no API calls needed
- Filter on every keystroke after the 2-character threshold using a simple `.filter()` + `.sort()`
- Consider debouncing input by ~100ms if there are performance concerns, but likely unnecessary for this data size

### Mobile Considerations
- The dropdown must work well with the on-screen keyboard visible — it should not be obscured
- If the input is near the bottom of the screen, the dropdown should appear ABOVE the input instead of below
- Tap-to-select should work smoothly without accidentally triggering other workout card elements

### Styling
- Match the existing IronZ dark theme
- Subtle border/shadow to distinguish the dropdown from the workout card background
- Highlight the matching text portion in each suggestion (e.g., bold the "Be" in "**Be**nch Press")
- Selected/focused row gets a subtle highlight color

## What This Is NOT

- This is NOT a required field — users can type anything
- This is NOT spell-check — don't red-underline unrecognized exercises
- This is NOT a search feature — it only matches against the local exercise database, not the internet
- This does NOT block form submission — any text in the exercise name field is valid

## Files to Create/Modify

- `js/data/exercises.js` — shared exercise database (extract from existing workout generation if needed)
- `js/ui/exercise-autocomplete.js` — new autocomplete dropdown component
- `js/ui/manual-workout.js` (or equivalent) — wire up autocomplete to exercise name inputs
- `style.css` — dropdown styles
- `index.html` — any structural changes needed for dropdown positioning
