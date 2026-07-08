# Connect The Recruitment Experts to Meta — step by step

Goal: let the portal read TRE's ad stats (impressions, clicks, spend) and its
lead-form leads. Because TRE is **your own** account, we use a **System User
token** — this avoids Meta's long "App Review" (that's only needed to read
*other* businesses' data, which we'll deal with per-brand later).

You do Parts A–D (all clicking, no code). Then send me the five values in Part
E and I wire it up. Take your time; none of this can break anything.

---

## Part A — Business Manager + TRE's assets (~15 min)

1. Go to **business.facebook.com** and log in with the Facebook account that
   manages the TRE Facebook Page and ads.
2. Top-left, make sure you're in the right **business** (or the Experts Group
   one if it exists). If there's no business yet: **Settings gear → Business
   settings → Create a business portfolio** → name it "The Experts Group".
3. In **Business settings** (the gear), left menu → **Accounts → Pages**:
   - Click **Add → Add a Page** → pick **The Recruitment Experts** page.
     (If it says already added, great.)
4. Left menu → **Accounts → Ad accounts → Add → Add an ad account** → select
   TRE's ad account. (If you run TRE's ads, it's the one you use in Ads
   Manager.)
5. Left menu → **Accounts → Instagram accounts → Add** → connect TRE's
   Instagram if it has one (optional but recommended).

## Part B — Create the app (this gives the App ID + Secret) (~10 min)

6. Go to **developers.facebook.com** (same login) → top-right **My Apps →
   Create App**.
7. "What do you want to do?" → choose **Other** → **Next**.
8. App type → **Business** → **Next**.
9. Name it **"Experts Group Portal"**, your email, and under "Business
   portfolio" pick **The Experts Group** → **Create app** (it may ask your
   password).
10. You're now on the app dashboard. **Write down the App ID** (shown at the
    top).
11. Left menu → **App settings → Basic**. Click **Show** next to **App
    Secret** (enter your password). **Write down the App Secret.** Treat this
    like a bank password — don't paste it into chat/email.
12. Still on the dashboard, find **Add products** → add **Marketing API**
    (click Set up). If you see **Webhooks**, add that too (for leads later).

## Part C — System User + token (the key that lets us read TRE's data) (~10 min)

13. Back in **business.facebook.com → Business settings** (gear).
14. Left menu → **Users → System users → Add**.
15. Name it **"Portal Server"**, role **Admin** → **Create system user**.
16. With "Portal Server" selected, click **Add assets**:
    - **Pages** → tick TRE's page → give **Full control / Manage**.
    - **Ad accounts** → tick TRE's ad account → give **Manage / View
      performance**.
    - Save.
17. Click **Generate new token**.
    - **App**: choose **Experts Group Portal**.
    - **Token expiration**: choose **Never**.
    - **Permissions**: tick these boxes:
      - `ads_read`
      - `read_insights`
      - `leads_retrieval`
      - `pages_show_list`
      - `pages_read_engagement`
      - `business_management`
    - **Generate token** → **copy the long token string.** (Meta shows it
      once — if you lose it, just generate another.)

## Part D — Grab TRE's two IDs (~5 min)

18. **Ad Account ID**: open **Ads Manager** for TRE. Top-left it shows the
    account name and an ID like **act_1234567890** (or find it in Business
    settings → Ad accounts → the account → "Ad account ID"). I need the
    number (with or without the `act_` prefix).
19. **Page ID**: Business settings → **Accounts → Pages → The Recruitment
    Experts** → the **Page ID** is listed there (a long number).

## Part E — Send me these five things

Put the App Secret and token into Railway (safer) or send them to me
securely — **not in normal chat**:

| # | Value | Where it came from |
|---|-------|--------------------|
| 1 | **App ID** | Part B, step 10 |
| 2 | **App Secret** | Part B, step 11 |
| 3 | **System User token** | Part C, step 17 |
| 4 | **TRE Ad Account ID** (`act_…`) | Part D, step 18 |
| 5 | **TRE Page ID** | Part D, step 19 |

**Safest way:** in Railway → your app service → **Variables**, add:
`META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_TOKEN`, `TRE_AD_ACCOUNT_ID`,
`TRE_PAGE_ID`. Tell me once they're in and I'll take it from there.

---

## Then — what I build (my side)

- Pull TRE's campaign stats (impressions, clicks, spend, cost-per-lead) into
  the agent dashboards and the admin Performance tab, refreshed on a schedule.
- A **leadgen webhook** so new lead-form submissions land in the right agent's
  Leads in real time (this is the one bit that may need Meta "business
  verification" to switch fully live for leads — stats work without it).
- The per-brand **Connect** buttons in Admin → Connections become real, so
  the other brands slot in the same way as they come online.

## Notes / gotchas

- **Business verification**: not needed for reading TRE's own stats. It *is*
  needed later for pulling leads at full scale and for connecting brands that
  live in a different Business Manager. Worth starting now (Business settings →
  Security Centre → Start verification) as it takes a few days.
- **One app, all brands**: you only ever make ONE app (App ID/Secret). Each
  brand is added as assets + given to the System User — no new app per brand.
- If any screen looks different (Meta redesigns constantly), tell me the menu
  names you see and I'll re-point you.
