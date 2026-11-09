# Iron Z session log

## 9 November 2026 staging setup in progress

Chase requested complete staging setup with synthetic users, Claude coordination, testing before any real-user release, and durable session closeout. Created the isolated staging project with explicit organization/cost approval, copied only public database definitions, provisioned four synthetic Auth users, and built a production-isolated client preview. Production was not migrated or released.

Reviewed the original Claude security candidate and reproduced a privacy failure through real staging Auth/Data API calls. Opened focused PR 18 and applied its correction only to staging for verification. Initial reference module insertion needed consistent bulk keys; that seed-format issue was corrected. Current session remains open; final test and deployment evidence will be appended at closeout.
