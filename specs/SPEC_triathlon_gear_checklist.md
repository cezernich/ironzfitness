# IronZ Triathlon Gear Checklist — In-App Feature Spec

## Overview

When a user has a triathlon race as an active training input, the app surfaces a contextual equipment checklist. The checklist is pre-populated based on the race distance (Sprint, Olympic, Half Ironman, Full Ironman), organized by tier (Need / Nice to Have / Extra) and category (Swim, Bike, Run, Transition, Nutrition). Users check items off as they acquire or pack them, and can remove items they don't need.

## UX Flow

1. User has a triathlon race in Active Training Inputs (e.g., "Ironman Triathlon — Aug 29, 2026")
2. A **"Gear Checklist"** button appears on the training input card (small icon + text, like a clipboard icon)
3. Tapping it opens a **modal/popup** with the full checklist
4. Checklist state persists in localStorage (and syncs to Supabase if user is logged in)
5. Progress indicator on the button: "12/36 items" or a small progress bar

## Modal Design

### Header
- Title: "Race Day Gear — [Race Name]"
- Subtitle: "[Distance] · [Date] · [X] weeks away"
- Progress bar showing checked items / total items
- Close button (X)

### Filter/View Options (pills at top)
- **All** | **Need** | **Nice to Have** | **Extra**
- Tapping a pill filters the list to that tier only
- Default view: "All" with Need items first

### Checklist Body

Organized by category with collapsible sections:

**SWIM**
- ☐ / ☑ Item name — tier badge (NEED / NICE / EXTRA)
  - Expandable: "Why" text + "Pro Tip" text (tap to expand)
  - Swipe left or tap X to remove item from your list

**BIKE**
(same pattern)

**RUN**
(same pattern)

**TRANSITION**
(same pattern)

**NUTRITION**
(same pattern)

### Item States
- **Unchecked (☐)** — default, item not yet acquired/packed
- **Checked (☑)** — user has it, green checkmark, item text gets subtle strikethrough or muted color
- **Removed** — user swiped to remove, item is hidden (can be restored via "Show removed items" link at bottom)

### Footer
- "Show removed items" link (if any have been removed)
- "Reset checklist" — restores default list for the distance

## Data Model

### Checklist stored per race in localStorage and Supabase

```javascript
{
  raceId: "input-abc123",        // links to the training input
  raceType: "triathlon",
  distance: "full",              // sprint | olympic | half | full
  items: [
    {
      id: "swim-goggles",
      category: "swim",
      name: "Goggles",
      tier: "need",              // need | nice | extra
      checked: true,
      removed: false,
      why: "You literally cannot see without them in open water",
      tip: "Get two pairs — clear lens for cloudy days, tinted for sun."
    },
    // ... more items
  ],
  updatedAt: "2026-04-13T..."
}
```

### Supabase Table (optional, for sync)

```sql
CREATE TABLE race_checklists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  race_input_id text NOT NULL,
  distance text NOT NULL,
  items jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, race_input_id)
);
```

RLS: users can only read/write their own checklists.

## Pre-Populated Equipment by Distance

Items are tagged with which distances they apply to. When generating the checklist for a specific distance, only include relevant items.

Legend: ● = include by default, — = don't include

### SWIM

| Item | Tier | Sprint | Olympic | Half | Full |
|------|------|--------|---------|------|------|
| Goggles | Need | ● | ● | ● | ● |
| Tri suit (one-piece or two-piece) | Need | ● | ● | ● | ● |
| Swim cap (race provided) | Need | ● | ● | ● | ● |
| Wetsuit | Need | ● | ● | ● | ● |
| Anti-fog spray / baby shampoo | Nice | ● | ● | ● | ● |
| Ear plugs | Nice | ● | ● | ● | ● |
| Swim skin (no-wetsuit races) | Extra | — | — | ● | ● |

### BIKE

| Item | Tier | Sprint | Olympic | Half | Full |
|------|------|--------|---------|------|------|
| Road or tri bike | Need | ● | ● | ● | ● |
| Helmet (CPSC certified) | Need | ● | ● | ● | ● |
| Cycling shoes + clipless pedals | Need | — | ● | ● | ● |
| Water bottles + cages (2) | Need | ● | ● | ● | ● |
| Flat repair kit (tube, levers, CO2) | Need | ● | ● | ● | ● |
| Tire pump (floor pump) | Need | ● | ● | ● | ● |
| Bike computer / GPS | Nice | ● | ● | ● | ● |
| Sunglasses | Nice | ● | ● | ● | ● |
| Chain lube | Nice | ● | ● | ● | ● |
| Aero bars (clip-on) | Nice | — | ● | ● | ● |
| Power meter | Extra | — | — | ● | ● |
| Deep section / disc wheels | Extra | — | — | ● | ● |

### RUN

| Item | Tier | Sprint | Olympic | Half | Full |
|------|------|--------|---------|------|------|
| Running shoes (properly fitted) | Need | ● | ● | ● | ● |
| Race belt with bib number | Need | ● | ● | ● | ● |
| Body Glide / anti-chafe | Need | ● | ● | ● | ● |
| Hat or visor | Nice | ● | ● | ● | ● |
| Elastic laces (lock laces) | Nice | ● | ● | ● | ● |
| GPS watch | Nice | ● | ● | ● | ● |
| Compression socks | Extra | — | — | ● | ● |

### TRANSITION

| Item | Tier | Sprint | Olympic | Half | Full |
|------|------|--------|---------|------|------|
| Transition bag / backpack | Need | ● | ● | ● | ● |
| Towel (small, bright color) | Need | ● | ● | ● | ● |
| Sunscreen (pre-applied) | Need | ● | ● | ● | ● |
| Nutrition (gels, bars, electrolytes) | Need | — | ● | ● | ● |
| Plastic bag for wet gear | Nice | ● | ● | ● | ● |
| Baby powder in shoes | Extra | ● | ● | ● | ● |

### NUTRITION (Race Day)

| Item | Tier | Sprint | Olympic | Half | Full |
|------|------|--------|---------|------|------|
| Energy gels (30-60g carbs/hr) | Need | — | ● | ● | ● |
| Salt / electrolyte tabs | Nice | — | ● | ● | ● |
| Caffeinated gel (for the run) | Nice | — | — | ● | ● |
| Bento box / top tube bag | Nice | — | ● | ● | ● |

## Trigger Logic

When to show the "Gear Checklist" button on a training input card:

```javascript
const isTriathlon = input.raceType === 'triathlon' 
  || input.name?.toLowerCase().includes('triathlon')
  || input.name?.toLowerCase().includes('ironman')
  || input.name?.toLowerCase().includes('70.3')
  || input.name?.toLowerCase().includes('sprint tri');
```

If `isTriathlon` is true, show the gear checklist button on the card.

### Distance Detection

Try to detect the distance from the race name or metadata:
- "Sprint" → sprint
- "Olympic" or "Standard" → olympic
- "70.3" or "Half" → half
- "Ironman" or "140.6" or "Full" → full
- If unclear → default to "full" (shows all items, user removes what they don't need)

## Analytics Events

- `gear_checklist_opened` — { distance, items_total, items_checked }
- `gear_checklist_item_checked` — { item_id, category, tier }
- `gear_checklist_item_removed` — { item_id, category, tier }
- `gear_checklist_completed` — when all non-removed items are checked

## Why / Pro Tip Content

Each item has a "Why you need it" and a "Pro Tip" — stored in the default item data. These expand on tap to give the user context. This is what makes it more than a dumb checklist — it's educational, especially for first-time triathletes.

The full content for each item is in the Excel file (IronZ_Triathlon_Equipment_Guide.xlsx) in the Ironz folder, columns I and J. Code should pull the text from there or from this spec's tables above.

## Future Enhancements (not in v1)

- "Share checklist" — send your gear list to a training partner
- "Buy" links — affiliate links to recommended products
- Other race types: marathon, ultra, Hyrox, swim meets
- AI recommendation: "Based on your race location and weather forecast, you should bring..."

## Files to Create/Modify

- `js/gear-checklist.js` — new module: checklist logic, default items data, distance mapping
- `js/ui/gear-checklist-modal.js` — new module: modal UI renderer
- `index.html` — add the modal HTML shell + gear checklist button on training input cards
- `style.css` — modal styles, checklist item styles, tier badges, progress bar
- Training input card renderer — add the "Gear Checklist" button when race is triathlon type
