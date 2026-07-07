# The Experts Group — Paid Ads Portal

Portal for Experts Group agents (Property, Lettings, Mortgage, Recruitment,
Commercial) to buy paid-ads packages, track their leads through a funnel,
and pass referrals between businesses in the group.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Deploys to Railway (standalone output, respects `PORT`)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## The flow

1. **Landing page** (`/`) — three packages (Starter / Growth / Scale).
2. **Signup** (`/signup`) — one question at a time: name → work email →
   mobile → photo → platforms → goal → package → payment. The email domain
   routes the agent to the right business (e.g. `@therecruitmentexperts.co.uk`
   → The Recruitment Experts dashboard). Unknown domains get a manual picker.
3. **Dashboard** (`/dashboard`) — brand-themed. Campaign prep status, lead
   funnel (New → Attempt 1 → Attempt 2 → Converted → Pushed to CRM), and the
   referrals portal for passing leads between group businesses.
4. **Feedback widget** — bottom-right on every page. Reviewers draw on the
   screen, add a note, and the annotated screenshot lands in the admin
   feedback inbox.
5. **Admin** (`/admin`) — password-gated backend. Feedback inbox now; user
   and campaign management slot in with the database.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | **Postgres connection string — the real store.** On Railway set it to the variable reference `${{Postgres.DATABASE_URL}}`. Without it, data falls back to local JSON files |
| `ADMIN_PASSWORD` | `experts-admin` | Admin backend password — **set this in Railway** |
| `AUTH_SECRET` | dev fallback | Secret used to sign session cookies — **set a long random value in Railway** |
| `DATA_DIR` | `./data` | Only used by the JSON fallback (no `DATABASE_URL`) |
| `META_APP_ID` / `META_APP_SECRET` / `META_ACCESS_TOKEN` | — | Meta Marketing API (not wired yet — see admin → Connections) |

### Postgres on Railway (accounts that survive forever)

1. In the Railway project: **Create → Database → Add PostgreSQL**.
2. On the app service: **Variables → New Variable → Add Reference →
   `Postgres.DATABASE_URL`** (creates `DATABASE_URL=${{Postgres.DATABASE_URL}}`).
3. Redeploy. Tables (`users`, `feedback`, `signup_events`) are created
   automatically on first use — no migration step.

Users, feedback and signup-tracking all live in Postgres from then on.
Locally (no `DATABASE_URL`) everything falls back to JSON files in `data/`,
so dev needs no database installed.

Brands (domains, accent colours, CRM names, conversion labels) live in
[lib/brands.ts](lib/brands.ts). Packages and placeholder pricing in
[lib/packages.ts](lib/packages.ts).

## Deliberately not built yet (integration points)

- **Stripe** — signup's payment step is a placeholder. Real flow: create a
  Checkout Session with the package's `stripePriceId`
  (see `lib/packages.ts`), redirect, and a webhook marks the user `paid`.
  Search the codebase for `TODO(stripe)`.
- **Lead channel** — leads are seeded demo data in `lib/mock.ts` until the
  Meta lead delivery mechanism is confirmed.
- **CRM push** — "Push to REP/Atlas" buttons mark the lead pushed locally;
  the real API call goes in `pushToCrm()` in
  `app/dashboard/leads/page.tsx` (`TODO(crm)`).
- **Auth is real** — sign-up/sign-in use scrypt password hashing + an
  httpOnly session cookie (`lib/auth.ts`, `/api/auth/*`), validated
  server-side on every dashboard load. With `DATABASE_URL` set, users,
  feedback and signup events live in Postgres (`lib/db.ts` +
  `lib/*-store.ts`) and survive deploys.
- **Meta Ads** — the admin backend has a Meta Ads connection panel and a
  per-agent campaign-mapping table (framework only). Real flow: OAuth into the
  Meta Marketing API, map each agent to their campaign so stats and leads are
  personal to them. Search for `TODO(meta)`.

## Deploy to Railway

Push to GitHub, create a Railway service from the repo — it detects
Next.js. Set `ADMIN_PASSWORD`. Build `npm run build`, start `npm start`.
