# Docker Build Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish multi-architecture Docker images (`linux/amd64` + `linux/arm64`) to `ghcr.io/czepter/parsedmarc-nuxt` automatically on every push to `main` and every `v*` git tag, gated on the existing test suite passing.

**Architecture:** Two-file CI/CD split. Extend `.github/workflows/ci.yml` with a `v*` tag trigger so releases are tested. Add `.github/workflows/build.yml` chained off CI completion via the `workflow_run` trigger. The build job uses Docker Buildx + QEMU emulation to produce a single multi-arch image manifest, with GitHub Actions cache (`type=gha,mode=max`) for layer reuse and `docker/metadata-action` for tag generation.

**Tech Stack:** GitHub Actions, Docker Buildx, QEMU (for arm64 cross-build), GitHub Container Registry (GHCR), `docker/metadata-action@v5`, `docker/build-push-action@v6`. No application code changes.

**Spec:** `docs/superpowers/specs/2026-05-06-docker-build-pipeline-design.md`

**Deviation from spec (intentional):** `build.yml` includes a `workflow_dispatch:` trigger in addition to `workflow_run`. This is a permanent operational feature — a manual "Run workflow" button in the Actions UI for ad-hoc rebuilds and for derisking the first-merge flow. The `if:` filter restricts manual dispatch to `main` and `v*` refs (same constraint as the chained trigger). Veto by removing the four lines marked `# manual-dispatch` if not wanted.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `.github/workflows/ci.yml` | modify (1 line added) | Extend `push:` trigger to also fire on `v*` tags, so tag-based releases are tested before being chained to the build |
| `.github/workflows/build.yml` | create | Multi-arch Docker build & publish to GHCR; chained off CI completion via `workflow_run` |
| `Dockerfile`, `start.sh`, `docker-compose.yml`, `package.json` | unchanged | Existing artifacts are already multi-arch-compatible (Debian/glibc base, prebuilt native deps for both archs) |

**Sequencing constraint:** Both files must be merged together. If `ci.yml` is updated to trigger on tags before `build.yml` exists, tag pushes run tests but produce no images — harmless. If `build.yml` is added before `ci.yml` is extended, tag pushes never trigger the chain — also harmless. Either order works, but bundling them in one PR is simpler.

**Verification constraint:** `workflow_run` runs against the **default branch's** version of the workflow file. This means changes to `build.yml` only take effect once merged to `main` — there is no PR-time test of `build.yml`'s logic. The `workflow_dispatch` trigger (Task 3) is the only way to manually exercise `build.yml` end-to-end after merge without waiting for the next push to `main`. This shapes the verification ordering in Tasks 6–10.

---

## Task 1: Extend `ci.yml` Push Trigger

**Files:**
- Modify: `.github/workflows/ci.yml:3-7`

- [ ] **Step 1: Open the workflow and locate the trigger block**

The current block is:

```yaml
on:
  pull_request:
  push:
    branches: [main]
```

- [ ] **Step 2: Add `tags: ['v*']` to the `push` trigger**

Replace with:

```yaml
on:
  pull_request:
  push:
    branches: [main]
    tags: ['v*']
```

This is the only change to `ci.yml`. Without it, pushing a `v*` tag would not run tests, and `workflow_run` in `build.yml` would not fire for tag releases.

- [ ] **Step 3: Validate the YAML still parses**

Run from repo root:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: silent exit (no output, exit code 0). Any YAML syntax error prints a `yaml.YAMLError` traceback.

- [ ] **Step 4: Do not commit yet**

Wait until `build.yml` is also written (Task 2), then commit both files together as one logical change.

---

## Task 2: Create `build.yml`

**Files:**
- Create: `.github/workflows/build.yml`

- [ ] **Step 1: Write the full file**

Create `.github/workflows/build.yml` with the following exact contents:

```yaml
name: Build & Publish Docker

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  workflow_dispatch:  # manual-dispatch

permissions:
  contents: read
  packages: write

env:
  IMAGE: ghcr.io/czepter/parsedmarc-nuxt

concurrency:
  group: build-${{ github.event.workflow_run.head_branch || github.ref_name }}
  cancel-in-progress: ${{ (github.event.workflow_run.head_branch || github.ref_name) == 'main' }}

jobs:
  build:
    if: |
      (github.event_name == 'workflow_dispatch' &&
       (github.ref_name == 'main' || startsWith(github.ref_name, 'v'))) ||
      (github.event_name == 'workflow_run' &&
       github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.event == 'push' &&
       (github.event.workflow_run.head_branch == 'main' ||
        startsWith(github.event.workflow_run.head_branch, 'v')))
    runs-on: ubuntu-latest
    timeout-minutes: 45

    steps:
      - name: Resolve ref (workflow_run uses default branch by default)
        id: ref
        run: |
          if [[ "${{ github.event_name }}" == "workflow_run" ]]; then
            REF="${{ github.event.workflow_run.head_branch }}"
            SHA="${{ github.event.workflow_run.head_sha }}"
          else
            REF="${{ github.ref_name }}"
            SHA="${{ github.sha }}"
          fi
          echo "name=$REF" >> "$GITHUB_OUTPUT"
          echo "sha=$SHA" >> "$GITHUB_OUTPUT"
          echo "short_sha=${SHA:0:7}" >> "$GITHUB_OUTPUT"

      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ steps.ref.outputs.sha }}

      - name: Set up QEMU (arm64 emulation)
        uses: docker/setup-qemu-action@v3
        with:
          platforms: arm64

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Compute tags
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE }}
          tags: |
            type=raw,value=main,enable=${{ steps.ref.outputs.name == 'main' }}
            type=raw,value=sha-${{ steps.ref.outputs.short_sha }},enable=${{ steps.ref.outputs.name == 'main' }}
            type=semver,pattern={{version}},value=${{ steps.ref.outputs.name }}
            type=semver,pattern={{major}}.{{minor}},value=${{ steps.ref.outputs.name }}
          flavor: |
            latest=${{ startsWith(steps.ref.outputs.name, 'v') && !contains(steps.ref.outputs.name, '-') }}

      - name: Build and push (multi-arch)
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Key points:
- The `if:` guard skips PR-triggered CI runs (`event == 'push'`), failed CI runs, and refs other than `main` or `v*`.
- The `Resolve ref` step is the workaround for the `workflow_run` "default branch" footgun: `github.ref` and `github.sha` in this context point at the default branch, not the triggering ref. We pull from `github.event.workflow_run.head_branch` / `head_sha` instead.
- `value=${{ steps.ref.outputs.name }}` overrides on `type=semver` rules force the action to read the resolved branch/tag name instead of `GITHUB_REF` (also wrong in `workflow_run` context).
- The `flavor: latest=...` expression enforces the pre-release rule: `:latest` only for `v*` tags that don't contain a hyphen (i.e., not `v1.2.3-beta.1`).
- `mode=max` caches every intermediate layer (~600 MB post-`pnpm install`, plus apt-install runtime layer); subsequent app-code-only builds finish in ~5–8 min vs ~20–25 min cold.

- [ ] **Step 2: Validate the YAML parses**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build.yml'))"
```

Expected: silent exit (no output, exit code 0).

- [ ] **Step 3: Validate workflow expressions (optional, if `actionlint` is installed)**

Run:
```bash
actionlint .github/workflows/build.yml .github/workflows/ci.yml
```

Expected: no output. If `actionlint` is not installed, skip this step — Step 2 caught syntax errors and the live run will surface expression errors clearly.

- [ ] **Step 4: Commit both files together**

```bash
git add .github/workflows/ci.yml .github/workflows/build.yml
git commit -m "ci: add multi-arch docker build pipeline"
```

---

## Task 3: Open PR and Verify CI Still Passes

**Files:** none (CI exercises existing test suite plus the trigger change)

- [ ] **Step 1: Push the branch and open a PR**

If working on `main` directly per the spec (single-developer flow), skip this task and go to Task 4. If using a feature branch:

```bash
git push -u origin <branch-name>
gh pr create --title "ci: add multi-arch docker build pipeline" --body "$(cat <<'EOF'
## Summary
- Extend ci.yml to run on v* tags so releases are tested before being published
- Add build.yml for multi-arch Docker image publishing to ghcr.io/czepter/parsedmarc-nuxt

See spec: docs/superpowers/specs/2026-05-06-docker-build-pipeline-design.md
EOF
)"
```

- [ ] **Step 2: Watch CI run on the PR**

```bash
gh pr checks --watch
```

Expected: CI workflow runs, completes successfully (existing test suite). The new `Build & Publish Docker` workflow does NOT run on the PR — `workflow_run` only fires for default-branch versions of the workflow file, and PRs do not match the trigger filter anyway.

- [ ] **Step 3: Verify the diff in the PR is exactly two files**

```bash
gh pr diff
```

Expected: only `.github/workflows/ci.yml` (1 line added) and `.github/workflows/build.yml` (newly created).

---

## Task 4: Merge to `main`

**Files:** none

- [ ] **Step 1: Merge the PR (or push directly to main if not using a PR flow)**

Via PR:
```bash
gh pr merge --squash --delete-branch
```

Or, if working directly on `main`:
```bash
git push origin main
```

- [ ] **Step 2: Watch CI run on the merge commit**

```bash
gh run watch
```

Expected: CI workflow starts on the new `main` HEAD, runs the test suite (~5–8 min), completes successfully.

- [ ] **Step 3: Wait for `build.yml` to chain off CI**

Within ~30 seconds of CI completing successfully, `Build & Publish Docker` should appear as a queued workflow run. Confirm with:

```bash
gh run list --workflow=build.yml --limit 5
```

Expected: A new run with status `queued` or `in_progress`, triggered by `workflow_run`. If no run appears within 1 minute of CI success, see "Troubleshooting" at the end of this plan.

---

## Task 5: Watch the First Build Complete

**Files:** none

- [ ] **Step 1: Tail the build logs**

```bash
gh run watch
```

Expected timeline (cold cache):
- ~30s — checkout, QEMU/Buildx setup, GHCR login
- ~1 min — `docker/metadata-action` resolves tags
- ~15–25 min — `docker/build-push-action` builds amd64 (native, ~5 min) and arm64 (QEMU emulated, ~15 min) and pushes the multi-arch manifest
- Final status: `success`

- [ ] **Step 2: Confirm the package appeared in GHCR**

```bash
gh api /user/packages/container/parsedmarc-nuxt 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"name={d['name']} visibility={d['visibility']} url={d['html_url']}\")"
```

Expected: `name=parsedmarc-nuxt visibility=private url=https://github.com/users/czepter/packages/container/package/parsedmarc-nuxt`

The package exists but is **private** by default. Task 6 fixes this.

If the build failed, inspect logs:
```bash
gh run view --log-failed
```

---

## Task 6: Flip GHCR Package Visibility to Public (One-Time Manual)

**Files:** none (GitHub UI action)

- [ ] **Step 1: Open the package settings**

Navigate to:
```
https://github.com/users/czepter/packages/container/parsedmarc-nuxt/settings
```

(Or: GitHub → your profile → Packages → `parsedmarc-nuxt` → Package settings.)

- [ ] **Step 2: Change visibility to Public**

Scroll to the "Danger Zone" → click "Change visibility" → select "Public" → type the package name to confirm → submit.

- [ ] **Step 3: Verify visibility flipped**

```bash
gh api /users/czepter/packages/container/parsedmarc-nuxt 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['visibility'])"
```

Expected: `public`

- [ ] **Step 4: (Optional) Link the package to the repo**

On the same settings page, under "Manage Actions access" or "Connect repository", link the package to `czepter/parsedmarc-nuxt`. This makes the package appear in the repo's sidebar.

This is a one-time setup. All subsequent pushes inherit the public visibility and repo link.

---

## Task 7: Verify the Multi-Arch Manifest

**Files:** none

- [ ] **Step 1: Pull the `:main` image without auth**

```bash
docker pull ghcr.io/czepter/parsedmarc-nuxt:main
```

Expected: pulls successfully without requiring `docker login`. If this fails with `denied`, the package is still private — go back to Task 6.

- [ ] **Step 2: Inspect the multi-arch manifest**

```bash
docker manifest inspect ghcr.io/czepter/parsedmarc-nuxt:main | python3 -c "import sys,json; m=json.load(sys.stdin); print('\n'.join(f\"{e['platform']['os']}/{e['platform']['architecture']}\" for e in m['manifests']))"
```

Expected output (order may vary):
```
linux/amd64
linux/arm64
```

If only one architecture appears, the multi-arch build silently fell back to single-arch — inspect the `Build and push` step's logs in the failed run.

- [ ] **Step 3: Smoke-test the image runs**

```bash
docker run -d --name parsedmarc-smoke -p 13000:3000 \
  -e NUXT_SESSION_PASSWORD=test-not-a-real-secret-32-characters-min \
  ghcr.io/czepter/parsedmarc-nuxt:main
sleep 15
curl -fsS -o /dev/null -w "Status: %{http_code}\n" http://localhost:13000/ || echo "fetch failed (container may still be migrating, check logs)"
docker logs parsedmarc-smoke | tail -20
docker stop parsedmarc-smoke >/dev/null && docker rm parsedmarc-smoke >/dev/null
```

Expected: `Status: 200` (or any 2xx/3xx — the root path may redirect to `/login`). The `docker logs` tail should show `[start] Running prisma migrate deploy...` followed by `[start] Starting Nuxt server...` and a Nitro listening line. Host port `13000` is used to avoid colliding with anything bound to `3000` locally.

---

## Task 8: Verify the `workflow_run` Chain (No-op Push to `main`)

**Files:** none — this verifies the chain works end-to-end on `main`, which Task 4 already covered transitively. Skip this task if Task 5 succeeded.

- [ ] **Step 1: Push a no-op commit to main (optional)**

If you want to re-verify the chain without merging real changes:

```bash
git commit --allow-empty -m "ci: trigger build pipeline (no-op)"
git push origin main
```

- [ ] **Step 2: Confirm both workflows ran in sequence**

```bash
gh run list --limit 5
```

Expected: a `CI` run completed successfully, followed by a `Build & Publish Docker` run that started ~30s later and is in progress or completed. If `Build & Publish Docker` did not start, see "Troubleshooting".

---

## Task 9: Verify the Tag Publishing Path

**Files:** none

- [ ] **Step 1: Cut a `v0.1.0` tag from current `main`**

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 2: Confirm CI runs for the tag**

```bash
gh run list --workflow=ci.yml --limit 5
```

Expected: a new CI run triggered by the tag push. This validates the `tags: ['v*']` extension from Task 1.

- [ ] **Step 3: Wait for build.yml to chain and complete**

```bash
gh run watch
```

Expected: after CI succeeds for the tag, `Build & Publish Docker` runs and produces these tags:
- `ghcr.io/czepter/parsedmarc-nuxt:0.1.0`
- `ghcr.io/czepter/parsedmarc-nuxt:0.1`
- `ghcr.io/czepter/parsedmarc-nuxt:latest`

(Note: `:main` is NOT pushed for tag builds. `:sha-<short>` is also NOT pushed for tag builds — those are main-only.)

- [ ] **Step 4: Confirm all three tags exist in GHCR**

```bash
for t in 0.1.0 0.1 latest; do
  echo -n "ghcr.io/czepter/parsedmarc-nuxt:$t -> "
  docker manifest inspect "ghcr.io/czepter/parsedmarc-nuxt:$t" >/dev/null 2>&1 && echo "OK" || echo "MISSING"
done
```

Expected output:
```
ghcr.io/czepter/parsedmarc-nuxt:0.1.0 -> OK
ghcr.io/czepter/parsedmarc-nuxt:0.1 -> OK
ghcr.io/czepter/parsedmarc-nuxt:latest -> OK
```

- [ ] **Step 5: Confirm `:latest` and `:0.1.0` resolve to the same digest**

```bash
docker manifest inspect ghcr.io/czepter/parsedmarc-nuxt:latest -v | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['Descriptor']['digest'])"
docker manifest inspect ghcr.io/czepter/parsedmarc-nuxt:0.1.0 -v | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['Descriptor']['digest'])"
```

Expected: both commands print the same `sha256:...` digest. This proves they're the same image, just tagged differently.

---

## Task 10: Verify Pre-Release Behavior (Optional)

**Files:** none

This task validates that pre-release tags (containing a hyphen) skip `:latest` and `:major.minor` promotion, per spec §2.5. Skip if you don't plan to publish pre-releases.

- [ ] **Step 1: Cut a pre-release tag**

```bash
git tag v0.1.1-beta.1
git push origin v0.1.1-beta.1
```

- [ ] **Step 2: Wait for the build to complete**

```bash
gh run watch
```

- [ ] **Step 3: Confirm only the full version tag was created**

```bash
for t in 0.1.1-beta.1 0.1.1 0.1; do
  echo -n "ghcr.io/czepter/parsedmarc-nuxt:$t -> "
  docker manifest inspect "ghcr.io/czepter/parsedmarc-nuxt:$t" >/dev/null 2>&1 && echo "EXISTS" || echo "MISSING"
done
```

Expected output:
```
ghcr.io/czepter/parsedmarc-nuxt:0.1.1-beta.1 -> EXISTS
ghcr.io/czepter/parsedmarc-nuxt:0.1.1 -> MISSING
ghcr.io/czepter/parsedmarc-nuxt:0.1 -> MISSING
```

- [ ] **Step 4: Confirm `:latest` did NOT update**

```bash
docker manifest inspect ghcr.io/czepter/parsedmarc-nuxt:latest -v | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['Descriptor']['digest'])"
docker manifest inspect ghcr.io/czepter/parsedmarc-nuxt:0.1.0 -v | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['Descriptor']['digest'])"
```

Expected: both digests still match (i.e., `:latest` still points at `:0.1.0`, not the beta tag).

---

## Troubleshooting

**`Build & Publish Docker` doesn't trigger after CI succeeds.**

`workflow_run` triggers only when both these conditions hold:
1. The triggered workflow file (`build.yml`) exists on the **default branch** at the time CI completes.
2. The triggering CI run was started by a `push` event (not a manual `workflow_dispatch` of CI itself, and not from a PR triggered from a fork).

If `build.yml` was just merged but the CI run that triggered the chain started **before** the merge, the chain won't fire — wait for the next CI run. To force a manual run without waiting, use the workflow_dispatch trigger:
```bash
gh workflow run build.yml --ref main
```

**Build fails with "denied: permission_denied" on push to GHCR.**

The job needs `permissions: packages: write` at the job or workflow level. Re-check that the block is in `build.yml` and not accidentally removed by a merge conflict.

**Build runs but only produces a single-arch image.**

`docker/setup-qemu-action` must run before `docker/setup-buildx-action`. If the order is swapped, buildx initializes without the arm64 emulator registered and silently falls back. Inspect the `Set up QEMU` step's log — it should print `Setting up qemu-arm64`.

**arm64 build hangs at `pnpm install` for >10 minutes.**

This is normal under QEMU. The first cold build of arm64 with a 600+ MB node_modules tree takes 8–15 min just for `pnpm install` (pnpm is mostly I/O-bound and QEMU adds ~3× overhead on syscalls). Subsequent runs use the GHA cache and are 5–10× faster. Don't increase the timeout further unless you see >40 min runtimes.

**`:latest` was set on a `main` push instead of only on stable tags.**

The `flavor: latest=...` expression is wrong. It should evaluate to `false` for `head_branch == 'main'`. Verify the expression reads exactly:
```yaml
latest=${{ startsWith(steps.ref.outputs.name, 'v') && !contains(steps.ref.outputs.name, '-') }}
```

**Image pull works for you but fails for a colleague with `denied`.**

The package is still private. Re-do Task 6.

---

## Out of Scope (Per Spec §Out of Scope)

These are explicit non-goals for this plan:
- PR-time Docker build verification.
- Native arm64 runners (`ubuntu-24.04-arm`).
- SBOM generation, image signing (cosign), provenance attestations.
- Vulnerability scanning of published images (Trivy, Grype).
- Automatic GitHub Releases creation on tag pushes.
- Slack/Discord build notifications.
- Docker Hub mirroring.
