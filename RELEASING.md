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
   - Installs npm 11 (trusted publishing needs npm ≥ 11.5.1)
   - Re-runs the full quality gate (build + typecheck + test + lint)
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

3. On npmjs.com, configure the trusted publisher (see [Trusted publisher setup](#trusted-publisher-setup) below).

4. On GitHub, go to Settings → Environments → **New environment**, name it `publish`. Optionally add a required-reviewer protection rule if you want a human "publish yes/no" gate before every release.

5. Push the `v1.0.0` tag so a Release object exists on GitHub even though the publish step was manual:

   ```bash
   git push --follow-tags
   ```

   The publish workflow will fire, hit the `synesthetica@1.0.0 already exists` error at the publish step, and stop. That's expected — 1.0.0 is already on the registry. From `1.0.1` onward every release runs cleanly through the workflow.

## Trusted publisher setup

The publish workflow authenticates to npm with GitHub's OIDC identity instead of a stored token. npm needs to be told which workflow may publish:

1. Sign in to npmjs.com (2FA), open **Packages → synesthetica → Settings → Trusted publishing**, and choose **GitHub Actions**.
2. Fill in exactly (all fields are case-sensitive):
   - Organization or user: `nicc`
   - Repository: `synesthetica`
   - Workflow filename: `publish.yml` — the filename only, not `.github/workflows/publish.yml`
   - Environment name: `publish`
3. Save. npm does not check the configuration when you save it; mistakes only show up at publish time.
4. **Publish within 2 days.** A trusted-publisher configuration expires if its first successful publish doesn't happen within 2 days of saving it. If it expires, delete it and save it again.

Requirements on the workflow side, already in `publish.yml`:
- `permissions: id-token: write` on the job.
- npm CLI 11.5.1 or later (the job runs `npm install -g npm@11`; Node 22's bundled npm 10 is too old) and Node 22.14 or later.
- A GitHub-hosted runner.
- `repository.url` in `packages/cli/package.json` matching the GitHub repository.

Provenance is generated automatically for an OIDC publish from a public repository.

### If the publish step fails with E404

`404 Not Found - PUT https://registry.npmjs.org/synesthetica` with "'synesthetica@X.Y.Z' is not in this registry" means npm received the publish without valid credentials. Check, in order:
1. The job's npm version (`npm --version` is printed by the workflow) is at least 11.5.1.
2. The trusted-publisher configuration exists, hasn't expired, and its fields match the list above exactly.
3. The environment name in the workflow (`environment: publish`) matches the configuration.

To retry after fixing the configuration, re-run the failed workflow from the Actions tab rather than re-tagging. If a fallback is needed, publish from a laptop: `npm login`, then `npm publish --access public` in `packages/cli`.

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
