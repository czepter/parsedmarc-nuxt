# Docker Build Pipeline

**Date:** 2026-05-06
**Status:** Designed

## Problem

The repo has a working multi-stage `Dockerfile` and a `docker-compose.yml`, but no automated pipeline to build and publish images. Every release currently requires a manual `docker build` + `docker push` from a developer machine, which is error-prone and produces single-architecture images. Tests run in CI (`.github/workflows/ci.yml`) but their pass/fail status doesn't gate published artifacts.

## Goal

Every push to `main` and every `v*` git tag publishes a multi-architecture Docker image to GitHub Container Registry, gated on the existing test suite passing. The image is consumable via `docker pull ghcr.io/czepter/parsedmarc-nuxt:<tag>` on both `linux/amd64` and `linux/arm64` hosts.

PR builds are out of scope — they only run tests, not Docker builds.

## Approach

Two-file split:

- **`ci.yml`** (existing) — extended trigger list to also run on `v*` tag pushes so tag releases are tested before being chained to the build.
- **`build.yml`** (new) — chained off CI via the `workflow_run` trigger. Runs only on successful CI completions whose triggering ref was either `main` or a `v*` tag. Uses Buildx + QEMU to produce a single multi-arch manifest (`linux/amd64` + `linux/arm64`) pushed to `ghcr.io/czepter/parsedmarc-nuxt`.

Why two files (not one job in `ci.yml`): keeping test concerns and publish concerns in separate files gives them separate concurrency groups, separate timeouts, and a clearer audit trail in the Actions UI. The trade-off — `workflow_run` has known footguns — is handled explicitly in section 2.

Why GHCR (not Docker Hub): same auth as the repo (built-in `GITHUB_TOKEN`), no extra secrets to manage, free for public repos.

Why amd64 + arm64: deployment targets are unspecified and may include ARM (Graviton, Ampere, M-series Macs for local pulls). Cost is ~15–25 min builds vs ~5–8 min for amd64-only, mitigated by aggressive layer caching.

## Design

### 1. `ci.yml` — Trigger Extension

Add `tags: ['v*']` to the existing push trigger so tag-based releases also run the test suite. No other changes:

```yaml
on:
  pull_request:
  push:
    branches: [main]
    tags: ['v*']
```

This is the only change to `ci.yml`. Without it, tag pushes would not chain to `build.yml` (because `workflow_run` only fires when its referenced workflow actually runs).

### 2. `build.yml` — New Workflow

#### 2.1 Trigger and Filter

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
```

A single job-level `if:` enforces three conditions:

- `github.event.workflow_run.conclusion == 'success'` — only chain off green CI runs
- `github.event.workflow_run.event == 'push'` — skip PR-triggered CI runs
- `head_branch == 'main' || startsWith(head_branch, 'v')` — only main and tag refs

In `workflow_run` context, `head_branch` contains the branch name OR the tag name, and `head_sha` is the actual commit that triggered CI. Both are required because `github.ref` and `github.sha` in this context point at the default branch, not the triggering ref.

#### 2.2 Permissions

Job-scoped to the minimum needed:

```yaml
permissions:
  contents: read
  packages: write
```

The workflow uses the auto-generated `GITHUB_TOKEN`. No personal access token (PAT) and no manually-managed secrets.

#### 2.3 Concurrency

```yaml
concurrency:
  group: build-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: ${{ github.event.workflow_run.head_branch == 'main' }}
```

Cancel stale builds on `main` (overwrites are fine, latest commit is what matters). Never cancel on tag refs — a tag push is a one-shot release event, cancelling it leaves git tag and registry tag out of sync.

#### 2.4 Build Steps

Order matters; each step's purpose:

1. **Checkout** at `head_sha` (not the default `github.ref`, which would check out main even for tag-triggered runs).
2. **Setup QEMU** with `platforms: arm64` only (amd64 is native on the runner — no need to register).
3. **Setup Buildx** for multi-platform builds and GHA cache support.
4. **Login to GHCR** with `username: github.actor` and `password: GITHUB_TOKEN`.
5. **Compute short SHA** (truncate `head_sha` to 7 chars) into a step output for use in tags.
6. **Compute tags** via `docker/metadata-action` — see section 2.5.
7. **Build & push** via `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`, GHA cache (`type=gha,mode=max`).

#### 2.5 Tagging Matrix

| Source | Tags pushed |
|---|---|
| Push to `main` | `:main`, `:sha-<short>` |
| Tag `v1.2.3` | `:1.2.3`, `:1.2`, `:latest` |
| Tag `v1.2.3-beta.1` | `:1.2.3-beta.1` (pre-release: no `:latest`, no `:1.2`) |

`docker/metadata-action` configuration:

```yaml
tags: |
  type=raw,value=main,enable=${{ github.event.workflow_run.head_branch == 'main' }}
  type=raw,value=sha-${{ steps.short_sha.outputs.value }},enable=${{ github.event.workflow_run.head_branch == 'main' }}
  type=semver,pattern={{version}},value=${{ github.event.workflow_run.head_branch }}
  type=semver,pattern={{major}}.{{minor}},value=${{ github.event.workflow_run.head_branch }}
flavor: |
  latest=${{ startsWith(github.event.workflow_run.head_branch, 'v') && !contains(github.event.workflow_run.head_branch, '-') }}
```

The `value=${{ head_branch }}` overrides on `type=semver` rules are the workaround for `workflow_run` context — without them, the action reads `GITHUB_REF` (default branch) and produces wrong tags. The hyphen-detection in `flavor` enforces "pre-release tags don't promote to `:latest` or `:major.minor`".

Short SHA format chosen over full 40-char SHA: matches `git log --oneline` and Actions UI conventions, cleaner in deploy logs. The `sha-` prefix prevents the tag from being mistaken for a numeric version by tooling.

#### 2.6 Caching

`cache-from: type=gha`, `cache-to: type=gha,mode=max`. `mode=max` caches every intermediate stage (including the post-`pnpm install` layer at ~600 MB and the apt-install runtime layer), which makes app-code-only rebuilds finish in ~5–8 min instead of ~15–25 min. The 10 GB GHA cache limit per repo easily fits this.

The cache is shared across both architectures because buildx writes per-platform cache entries under the same key.

#### 2.7 Timeout

`timeout-minutes: 45`. Cold multi-arch builds with arm64 under QEMU run ~20–25 min; 45 gives a generous margin for slow runner days without letting a hung build burn an hour.

### 3. Dockerfile and `start.sh` — No Changes

The existing `Dockerfile` is multi-arch-compatible as-is:

- `node:24-slim` (Debian/glibc) has both `linux/amd64` and `linux/arm64` variants.
- Native deps install correctly per-arch: `pnpm install` resolves `@node-rs/bcrypt-linux-x64-gnu` on amd64 and `@node-rs/bcrypt-linux-arm64-gnu` on arm64. `better-sqlite3` ships prebuilt binaries for both.
- The `prisma migrate deploy` runs at boot via `start.sh`, so the image is data-agnostic and identical across deploy targets.

No Dockerfile or start.sh changes are required.

### 4. One-Time Manual Setup (post-merge)

1. After the first successful `build.yml` run, the package `parsedmarc-nuxt` appears under `https://github.com/czepter?tab=packages`. It defaults to **private**. To make it pullable without auth, change visibility once: *Package settings → Change visibility → Public*. The workflow cannot do this.

2. Optional: link the package to the repo on the same settings page, so the GitHub repo sidebar shows the package.

These are one-time human steps. Subsequent pushes inherit the visibility and link.

## Implementation Order

1. Extend `ci.yml`'s push trigger to include `tags: ['v*']`.
2. Create `.github/workflows/build.yml` with the workflow defined in section 2.
3. Commit both changes on `main`. The first push will:
   - Trigger `ci.yml` (tests run).
   - On CI success, trigger `build.yml` for the first time.
4. After the first successful build, flip the GHCR package visibility to public (section 4).
5. Verify pull works on both architectures: `docker pull ghcr.io/czepter/parsedmarc-nuxt:main` from an amd64 host and (if available) an arm64 host.
6. Cut a `v0.1.0` git tag to verify the semver tagging path also works end-to-end.

## Out of Scope

- PR-time Docker build verification (user explicitly excluded).
- Native arm64 runners (`ubuntu-24.04-arm`) for faster arm64 builds — paid feature, possible future optimization.
- SBOM generation, image signing (cosign), provenance attestations — can be added later by extending `docker/build-push-action` inputs.
- Vulnerability scanning of the published image (Trivy, Grype, Dependabot's container scanning) — separate concern.
- Automatic GitHub Releases creation on tag pushes — separate concern from image publishing.
- Slack/Discord notifications on build success/failure.
- Docker Hub mirroring.
