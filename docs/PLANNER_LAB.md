# Planner lab

An isolated first implementation of the fitness-to-demand planning proposal.
Start a local static server from the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/planner-lab.html. Select Alex, Blake, Casey or Drew;
edit recent training, tests, availability and draft rules; click Generate preview.
The page shows all seven days, blocks, targets, totals, reasons and unallocated
minutes. Exclude an activity or pause training to inspect precedence. Change FTP
conversion from .95 to .90: power changes without increasing capacity. Near-race,
recovery and taper inputs reduce work. Export/import JSON to retain a scenario;
there is no account, autosave or live-plan write. Use fictional data in shared files.

## What the repository review found

The live path remains planner.js. The target Rule Engine's classifier, arc builder,
assembler and plan-generator entry point exist, but generate() can read browser
state and assumes age/weight/height when absent. The assembler relies on level/
phase templates and lacks the recent per-sport capacity contract needed here.
Generic adaptation/return text also differs from the agreed design. Simply wiring
that path into the app would not implement this proposal.

The lab loads the existing entry point and adds PlanGenerator.generatePreview
from a pure companion module, also runnable in Node. It does not invoke generate,
storePlan, the legacy planners, DB or coaching services. The new module contains
the capacity-aware week allocation and provisional fitness/demand calculations.
No index.html change, schema migration, philosophy sync or production deployment.
This lab is an owner-requested method-review aid, not a change to the delivery
queue in FOUNDATION_PLAN.md or authorization to pass its publication/adoption gates.

This is a preview slice for the target Rule Engine, not an additional production
generator. The next integration must consolidate its input contract and dose/
placement rules into the classifier/arc/assembler, preserving these fixtures;
do not switch production to the lab's deliberately separate output shape.

## Limits to inspect while testing

- One explicitly selected phase/week; no full arc or automatic next-week adaptation.
- Full-distance triathlon only. No claim of Hyrox or general hybrid coverage.
- Recent capacity is supplied, not inferred from completion records or wearables.
- Quality minutes alone do not establish prior interval structure or intensity.
- No separate swim-duration history, sport-frequency history, execution grading,
  physiological stress model, course physics, nutrition or hydration prescription.
- Strength is a limited familiar-movement maintenance placeholder, not the existing
  exercise library or an individualized lifting prescription.
- Fixed preferences can leave time unallocated or add rest days. Warnings expose
  gaps; availability is never treated as a requirement to fill.
- Race outputs are explicit sensitivity assumptions; missing long-run evidence
  withholds the run/total rather than converting a 5K into an Ironman marathon.
- Race scenarios do not yet drive session dosing; the first slice establishes
  capacity-bounded allocation. Demand-aware phase and dose selection is next.
- Settings are draft, in memory; no shared rule publishing, database persistence,
  existing-plan migration or AI integration.

Master spec Appendix G is the policy source for this preview, including exact
coefficients, limits, order, tie-breaking and exclusions. Other production rules
remain unchanged. The lab is not linked from the production app. If its files are
merged into the GitHub Pages root they will be public static assets, without
access to athlete records. Do not deploy until reviewed.

## Verification

`node tests/planner-preview.test.js` exercises determinism, fixture differences,
rule effects, missing data, pause/exclusions, taper/recovery, invalid inputs,
growth caps, availability matrices and live isolation. `npm test` runs it with
the repository suite. No tests were added to quarantine.

## Next implementation boundary

Add explicit prior session structures and sport-frequency/duration history before
claiming capacity validation. Replace sensitivity bands with validated event
models. Introduce versioned published rule persistence and a server wrapper only
after the preview contract is reviewed. Keep future database changes in their own
tested migration PR. Independent review is required before merging.
