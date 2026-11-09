# Iron Z client build

Run `npm run build` to generate `www/` using Node 20 or newer. No package install is needed for this packaging step. The command copies an explicit set of browser runtime files and preserves their URLs, including `js/`, supported assets, share/invite pages, and the static philosophy module fallback. It rejects missing local assets referenced by the main/pricing shells and manifest icons. External URLs and dynamically generated URLs still require browser checks.

The output is cleaned on each successful rebuild, so files from the former rsync command cannot remain. Backend functions, migrations, CLI scratch, tests, tooling, documentation, and athlete spreadsheets are not included. A missing required input fails before the previous output is removed.

Run `node tests/client-build.test.js` for the packaging regression check. The `client-build` GitHub Actions job runs it for pull requests and main. This check does not replace athlete behavior tests or database authorization tests.

`capacitor.config.ts` points `webDir` to `www/`, so `npm run sync` can use the packaged client after dependencies are installed. The existing `server.url` still loads `https://ironz.fit` at runtime. This change does not migrate iOS to offline/bundled operation or claim an Xcode archive was validated.

GitHub Pages currently serves the repository root of main. Building `www/` does not publish it or change that setting. Migrating Pages to a client-only deployment artifact needs a separate reviewed release change. Until then, repository-root files remain potentially public regardless of what this build excludes.

This output still uses the existing production Supabase client configuration. It is not an isolated staging environment. Configure a separate test backend and service settings before using a preview for test-account or destructive data checks.
