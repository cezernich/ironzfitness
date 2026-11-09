# Profile migration replay order

The two existing migration files are immutable, including their contents and filenames. Supabase CLI2.84.2 discovers files lexically: the14digit `20261109174117_restrict_coach_profile_reads.sql` precedes8digit `20261109_secure_profiles.sql`, which recreates the row-level coach read policy.

The final corrective migration was created using `supabase migration new enforce_final_profile_privacy`. Its generated version was moved to the next calendar-day prefix solely to sort after the legacy8digit filename. Migration versions are sequence keys; this does not schedule a future deployment. A same-day14digit version cannot fix this order.

The SQL test now enumerates the actual ordered profile migration paths through `scripts/profile-migrations.js`, applies the complete sequence twice to a disposable database, and checks assigned athletes cannot read the coach row while narrow cards still work. The node regression makes the original bad order explicit and requires the final correction to sort last.

Staging already applied candidate base/security and privacy migrations under distinct managed versions. Production's manually applied secure-profile entry has managed version20261109205427; catalog inspection showed the privilege guard present and broad profile policies absent on9November. Do not rewrite, delete or repair those historical ledger entries as part of this correction. Apply only the new idempotent DROP-policy correction to an existing environment; record its new managed version normally and verify final policies. Do not replay every legacy repository migration against an existing project or mark unverified migrations applied.

This fixes this profile migration chain, not the entire historic schema/ledger drift. Fresh full-project recreation still requires the separate reviewed schema-baseline reconciliation.
