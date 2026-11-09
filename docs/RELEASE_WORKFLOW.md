# Iron Z release and test environment workflow

## Branches

`main` is production. Work on short-lived `codex/<task>` or `claude/<task>` branches and open a pull request into `main`. Each branch has one owner. Another agent reviews it, and Chase merges it after checking the results. Do not push directly to main or change another agent's branch.

A permanent `develop` or `test` branch is unnecessary at this stage. Test the proposed change itself; a separate test branch can drift and does not protect the production database.

## GitHub safeguards

Require a pull request, resolve review conversations, prevent force pushes and branch deletion, and apply protections to administrators. Require automated checks by their exact published names once the corresponding workflows have run. Do not label a PR-only rule as a passing-test requirement.

The same GitHub identity may author work through both coding tools, so GitHub may not accept its own review as an independent approval. Keep the reviewer handoff explicit and let Chase make the final merge decision. Additional human collaborators can enable a mandatory approval count without blocking the sole-owner workflow.

Claude's PR 12 introduces the test workflow. Codex's build repair introduces a separate client-build check. After both land, require the successful test and build jobs on future pull requests. Quarantined behavior tests must remain clearly reported and have follow-up work; green CI is not a claim that those behaviors pass.

## Environments

| Environment | Website | Data and services | Purpose |
| --- | --- | --- | --- |
| Local | Local build from a task branch | Synthetic data and a development/staging backend | Fast development and isolated regression checks |
| Staging | A preview deployment of the proposed commit | Separate Supabase project, separate test OAuth callbacks, test billing and notification settings | Real sign-in, persistence, integration, and phone checks before release |
| Production | `https://ironz.fit` from main under the current GitHub Pages setup | Existing production Supabase project and live services | Real athlete use |

Staging is a target configuration, not an environment already provisioned by these docs. The current `js/supabase-init.js` points at production. Serving the same files at another URL does **not** make a safe staging environment. Until backend configuration is separated, call generated output a build artifact, not staging. Never embed service-role credentials in a frontend or a build artifact.

Use dedicated, synthetic athlete and coach accounts with invented profile data. Include two devices for the same test athlete, two unrelated athletes for isolation checks, and an administrator role assigned server-side. Keep emails deliverable to a controlled test inbox. Never send real production notifications or live charges from staging. Do not copy real health records into fixtures or the public repository.

## Releasing a change

1. Refresh the remote branches, read `AGENTS.md` when available, and inspect current handoffs and open PRs.
2. Make one focused change on a task branch. Run the relevant tests and build. Record failures honestly.
3. Open a PR with the problem, changed behavior, evidence, risks, and any required backend steps. Request the other agent's review.
4. Exercise relevant journeys in staging once configured. A database change must support the old client during rollout and have a recovery plan.
5. Chase merges only after the review and required checks. Under the current hosting setup, merging main publishes the website and affects the remote-loading iOS app.
6. Verify the published commit, sign-in, core athlete journey, and error reporting. If a frontend release fails, revert its PR. A frontend revert does not undo database migrations or restore deleted data.

Do not switch GitHub Pages publishing mode, alter production database data, deploy migrations, or enable live payments merely to validate the build pipeline. Those release changes need their own concrete, reviewed implementation.
