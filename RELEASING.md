# Releasing

Cutting a new version of `synesthetica` on npm.

## Every release

`main` is protected, so the version bump lands through a PR and the tag is pushed after the merge.

1. **Branch from an up-to-date `main`.**

   ```bash
   git switch main && git pull --rebase
   git switch -c release/vX.Y.Z
   ```

2. **Update `CHANGELOG.md`.** Move whatever's under `## [Unreleased]` into a new `## [X.Y.Z] — YYYY-MM-DD` block. Add fresh comparison links at the foot. Keep the format from earlier releases.

3. **Bump the version** in the CLI package (which is what publishes), without tagging:

   ```bash
   npm version <patch|minor|major> --no-git-tag-version -w synesthetica
   git commit -am "Release X.Y.Z"
   ```

   This bumps `packages/cli/package.json` and the lockfile entry.

4. **Open a PR and merge it.** `git push -u origin release/vX.Y.Z`, then `gh pr create`. CI and the review run as on any PR.

5. **Tag the merged commit and push the tag.**

   ```bash
   git switch main && git pull --rebase
   git log -1 --oneline          # must be the release merge
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   The tag push fires `.github/workflows/publish.yml`, which:
   - Installs npm 11 (trusted publishing needs npm ≥ 11.5.1)
   - Re-runs the full quality gate (build + typecheck + test + lint)
   - Confirms the tag version matches `packages/cli/package.json`
   - Runs `npm publish --dry-run` for a tarball sanity print
   - Publishes with `--provenance` via npm's trusted-publisher OIDC flow (no NPM_TOKEN secret)
   - Creates a matching GitHub Release with the CHANGELOG entry attached

6. **Verify.**

   ```bash
   # Wait a minute for the registry to propagate, then:
   npx synesthetica@latest --help
   ```

   Also eyeball the package page at `https://www.npmjs.com/package/synesthetica` — the "Provenance" section should show a green "Built and signed on GitHub Actions" badge linking back to the tag commit.

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

Same flow. Land the fix on `main` through a PR, then run steps 1–6.

## What's excluded from the tarball

The `files` array in `packages/cli/package.json` controls what ships:

- `dist/` (bundled `bin.js` + `index.js`, static web-app, prompts)
- `LICENSE` (copied in by the `prepack` script)
- `README.md`

Nothing else — no source, no specs, no tests, no CI config. Verify with `npm pack --dry-run` from `packages/cli/` if the shape of a release changes.

## Rollback

npm allows unpublishing within 72 hours of publish for packages with no dependents. Beyond that you can only `npm deprecate` the version with a message. **Prefer forward-fix over unpublish** — cut `X.Y.Z+1` with the fix. Unpublish is a nuclear button.
