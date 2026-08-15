import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { MANAGEMENT_FEE, PACKAGES } from "@/lib/packages";

export const metadata: Metadata = {
  title: "Terms of Service — Launch Pad",
  description:
    "The terms on which The Experts Group provides the Launch Pad paid advertising service.",
};

/* NOT LEGAL ADVICE. This is a plain-English draft built from the commercial
   terms in the partner pack and what the product actually does. Every figure
   here is pulled from lib/packages.ts so the document can't drift from the
   pricing the site shows. The passages marked "Needs a decision" must be
   settled — ideally by a solicitor — before this is relied on. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="27 July 2026">
      <div className="review">
        <strong>Draft for review.</strong> These terms were prepared from the
        Launch Pad partner pack and the service as built. They have not been
        reviewed by a solicitor. Please have them checked, and settle the
        points marked below, before relying on them.
      </div>

      <h2>1. Who these terms are between</h2>
      <p>
        Launch Pad is a paid advertising service provided by The Experts Group
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;) to agents and staff within the
        group (&ldquo;you&rdquo;). By signing up you agree to these terms.
      </p>
      <div className="review">
        Needs a decision: the exact contracting entity and company number. Your
        Stripe account is registered to <em>The Property Experts INTL Ltd</em>,
        which may or may not be the entity that should contract for this
        service across all seven businesses. Also needs a registered address
        and a contact address for notices.
      </div>

      <h2>2. What the service is</h2>
      <p>
        We build, publish and manage paid social advertising campaigns on your
        behalf, and provide a private dashboard where the resulting enquiries
        (&ldquo;leads&rdquo;) appear. Every package includes:
      </p>
      <ul>
        <li>Ad creative and copy, produced by us — no brief needed from you.</li>
        <li>Monthly review and adjustment of the campaign.</li>
        <li>Your own dashboard showing spend, reach, engagement and leads.</li>
        <li>Lead nurture — we stay in contact with leads on your behalf.</li>
      </ul>
      <p>
        Campaigns currently run on Meta (Facebook and Instagram). LinkedIn is
        planned but is not part of the service until we tell you it is live.
      </p>

      <h2>3. What we do not promise</h2>
      <p>
        We do not guarantee any particular number of leads, any cost per lead,
        or that leads will convert into instructions, sales or fees. Advertising
        results depend on your area, your market, your own follow-up and factors
        outside our control, including the advertising platforms&rsquo; own
        decisions.
      </p>
      <p>
        Any figures we publish from previous campaigns — including the results
        of our three-month trial — are a record of what happened in that
        campaign. They are not a forecast, a target or a promise of what your
        campaign will achieve.
      </p>

      <h2>4. Fees</h2>
      <p>
        Your monthly cost is made up of two parts, shown separately on every
        invoice:
      </p>
      <ul>
        <li>
          A management fee of <strong>£{MANAGEMENT_FEE} per month</strong>, the
          same on every package.
        </li>
        <li>
          Your chosen advertising spend, which is passed to the advertising
          platform:
          {" "}
          {PACKAGES.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? "; " : ""}
              <strong>{p.name}</strong> at £{p.dailyAdSpend}/day (approximately
              £{p.adSpend}/month)
            </span>
          ))}
          .
        </li>
      </ul>
      <p>
        Monthly ad spend figures are approximate because they depend on the
        number of days in the month and on how the platform paces delivery. Fees
        are billed monthly in advance by card through Stripe, our payment
        provider. We do not see or store your card details.
      </p>
      <div className="review">
        Needs a decision: whether the stated prices include or exclude VAT, and
        whether ad spend is passed through at cost or marked up. The site
        currently states neither.
      </div>

      <h2>5. Minimum term and cancellation</h2>
      <p>
        Your subscription has a <strong>minimum term of three months</strong>,
        beginning on the date of your first payment. This is because campaigns
        need time to gather data and settle before their performance is
        meaningful.
      </p>
      <p>
        After the minimum term your subscription continues on a rolling monthly
        basis. You can cancel at any point from then on, in your profile. When
        you cancel, your campaign continues to the end of the month you have
        already paid for and then stops. We do not refund part-months.
      </p>
      <p>
        You can change package at any renewal. Changes take effect from your
        next billing date rather than immediately.
      </p>

      <h2>6. What we need from you</h2>
      <ul>
        <li>
          Accurate details about you, your business and the area you cover.
        </li>
        <li>
          Any approvals or access we reasonably need in order to run your
          campaign.
        </li>
        <li>
          That you follow up the leads we deliver. Leads go cold quickly, and
          nurture is not a substitute for you contacting them.
        </li>
        <li>
          That you handle the personal data of leads lawfully — see our{" "}
          <a href="/privacy">Privacy Policy</a>.
        </li>
      </ul>

      <h2>7. Suspension and non-payment</h2>
      <p>
        If a payment fails, Stripe will retry it. We may pause your campaign and
        your access to the dashboard if payment remains outstanding. We may also
        suspend or end the service if the way an account is being used risks
        breaching an advertising platform&rsquo;s rules or the law.
      </p>

      <h2>8. Your data and leads</h2>
      <p>
        Leads generated for you, and the contact details within them, are
        available to you through the dashboard and can be pushed to your CRM.
        How we handle personal data is set out in our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
      <div className="review">
        Needs a decision: what happens to lead data when an account closes — how
        long it is retained, and whether the agent can export it first. The
        product does not currently define this.
      </div>

      <h2>9. Liability</h2>
      <p>
        Nothing in these terms limits liability for death or personal injury
        caused by negligence, for fraud, or for anything else that cannot
        lawfully be limited.
      </p>
      <div className="review">
        Needs a solicitor: the liability cap and the exclusion of indirect loss.
        A sensible starting point is capping liability at the fees paid in the
        preceding twelve months, but this should not be adopted without advice.
      </div>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms. If a change materially affects you we will
        tell you before it takes effect, and you may cancel at your next renewal
        if you do not accept it.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the law of England and Wales, and the courts
        of England and Wales have exclusive jurisdiction.
      </p>
      <div className="review">
        Needs a decision: confirm this is right for all seven businesses, and
        add the contact address for formal notices and complaints.
      </div>
    </LegalPage>
  );
}
