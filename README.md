# parsedmarc-nuxt

A lightweight, self-hosted DMARC report dashboard. Parses aggregate and forensic reports delivered to an IMAP mailbox, enriches source IPs with GeoIP data, and presents everything in a clean web interface.

---

## Quickstart

### Requirements

- Node.js 20+
- pnpm 9+
- An IMAP mailbox that receives DMARC reports

### 1. Clone and install

```bash
git clone https://github.com/your-org/parsedmarc-nuxt.git
cd parsedmarc-nuxt
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum set:

| Variable | Required | Description |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | ✅ | 32+ character secret for session cookies and credential encryption |
| `NUXT_MAXMIND_LICENSE_KEY` | Recommended | Free MaxMind account key for GeoIP enrichment |
| `DATABASE_URL` | Optional | SQLite path (default: `file:./data/parsedmarc.db`) |

### 3. Run database migrations

```bash
pnpm exec prisma migrate deploy
```

### 4. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/setup` to create the first operator account.

### 5. Production build

```bash
pnpm build
node .output/server/index.mjs
```

---

## Adding an IMAP inbox

1. Log in and navigate to **Inboxes → Add inbox**.
2. Enter your IMAP server details. The form tests the connection before saving.
3. Enable the inbox and set a poll schedule (default: every 15 minutes).
4. Click **Scan now** to ingest reports immediately without waiting for the scheduler.

---

## Project documentation

| Document | Purpose |
|---|---|
| [`docs/VISION.md`](docs/VISION.md) | Who this is for and why it exists |
| [`docs/PRD.md`](docs/PRD.md) | Full feature requirements and acceptance criteria |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestone-based delivery plan |
| [`AGENTS.md`](AGENTS.md) | Coding conventions, architecture decisions, implementation contract |

---

## Development

```bash
pnpm dev          # dev server with hot reload
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # end-to-end tests (Playwright)
pnpm exec tsc --noEmit  # TypeScript check
```

Test fixtures live in `test/fixtures/dmarc/`. Seed 100k records for dashboard performance testing:

```bash
pnpm tsx scripts/seed-dashboard.ts
```

---

## License

MIT
