# Philosophy Update: Threshold Testing Sessions
**Date:** April 10, 2026  
**Priority:** HIGH — affects workout generation and plan structure

## Problem
The plan generator currently outputs "Threshold Bike" sessions structured as interval work (e.g., 2×20 min at 95% FTP). This is wrong. Threshold tests are maximal single-effort tests used to establish training zones, not training sessions.

## Required Changes

### 1. Rename Threshold Tests
| Current Name      | Correct Name     | Sport    |
|-------------------|------------------|----------|
| Threshold Bike    | FTP Test         | Cycling  |
| Threshold Run     | 5K Time Trial    | Running  |
| Threshold Swim    | CSS Test         | Swimming |

### 2. Correct Test Protocols

**FTP Test (Cycling)**
- Warmup: 10 min easy spin with a few openers
- Test: 20 min ALL-OUT sustained effort (record average power)
- Cooldown: 10 min easy spin
- Total: ~40-45 min
- NOT intervals. NOT 2×20. A single continuous max effort.
- FTP is estimated as 95% of the 20-min average power.

**5K Time Trial (Running)**
- Warmup: 10-15 min easy jog with strides
- Test: 5K continuous race-pace effort
- Cooldown: 10 min easy jog
- NOT broken into intervals or segments. Run the full 5K as hard as possible.

**CSS Test (Swimming)**
- Warmup: 400m easy mixed strokes
- Test Set: 400m all-out (record time), rest 5 min, 200m all-out (record time)
- Cooldown: 200m easy
- CSS pace is calculated from the 400m and 200m times.

### 3. Scheduling Rules
- All threshold tests for a multi-sport athlete belong in the SAME week ("Test Week")
- Space tests within the week so there's at least 1 rest/easy day between them (e.g., Mon FTP, Wed 5K TT, Fri CSS)
- NO back-to-back test weeks — minimum 4-6 weeks of training between test blocks
- Test weeks typically appear at: start of plan (baseline), mid-plan, end of plan
- Test week should have reduced overall volume to allow fresh performances

### 4. When Tests Appear in a Plan
- **Week 1 or 2**: Baseline testing (establish initial zones)
- **Mid-plan** (e.g., Week 6-8 of a 12-week plan): Progress check, update zones
- **Final week or penultimate week**: Final assessment
- A 4-week plan might only have one test week (Week 1)
- An 8-week plan: test Week 1, retest Week 7-8
- A 12+ week plan: test Week 1, mid-test ~Week 6, final test Week 11-12

### 5. Impact on Zone Calculations
After each test, training zones should be recalculated:
- Bike zones: based on new FTP (95% of 20-min power)
- Run zones: based on new 5K pace
- Swim zones: based on new CSS pace
