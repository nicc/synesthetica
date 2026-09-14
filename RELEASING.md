# Releasing

Cutting a new version of `synesthetica` on npm.

## Every release

1. **Update `CHANGELOG.md`.** Move whatever's under `## [Unreleased]` into a new `## [X.Y.Z] — YYYY-MM-DD` block. Add fresh comparison links at the foot. Keep the format from earlier releases.

2. **Verify the tree is clean and pushed.**

   ```bash
   git status
   git pull --rebase
   ```

3. **Bump the version.** From the CLI package (which is what publishes):

   ```bash
   cd packages/cli
   npm version <patch|minor|major>
   cd ../..
   ```

   `npm version` bumps `packages/cli/package.json`, commits the bump, and creates a `vX.Y.Z` tag.

4. **Push the tag.**

   ```bash
   git push --follow-tags
   ```

   The tag push fires `.github/workflows/publish.yml`, which:
   - Re-runs the full quality gate (build + test -ws + lint)
   - Confirms the tag version matches `packages/cli/package.json`
   - Runs `npm publish --dry-run` for a tarball sanity print
   - Publishes with `--provenance` via npm's trusted-publisher OIDC flow (no NPM_TOKEN secret)
   - Creates a matching GitHub Release with the CHANGELOG entry attached

5. **Verify.**

   ```bash
   # Wait a minute for the registry to propagate, then:
   npx synesthetica@latest --help
   ```

   Also eyeball the package page at `https://www.npmjs.com/package/synesthetica` — the "Provenance" section should show a green "Built and signed on GitHub Actions" badge linking back to the tag commit.

## First-time bootstrap

The trusted-publisher flow only works once the package exists on the registry. So the very first release (`1.0.0`) is manual:

1. Do steps 1–3 above.
2. Skip step 4. Instead, from a fresh terminal:

   ```bash
   npm login   # requires 2FA
   cd packages/cli
   npm publish --provenance --access public
   ```

3. On npmjs.com, go to the `synesthetica` package page → Settings → Access → **Trusted Publisher**. Configure:
   - Publisher: GitHub Actions
   - Repository: `nicc/synesthetica`
   - Workflow file: `.github/workflows/publish.yml`
   - Environment: `publish`

4. On GitHub, go to Settings → Environments → **New environment**, name it `publish`. Optionally add a required-reviewer protection rule if you want a human "publish yes/no" gate before every release.

5. Push the `v1.0.0` tag so a Release object exists on GitHub even though the publish step was manual:

   ```bash
   git push --follow-tags
   ```

   The publish workflow will fire, hit the `synesthetica@1.0.0 already exists` error at the publish step, and stop. That's expected — 1.0.0 is already on the registry. From `1.0.1` onward every release runs cleanly through the workflow.

## Hotfixes

Same flow. Cherry-pick the fix onto main, run through steps 1–5.

## What's excluded from the tarball

The `files` array in `packages/cli/package.json` controls what ships:

- `dist/` (bundled `bin.js` + `index.js`, static web-app, prompts)
- `LICENSE` (copied in by the `prepack` script)
- `README.md`

Nothing else — no source, no specs, no tests, no CI config. Verify with `npm pack --dry-run` from `packages/cli/` if the shape of a release changes.

## Rollback

npm allows unpublishing within 72 hours of publish for packages with no dependents. Beyond that you can only `npm deprecate` the version with a message. **Prefer forward-fix over unpublish** — cut `X.Y.Z+1` with the fix. Unpublish is a nuclear button.
