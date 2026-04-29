# Product Vision — parsedmarc-nuxt

> **Scope of this document.** The "why". The user and the world this product creates. No features, no requirements, no dates — those live in [`PRD.md`](PRD.md) and [`ROADMAP.md`](ROADMAP.md). Implementation conventions live in [`../AGENTS.md`](../AGENTS.md).

---

## The Person We're Building For

**Sam, the one-person mail team.** Sam runs email for an organization between 20 and 2,000 people — a non-profit, a university department, a small SaaS company, a managed-services provider, a homelab community. Sam set up SPF, DKIM, and DMARC because that is what good ops people do, and now Sam receives a steady trickle of DMARC aggregate reports — XML buried inside `.zip` files arriving from Google, Microsoft, Yahoo, Comcast, and a long tail of receivers Sam has never heard of.

Today Sam does one of two things with those reports:

1. **Delete them unread.** They pile up faster than they can be opened, the XML is unreadable to humans, and nothing has obviously caught fire, so they get archived and forgotten. The DMARC TXT record is technically published but operationally inert — Sam is flying blind on whether spoofers are abusing the domain or whether a legitimate sender just got broken by an SPF macro change.
2. **Stand up the heavy stack.** Install the Python `parsedmarc` library, point it at Elasticsearch, run Kibana on top, write a `systemd` unit, keep the index sane, manage the JVM heap, debug why the dashboard JSON Sam imported from somebody's gist no longer renders. This works — `parsedmarc` is excellent — but it is operationally heavier than the value it returns for an org Sam's size.

There is no good middle option. That is the gap.

## The World We're Creating

A self-hosted DMARC dashboard that Sam stands up in **15 minutes** and then forgets about for **months at a time**, glancing at it monthly the way one glances at an uptime page — to confirm everything is still green and to catch the occasional anomaly while it is still small.

Concretely:

- **One binary, one file, one mailbox.** A Node process, a SQLite file, and an IMAP credential. No JVM, no separate search engine, no message broker, no managed cloud account. If Sam can `docker compose up`, Sam can run this.
- **Reports become a story, not a haystack.** Sam opens the dashboard and immediately sees: *"This week, 98.4% of mail claiming to be from your domains aligned. The remaining 1.6% came from these three IPs in these two countries. Here is the trend over the last 90 days."* No clicking through XML. No mental XML-to-table translation.
- **Many inboxes, one pane of glass.** A managed-services Sam serving five clients adds five `Inbox` rows and gets one merged dashboard, filterable by domain. The admin shell makes this five-minute work, not five-hour work.
- **The aesthetic of [Umami Analytics](https://umami.is/), not Grafana.** Lots of whitespace. Soft palette. One chart per view, done well. The dashboard does not look like infrastructure software; it looks like something Sam would willingly leave open in a tab. This is not a vanity goal — it is the difference between a tool Sam uses and a tool Sam means to use.

## What Success Feels Like

A new user clones the repo on a Tuesday evening. By the time the kettle boils they have:

- pulled the Docker image
- pasted in their MaxMind license key
- pasted in one IMAP credential
- opened a browser to `localhost:3000`
- seen real data from the last DMARC report that landed in that mailbox

A returning user opens the bookmarked dashboard once a month, scans the summary tiles in 30 seconds, confirms everything is normal, and closes the tab. Twice a year they see something interesting — a new sender they didn't know about, an alignment failure clustered in one region — and that 30-second glance pays for the entire setup.

A contributor reads `AGENTS.md` and `docs/PRD.md`, picks up an issue, and ships it without asking which library to use, where the file goes, or whether their PR needs to also add Tailwind (it does not — that's already done).

## Design Philosophy (Non-Negotiables)

These are the principles that, when in doubt, decide arguments:

1. **Self-hosted first, always.** Every feature must work on a single Node process with no external service. Cloud-only features are out of scope, full stop.
2. **One process, one file.** SQLite over Postgres. In-process croner over Redis-backed queues. Sync `better-sqlite3` over async drivers. Operational simplicity beats theoretical scale.
3. **TypeScript end to end.** No Python sidecar, no JVM, no second runtime in the container. The whole stack is `node` + `npm install`.
4. **The dashboard is the product.** Parsing DMARC reports is a means, not the end. If the parser is perfect but the dashboard is ugly, we have failed. If the dashboard is beautiful but the parser is missing a field, we have a tractable bug.
5. **Quiet by default.** No notifications, no email alerts, no "you have 12 unread reports" badges in v1. Sam comes to the tool when Sam comes to it. Anything else is noise.
6. **Honest about what we don't know.** Edge-case DMARC XML variants, unusual IMAP server quirks, MaxMind schema changes — when we can't parse something, we record it on the `ScanRun`, leave the message unread, and surface the count. We do not silently swallow.
7. **The data is yours.** SQLite file, raw XML preserved on every report row. Export, backup, and migration are file-copy operations. No proprietary format lock-in.

## What We Are Explicitly Not

- We are not a hosted SaaS. There will not be a "Sign up at parsedmarc-nuxt.com" tier.
- We are not an enterprise multi-tenant platform. v1 is single-org per deployment. (Forward-compat is in the data model — see `AGENTS.md` section 5 — but it is not a v1 feature.)
- We are not a DMARC policy enforcement tool. We do not edit your DNS, generate suggested records, or rate your DMARC posture. We *report*; you decide.
- We are not a competitor to commercial DMARC platforms (Valimail, dmarcian, Postmark DMARC Digests). They serve different users with different budgets and different needs. We serve Sam.
- We are not a parsedmarc replacement for *every* parsedmarc user. Heavy users with Elasticsearch already running, complex Splunk integrations, or specific Kafka pipelines should keep using `parsedmarc`. We serve the long tail it underserves.

## How We'll Know We Succeeded

Long before we get to telemetry or stars or downloads, the qualitative signal is this: an ops engineer in a Slack thread or a Reddit post says *"we use parsedmarc-nuxt — it took 15 minutes to set up and we just leave it running"* and three other people say *"oh, that sounds nice, I'll try it."* That sentence is the goal. Everything in `PRD.md` and `ROADMAP.md` exists to make it true.
