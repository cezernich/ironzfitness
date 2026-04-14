# BUGFIX: Bike Selection Advisory — Factually Incorrect

## Problem

The "Bike Selection" advisory card currently says:

> "For Ironman, a road bike is the smarter first choice. You'll spend 90 minutes on the bike, not 5+ hours."

**This is completely wrong.** The Ironman bike leg is 112 miles (180 km). Most age-group athletes spend 5–7 hours on the bike. A TT/tri bike is the standard and correct recommendation for Ironman — the aerodynamic position saves 30–60+ minutes over that distance.

## Steps

### 1. Find the bike selection advisory text

Search the entire codebase for the string "90 minutes on the bike" or "Bike Selection" or "smarter first choice". It may be:
- Hardcoded in a JS module or HTML template
- In a prompt string that generates the advice via AI
- In a Supabase table or JSON config

Wherever it lives, it needs to be replaced.

### 2. Replace with distance-dependent bike advice

The bike recommendation should vary by race distance. Replace the single advisory with logic that checks the user's target race distance and shows the appropriate guidance:

**Sprint (12–15 mi / 20–25 km bike):**
> Road bike recommended. At this distance (30–45 minutes on the bike), comfort, handling, and fast transitions matter more than aerodynamics. A TT bike is overkill for sprint racing.

**Olympic (25 mi / 40 km bike):**
> Either road or TT bike works well. You'll spend 60–90 minutes on the bike. Road bike gives more versatility for training; TT bike gives a small race-day edge. Use what you have.

**Half Ironman / 70.3 (56 mi / 90 km bike):**
> TT bike recommended. At 2.5–3.5 hours on the bike, the aero position saves meaningful time — often 10–20 minutes vs. a road bike. If budget allows, this is where a TT bike starts paying for itself.

**Full Ironman (112 mi / 180 km bike):**
> TT bike strongly recommended. You'll spend 5–7 hours on the bike. The aerodynamic savings compound over this distance — often 30–60+ minutes vs. a road bike. Invest in a proper bike fit. This is the single biggest equipment decision for Ironman racing.

**No race selected / base building:**
> Road bike is the most versatile training bike. It works for group rides, varied terrain, and all race distances. If you're planning to race half or full Ironman distance, consider a TT bike when you're ready — but a well-fitted road bike with clip-on aero bars is a solid intermediate step.

### 3. If this text is AI-generated (not hardcoded)

If the advisory comes from a Claude API call or AI prompt rather than static text:
- The prompt feeding the AI needs to be updated with correct facts
- Better: source the bike advice from the new `IRONZ_KNOWLEDGE_BASE.md` file (see below) so the AI is constrained by factual content
- The knowledge base file should be loaded as context alongside philosophy modules when generating gear advice

### 4. Test

After fixing, trigger the bike selection advisory for each race distance (Sprint, Olympic, Half, Full) and verify the correct text appears. Also test with no race selected.

## Commit message

Fix factually incorrect bike selection advice — was recommending road bike for Ironman and claiming 90-minute bike leg (actual: 112 miles, 5-7 hours). Now distance-dependent with correct recommendations per race type.
