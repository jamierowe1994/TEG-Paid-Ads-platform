import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Launch Pad",
  description:
    "How The Experts Group handles personal data in the Launch Pad portal.",
};

/* NOT LEGAL ADVICE. Written from what the application actually does — the
   Microsoft mail connection, Meta lead ingestion, the CRM push, Google Maps
   geocoding, Stripe, and the Postgres store on Railway. Anything that depends
   on a business decision rather than the code is flagged for review. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="27 July 2026">
      <div className="review">
        <strong>Draft for review.</strong> This describes how the portal
        actually handles data, based on the system as built. It has not been
        reviewed by a solicitor or a data protection adviser, and the points
        marked below need answers before it is published as final.
      </div>

      <h2>1. Who we are</h2>
      <p>
        Launch Pad is operated by The Experts Group. This policy covers the
        Launch Pad portal at launchpad.theexpertsgroup.co.uk.
      </p>
      <div className="review">
        Needs a decision: the data controller&rsquo;s legal entity and
        registered address, an ICO registration number, and a contact address
        for data protection enquiries.
      </div>

      <h2>2. Two kinds of personal data</h2>
      <p>This portal handles personal data about two different groups:</p>
      <ul>
        <li>
          <strong>You</strong>, the agent using the portal.
        </li>
        <li>
          <strong>Leads</strong> — members of the public who responded to an
          advert and gave their contact details.
        </li>
      </ul>
      <div className="review">
        Needs a decision: whether The Experts Group is a controller or a
        processor of lead data, and whether the agent is a joint controller.
        This determines what has to be said to leads at the point they submit a
        form, and whether a data processing agreement is needed between the
        group and its agents.
      </div>

      <h2>3. Data we hold about you</h2>
      <ul>
        <li>Your name, work email address, mobile number and profile photo.</li>
        <li>Which Experts Group business you belong to, and the area you cover.</li>
        <li>Your package, subscription status and billing history.</li>
        <li>
          Notes our team records about your account, and your onboarding
          progress.
        </li>
      </ul>
      <p>
        Some of this is taken from your Microsoft 365 account when you connect
        it, so you do not have to type it twice.
      </p>

      <h2>4. Data we hold about leads</h2>
      <ul>
        <li>Name, phone number and email address.</li>
        <li>What they enquired about, and which advert they came from.</li>
        <li>
          Where relevant, their property address and postcode, which we convert
          into map coordinates so leads can be matched to the nearest agent.
        </li>
        <li>
          The history of your contact with them, including attempts logged,
          appointments booked and notes added.
        </li>
      </ul>

      <h2>5. Where data comes from and where it goes</h2>
      <h3>Advertising platforms</h3>
      <p>
        When someone completes a lead form on Meta (Facebook or Instagram),
        Meta passes their details to us so the lead can appear in your
        dashboard.
      </p>
      <h3>Your Microsoft 365 mailbox</h3>
      <p>
        If you connect your work email, you grant permission for the portal to{" "}
        <strong>send</strong> email as you, so lead emails come from your own
        address. The portal cannot read your inbox.
      </p>
      <h3>Your CRM</h3>
      <p>
        When you push a lead to your CRM (such as Rex or Atlas), their details
        are sent to that system, which is then governed by its own terms and
        privacy policy.
      </p>
      <h3>Mapping</h3>
      <p>
        We use Google Maps to turn an address into a postcode and coordinates,
        for matching leads to the closest agent.
      </p>
      <h3>Payments</h3>
      <p>
        Card payments are handled by Stripe. Card details are entered on
        Stripe&rsquo;s own secure pages — we never see or store them. We keep
        only a customer reference, your subscription status and your invoice
        history.
      </p>

      <h2>6. Why we are allowed to hold it</h2>
      <p>
        We rely on the performance of our contract with you to run your account
        and take payment, and on legitimate interests to operate, secure and
        improve the service. Leads provide their details to receive contact
        about the enquiry they made.
      </p>
      <div className="review">
        Needs a decision: the lawful basis for contacting leads as part of
        nurture, and how consent and the right to object are captured and
        honoured — particularly for follow-up messages after the initial
        enquiry.
      </div>

      <h2>7. How long we keep it</h2>
      <p>
        We keep your account data for as long as you have an account. Lead data
        stays in the portal so you can see the history of your funnel.
      </p>
      <div className="review">
        Needs a decision: actual retention periods, for both closed accounts and
        lead records. The system does not currently delete anything
        automatically, so whatever is agreed will need building.
      </div>

      <h2>8. Where it is stored</h2>
      <p>
        Portal data is held in a hosted PostgreSQL database. Some of the
        services we rely on — including Stripe, Meta, Microsoft and Google —
        may process data outside the UK under their own safeguards.
      </p>
      <div className="review">
        Needs confirming: the hosting region of the Railway database, so this
        can state plainly whether data is held in the UK, the EU or elsewhere.
      </div>

      <h2>9. Cookies</h2>
      <p>
        The portal sets a session cookie so you stay signed in. It is necessary
        for the service to work. We do not use advertising or tracking cookies
        in the portal.
      </p>

      <h2>10. Your rights</h2>
      <p>
        You can ask for a copy of your personal data, ask us to correct it, ask
        us to delete it, or object to how we use it. Leads have the same rights.
        You can also complain to the Information Commissioner&rsquo;s Office at
        ico.org.uk.
      </p>
      <div className="review">
        Needs a decision: the email address these requests should go to, and who
        is responsible for answering them within the statutory month.
      </div>
    </LegalPage>
  );
}
