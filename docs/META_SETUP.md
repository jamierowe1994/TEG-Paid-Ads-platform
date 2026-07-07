# Meta setup — step by step

Goal: give the portal read access to every Experts Group brand's ads
(impressions, clicks, spend, insights) and lead forms, so agent dashboards
and the admin Performance tab fill with live numbers.

There are four stages. Stages 1–2 are business admin, 3 is where the App ID
and App Secret come from, 4 is the review Meta must approve.

---

## Stage 1 — Business Manager (business.facebook.com)

1. Go to **business.facebook.com** and sign in with the Facebook account
   that administers the Experts Group pages.
2. If there's no Business Portfolio yet: **Create a business portfolio** →
   name it "The Experts Group", use info@theexpertsgroup… as the contact
   email. If one exists (likely if ads already run), use it.
3. **Business verification** (Settings → Security Centre → Start
   verification). Meta asks for legal business name, address, and a document
   (Companies House certificate, utility bill or bank statement showing the
   company name/address), then verifies by phone/email/domain. Do this FIRST
   — Advanced Access to ads data (Stage 4) requires it and it can take days.

## Stage 2 — put every brand's assets in the Business Manager

For each brand (Property, Lettings, Mortgage, Recruitment, Commercial
Property, Fine & Country, Auction Company):

1. **Settings → Accounts → Pages → Add** — claim the brand's Facebook Page
   (and link its Instagram account under Accounts → Instagram).
2. **Settings → Accounts → Ad accounts → Add** — claim the brand's ad
   account (or create one per brand if they share one today — one ad
   account per brand keeps the per-brand connect/disconnect clean).
3. If a brand's page/ad account is owned by someone else's BM, use
   **Partner sharing** instead of claiming.

## Stage 3 — create the developer app (this is where App ID + Secret live)

1. Go to **developers.facebook.com** → log in with the same account →
   **My Apps → Create App**.
2. Use case: choose **"Other"** → app type **"Business"**. Name it
   "Experts Group Portal", contact email info@…, and connect it to the
   Experts Group Business Portfolio when asked.
3. Once created you land on the app dashboard:
   - **App ID** — shown at the top of the dashboard.
   - **App Secret** — **App settings → Basic → App Secret → Show**
     (asks for your Facebook password).
4. In the app dashboard **Add product**: add **Marketing API** and
   **Webhooks**.
5. Put the two values in Railway (app service → Variables):
   - `META_APP_ID` = the App ID
   - `META_APP_SECRET` = the App Secret (never share this in chat/email —
     it's a password)

## Stage 4 — permissions + App Review

The app starts in "Standard Access" (works only for people with a role on
the app) — enough for us to BUILD and test everything. To read all brands'
data in production it needs **Advanced Access** to:

| Permission | Why |
| --- | --- |
| `ads_read` | campaign stats: impressions, clicks, spend |
| `read_insights` | page-level insights |
| `leads_retrieval` | pull lead-form submissions |
| `pages_show_list` | list the pages during per-brand connect |
| `pages_read_engagement` | read page content/engagement tied to leads |
| `business_management` | list BM assets so Connect buttons can pick them |

App Review checklist (App Review → Permissions and features → request
Advanced Access on each):

- Business verification must already be complete (Stage 1).
- For each permission Meta wants a short usage description — e.g.
  "Estate/lettings/mortgage agents buy personally-branded ad campaigns from
  The Experts Group. Our portal shows each agent the performance of their
  own campaign (ads_read, read_insights) and delivers their lead-form leads
  into their dashboard (leads_retrieval)."
- A **screencast** showing the flow: admin connects a brand in the portal →
  dashboard shows that brand's stats/leads. (We'll record this against the
  live portal with Standard Access + a test page before submitting.)
- Data handling questions (where data is stored, who sees it): Postgres on
  Railway (EU region if selected), visible only to the agent who owns the
  campaign + group admin.

Typical review time: a few days to two weeks.

## Stage 5 — System User token (how the server stays connected)

After review (or during build with Standard Access):

1. Business Manager → **Settings → Users → System users → Add** — name it
   "Portal Server", role Admin.
2. **Add assets**: give it access to every brand's Page + Ad Account.
3. **Generate token** → select the app → tick the permissions above →
   choose **never expire**. This long-lived token is what the portal's
   backend uses; it doesn't break when a human changes their password.
4. The per-brand Connect buttons in the admin panel will store each brand's
   page ID + ad account ID + token in Postgres.

## What the portal does with it (already scaffolded in code)

- Per-brand connect cards → store page/ad-account/token per brand
  (independently disconnectable).
- Scheduled sync → campaign insights per agent (matched by the Meta
  campaign ID field in Admin → CRM) → agent stats + admin Performance tab.
- `leadgen` webhook → new lead-form submissions land in the right agent's
  dashboard in real time.

## Who does what

| Step | Owner |
| --- | --- |
| Business portfolio + verification | James / whoever admins the pages |
| Claim pages + ad accounts per brand | James |
| Create app, add Marketing API | James (5 minutes, guided above) |
| Put App ID/Secret in Railway | James |
| OAuth wiring, webhook, sync code | Claude |
| Screencast + App Review submission | together (Claude drafts the text) |
